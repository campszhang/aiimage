import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getProductById,
  listProductImages,
  listProductRenders,
  parseProductAttrs,
  parseSourceData,
  updateProduct,
  type ProductStatus,
} from "@/lib/products-db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const id = Number((await params).id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "产品 ID 不合法" }, { status: 400 });
    }

    const product = getProductById(id);
    if (!product) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
    }
    if (user.role !== "admin" && product.user_id !== user.id) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const source = parseSourceData(product);
    const attrs = parseProductAttrs(product);
    const images = listProductImages(product.id).map((img) => ({
      ...img,
      asset_url: img.local_path ? `/assets/${img.local_path}` : img.image_url,
    }));
    const renders = listProductRenders(product.id).map((render) => ({
      ...render,
      asset_url: render.image_path ? `/assets/${render.image_path}` : null,
    }));

    return NextResponse.json({ product, source, attrs, images, renders });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const id = Number((await params).id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "产品 ID 不合法" }, { status: 400 });
    }

    const product = getProductById(id);
    if (!product) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
    }
    if (user.role !== "admin" && product.user_id !== user.id) {
      return NextResponse.json({ error: "无权编辑" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const currentAttrs = parseProductAttrs(product);
    const nextAttrs =
      typeof body.attrs === "object" && body.attrs
        ? { ...currentAttrs, ...(body.attrs as Record<string, unknown>) }
        : currentAttrs;

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
      typeof body.status === "string" &&
      validStatus.includes(body.status as ProductStatus)
        ? (body.status as ProductStatus)
        : undefined;

    const patch = compactPatch({
      ...(status ? { status } : {}),
      title: readNullableText(body.title, 180),
      description: readNullableText(body.description, 12000),
      seo_title: readNullableText(body.seo_title, 180),
      seo_description: readNullableText(body.seo_description, 500),
      source_color_name: readNullableText(body.source_color_name, 80),
      attrs: nextAttrs,
    });
    updateProduct(product.id, patch);

    const updated = getProductById(product.id);
    return NextResponse.json({
      product: updated,
      attrs: updated ? parseProductAttrs(updated) : nextAttrs,
    });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}

function readNullableText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function compactPatch<T extends Record<string, unknown>>(patch: T): T {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as T;
}
