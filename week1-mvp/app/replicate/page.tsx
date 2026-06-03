"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Upload, X, Sparkles, Loader2, Plus, Minus, Zap, ChevronDown, ChevronUp, Check, Info } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useJobPolling } from "@/lib/hooks/use-job-polling";
import { Dropzone } from "@/app/_components/ui";
import { TaskViewport } from "@/app/_components/task-viewport";

type RefInfo = {
  person_count: number;
  persons: Array<{ position: string; pose: string }>;
  scene: string;
  lighting: string;
  composition: string;
  overall: string;
};

type LocalFile = { id: string; file: File; url: string };

const ASPECT_RATIOS = [
  { value: "3:4", label: "3:4 竖（推荐）" },
  { value: "9:16", label: "9:16 竖手机" },
  { value: "1:1", label: "1:1 方" },
  { value: "16:9", label: "16:9 横" },
  { value: "4:3", label: "4:3 横" },
];

// 氛围 / 表情 / 人物互动（单选；全部图统一用一种）
const MOODS = [
  { value: "none", label: "不控制（模型自由发挥）" },
  { value: "as_reference", label: "按照原图（氛围一致）" },
  { value: "cheerful", label: "欢快交谈大笑" },
  { value: "intimate", label: "亲密互动" },
  { value: "gentle", label: "温柔安静" },
  { value: "editorial_cold", label: "高级冷感" },
];

