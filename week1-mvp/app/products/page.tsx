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
  Wand2,
  ImagePlus,
  Palette,
  UploadCloud,
} from "lucide-react";
import {
  Button,
  Card,
  Chip,
  Dialog,
  Input,
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
  failure_reason?: string | null;
  failure_stage?: string | null;
  created_at: number;
  updated_at: number;
};

type ProductCounts = Record<ProductStatus | "all", number>;

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

type ProductDetail = {
  product: ProductRow & {
    description: string | null;
    seo_title: string | null;
    seo_description: string | null;
  };
  source: Record<string, unknown>;
  attrs: Record<string, unknown>;
  images: Array<{
    id: number;
    image_url: string;
    local_path: string | null;
    asset_url: string;
    sort_order: number;
    is_primary: number;
  }>;
  renders: Array<{
    id: number;
    shot_type: string;
    image_path: string | null;
    asset_url: string | null;
    sort_order: number;
  }>;
};

const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "草稿",
  optimizing: "优化中",
  optimized: "待审核",
  rendering: "出图中",
  reviewing: "套图审核",
  uploading: "准备上架",
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
  { key: "uploading", label: "准备上架" },
  { key: "uploaded", label: "已上架" },
  { key: "failed", label: "失败" },
];

export default function ProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<ProductCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProductStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false);
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJobRow[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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
          setCounts(data.counts ?? null);
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

  const openDetail = useCallback((id: number) => {
    setDetailId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    fetch(`/api/products/${id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || r.statusText);
        setDetail(data);
      })
      .catch((e) => setDetailError(e instanceof Error ? e.message : String(e)))
      .finally(() => setDetailLoading(false));
  }, []);

  const refreshDetail = useCallback(() => {
    if (detailId == null) return;
    fetch(`/api/products/${detailId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.product) setDetail(data);
      })
      .catch(() => {});
    fetchList();
  }, [detailId, fetchList]);

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
                抓取竞品 → 草稿编辑 → 待审核 → 套图审核 → 准备上架 → Shopify。
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
            items={
              STATUS_TABS.map((t) => ({
                key: t.key,
                label: t.label,
                badge: counts ? counts[t.key] || 0 : undefined,
              })) as TabItem[]
            }
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
                        onClick={() => openDetail(p.id)}
                        className="text-[12px] text-brand-600 hover:text-brand-700 font-medium"
                        title="查看并处理产品流程"
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

      {detailId != null ? (
        <ProductDetailDialog
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => {
            setDetailId(null);
            setDetail(null);
          }}
          onChanged={refreshDetail}
        />
      ) : null}
    </div>
  );
}

