/**
 * products / product_images / product_renders / scrape_jobs /
 * shopify_credentials / shopify_metafields CRUD 助手
 *
 * 模块定位：竞品采集 → 文案优化 → 套图 → Shopify 上传 端到端 pipeline 数据层
 *
 * 状态机（products.status）:
 *
 *   draft → optimizing → optimized → rendering → reviewing → uploading → uploaded
 *                                                                       ↘
 *                                                                       failed (任意阶段)
 *
 * - draft       刚抓回来 / 手动创建，未做 LLM 文案优化
 * - optimizing  后台正在跑 LLM 优化
 * - optimized   优化完成，等人工审核
 * - rendering   正在生成套图（recolor + batch-photo）
 * - reviewing   套图完成，等人工审核
 * - uploading   正在上传 Shopify
 * - uploaded    已上架
 * - failed      任意阶段失败（看 failure_stage 字段定位）
 */

import { getDb } from "./db";

/* ─── 类型定义 ─────────────────────────────────────────────────── */

export type ProductStatus =
  | "draft"
  | "optimizing"
  | "optimized"
  | "rendering"
  | "reviewing"
  | "uploading"
  | "uploaded"
  | "failed";

export type ProductFailureStage =
  | "scrape"
  | "optimize"
  | "render"
  | "upload"
  | null;

export type ProductRow = {
  id: number;
  user_id: number;
  status: ProductStatus;
  source_url: string;
  source_platform: string | null;
  source_data: string | null;
  title: string | null;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  attrs: string | null;
  color_id: number | null;
  source_color_name: string | null;
  color_match_confidence: number | null;
  shopify_product_id: string | null;
  shopify_uploaded_at: number | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  failure_reason: string | null;
  failure_stage: ProductFailureStage;
};

export type ProductImageRow = {
  id: number;
  product_id: number;
  image_url: string;
  local_path: string | null;
  sort_order: number;
  is_primary: number;
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_at: number;
};

export type ProductRenderShotType =
  | "recolor"
  | "solid_pose"
  | "scene"
  | "detail";

export type ProductRenderRow = {
  id: number;
  product_id: number;
  render_job_id: number | null;
  render_job_item_id: number | null;
  shot_type: ProductRenderShotType;
  sort_order: number;
  image_path: string | null;
  created_at: number;
};

export type ScrapeJobStatus = "queued" | "running" | "success" | "failed";

export type ScrapeJobRow = {
  id: number;
  user_id: number;
  product_id: number | null;
  url: string;
  status: ScrapeJobStatus;
  attempts: number;
  error_message: string | null;
  started_at: number | null;
  finished_at: number | null;
  created_at: number;
};

export type ShopifyCredentialRow = {
  id: number;
  user_id: number;
  shop_domain: string;
  access_token: string;
  api_version: string;
  created_at: number;
  updated_at: number;
};

export type ShopifyMetafieldRow = {
  id: number;
  user_id: number;
  namespace: string;
  key: string;
  name: string;
  type: string;
  allowed_values: string | null;
  validations: string | null;
  sort_order: number;
  synced_at: number | null;
  created_at: number;
};

/* ─── products CRUD ────────────────────────────────────────────── */

