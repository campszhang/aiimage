import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR_PATH, getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { generateImage, estimateImageCostUSD } from "@/lib/image-gen";
import { resolveModelId } from "@/lib/ai-models";
import { recordUsage } from "@/lib/usage";
import { assertWithinBudget, getUserBudgetStatus } from "@/lib/pricing";
import { createJob } from "@/lib/jobs-db";
import { startJobWorker, type HandlerContext } from "@/lib/job-runner";
import { retryWithBackoff } from "@/lib/retry";
import { buildReplicatePrompt, getMoodPreset, type MoodKey, type ReplicateRefInfo } from "@/lib/replicate-prompt";
import { type FocusMode } from "@/lib/scene-tools-prompt";
import { formatMaterialDetails, getMaterialsByIds } from "@/lib/materials";
import { saveGeneratedOutput } from "@/lib/cloud-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_RATIOS = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"];

/**
 * POST /api/replicate
 *
 * 仿图：参考图 + N 张产品图 → base 复刻 + 变体。
 * 总输出 = base_count + variant_count（每张都用 参考图 + 全部产品图）。
 *
 * formData:
 *   - reference: File（参考图）
 *   - product_image_<i>: File（i=0..N-1，N 张产品图，对应参考图 N 个人物槽位）
 *   - ref_info: JSON（/api/replicate/analyze 的结果）
 *   - base_count: number（严格复刻张数，默认 1）
 *   - variant_count: number（变体张数，默认 2）
 *   - focus_mode: 变体扰动镜头库（默认 model_first）
 *   - material_ids: JSON number[]（可选）
 *   - aspect_ratio / image_size / model / user_hint
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    assertWithinBudget(user.id, user.role);
    const db = getDb();
    const formData = await req.formData();

    // 参考图
    const refFile = formData.get("reference");
    if (!(refFile instanceof File)) {
      return NextResponse.json({ error: "请上传参考图" }, { status: 400 });
    }
    if (refFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "参考图太大（限 20MB）" }, { status: 400 });
    }

    // 产品图（按 idx）
    const productFiles: File[] = [];
    for (const [key, value] of formData.entries()) {
      const m = key.match(/^product_image_?(\d+)$/);
      if (m && value instanceof File) productFiles[Number(m[1])] = value;
    }
    const products = productFiles.filter((f) => f instanceof File);
    if (products.length === 0) {
      return NextResponse.json({ error: "请上传至少一张产品图" }, { status: 400 });
    }
    if (products.length > 6) {
      return NextResponse.json({ error: "产品图最多 6 张（最多 6 人合影）" }, { status: 400 });
    }
    for (const f of products) {
      if (f.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: `产品图 ${f.name} 太大（限 20MB）` }, { status: 400 });
      }
    }

    // 参考图分析
    let refInfo: ReplicateRefInfo;
    try {
      const raw = String(formData.get("ref_info") || "{}");
      const parsed = JSON.parse(raw);
      refInfo = {
        person_count: Number(parsed.person_count) || products.length,
        persons: Array.isArray(parsed.persons) ? parsed.persons : [],
        scene: String(parsed.scene || "参考图所示场景"),
        lighting: String(parsed.lighting || "参考图所示光线"),
        composition: String(parsed.composition || "参考图所示构图"),
        overall: String(parsed.overall || ""),
      };
    } catch {
      refInfo = {
        person_count: products.length,
        persons: [],
        scene: "参考图所示场景",
        lighting: "参考图所示光线",
        composition: "参考图所示构图",
        overall: "",
      };
    }

    // 张数
    const baseCount = Math.max(0, Math.min(5, Number(formData.get("base_count") ?? 1) || 0));
    const variantCount = Math.max(0, Math.min(8, Number(formData.get("variant_count") ?? 2) || 0));
    if (baseCount + variantCount === 0) {
      return NextResponse.json({ error: "至少要出 1 张（复刻或变体）" }, { status: 400 });
    }

    // focus_mode（变体镜头库）
    const fmRaw = formData.get("focus_mode");
    const focusMode: FocusMode =
      fmRaw === "balanced" || fmRaw === "environmental" ? (fmRaw as FocusMode) : "model_first";

    // mood（氛围/表情/互动；单选，校验合法 key，非法回落 none）
    const moodRaw = formData.get("mood");
    const mood: MoodKey =
      typeof moodRaw === "string" && getMoodPreset(moodRaw)
        ? (moodRaw as MoodKey)
        : "none";

    // 比例 / 画质 / 模型 / hint
    const arRaw = formData.get("aspect_ratio");
    const aspectRatio = typeof arRaw === "string" && ALLOWED_RATIOS.includes(arRaw) ? arRaw : "3:4";
    const qRaw = formData.get("image_size");
    const imageSize: "1K" | "2K" | "4K" = qRaw === "1K" || qRaw === "2K" || qRaw === "4K" ? qRaw : "2K";
    const modelRaw = formData.get("model");
    const model = resolveModelId("image_gen", typeof modelRaw === "string" ? modelRaw : undefined);
    const hintRaw = formData.get("user_hint");
    let userHint: string | undefined;
    if (typeof hintRaw === "string" && hintRaw.trim()) {
      if (hintRaw.trim().length > 200) {
        return NextResponse.json({ error: "user_hint 太长（限 200 字）" }, { status: 400 });
      }
      userHint = hintRaw.trim();
    }

    // material_ids
    let materialIds: number[] = [];
    const midRaw = formData.get("material_ids");
    if (typeof midRaw === "string" && midRaw.trim()) {
      try {
        const arr = JSON.parse(midRaw);
        if (Array.isArray(arr)) materialIds = arr.map(Number).filter((x) => Number.isFinite(x) && x > 0).slice(0, 20);
      } catch {}
    }
    const materials = materialIds.length ? getMaterialsByIds(materialIds) : [];
    const materialDetailsText = materials.length ? formatMaterialDetails(materials) : undefined;

    // 构造 items：baseCount 个 base + variantCount 个 variant
    type ItemMeta = {
      kind: "base" | "variant";
      variant_idx: number;
      variant_total: number;
      label: string;
    };
    const items: ItemMeta[] = [];
    for (let i = 1; i <= baseCount; i++) {
      items.push({ kind: "base", variant_idx: i, variant_total: baseCount, label: baseCount > 1 ? `复刻 ${i}/${baseCount}` : `复刻` });
    }
    for (let i = 1; i <= variantCount; i++) {
      items.push({ kind: "variant", variant_idx: i, variant_total: variantCount, label: `变体 ${i}/${variantCount}` });
    }

    const job = createJob({
      user_id: user.id,
      feature: "replicate",
      model,
      items: items.map((it) => ({ label: it.label })),
      params: {
        aspect_ratio: aspectRatio,
        image_size: imageSize,
        focus_mode: focusMode,
        mood,
        user_hint: userHint || null,
        product_count: products.length,
        ref_info: refInfo,
        material_details_text: materialDetailsText || null,
        items,
      },
    });

    // 落盘参考图 + 产品图
    const inputsDir = path.join(DATA_DIR_PATH, "job-inputs", job.id);
    await fs.mkdir(inputsDir, { recursive: true });
    function extOf(f: File) {
      return f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
    }
    const refPath = path.join(inputsDir, `reference.${extOf(refFile)}`);
    await fs.writeFile(refPath, Buffer.from(await refFile.arrayBuffer()));
    const productPaths: string[] = [];
    const productMimes: string[] = [];
    for (let i = 0; i < products.length; i++) {
      const f = products[i];
      const abs = path.join(inputsDir, `product_${i}.${extOf(f)}`);
      await fs.writeFile(abs, Buffer.from(await f.arrayBuffer()));
      productPaths.push(abs);
      productMimes.push(f.type || "image/jpeg");
    }
    const existing = (() => { try { return JSON.parse(job.params || "{}"); } catch { return {}; } })();
    db.prepare(`UPDATE render_jobs SET params = ? WHERE id = ?`).run(
      JSON.stringify({
        ...existing,
        reference_path: refPath,
        reference_mime: refFile.type || "image/jpeg",
        product_paths: productPaths,
        product_mime_types: productMimes,
      }),
      job.id,
    );

    const outputsDir = path.join(DATA_DIR_PATH, "outputs");
    await fs.mkdir(outputsDir, { recursive: true });

    startJobWorker(
      job.id,
      async (ctx: HandlerContext) => replicateItemHandler(ctx, outputsDir),
      {
        onJobEnd: async () => {
          try { await fs.rm(inputsDir, { recursive: true, force: true }); } catch {}
        },
      },
    );

    return NextResponse.json({
      job_id: job.id,
      total_count: job.total_count,
      product_count: products.length,
      base_count: baseCount,
      variant_count: variantCount,
      model,
    });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/replicate] 失败:", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}

/* ─────────── worker：单 item ─────────── */
async function replicateItemHandler(
  ctx: HandlerContext,
  outputsDir: string,
): Promise<{
  result_image_path: string;
  result_image_url: string;
  input_tokens: number | undefined;
  output_tokens: number | undefined;
}> {
  const p = ctx.params as {
    aspect_ratio?: string;
    image_size?: "1K" | "2K" | "4K";
    focus_mode?: FocusMode;
    mood?: MoodKey;
    user_hint?: string | null;
    product_count: number;
    ref_info: ReplicateRefInfo;
    material_details_text?: string | null;
    items: Array<{ kind: "base" | "variant"; variant_idx: number; variant_total: number; label: string }>;
    reference_path: string;
    reference_mime: string;
    product_paths: string[];
    product_mime_types: string[];
  };

  const itemMeta = p.items[ctx.item.idx];
  if (!itemMeta) throw new Error(`item[${ctx.item.idx}] 丢失`);

  const status = getUserBudgetStatus(ctx.userId);
  if (!status.is_unlimited && status.remaining_cny <= 0) {
    throw new Error(`本月预算已用完（¥${status.used_this_month_cny.toFixed(2)}），剩余任务已跳过`);
  }

  // inputs：IMAGE 1 参考 + IMAGE 2.. 产品
  const refBuf = await fs.readFile(p.reference_path);
  const inputs: Array<{ buffer: Buffer; mimeType: string }> = [
    { buffer: refBuf, mimeType: p.reference_mime || "image/jpeg" },
  ];
  for (let i = 0; i < p.product_paths.length; i++) {
    const buf = await fs.readFile(p.product_paths[i]);
    inputs.push({ buffer: buf, mimeType: p.product_mime_types[i] || "image/jpeg" });
  }

  const prompt = buildReplicatePrompt({
    ref: p.ref_info,
    productCount: p.product_count,
    kind: itemMeta.kind,
    variantIdx: itemMeta.variant_idx,
    variantTotal: itemMeta.variant_total,
    variantSeed: `${ctx.job.id}:${ctx.item.idx}`,
    focusMode: p.focus_mode ?? "model_first",
    materialDetailsText: p.material_details_text || undefined,
    mood: p.mood ?? "none",
    userHint: p.user_hint || undefined,
  });

  const gen = await retryWithBackoff(
    () =>
      generateImage({
        inputs,
        prompt,
        modelId: ctx.job.model,
        aspectRatio: p.aspect_ratio,
        imageSize: p.image_size || "2K",
        temperature: itemMeta.kind === "variant" ? 0.6 : 0.35,
      }),
    {
      onRetry: (e, attempt, delay) => {
        console.warn(
          `[replicate retry] job=${ctx.job.id} item=${ctx.item.idx} attempt=${attempt} delay=${Math.round(delay)}ms: ${
            e instanceof Error ? e.message.slice(0, 100) : String(e)
          }`,
        );
      },
    },
  );

  const ext = gen.mimeType.includes("png") ? "png" : "jpg";
  const filename = `replicate_${ctx.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const stored = await saveGeneratedOutput({
    buffer: gen.data,
    filename,
    mimeType: gen.mimeType,
    kind: "replicate",
  });

  const costOverrideUsd =
    gen.provider === "openai"
      ? estimateImageCostUSD({ modelId: ctx.job.model, aspectRatio: p.aspect_ratio, imageSize: p.image_size || "2K" })
      : undefined;

  recordUsage({
    userId: ctx.userId,
    model: ctx.job.model,
    feature: "other",
    usageMetadata: {
      promptTokenCount: gen.usage?.inputTokens,
      candidatesTokenCount: gen.usage?.outputTokens,
      totalTokenCount: gen.usage?.totalTokens,
    },
    success: true,
    costOverrideUsd,
    notes: {
      job_id: ctx.job.id,
      kind: "replicate",
      item_kind: itemMeta.kind,
      provider: gen.provider,
      product_count: p.product_count,
      aspect_ratio: p.aspect_ratio,
      image_size: p.image_size,
    },
  });

  return {
    result_image_path: stored.relPath,
    result_image_url: stored.url,
    input_tokens: gen.usage?.inputTokens ?? undefined,
    output_tokens: gen.usage?.outputTokens ?? undefined,
  };
}