export default function ReplicatePage() {
  const user = useCurrentUser();

  const [refFile, setRefFile] = useState<LocalFile | null>(null);
  const [refInfo, setRefInfo] = useState<RefInfo | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);

  const [products, setProducts] = useState<LocalFile[]>([]);
  const [baseCount, setBaseCount] = useState(1);
  const [variantCount, setVariantCount] = useState(2);
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("2K");
  const [mood, setMood] = useState("none");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [userHint, setUserHint] = useState("");

  const [models, setModels] = useState<Array<{ model_id: string; label: string; badge?: string | null }>>([]);
  const [modelId, setModelId] = useState("gemini-3-pro-image-preview");

  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlsRef = useRef<Map<string, string>>(new Map());
  useEffect(() => () => { for (const u of urlsRef.current.values()) URL.revokeObjectURL(u); }, []);

  useEffect(() => {
    fetch("/api/ai-models?category=image_gen")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ model_id: string; label: string; badge?: string | null; is_default?: 0 | 1 }>) => {
        setModels(data);
        const def = data.find((m) => m.is_default === 1) || data[0];
        if (def) setModelId(def.model_id);
      })
      .catch(() => {});
  }, []);

  function mkLocal(f: File): LocalFile {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const url = URL.createObjectURL(f);
    urlsRef.current.set(id, url);
    return { id, file: f, url };
  }

  // 上传参考图 → 自动分析
  async function onPickReference(files: FileList | File[] | null) {
    if (!files) return;
    const arr = files instanceof FileList ? Array.from(files) : files;
    const img = arr.find((f) => f.type.startsWith("image/"));
    if (!img) return;
    const lf = mkLocal(img);
    setRefFile(lf);
    setRefInfo(null);
    setAnalyzeErr(null);
    setError(null);
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("reference", img, img.name);
      const res = await fetch("/api/replicate/analyze", { method: "POST", body: fd });
      const raw = await res.text();
      let body: Record<string, unknown> = {};
      try { if (raw) body = JSON.parse(raw); } catch {
        throw new Error(res.status === 413 ? "参考图太大被服务器拒绝（限 200MB）" : `分析失败（${res.status}）`);
      }
      if (!res.ok) throw new Error(String(body.error || res.statusText));
      const info = body as unknown as RefInfo;
      setRefInfo(info);
      // 按检测人数预留产品槽位（不自动填图，提示用户上传）
    } catch (e) {
      setAnalyzeErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  function onPickProducts(files: FileList | File[] | null) {
    if (!files) return;
    const arr = files instanceof FileList ? Array.from(files) : files;
    const add = arr.filter((f) => f.type.startsWith("image/")).map(mkLocal);
    setProducts((prev) => [...prev, ...add]);
    setError(null);
  }
  function removeProduct(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    const u = urlsRef.current.get(id);
    if (u) { URL.revokeObjectURL(u); urlsRef.current.delete(id); }
  }

  const personCount = refInfo?.person_count ?? 0;
  const totalCount = baseCount + variantCount;
  const estCostCny = totalCount * 1.7;
  const productMismatch = personCount > 0 && products.length !== personCount;

  const canSubmit =
    !submitting && !!refFile && !analyzing && products.length > 0 && totalCount > 0 && !activeJobId;

  async function handleSubmit() {
    if (!canSubmit || !refFile) return;
    if (productMismatch) {
      const ok = confirm(
        `参考图检测到 ${personCount} 人，但你上传了 ${products.length} 张产品图。数量不一致可能串位，确认继续？`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("reference", refFile.file, refFile.file.name);
      products.forEach((p, i) => fd.append(`product_image_${i}`, p.file, p.file.name));
      if (refInfo) fd.append("ref_info", JSON.stringify(refInfo));
      fd.append("base_count", String(baseCount));
      fd.append("variant_count", String(variantCount));
      fd.append("aspect_ratio", aspectRatio);
      fd.append("image_size", imageSize);
      fd.append("mood", mood);
      fd.append("model", modelId);
      if (userHint.trim()) fd.append("user_hint", userHint.trim());

      const res = await fetch("/api/replicate", { method: "POST", body: fd });
      const raw = await res.text();
      let body: { job_id?: string; error?: string } = {};
      try { if (raw) body = JSON.parse(raw); } catch {
        if (res.status === 413) throw new Error("上传内容超过服务器限制（200MB），请压缩或减少图片。");
        throw new Error(`服务器返回异常（${res.status} ${res.statusText}）：${raw.slice(0, 200) || "(空响应)"}`);
      }
      if (!res.ok || !body.job_id) throw new Error(body.error || res.statusText || `HTTP ${res.status}`);
      setActiveJobId(body.job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const polled = useJobPolling(activeJobId, { onFinished: () => {} });

  if (!user) return null;

  if (activeJobId && polled.data) {
    return (
      <TaskViewport
        job={polled.data.job}
        items={polled.data.items}
        nextTokenReadyAtMs={polled.data.next_token_ready_at_ms}
        serverTimeMs={polled.data.server_time_ms}
        onBackToForm={() => setActiveJobId(null)}
        onStartNew={() => setActiveJobId(null)}
        zipPrefix="replicate"
      />
    );
  }

  return (
    <main className="px-6 py-8 space-y-6 max-w-[1500px] mx-auto">
      {/* Header billboard */}
      <div className="bg-gradient-to-r from-[#fbedca] via-white to-white border border-[#dcdfd2] p-6 rounded-[12px] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-2xl font-display text-[#23251d] flex items-center gap-2">
            <Copy size={20} className="text-[#b17816]" strokeWidth={2.2} />
            姿态与构图智能仿图
            <span className="text-xs font-semibold bg-[#fbe9bd] text-[#793400] border border-[#f3d27a] px-2.5 py-0.5 rounded-md font-mono">姿态骨骼克隆</span>
          </h2>
          <p className="text-xs text-[#6c6e63] leading-relaxed max-w-2xl">
            上传一张参考大片 → 自动解析人数 / 姿势 / 场景 / 光线 → 用我方模特 + 服装完美替换主体，复刻同款构图，再随机出几张变体。
          </p>
        </div>
        <button type="button" onClick={() => setShowHelp((v) => !v)}
          className="shrink-0 px-3.5 py-1.5 rounded-[8px] bg-[#fdf3da] border border-[#f3d27a] text-[#793400] hover:bg-[#fbe9bd] font-bold text-xs flex items-center gap-1.5 transition-all">
          <Info className="w-3.5 h-3.5" /> 使用说明
        </button>
      </div>

      {showHelp && (
        <div className="p-4 rounded-[10px] bg-[#fdf3da] border border-[#f3d27a] flex items-start gap-3">
          <Info size={18} className="text-[#b17816] shrink-0 mt-0.5" />
          <div className="flex-1 text-xs leading-relaxed space-y-1 text-[#4d4f46]">
            <div className="font-bold text-[13px] text-[#23251d]">仿图 · 使用说明</div>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>参考图</strong>：上传你想复刻"摆法/构图/场景/光线"的那张大片，系统自动识别人数。</li>
              <li><strong>产品图</strong>：按参考图人数、从左到右上传我方产品图（每张含一个模特+服装），与参考图人物一一对应。</li>
              <li><strong>复刻张数</strong>严格还原参考图姿势；<strong>变体张数</strong>在同场景下做杂志大片式扰动。</li>
              <li><strong>氛围</strong>只改表情和人物互动，不动场景/构图/模特身份和服装。</li>
            </ul>
          </div>
          <button onClick={() => setShowHelp(false)} className="shrink-0 text-[11px] bg-white text-[#793400] hover:text-[#23251d] px-2.5 py-1 rounded-md border border-[#f3d27a] font-medium">隐藏</button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-[#f7d6d3] border border-[#e0a6a2] text-[#cd4239] text-sm rounded-[10px]">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_390px] gap-6 items-start">
        {/* ════ 中：参考图 + 产品图 ════ */}
        <div className="space-y-6 min-w-0">

          {/* ① 参考图 */}
          <div className="bg-white border border-[#dcdfd2] rounded-[10px] p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-6 h-6 rounded-[6px] bg-[#f7a501] text-[#23251d] flex items-center justify-center font-mono text-xs font-bold border border-[#dd9001]">1</div>
              <h3 className="text-sm font-bold text-[#23251d]">姿势 / 构图参考图</h3>
            </div>
            {!refFile ? (
              <Dropzone
                accept="image/*"
                onFiles={onPickReference}
                icon={<Upload size={24} strokeWidth={1.6} className="text-[#b17816]" />}
                title="拖拽 / 点击 / Ctrl+V 粘贴参考图"
                description="PNG / JPG / WebP · 限 20MB · 上传后自动分析"
              />
            ) : (
              <div className="flex items-start gap-4">
                <div className="relative group w-40 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={refFile.url} alt="reference" className="w-full rounded-[8px] border border-[#dcdfd2]" />
                  <button onClick={() => { setRefFile(null); setRefInfo(null); }} className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md bg-white/90 border border-[#dcdfd2] text-[#6c6e63] hover:text-[#cd4239] flex items-center justify-center">
                    <X size={12} />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  {analyzing && (
                    <div className="text-[12px] text-[#6c6e63] inline-flex items-center gap-1.5">
                      <Loader2 size={13} className="animate-spin text-[#b17816]" /> 正在分析参考图…
                    </div>
                  )}
                  {analyzeErr && <div className="text-[12px] text-[#cd4239]">分析失败：{analyzeErr}</div>}
                  {refInfo && (
                    <div className="text-[11px] text-[#4d4f46] bg-[#f6f5f4] rounded-[8px] p-3 space-y-1.5 border border-[#dcdfd2]">
                      <div className="flex items-center gap-1.5 font-bold text-[#23251d]">
                        <Check size={13} className="text-[#2c8c66]" /> 检测到 <span className="text-[#b17816] text-sm font-mono">{refInfo.person_count}</span> 人
                      </div>
                      <div><span className="text-[#9b9c92]">场景：</span>{refInfo.scene}</div>
                      <div><span className="text-[#9b9c92]">光线：</span>{refInfo.lighting}</div>
                      <div><span className="text-[#9b9c92]">构图：</span>{refInfo.composition}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ② 我方产品图 */}
          <div className="bg-white border border-[#dcdfd2] rounded-[10px] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-[6px] bg-[#f7a501] text-[#23251d] flex items-center justify-center font-mono text-xs font-bold border border-[#dd9001]">2</div>
                <h3 className="text-sm font-bold text-[#23251d]">我方产品图 <span className="text-xs text-[#9b9c92] font-normal">({products.length}{personCount > 0 ? ` / 需 ${personCount}` : ""})</span></h3>
              </div>
            </div>
            {personCount > 0 && (
              <div className="mb-3 p-2.5 rounded-[8px] text-[11px] bg-[#fdf3da] border border-[#f3d27a] text-[#793400]">
                参考图是 {personCount} 人合影。请按"从左到右"上传 {personCount} 张产品图（第 1 张 = 最左边的人）。
              </div>
            )}
            <div className="grid grid-cols-4 gap-3">
              {products.map((p, i) => (
                <div key={p.id} className="group relative aspect-[3/4] rounded-[8px] overflow-hidden border border-[#dcdfd2] bg-[#faf9f6]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-[#23251d] text-white rounded">第 {i + 1}</div>
                  <button onClick={() => removeProduct(p.id)} className="absolute top-2 right-2 w-5 h-5 rounded-md bg-white/90 border border-[#dcdfd2] text-[#6c6e63] hover:text-[#cd4239] flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <Dropzone
                compact
                accept="image/*"
                multiple
                onFiles={onPickProducts}
                className="aspect-[3/4] !rounded-[8px]"
              >
                <div className="h-full flex flex-col items-center justify-center text-[10px] text-[#9b9c92] gap-1">
                  <Plus className="w-5 h-5" /> 上传
                </div>
              </Dropzone>
            </div>
            {productMismatch && (
              <div className="mt-3 text-[11px] text-[#793400] bg-[#fef7d6] border border-[#f3d27a] rounded-[8px] px-2.5 py-1.5">⚠️ 数量与参考图人数（{personCount}）不一致，可能串位</div>
            )}
          </div>
        </div>

        {/* ════ 右：控制面板 ════ */}
        <aside className="lg:sticky lg:top-6 space-y-4">
          <div className="bg-white border border-[#dcdfd2] rounded-[10px] p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#e5e7e0]">
              <div className="w-5 h-5 rounded-[5px] bg-[#f7a501] text-[#23251d] flex items-center justify-center font-mono text-[10px] font-bold border border-[#dd9001]">3</div>
              <h3 className="text-xs font-bold text-[#23251d] uppercase tracking-wide">输出参数设定</h3>
            </div>
            <div className="space-y-4">
              {/* 张数 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-[#9b9c92] uppercase tracking-widest mb-1.5 font-mono">严格复刻</label>
                  <div className="flex items-center border border-[#dcdfd2] rounded-[6px] bg-white overflow-hidden">
                    <button onClick={() => setBaseCount(Math.max(0, baseCount - 1))} className="px-2.5 py-1.5 text-[#6c6e63] hover:bg-[#f6f5f4]"><Minus className="w-3 h-3" /></button>
                    <span className="flex-1 text-center text-xs font-mono font-bold text-[#23251d]">{baseCount}</span>
                    <button onClick={() => setBaseCount(Math.min(3, baseCount + 1))} className="px-2.5 py-1.5 text-[#6c6e63] hover:bg-[#f6f5f4]"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#9b9c92] uppercase tracking-widest mb-1.5 font-mono">变体张数</label>
                  <div className="flex items-center border border-[#dcdfd2] rounded-[6px] bg-white overflow-hidden">
                    <button onClick={() => setVariantCount(Math.max(0, variantCount - 1))} className="px-2.5 py-1.5 text-[#6c6e63] hover:bg-[#f6f5f4]"><Minus className="w-3 h-3" /></button>
                    <span className="flex-1 text-center text-xs font-mono font-bold text-[#23251d]">{variantCount}</span>
                    <button onClick={() => setVariantCount(Math.min(8, variantCount + 1))} className="px-2.5 py-1.5 text-[#6c6e63] hover:bg-[#f6f5f4]"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>

              {/* 氛围 */}
              <div>
                <label className="block text-[10px] font-bold text-[#9b9c92] uppercase tracking-widest mb-1.5 font-mono">氛围 / 表情 / 人物互动</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {MOODS.map((m) => {
                    const on = mood === m.value;
                    return (
                      <button key={m.value} type="button" onClick={() => setMood(m.value)}
                        className={"px-2 py-1.5 rounded-[6px] border text-[10px] text-left transition-all " + (on ? "border-[#f7a501] bg-[#fbedca] text-[#23251d] font-bold ring-2 ring-[#fbedca]" : "border-[#dcdfd2] bg-[#faf9f6] text-[#6c6e63] hover:border-[#f3c14e]")}>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                {mood !== "none" && <p className="text-[10px] text-[#9b9c92] mt-1.5">只调表情和互动，不动场景 / 构图 / 模特身份和服装</p>}
              </div>

              {/* 画质 */}
              <div>
                <label className="block text-[10px] font-bold text-[#9b9c92] uppercase tracking-widest mb-1.5 font-mono">出图品质</label>
                <div className="flex bg-[#e5e7e0] p-1 rounded-[6px]">
                  {(["1K","2K","4K"] as const).map((r) => (
                    <button key={r} type="button" onClick={() => setImageSize(r)}
                      className={"flex-1 py-1.5 text-center text-[11px] font-bold rounded-[5px] transition-all " + (imageSize === r ? "bg-[#f7a501] text-[#23251d] shadow-sm" : "text-[#6c6e63] hover:text-[#23251d]")}>
                      {r}{r === "2K" && <span className="text-[8px] font-normal font-mono ml-0.5">荐</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* 比例 */}
              <div>
                <label className="block text-[10px] font-bold text-[#9b9c92] uppercase tracking-widest mb-1.5 font-mono">画面比例</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {ASPECT_RATIOS.map((a) => (
                    <button key={a.value} type="button" onClick={() => setAspectRatio(a.value)} title={a.label}
                      className={"h-10 flex items-center justify-center rounded-[6px] border text-[10px] font-mono font-bold transition-all " + (aspectRatio === a.value ? "border-[#f7a501] bg-[#fbedca] text-[#23251d] ring-2 ring-[#fbedca]" : "border-[#dcdfd2] bg-[#faf9f6] text-[#6c6e63] hover:bg-[#f1f0ea]")}>
                      {a.value}
                    </button>
                  ))}
                </div>
              </div>

              {/* 模型 */}
              <div>
                <label className="block text-[10px] font-bold text-[#9b9c92] uppercase tracking-widest mb-1.5 font-mono">渲染大模型</label>
                <div className="relative">
                  <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="w-full bg-[#faf9f6] hover:bg-white border border-[#dcdfd2] focus:border-[#f7a501] text-[#23251d] text-[11px] rounded-[6px] px-2.5 py-2 outline-none appearance-none cursor-pointer">
                    {models.length === 0 ? (<option value="gemini-3-pro-image-preview">Nano Banana Pro</option>) : (models.map((m) => <option key={m.model_id} value={m.model_id}>{m.label}{m.badge ? ` · ${m.badge}` : ""}</option>))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#9b9c92] absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* 高级 */}
              <div className="border-t border-[#e5e7e0] pt-3">
                <button type="button" onClick={() => setIsAdvancedOpen((v) => !v)} className="w-full flex items-center justify-between py-1 text-[#9b9c92] hover:text-[#4d4f46] font-semibold text-[10px] font-mono">
                  <span>高级 · 额外提示词</span>
                  {isAdvancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {isAdvancedOpen && (
                  <div className="mt-2.5 p-3 rounded-[6px] bg-[#f6f5f4] border border-[#dcdfd2]">
                    <textarea value={userHint} onChange={(e) => setUserHint(e.target.value.slice(0, 200))} rows={2} placeholder="例如：暖色调，胶片颗粒" className="w-full bg-white border border-[#dcdfd2] text-[#23251d] text-[11px] rounded-[5px] px-2 py-1.5 outline-none focus:border-[#f7a501] resize-none" />
                    <div className="text-[10px] text-[#9b9c92] mt-1 text-right font-mono">{userHint.length}/200</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 出图预估 */}
          <div className="bg-white border border-[#dcdfd2] rounded-[10px] p-6 shadow-md">
            <h3 className="text-xs font-bold text-[#6c6e63] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-[#b17816]" /> 出图预估
            </h3>
            <div className="bg-gradient-to-br from-[#fbedca]/70 via-[#fbedca]/20 to-transparent rounded-[8px] p-4 border border-[#f0d9a0] mb-5 relative overflow-hidden">
              <div className="absolute right-3 bottom-0 text-[#bfc1b7]/40 font-extrabold text-7xl select-none leading-none">Σ</div>
              <p className="text-[11px] text-[#6c6e63] font-medium relative">预计出图</p>
              <p className="text-4xl font-extrabold text-[#23251d] mt-2 font-mono tracking-tight relative flex items-baseline gap-1">{totalCount} <span className="text-xs text-[#6c6e63] font-normal">张图</span></p>
              <p className="text-[10px] text-[#9b9c92] mt-2 font-mono relative">复刻 {baseCount} + 变体 {variantCount}</p>
            </div>
            <div className="space-y-3 mb-5 text-xs text-[#4d4f46]">
              <div className="flex justify-between items-center bg-[#f6f5f4] p-2.5 rounded-[6px] border border-[#e5e7e0]"><span className="text-[#6c6e63]">参考图:</span><span className="font-mono font-bold text-[#23251d]">{refFile ? "已上传" : "未上传"}</span></div>
              <div className="flex justify-between items-center bg-[#f6f5f4] p-2.5 rounded-[6px] border border-[#e5e7e0]"><span className="text-[#6c6e63]">产品图:</span><span className="font-mono font-bold text-[#23251d]">{products.length} 张</span></div>
              <div className="border-t border-[#e5e7e0] pt-3 flex justify-between items-baseline"><span className="font-semibold text-[#4d4f46]">预计费用 (CNY):</span><span className="text-lg font-bold text-[#b17816] font-mono">¥{estCostCny.toFixed(2)}</span></div>
            </div>
            <button onClick={handleSubmit} disabled={!canSubmit}
              className={"w-full py-3.5 rounded-[8px] text-xs font-bold transition-all flex items-center justify-center gap-2 " + (!canSubmit ? "bg-[#e5e7e0] text-[#9b9c92] cursor-not-allowed" : "bg-[#f7a501] hover:bg-[#dd9001] text-[#23251d] shadow-[0_4px_12px_rgba(247,165,1,0.3)] hover:scale-[1.01] active:scale-[0.99]")}>
              {submitting ? (<><span className="w-3.5 h-3.5 border-2 border-[#23251d] border-t-transparent rounded-full animate-spin" /> 提交中…</>) : (<><Sparkles className="w-4 h-4 spin-slow" /> 开始仿图 ({totalCount}张)</>)}
            </button>
            {!canSubmit && !submitting && !activeJobId && (
              <p className="text-[11px] text-[#9b9c92] text-center mt-2.5 font-mono">{!refFile ? "请先上传参考图" : products.length === 0 ? "请上传产品图" : "本月余额充足 · 后台运行"}</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
