/**
 * 鞋款资源库
 *
 * 19 款实物鞋图（13 成人 + 6 儿童），每款一段不含颜色的款式描述。
 * 颜色让模型按服装自行搭配（不锁色）。
 *
 * 用途：
 *   - 前端 batch-photo 鞋款选择器渲染（thumb + name）
 *   - 后端注入 prompt 模板的 {{shoe_spec}} 占位符
 *
 * audience 推断（基于 identity.category）：
 *   - "universal" / "plus_size" / "maternity" / 其它 → "adult"
 *   - "teen" / "child" / "kid" → "kid"
 */

export type ShoeAudience = "adult" | "kid";

export type ShoeStyle = {
  /** stable id，前端/后端共用 */
  id: string;
  audience: ShoeAudience;
  /** 中文展示名 */
  name: string;
  /** 缩略图路径（相对 /public） */
  thumb: string;
  /**
   * 注入 prompt 的款式描述（英文为主，含中文辅助），**不含颜色**。
   * 末尾会有 "Color: ..." 让模型按服装搭配。
   */
  promptText: string;
  /** 排序权重，小的在前 */
  sortOrder: number;
};

/** 给所有鞋款共用的"颜色由模型搭配"附言（接在 promptText 末尾） */
export const SHOE_COLOR_HINT =
  "Color: choose a refined, elegant shade that harmonizes with and complements the dress color shown in reference images 1-2 (e.g. for warm-tone dresses → nude/champagne/blush; for cool-tone dresses → silver/champagne; for black/deep-tone dresses → black; for white/ivory dresses → ivory/nude/champagne). Avoid clashing or visually distracting colors. The entire batch must use the exact same shoe color.";

/* ─────────────────────────────────────────────────────────────
 * 成人鞋（13 款）—— 对应 D:\…\shoes\Adult shoes (*.png|*.webp)
 * ───────────────────────────────────────────────────────────── */
