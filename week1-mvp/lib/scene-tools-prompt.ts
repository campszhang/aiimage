/**
 * Scene Tools — home textile framing prompt library.
 *
 * The public API intentionally keeps old names such as FocusMode/model_first so
 * existing routes and persisted job params continue to work.
 */

export type FocusMode = "model_first" | "balanced" | "environmental";
export type PoseMode = "editorial" | "interactive";

const ANGLES = [
  "eye-level product photography, natural perspective",
  "slight overhead angle, clearly showing fabric surface and silhouette",
  "low bedside angle, emphasizing loft, thickness and soft volume",
  "45-degree three-quarter angle, showing top, side and edge construction",
  "straight-on catalog angle, clean and precise",
];

const LENSES = [
  "35mm environmental product lens",
  "50mm natural product lens",
  "70mm compressed e-commerce product lens",
  "85mm shallow-depth detail lens",
];

const FRAMINGS = [
  "full product visible, centered, no cropped corners or edges",
  "product fills 70-80% of frame, with small breathable margin",
  "layered bedding composition, product is the clear main subject",
  "soft lifestyle composition, product placed on bed/sofa/table with realistic contact shadow",
  "tight catalog hero shot, full outline readable at first glance",
];

const COMPOSITIONS = [
  "centered composition",
  "left third composition with negative space for e-commerce text",
  "right third composition with lifestyle context",
  "diagonal bedding fold composition",
  "symmetrical hotel-bed composition",
];

const PRODUCT_PLACEMENTS = [
  "placed naturally on a cream bedroom bed",
  "styled on a sofa with cushions and folded textile layers",
  "laid flat on a clean studio surface",
  "partly folded to reveal thickness and fabric handfeel",
  "stacked with related sleep accessories in a tidy still-life layout",
  "shown with one edge lifted slightly to reveal seam, piping or zipper detail",
];

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWith(rng: () => number, arr: string[]): string {
  const i = Math.floor(rng() * arr.length);
  return arr[Math.max(0, Math.min(arr.length - 1, i))];
}

export function buildEditorialCombo(
  seedStr: string,
  _focusMode: FocusMode,
): {
  pose: string;
  angle: string;
  lens: string;
  framing: string;
  composition: string;
  gaze: string;
} {
  const rng = mulberry32(strHash(seedStr));
  return {
    pose: pickWith(rng, PRODUCT_PLACEMENTS),
    angle: pickWith(rng, ANGLES),
    lens: pickWith(rng, LENSES),
    framing: pickWith(rng, FRAMINGS),
    composition: pickWith(rng, COMPOSITIONS),
    gaze: "no human gaze; product-only still life",
  };
}

export const CLOSEUP_PRESETS = [
  {
    key: "back" as const,
    label: "背面 / 开口细节",
    isBack: true,
    recommended: true,
    description:
      "背面或开口细节：展示枕套背封、拉链、标签、包边、绗缝背面或被子边缘结构。画面只出现产品和场景，不出现人体。",
  },
  {
    key: "side_waist" as const,
    label: "侧边厚度",
    isBack: false,
    recommended: true,
    description:
      "侧边厚度特写：展示枕头蓬松度、被芯厚度、包边立体感、发圈弹性褶皱或眼罩边缘弧度。",
  },
  {
    key: "chest_to_thigh" as const,
    label: "面料纹理",
    isBack: false,
    recommended: true,
    description:
      "面料纹理特写：相机靠近产品表面，呈现桑蚕丝高光、凉感面料细腻纹理、水洗棉褶皱、羽绒被绗缝线。",
  },
  {
    key: "lower_body_motion" as const,
    label: "褶皱垂坠",
    isBack: false,
    recommended: false,
    description:
      "褶皱垂坠特写：展示夏被或凉感被自然折叠后的柔软层次、垂坠边缘和真实阴影。",
  },
  {
    key: "neckline_shoulder" as const,
    label: "边缘包边",
    isBack: false,
    recommended: false,
    description:
      "边缘包边特写：展示车线、滚边、包边厚度、缝份和工艺精度，画面要清晰锐利。",
  },
  {
    key: "hand_on_waist" as const,
    label: "组合静物",
    isBack: false,
    recommended: true,
    description:
      "组合静物特写：眼罩、发圈、枕套或枕头按睡眠场景组合摆放，强调材质统一和礼盒感。",
  },
  {
    key: "hand_on_hip_back" as const,
    label: "标签 / 拉链",
    isBack: true,
    recommended: true,
    description:
      "标签或拉链特写：展示洗标、小织标、拉链开口、暗扣或枕套背部封口，不添加品牌文字水印。",
  },
  {
    key: "arms_overhead_back" as const,
    label: "绗缝格纹",
    isBack: true,
    recommended: false,
    description:
      "绗缝格纹特写：展示被类产品的格纹、填充区块和蓬松起伏，光线沿绗缝线形成自然明暗。",
  },
  {
    key: "lift_skirt_step" as const,
    label: "折叠层次",
    isBack: false,
    recommended: true,
    description:
      "折叠层次特写：产品被自然折起，露出内外面料、厚度、柔软度和真实接触阴影。",
  },
];

