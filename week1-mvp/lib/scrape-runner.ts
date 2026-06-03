/**
 * 爬取 worker — 单进程后台轮询 scrape_jobs 队列，处理 queued → success/failed
 *
 * 跟 job-runner.ts（render job worker）独立，因为：
 *   - 爬取是 IO/网络重，跟图像生成 CPU/GPU 重不冲突
 *   - 失败重试策略不同（爬取失败常常是临时网络问题，可重试）
 *
 * 调用模式：服务进程启动时调一次 startScrapeWorker()，常驻轮询。
 */

import { promises as fs } from "fs";
import path from "path";
import { getDb, DATA_DIR_PATH } from "./db";
import {
  type ScrapeJobRow,
  type ScrapeJobStatus,
  createProduct,
  updateProduct,
  addProductImage,
} from "./products-db";
import { scrape, detectScraper } from "./scraper";

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 3;

let workerStarted = false;
let abortController: AbortController | null = null;

/**
 * 启动 worker（幂等：多次调用只生效一次）
 */
export function startScrapeWorker() {
  if (workerStarted) return;
  workerStarted = true;
  abortController = new AbortController();
  void runLoop(abortController.signal);
  console.log("[scrape-runner] worker started");
}

export function stopScrapeWorker() {
  abortController?.abort();
  workerStarted = false;
  abortController = null;
}

async function runLoop(signal: AbortSignal) {
  while (!signal.aborted) {
    try {
      const job = pickNextQueuedJob();
      if (!job) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      await processJob(job);
    } catch (e) {
      console.error("[scrape-runner] loop error:", e);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

/**
 * 原子地从队列里捞一条 queued → running
 *
 * 用 SQLite 的 UPDATE ... RETURNING 保证只有一个 worker 拿到（虽然现在只有 1 个 worker，
 * 为以后多 worker 留口）。
 */
function pickNextQueuedJob(): ScrapeJobRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `UPDATE scrape_jobs
         SET status = 'running',
             started_at = unixepoch(),
             attempts = attempts + 1
       WHERE id = (
         SELECT id FROM scrape_jobs
           WHERE status = 'queued'
           ORDER BY created_at
           LIMIT 1
       )
       RETURNING *`,
    )
    .get() as ScrapeJobRow | undefined;
  return row ?? null;
}

async function processJob(job: ScrapeJobRow): Promise<void> {
  try {
    // 1) 检测 URL 支持
    const detected = detectScraper(job.url);
    if (typeof detected !== "string") {
      throw new Error(
        `URL 类型暂不支持（${detected.unsupported}）。M2a 阶段仅支持 Shopify。`,
      );
    }

    // 2) 抓取
    const r = await scrape(job.url);

    // 3) 创建 / 更新 product 行
    let productId = job.product_id;
    if (productId == null) {
      const created = createProduct({
        userId: job.user_id,
        sourceUrl: job.url,
        sourcePlatform: r.source_platform,
        sourceData: {
          handle: r.handle,
          vendor: r.vendor,
          product_type: r.product_type,
          tags: r.tags,
          color: r.color,
          sizes: r.sizes,
          price: r.price,
          description: r.description, // 原文，未优化
          raw: r.raw,
        },
      });
      productId = created.id;
      bindProductToJob(job.id, productId);
    } else {
      updateProduct(productId, {
        source_color_name: r.color,
      });
    }

    // 给 products 行回填 title / source_color_name（draft 状态的初值，等 M3 LLM 优化覆盖）
    updateProduct(productId, {
      title: r.title,
      source_color_name: r.color,
    });

    // 4) 下载图片到 DATA_DIR/scraped/<product_id>/
    const dir = path.join(DATA_DIR_PATH, "scraped", String(productId));
    await fs.mkdir(dir, { recursive: true });

    // 限制最多 10 张；首张设为 primary
    const maxImgs = Math.min(r.images.length, 10);
    for (let i = 0; i < maxImgs; i++) {
      const imgUrl = r.images[i];
      try {
        const buf = await downloadImage(imgUrl);
        const ext = guessExtension(imgUrl);
        const filename = `img_${String(i + 1).padStart(2, "0")}${ext}`;
        const abs = path.join(dir, filename);
        await fs.writeFile(abs, buf);
        addProductImage({
          productId,
          imageUrl: imgUrl,
          localPath: `scraped/${productId}/${filename}`,
          sortOrder: i,
          isPrimary: i === 0,
          bytes: buf.length,
        });
      } catch (imgErr) {
        // 单张图片失败不影响整体；记 URL 但不存 local_path
        console.warn(
          `[scrape-runner] 图片下载失败 ${imgUrl}: ${
            imgErr instanceof Error ? imgErr.message : imgErr
          }`,
        );
        addProductImage({
          productId,
          imageUrl: imgUrl,
          sortOrder: i,
          isPrimary: i === 0,
        });
      }
    }

    finishJob(job.id, "success");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 还有重试机会 → 放回 queued
    if (job.attempts < MAX_ATTEMPTS) {
      console.warn(
        `[scrape-runner] job ${job.id} attempt ${job.attempts} failed, retrying: ${msg}`,
      );
      requeueJob(job.id, msg);
    } else {
      console.error(
        `[scrape-runner] job ${job.id} permanently failed: ${msg}`,
      );
      finishJob(job.id, "failed", msg);
      // 如果已经有关联 product，把它标 failed
      if (job.product_id) {
        updateProduct(job.product_id, {
          status: "failed",
          failure_stage: "scrape",
          failure_reason: msg,
        });
      }
    }
  }
}

function bindProductToJob(jobId: number, productId: number): void {
  getDb()
    .prepare(`UPDATE scrape_jobs SET product_id = ? WHERE id = ?`)
    .run(productId, jobId);
}

function finishJob(
  jobId: number,
  status: ScrapeJobStatus,
  errorMessage?: string,
): void {
  getDb()
    .prepare(
      `UPDATE scrape_jobs
         SET status = ?, finished_at = unixepoch(), error_message = ?
         WHERE id = ?`,
    )
    .run(status, errorMessage ?? null, jobId);
}

function requeueJob(jobId: number, errorMessage: string): void {
  getDb()
    .prepare(
      `UPDATE scrape_jobs
         SET status = 'queued', error_message = ?
         WHERE id = ?`,
    )
    .run(errorMessage, jobId);
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`图片下载 ${res.status} ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function guessExtension(url: string): string {
  const m = url.match(/\.(jpg|jpeg|png|webp|avif|gif)(?:\?|$)/i);
  if (m) return "." + m[1].toLowerCase();
  return ".jpg";
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
