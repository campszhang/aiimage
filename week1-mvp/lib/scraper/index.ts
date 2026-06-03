/**
 * 爬取 dispatcher — 按 URL 自动选 adapter
 *
 * M2a 阶段：只支持 Shopify
 * M7 计划：Amazon / Temu / SHEIN / 通用 Puppeteer
 */

import { scrapeShopify, looksLikeShopifyUrl } from "./shopify";
import type { ShopifyScrapeResult } from "./shopify";

export type ScrapeResult = ShopifyScrapeResult; // M7 后会变 union
export type ScrapeUnsupportedReason =
  | "amazon"
  | "temu"
  | "shein"
  | "etsy"
  | "unknown_domain";

/**
 * 检测 URL 走哪个 adapter；返回 null 表示当前阶段不支持
 */
export function detectScraper(
  url: string,
): "shopify" | { unsupported: ScrapeUnsupportedReason } {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    if (host.includes("amazon.")) return { unsupported: "amazon" };
    if (host.includes("temu.")) return { unsupported: "temu" };
    if (host.includes("shein.")) return { unsupported: "shein" };
    if (host.includes("etsy.")) return { unsupported: "etsy" };

    // 启发式：路径含 /products/<handle> → Shopify
    if (looksLikeShopifyUrl(url)) return "shopify";

    return { unsupported: "unknown_domain" };
  } catch {
    return { unsupported: "unknown_domain" };
  }
}

/**
 * 抓取入口。失败抛错。
 */
export async function scrape(url: string): Promise<ScrapeResult> {
  const detected = detectScraper(url);
  if (typeof detected !== "string") {
    const reasonText: Record<ScrapeUnsupportedReason, string> = {
      amazon: "Amazon 抓取需要 Puppeteer + 反爬代理，计划在 M7 提供",
      temu: "Temu 抓取需要 Puppeteer + 反爬代理，计划在 M7 提供",
      shein: "SHEIN 抓取需要 Puppeteer + 反爬代理，计划在 M7 提供",
      etsy: "Etsy 抓取需要 OAuth API，计划在 M7 提供",
      unknown_domain:
        "无法识别 URL（不是 Shopify 站 / 不是已支持的电商平台）。当前 M2a 阶段仅支持 Shopify 同行独立站",
    };
    throw new Error(reasonText[detected.unsupported]);
  }
  return scrapeShopify(url);
}
