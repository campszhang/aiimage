import { resolveModelId } from "./ai-models";
import { buildGenaiClient } from "./genai-client";

/**
 * 家居软品属性结构化 schema
 * responseSchema 使用 JSON schema 子集
 *
 * 注意：部分 key 仍沿用历史名字（如 面料材质 / 装饰细节），下游会读取这些
 * 字段做材质匹配和 prompt 拼接。
 */
const garmentSchema = {
  type: "object",
  properties: {
    产品类目: {
      type: "string",
      description:
        "产品类目：枕头、枕套、眼罩、发圈、凉感被、夏被、羽绒被，或最接近的家居软品类目",
    },
    主色调: {
      type: "string",
      description: "产品主色调的中文描述（如：云朵白、燕麦米、雾蓝、炭灰）",
    },
    整体版型: {
      type: "string",
      description:
        "整体形态（如：方形枕套、长方枕、蓬松羽绒被、轻薄夏被、丝绸眼罩、褶皱发圈）",
    },
    长度: {
      type: "string",
      description:
        "尺寸/厚度/蓬松度描述（如：薄款、厚实蓬松、标准枕套尺寸、轻薄被芯）",
    },
    领口设计: {
      type: "string",
      description:
        "边缘/开口设计（如：包边、滚边、信封口、拉链口、绗缝边、松紧褶边；看不到填未提供）",
    },
    袖型: {
      type: "string",
      description:
        "结构/分区（如：绗缝格、压线、褶皱、立体填充、平滑片状；没有填未提供）",
    },
    后背设计: {
      type: "string",
      description:
        "背面/反面/闭合方式（如：背面纯色、隐藏拉链、信封式开口、反面不可见填未提供）",
    },
    面料材质: {
      type: "string",
      description:
        "面料/填充（如：长绒棉、桑蚕丝、凉感纤维、水洗棉、天鹅绒、羽绒填充）",
    },
    装饰细节: {
      type: "array",
      items: { type: "string" },
      description:
        "核心细节列表（如：包边、车线、绗缝、刺绣、印花、拉链、标签、褶皱、丝绸高光）",
    },
    场景建议: {
      type: "array",
      items: { type: "string" },
      description:
        "适合的拍摄场景（如：卧室床品、客厅沙发、酒店床铺、夏日凉感、详情微距）",
    },
  },
  required: [
    "产品类目",
    "主色调",
    "整体版型",
    "长度",
    "领口设计",
    "袖型",
    "后背设计",
    "面料材质",
    "装饰细节",
    "场景建议",
  ],
};

const SYSTEM_PROMPT = `你是一位专业的家居软品视觉分析师，专注于枕头、枕套、眼罩、发圈、凉感被、夏被、羽绒被等商品。
用户会上传产品图、白底图、实拍图或细节图。
请基于图片提取结构化的商品属性，用中文输出，保持描述精简、商品化、可用于电商出图 prompt。
不要猜测图片里看不到的部分；看不到就填"未提供"。不要按服装的领口/袖型逻辑脑补。`;

/**
 * 调用 Vertex AI Gemini 做视觉解析，返回结构化 JSON
 *
 * 鉴权优先 API Key（GOOGLE_CLOUD_API_KEY），否则回落 ADC。
 * 详见 lib/genai-client.ts。
 *
 * @param images  图片列表
 * @param modelOverride  调用方指定模型 ID（会经白名单校验）。不传则走 DB 默认
 */
