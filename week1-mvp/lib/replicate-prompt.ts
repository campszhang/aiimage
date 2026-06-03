/**
 * 仿图（Replicate）prompt 构造器
 *
 * 目标：上传一张「参考图」，用我们自己的模特 + 服装复刻出同款照片。
 *   - 复刻：姿势 + 构图 + 场景 + 光线（全部照搬参考图）
 *   - 替换：人物身份 + 服装（100% 用我方产品图）
 *   - 多人：参考图 N 人 → N 张产品图按位置映射（左→IMAGE 2，右→IMAGE 3 …）
 *
 * 图片顺序（喂给模型）：
 *   IMAGE 1            = 参考图（REFERENCE，要复刻的样子）
 *   IMAGE 2 .. N+1     = 我方产品图（每张含一个模特+服装，对应参考图里 1 个人物槽位）
 *
 * 变体：base 模式严格复刻；variant 模式复用 scene-tools v7 的杂志大片随机组合，
 *       在「保持参考图场景/构图」的前提下扰动姿势/角度/镜头。
 */

import {
  buildEditorialCombo,
  type FocusMode,
} from "./scene-tools-prompt";

/* ─────────────────────────────────────────────────────────
 *  氛围 / 表情 / 人物互动预设（单选，全部图统一用一种）
 *
 *  只控制人物的表情、神态、互动；不动参考图的场景/构图/光线，
 *  也不动我方模特的身份和服装。
 * ───────────────────────────────────────────────────────── */
export type MoodKey =
  | "none"
  | "as_reference"
  | "cheerful"
  | "intimate"
  | "gentle"
  | "editorial_cold";

export interface MoodPreset {
  key: MoodKey;
  label: string;
  /** 进 prompt 的氛围描述（none 为空字符串） */
  prompt: string;
}

export const MOOD_PRESETS: MoodPreset[] = [
  {
    key: "none",
    label: "不控制（模型自由发挥）",
    prompt: "",
  },
  {
    key: "as_reference",
    label: "按照原图（氛围与参考图一致）",
    prompt: `氛围 / 表情 / 人物互动严格"跟参考图（IMAGE 1）保持一致"：
- 仔细观察参考图里人物的表情（笑 / 不笑 / 眼神 / 情绪）和人物之间的互动（是否交谈、对视、肢体接触、还是各自独立），在成片里用我方模特还原同样的氛围。
- 参考图里笑就让模特笑，参考图冷淡疏离就保持冷淡疏离，参考图有亲密互动就还原同样的互动关系与肢体距离。
- 只复刻"情绪和互动关系"，不复刻参考图里那个人的长相。`,
  },
  {
    key: "cheerful",
    label: "欢快交谈大笑",
    prompt: `整体氛围欢快热闹，像姐妹聚会被抓拍下来的瞬间：
- 表情：真实的笑（眼睛带笑意、苹果肌上提），不是僵硬摆拍的假笑
- 互动：彼此说话、回应、互看，或一起看向画面外某处，有"正在发生的对话"的动态感
- 肢体：放松、有交流的小动作（侧头、抬手、靠近），不是各自呆站
- 多人时人物之间有眼神和动作的呼应，像真的在一起玩闹`,
  },
  {
    key: "intimate",
    label: "亲密互动",
    prompt: `整体氛围亲密温暖，人物之间有自然的肢体接触和情感连接：
- 互动：挽手 / 搭肩 / 轻拥 / 并肩依靠 / 一人帮另一人理裙摆或头发
- 表情：温柔的笑、对视、低头浅笑，有姐妹间的亲昵感
- 肢体：身体距离近、姿态相互交叠，但保持优雅不拥挤
- 多人时形成自然的"依偎/抱团"构图，传递亲密关系`,
  },
  {
    key: "gentle",
    label: "温柔安静",
    prompt: `整体氛围温柔安静、优雅克制：
- 表情：轻柔的微笑或平静放松的神情，眼神柔和，可看镜头也可看远方
- 互动：安静地站在一起，偶有轻微的眼神交流，不喧闹
- 肢体：舒展、放松、端庄的姿态，有呼吸感的自然站姿
- 整体像清晨柔光下安静的一刻，情绪内敛而高级`,
  },
  {
    key: "editorial_cold",
    label: "高级冷感",
    prompt: `整体氛围高级时装大片式的冷感与疏离：
- 表情：中性、不笑或极轻微表情，眼神坚定或放空，杂志封面式的高级脸
- 互动：人物之间保持适度距离与独立感，不刻意互动，各自有强存在感
- 肢体：利落、有张力、带设计感的站姿，下颌微抬，姿态自信
- 整体克制冷静，像 Vogue / 高定大片，强调服装与气场`,
  },
];

