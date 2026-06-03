/**
 * Scene Tools — 家居软品场景图（统一工具）· v3 加焦点开关 + 特写 + 材质词库
 * v6: 加 hasBackReference + IMAGE 3（背部参考）
 *
 *   产品图（家居软品）+ 场景描述 → 把产品重新摆入该场景拍摄
 *
 * 场景有两种描述方式：
 *   1. 文字场景（free text）—— 模型自由发挥取景 / 光线 / 构图
 *   2. 图片场景（plate）—— 模型把 plate 当氛围参考
 */

import {
  buildFramingBlock,
  type FocusMode,
  type CloseupKey,
  type PoseMode,
} from "./scene-tools-prompt";

export interface SceneShootOpts {
  sceneText?: string;
  userHint?: string;
  focusMode?: FocusMode;
  kind?: "regular" | "closeup";
  variantIdx?: number;
  variantTotal?: number;
  closeupKey?: CloseupKey;
  materialDetailsText?: string;
  sceneTotalItems?: number;
  /** 背部参考图（IMAGE 3）是否随请求附带。kind=closeup + isBack 时才有意义 */
  hasBackReference?: boolean;
  /** v7: 姿势模式（editorial 杂志大片 / interactive 场景互动），默认 editorial */
  poseMode?: PoseMode;
  /** v7: 杂志大片随机组合的种子（一般为 job.id + ":" + variant_idx） */
  variantSeed?: string;
}

export function buildSceneShootText(
  sceneText: string,
  userHint?: string,
  opts: Omit<SceneShootOpts, "sceneText" | "userHint"> = {},
): string {
  const sceneClean = sceneText.trim();
  const userHintBlock = userHint?.trim()
    ? `\n══════════════════════════════════════════════════════════
👤 USER ADDITIONAL HINT
══════════════════════════════════════════════════════════

${userHint.trim()}\n`
    : "";

  const framingBlock = buildFramingBlock({
    focusMode: opts.focusMode ?? "model_first",
    kind: opts.kind ?? "regular",
    variantIdx: opts.variantIdx,
    variantTotal: opts.variantTotal,
    closeupKey: opts.closeupKey,
    materialDetailsText: opts.materialDetailsText,
    hasBackReference: opts.hasBackReference,
    poseMode: opts.poseMode ?? "editorial",
    variantSeed: opts.variantSeed,
  });

  const sceneConsistencyBlock =
    (opts.sceneTotalItems ?? 1) > 1
      ? `\n══════════════════════════════════════════════════════════
🎬 同场景多变体背景一致
══════════════════════════════════════════════════════════

本次提交在该场景下要出 ${opts.sceneTotalItems} 张图（含常规变体 + 特写镜头）。
这 ${opts.sceneTotalItems} 张必须是"同一地点、同一时段、同一光线方向"——
都来自同一次拍摄，不允许换日时段、换天气、换背景。\n`
      : "";

  // 文字场景 + 特写 + 有背部参考图 → IMAGE 2 是背部图（无场景 plate 时）
  const inputImagesIntro = opts.hasBackReference
    ? `You will receive TWO images:

▸ IMAGE 1 — A product photograph of a home textile item (front).
   THAT BACKGROUND WILL BE COMPLETELY DISCARDED.
▸ IMAGE 2 — BACK VIEW reference of the same product (for back closeup).`
    : `You will receive ONE image:

▸ IMAGE 1 — A product photograph of a home textile item in some
   prior background. THAT BACKGROUND WILL BE COMPLETELY DISCARDED.`;

  // 文字模式下没有场景 plate，所以背部参考图占用 IMAGE 2 的位置；
  // 在 framingBlock 内提到的 IMAGE 3 在文字模式下其实是 IMAGE 2，
  // 这里加一句说明让模型不要混淆。
  const indexRemap = opts.hasBackReference
    ? `\n（注：本请求只有 2 张图。framing block 里提到的 IMAGE 3「背部参考」在本请求中是 IMAGE 2，对应规则不变。）\n`
    : "";

  return `${inputImagesIntro}

══════════════════════════════════════════════════════════
🚨 TASK — Re-shoot the same home textile product at a new scene
══════════════════════════════════════════════════════════

This is NOT pixel-edit. This is a brand-new photograph captured ON
LOCATION at the scene described below, using IMAGE 1 only as
"this is the product, fabric and construction" reference.

══════════════════════════════════════════════════════════
🎬 THE SCENE (describe what to photograph)
══════════════════════════════════════════════════════════

${sceneClean}

══════════════════════════════════════════════════════════
✅ KEEP FROM IMAGE 1
══════════════════════════════════════════════════════════

- Product identity: category, silhouette, thickness, scale and proportions
- Product construction: color, fabric, filling loft, seams, piping, quilting, zipper, tags, embroidery, print, hems, ALL visible details
- Styling props that already belong to the product set

══════════════════════════════════════════════════════════
🎬 RENDER FRESH FOR THE NEW SCENE
══════════════════════════════════════════════════════════

- Background: 100% the described scene
- Lighting: 100% from the scene description (match temperature,
  direction, time-of-day)
- Product scale must read as a real object at correct scale to
  anything visible in the scene.
- Edges of the product lit organically by the scene's light, never
  a "cut-out / pasted-on" composite feel.

${framingBlock}
${indexRemap}
${sceneConsistencyBlock}
══════════════════════════════════════════════════════════
❌ FORBIDDEN
══════════════════════════════════════════════════════════

- Modifying product color, fabric, design, construction, or details
- Adding or implying a human model, mannequin, body parts, try-on logic, shoes, or fashion styling
- "Pasted-on" composite look (product lit differently from scene)
- Concept art / painted look / 3D render aesthetic
- Watermarks, text, logos
- Returning IMAGE 1 with only minor edits
${userHintBlock}
══════════════════════════════════════════════════════════
OUTPUT
══════════════════════════════════════════════════════════

Output ONE photograph. Looks like a real home textile product photograph
taken on location at the described scene.
`;
}

