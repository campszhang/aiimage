"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  Upload,
  X,
  PenLine,
  Image as ImageIcon,
  ZoomIn,
  Layers,
  Calculator,
  SlidersHorizontal,
  Shirt,
  Check,
  ChevronUp,
  Info,
  Plus,
  Minus,
  ChevronDown,
  Zap,
  Camera,
} from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useJobPolling } from "@/lib/hooks/use-job-polling";
import { Dropzone, CollapsibleSection, SegmentedControl } from "@/app/_components/ui";
import { TaskViewport } from "@/app/_components/task-viewport";
import {
  TEXT_SCENE_PRESETS as STATIC_PRESETS,
  type TextScenePreset,
} from "@/lib/text-scene-presets";
import { CLOSEUP_PRESETS } from "@/lib/scene-tools-prompt";

// 客户端不直接 import server-only 的 type；用 string literal union 防 ts boundary 报错
type CloseupKey =
  | "back"
  | "side_waist"
  | "chest_to_thigh"
  | "lower_body_motion"
  | "neckline_shoulder";
type FocusMode = "model_first" | "balanced" | "environmental";

type MaterialRow = {
  id: number;
  name: string;
  english_name: string | null;
  description: string | null;
};

/* ─────────────────────────────────────────────────────────
 *  类型
 * ───────────────────────────────────────────────────────── */

type Scene = {
  id: number;
  name: string;
  image_url: string;
  category: string | null;
  category_label: string | null;
  tags: string | null;
};

type ProductFile = {
  id: string;
  file: File;
  url: string; // local preview
  // v6: 该产品的背部参考图（可选）
  backFile?: File;
  backUrl?: string;
};

// 单场景输出 = count（常规变体）+ closeup_presets.length（特写多选）
// 总输出 = N 产品图 × Σ(单场景输出)
// 常规变体由 prompt 自动加镜头预设循环；特写各自固定镜头
type SceneEntry =
  | {
      id: string;
      type: "text";
      text: string;
      count: number;
      closeup_presets: CloseupKey[];
    }
  | {
      id: string;
      type: "image";
      scene_id: number;
      scene_name: string;
      count: number;
      closeup_presets: CloseupKey[];
    };

const FOCUS_MODES: Array<{ value: FocusMode; label: string; hint: string }> = [
  { value: "model_first", label: "🎯 产品主体", hint: "占比 70-80%（默认）" },
  { value: "balanced", label: "⚖️ 场景平衡", hint: "占比 50-60%" },
  { value: "environmental", label: "🏛️ 环境氛围", hint: "占比 30-40%" },
];

const ASPECT_RATIOS = [
  { value: "3:4", label: "3:4 竖（推荐）" },
  { value: "9:16", label: "9:16 竖手机" },
  { value: "1:1", label: "1:1 方" },
  { value: "16:9", label: "16:9 横" },
  { value: "4:3", label: "4:3 横" },
];