const ADULT: ShoeStyle[] = [
  {
    id: "adult-suede-crisscross-mule",
    audience: "adult",
    name: "麂皮交叉带中跟拖鞋",
    thumb: "/shoe-thumbs/Adult shoes (1).png",
    promptText:
      "Cross-strap slide mule with two wide overlapping vamp straps; open square toe; kitten heel about 5cm; soft suede (nubuck) finish; clean minimal silhouette, no buckle, no embellishment.",
    sortOrder: 10,
  },
  {
    id: "adult-mesh-crisscross-mule",
    audience: "adult",
    name: "网纱拼接交叉拖鞋",
    thumb: "/shoe-thumbs/Adult shoes (1).webp",
    promptText:
      "Cross-strap slide mule with two narrow leather-trimmed straps over sheer fine mesh / tulle vamp; open square toe; slim stiletto heel about 7cm; mixed satin trim + transparent mesh material; ethereal romantic look.",
    sortOrder: 20,
  },
  {
    id: "adult-lace-flat-sandal",
    audience: "adult",
    name: "蕾丝小花平底凉鞋",
    thumb: "/shoe-thumbs/Adult shoes (2).png",
    promptText:
      "Flat ankle-strap sandal with one front strap and a slim ankle strap; very low block heel about 2cm; smooth patent leather upper decorated with a small 3D lace flower applique with a pearl center on the front strap; open round toe; demure bridal feel.",
    sortOrder: 30,
  },
  {
    id: "adult-satin-bow-pump",
    audience: "adult",
    name: "缎面雪纺蝴蝶结尖头高跟",
    thumb: "/shoe-thumbs/Adult shoes (2).webp",
    promptText:
      "Pointed-toe slingback pump with very high stiletto heel about 10cm; smooth satin upper; oversized soft chiffon / organza bow on the ankle strap; minimal pointed silhouette; ultra-romantic occasion shoe.",
    sortOrder: 40,
  },
  {
    id: "adult-d-orsay-mule",
    audience: "adult",
    name: "D'Orsay 切口低方跟拖鞋",
    thumb: "/shoe-thumbs/Adult shoes (3).png",
    promptText:
      "D'Orsay style slip-on mule with a wide vamp strap and side cutouts at the arch; square open toe; chunky block heel about 4cm; smooth patent leather; understated minimalist look.",
    sortOrder: 50,
  },
  {
    id: "adult-ankle-bow-sandal",
    audience: "adult",
    name: "脚踝蝴蝶结方跟凉鞋",
    thumb: "/shoe-thumbs/Adult shoes (3).webp",
    promptText:
      "Ankle-strap sandal with one slim toe strap and a thin ankle strap tied at the back into a large satin / leather bow; square open toe; sturdy block heel about 6cm; mixed satin + patent leather; classic feminine occasion shoe.",
    sortOrder: 60,
  },
  {
    id: "adult-mary-jane-flat",
    audience: "adult",
    name: "玛丽珍尖头平底鞋",
    thumb: "/shoe-thumbs/Adult shoes (4).png",
    promptText:
      "Mary Jane flat with a single thin strap across the instep secured by a small silver buckle; sharp pointed toe; nearly flat with very low stacked wooden heel (~1cm); smooth fine leather upper; soft elegant cocktail / day-wear silhouette.",
    sortOrder: 70,
  },
  {
    id: "adult-glitter-weave-pump",
    audience: "adult",
    name: "编织亮片尖头高跟",
    thumb: "/shoe-thumbs/Adult shoes (5).png",
    promptText:
      "Pointed-toe closed pump with stiletto heel about 9cm; upper covered in finely woven glitter / sparkle fabric showing tiny basketweave + rhinestone-like shimmer; metallic stiletto heel rod; evening-glam look.",
    sortOrder: 80,
  },
  {
    id: "adult-satin-slingback-doublebow",
    audience: "adult",
    name: "缎面尖头后空双层蝴蝶结",
    thumb: "/shoe-thumbs/Adult shoes (7).png",
    promptText:
      "Pointed-toe slingback pump with stiletto heel about 10cm; smooth satin upper; two layered satin bows decorating the instep and the slingback ankle strap; clean architectural silhouette; bridal-grade occasion shoe.",
    sortOrder: 90,
  },
  {
    id: "adult-classic-pump",
    audience: "adult",
    name: "经典尖头光面高跟",
    thumb: "/shoe-thumbs/Adult shoes (8).png",
    promptText:
      "Classic pointed-toe closed pump; clean unbroken vamp with no decoration; stiletto heel about 10cm; smooth patent leather upper; timeless silhouette — the universal occasion pump.",
    sortOrder: 100,
  },
  {
    id: "adult-cross-ankle-block-pump",
    audience: "adult",
    name: "尖头侧空十字交叉方跟",
    thumb: "/shoe-thumbs/Adult shoes (9).png",
    promptText:
      "Pointed-toe two-piece d'Orsay pump with closed toe-box, open sides, and a slim crisscross / asymmetric ankle strap fastened by a tiny buckle; chunky block heel about 7cm; smooth satin upper; sophisticated semi-formal look.",
    sortOrder: 110,
  },
  {
    id: "adult-multistrap-sandal",
    audience: "adult",
    name: "多细带编结尖头凉鞋",
    thumb: "/shoe-thumbs/Adult shoes (10).png",
    promptText:
      "Strappy ankle sandal with multiple thin patent leather straps weaving across the toes and forefoot with a small decorative knot; slim stiletto heel about 6cm; square open toe; summer occasion shoe.",
    sortOrder: 120,
  },
  {
    id: "adult-thong-sandal",
    audience: "adult",
    name: "极简夹趾高跟拖",
    thumb: "/shoe-thumbs/Adult shoes (11).png",
    promptText:
      "Minimal thong sandal with a single Y-shape patent leather strap between the big toe and second toe joining a vamp band; square open toe; stiletto heel about 5cm; ultra-minimal modern look.",
    sortOrder: 130,
  },
];

/* ─────────────────────────────────────────────────────────────
 * 儿童 / 花童鞋（6 款）—— 对应 D:\…\shoes\Girls shoes (*.png)
 * ───────────────────────────────────────────────────────────── */