function ProductDetailDialog({
  detail,
  loading,
  error,
  onClose,
  onChanged,
}: {
  detail: ProductDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    source_color_name: "",
    description: "",
    seo_title: "",
    seo_description: "",
    landing_price: "",
    landing_variants: "",
    landing_sections: "",
    style_palette: "",
    style_background: "",
    review_note: "",
  });

  useEffect(() => {
    if (!detail) return;
    const landing = readRecord(detail.attrs.landing_page);
    const colorAudit = readRecord(detail.attrs.color_style_audit);
    setForm({
      title: detail.product.title || "",
      source_color_name: detail.product.source_color_name || "",
      description: detail.product.description || "",
      seo_title: detail.product.seo_title || "",
      seo_description: detail.product.seo_description || "",
      landing_price:
        stringify(landing.price_reference) || stringify(detail.source.price),
      landing_variants:
        Array.isArray(landing.variants)
          ? landing.variants.join("\n")
          : sourceVariants(detail.source).join("\n"),
      landing_sections:
        Array.isArray(landing.sections)
          ? landing.sections.join("\n")
          : "首屏卖点\n材质触感\n场景展示\n尺寸/变体\n细节工艺\nFAQ",
      style_palette:
        stringify(colorAudit.palette) ||
        "产品主色 + 浅色床品背景 + 低饱和生活方式场景",
      style_background:
        stringify(colorAudit.background) ||
        "卧室/客厅/酒店场景保持干净、柔和、低干扰",
      review_note: stringify(colorAudit.note) || "",
    });
  }, [detail]);

  const product = detail?.product;
  const landingPageUrl =
    stringify(detail?.source.raw && readRecord(detail.source.raw).landing_page_url) ||
    product?.source_url ||
    "";
  const price = form.landing_price || stringify(detail?.source.price) || "—";
  const variants = sourceVariants(detail?.source || {});
  const rawVariants = sourceRawVariants(detail?.source || {});
  const isDraft = product?.status === "draft";
  const isPendingReview = product?.status === "optimized";
  const isImageReview = product?.status === "reviewing";
  const isReadyToPublish = product?.status === "uploading";
  const canUpload = isReadyToPublish;

  async function save() {
    if (!product) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          source_color_name: form.source_color_name,
          description: form.description,
          seo_title: form.seo_title,
          seo_description: form.seo_description,
          attrs: {
            landing_page: {
              price_reference: form.landing_price,
              variants: lines(form.landing_variants),
              sections: lines(form.landing_sections),
              updated_at: new Date().toISOString(),
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setMessage("已保存编辑内容");
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: string, note?: string) {
    if (!product) return;
    setActionLoading(action);
    setMessage(null);
    try {
      const res = await fetch(`/api/products/${product.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note,
          ...((action === "submit_review" || action === "start_render")
            ? buildReviewPayload(form)
            : {}),
          color_style: {
            palette: form.style_palette,
            background: form.style_background,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setMessage(String(data.message || "操作完成"));
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      onChanged();
    } finally {
      setActionLoading(null);
    }
  }

  const preflight = product
    ? buildPublishPreflight({
        title: form.title,
        description: form.description,
        seoTitle: form.seo_title,
        seoDescription: form.seo_description,
        variantCount: rawVariants.length || variants.length,
        imageCount: detail.images.length,
        renderCount: detail.renders.length,
        colorApproved:
          readRecord(detail.attrs.color_style_audit).status === "approved",
      })
    : [];
  const preflightOk = preflight.every((item) => item.ok);

  return (
    <Dialog open onClose={onClose} title="产品详情与流程管理" width="xl">
      {loading ? (
        <div className="py-14 text-center text-fg-tertiary">
          <Loader2 size={22} className="inline animate-spin" />
        </div>
      ) : error ? (
        <div className="p-3 rounded-md bg-red-50 text-red-700 text-[13px]">
          {error}
        </div>
      ) : !detail || !product ? (
        <div className="py-10 text-center text-fg-tertiary">没有产品详情</div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Chip tone={STATUS_TONES[product.status]}>
                  {STATUS_LABELS[product.status]}
                </Chip>
                {product.shopify_product_id ? (
                  <Chip tone="success">Shopify #{product.shopify_product_id}</Chip>
                ) : null}
              </div>
              <a
                href={landingPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-brand-600 hover:underline break-all"
              >
                {landingPageUrl}
                <ExternalLink size={11} />
              </a>
            </div>
            {product.failure_reason ? (
              <div className="max-w-xs rounded-md bg-red-50 border border-red-100 px-3 py-2 text-[12px] text-red-700">
                {product.failure_stage ? `${product.failure_stage}: ` : ""}
                {product.failure_reason}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-4">
            <Card className="space-y-3">
              <div className="font-semibold text-fg-primary">
                草稿 / 待审核 · 落地页和文案
              </div>
              <Input
                label="产品标题"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="竞品价格"
                  value={price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, landing_price: e.target.value }))
                  }
                />
                <Input
                  label="竞品色名"
                  value={form.source_color_name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      source_color_name: e.target.value,
                    }))
                  }
                />
              </div>
              <Textarea
                label="变体 / 尺寸"
                rows={3}
                value={form.landing_variants}
                onChange={(e) =>
                  setForm((f) => ({ ...f, landing_variants: e.target.value }))
                }
              />
              <Textarea
                label="产品描述 / 营销页文案"
                rows={6}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
              <Textarea
                label="落地页模块"
                rows={3}
                value={form.landing_sections}
                onChange={(e) =>
                  setForm((f) => ({ ...f, landing_sections: e.target.value }))
                }
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="SEO 标题"
                  value={form.seo_title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, seo_title: e.target.value }))
                  }
                />
                <Input
                  label="SEO 描述"
                  value={form.seo_description}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      seo_description: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={saving}
                  onClick={save}
                >
                  保存编辑
                </Button>
                {isDraft ? (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<Wand2 size={13} />}
                      loading={actionLoading === "optimize"}
                      onClick={() => runAction("optimize")}
                    >
                      AI 优化文案
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      loading={actionLoading === "submit_review"}
                      onClick={() => runAction("submit_review")}
                    >
                      提交待审核
                    </Button>
                  </>
                ) : null}
                {isPendingReview ? (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<ImagePlus size={13} />}
                      loading={actionLoading === "start_render"}
                      onClick={() => runAction("start_render")}
                    >
                      产品审核通过
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      loading={actionLoading === "return_draft"}
                      onClick={() =>
                        runAction("return_draft", form.review_note || "产品信息需继续调整")
                      }
                    >
                      退回草稿
                    </Button>
                  </>
                ) : null}
              </div>
            </Card>

            <div className="space-y-4">
              <Card>
                <div className="font-semibold text-fg-primary mb-3">
                  Shopify 原始信息
                </div>
                <dl className="grid grid-cols-2 gap-2 text-[12px]">
                  <InfoTerm label="来源" value={product.source_platform || "—"} />
                  <InfoTerm label="价格" value={price} />
                  <InfoTerm label="变体数" value={String(rawVariants.length || variants.length || 0)} />
                  <InfoTerm label="创建" value={formatTime(product.created_at)} />
                </dl>
                {rawVariants.length > 0 ? (
                  <div className="mt-3 max-h-36 overflow-auto rounded-md border border-border-subtle">
                    <table className="w-full text-[11px]">
                      <tbody>
                        {rawVariants.slice(0, 8).map((v, i) => (
                          <tr key={i} className="border-b border-border-subtle last:border-0">
                            <td className="px-2 py-1.5">{stringify(v.title) || stringify(v.option2) || "Default"}</td>
                            <td className="px-2 py-1.5 text-right">{stringify(v.price) || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </Card>

              <Card>
                <div className="font-semibold text-fg-primary mb-3">
                  套图审核 · 色彩风格一致性
                </div>
                <Textarea
                  label="色彩风格"
                  rows={2}
                  value={form.style_palette}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, style_palette: e.target.value }))
                  }
                />
                <Textarea
                  label="背景一致性"
                  rows={2}
                  value={form.style_background}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, style_background: e.target.value }))
                  }
                  className="mt-3"
                />
                <Textarea
                  label="审核备注"
                  rows={2}
                  value={form.review_note}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, review_note: e.target.value }))
                  }
                  className="mt-3"
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Palette size={13} />}
                    disabled={!isImageReview}
                    loading={actionLoading === "approve_style"}
                    onClick={() => runAction("approve_style", form.review_note)}
                  >
                    色彩审核通过
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!isImageReview}
                    loading={actionLoading === "approve_renders"}
                    onClick={() => runAction("approve_renders", form.review_note)}
                  >
                    套图审核通过
                  </Button>
                  {isImageReview ? (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={actionLoading === "return_review"}
                      onClick={() =>
                        runAction("return_review", form.review_note || "套图需重新检查")
                      }
                    >
                      退回待审核
                    </Button>
                  ) : null}
                </div>
              </Card>

              <Card>
                <div className="font-semibold text-fg-primary mb-3">
                  准备上架 · 最终确认
                </div>
                <div className="space-y-2">
                  {preflight.map((item) => (
                    <div
                      key={item.label}
                      className={`flex items-start gap-2 text-[12px] ${
                        item.ok ? "text-fg-secondary" : "text-amber-700"
                      }`}
                    >
                      {item.ok ? (
                        <CheckCircle2 size={13} className="mt-0.5 text-green-600" />
                      ) : (
                        <AlertTriangle size={13} className="mt-0.5 text-amber-600" />
                      )}
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px] text-fg-tertiary">
                  只有进入准备上架阶段后，才会显示 Shopify 上传按钮。
                </div>
              </Card>
            </div>
          </div>

          <Card>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="font-semibold text-fg-primary">产品图 / 套图</div>
                <div className="text-[12px] text-fg-tertiary">
                  抓取图 {detail.images.length} 张 · 审核套图 {detail.renders.length} 张
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {isReadyToPublish ? (
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<UploadCloud size={13} />}
                    disabled={!canUpload || !preflightOk}
                    loading={actionLoading === "upload_shopify"}
                    onClick={() => runAction("upload_shopify")}
                  >
                    一键上传 Shopify
                  </Button>
                ) : null}
                {product.status === "failed" ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      loading={actionLoading === "return_draft"}
                      onClick={() =>
                        runAction("return_draft", form.review_note || "失败后退回草稿")
                      }
                    >
                      退回编辑
                    </Button>
                    {product.failure_stage === "upload" ? (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={actionLoading === "upload_shopify"}
                        onClick={() => runAction("upload_shopify")}
                        disabled={!preflightOk}
                      >
                        重试上传
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <Button
                  variant="danger-outline"
                  size="sm"
                  loading={actionLoading === "mark_failed"}
                  onClick={() =>
                    runAction("mark_failed", form.review_note || "人工审核失败")
                  }
                >
                  标记失败
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              {[...detail.renders, ...detail.images].slice(0, 16).map((img, i) => {
                const url = "asset_url" in img ? img.asset_url : null;
                return url ? (
                  <div
                    key={`${"shot_type" in img ? "r" : "i"}-${img.id}`}
                    className="aspect-square rounded-md border border-border-subtle bg-bg-tertiary overflow-hidden"
                    title={"shot_type" in img ? img.shot_type : i === 0 ? "primary" : "source"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : null;
              })}
            </div>
          </Card>

          {message ? (
            <div className="rounded-md bg-bg-tertiary border border-border-subtle px-3 py-2 text-[12px] text-fg-secondary">
              {message}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function InfoTerm({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-tertiary">{label}</dt>
      <dd className="text-fg-primary text-right truncate">{value}</dd>
    </>
  );
}

function buildReviewPayload(form: {
  title: string;
  source_color_name: string;
  description: string;
  seo_title: string;
  seo_description: string;
  landing_price: string;
  landing_variants: string;
  landing_sections: string;
}) {
  return {
    title: form.title,
    source_color_name: form.source_color_name,
    description: form.description,
    seo_title: form.seo_title,
    seo_description: form.seo_description,
    landing_page: {
      price_reference: form.landing_price,
      variants: lines(form.landing_variants),
      sections: lines(form.landing_sections),
    },
  };
}

function buildPublishPreflight(args: {
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  variantCount: number;
  imageCount: number;
  renderCount: number;
  colorApproved: boolean;
}) {
  return [
    { label: "产品标题已确认", ok: args.title.trim().length > 0 },
    { label: "产品描述 / 营销页文案已填写", ok: args.description.trim().length > 0 },
    { label: "SEO 标题和描述已填写", ok: args.seoTitle.trim().length > 0 && args.seoDescription.trim().length > 0 },
    { label: `变体已识别 ${args.variantCount} 个`, ok: args.variantCount > 0 },
    { label: `抓取产品图 ${args.imageCount} 张`, ok: args.imageCount > 0 },
    { label: `审核套图 ${args.renderCount} 张`, ok: args.renderCount > 0 },
    { label: "色彩风格审核已通过", ok: args.colorApproved },
  ];
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

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value ? (value as Record<string, unknown>) : {};
}

function stringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function sourceVariants(source: Record<string, unknown>): string[] {
  const sizes = source.sizes;
  if (Array.isArray(sizes)) return sizes.map(String).filter(Boolean);
  const raw = readRecord(source.raw);
  const variants = raw.variants;
  if (Array.isArray(variants)) {
    return variants
      .map((v) => {
        const r = readRecord(v);
        return stringify(r.title) || stringify(r.option2) || stringify(r.option1);
      })
      .filter(Boolean);
  }
  return [];
}

function sourceRawVariants(source: Record<string, unknown>): Record<string, unknown>[] {
  const direct = source.variants;
  if (Array.isArray(direct)) return direct.map(readRecord);
  const raw = readRecord(source.raw);
  const variants = raw.variants;
  return Array.isArray(variants) ? variants.map(readRecord) : [];
}

function lines(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
