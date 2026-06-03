"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Plus,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  Button,
  Card,
  Chip,
  Dialog,
  SearchInput,
  Tabs,
  Textarea,
  type TabItem,
  type ChipTone,
} from "@/app/_components/ui";

type ProductStatus =
  | "draft"
  | "optimizing"
  | "optimized"
  | "rendering"
  | "reviewing"
  | "uploading"
  | "uploaded"
  | "failed";

type ProductRow = {
  id: number;
  user_id: number;
  status: ProductStatus;
  source_url: string;
  source_platform: string | null;
  title: string | null;
  source_color_name: string | null;
  color_match_confidence: number | null;
  shopify_product_id: string | null;
  shopify_uploaded_at: number | null;
  created_at: number;
  updated_at: number;
};

type ScrapeJobRow = {
  id: number;
  user_id: number;
  product_id: number | null;
  url: string;
  status: "queued" | "running" | "success" | "failed";
  attempts: number;
  error_message: string | null;
  started_at: number | null;
  finished_at: number | null;
  created_at: number;
};

const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "草稿",
  optimizing: "优化中",
  optimized: "待审核",
  rendering: "出图中",
  reviewing: "套图审核",
  uploading: "上传中",
  uploaded: "已上架",
  failed: "失败",
};

const STATUS_TONES: Record<ProductStatus, ChipTone> = {
  draft: "gray",
  optimizing: "brand",
  optimized: "warn",
  rendering: "brand",
  reviewing: "brand",
  uploading: "brand",
  uploaded: "success",
  failed: "danger",
};

const STATUS_TABS: Array<{ key: ProductStatus | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "optimized", label: "待审核" },
  { key: "reviewing", label: "套图审核" },
  { key: "uploaded", label: "已上架" },
  { key: "failed", label: "失败" },
];