export function getMoodPreset(key?: string): MoodPreset | undefined {
  if (!key) return undefined;
  return MOOD_PRESETS.find((m) => m.key === key);
}

export interface ReplicateRefInfo {
  person_count: number;
  persons: Array<{ position: string; pose: string }>;
  scene: string;
  lighting: string;
  composition: string;
  overall: string;
}

export interface ReplicateOpts {
  /** 参考图分析结果（来自 /api/replicate/analyze） */
  ref: ReplicateRefInfo;
  /** 产品图数量 = 人物槽位数量 */
  productCount: number;
  /** base 严格复刻 / variant 随机扰动 */
  kind: "base" | "variant";
  /** 变体序号 / 总数（kind=variant 时用于随机种子） */
  variantIdx?: number;
  variantTotal?: number;
  /** 变体随机组合的种子（job.id + ":" + idx） */
  variantSeed?: string;
  /** 变体扰动的画面焦点（决定镜头库，默认 model_first） */
  focusMode?: FocusMode;
  /** 材质词库文本（formatMaterialDetails 输出，可选） */
  materialDetailsText?: string;
  /** 氛围 / 表情 / 人物互动预设（单选；none 或不传 = 跟参考图） */
  mood?: MoodKey;
  /** 用户追加提示 */
  userHint?: string;
}

// 多人位置映射说明
function buildSlotMapping(ref: ReplicateRefInfo, productCount: number): string {
  const n = Math.min(productCount, Math.max(1, ref.person_count || productCount));
  if (n <= 1) {
    return `参考图里是单人。把这个人物替换成 IMAGE 2 里的模特 + 服装。`;
  }
  const lines: string[] = [
    `参考图里有 ${n} 个人物。按"从左到右"顺序，把每个人物替换成对应产品图里的模特 + 服装：`,
  ];
  for (let i = 0; i < n; i++) {
    const p = ref.persons[i];
    const posPose = p ? `（位置：${p.position}；原姿势：${p.pose}）` : "";
    lines.push(`  - 第 ${i + 1} 个人物${posPose} → IMAGE ${i + 2} 的模特 + 服装`);
  }
  lines.push(
    `每个槽位严格用对应产品图的人物身份和服装，绝不张冠李戴、绝不互相串脸串衣服。`,
  );
  return lines.join("\n");
}