export function createProduct(args: {
  userId: number;
  sourceUrl: string;
  sourcePlatform?: string | null;
  sourceData?: Record<string, unknown> | null;
}): ProductRow {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO products
         (user_id, status, source_url, source_platform, source_data)
       VALUES
         (?, 'draft', ?, ?, ?)`,
    )
    .run(
      args.userId,
      args.sourceUrl,
      args.sourcePlatform ?? null,
      args.sourceData ? JSON.stringify(args.sourceData) : null,
    );
  const id = Number(res.lastInsertRowid);
  return getProductById(id)!;
}

export function getProductById(id: number): ProductRow | null {
  const db = getDb();
  return (
    (db
      .prepare(`SELECT * FROM products WHERE id = ?`)
      .get(id) as ProductRow | undefined) ?? null
  );
}

export function listProducts(args: {
  userId?: number; // null/undefined → 所有 user（admin 用）
  status?: ProductStatus | "all";
  archived?: boolean; // 默认 false（不查归档）
  search?: string; // 标题模糊
  limit?: number;
  offset?: number;
}): { rows: ProductRow[]; total: number } {
  const db = getDb();
  const conds: string[] = [];
  const params: Array<string | number | null> = [];
  if (typeof args.userId === "number") {
    conds.push("user_id = ?");
    params.push(args.userId);
  }
  if (args.status && args.status !== "all") {
    conds.push("status = ?");
    params.push(args.status);
  }
  if (!args.archived) {
    conds.push("archived_at IS NULL");
  }
  if (args.search) {
    conds.push("(title LIKE ? OR source_url LIKE ?)");
    const like = `%${args.search}%`;
    params.push(like, like);
  }
  const where = conds.length > 0 ? "WHERE " + conds.join(" AND ") : "";

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM products ${where}`)
      .get(...params) as { c: number }
  ).c;

  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  const rows = db
    .prepare(
      `SELECT * FROM products
         ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ProductRow[];

  return { rows, total };
}

export type UpdateProductPatch = Partial<{
  status: ProductStatus;
  title: string | null;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  attrs: Record<string, unknown> | null;
  color_id: number | null;
  source_color_name: string | null;
  color_match_confidence: number | null;
  shopify_product_id: string | null;
  shopify_uploaded_at: number | null;
  failure_reason: string | null;
  failure_stage: ProductFailureStage;
  archived_at: number | null;
}>;

export function updateProduct(id: number, patch: UpdateProductPatch): void {
  const db = getDb();
  const cols: string[] = [];
  const vals: Array<string | number | null> = [];

  const push = (col: string, val: string | number | null) => {
    cols.push(`${col} = ?`);
    vals.push(val);
  };

  if ("status" in patch) push("status", patch.status!);
  if ("title" in patch) push("title", patch.title ?? null);
  if ("description" in patch) push("description", patch.description ?? null);
  if ("seo_title" in patch) push("seo_title", patch.seo_title ?? null);
  if ("seo_description" in patch)
    push("seo_description", patch.seo_description ?? null);
  if ("attrs" in patch)
    push("attrs", patch.attrs ? JSON.stringify(patch.attrs) : null);
  if ("color_id" in patch) push("color_id", patch.color_id ?? null);
  if ("source_color_name" in patch)
    push("source_color_name", patch.source_color_name ?? null);
  if ("color_match_confidence" in patch)
    push("color_match_confidence", patch.color_match_confidence ?? null);
  if ("shopify_product_id" in patch)
    push("shopify_product_id", patch.shopify_product_id ?? null);
  if ("shopify_uploaded_at" in patch)
    push("shopify_uploaded_at", patch.shopify_uploaded_at ?? null);
  if ("failure_reason" in patch)
    push("failure_reason", patch.failure_reason ?? null);
  if ("failure_stage" in patch) push("failure_stage", patch.failure_stage ?? null);
  if ("archived_at" in patch) push("archived_at", patch.archived_at ?? null);

  if (cols.length === 0) return;
  cols.push("updated_at = unixepoch()");
  vals.push(id);

  db.prepare(`UPDATE products SET ${cols.join(", ")} WHERE id = ?`).run(...vals);
}

export function deleteProduct(id: number): void {
  // CASCADE：product_images / product_renders / scrape_jobs 跟着删
  getDb().prepare(`DELETE FROM products WHERE id = ?`).run(id);
}

/* ─── product_images CRUD ──────────────────────────────────────── */

export function addProductImage(args: {
  productId: number;
  imageUrl: string;
  localPath?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
}): ProductImageRow {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO product_images
         (product_id, image_url, local_path, sort_order, is_primary, width, height, bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.productId,
      args.imageUrl,
      args.localPath ?? null,
      args.sortOrder ?? 0,
      args.isPrimary ? 1 : 0,
      args.width ?? null,
      args.height ?? null,
      args.bytes ?? null,
    );
  return db
    .prepare(`SELECT * FROM product_images WHERE id = ?`)
    .get(Number(res.lastInsertRowid)) as ProductImageRow;
}

export function listProductImages(productId: number): ProductImageRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id`,
    )
    .all(productId) as ProductImageRow[];
}

