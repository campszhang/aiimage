import { resolveModelId } from "./ai-models";
import { buildGenaiClient } from "./genai-client";

/**
 * 服装属性结构化 schema
 * responseSchema 使用 JSON schema 子集
 */
const garmentSchema = {
  type: "object",
  properties: {
    主色调: {
      type: "string",
      description: "衣服主色调的中文描述（如：淡粉色、酒红色、香槟金）",
    },
    整体版型: {
      type: "string",
      description: "版型描述（如：A 字裙、直筒、修身、高腰）",
    },
    长度: {
      type: "string",
      description: "衣长或裙长（如：及膝、中长款、拖地）",
    },
    领口设计: {
      type: "string",
      description: "领口样式（如：V 领、方领、一字肩、抹胸、高领）",
    },
    袖型: {
      type: "string",
      description: "袖型（如：无袖、短袖、灯笼袖、泡泡袖、长袖）",
    },
    后背设计: {
      type: "string",
      description: "背部设计（如：系带、拉链、露背、蝴蝶结）",
    },
    面料材质: {
      type: "string",
      description: "面料（如：雪纺、蕾丝、缎面、亮片、网纱）",
    },
    装饰细节: {
      type: "array",
      items: { type: "string" },
      description: "核心装饰点列表（如：蕾丝边、珠片、刺绣、褶皱、腰带）",
    },
  },
  required: [
    "主色调",
    "整体版型",
    "长度",
    "领口设计",
    "袖型",
    "后背设计",
    "面料材质",
    "装饰细节",
  ],
};

const SYSTEM_PROMPT = `你是一位专业的服装视觉分析师，专注于伴娘服、礼服、婚纱这类商品。
用户会上传服装的正面图和（可选的）背面图。
请基于图片提取结构化的服饰属性，用中文输出，保持描述精简、商品化、可用于电商描述。
不要猜测图片里看不到的部分（比如只给了正面就不要强行描述后背，填"未提供"即可）。`;

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
      text: `请分析以下 ${images.length} 张服装图片，提取结构化的服饰属性。`,
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