export function buildReplicatePrompt(opts: ReplicateOpts): string {
  const {
    ref,
    productCount,
    kind,
    variantIdx,
    variantTotal,
    variantSeed,
    focusMode,
    materialDetailsText,
    mood,
    userHint,
  } = opts;

  const totalImgs = productCount + 1; // IMAGE 1 参考 + N 产品
  const productList = Array.from(
    { length: productCount },
    (_, i) => `IMAGE ${i + 2}`,
  ).join(" / ");

  const slotMapping = buildSlotMapping(ref, productCount);

  // 变体扰动指令（仅 variant 模式）
  let variantBlock = "";
  if (kind === "variant") {
    const combo = buildEditorialCombo(
      variantSeed || `replicate:${variantIdx ?? 1}`,
      focusMode ?? "model_first",
    );
    variantBlock = `\n══════════════════════════════════════════════════════════
🎲 本张是仿图变体（第 ${variantIdx ?? 1}/${variantTotal ?? 1} 张 · 杂志大片扰动）
══════════════════════════════════════════════════════════

在"保持参考图同一场景 / 同一光线 / 同一机位风格"的大前提下，对姿势和取景做
编辑大片式的随机扰动，让这张跟严格复刻版明显不同：

- 姿势微调：${combo.pose}
- 相机角度：${combo.angle}
- 镜头焦距：${combo.lens}
- 取景：${combo.framing}
- 构图位置：${combo.composition}
- 视线 / 情绪：${combo.gaze}

⚠️ 场景背景仍是参考图那个地方（不许换景），只是模特换个姿势、摄影师换个机位再拍一张。`;
  }

  // 氛围 / 表情 / 人物互动（单选；none 不输出）
  const moodPreset = getMoodPreset(mood);
  const moodBlock =
    moodPreset && moodPreset.prompt
      ? `\n══════════════════════════════════════════════════════════
🎭 氛围 / 表情 / 人物互动（${moodPreset.label}）
══════════════════════════════════════════════════════════

${moodPreset.prompt}

⚠️ 这一项只改人物的"表情 / 神态 / 互动动作"，用来营造上面这种氛围。
   场景 / 构图 / 光线仍严格照参考图；每个模特的脸、身份、肤色、发型和服装
   仍 100% 用对应产品图，绝不因为换表情就改脸或改衣服。`
      : "";

  const materialBlock = materialDetailsText
    ? `\n══════════════════════════════════════════════════════════
🧵 服装材质（按词库精确刻画）
══════════════════════════════════════════════════════════

${materialDetailsText}

请按上面材质规则准确刻画衣物的视觉特征、光线行为和纹理质感。`
    : "";

  const userHintBlock = userHint?.trim()
    ? `\n══════════════════════════════════════════════════════════
👤 用户追加指令
══════════════════════════════════════════════════════════

${userHint.trim()}`
    : "";

  return `You will receive ${totalImgs} images:

▸ IMAGE 1 — REFERENCE 参考图：要复刻的"样子"（姿势 / 构图 / 场景 / 光线）。
   ⚠️ 参考图里的人物长相和服装【完全不要】，只复刻它的"摆法和场景"。
▸ ${productList} — 我方产品图：每张含一个模特 + 一件服装，这才是最终成片里要出现的人和衣服。

══════════════════════════════════════════════════════════
🚨 TASK — 仿图：用我方模特+服装，复刻参考图的姿势/构图/场景/光线
══════════════════════════════════════════════════════════

这不是把参考图换个人脸，也不是像素编辑。这是【重新拍一张】：
布景、机位、灯光、模特站位姿势 都照参考图来，但镜头里站的是我方产品图里的
模特，穿的是我方产品图里的服装。

══════════════════════════════════════════════════════════
🎭 人物 / 服装 槽位映射
══════════════════════════════════════════════════════════

${slotMapping}

══════════════════════════════════════════════════════════
📋 从参考图 IMAGE 1 复刻（不要改）
══════════════════════════════════════════════════════════

- 场景 / 背景：${ref.scene}
- 光线：${ref.lighting}
- 构图 / 取景 / 机位：${ref.composition}
- 整体风格：${ref.overall}
- 每个人物的姿势 / 朝向 / 动作：严格按参考图（除非下面变体指令另有要求）

══════════════════════════════════════════════════════════
🔒 从我方产品图复刻（必须 100% 保持）
══════════════════════════════════════════════════════════

- 每个模特的脸 / identity / 肤色 / 发色发型：用对应产品图，不许改、不许串
- 每件服装的颜色 / 面料 / 剪裁 / 长度 / 领口 / 袖型 / 装饰：用对应产品图，100% 还原
- 不要把参考图里那个人的脸或衣服带进来
${variantBlock}
${moodBlock}
${materialBlock}

══════════════════════════════════════════════════════════
📸 真实摄影质感（不可妥协）
══════════════════════════════════════════════════════════

- 皮肤：毛孔 / 细绒毛 / 自然瑕疵，禁止磨皮塑料感
- 头发：每根发丝可辨，禁止 CGI 塑料质感
- 胶片质感（Kodak Portra / Fuji 400H 一类），自然颗粒，禁止过度后期 over-smoothing
- 身体比例真人尺度；模特身上的光与场景一致，不要"贴上去"的合成感
${userHintBlock}

══════════════════════════════════════════════════════════
❌ FORBIDDEN
══════════════════════════════════════════════════════════

- 改我方服装的颜色 / 面料 / 设计
- 用参考图里的人脸或服装
- 多人时串脸 / 串衣服 / 搞错槽位
- 卡通 / 绘画 / 3D 渲染感；水印；文字

══════════════════════════════════════════════════════════
OUTPUT
══════════════════════════════════════════════════════════

输出 ONE 张照片：看起来就是我方模特穿我方服装，在参考图那个场景里、按参考图的
机位和姿势重新拍的一张真实时尚摄影作品。`;
}