export function buildSceneShootImage(
  scenePlateName?: string,
  userHint?: string,
  opts: Omit<SceneShootOpts, "sceneText" | "userHint"> = {},
): string {
  const sceneHint = scenePlateName
    ? `\n  Scene location name: "${scenePlateName}"`
    : "";
  const userHintBlock = userHint?.trim()
    ? `\n══════════════════════════════════════════════════════════
👤 USER ADDITIONAL HINT
══════════════════════════════════════════════════════════

${userHint.trim()}\n`
    : "";

  const framingBlock = buildFramingBlock({
    focusMode: opts.focusMode ?? "model_first",
    kind: opts.kind ?? "regular",
    variantIdx: opts.variantIdx,
    variantTotal: opts.variantTotal,
    closeupKey: opts.closeupKey,
    materialDetailsText: opts.materialDetailsText,
    hasBackReference: opts.hasBackReference,
    poseMode: opts.poseMode ?? "editorial",
    variantSeed: opts.variantSeed,
  });

  const sceneConsistencyBlock =
    (opts.sceneTotalItems ?? 1) > 1
      ? `\n══════════════════════════════════════════════════════════
🎬 同场景多变体背景一致
══════════════════════════════════════════════════════════

本次提交在该场景下要出 ${opts.sceneTotalItems} 张图（含常规变体 + 特写镜头）。
这 ${opts.sceneTotalItems} 张必须是"同一地点、同一时段、同一光线方向"——
都来自 IMAGE 2 那个空间，常规变体取宽景，特写仅是镜头拉近 + 大光圈虚化背景，
绝不允许换天气、换日时段、换不同的房间。\n`
      : "";

  // 图片场景模式：IMAGE 2 永远是场景 plate；背部参考图在 IMAGE 3
  const inputImagesIntro = opts.hasBackReference
    ? `You will receive THREE images:

▸ IMAGE 1 — A product photograph of a home textile item (front)
   (the product shape, fabric, seams and details are what we keep; the original background
   is to be DISCARDED).
▸ IMAGE 2 — The new location / scene where to style it.${sceneHint}
▸ IMAGE 3 — BACK VIEW reference of the same product (for back closeup).`
    : `You will receive TWO images:

▸ IMAGE 1 — A product photograph of a home textile item
   (the product shape, fabric, seams and details are what we keep; the original background
   is to be DISCARDED).
▸ IMAGE 2 — The new location / scene where to style it.${sceneHint}`;

  return `${inputImagesIntro}

══════════════════════════════════════════════════════════
🚨 TASK — Place the product from IMAGE 1 into IMAGE 2's location,
              naturally styled in that space
══════════════════════════════════════════════════════════

This is NOT pixel-paste editing, and it's NOT just "reuse a background with a pasted product". This is a brand-new photograph where the
product NATURALLY SITS ON OR RELATES TO the furniture, bedding, sofa, chair, table, tray or fabric layers
visible in IMAGE 2. The placement must arise from what is actually in
IMAGE 2.

⚠️ IMPORTANT: Use IMAGE 2 only as "atmosphere / lighting / palette /
materials" reference. Do NOT replicate IMAGE 2's framing or subject
scale — even if IMAGE 2 shows a huge wide environment with tiny figures
or no figure at all, your output must follow the framing block below
(not IMAGE 2's framing).

══════════════════════════════════════════════════════════
✅ KEEP FROM IMAGE 1
══════════════════════════════════════════════════════════

- Product identity: category, silhouette, thickness, scale and proportions
- Product construction: color, fabric, filling loft, seams, piping, quilting, zipper, tags, embroidery, print, hems, ALL visible details
- Styling props that already belong to the product set

══════════════════════════════════════════════════════════
🎬 USE IMAGE 2 AS THE LOCATION
══════════════════════════════════════════════════════════

- Background: 100% IMAGE 2's setting (architecture, props, materials,
  palette all come from IMAGE 2)
- Lighting: 100% from IMAGE 2's natural light — match color temperature,
  direction, time-of-day; re-light the product fabric and edges accordingly

${framingBlock}
${sceneConsistencyBlock}
══════════════════════════════════════════════════════════
❌ FORBIDDEN
══════════════════════════════════════════════════════════

- Modifying product color, fabric, design, construction, or details
- Adding or implying a human model, mannequin, body parts, try-on logic, shoes, or fashion styling
- "Pasted-on" composite look (product lit differently from scene)
- Adding people, mannequins, body parts, shoes, fashion props, or major decorations not in IMAGE 2
- Concept art / painted look / 3D render aesthetic
- Watermarks, text, logos
${userHintBlock}
══════════════════════════════════════════════════════════
OUTPUT
══════════════════════════════════════════════════════════

Output ONE photograph. Looks like the home textile product was actually
styled and photographed on location at IMAGE 2's venue.
`;
}