export function getPrimaryProductImage(
  productId: number,
): ProductImageRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT * FROM product_images
           WHERE product_id = ? AND is_primary = 1
           ORDER BY sort_order, id
           LIMIT 1`,
      )
      .get(productId) as ProductImageRow | undefined) ?? null
  );
}

/* ─── product_renders CRUD ─────────────────────────────────────── */

export function addProductRender(args: {
  productId: number;
  shotType: ProductRenderShotType;
  renderJobId?: number | null;
  renderJobItemId?: number | null;
  sortOrder?: number;
  imagePath?: string | null;
}): ProductRenderRow {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO product_renders
         (product_id, render_job_id, render_job_item_id, shot_type, sort_order, image_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.productId,
      args.renderJobId ?? null,
      args.renderJobItemId ?? null,
      args.shotType,
      args.sortOrder ?? 0,
      args.imagePath ?? null,
    );
  return getDb()
    .prepare(`SELECT * FROM product_renders WHERE id = ?`)
    .get(Number(res.lastInsertRowid)) as ProductRenderRow;
}

export function listProductRenders(productId: number): ProductRenderRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM product_renders WHERE product_id = ? ORDER BY sort_order, id`,
    )
    .all(productId) as ProductRenderRow[];
}

/* ─── scrape_jobs CRUD ─────────────────────────────────────────── */

export function createScrapeJob(args: {
  userId: number;
  url: string;
  productId?: number | null;
}): ScrapeJobRow {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO scrape_jobs (user_id, product_id, url, status)
       VALUES (?, ?, ?, 'queued')`,
    )
    .run(args.userId, args.productId ?? null, args.url);
  return getDb()
    .prepare(`SELECT * FROM scrape_jobs WHERE id = ?`)
    .get(Number(res.lastInsertRowid)) as ScrapeJobRow;
}

export function listScrapeJobs(args: {
  userId?: number;
  status?: ScrapeJobStatus;
  limit?: number;
}): ScrapeJobRow[] {
  const conds: string[] = [];
  const params: Array<string | number> = [];
  if (typeof args.userId === "number") {
    conds.push("user_id = ?");
    params.push(args.userId);
  }
  if (args.status) {
    conds.push("status = ?");
    params.push(args.status);
  }
  const where = conds.length > 0 ? "WHERE " + conds.join(" AND ") : "";
  return getDb()
    .prepare(
      `SELECT * FROM scrape_jobs ${where} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...params, args.limit ?? 100) as ScrapeJobRow[];
}

/* ─── shopify_credentials CRUD ─────────────────────────────────── */

export function getShopifyCredential(
  userId: number,
): ShopifyCredentialRow | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM shopify_credentials WHERE user_id = ?`)
      .get(userId) as ShopifyCredentialRow | undefined) ?? null
  );
}

export function upsertShopifyCredential(args: {
  userId: number;
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO shopify_credentials (user_id, shop_domain, access_token, api_version)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         shop_domain  = excluded.shop_domain,
         access_token = excluded.access_token,
         api_version  = excluded.api_version,
         updated_at   = unixepoch()`,
    )
    .run(
      args.userId,
      args.shopDomain,
      args.accessToken,
      args.apiVersion ?? "2024-10",
    );
}

/* ─── shopify_metafields CRUD ──────────────────────────────────── */

export function listShopifyMetafields(
  userId: number,
): ShopifyMetafieldRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM shopify_metafields
         WHERE user_id = ?
         ORDER BY sort_order, namespace, key`,
    )
    .all(userId) as ShopifyMetafieldRow[];
}

export function upsertShopifyMetafield(args: {
  userId: number;
  namespace: string;
  key: string;
  name: string;
  type: string;
  allowedValues?: string[] | null;
  validations?: Record<string, unknown> | null;
  sortOrder?: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO shopify_metafields
         (user_id, namespace, key, name, type, allowed_values, validations, sort_order, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(user_id, namespace, key) DO UPDATE SET
         name           = excluded.name,
         type           = excluded.type,
         allowed_values = excluded.allowed_values,
         validations    = excluded.validations,
         sort_order     = excluded.sort_order,
         synced_at      = unixepoch()`,
    )
    .run(
      args.userId,
      args.namespace,
      args.key,
      args.name,
      args.type,
      args.allowedValues ? JSON.stringify(args.allowedValues) : null,
      args.validations ? JSON.stringify(args.validations) : null,
      args.sortOrder ?? 0,
    );
}

/* ─── 工具：解析 JSON 字段 ─────────────────────────────────────── */

export function parseProductAttrs(p: ProductRow): Record<string, unknown> {
  if (!p.attrs) return {};
  try {
    return JSON.parse(p.attrs) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function parseSourceData(p: ProductRow): Record<string, unknown> {
  if (!p.source_data) return {};
  try {
    return JSON.parse(p.source_data) as Record<string, unknown>;
  } catch {
    return {};
  }
}