const KID: ShoeStyle[] = [
  {
    id: "kid-mary-jane-anklestrap",
    audience: "kid",
    name: "圆头玛丽珍脚踝带（粗跟）",
    thumb: "/shoe-thumbs/Girls shoes (1).png",
    promptText:
      "Children's Mary Jane shoe with rounded closed toe, separate ankle strap fastened by a small buckle, and a low chunky block heel about 4cm; smooth patent leather upper; sweet flower-girl / formal-event shoe for kids.",
    sortOrder: 1010,
  },
  {
    id: "kid-glitter-ballet-flower",
    audience: "kid",
    name: "亮片芭蕾平底 + 立体花",
    thumb: "/shoe-thumbs/Girls shoes (2).png",
    promptText:
      "Children's round-toe ballet flat with no heel; upper entirely covered in fine glitter sparkle fabric; a soft 3D chiffon / tulle flower appliqué on the vamp side; ultra-cute fairy / flower-girl style.",
    sortOrder: 1020,
  },
  {
    id: "kid-d-orsay-anklestrap",
    audience: "kid",
    name: "圆头 D'Orsay 脚踝带（粗跟）",
    thumb: "/shoe-thumbs/Girls shoes (3).png",
    promptText:
      "Children's two-piece d'Orsay shoe with round closed toe-box, open sides at the arch, and a slim ankle strap with a small gold buckle; chunky block heel about 4cm; smooth patent leather upper; elegant flower-girl shoe.",
    sortOrder: 1030,
  },
  {
    id: "kid-mary-jane-big-bow",
    audience: "kid",
    name: "圆头玛丽珍 + 后跟大蝴蝶结",
    thumb: "/shoe-thumbs/Girls shoes (4).png",
    promptText:
      "Children's Mary Jane shoe with rounded closed toe and an ankle strap with small buckle; large oversized satin bow decorating the back / heel area; chunky block heel about 4cm; smooth satin upper; very romantic flower-girl look.",
    sortOrder: 1040,
  },
  {
    id: "kid-metallic-mary-jane-cross",
    audience: "kid",
    name: "金属圆头玛丽珍十字带（粗跟）",
    thumb: "/shoe-thumbs/Girls shoes (5).png",
    promptText:
      "Children's Mary Jane shoe with rounded closed toe, two crisscrossing instep straps each with a small buckle, and a low chunky block heel about 3cm; metallic / mirror-finish leather upper; sparkly performance / flower-girl shoe.",
    sortOrder: 1050,
  },
  {
    id: "kid-shimmer-mary-jane-chiffon-bow",
    audience: "kid",
    name: "闪粉玛丽珍 + 雪纺蝴蝶结",
    thumb: "/shoe-thumbs/Girls shoes (6).png",
    promptText:
      "Children's Mary Jane shoe with rounded closed toe and an ankle strap finished at the back with a soft chiffon ribbon bow; chunky block heel about 4cm; shimmer / fine glitter fabric upper; sweet party / flower-girl look.",
    sortOrder: 1060,
  },
];

/** 全量鞋款库（成人 13 + 儿童 6 = 19） */
export const SHOE_LIBRARY: ShoeStyle[] = [...ADULT, ...KID].sort(
  (a, b) => a.sortOrder - b.sortOrder,
);

/* ─────────────────────────────────────────────────────────────
 * 工具函数
 * ───────────────────────────────────────────────────────────── */

/**
 * 根据 identity.category 推断 audience。
 * 默认归为 adult；teen / child / kid 归为 kid。
 */
export function audienceFromIdentityCategory(
  category: string | null | undefined,
): ShoeAudience {
  if (!category) return "adult";
  const c = category.toLowerCase().trim();
  if (c === "teen" || c === "child" || c === "kid") return "kid";
  return "adult";
}

/** 按 audience 过滤鞋款 */
export function listShoesByAudience(audience: ShoeAudience): ShoeStyle[] {
  return SHOE_LIBRARY.filter((s) => s.audience === audience);
}

/** 按 id 取鞋款 */
export function findShoeById(id: string | null | undefined): ShoeStyle | null {
  if (!id) return null;
  return SHOE_LIBRARY.find((s) => s.id === id) || null;
}

/**
 * 根据选择决定最终注入 prompt 的 ShoeStyle。
 *
 * @param shoeStyleId 用户指定的 id；"random" 或 null/undefined → 按 audience 随机
 * @param audience    成人 / 儿童
 * @param rng         可选的确定性 RNG（同批共享 batch_seed → 同批同款）；省略则用 Math.random()
 */
export function resolveShoeStyle(
  shoeStyleId: string | null | undefined,
  audience: ShoeAudience,
  rng?: () => number,
): ShoeStyle {
  if (shoeStyleId && shoeStyleId !== "random") {
    const found = findShoeById(shoeStyleId);
    if (found && found.audience === audience) return found;
    // id 不存在 / audience 不匹配 → 退化为随机
  }
  const pool = listShoesByAudience(audience);
  if (pool.length === 0) {
    // 极端情况：库里没这个 audience，返回所有库的第一个兜底
    return SHOE_LIBRARY[0];
  }
  const r = rng ? rng() : Math.random();
  return pool[Math.floor(r * pool.length) % pool.length];
}

/**
 * 把选中的鞋款转成最终注入 prompt 的字符串（含颜色搭配提示）。
 */
export function shoeStyleToPrompt(style: ShoeStyle): string {
  return `${style.promptText}\n  ${SHOE_COLOR_HINT}`;
}

/**
 * 创建一个基于 seed 的简单确定性 RNG。
 * 给 batch-photo 用：同批同 seed → 同批选到同一双鞋。
 *
 * Mulberry32 — 32-bit, 短小快速，足够这种用途。
 */
export function rngFromSeed(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
