import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createScrapeJob, listScrapeJobs } from "@/lib/products-db";
import { startScrapeWorker } from "@/lib/scrape-runner";
import { detectScraper } from "@/lib/scraper";

export const runtime = "nodejs";

/**
 * POST /api/products/scrape
 *
 * Body: { urls: string[] }   // 多行粘贴的 URL 列表
 *
 * 返回：
 *   {
 *     queued:   [{ url, job_id }],         // 入队成功
 *     rejected: [{ url, reason }],          // 当前阶段不支持
 *   }
 *
 * URL 类型不支持的（Amazon/Temu/SHEIN/etsy/未识别）直接 reject，
 * 不写 DB；用户能看到为什么没入队。
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { urls?: unknown };
    const urlsRaw = Array.isArray(body.urls) ? body.urls : [];
    const urls = urlsRaw
      .map((u) => (typeof u === "string" ? u.trim() : ""))
      .filter((u) => u.length > 0)
      .slice(0, 50); // 单次最多 50 条

    if (urls.length === 0) {
      return NextResponse.json(
        { error: "请粘贴至少 1 个 URL" },
        { status: 400 },
      );
    }

    const queued: Array<{ url: string; job_id: number }> = [];
    const rejected: Array<{ url: string; reason: string }> = [];

    for (const url of urls) {
      try {
        new URL(url); // 校验格式
      } catch {
        rejected.push({ url, reason: "URL 格式不合法" });
        continue;
      }

      const detected = detectScraper(url);
      if (typeof detected !== "string") {
        const reasonMap: Record<string, string> = {
          amazon: "Amazon 暂不支持（M7 计划）",
          temu: "Temu 暂不支持（M7 计划）",
          shein: "SHEIN 暂不支持（M7 计划）",
          etsy: "Etsy 暂不支持（M7 计划）",
          unknown_domain: "无法识别（M2a 仅支持 Shopify /products/xxx 形式）",
        };
        rejected.push({
          url,
          reason: reasonMap[detected.unsupported] || "未知原因",
        });
        continue;
      }

      const job = createScrapeJob({ userId: user.id, url });
      queued.push({ url, job_id: job.id });
    }

    // 入队后启动 worker（幂等）
    if (queued.length > 0) {
      startScrapeWorker();
    }

    return NextResponse.json({ queued, rejected });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}

/**
 * GET /api/products/scrape?limit=50
 * 列出当前用户最近的爬取任务 — 用于 UI 实时进度回显
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const limit = Math.min(
      200,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50),
    );
    const rows = listScrapeJobs({ userId: user.id, limit });
    return NextResponse.json({ rows });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}
