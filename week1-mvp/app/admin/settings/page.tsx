"use client";

import { useEffect, useMemo, useState } from "react";

interface SettingItem {
  key: string;
  value: string;
  hasValue: boolean;
  isSecret: boolean;
  notes: string | null;
}

interface ProviderInfo {
  hasGeminiApiKey: boolean;
  geminiApiKeyMask: string;
  hasOpenaiApiKey?: boolean;
  openaiApiKeyMask?: string;
  openaiProxyUrl?: string;
}

interface CloudStorageInfo {
  uploadUrl: string;
  enabled: boolean;
  timeoutMs: number;
  fileField: string;
}

interface ShopifyInfo {
  hasCredential: boolean;
  shopDomain: string;
  apiVersion: string;
  accessTokenMask: string;
  updatedAt: number | null;
}

// 限流相关 key 的推荐值（仅 Gemini API 直连模式，按 Tier 分档）
// Tier 3 上限：Nano Banana Pro = 2000 RPM，Nano Banana 2 (Flash) = 5000 RPM
// 我们 rate limiter 是单一全局费率，按 Pro（默认主模型）算瓶颈
const RECOMMENDED = {
  gemini_api_tier1: { rate: 10, burst: 10, concurrency: 4 },
  // Tier 2 单站独享：可以打满（500 RPM 上限的 80%）
  gemini_api_tier2: { rate: 60, burst: 60, concurrency: 8 },
  // Tier 2 多站共享：3 站共用同一项目时，每站取约 1/3 RPM 留 buffer 防 429
  gemini_api_tier2_3sites: { rate: 150, burst: 150, concurrency: 12 },
  // Tier 2 单站激进：单站满速版（仅适用于一个 site 用一个 Google 项目）
  gemini_api_tier2_aggressive: { rate: 200, burst: 200, concurrency: 16 },
  // Tier 3 · 3 站共享：每站 500 RPM × 3 = 1500 ≈ 75% of 2000 Pro 上限
  gemini_api_tier3_3sites: { rate: 500, burst: 500, concurrency: 30 },
  // Tier 3 · 3 站满速：每站 600 RPM × 3 = 1800 ≈ 90% of 2000 Pro 上限
  gemini_api_tier3_3sites_aggressive: { rate: 600, burst: 600, concurrency: 40 },
  // Tier 3 · 单站独享：仅当独占整个 Google 项目时用（不推荐多站时用此档）
  gemini_api_tier3_solo: { rate: 1800, burst: 1800, concurrency: 60 },
};