export async function analyzeGarment(
  images: { buffer: Buffer; mimeType: string }[],
  modelOverride?: string,
) {
  const MODEL = resolveModelId("vision", modelOverride);
  const ai = buildGenaiClient();

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [
    {
      text: `请分析以下 ${images.length} 张家居软品图片，提取结构化商品属性。重点关注类目、形状、面料、填充蓬松度、边缘/开口、绗缝/车线、图案和适合的家居拍摄场景。`,
    },
    ...images.map((img) => ({
      inlineData: {
        mimeType: img.mimeType || "image/jpeg",
        data: img.buffer.toString("base64"),
      },
    })),
  ];

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: garmentSchema,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error(
      "Gemini 未返回内容，请检查：admin → 系统设置 里 API Key 是否已配置且有效。",
    );
  }

  try {
    const parsed = JSON.parse(text);
    // 把 usageMetadata 塞到 _meta 字段里，供计费用
    parsed._meta = {
      model: MODEL,
      usageMetadata: response.usageMetadata,
    };
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`模型返回的 JSON 无法解析：${msg}\n原始响应：${text}`);
  }
}


/* ─────────────────────────────────────────────────────────
 *  仿图：分析参考图（人数 + 每人姿势/位置 + 场景 + 光线 + 构图）
 * ───────────────────────────────────────────────────────── */

const referenceSchema = {
  type: "object",
  properties: {
    person_count: {
      type: "integer",
      description: "参考图里出现的人物（模特）数量，0 表示没有人物",
    },
    persons: {
      type: "array",
      description: "每个人物的位置与姿势，按从左到右排序",
      items: {
        type: "object",
        properties: {
          position: {
            type: "string",
            description:
              "该人物在画面中的位置（如：最左 / 左 / 中 / 右 / 最右；单人时填'中'）",
          },
          pose: {
            type: "string",
            description:
              "该人物的姿势/朝向/动作简述（如：3/4 侧身站立、一手扶栏杆、回眸、坐姿）",
          },
        },
        required: ["position", "pose"],
      },
    },
    scene: {
      type: "string",
      description: "背景场景描述（地点、建筑、家具、植物、道具、色调）",
    },
    lighting: {
      type: "string",
      description: "光线描述（方向、色温、时段、硬/柔、是否逆光/侧光）",
    },
    composition: {
      type: "string",
      description: "构图与取景（机位高度、焦段感、景别、人物在画面的占比与位置）",
    },
    overall: {
      type: "string",
      description: "一句话整体风格概括（用于人快速判断）",
    },
  },
  required: ["person_count", "persons", "scene", "lighting", "composition", "overall"],
};

const REFERENCE_SYSTEM_PROMPT = `你是一位专业的时尚摄影分析师。
用户上传一张"参考图"，目的是之后用自己的模特和服装复刻出同款构图的照片。
请客观分析这张参考图：有几个人、每个人的位置和姿势、背景场景、光线、构图取景。
- 只描述你确实看到的，不要脑补。
- 人物从左到右排序，位置用"最左/左/中/右/最右"这类相对词。
- 描述要精准且可执行（让另一位摄影师照着能复刻）。
- 不要描述人物长相/服装细节（那些会被替换成用户自己的），只描述姿势/朝向/动作。`;

export interface ReferenceAnalysis {
  person_count: number;
  persons: Array<{ position: string; pose: string }>;
  scene: string;
  lighting: string;
  composition: string;
  overall: string;
  _meta?: { model: string; usageMetadata?: unknown };
}

export async function analyzeReference(
  image: { buffer: Buffer; mimeType: string },
  modelOverride?: string,
): Promise<ReferenceAnalysis> {
  const MODEL = resolveModelId("vision", modelOverride);
  const ai = buildGenaiClient();

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [
    { text: "请分析这张参考图，提取人数 / 每人姿势位置 / 场景 / 光线 / 构图。" },
    {
      inlineData: {
        mimeType: image.mimeType || "image/jpeg",
        data: image.buffer.toString("base64"),
      },
    },
  ];

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: REFERENCE_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: referenceSchema,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error(
      "Gemini 未返回内容，请检查 admin → 系统设置 里 API Key 是否已配置且有效。",
    );
  }
  try {
    const parsed = JSON.parse(text) as ReferenceAnalysis;
    parsed._meta = { model: MODEL, usageMetadata: response.usageMetadata };
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`模型返回的 JSON 无法解析：${msg}\n原始响应：${text}`);
  }
}