export type CloseupKey = (typeof CLOSEUP_PRESETS)[number]["key"];

export function isBackCloseupKey(key: CloseupKey | undefined): boolean {
  if (!key) return false;
  return CLOSEUP_PRESETS.find((p) => p.key === key)?.isBack === true;
}

function getFramingByFocus(focus: FocusMode): string {
  switch (focus) {
    case "model_first":
      return `画面焦点：产品主体占比 70-80%
- 产品必须是第一视觉焦点，完整可见，不裁切边缘、绑带、拉链、被角或发圈轮廓
- 背景只服务于商品，不抢主体
- 适合主图、详情页首屏、广告商品图`;
    case "balanced":
      return `画面焦点：产品与家居场景并重
- 产品占比 50-60%，床铺、沙发、台面等环境提供生活方式语境
- 适合展示搭配、套组和场景氛围
- 商品材质和轮廓仍必须清晰可辨`;
    case "environmental":
      return `画面焦点：家居氛围
- 产品占比 30-40%，场景叙事更强
- 适合横幅、社媒封面、氛围海报
- 即使占比较小，产品颜色、材质和类别仍需明确`;
  }
}

const PHOTO_REALISM_BLOCK = `══════════════════════════════════════════════════════════
📸 真实产品摄影质感
══════════════════════════════════════════════════════════

- 真实家居电商摄影，不是插画、3D 渲染或样机贴图
- 保留面料纤维、细微褶皱、自然压痕、包边车线、绗缝起伏、丝绸高光和凉感面料的微反光
- 产品和床、沙发、椅子、托盘或台面之间必须有可信接触阴影
- 光线方向、色温和场景一致，避免剪贴感
- 禁止真人、假人、身体部位、鞋、走秀、穿搭、服装上身逻辑`;

export interface FramingOpts {
  focusMode: FocusMode;
  kind: "regular" | "closeup";
  variantIdx?: number;
  variantTotal?: number;
  closeupKey?: CloseupKey;
  materialDetailsText?: string;
  hasBackReference?: boolean;
  poseMode?: PoseMode;
  variantSeed?: string;
}

