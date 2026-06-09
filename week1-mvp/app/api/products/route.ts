import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  countProductsByStatus,
  listProducts,
  type ProductStatus,
} from "@/lib/products-db";

export const runtime = "nodejs";

/**
 * GET /api/products
 *
 * 查询参数：
 *   ?status=draft|optimizing|optimized|rendering|reviewing|uploading|uploaded|failed|all
 *   ?search=<标题/URL 模糊>
 *   ?archived=1                  (默认 0)
 *   ?limit=50&offset=0
 *   ?all_users=1                 (仅 admin：列出所有用户的；非 admin 忽略)
 *
 * 返回：{ rows: ProductRow[], total: number, counts: Record<status, number> }
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const statusParam = sp.get("status") || "all";
    const validStatus: ProductStatus[] = [
      "draft",
      "optimizing",
      "optimized",
      "rendering",
      "reviewing",
      "uploading",
      "uploaded",
      "failed",
    ];
    const status =
      statusParam === "all"
        ? ("all" as const)
        : (validStatus.includes(statusParam as ProductStatus)
            ? (statusParam as ProductStatus)
            : "all");

    const allUsers = sp.get("all_users") === "1" && user.role === "admin";

    const result = listProducts({
      userId: allUsers ? undefined : user.id,
      status,
      archived: sp.get("archived") === "1",
      search: sp.get("search") || undefined,
      limit: Math.min(200, Math.max(1, Number(sp.get("limit")) || 50)),
      offset: Math.max(0, Number(sp.get("offset")) || 0),
    });
    const counts = countProductsByStatus({
      userId: allUsers ? undefined : user.id,
      archived: sp.get("archived") === "1",
      search: sp.get("search") || undefined,
    });

    return NextResponse.json({ ...result, counts });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}