// 文字场景预设已搬到 lib/text-scene-presets.ts，跟 batch-photo 共享。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _LEGACY_DROP_TEXT_SCENE_PRESETS: Array<{ name: string; text: string }> = [
  {
    name: "粉墙金桌 · 半身",
    text: "纯净粉色法式墙面，两扇粉色高门带方框雕花线 + 黑色把手；近景左下是一张小型大理石圆桌（巴洛克金色雕花桌脚），桌上一束粉白玫瑰；浅米色木地板。柔和窗光从画面右侧漫射，墙面有微妙的明暗渐变。",
  },
  {
    name: "象牙白法式套间",
    text: "象牙白色法式套间，墙面有 dado 雕花镶边和金线描边；房间一角放一把路易十四金边扶手椅（米色织锦缎面），椅旁摆一只白瓷小桌灯；地板是浅色拼花橡木。柔和暖光从落地窗漫射进来，整体色调奶白 + 金 + 淡香槟。",
  },
  {
    name: "粉色阳光浴室",
    text: "玫瑰粉色法式洗手间一角：粉色墙面 + 白色大理石洗手台 + 古铜色细脚水龙头 + 圆形金边镜；窗户透进柔和的午后阳光，台面摆一只小型陶瓷花瓶插粉色野花。色调粉白 + 古铜金 + 镜面反光。浅景深。",
  },

  // ───── 古典宫廷 / 油画墙 ─────
  {
    name: "宫廷油画楼梯",
    text: "气派的欧式宫廷楼梯：黑色大理石台阶 + 中央铺一条蓝金图案地毯（深蓝底 + 金色巴洛克花纹 + 希腊回纹镶边）；两侧白色大理石栏杆，瓶状车削立柱整齐排列；墙面奶白色，密集挂着十多幅金边油画（人物肖像 / 山水 / 帆船 / 骏马交错）；左侧高窗带米白色厚重窗帘和绳带流苏。柔和漫射窗光，调性庄重古典。85mm 长焦，背景油画微微柔焦。",
  },
  {
    name: "金边油画墙 · 楼梯转角",
    text: "庄园楼梯转角平台：奶白色墙面挂满金边古典油画（家族肖像 + 风景 + 帆船 + 马），左侧高大长窗带米白色厚帘 + 绳带流苏；右侧绿植衬托。脚下是大理石楼梯，瓶柱栏杆延伸进画面。柔和窗光从左侧斜射，色调奶白 + 古金 + 绿植深绿。",
  },
  {
    name: "黄墙金椅 · 油画一角",
    text: "暖鹅黄色复古墙面（带 wainscoting 白色护墙板），墙上挂一幅金边古典版画；近景放一把法式金边扶手椅（米色花卉锦缎椅面），椅前铺一条波斯纹样地毯；背景是一扇半开的白色法式门。光线柔和暖调，画面有 19 世纪沙龙感。",
  },
  {
    name: "宫廷长廊 · 大窗暖光",
    text: "古典宫廷长廊：左侧一排高大落地长窗 + 米白色厚帘和绳带流苏，柔和金色暖光从窗外漫射进来；右侧是奶白色墙面挂金边油画；地面是浅色大理石拼花。背景虚化退到远处的拱门口。85mm 长焦，浅景深。",
  },

  // ───── 复古沙龙 / 卧室 ─────
  {
    name: "条纹椅 · 洛可可一角",
    text: "洛可可室内一角：背景是大幅花卉图案的窗帘墙（淡粉米黄底 + 粉色玫瑰 + 绿叶），中景是一把金色雕花框架的条纹软包扶手椅（粉绿米黄竖条纹缎面）；左侧是一张圆形米色大理石小桌（巴洛克金色雕花桌脚），桌上一只粉色陶瓷台灯 + 白瓷茶具 + 水果；右侧是一扇半开的白色法式门，门外漏出花纹墙纸。地面深色大理石。光线柔和漫射，色调粉米 + 金 + 深绿。",
  },
  {
    name: "蓝白条纹卧室",
    text: "复古法式卧室：墙面是淡淡的蓝白竖条纹墙纸；中央一张米色扣花软包大床（木雕床头 + 床尾凳），白色厚被铺好 + 米色 / 浅绿色花卉抱枕；床头墙挂一幅金边古典油画；地面铺米色花卉纹样地毯。柔和窗光从画面右侧漫射进来。",
  },
  {
    name: "复古起居室 · 暖灯",
    text: "复古沙龙起居室：墙面是温暖的米黄涂料 + 多幅金边古典油画交错挂；中景是一组米色软包扶手椅 + 茶几 + 桌灯（柔和暖灯光）；背景是一扇带厚重窗帘的高窗，深色木地板上铺旧波斯地毯。色调暖米 + 古金 + 红木。85mm 浅景深。",
  },
  {
    name: "扶手椅 · 黄墙油画",
    text: "暖黄涂料墙面（带白色护墙板和金线描边）；墙上挂一幅黑边古典版画；近景放一把路易十四风格的金色雕花扶手椅（米白花纹锦缎椅面），椅前是一条波斯花纹地毯；地板是深色橡木。柔和漫射窗光从画面右侧射入。",
  },

  // ───── 庄园 / 楼梯 / 木地板 ─────
  {
    name: "白栏杆楼梯 · 蓝金毯",
    text: "庄园楼梯中段：黑色大理石台阶 + 中央铺一条蓝底金色巴洛克花纹地毯（带希腊回纹边）；两侧白色大理石栏杆，瓶状车削立柱；扶手宽厚光滑。背景是奶白色墙面挂多幅金边油画，左侧高窗带米色厚帘和绳带流苏。柔和侧光从窗外漫射。",
  },
  {
    name: "楼梯扶手 · 半身近景",
    text: "白色大理石楼梯扶手旁：粗壮扶手 + 瓶状立柱栏杆；背景奶白墙面密集挂金边古典油画（肖像 + 风景）；脚下是蓝金巴洛克花纹地毯铺在黑色台阶上。柔和窗光从左侧漫射，背景油画虚化成温暖色块。85mm 长焦。",
  },
  {
    name: "黑铁艺楼梯 · 拱窗",
    text: "白色 stucco 灰泥墙 + 黑色铁艺装饰栏杆楼梯（铁艺纹样精致），台阶是浅色大理石；墙上嵌一扇拱形深木格子窗；地中海地中海南欧风。柔和漫射光从拱窗透入，整体调性干净简约。",
  },
  {
    name: "胡桃木门厅",
    text: "深胡桃木质双扇大门（带方框雕花线条 + 黑色细把手），夹在浅色 stucco 石墙之间；门前是浅米色石板地面 + 一道窄阶。色调暖棕木 + 暖米石。柔和漫射光，南欧老建筑的入口感。",
  },

  // ───── 地中海 / 半室外 / 阳台 ─────
  {
    name: "红墙阳台 · 海景棕榈",
    text: "地中海风格阳台一角：红色（chili red）灰泥外墙 + 黑色铁艺栏杆，栏杆纹样精致；远景是蓝色海湾 + 棕榈树 + 远山小镇。地板是浅米色瓷砖 + 旁边一片矮草坪。光线明亮但柔和，色调红 + 蓝 + 绿。",
  },
  {
    name: "棕榈阳台 · 远山",
    text: "高地阳台：白色矮墙 + 大叶棕榈树框住前景，墙下是修剪整齐的灌木绿篱；远景是远山城市的房屋点点 + 蓝天云朵；地面是赤陶红砖。光线明亮，调性度假 + 慵懒。",
  },
  {
    name: "拱廊半户外 · 黄墙",
    text: "南欧拱形廊道：淡蜂蜜黄色灰泥外墙 + 木质门窗 + 一列拱形开口可看到远处天空；地板是浅色石板。柔和暖光斜射，廊柱投下长条阴影；调性是托斯卡纳乡村庄园。85mm 长焦。",
  },
  {
    name: "白拱廊 · 海风",
    text: "白色 stucco 拱廊：地中海风的连续白色圆拱框住远处的海景 / 棕榈；地板是赤陶红砖；阳光强烈但被白墙反射柔化。色调白 + 蓝 + 绿；干净海边度假感。",
  },

  // ───── 户外花园 / 庄园 ─────
  {
    name: "几何花园 · 喷泉",
    text: "意式几何花园：背景是修剪整齐的拱形绿篱迷宫 + 远处的柏树尖；中景是一座圆形古典石质喷泉（带雕花石盆 + 中央雕像）；前景是平整的绿草坪。傍晚柔和的暖金光，背景天空淡蓝带云。色调绿 + 米石 + 暖金。",
  },
  {
    name: "庄园草坪 · 阶梯",
    text: "英式庄园草坪：远景是一栋米色石质庄园建筑 + 法式落地长窗 + 拱门；中景是宽阔修剪整齐的绿草坪 + 一道矮石阶；前景是石板路 + 一只大型石质花盆。柔和漫射光，调性优雅古典。",
  },
  {
    name: "花园拱门 · 玫瑰墙",
    text: "户外花园拱形通道：拱门由茂密的粉色 / 白色玫瑰藤蔓覆盖 + 绿叶环绕，下方铺浅色石板小径；阳光从拱门外漏入形成明亮焦点。色调粉 + 白 + 绿；童话浪漫感。",
  },
  {
    name: "陶土花盆 · 石阶",
    text: "南欧石阶一角：浅色石阶 + 旁边一只巨大的赤陶红色陶土花盆（盆里种橄榄或柏树）；背景是浅黄色 stucco 外墙 + 一扇深木百叶窗。柔和暖金侧光，色调赤陶 + 浅黄 + 深木。",
  },

  // ───── 极简 / 棚拍 / 木质 ─────
  {
    name: "米色拱形墙",
    text: "极简米色拱形墙：浅暖米色（接近 #E8D9C4）的灰泥墙面，带两个并排的拱形凹陷装饰；地面是哑光暖米色水磨石。柔和漫射光从画面左侧漫入，墙面有微妙的明暗渐变。色调单一柔和，调性极简棚拍 + 法式氛围。",
  },
  {
    name: "暖米拱凹 · 阴影",
    text: "暖米色 stucco 拱形凹陷墙面：单一拱形凹陷构成主背景，墙面接近 #E8D5C0；地面是同色调哑光水泥地。光线从画面左前方斜射，在拱形凹陷内形成柔和的阴影渐变；调性极简、温柔、留白多。",
  },
  {
    name: "木质画室 · 大窗",
    text: "木质画室一角：浅暖色实木板墙 + 落地大窗（窗框白色），柔和的画室散射光从窗外漫入；窗下放一张木质工作台 + 一两件简约陶艺道具；地板是浅色实木地板。色调暖木 + 白 + 米；自然质朴。",
  },
  {
    name: "白墙木地板 · 落地窗",
    text: "极简室内：纯净白色 stucco 灰泥墙 + 一扇高大的落地窗（米色厚窗帘半开），柔和午后的窗光斜射进来；地板是浅色橡木拼花；墙根靠一盆翠绿散尾葵。色调白 + 浅木 + 一点植物绿。",
  },
];

/* ─────────────────────────────────────────────────────────
 *  页面
 * ───────────────────────────────────────────────────────── */