export default function ProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProductStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false);
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJobRow[]>([]);

  const fetchList = useCallback(() => {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("status", tab);
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.rows)) {
          setRows(data.rows);
          setTotal(data.total ?? 0);
        }
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [tab, search]);

  useEffect(() => {
    setLoading(true);
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const fetchScrapeJobs = () => {
      fetch("/api/products/scrape?limit=20")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data?.rows)) setScrapeJobs(data.rows);
        })
        .catch(() => {});
    };
    fetchScrapeJobs();
    const interval = setInterval(
      fetchScrapeJobs,
      scrapeDialogOpen ? 2000 : 10000,
    );
    return () => clearInterval(interval);
  }, [scrapeDialogOpen]);

  const hasActiveScrape = useMemo(
    () => scrapeJobs.some((j) => j.status === "queued" || j.status === "running"),
    [scrapeJobs],
  );
  useEffect(() => {
    if (!hasActiveScrape) return;
    const t = setInterval(fetchList, 3000);
    return () => clearInterval(t);
  }, [hasActiveScrape, fetchList]);

  const activeQueueCount = scrapeJobs.filter(
    (j) => j.status === "queued" || j.status === "running",
  ).length;

  return (
    <div className="min-h-full">
      <div className="px-6 pt-6 pb-4">
        <Card className="mb-5 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1.5">
                <h1 className="text-[20px] font-display font-semibold text-fg-primary">
                  竞品采集 · 产品管理工作台
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                  M2a
                </span>
                {activeQueueCount > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-medium border border-blue-200">
                    <Loader2 size={10} className="animate-spin" />
                    {activeQueueCount} 任务进行中
                  </span>
                ) : null}
              </div>
              <p className="text-[13px] text-fg-tertiary">
                抓取竞品 → AI 优化文案 → 套图生成 → 一键上传 Shopify。
                当前 {total} 个产品 · M2a 阶段仅支持 Shopify 同行独立站
              </p>
            </div>
            <Button
              variant="primary"
              leftIcon={<Plus size={14} />}
              onClick={() => setScrapeDialogOpen(true)}
            >
              批量抓取
            </Button>
          </div>
        </Card>

        <div className="flex items-center justify-between gap-3 mb-3">
          <Tabs
            items={STATUS_TABS.map((t) => ({ key: t.key, label: t.label })) as TabItem[]}
            value={tab}
            onChange={(v) => setTab(v as ProductStatus | "all")}
            variant="pills"
          />
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题 / URL"
            className="w-64"
          />
        </div>

        <Card padding="none" className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-bg-tertiary border-b border-border-default">
              <tr className="text-left text-fg-tertiary">
                <th className="px-4 py-2.5 font-medium">标题</th>
                <th className="px-4 py-2.5 font-medium">来源</th>
                <th className="px-4 py-2.5 font-medium">竞品色名</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">创建</th>
                <th className="px-4 py-2.5 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Loader2 size={20} className="inline animate-spin text-fg-muted" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-fg-tertiary">
                    <Package size={32} className="inline-block mb-3 text-fg-muted" />
                    <div className="text-[14px]">还没有产品</div>
                    <div className="text-[12px] mt-1">
                      点击右上方「批量抓取」粘贴 Shopify 同行 URL 开始
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border-subtle hover:bg-bg-hover"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-fg-primary line-clamp-1">
                        {p.title || (
                          <span className="text-fg-muted italic">未优化</span>
                        )}
                      </div>
                      <a
                        href={p.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-fg-tertiary hover:text-brand-500 line-clamp-1"
                      >
                        {p.source_url}
                        <ExternalLink size={10} />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-fg-secondary">
                        {p.source_platform || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.source_color_name ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] text-fg-secondary">
                            {p.source_color_name}
                          </span>
                          {p.color_match_confidence != null ? (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                p.color_match_confidence >= 0.8
                                  ? "bg-green-50 text-green-700"
                                  : p.color_match_confidence >= 0.5
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-red-50 text-red-700"
                              }`}
                            >
                              {(p.color_match_confidence * 100).toFixed(0)}%
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Chip
                        tone={STATUS_TONES[p.status]}
                        icon={
                          p.status === "uploading" ||
                          p.status === "optimizing" ||
                          p.status === "rendering" ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : p.status === "uploaded" ? (
                            <CheckCircle2 size={10} />
                          ) : p.status === "failed" ? (
                            <AlertTriangle size={10} />
                          ) : (
                            <Clock size={10} />
                          )
                        }
                      >
                        {STATUS_LABELS[p.status]}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-fg-tertiary">
                      {new Date(p.created_at * 1000).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled
                        className="text-[12px] text-fg-muted opacity-50 cursor-not-allowed"
                        title="详情页 M3 开放"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {scrapeDialogOpen ? (
        <ScrapeDialog
          jobs={scrapeJobs}
          onClose={() => setScrapeDialogOpen(false)}
          onQueued={() => fetchList()}
        />
      ) : null}
    </div>
  );
}

function ScrapeDialog({
  jobs,
  onClose,
  onQueued,
}: {
  jobs: ScrapeJobRow[];
  onClose: () => void;
  onQueued: () => void;
}) {
  const [urlText, setUrlText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    queued: Array<{ url: string; job_id: number }>;
    rejected: Array<{ url: string; reason: string }>;
  } | null>(null);

  const handleSubmit = async () => {
    const urls = urlText
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urls.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/products/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastResult({
          queued: data.queued || [],
          rejected: data.rejected || [],
        });
        if ((data.queued || []).length > 0) {
          setUrlText("");
          onQueued();
        }
      } else {
        setLastResult({
          queued: [],
          rejected: urls.map((u) => ({ url: u, reason: data.error || "服务端错误" })),
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const recent = jobs.slice(0, 20);

  return (
    <Dialog open onClose={onClose} title="批量抓取 Shopify 产品" width="xl">
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-fg-secondary mb-1.5">
            产品页 URL 列表（每行一个 / 逗号分隔，最多 50 条）
          </label>
          <Textarea
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder={"https://shopwhitefox.com/products/lover-girl-dress\nhttps://anothershop.com/products/some-handle"}
            rows={6}
            className="font-mono text-[12px]"
          />
          <div className="text-[11px] text-fg-tertiary mt-1">
            当前 M2a 只支持 Shopify 站。Amazon / Temu / SHEIN 等会自动跳过并提示原因。
          </div>
        </div>

        {lastResult ? (
          <div className="space-y-1">
            {lastResult.queued.length > 0 ? (
              <div className="text-[12px] text-fg-secondary">
                ✓ 已入队 {lastResult.queued.length} 条
              </div>
            ) : null}
            {lastResult.rejected.length > 0 ? (
              <div className="space-y-1">
                <div className="text-[12px] text-warn">
                  ✗ 跳过 {lastResult.rejected.length} 条：
                </div>
                {lastResult.rejected.map((r, i) => (
                  <div
                    key={i}
                    className="text-[11px] text-fg-tertiary pl-2 border-l-2 border-amber-200"
                  >
                    <div className="line-clamp-1 break-all">{r.url}</div>
                    <div className="text-warn">{r.reason}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {recent.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-medium text-fg-secondary">
                最近 20 条任务进度
              </div>
              <RefreshCw size={10} className="text-fg-muted animate-pulse" />
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto border border-border-subtle rounded-md p-2">
              {recent.map((j) => (
                <ScrapeJobItem key={j.id} job={j} />
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !urlText.trim()}
            leftIcon={submitting ? <Loader2 size={14} className="animate-spin" /> : null}
          >
            {submitting ? "提交中…" : "提交抓取"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ScrapeJobItem({ job }: { job: ScrapeJobRow }) {
  const statusTone: Record<ScrapeJobRow["status"], ChipTone> = {
    queued: "gray",
    running: "brand",
    success: "success",
    failed: "danger",
  };
  const statusLabel: Record<ScrapeJobRow["status"], string> = {
    queued: "等待",
    running: "抓取中",
    success: "成功",
    failed: "失败",
  };
  return (
    <div className="flex items-center gap-2 py-1 text-[11px]">
      <Chip tone={statusTone[job.status]}>
        {job.status === "running" || job.status === "queued" ? (
          <Loader2 size={9} className="animate-spin mr-1" />
        ) : null}
        {statusLabel[job.status]}
      </Chip>
      <div className="flex-1 min-w-0">
        <div className="line-clamp-1 break-all text-fg-secondary">{job.url}</div>
        {job.error_message ? (
          <div className="text-warn line-clamp-1">{job.error_message}</div>
        ) : null}
      </div>
      <div className="text-fg-muted">
        {new Date(job.created_at * 1000).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </div>
    </div>
  );
}
