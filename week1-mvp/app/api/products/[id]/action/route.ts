import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  addProductRender,
  getProductById,
  getShopifyCredential,
  listProductImages,
  listProductRenders,
  parseProductAttrs,
  parseSourceData,
  updateProduct,
} from "@/lib/products-db";

export const runtime = "nodejs";

const DEFAULT_SHOPIFY_API_VERSION = "2026-04";
const CLIENT_CREDENTIAL_PREFIX = "client_credentials:";

type Params = { params: Promise<{ id: string }> };

type ProductAction =
  | "optimize"
  | "submit_review"
  | "start_render"
  | "return_draft"
  | "return_review"
  | "approve_style"
  | "approve_renders"
  | "upload_shopify"
  | "mark_failed";

export async function POST(req: NextRequest, { params }: Params) {
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
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: ProductAction;
      note?: string;
      color_style?: Record<string, unknown>;
      title?: string;
      source_color_name?: string;
      description?: string;
      seo_title?: string;
      seo_description?: string;
      landing_page?: Record<string, unknown>;
    };
    const action = body.action;

    if (action === "optimize") {
      const source = parseSourceData(product);
      const attrs = parseProductAttrs(product);
      const optimized = buildHomeTextileCopy(product, source, attrs);
      updateProduct(product.id, {
        ...optimized,
        failure_reason: null,
        failure_stage: null,
      });
      return ok(product.id, { message: "文案已优化，请确认后提交待审核" });
    }

    if (action === "submit_review") {
      const attrs = parseProductAttrs(product);
      const title = cleanText(body.title) || product.title?.trim() || "";
      const description =
        cleanText(body.description) || product.description?.trim() || "";
      const seoTitle = cleanText(body.seo_title) || product.seo_title || null;
      const seoDescription =
        cleanText(body.seo_description) || product.seo_description || null;
      if (!title) {
        return NextResponse.json(
          { error: "请先填写产品标题，再提交待审核" },
          { status: 400 },
        );
      }
      updateProduct(product.id, {
        status: "optimized",
        title,
        description: description || null,
        seo_title: seoTitle,
        seo_description: seoDescription,
        source_color_name:
          cleanText(body.source_color_name) || product.source_color_name,
        attrs: {
          ...attrs,
          landing_page:
            typeof body.landing_page === "object" && body.landing_page
              ? {
                  ...(typeof attrs.landing_page === "object" &&
                  attrs.landing_page
                    ? (attrs.landing_page as Record<string, unknown>)
                    : {}),
                  ...body.landing_page,
                  updated_at: new Date().toISOString(),
                }
              : attrs.landing_page,
          product_review: {
            status: "pending",
            submitted_at: new Date().toISOString(),
            submitted_by: user.username,
          },
        },
        failure_reason: null,
        failure_stage: null,
      });
      return ok(product.id, { message: "已提交待审核" });
    }

    if (action === "start_render") {
      if (product.status !== "optimized") {
        return NextResponse.json(
          { error: "只有待审核通过后，才能进入套图审核" },
          { status: 400 },
        );
      }
      const images = listProductImages(product.id);
      if (images.length === 0) {
        updateProduct(product.id, {
          status: "failed",
          failure_stage: "render",
          failure_reason: "没有可用于套图生成的产品图",
        });
        return NextResponse.json(
          { error: "没有可用于套图生成的产品图" },
          { status: 400 },
        );
      }

      const existing = listProductRenders(product.id);
      if (existing.length === 0) {
        const primary = images.find((img) => img.is_primary) || images[0];
        if (primary.local_path) {
          addProductRender({
            productId: product.id,
            shotType: "recolor",
            sortOrder: 0,
            imagePath: primary.local_path,
          });
        }
        images.slice(0, 8).forEach((img, index) => {
          if (!img.local_path) return;
          addProductRender({
            productId: product.id,
            shotType: index % 3 === 2 ? "detail" : "scene",
            sortOrder: index + 1,
            imagePath: img.local_path,
          });
        });
      }

      updateProduct(product.id, {
        status: "reviewing",
        attrs: {
          ...parseProductAttrs(product),
          product_review: {
            status: "approved",
            note: body.note || "产品信息审核通过，进入套图审核",
            approved_at: new Date().toISOString(),
            approved_by: user.username,
          },
          render_plan: {
            status: "ready_for_review",
            source: "product-backoffice",
            note:
              "已进入套图审核。后续可接入现有 batch-photo / scene-tools 真实出图任务。",
            updated_at: new Date().toISOString(),
          },
        },
        failure_reason: null,
        failure_stage: null,
      });
      return ok(product.id, { message: "已进入套图审核" });
    }

    if (action === "return_draft") {
      if (product.status !== "optimized" && product.status !== "failed") {
        return NextResponse.json(
          { error: "只有待审核或失败状态可以退回草稿" },
          { status: 400 },
        );
      }
      updateProduct(product.id, {
        status: "draft",
        attrs: {
          ...parseProductAttrs(product),
          product_review: {
            status: "returned",
            note: body.note || "退回草稿继续编辑",
            returned_at: new Date().toISOString(),
            returned_by: user.username,
          },
        },
      });
      return ok(product.id, { message: "已退回草稿" });
    }

    if (action === "return_review") {
      if (product.status !== "reviewing" && product.status !== "failed") {
        return NextResponse.json(
          { error: "只有套图审核或失败状态可以退回待审核" },
          { status: 400 },
        );
      }
      updateProduct(product.id, {
        status: "optimized",
        attrs: {
          ...parseProductAttrs(product),
          render_review: {
            status: "returned",
            note: body.note || "套图退回待审核",
            returned_at: new Date().toISOString(),
            returned_by: user.username,
          },
        },
      });
      return ok(product.id, { message: "已退回待审核" });
    }

    if (action === "approve_style") {
      if (product.status !== "reviewing") {
        return NextResponse.json(
          { error: "只有套图审核阶段可以通过色彩风格审核" },
          { status: 400 },
        );
      }
      const attrs = parseProductAttrs(product);
      updateProduct(product.id, {
        attrs: {
          ...attrs,
          color_style_audit: {
            status: "approved",
            palette:
              body.color_style?.palette ||
              "以产品主色、浅色床品背景和低饱和生活方式场景保持一致",
            background:
              body.color_style?.background ||
              "卧室/客厅/酒店场景背景色保持干净、柔和、低干扰",
            note: body.note || "整体落地页色彩背景一致性通过",
            approved_at: new Date().toISOString(),
            approved_by: user.username,
          },
        },
      });
      return ok(product.id, { message: "色彩风格审核已通过" });
    }

    if (action === "approve_renders") {
      const attrs = parseProductAttrs(product);
      if (product.status !== "reviewing") {
        return NextResponse.json(
          { error: "只有套图审核阶段可以通过套图审核" },
          { status: 400 },
        );
      }
      const colorAudit =
        typeof attrs.color_style_audit === "object" &&
        attrs.color_style_audit !== null
          ? (attrs.color_style_audit as Record<string, unknown>)
          : null;
      if (colorAudit?.status !== "approved") {
        return NextResponse.json(
          { error: "请先通过色彩风格审核，再通过套图审核" },
          { status: 400 },
        );
      }
      updateProduct(product.id, {
        status: "uploading",
        attrs: {
          ...attrs,
          render_review: {
            status: "approved",
            note: body.note || "套图审核通过，准备上传 Shopify",
            approved_at: new Date().toISOString(),
            approved_by: user.username,
          },
        },
      });
      return ok(product.id, { message: "套图已审核，进入准备上架" });
    }

    if (action === "upload_shopify") {
      const canRetryUpload =
        product.status === "failed" && product.failure_stage === "upload";
      if (product.status !== "uploading" && !canRetryUpload) {
        return NextResponse.json(
          { error: "只有准备上架阶段可以一键上传 Shopify" },
          { status: 400 },
        );
      }
      const uploadResult = await uploadProductToShopify(user.id, product.id);
      if (!uploadResult.ok) {
        updateProduct(product.id, {
          status: "failed",
          failure_stage: "upload",
          failure_reason: uploadResult.error,
        });
        return NextResponse.json(
          { error: uploadResult.error, product: getProductById(product.id) },
          { status: 400 },
        );
      }
      updateProduct(product.id, {
        status: "uploaded",
        shopify_product_id: uploadResult.shopifyProductId,
        shopify_uploaded_at: Math.floor(Date.now() / 1000),
        failure_reason: null,
        failure_stage: null,
      });
      return ok(product.id, {
        message: "Shopify 已确认上架",
        shopify_product_id: uploadResult.shopifyProductId,
        shopify_admin_url: uploadResult.adminUrl,
      });
    }

    if (action === "mark_failed") {
      updateProduct(product.id, {
        status: "failed",
        failure_stage: "upload",
        failure_reason: body.note || "人工标记失败",
      });
      return ok(product.id, { message: "已标记失败" });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function ok(productId: number, extra: Record<string, unknown>) {
  const product = getProductById(productId);
  return NextResponse.json({
    ...extra,
    product,
    attrs: product ? parseProductAttrs(product) : {},
  });
}

function buildHomeTextileCopy(
  product: NonNullable<ReturnType<typeof getProductById>>,
  source: Record<string, unknown>,
  attrs: Record<string, unknown>,
) {
  const title = product.title || text(source.title) || "Home Textile Product";
  const color = product.source_color_name || text(source.color);
  const sizes = Array.isArray(source.sizes) ? source.sizes.map(String) : [];
  const price = text(source.price);
  const productType = text(source.product_type) || "家居软品";
  const cleanTitle = title
    .replace(/\b(dress|gown|bridal|wedding|fashion)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const bullets = [
    `${cleanTitle}，适合卧室、客厅、酒店和夏日凉感场景的电商套图。`,
    color ? `竞品色名：${color}。` : "",
    sizes.length > 0 ? `可参考尺寸/变体：${sizes.join(" / ")}。` : "",
    price ? `竞品价格参考：${price}。` : "",
    "文案重点围绕面料触感、蓬松度、亲肤性、清洁感、季节使用场景和详情页卖点展开。",
  ].filter(Boolean);

  return {
    title: cleanTitle,
    description: bullets.join("\n"),
    seo_title: `${cleanTitle} | 家居软品电商套图`,
    seo_description: `${cleanTitle}，面向${productType}的主图、场景图、细节图和落地页文案。`,
    attrs: {
      ...attrs,
      landing_page: {
        price_reference: price || null,
        variants: sizes,
        product_type: productType,
        sections: ["首屏卖点", "材质触感", "场景展示", "尺寸/变体", "细节工艺", "FAQ"],
        updated_at: new Date().toISOString(),
      },
    },
  };
}

async function uploadProductToShopify(userId: number, productId: number) {
  const product = getProductById(productId);
  if (!product) return { ok: false as const, error: "产品不存在" };
  const credential = getShopifyCredential(userId);
  if (!credential) {
    return {
      ok: false as const,
      error:
        "尚未配置 Shopify 店铺域名和上传凭证。请在设置里填 Admin API token，或填 Client ID + shpss_ Client Secret",
    };
  }

  const attrs = parseProductAttrs(product);
  const source = parseSourceData(product);
  const images = listProductImages(product.id);
  const payload = {
    product: {
      title: product.title || "Untitled home textile product",
      body_html: htmlEscape(product.description || "").replace(/\n/g, "<br>"),
      vendor: text(source.vendor) || "Home Textile AI",
      product_type: text(source.product_type) || "Home Textile",
      status: "active",
      tags: ["home textile", "ai-generated", "zqyaitools"].join(", "),
      variants: buildShopifyVariants(source, product.source_color_name),
      images: images
        .map((img) => img.image_url)
        .filter((src) => /^https?:\/\//i.test(src))
        .slice(0, 10)
        .map((src) => ({ src })),
      metafields: [
        {
          namespace: "aiimage",
          key: "landing_page_plan",
          type: "json",
          value: JSON.stringify(attrs.landing_page || {}),
        },
      ],
    },
  };

  const shop = credential.shop_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const apiVersion = credential.api_version || DEFAULT_SHOPIFY_API_VERSION;
  const tokenResult = await resolveShopifyAccessToken(shop, credential.access_token);
  if (!tokenResult.ok) return tokenResult;

  const res = await shopifyFetchWithRetry(
    `https://${shop}/admin/api/${apiVersion}/products.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": tokenResult.accessToken,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    product?: { id?: number | string; handle?: string };
    errors?: unknown;
  };
  if (!res.ok || !data.product?.id) {
    const detail = JSON.stringify(data.errors || data).slice(0, 300);
    const hint =
      res.status === 401
        ? "。请检查店铺域名必须是 xxx.myshopify.com，且凭证必须来自同一个 Shopify App/店铺"
        : "";
    return {
      ok: false as const,
      error: `Shopify 上传失败：${res.status} ${detail}${hint}`,
    };
  }

  const shopifyProductId = String(data.product.id);
  return {
    ok: true as const,
    shopifyProductId,
    adminUrl: `https://${shop}/admin/products/${shopifyProductId}`,
  };
}

async function resolveShopifyAccessToken(
  shop: string,
  storedCredential: string,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const clientCredential = parseClientCredential(storedCredential);
  if (!clientCredential) return { ok: true, accessToken: storedCredential };

  const res = await shopifyFetchWithRetry(
    `https://${shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientCredential.clientId,
        client_secret: clientCredential.clientSecret,
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: unknown;
    error?: unknown;
    error_description?: unknown;
    errors?: unknown;
  };
  if (!res.ok || typeof data.access_token !== "string") {
    const detail = JSON.stringify(
      data.error_description || data.error || data.errors || data,
    ).slice(0, 300);
    return {
      ok: false,
      error: `Shopify 新版 App 换取 access token 失败：${res.status} ${detail}。请确认 Client ID、shpss_ Client Secret 和店铺域名属于同一个 App/店铺。`,
    };
  }
  return { ok: true, accessToken: data.access_token };
}

async function shopifyFetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, init);
      if (res.status !== 429 && res.status < 500) return res;
      if (i === attempts - 1) return res;
    } catch (e) {
      lastError = e;
      if (i === attempts - 1) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function parseClientCredential(
  value: string,
): { clientId: string; clientSecret: string } | null {
  if (!value.startsWith(CLIENT_CREDENTIAL_PREFIX)) return null;
  try {
    const raw = value.slice(CLIENT_CREDENTIAL_PREFIX.length);
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      clientId?: unknown;
      clientSecret?: unknown;
    };
    if (
      typeof parsed.clientId !== "string" ||
      typeof parsed.clientSecret !== "string"
    ) {
      return null;
    }
    return {
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
    };
  } catch {
    return null;
  }
}

function buildShopifyVariants(source: Record<string, unknown>, color: string | null) {
  const sizes = Array.isArray(source.sizes)
    ? source.sizes.map(String).filter(Boolean)
    : [];
  const price = text(source.price) || "0.00";
  const options = sizes.length > 0 ? sizes : ["Default"];
  return options.slice(0, 20).map((size) => ({
    option1: color || "Default",
    option2: size,
    price,
  }));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
