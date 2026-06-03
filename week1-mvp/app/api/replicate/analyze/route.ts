import { NextRequest, NextResponse } from "next/server";
import { analyzeReference } from "@/lib/gemini";
import { resolveModelId } from "@/lib/ai-models";
import { requireUser } from "@/lib/auth";
import { recordUsage } from "@/lib/usage";
import { assertWithinBudget } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/replicate/analyze
 *
 * 仿图第一步：上传参考图 → Gemini Vision 分析
 * 返回 { person_count, persons[], scene, lighting, composition, overall }
 * 前端据此提示"检测到 N 人，上传 N 张产品图"。
 *
 * formData:
 *   - reference: File（参考图，1 张）
 *   - model?: string（vision 模型）
 */
export async function POST(req: NextRequest) {
  let user: { id: number; role: string } | null = null;
  let model = "unknown";
  try {
    user = await requireUser();
    assertWithinBudget(user.id, user.role);
    const formData = await req.formData();

    const ref = formData.get("reference");
    if (!(ref instanceof File)) {
      return NextResponse.json({ error: "请上传参考图" }, { status: 400 });
    }
    if (ref.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "参考图太大（限 20MB）" },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await ref.arrayBuffer());

    const modelRaw = formData.get("model");
    model = resolveModelId(
      "vision",
      typeof modelRaw === "string" ? modelRaw : undefined,
    );

    const result = await analyzeReference(
      { buffer, mimeType: ref.type || "image/jpeg" },
      model,
    );

    const meta = result._meta;
    recordUsage({
      userId: user.id,
      model,
      feature: "analyze",
      usageMetadata: meta?.usageMetadata as never,
      success: true,
      notes: { kind: "replicate_reference", person_count: result.person_count },
    });

    return NextResponse.json({ ...result, _model: model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = (e as { status?: number }).status || 500;
    console.error("[/api/replicate/analyze] 失败:", msg);
    if (user && status !== 429) {
      recordUsage({
        userId: user.id,
        model,
        feature: "analyze",
        success: false,
        error: msg,
      });
    }
    return NextResponse.json(
      { error: status === 429 ? msg : `参考图分析失败：${msg}` },
      { status },
    );
  }
}