export default function SettingsAdminPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [cloudStorage, setCloudStorage] = useState<CloudStorageInfo | null>(null);
  const [shopify, setShopify] = useState<ShopifyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  // API key 表单
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyTouched, setApiKeyTouched] = useState(false);

  // OpenAI 配置表单
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [openaiKeyTouched, setOpenaiKeyTouched] = useState(false);
  const [openaiProxyInput, setOpenaiProxyInput] = useState("");
  const [openaiProxyTouched, setOpenaiProxyTouched] = useState(false);

  const [cloudStorageInput, setCloudStorageInput] = useState("");
  const [cloudStorageTouched, setCloudStorageTouched] = useState(false);

  const [shopifyForm, setShopifyForm] = useState({
    shop_domain: "",
    access_token: "",
    api_version: "2024-10",
  });
  const [shopifyTouched, setShopifyTouched] = useState(false);

  // 限流/并发表单
  const [rateForm, setRateForm] = useState({
    image_rate_limit_per_min: "10",
    image_rate_burst: "10",
    image_concurrency: "4",
  });

  // 其他可编辑设置
  const [miscForm, setMiscForm] = useState({
    usd_to_cny: "6.83",
    default_budget_cny: "0",
  });

  const settingMap = useMemo(() => {
    const m = new Map<string, SettingItem>();
    settings.forEach((s) => m.set(s.key, s));
    return m;
  }, [settings]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [res, shopifyRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/shopify/credentials"),
      ]);
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const data = await res.json();
      const items: SettingItem[] = data.settings || [];
      setSettings(items);
      setProvider(data.provider || null);
      setCloudStorage(data.cloudStorage || null);

      if (shopifyRes.ok) {
        const shopifyData = await shopifyRes.json();
        const info: ShopifyInfo | null = shopifyData.shopify || null;
        setShopify(info);
        if (info) {
          setShopifyForm({
            shop_domain: info.shopDomain || "",
            access_token: "",
            api_version: info.apiVersion || "2024-10",
          });
        }
      }

      // 用 DB 值初始化表单
      const map = new Map(items.map((s) => [s.key, s.value]));
      setRateForm({
        image_rate_limit_per_min: map.get("image_rate_limit_per_min") ?? "10",
        image_rate_burst: map.get("image_rate_burst") ?? "10",
        image_concurrency: map.get("image_concurrency") ?? "4",
      });
      setMiscForm({
        usd_to_cny: map.get("usd_to_cny") ?? "6.83",
        default_budget_cny: map.get("default_budget_cny") ?? "0",
      });
      // OpenAI 代理 URL 从 settings 表读（key 本身不回显，因为是 secret）
      setOpenaiProxyInput(map.get("openai_proxy_url") ?? "");
      setCloudStorageInput(
        map.get("cloud_storage_upload_url") ||
          data.cloudStorage?.uploadUrl ||
          "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function showSaved(msg: string) {
    setSavedHint(msg);
    setTimeout(() => setSavedHint(null), 5000);
  }

  async function patchSettings(body: Record<string, unknown>, msg: string) {
    setSaving(true);
    setError(null);
    setSavedHint(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const data = await res.json();
      setSettings(data.settings || []);
      setProvider(data.provider || null);
      setCloudStorage(data.cloudStorage || null);
      showSaved(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKeyTouched || !apiKeyInput.trim()) {
      setError("请输入新的 API key");
      return;
    }
    await patchSettings(
      { gemini_api_key: apiKeyInput.trim() },
      "Gemini API key 已保存。",
    );
    setApiKeyInput("");
    setApiKeyTouched(false);
  }

  async function handleClearKey() {
    if (!confirm("确定清空 Gemini API key？清空后所有 Gemini 出图功能会报错。")) return;
    await patchSettings({ gemini_api_key: "" }, "已清空 Gemini API key");
    await load();
  }

  async function handleSaveOpenAI(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (openaiKeyTouched && openaiKeyInput.trim()) {
      body.openai_api_key = openaiKeyInput.trim();
    }
    if (openaiProxyTouched) {
      body.openai_proxy_url = openaiProxyInput.trim();
    }
    if (Object.keys(body).length === 0) {
      setError("没有要保存的修改");
      return;
    }
    await patchSettings(body, "OpenAI 配置已保存。");
    setOpenaiKeyInput("");
    setOpenaiKeyTouched(false);
    setOpenaiProxyTouched(false);
  }

  async function handleSaveCloudStorage(e: React.FormEvent) {
    e.preventDefault();
    const value = cloudStorageInput.trim();
    if (!value) {
      setError("请输入云储存上传接口 URL");
      return;
    }
    await patchSettings(
      { cloud_storage_upload_url: value },
      "云储存接口已保存。生成结果和素材上传会优先使用该服务器。",
    );
    setCloudStorageTouched(false);
  }

  async function handleSaveShopify(e: React.FormEvent) {
    e.preventDefault();
    if (!shopifyForm.shop_domain.trim()) {
      setError("请输入 Shopify 店铺域名");
      return;
    }
    if (!shopifyForm.access_token.trim()) {
      setError("请输入 Shopify Admin API access token 明文");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedHint(null);
    try {
      const res = await fetch("/api/shopify/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shopifyForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setShopify(data.shopify || null);
      setShopifyForm((f) => ({ ...f, access_token: "" }));
      setShopifyTouched(false);
      showSaved("Shopify 上传凭证已保存。产品管理工作台可以执行一键上传。");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleClearOpenaiKey() {
    if (!confirm("确定清空 OpenAI API key？清空后所有 gpt-image-2 出图会报错。")) return;
    await patchSettings({ openai_api_key: "" }, "已清空 OpenAI API key");
    await load();
  }

  async function handleSaveRate(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rateForm)) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) {
        setError(`${k} 必须是 ≥ 1 的整数`);
        return;
      }
      body[k] = String(Math.floor(n));
    }
    await patchSettings(body, "限流/并发已保存，立即生效（无需重启容器）。");
  }

  async function handleSaveMisc(e: React.FormEvent) {
    e.preventDefault();
    await patchSettings(
      { usd_to_cny: miscForm.usd_to_cny, default_budget_cny: miscForm.default_budget_cny },
      "汇率/预算已保存。",
    );
  }

  function applyRecommended(preset: keyof typeof RECOMMENDED) {
    const p = RECOMMENDED[preset];
    setRateForm({
      image_rate_limit_per_min: String(p.rate),
      image_rate_burst: String(p.burst),
      image_concurrency: String(p.concurrency),
    });
  }

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-fg-primary">系统设置</h1>
        <p className="mt-1 text-sm text-fg-tertiary">
          Gemini API key、限流/并发、汇率等全局参数
        </p>
      </header>

      {error && (
        <div className="mb-4 p-3 bg-[var(--danger-bg)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded">
          {error}
        </div>
      )}
      {savedHint && (
        <div className="mb-4 p-3 bg-[var(--success-bg)] border border-green-200 text-success text-sm rounded">
          {savedHint}
        </div>
      )}

      {/* ===== Gemini API Key ===== */}
      <section className="bg-bg-secondary rounded-lg shadow-sm border border-border-subtle p-6 mb-6">
        <h2 className="text-base font-semibold text-fg-primary mb-1">
          Gemini API Key
        </h2>
        <p className="text-xs text-fg-tertiary mb-4">
          所有出图 / 解析功能都通过 Gemini API key 直连 aistudio.google.com。
          <strong>填一次就一直在</strong>，重启容器、重新部署不会丢。
        </p>

        {loading ? (
          <div className="text-sm text-fg-tertiary">加载中…</div>
        ) : (
          <form onSubmit={handleSaveKey} className="space-y-4">
            {provider && (
              <div className="p-3 rounded bg-bg-tertiary border border-border-subtle text-xs text-fg-secondary">
                当前 API Key：
                <span className="ml-1 font-mono font-semibold text-fg-primary break-all">
                  {provider.hasGeminiApiKey
                    ? provider.geminiApiKeyMask
                    : "(未配置 - 调用会失败)"}
                </span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">
                {provider?.hasGeminiApiKey ? "替换 API Key" : "填入 API Key"}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    setApiKeyTouched(true);
                  }}
                  placeholder={
                    provider?.hasGeminiApiKey
                      ? "留空 = 不修改；输入新值 = 替换"
                      : "AIza... (从 https://aistudio.google.com/app/apikey 创建)"
                  }
                  className="flex-1 px-3 py-2 border border-border-default rounded-md text-sm font-mono"
                  autoComplete="off"
                />
                {provider?.hasGeminiApiKey && (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    disabled={saving}
                    className="px-3 py-2 text-xs text-danger border border-[rgba(239,68,68,0.3)] rounded hover:bg-[var(--danger-bg)] disabled:opacity-50"
                  >
                    清空
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-fg-tertiary">
                创建地址：
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 underline"
                >
                  AI Studio API Keys
                </a>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || !apiKeyTouched || !apiKeyInput.trim()}
                className="px-4 py-2 bg-brand-600 text-white text-sm rounded-md hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存 API Key"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ===== OpenAI API Key + 代理 ===== */}
      <section className="bg-bg-secondary rounded-lg shadow-sm border border-border-subtle p-6 mb-6">
        <h2 className="text-base font-semibold text-fg-primary mb-1">
          OpenAI API Key（gpt-image-2）
        </h2>
        <p className="text-xs text-fg-tertiary mb-4">
          gpt-image-2 用于真实感家居场景图 / 软品细节图 / 仿图等。
          <strong>Tier 1 实测限额：5 IPM、月预算 $100。</strong>
          GFW 环境需要配代理（127.0.0.1:7892 之类）。
        </p>

        {loading ? (
          <div className="text-sm text-fg-tertiary">加载中…</div>
        ) : (
          <form onSubmit={handleSaveOpenAI} className="space-y-4">
            {provider && (
              <div className="p-3 rounded bg-bg-tertiary border border-border-subtle text-xs text-fg-secondary">
                当前 API Key：
                <span className="ml-1 font-mono font-semibold text-fg-primary break-all">
                  {provider.hasOpenaiApiKey
                    ? provider.openaiApiKeyMask
                    : "(未配置 - gpt-image-2 不可用)"}
                </span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">
                {provider?.hasOpenaiApiKey ? "替换 OpenAI Key" : "填入 OpenAI Key"}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={openaiKeyInput}
                  onChange={(e) => {
                    setOpenaiKeyInput(e.target.value);
                    setOpenaiKeyTouched(true);
                  }}
                  placeholder={
                    provider?.hasOpenaiApiKey
                      ? "留空 = 不修改；输入新值 = 替换"
                      : "sk-... (从 https://platform.openai.com/api-keys 创建)"
                  }
                  className="flex-1 px-3 py-2 border border-border-default rounded-md text-sm font-mono"
                  autoComplete="off"
                />
                {provider?.hasOpenaiApiKey && (
                  <button
                    type="button"
                    onClick={handleClearOpenaiKey}
                    disabled={saving}
                    className="px-3 py-2 text-xs text-danger border border-[rgba(239,68,68,0.3)] rounded hover:bg-[var(--danger-bg)] disabled:opacity-50"
                  >
                    清空
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-fg-tertiary">
                创建地址：
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 underline"
                >
                  OpenAI API Keys
                </a>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">
                代理 URL（可选）
              </label>
              <input
                type="text"
                value={openaiProxyInput}
                onChange={(e) => {
                  setOpenaiProxyInput(e.target.value);
                  setOpenaiProxyTouched(true);
                }}
                placeholder="例如 http://127.0.0.1:7892（GFW 环境必填）"
                className="w-full px-3 py-2 border border-border-default rounded-md text-sm font-mono"
              />
              <p className="mt-1 text-xs text-fg-tertiary">
                生产 VM 在墙外可留空；从国内本地调用必须填代理。
              </p>
            </div>

            <div>
              <button
                type="submit"
                disabled={
                  saving ||
                  (!openaiKeyTouched && !openaiProxyTouched)
                }
                className="px-4 py-2 bg-brand-600 text-white text-sm rounded-md hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存 OpenAI 配置"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ===== 专属云储存 ===== */}
      <section className="bg-bg-secondary rounded-lg shadow-sm border border-border-subtle p-6 mb-6">
        <h2 className="text-base font-semibold text-fg-primary mb-1">
          专属云储存
        </h2>
        <p className="text-xs text-fg-tertiary mb-4">
          生成结果、素材库上传会优先 POST 到这里。接口无响应或没有返回图片 URL 时，系统会自动保留本地文件，页面不会中断。
        </p>

        {loading ? (
          <div className="text-sm text-fg-tertiary">加载中…</div>
        ) : (
          <form onSubmit={handleSaveCloudStorage} className="space-y-4">
            {cloudStorage && (
              <div className="p-3 rounded bg-bg-tertiary border border-border-subtle text-xs text-fg-secondary">
                当前状态：
                <span className="ml-1 font-semibold text-fg-primary">
                  {cloudStorage.enabled ? "已启用" : "未启用"}
                </span>
                <span className="ml-3 text-fg-tertiary">
                  字段名 {cloudStorage.fileField} · 超时 {cloudStorage.timeoutMs}ms
                </span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">
                上传接口 URL
              </label>
              <input
                type="text"
                value={cloudStorageInput}
                onChange={(e) => {
                  setCloudStorageInput(e.target.value);
                  setCloudStorageTouched(true);
                }}
                placeholder="http://你的服务器IP:8082/upload-image"
                className="w-full px-3 py-2 border border-border-default rounded-md text-sm font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !cloudStorageTouched}
              className="px-4 py-2 bg-brand-600 text-white text-sm rounded-md hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存云储存接口"}
            </button>
          </form>
        )}
      </section>

      {/* ===== Shopify 上传 ===== */}
      <section className="bg-bg-secondary rounded-lg shadow-sm border border-border-subtle p-6 mb-6">
        <h2 className="text-base font-semibold text-fg-primary mb-1">
          Shopify 一键上架
        </h2>
        <p className="text-xs text-fg-tertiary mb-4">
          产品管理工作台会使用这里的 Admin API token 创建商品、变体、图片和落地页 metafield。
          浏览器登录 Shopify 只能用于人工确认，真正上传需要这个 token。
        </p>

        {loading ? (
          <div className="text-sm text-fg-tertiary">加载中…</div>
        ) : (
          <form onSubmit={handleSaveShopify} className="space-y-4">
            <div className="p-3 rounded bg-bg-tertiary border border-border-subtle text-xs text-fg-secondary">
              当前状态：
              <span className="ml-1 font-semibold text-fg-primary">
                {shopify?.hasCredential ? "已配置" : "未配置"}
              </span>
              {shopify?.hasCredential ? (
                <>
                  <span className="ml-3 font-mono text-fg-primary">
                    {shopify.shopDomain}
                  </span>
                  <span className="ml-3 font-mono text-fg-tertiary">
                    {shopify.accessTokenMask}
                  </span>
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">
                  店铺域名
                </label>
                <input
                  type="text"
                  value={shopifyForm.shop_domain}
                  onChange={(e) => {
                    setShopifyForm({ ...shopifyForm, shop_domain: e.target.value });
                    setShopifyTouched(true);
                  }}
                  placeholder="peterhanun.myshopify.com"
                  className="w-full px-3 py-2 border border-border-default rounded-md text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">
                  API 版本
                </label>
                <input
                  type="text"
                  value={shopifyForm.api_version}
                  onChange={(e) => {
                    setShopifyForm({ ...shopifyForm, api_version: e.target.value });
                    setShopifyTouched(true);
                  }}
                  placeholder="2024-10"
                  className="w-full px-3 py-2 border border-border-default rounded-md text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">
                Admin API access token
              </label>
              <input
                type="password"
                value={shopifyForm.access_token}
                onChange={(e) => {
                  setShopifyForm({ ...shopifyForm, access_token: e.target.value });
                  setShopifyTouched(true);
                }}
                placeholder={
                  shopify?.hasCredential
                    ? "留空 = 不修改；输入新 token = 替换"
                    : "从 Shopify Admin App 复制 Admin API access token"
                }
                className="w-full px-3 py-2 border border-border-default rounded-md text-sm font-mono"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-fg-tertiary">
                需要权限：write_products、read_products、write_files/read_files（如店铺应用支持）。
              </p>
            </div>

            <button
              type="submit"
              disabled={
                saving ||
                !shopifyTouched ||
                !shopifyForm.shop_domain.trim() ||
                !shopifyForm.access_token.trim()
              }
              className="px-4 py-2 bg-brand-600 text-white text-sm rounded-md hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存 Shopify 上传凭证"}
            </button>
          </form>
        )}
      </section>

      {/* ===== 限流 / 并发 ===== */}
      <section className="bg-bg-secondary rounded-lg shadow-sm border border-border-subtle p-6 mb-6">
        <h2 className="text-base font-semibold text-fg-primary mb-1">
          图像生成 · 限流 / 并发
        </h2>
        <p className="text-xs text-fg-tertiary mb-4">
          控制 image_gen 模型的吞吐。RPM = 每分钟最多请求数；burst =
          token bucket 容量；concurrency = 单 job 内并发执行的 item 数。
          <strong>修改后立即生效，无需重启。</strong>
        </p>

        {/* 推荐快速填值 */}
        <div className="mb-4">
          <div className="text-xs text-fg-tertiary mb-2">一键应用推荐：</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyRecommended("gemini_api_tier1")}
              className="px-2.5 py-1 text-xs border border-[rgba(59,130,246,0.4)] rounded text-brand-400 hover:bg-[var(--brand-50-bg)]"
              title="Tier 1 默认配额（绑信用卡即解锁）"
            >
              Tier 1 (10 / 4)
            </button>
            <button
              type="button"
              onClick={() => applyRecommended("gemini_api_tier2")}
              className="px-2.5 py-1 text-xs border border-[rgba(139,92,246,0.4)] rounded text-[#a78bfa] hover:bg-[rgba(139,92,246,0.1)]"
              title="Tier 2 保守值（单站独享一个项目时用）"
            >
              Tier 2 保守 (60 / 8)
            </button>
            <button
              type="button"
              onClick={() => applyRecommended("gemini_api_tier2_3sites")}
              className="px-2.5 py-1 text-xs border border-[rgba(245,158,11,0.4)] rounded text-warn hover:bg-[var(--warn-bg)]"
              title="3 个站共享同一个 Google 项目时推荐：每站 150 RPM × 3 ≤ 500 上限，永不 429"
            >
              ⭐ Tier 2 · 3 站共享 (150 / 12)
            </button>
            <button
              type="button"
              onClick={() => applyRecommended("gemini_api_tier2_aggressive")}
              className="px-2.5 py-1 text-xs border border-[rgba(239,68,68,0.4)] rounded text-danger hover:bg-[var(--danger-bg)]"
              title="单站独享 + 满速：占 500 上限的 40%，仍留余量。仅当确认本站独占整个 Google 项目时使用"
            >
              Tier 2 · 单站满速 (200 / 16)
            </button>
            <button
              type="button"
              onClick={() => applyRecommended("gemini_api_tier3_3sites")}
              className="px-2.5 py-1 text-xs border border-[rgba(34,197,94,0.4)] rounded text-success hover:bg-[var(--success-bg)]"
              title="Tier 3 · 3 站共享（推荐）：每站 500 RPM × 3 = 1500 ≈ 75% of 2000 Pro 上限"
            >
              🚀 Tier 3 · 3 站共享 (500 / 30)
            </button>
            <button
              type="button"
              onClick={() => applyRecommended("gemini_api_tier3_3sites_aggressive")}
              className="px-2.5 py-1 text-xs border border-[rgba(34,197,94,0.4)] rounded text-success hover:bg-[var(--success-bg)]"
              title="Tier 3 · 3 站满速：每站 600 RPM × 3 = 1800 ≈ 90% of 2000 Pro 上限（接近极限，偶尔可能 429）"
            >
              Tier 3 · 3 站满速 (600 / 40)
            </button>
            <button
              type="button"
              onClick={() => applyRecommended("gemini_api_tier3_solo")}
              className="px-2.5 py-1 text-xs border border-[rgba(34,197,94,0.4)] rounded text-success hover:bg-[var(--success-bg)]"
              title="Tier 3 · 单站独享：1800 RPM ≈ 90% of 2000 Pro 上限。仅当本站独占整个 Google 项目时使用"
            >
              Tier 3 · 单站独享 (1800 / 60)
            </button>
          </div>
          <p className="mt-2 text-[10px] text-fg-muted leading-relaxed">
            说明：rate limits 是<strong className="text-fg-secondary"> 按 Google 项目 </strong>
            算的，不是按 API key。多个站点用同项目的多 key = 共享同一份配额。
          </p>
        </div>

        <form onSubmit={handleSaveRate} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-fg-secondary mb-1">
                每分钟请求数 (RPM)
              </label>
              <input
                type="number"
                min={1}
                max={5000}
                value={rateForm.image_rate_limit_per_min}
                onChange={(e) =>
                  setRateForm({
                    ...rateForm,
                    image_rate_limit_per_min: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-border-default rounded text-sm"
              />
              <div className="text-[10px] text-fg-tertiary mt-0.5">
                {settingMap.get("image_rate_limit_per_min")?.notes}
              </div>
            </div>
            <div>
              <label className="block text-xs text-fg-secondary mb-1">
                突发上限 (burst)
              </label>
              <input
                type="number"
                min={1}
                max={5000}
                value={rateForm.image_rate_burst}
                onChange={(e) =>
                  setRateForm({ ...rateForm, image_rate_burst: e.target.value })
                }
                className="w-full px-3 py-2 border border-border-default rounded text-sm"
              />
              <div className="text-[10px] text-fg-tertiary mt-0.5">
                {settingMap.get("image_rate_burst")?.notes}
              </div>
            </div>
            <div>
              <label className="block text-xs text-fg-secondary mb-1">
                并发数 (concurrency)
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={rateForm.image_concurrency}
                onChange={(e) =>
                  setRateForm({
                    ...rateForm,
                    image_concurrency: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-border-default rounded text-sm"
              />
              <div className="text-[10px] text-fg-tertiary mt-0.5">
                {settingMap.get("image_concurrency")?.notes}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-brand-600 text-white text-sm rounded-md hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存限流"}
          </button>
        </form>
      </section>

      {/* ===== 汇率 / 预算 ===== */}
      <section className="bg-bg-secondary rounded-lg shadow-sm border border-border-subtle p-6">
        <h2 className="text-base font-semibold text-fg-primary mb-1">
          汇率 / 预算
        </h2>
        <p className="text-xs text-fg-tertiary mb-4">
          账单换算与新用户默认预算。
        </p>

        <form onSubmit={handleSaveMisc} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-fg-secondary mb-1">
                美元兑人民币汇率
              </label>
              <input
                type="number"
                step="0.01"
                value={miscForm.usd_to_cny}
                onChange={(e) =>
                  setMiscForm({ ...miscForm, usd_to_cny: e.target.value })
                }
                className="w-full px-3 py-2 border border-border-default rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-fg-secondary mb-1">
                新用户默认月度预算 (CNY，0 = 无限)
              </label>
              <input
                type="number"
                step="1"
                min={0}
                value={miscForm.default_budget_cny}
                onChange={(e) =>
                  setMiscForm({
                    ...miscForm,
                    default_budget_cny: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-border-default rounded text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-brand-600 text-white text-sm rounded-md hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </form>
      </section>
    </main>
  );
}