export function buildFramingBlock(opts: FramingOpts): string {
  const {
    focusMode,
    kind,
    variantIdx,
    variantTotal,
    closeupKey,
    materialDetailsText,
    hasBackReference,
    poseMode,
    variantSeed,
  } = opts;

  let cameraBlock = "";
  if (kind === "closeup") {
    const preset = CLOSEUP_PRESETS.find((p) => p.key === closeupKey);
    if (!preset) throw new Error(`未知 closeup preset key: ${closeupKey}`);
    cameraBlock = `本张是「${preset.label}」特写镜头。\n${preset.description}`;
  } else {
    const idx = Math.max(1, variantIdx ?? 1);
    const total = Math.max(1, variantTotal ?? 1);
    const combo = buildEditorialCombo(variantSeed || `home:${idx}`, focusMode);
    const modeLabel = poseMode === "interactive" ? "场景摆放风格" : "电商摄影风格";
    cameraBlock = `本张是第 ${idx}/${total} 张常规变体（${modeLabel}）：

- 产品摆放：${combo.pose}
- 相机角度：${combo.angle}
- 镜头焦距：${combo.lens}
- 取景：${combo.framing}
- 构图位置：${combo.composition}

要求每张变体的摆放、角度或构图有明显差异，但产品本身完全一致。`;
  }

  const consistencyBlock =
    kind === "closeup"
      ? `══════════════════════════════════════════════════════════
🔒 一致性约束（特写）
══════════════════════════════════════════════════════════

- 产品颜色、面料、纹理、边缘、标签、拉链、绗缝、图案 100% 复刻 IMAGE 1
- 特写只改变镜头距离和焦点，不重新设计产品
- 背景可虚化，但必须来自同一空间和光线`
      : `══════════════════════════════════════════════════════════
🔒 一致性约束（常规）
══════════════════════════════════════════════════════════

- 产品类别、形状、厚度、比例、颜色、面料、所有工艺细节必须 100% 一致
- 不要把枕头改成靠垫、不要把凉感被改成毛毯、不要把眼罩/发圈改成饰品穿戴图
- 多变体看起来像同一组产品摄影，而不是不同商品合集`;

  const closeupOpticsBlock =
    kind === "closeup"
      ? `\n══════════════════════════════════════════════════════════
🎯 特写光学约束
══════════════════════════════════════════════════════════

- 大光圈浅景深，焦点落在产品面料或工艺细节
- 背景柔和虚化，但色温和材质来源仍与场景一致
- 面料纤维、边线、缝线、绗缝或丝绸高光必须清晰`
      : "";

  const backReferenceBlock =
    kind === "closeup" && closeupKey && isBackCloseupKey(closeupKey)
      ? `\n══════════════════════════════════════════════════════════
🔁 背部 / 反面参考
══════════════════════════════════════════════════════════

${
  hasBackReference
    ? "如请求中包含背面参考图，背封、拉链、标签、包边、绗缝反面和开口结构必须以该参考为准。"
    : "未提供背面参考时，基于 IMAGE 1 保守推断，不编造复杂结构。"
}`
      : "";

  const materialBlock = materialDetailsText
    ? `\n══════════════════════════════════════════════════════════
🧵 软品材质（按词库精确刻画）
══════════════════════════════════════════════════════════

${materialDetailsText}`
    : "";

  const productMainImageBlock =
    kind === "closeup"
      ? ""
      : `\n══════════════════════════════════════════════════════════
📐 商品主图目标
══════════════════════════════════════════════════════════

输出是枕头、枕套、眼罩、发圈、凉感被、夏被或羽绒被的产品图。

${getFramingByFocus(focusMode)}

❌ 严禁：人体佩戴图、真人试用图、服装穿搭、鞋、走秀、只露局部导致看不出完整商品`;

  const placementBlock =
    kind === "closeup"
      ? ""
      : `\n══════════════════════════════════════════════════════════
🎬 读场景，自然摆放
══════════════════════════════════════════════════════════

读 IMAGE 2 / 场景描述，找出床、沙发、椅子、台面、托盘、床头柜、窗帘、织物层次。
产品必须自然放置其上：平铺、折叠、叠放、靠放、半卷、露出边缘或与套组组合。
避免浮空、比例错误、剪贴感和不合理悬挂。`;

  const hardConstraints = `\n══════════════════════════════════════════════════════════
🔒 硬约束
══════════════════════════════════════════════════════════

1. 只生成产品和家居场景，不生成真人、假人、身体部位或穿搭
2. 产品比例真实：枕头、眼罩、发圈、被类的尺度要与床、沙发、台面匹配
3. 产品受光必须来自场景光源，接触阴影自然
4. 产品本身完全来自 IMAGE 1，不改类目、不改结构、不改颜色`;

  return [
    cameraBlock,
    productMainImageBlock,
    closeupOpticsBlock,
    placementBlock,
    consistencyBlock,
    backReferenceBlock,
    materialBlock,
    PHOTO_REALISM_BLOCK,
    hardConstraints,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const FRAMING_TIGHT_SINGLE = buildFramingBlock({
  focusMode: "model_first",
  kind: "regular",
  variantIdx: 1,
  variantTotal: 1,
  poseMode: "interactive",
});

export function getVariantCameraHint(
  variantIdx: number,
  variantTotal: number,
): string {
  return buildFramingBlock({
    focusMode: "balanced",
    kind: "regular",
    variantIdx,
    variantTotal,
    poseMode: "interactive",
    variantSeed: `variant:${variantIdx}:${variantTotal}`,
  });
}