export default function SceneToolsPage() {
  const user = useCurrentUser();

  // 数据
  const [scenesLib, setScenesLib] = useState<Scene[]>([]);

  // 数据：AI 模型列表（从 /api/ai-models 拉）
  const [models, setModels] = useState<
    Array<{ model_id: string; label: string; badge?: string | null }>
  >([]);

  // 表单
  const [products, setProducts] = useState<ProductFile[]>([]);
  const [scenes, setScenes] = useState<SceneEntry[]>([]);
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [userHint, setUserHint] = useState("");
  const [modelId, setModelId] = useState("gemini-3-pro-image-preview");
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("2K");
  const [focusMode, setFocusMode] = useState<FocusMode>("model_first");

  // 材质（首次产品图上传后自动调 /api/analyze → /api/materials/match 拿匹配结果）
  const [allMaterials, setAllMaterials] = useState<MaterialRow[]>([]);
  const [matchedMaterialIds, setMatchedMaterialIds] = useState<number[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzedFingerprint, setAnalyzedFingerprint] = useState<string | null>(
    null,
  );

  // 提交
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 场景图选择面板（显示 / 隐藏）
  const [scenePickerOpen, setScenePickerOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [presetTab, setPresetTab] = useState("");
  const [imageTab, setImageTab] = useState("");

  // 文字场景预设（从 /api/text-scenes 拉，admin 可在 admin/scenes 里编辑）
  // API 拉不到则回退到 lib 里 hardcoded 的 28 条（提供首次部署兜底）
  const [textScenePresets, setTextScenePresets] = useState<TextScenePreset[]>(
    STATIC_PRESETS,
  );

  // 加载场景库 + 模型列表 + 文字场景预设
  useEffect(() => {
    fetch("/api/text-scenes")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TextScenePreset[] | null) => {
        if (Array.isArray(data) && data.length > 0) {
          setTextScenePresets(data);
        }
      })
      .catch(() => {
        /* 拉不到就用 STATIC_PRESETS */
      });
    fetch("/api/scenes")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Scene[]) => setScenesLib(data))
      .catch(() => {});
    fetch("/api/ai-models?category=image_gen")
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (
          data: Array<{
            model_id: string;
            label: string;
            badge?: string | null;
            is_default?: 0 | 1;
          }>,
        ) => {
          setModels(data);
          const def = data.find((m) => m.is_default === 1) || data[0];
          if (def) setModelId(def.model_id);
        },
      )
      .catch(() => {});
  }, []);

  // ─── prefill：从 /tasks 跳过来时 ?prefill_job=xxx 反填该 job 的 params ───
  const searchParams = useSearchParams();
  const prefillJobId = searchParams?.get("prefill_job");
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);
  useEffect(() => {
    if (!prefillJobId) return;
    fetch(`/api/jobs/${prefillJobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.job) return;
        let params: Record<string, unknown> = {};
        try {
          params =
            typeof data.job.params === "string"
              ? JSON.parse(data.job.params)
              : data.job.params || {};
        } catch {
          return;
        }
        // aspect / imageSize / userHint
        if (typeof params.aspect_ratio === "string")
          setAspectRatio(params.aspect_ratio);
        if (
          params.image_size === "1K" ||
          params.image_size === "2K" ||
          params.image_size === "4K"
        )
          setImageSize(params.image_size);
        if (typeof params.user_hint === "string")
          setUserHint(params.user_hint || "");
        if (typeof data.job.model === "string") setModelId(data.job.model);
        if (
          params.focus_mode === "model_first" ||
          params.focus_mode === "balanced" ||
          params.focus_mode === "environmental"
        )
          setFocusMode(params.focus_mode);
        if (Array.isArray(params.material_ids))
          setMatchedMaterialIds(
            (params.material_ids as unknown[])
              .map((x) => Number(x))
              .filter((x) => Number.isFinite(x) && x > 0),
          );
        // scenes 反填：直接从 scenes payload 里读 count + closeup_presets
        type ScenePayload = {
          type: "text" | "image";
          text?: string;
          scene_id?: number;
          scene_name?: string;
          count?: number;
          closeup_presets?: string[];
        };
        const scenesRaw = (params.scenes as ScenePayload[]) || [];
        const prefilled: SceneEntry[] = scenesRaw.map((s, idx) => {
          const count =
            typeof s.count === "number" ? Math.max(0, Math.min(5, s.count)) : 1;
          const closeup_presets = (s.closeup_presets || []).filter(
            (k): k is CloseupKey =>
              k === "back" ||
              k === "side_waist" ||
              k === "chest_to_thigh" ||
              k === "lower_body_motion" ||
              k === "neckline_shoulder",
          );
          const id = `prefill-${idx}-${Date.now()}`;
          if (s.type === "image" && typeof s.scene_id === "number") {
            return {
              id,
              type: "image",
              scene_id: s.scene_id,
              scene_name: s.scene_name || `场景#${s.scene_id}`,
              count,
              closeup_presets,
            };
          }
          return {
            id,
            type: "text",
            text: s.text || "",
            count,
            closeup_presets,
          };
        });
        if (prefilled.length > 0) setScenes(prefilled);
        setPrefillBanner(
          `已从老任务 #${prefillJobId.slice(0, 8)} 预填参数（场景 / 比例 / 画质 / 模型 / 追加指令）。产品图请重新上传后再提交。`,
        );
      })
      .catch(() => {});
  }, [prefillJobId]);

  // 产品图本地预览 URL 管理
  const productUrlsRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    return () => {
      for (const url of productUrlsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  // ─── 首次上传产品图后自动解析面料 + 匹配材质词库 ───
  // 用第一张产品图跑 /api/analyze → 拿到 garment_attrs.面料材质 字段 →
  // POST 到 /api/materials/match 拿匹配到的材质 ID 列表 → 存到 state，
  // 提交时一并传给后端。fingerprint = 第一张图的 file name+size，
  // 避免重复 analyze 同一张图。用户可手动改（材质多选 UI 在第 ③ 列）。
  useEffect(() => {
    if (products.length === 0) {
      setMatchedMaterialIds([]);
      setAnalyzedFingerprint(null);
      return;
    }
    const first = products[0];
    const fp = `${first.file.name}::${first.file.size}`;
    if (fp === analyzedFingerprint) return;
    let cancelled = false;
    (async () => {
      setAnalyzing(true);
      try {
        // 1. 调 /api/analyze 解析款式
        const fd = new FormData();
        fd.append("image0", first.file, first.file.name);
        const r1 = await fetch("/api/analyze", { method: "POST", body: fd });
        if (!r1.ok) throw new Error("analyze failed");
        const attrs = (await r1.json()) as Record<string, unknown>;
        const fabricText = String(attrs["面料材质"] || "");
        if (!fabricText.trim()) {
          if (!cancelled) setMatchedMaterialIds([]);
          return;
        }
        // 2. 用面料文本调 /api/materials/match
        const r2 = await fetch("/api/materials/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: fabricText }),
        });
        if (!r2.ok) throw new Error("match failed");
        const data = (await r2.json()) as {
          matched: MaterialRow[];
          all: MaterialRow[];
        };
        if (cancelled) return;
        setAllMaterials(data.all || []);
        setMatchedMaterialIds((data.matched || []).map((m) => m.id));
      } catch {
        // 解析失败不阻断流程（拿不到材质也能跑，prompt 会让模型自己看图）
        if (!cancelled) setMatchedMaterialIds([]);
      } finally {
        if (!cancelled) {
          setAnalyzedFingerprint(fp);
          setAnalyzing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [products, analyzedFingerprint]);

  function onPickProducts(files: FileList | File[] | null) {
    if (!files || (files instanceof FileList ? files.length : files.length) === 0)
      return;
    const arr: File[] = files instanceof FileList ? Array.from(files) : files;
    const newProducts: ProductFile[] = [];
    for (const f of arr) {
      if (!f.type.startsWith("image/")) continue;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const url = URL.createObjectURL(f);
      productUrlsRef.current.set(id, url);
      newProducts.push({ id, file: f, url });
    }
    setProducts((prev) => [...prev, ...newProducts]);
    setError(null);
  }

  function removeProduct(id: string) {
    setProducts((prev) => {
      const p = prev.find((x) => x.id === id);
      if (p?.backUrl) URL.revokeObjectURL(p.backUrl);
      return prev.filter((x) => x.id !== id);
    });
    const url = productUrlsRef.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      productUrlsRef.current.delete(id);
    }
  }

  // v6: 给某个产品添加 / 替换 / 移除背部参考图
  function setProductBackRef(productId: string, file: File) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        if (p.backUrl) URL.revokeObjectURL(p.backUrl);
        const backUrl = URL.createObjectURL(file);
        return { ...p, backFile: file, backUrl };
      }),
    );
  }

  function removeProductBackRef(productId: string) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        if (p.backUrl) URL.revokeObjectURL(p.backUrl);
        return { ...p, backFile: undefined, backUrl: undefined };
      }),
    );
  }

  // 添加文字场景
  function addTextScene(initialText = "") {
    const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setScenes((prev) => [
      ...prev,
      { id, type: "text", text: initialText, count: 1, closeup_presets: [] },
    ]);
  }

  // 添加图片场景
  function addImageScene(scene: Scene) {
    const id = `image-${scene.id}-${Date.now().toString(36)}`;
    if (scenes.some((s) => s.type === "image" && s.scene_id === scene.id)) {
      // 已加过这张图，跳过
      return;
    }
    setScenes((prev) => [
      ...prev,
      {
        id,
        type: "image",
        scene_id: scene.id,
        scene_name: scene.name,
        count: 1,
        closeup_presets: [],
      },
    ]);
  }

  function removeScene(id: string) {
    setScenes((prev) => prev.filter((s) => s.id !== id));
  }

  function updateTextScene(id: string, text: string) {
    setScenes((prev) =>
      prev.map((s) =>
        s.id === id && s.type === "text" ? { ...s, text } : s,
      ),
    );
  }

  function updateSceneCount(id: string, count: number) {
    // 允许 0（用户只想要特写镜头，没常规变体）
    const c = Math.max(0, Math.min(5, count));
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, count: c } : s)));
  }

  function toggleSceneCloseup(id: string, key: CloseupKey) {
    setScenes((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const has = s.closeup_presets.includes(key);
        const next = has
          ? s.closeup_presets.filter((k) => k !== key)
          : [...s.closeup_presets, key];
        return { ...s, closeup_presets: next };
      }),
    );
  }

  function toggleMaterial(matId: number) {
    setMatchedMaterialIds((prev) =>
      prev.includes(matId) ? prev.filter((x) => x !== matId) : [...prev, matId],
    );
  }

  // 总数 + 软警告
  // 单场景输出 = count（常规变体）+ closeup_presets.length（特写多选）
  // total = N 产品图 × Σ(单场景输出)
  const sceneTotal = scenes.reduce(
    (sum, s) => sum + (s.count || 0) + (s.closeup_presets?.length || 0),
    0,
  );
  const totalCount = products.length * sceneTotal;
  const estCostCny = totalCount * 1.7; // Pro 4K 约 ¥1.7/张
  const showWarning = totalCount > 20;

  // v6: 任意场景勾选了"背面"系特写时，提示用户上传背部参考图
  const BACK_KEYS = new Set<string>([
    "back",
    "hand_on_hip_back",
    "arms_overhead_back",
  ]);
  const needsBackRef = scenes.some((s) =>
    s.closeup_presets.some((k) => BACK_KEYS.has(k)),
  );

  const canSubmit =
    !submitting && products.length > 0 && scenes.length > 0 && !activeJobId;

  // ─── 提交 ───
  async function handleSubmit() {
    if (!canSubmit) return;
    if (showWarning) {
      const ok = confirm(
        `预计出 ${totalCount} 张图（${products.length} 产品 × ${sceneTotal} 场景变体），约花费 ¥${estCostCny.toFixed(2)}。\n\n确认提交？`,
      );
      if (!ok) return;
    }
    // 文字场景必须有内容
    for (const s of scenes) {
      if (s.type === "text" && !s.text.trim()) {
        setError("有空的文字场景，请填写或删除");
        return;
      }
      const total = (s.count || 0) + (s.closeup_presets?.length || 0);
      if (total === 0) {
        setError("有场景没有勾选张数也没有特写镜头，请删除或加张数");
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      products.forEach((p, i) => {
        fd.append(`product_image_${i}`, p.file, p.file.name);
        // v6: 该产品如果上传了背部参考图，跟着同一个 idx 传
        if (p.backFile) {
          fd.append(`back_reference_image_${i}`, p.backFile, p.backFile.name);
        }
      });
      const scenesPayload = scenes.map((s) => {
        const count = Math.max(0, Math.min(5, s.count || 0));
        const closeup_presets = (s.closeup_presets || []).slice(0, 5);
        if (s.type === "text")
          return {
            type: "text",
            text: s.text.trim(),
            count,
            closeup_presets,
          };
        return {
          type: "image",
          scene_id: s.scene_id,
          count,
          closeup_presets,
        };
      });
      fd.append("scenes", JSON.stringify(scenesPayload));
      fd.append("aspect_ratio", aspectRatio);
      fd.append("model", modelId);
      fd.append("image_size", imageSize);
      fd.append("focus_mode", focusMode);
      fd.append("material_ids", JSON.stringify(matchedMaterialIds));
      if (userHint.trim()) fd.append("user_hint", userHint.trim());

      const res = await fetch("/api/scene-tools", {
        method: "POST",
        body: fd,
      });
      // 兜底：体大被 Caddy 截断（413）时 body 是空的，res.json() 会爆
      // "Unexpected end of JSON input"。这里先 text() 再尝试 parse，给出友好提示
      const raw = await res.text();
      let body: { job_id?: string; error?: string } = {};
      try {
        if (raw) body = JSON.parse(raw);
      } catch {
        if (res.status === 413) {
          throw new Error(
            "上传内容超过服务器限制（200MB）。请减少产品图数量或压缩后重试。",
          );
        }
        throw new Error(
          `服务器返回异常（${res.status} ${res.statusText}）：${raw.slice(0, 200) || "(空响应)"}`,
        );
      }
      if (!res.ok || !body.job_id) {
        throw new Error(body.error || res.statusText || `HTTP ${res.status}`);
      }
      setActiveJobId(body.job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // ─── 轮询 job ───
  const polled = useJobPolling(activeJobId, {
    onFinished: () => {
      // 完成后让用户在这里看见，job 数据 still on screen
    },
  });
  const job = polled.data?.job;

  // 场景按 category 分组（图片场景库选择面板用）
  const sceneGroups = useMemo(() => {
    const groups = new Map<string, Scene[]>();
    for (const s of scenesLib) {
      const key = s.category_label || "未分类";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return Array.from(groups.entries()).map(([key, items]) => ({ key, items }));
  }, [scenesLib]);

  if (!user) return null;

  // 任务进行 / 完成时全屏切换到 TaskViewport，跟 batch-photo 一致
  // 用户可以"返回配置"重新看表单，或"开始新任务"清空 active job
  if (activeJobId && polled.data) {
    return (
      <TaskViewport
        job={polled.data.job}
        items={polled.data.items}
        nextTokenReadyAtMs={polled.data.next_token_ready_at_ms}
        serverTimeMs={polled.data.server_time_ms}
        onBackToForm={() => setActiveJobId(null)}
        onStartNew={() => {
          // 不清空已选场景 / 产品图，只是回到表单准备下一次提交
          setActiveJobId(null);
        }}
        zipPrefix="scene_tools"
      />
    );
  }

  return (
    <main className="px-6 py-8 space-y-6 max-w-[1500px] mx-auto">
      {/* Header billboard */}
      <div className="bg-gradient-to-r from-[#fbedca] via-white to-white border border-[#dcdfd2] p-6 rounded-[10px] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-2xl font-display text-[#23251d] flex items-center gap-2">
            <Sparkles size={20} className="text-[#b17816]" strokeWidth={2.2} />
            家居场景图工作台
            <span className="text-xs font-semibold bg-[#fbe9bd] text-[#23251d] border border-[#f0cf6e] px-2.5 py-0.5 rounded">
              内部使用版
            </span>
          </h2>
          <p className="text-xs text-[#6c6e63] leading-relaxed max-w-2xl">
            上传家居软品产品图 → 空间模板选择（可配置多视角常规照 / 特写拍摄张数）→ 自动物理解析材质，并行批量渲染大片。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="shrink-0 px-3.5 py-1.5 rounded-[8px] bg-[#fdf3da] border border-[#f0d9a0] text-[#23251d] hover:bg-[#fbe9bd] font-bold text-xs flex items-center gap-1.5 transition-all"
        >
          <Info className="w-3.5 h-3.5" /> 使用说明
        </button>
      </div>

      {showHelp && (
        <div className="p-4 rounded-[10px] bg-[#f9efd6] border border-[#f0d9a0] flex items-start gap-3">
          <Info size={18} className="text-[#b17816] shrink-0 mt-0.5" />
          <div className="flex-1 text-xs leading-relaxed space-y-1 text-[#4d4f46]">
            <div className="font-bold text-[13px] text-[#23251d]">家居场景图 · 使用说明</div>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>第一步</strong>：上传产品图（产品参考图），首张会自动识别面料并配材质词库。</li>
              <li><strong>第二步</strong>：加场景——文字描述 / 场景图库 / 点预设缩略图；每个场景独立配「常规张数 + 特写镜头」。</li>
              <li><strong>第三步</strong>：右侧设画面焦点 / 画质 / 比例，确认张数与费用后「立即出图」。</li>
              <li>出图数量 = 产品图数 × Σ(每场景的常规张数 + 特写数)。</li>
            </ul>
          </div>
          <button onClick={() => setShowHelp(false)} className="shrink-0 text-[11px] bg-white text-[#23251d] hover:text-[#23251d] px-2.5 py-1 rounded-[5px] border border-[#f0cf6e] font-medium">隐藏</button>
        </div>
      )}

      {prefillBanner && (
        <div className="p-3 rounded-[8px] text-[12px] bg-[#f9efd6] border border-[#f0cf6e] text-[#23251d] flex items-start justify-between gap-3">
          <span>📥 {prefillBanner}</span>
          <button onClick={() => setPrefillBanner(null)} className="text-[#b17816] hover:text-[#8a5a05] shrink-0">✕</button>
        </div>
      )}
      {error && (
        <div className="p-3 bg-[#f7d6d3] border border-[#e0a6a2] text-[#cd4239] text-sm rounded-[8px]">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_390px] gap-6 items-start">
        {/* ════ 中：配置流 ════ */}
        <div className="space-y-6 min-w-0">

          {/* ① 产品图 */}
          <div className="bg-white border border-[#dcdfd2] rounded-[10px] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-[6px] bg-[#f7a501] text-[#23251d] flex items-center justify-center text-xs font-bold border border-[#dd9001]">1</div>
                <h3 className="text-sm font-bold text-[#23251d] flex items-center gap-2">
                  产品图 <span className="text-xs text-[#9b9c92] font-normal">({products.length} 张)</span>
                </h3>
              </div>
              <span className="text-[11px] text-[#6c6e63]">产品参考图</span>
            </div>

            {products.length === 0 ? (
              <Dropzone
                accept="image/*"
                multiple
                onFiles={(files) => onPickProducts(files)}
                icon={<Upload size={26} strokeWidth={1.6} className="text-[#b17816]" />}
                title="拖拽 / 点击 / Ctrl+V 粘贴产品图"
                description="PNG / JPG / WebP · 最大 20MB · 支持多选 · 智能识别面料"
              />
            ) : (
              <>
                {needsBackRef && (
                  <div className="mb-3 p-2.5 rounded-[8px] text-[11px] bg-[#f9efd6] border border-[#f0d9a0] text-[#23251d]">
                    📷 你选了背面特写（后背 / 抚臀回眸 / 举臂背身）。建议给每件产品上传一张「背部参考图」，模型据它精准还原背部细节。
                  </div>
                )}
                <div className="grid grid-cols-4 gap-3.5">
                  {products.map((p, idx) => (
                    <div key={p.id} className="group relative aspect-[3/4] rounded-[8px] overflow-hidden border border-[#dcdfd2] bg-[#f6f5f4]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.file.name} className="w-full h-full object-cover" />
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold bg-[#23251d] text-white rounded-[5px]">P{idx + 1}</div>
                      <button onClick={() => removeProduct(p.id)} className="absolute top-2 right-2 w-5 h-5 rounded-[5px] bg-white/90 border border-[#dcdfd2] text-[#9b9c92] hover:text-[#cd4239] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                      {needsBackRef && (
                        <div className="absolute bottom-1 left-1 right-1">
                          {p.backUrl ? (
                            <div className="relative group/back">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.backUrl} alt="back" className="w-full h-8 object-cover rounded border-2 border-[#f7a501]" title="背部参考图" />
                              <button onClick={() => removeProductBackRef(p.id)} className="absolute -top-1 -right-1 p-0.5 bg-[#f7d6d3]0 text-white rounded-full opacity-0 group-hover/back:opacity-100">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <label className="block w-full px-1 py-1 text-[9px] text-center bg-[#23251d]/70 text-white rounded cursor-pointer hover:bg-[#23251d]/90">
                              + 背部参考图
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setProductBackRef(p.id, f); }} />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <Dropzone compact accept="image/*" multiple onFiles={(files) => onPickProducts(files)}>
                    <div className="aspect-[3/4] flex flex-col items-center justify-center text-[10px] text-[#9b9c92] gap-1">
                      <Plus className="w-5 h-5" /> 继续添加
                    </div>
                  </Dropzone>
                </div>
              </>
            )}

            {(allMaterials.length > 0 || analyzing) && (
              <div className="mt-5 pt-5 border-t border-[#e5e7e0]">
                <p className="text-[11px] font-bold text-[#6c6e63] mb-2 flex items-center gap-1.5">
                  <Shirt className="w-3.5 h-3.5 text-[#b17816]" /> 软品材质
                  {analyzing && <span className="text-[#9b9c92] font-normal">· 分析中…</span>}
                  {!analyzing && matchedMaterialIds.length > 0 && <span className="text-[#2c8c66] font-normal">· 已识别 {matchedMaterialIds.length} 种</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {allMaterials.map((m) => {
                    const on = matchedMaterialIds.includes(m.id);
                    return (
                      <button key={m.id} type="button" onClick={() => toggleMaterial(m.id)}
                        className={"px-2.5 py-1 rounded-[6px] text-[11px] border transition-all " + (on ? "border-[#f7a501] bg-[#faf3e0] text-[#23251d] font-bold ring-2 ring-[#f7e3b0]" : "border-[#dcdfd2] bg-[#f6f5f4] text-[#4d4f46] hover:border-[#bfc1b7]")}
                        title={m.description || m.name}>
                        {m.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[#9b9c92] mt-2">自动从首张产品图识别面料，点 tag 可手动增删；特写镜头按选中材质的光线 / 纹理规则精确刻画。</p>
              </div>
            )}
          </div>

          {/* ② 场景 */}
          <div className="bg-white border border-[#dcdfd2] rounded-[10px] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-[6px] bg-[#f7a501] text-[#23251d] flex items-center justify-center text-xs font-bold border border-[#dd9001]">2</div>
                <h3 className="text-sm font-bold text-[#23251d] flex items-center gap-2">
                  AI 空间工场 <span className="text-xs text-[#9b9c92] font-normal">({scenes.length} 个已加)</span>
                </h3>
              </div>
            </div>

            <div className="flex gap-2.5 mb-4">
              <button onClick={() => setPresetOpen(true)} className="flex-1 px-3 py-2.5 text-xs font-semibold border border-[#dcdfd2] rounded-[8px] hover:border-[#f3c14e] hover:bg-[#faf3e0] text-[#4d4f46] inline-flex items-center justify-center gap-1.5 transition-all">
                <PenLine size={14} strokeWidth={2} /> 加文字场景
              </button>
              <button onClick={() => setScenePickerOpen(true)} className="flex-1 px-3 py-2.5 text-xs font-semibold border border-[#dcdfd2] rounded-[8px] hover:border-[#f3c14e] hover:bg-[#faf3e0] text-[#4d4f46] inline-flex items-center justify-center gap-1.5 transition-all">
                <ImageIcon size={14} strokeWidth={2} /> 加图片场景
              </button>
            </div>

            {scenes.length === 0 ? (
              <div className="text-[11px] text-[#9b9c92] p-5 border border-dashed border-[#dcdfd2] rounded-[8px] text-center">
                还没加场景。点上方按钮添加，或展开下方「场景预设库」一键添加。
              </div>
            ) : (
              <div className="space-y-2.5">
                {scenes.map((sc, idx) => {
                  const lib = sc.type === "image" ? scenesLib.find((x) => x.id === sc.scene_id) : null;
                  const thumbUrl = lib?.image_url || (sc.type === "text" ? textScenePresets.find((pp) => pp.text === sc.text)?.thumb : undefined);
                  const sub = (sc.count || 0) + (sc.closeup_presets?.length || 0);
                  return (
                    <div key={sc.id} className="rounded-[8px] border border-[#f7a501] bg-white ring-4 ring-[#fbedca] overflow-hidden">
                      <div className="flex items-start gap-3 p-3">
                        <div className="w-14 h-[72px] rounded-[6px] overflow-hidden shrink-0 bg-[#f1f0ea] border border-[#dcdfd2] flex items-center justify-center">
                          {thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-lg opacity-60">{sc.type === "image" ? "🏛️" : "✍️"}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-[#23251d] inline-flex items-center gap-1">
                              {sc.type === "image" ? <ImageIcon size={11} /> : <PenLine size={11} />}
                              场景 {idx + 1} · {sc.type === "image" ? "图片" : "文字"}
                            </span>
                            <button onClick={() => removeScene(sc.id)} className="text-[#9b9c92] hover:text-[#cd4239]"><X size={13} /></button>
                          </div>
                          {sc.type === "image" ? (
                            <div className="text-[12px] font-medium text-[#4d4f46] truncate mt-0.5">{sc.scene_name}</div>
                          ) : (
                            <textarea value={sc.text} onChange={(e) => updateTextScene(sc.id, e.target.value.slice(0, 500))} onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }} ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }} rows={2} placeholder="例如：古典柱廊一角，午后金光斜射，浅景深..." className="mt-1 w-full bg-[#f6f5f4] border border-[#dcdfd2] focus:border-[#f7a501] text-[#23251d] text-xs rounded-[6px] px-2.5 py-1.5 outline-none resize-none overflow-hidden leading-relaxed" />
                          )}
                        </div>
                      </div>
                      <div className="px-3 pb-3 pt-1 border-t border-[#e5e7e0] bg-[#f6f5f4] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-[#6c6e63] font-medium">常规大景照</span>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => updateSceneCount(sc.id, (sc.count || 0) - 1)} className="w-5 h-5 rounded-[5px] bg-white text-[#6c6e63] hover:text-[#b17816] hover:bg-[#faf3e0] border border-[#dcdfd2] flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                            <span className="w-7 text-center text-xs font-bold text-[#23251d]">{sc.count} 张</span>
                            <button onClick={() => updateSceneCount(sc.id, (sc.count || 0) + 1)} className="w-5 h-5 rounded-[5px] bg-white text-[#6c6e63] hover:text-[#b17816] hover:bg-[#faf3e0] border border-[#dcdfd2] flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#6c6e63] font-medium mb-1 flex items-center gap-1"><ZoomIn size={10} /> 细节特写</div>
                          <div className="flex flex-wrap gap-1">
                            {CLOSEUP_PRESETS.map((cp) => {
                              const on = sc.closeup_presets.includes(cp.key as never);
                              const rec = (cp as { recommended?: boolean }).recommended;
                              return (
                                <button key={cp.key} type="button" onClick={() => toggleSceneCloseup(sc.id, cp.key as never)}
                                  className={"px-1.5 py-0.5 rounded-[5px] text-[10px] border transition-all inline-flex items-center gap-0.5 " + (on ? "border-[#f7a501] bg-[#f7a501] text-[#23251d] font-bold" : "border-[#dcdfd2] bg-white text-[#4d4f46] hover:border-[#f3d27a]")}
                                  title={cp.description.slice(0, 60)}>
                                  {cp.label}{rec && <span className="text-[8px] opacity-80">★</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="text-[10px] text-right text-[#9b9c92]">本场景 <b className="text-[#b17816]">{sub}</b> 张</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 预设库（分类 tab） */}
            <div className="mt-4">
              <CollapsibleSection variant="minimal" open={presetOpen} onOpenChange={setPresetOpen} title="场景预设库（点缩略图直接加为新场景）">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[10px] text-[#9b9c92]">从下方分类挑选缩略图，或</span>
                  <button type="button" onClick={() => addTextScene()} className="text-[11px] text-[#b17816] hover:text-[#8a5a05] font-semibold inline-flex items-center gap-1">
                    <PenLine size={12} /> 写自定义空白文字场景
                  </button>
                </div>
                {(() => {
                  const groups = new Map<string, TextScenePreset[]>();
                  for (const p of textScenePresets) {
                    if (!groups.has(p.group)) groups.set(p.group, []);
                    groups.get(p.group)!.push(p);
                  }
                  const names = Array.from(groups.keys());
                  const active = presetTab && groups.has(presetTab) ? presetTab : names[0];
                  const list = active ? groups.get(active)! : [];
                  return (
                    <>
                      <div className="flex flex-wrap gap-1.5 mb-3 border-b border-[#e5e7e0] pb-3">
                        {names.map((g) => {
                          const on = g === active;
                          return (
                            <button key={g} type="button" onClick={() => setPresetTab(g)}
                              className={"px-3 py-1.5 rounded-[6px] text-xs font-semibold border transition-all " + (on ? "bg-[#f7a501] text-[#23251d] border-[#f7a501] shadow-sm" : "text-[#6c6e63] hover:text-[#23251d] hover:bg-[#e5e7e0] border-transparent")}>
                              {g}
                            </button>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                        {list.map((p) => {
                          const added = scenes.some((x) => x.type === "text" && x.text === p.text);
                          return (
                            <button key={p.name} onClick={() => addTextScene(p.text)}
                              className={"group relative aspect-[4/3] rounded-[8px] overflow-hidden transition-all bg-[#33342d] " + (added ? "border-2 border-[#f7a501] ring-4 ring-[#fbedca]" : "border border-[#dcdfd2] hover:border-[#f3c14e]")}
                              title={p.text.slice(0, 100)}>
                              {p.thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.thumb} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#9b9c92]">无图</div>
                              )}
                              {added && (
                                <div className="absolute top-2 right-2 rounded-full bg-[#f7a501] text-[#23251d] p-1 shadow-md flex items-center justify-center">
                                  <Check size={12} strokeWidth={3} />
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/85 to-transparent">
                                <div className="text-[10px] font-medium text-white truncate">{p.name}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
                <div className="flex justify-end pt-3 mt-2 border-t border-[#e5e7e0]">
                  <button type="button" onClick={() => setPresetOpen(false)} className="inline-flex items-center gap-1 text-[11px] text-[#9b9c92] hover:text-[#b17816] px-2 py-1 rounded-[5px] hover:bg-[#f1f0ea]">
                    <ChevronUp size={13} strokeWidth={2.2} /> 收起预设库
                  </button>
                </div>
              </CollapsibleSection>
            </div>
          </div>
        </div>

        {/* ════ 右：控制面板 ════ */}
        <aside className="lg:sticky lg:top-6 space-y-4">
          {/* 输出参数 */}
          <div className="bg-white border border-[#dcdfd2] rounded-[10px] p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#e5e7e0]">
              <div className="w-5 h-5 rounded-[5px] bg-[#f7a501] text-[#23251d] flex items-center justify-center text-[10px] font-bold border border-[#dd9001]">3</div>
              <h3 className="text-xs font-bold text-[#23251d] uppercase tracking-wide">输出参数设定</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#9b9c92] uppercase tracking-widest mb-2">画面主体占比 Focus:</label>
                <div className="space-y-1.5">
                  {FOCUS_MODES.map((m) => {
                    const on = focusMode === m.value;
                    return (
                      <button key={m.value} type="button" onClick={() => setFocusMode(m.value)}
                        className={"w-full flex items-center justify-between p-2.5 rounded-[8px] border text-left transition-all " + (on ? "border-[#f7a501] bg-[#fbedca] ring-2 ring-[#f7e3b0]" : "border-[#dcdfd2] bg-[#faf9f6] hover:border-[#bfc1b7]")}>
                        <span className={"text-[11px] font-bold " + (on ? "text-[#23251d]" : "text-[#4d4f46]")}>{m.label}</span>
                        <span className="text-[10px] font-bold bg-[#23251d] text-white px-2 py-0.5 rounded-[5px] whitespace-nowrap">{m.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#9b9c92] uppercase tracking-widest mb-1.5">出图品质 Resolution:</label>
                <div className="flex bg-[#f6f5f4] p-1 rounded-[8px] border border-[#dcdfd2]">
                  {(["1K", "2K", "4K"] as const).map((r) => (
                    <button key={r} type="button" onClick={() => setImageSize(r)}
                      className={"flex-1 py-1.5 text-center text-[11px] font-bold rounded-[6px] transition-all " + (imageSize === r ? "bg-white text-[#23251d] shadow-sm border border-[#dcdfd2]" : "text-[#9b9c92] hover:text-[#23251d]")}>
                      {r}{r === "2K" && <span className="text-[8px] text-[#b17816] font-normal ml-0.5">(推荐)</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#9b9c92] uppercase tracking-widest mb-1.5">画面比例 Aspect:</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {ASPECT_RATIOS.map((a) => (
                    <button key={a.value} type="button" onClick={() => setAspectRatio(a.value)} title={a.label}
                      className={"h-10 flex items-center justify-center rounded-[6px] border transition-all " + (aspectRatio === a.value ? "border-[#f7a501] bg-[#fbedca] text-[#23251d] ring-2 ring-[#fbedca] font-bold" : "border-[#dcdfd2] bg-[#faf9f6] text-[#6c6e63] hover:bg-[#f1f0ea]")}>
                      <span className="text-[10px] font-bold">{a.value}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#9b9c92] uppercase tracking-widest mb-1.5">渲染大模型 Engine:</label>
                <div className="relative">
                  <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="w-full bg-[#f6f5f4] hover:bg-white border border-[#dcdfd2] focus:border-[#f7a501] text-[#23251d] text-[11px] rounded-[8px] px-2.5 py-2 outline-none appearance-none cursor-pointer">
                    {models.length === 0 ? (
                      <option value="gemini-3-pro-image-preview">Nano Banana Pro</option>
                    ) : (
                      models.map((m) => <option key={m.model_id} value={m.model_id}>{m.label}{m.badge ? ` · ${m.badge}` : ""}</option>)
                    )}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#9b9c92] absolute right-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>

              <div className="border-t border-[#e5e7e0] pt-3">
                <button type="button" onClick={() => setIsAdvancedOpen((v) => !v)} className="w-full flex items-center justify-between py-1 text-[#9b9c92] hover:text-[#23251d] font-semibold text-[10px]">
                  <span className="flex items-center gap-1.5"><SlidersHorizontal className="w-3 h-3 text-[#b17816]" /> 高级 · 额外提示词</span>
                  {isAdvancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {isAdvancedOpen && (
                  <div className="mt-2.5 p-3 rounded-[8px] bg-[#f6f5f4] border border-[#dcdfd2]">
                    <textarea value={userHint} onChange={(e) => setUserHint(e.target.value.slice(0, 200))} rows={3} placeholder="例如：略带胶片颗粒，蓝调时刻" className="w-full bg-white border border-[#dcdfd2] text-[#23251d] text-[11px] rounded-[6px] px-2 py-1.5 outline-none focus:border-[#f7a501] resize-none" />
                    <div className="text-[10px] text-[#9b9c92] mt-1 text-right">{userHint.length}/200</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 出图预估 */}
          <div className="bg-white border border-[#dcdfd2] rounded-[10px] p-6 shadow-md">
            <h3 className="text-xs font-bold text-[#6c6e63] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-[#b17816]" /> 出图预估与资源消耗
            </h3>
            <div className="bg-gradient-to-br from-[#fbedca]/70 via-[#fbedca]/20 to-transparent rounded-[8px] p-4 border border-[#f0d9a0] mb-5 relative overflow-hidden">
              <div className="absolute right-3 bottom-0 text-[#bfc1b7]/40 font-extrabold text-7xl select-none leading-none">Σ</div>
              <p className="text-[11px] text-[#6c6e63] font-medium relative">预计生成大片</p>
              <p className="text-4xl font-extrabold text-[#23251d] mt-2 tracking-tight relative flex items-baseline gap-1">
                {totalCount} <span className="text-xs text-[#6c6e63] font-normal">张图</span>
              </p>
              <p className="text-[10px] text-[#9b9c92] mt-2 relative">{products.length} 款软品 × {sceneTotal} 个机位 / 视角</p>
            </div>
            <div className="space-y-3 mb-5 text-xs text-[#4d4f46]">
              <div className="flex justify-between items-center bg-[#f6f5f4] p-2.5 rounded-[6px] border border-[#e5e7e0]">
                <span className="text-[#6c6e63]">待加工软品:</span><span className="font-bold text-[#4d4f46]">{products.length} 款</span>
              </div>
              <div className="flex justify-between items-center bg-[#f6f5f4] p-2.5 rounded-[6px] border border-[#e5e7e0]">
                <span className="text-[#6c6e63]">已选空间:</span><span className="font-bold text-[#4d4f46]">{scenes.length} 个</span>
              </div>
              <div className="border-t border-[#e5e7e0] pt-3 flex justify-between items-baseline">
                <span className="font-semibold text-[#4d4f46]">预计费用 (CNY):</span>
                <span className="text-lg font-bold text-[#b17816]">¥{estCostCny.toFixed(2)}</span>
              </div>
            </div>
            {showWarning && (
              <div className="mb-3 p-2.5 rounded-[6px] text-[11px] bg-[#fef7d6] border border-[#f3d27a] text-[#793400]">⚠️ 数量较大（{totalCount} 张），建议确认后再提交</div>
            )}
            <button onClick={handleSubmit} disabled={!canSubmit}
              className={"w-full py-3.5 rounded-[8px] text-xs font-bold transition-all flex items-center justify-center gap-2 " + (!canSubmit ? "bg-[#e5e7e0] text-[#9b9c92] border border-[#dcdfd2] cursor-not-allowed" : "bg-[#f7a501] hover:bg-[#dd9001] text-[#23251d] shadow-[0_4px_12px_rgba(247,165,1,0.3)] hover:scale-[1.01] active:scale-[0.99]")}>
              {submitting ? (
                <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> 提交中…</>
              ) : activeJobId ? (
                <>正在出图…</>
              ) : (
                <><Sparkles className="w-4 h-4 text-[#23251d] spin-slow" /> 立即多维并行出图 ({totalCount}张)</>
              )}
            </button>
            {!canSubmit && !submitting && !activeJobId && (
              <p className="text-[11px] text-[#9b9c92] text-center mt-2.5">
                {products.length === 0 ? "请先上传产品图" : scenes.length === 0 ? "请添加至少一个场景" : "本月余额充足 · 任务后台运行"}
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* 场景图选择弹窗 */}
      {scenePickerOpen && (
        <div className="fixed inset-0 bg-[#23251d]/50 z-50 flex items-center justify-center p-4" onClick={() => setScenePickerOpen(false)}>
          <div className="bg-white rounded-[10px] shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <header className="p-4 border-b border-[#dcdfd2] flex justify-between items-center">
              <h3 className="text-sm font-bold text-[#23251d] flex items-center gap-2"><Camera className="w-4 h-4 text-[#b17816]" /> 选场景图</h3>
              <button onClick={() => setScenePickerOpen(false)} className="text-[#9b9c92] hover:text-[#23251d]"><X size={18} /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              {sceneGroups.length === 0 ? (
                <div className="text-sm text-[#9b9c92] text-center py-12">场景库为空，去 <a href="/admin/scenes" className="text-[#b17816] underline">/admin/scenes</a> 添加</div>
              ) : (() => {
                const names = sceneGroups.map((g) => g.key);
                const active = imageTab && names.includes(imageTab) ? imageTab : names[0];
                const items = sceneGroups.find((g) => g.key === active)?.items || [];
                return (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-3 border-b border-[#e5e7e0] pb-3 sticky top-0 bg-white z-10">
                      {names.map((n) => {
                        const on = n === active;
                        return (
                          <button key={n} type="button" onClick={() => setImageTab(n)}
                            className={"px-3 py-1.5 rounded-[6px] text-xs font-semibold border transition-all " + (on ? "bg-[#f7a501] text-[#23251d] border-[#f7a501]" : "text-[#6c6e63] hover:bg-[#e5e7e0] border-transparent")}>
                            {n}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
                      {items.map((sc) => {
                        const added = scenes.some((x) => x.type === "image" && x.scene_id === sc.id);
                        return (
                          <button key={sc.id} onClick={() => { if (!added) addImageScene(sc); }} disabled={added}
                            className={"relative rounded-[8px] overflow-hidden border transition-all " + (added ? "border-2 border-[#f7a501] ring-4 ring-[#fbedca] cursor-not-allowed" : "border border-[#dcdfd2] hover:border-[#f3c14e]")}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={sc.image_url} alt={sc.name} className="w-full aspect-[3/4] object-cover" />
                            <div className="px-1 py-0.5 text-[10px] text-[#4d4f46] truncate text-center">{sc.name}</div>
                            {added && (
                              <div className="absolute top-1.5 right-1.5 rounded-full bg-[#f7a501] text-[#23251d] p-1 shadow-md flex items-center justify-center">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
            <footer className="p-3 border-t border-[#dcdfd2] flex justify-end">
              <button onClick={() => setScenePickerOpen(false)} className="bg-[#f7a501] hover:bg-[#dd9001] text-[#23251d] text-xs font-bold px-4 py-2 rounded-[6px]">完成</button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
