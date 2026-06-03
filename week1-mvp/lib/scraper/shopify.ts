/**
 * Shopify 同行独立站爬取
 *
 * 思路：
 *   Shopify 标准开放接口 GET /products/{handle}.json 返回完整 product JSON
 *   （title / description_html / vendor / product_type / tags / variants /
 *    options / images），不需要 cookie、不需要 JS 渲染、不需要代理。
 *
 *   这覆盖 60-70% 的同行独立站。少数定制店关掉了 .json endpoint，
 *   后期 M7 fallback 用 Puppeteer 抓 HTML。
 *
 * 用法：
 *   const r = await scrapeShopify("https://shopwhitefox.com/products/lover-girl-dress");
 *   r.title       // "Lover Girl Dress"
 *   r.description // "纯文本，去 HTML"
 *   r.images      // ["https://cdn.shopify.com/...", ...]
 *   r.attrs       // { vendor: "...", product_type: "...", tags: [...] }
 *   r.color       // 推断的色名（从 options/title/variant 抠）
 */

export type ShopifyScrapeResult = {
  source_platform: "shopify";
  handle: string;
  title: string;
  description: string;
  description_html: string;
  vendor: string | null;
  product_type: string | null;
  tags: string[];
  /** 全部图片 URL，按 Shopify 返回顺序，主图通常在前 */
  images: string[];
  /** 推断的色名（找 Color option 或从 variant.option1/2/3 抠） */
  color: string | null;
  /** 推断的尺码列表 */
  sizes: string[];
  /** 原始价（取 default variant） */
  price: string | null;
  /** 货币 */
  currency: string | null;
  /** 原始 JSON（截短）— 留给 LLM 优化时做完整参考 */
  raw: Record<string, unknown>;
};

/**
 * 主入口。失败抛错，调用方负责 try/catch + 写 scrape_jobs.error_message
 *
 * @param productUrl 完整产品页 URL，例：
 *   https://shopwhitefox.com/products/lover-girl-dress
 *   https://shopwhitefox.com/products/lover-girl-dress?variant=123456
 */
export async function scrapeShopify(
  productUrl: string,
): Promise<ShopifyScrapeResult> {
  const { origin, handle } = parseProductUrl(productUrl);
  const jsonUrl = `${origin}/products/${handle}.json`;

  // 加 UA 让一些 Cloudflare 防护放行
  const res = await fetch(jsonUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
    // 5 秒连接 + 15 秒响应 — 由 AbortSignal 控制
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(
      `Shopify .json 接口返回 ${res.status}（${jsonUrl}）。可能不是 Shopify 站或店家关掉了 JSON。后期 M7 会加 HTML fallback。`,
    );
  }

  const json = (await res.json()) as { product?: unknown };
  const product = json.product as Record<string, unknown> | undefined;
  if (!product || typeof product !== "object") {
    throw new Error(`返回的 JSON 缺 product 字段：${JSON.stringify(json).slice(0, 200)}`);
  }

  const title = readString(product.title) || handle;
  const descriptionHtml = readString(product.body_html) || "";
  const description = stripHtml(descriptionHtml);
  const vendor = readString(product.vendor) || null;
  const productType = readString(product.product_type) || null;

  const tagsField = product.tags;
  const tags: string[] = Array.isArray(tagsField)
    ? tagsField.map((t) => String(t)).filter(Boolean)
    : typeof tagsField === "string"
      ? tagsField.split(/,\s*/).filter(Boolean)
      : [];

  const imagesField = product.images;
  const images: string[] = Array.isArray(imagesField)
    ? imagesField
        .map((img) =>
          typeof img === "object" && img && "src" in img
            ? String((img as { src: unknown }).src || "")
            : "",
        )
        .filter((s) => s.length > 0)
    : [];

  // 推断颜色 / 尺码：扫 options 数组，找 name 含 "color"/"颜色" 的；尺码类似
  const optionsField = product.options;
  const options: Array<{ name: string; values: string[] }> = Array.isArray(
    optionsField,
  )
    ? optionsField.map((o) => {
        const obj = o as Record<string, unknown>;
        const name = readString(obj.name) || "";
        const vs = Array.isArray(obj.values)
          ? (obj.values as unknown[]).map((v) => String(v))
          : [];
        return { name, values: vs };
      })
    : [];

  let color: string | null = null;
  const colorOpt = options.find((o) =>
    /color|colour|颜色|色/i.test(o.name),
  );
  if (colorOpt && colorOpt.values.length > 0) {
    color = colorOpt.values[0];
  }

  let sizes: string[] = [];
  const sizeOpt = options.find((o) => /size|尺码|尺寸/i.test(o.name));
  if (sizeOpt) sizes = sizeOpt.values;

  // 主价格 / 货币：取 variants[0]
  const variantsField = product.variants;
  let price: string | null = null;
  let currency: string | null = null;
  if (Array.isArray(variantsField) && variantsField.length > 0) {
    const v = variantsField[0] as Record<string, unknown>;
    price = readString(v.price) || null;
    // Shopify variants 不直接给 currency，常在 store 全局；先 null
  }

  return {
    source_platform: "shopify",
    handle,
    title,
    description,
    description_html: descriptionHtml,
    vendor,
    product_type: productType,
    tags,
    images,
    color,
    sizes,
    price,
    currency,
    raw: {
      // 只保留有用部分，省 DB 空间（完整 product json 平均 30-100KB）
      id: product.id,
      handle,
      title,
      vendor,
      product_type: productType,
      tags,
      options,
      variants_count: Array.isArray(variantsField) ? variantsField.length : 0,
      images_count: images.length,
      created_at: product.created_at,
      published_at: product.published_at,
    },
  };
}

/**
 * 校验 URL 是不是 Shopify 站（启发式：URL 路径含 /products/<handle>）
 */
export function looksLikeShopifyUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /\/products\/[a-z0-9-]+/i.test(u.pathname);
  } catch {
    return false;
  }
}

/* ─── 内部工具 ─────────────────────────────────────────────────── */

function parseProductUrl(productUrl: string): {
  origin: string;
  handle: string;
} {
  const u = new URL(productUrl);
  const m = u.pathname.match(/\/products\/([a-z0-9-]+)/i);
  if (!m) {
    throw new Error(
      `URL 路径不包含 /products/<handle>：${u.pathname}（不是 Shopify 产品页）`,
    );
  }
  return { origin: u.origin, handle: m[1] };
}

function readString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  return null;
}

/**
 * 简单 HTML → 纯文本：去 tag、解 entity、塌行
 * （足够喂给 LLM；不是 SEO 友好渲染）
 */
function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
