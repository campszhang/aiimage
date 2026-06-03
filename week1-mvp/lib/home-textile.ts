/**
 * Home textile domain defaults.
 *
 * The database still uses a few historical table/field names from the
 * fashion version. This module centralizes the new product-language so the
 * app boots as a home soft-goods image tool on fresh servers.
 */

export const HOME_TEXTILE_PRODUCT_TYPES = [
  "枕头",
  "枕套",
  "眼罩",
  "发圈",
  "凉感被",
  "夏被",
  "羽绒被",
];

export const HOME_TEXTILE_COLORS = [
  { name: "云朵白", hex: "#F7F5EF", group: "neutral" },
  { name: "燕麦米", hex: "#D8C8AE", group: "neutral" },
  { name: "奶油杏", hex: "#F0D9B8", group: "warm" },
  { name: "浅沙咖", hex: "#C8B49A", group: "neutral" },
  { name: "雾灰", hex: "#B8BDC0", group: "cool" },
  { name: "雾蓝", hex: "#9FB4C8", group: "cool" },
  { name: "鼠尾草绿", hex: "#A7B39B", group: "cool" },
  { name: "橄榄绿", hex: "#7E8B5F", group: "cool" },
  { name: "焦糖棕", hex: "#A56F42", group: "warm" },
  { name: "砖红", hex: "#A85C4A", group: "warm" },
  { name: "烟粉", hex: "#D9A8A1", group: "warm" },
  { name: "薰衣草紫", hex: "#B7A5C9", group: "cool" },
  { name: "炭灰", hex: "#4B4C4A", group: "dark" },
  { name: "深海蓝", hex: "#33475F", group: "dark" },
];

export const HOME_TEXTILE_MATERIALS = [
  {
    name: "长绒棉",
    english_name: "long-staple cotton",
    aliases: "棉,纯棉,长绒棉,新疆棉,cotton,long-staple cotton",
    description: "枕套 / 被套常用，柔软亲肤，织纹细密",
    visual_traits:
      "细密平纹或斜纹织理，哑光柔和，边缘有轻微布料厚度，触感干净亲肤",
    light_behavior:
      "漫反射为主，无明显高光；折痕处有柔和明暗过渡",
    texture_rules:
      "必须保留细小织纹、车线、压边和布料厚度，不能画成塑料或丝绸强反光",
    dont_confuse_with: "不要画成缎面强光泽，不要像纸张或塑料",
  },
  {
    name: "桑蚕丝",
    english_name: "mulberry silk",
    aliases: "真丝,桑蚕丝,丝绸,silk,mulberry silk",
    description: "眼罩 / 发圈 / 高端枕套常用，顺滑光泽",
    visual_traits:
      "表面顺滑，细腻流动的布面高光，边缘柔软下垂，褶皱细而自然",
    light_behavior:
      "有方向性柔亮高光，但不是金属或塑料；暗部仍保留丝织细节",
    texture_rules:
      "高光沿布料弧度流动，缝线和包边要清晰，不能过度镜面化",
    dont_confuse_with: "不要画成廉价亮面塑料、漆皮或硬缎",
  },
  {
    name: "凉感纤维",
    english_name: "cooling fiber",
    aliases: "凉感,冰丝,冷感,凉感被,cooling,ice silk,cool fiber",
    description: "凉感被 / 夏被常用，清爽、平滑、轻薄",
    visual_traits:
      "表面平滑轻薄，微微冷调反光，压线分区清楚，蓬松度低而服帖",
    light_behavior:
      "冷白或冷灰高光，暗部干净，整体清爽不厚重",
    texture_rules:
      "突出轻薄、凉爽、顺滑，不要画成厚羽绒或毛绒质感",
    dont_confuse_with: "不要画成法兰绒、羊羔绒或厚重冬被",
  },
  {
    name: "水洗棉",
    english_name: "washed cotton",
    aliases: "水洗棉,皱皱棉,washed cotton,crinkle cotton",
    description: "夏被 / 枕套常用，松弛、自然褶皱",
    visual_traits:
      "自然轻皱、低饱和哑光、柔软松弛，边缘略有生活感",
    light_behavior:
      "褶皱产生细碎柔影，无硬高光，整体温暖自然",
    texture_rules:
      "褶皱必须自然随机，不要像脏污或破损；保留压线和包边",
    dont_confuse_with: "不要磨皮成完全平面，也不要画成厚毛毯",
  },
  {
    name: "羽绒填充",
    english_name: "down filling",
    aliases: "羽绒,白鹅绒,鸭绒,羽绒被,down,goose down,duvet",
    description: "羽绒被 / 枕头填充，蓬松、分区鼓包",
    visual_traits:
      "分格绗缝明显，每格有自然蓬松鼓起，边缘柔软圆润，有空气感",
    light_behavior:
      "鼓包顶部柔亮、缝线凹陷处有自然阴影，整体洁净蓬松",
    texture_rules:
      "必须体现蓬松厚度和绗缝分区，不能扁平；不要露出羽毛杂乱飞出",
    dont_confuse_with: "不要画成薄夏被、毛毯或硬垫子",
  },
  {
    name: "天鹅绒",
    english_name: "velvet",
    aliases: "绒,天鹅绒,丝绒,velvet",
    description: "装饰抱枕 / 发圈常用，绒面方向感强",
    visual_traits:
      "短绒毛面，随方向产生明暗色差，触感柔软，轮廓厚实",
    light_behavior:
      "绒毛方向造成块状柔亮和暗面，不是均匀平光",
    texture_rules:
      "要显示绒面倒伏方向和软边，不要画成皮革或塑料",
    dont_confuse_with: "不要画成亮缎或粗针织",
  },
];

export const HOME_TEXTILE_SCENES = [
  {
    name: "奶油风卧室床品",
    group_name: "卧室",
    text_prompt:
      "奶油风卧室，浅米色软包床头，白色或燕麦色床品自然铺开，床头柜上有陶瓷杯和小台灯，清晨柔和窗光从左侧进入。画面干净、温柔、适合展示枕头、枕套、夏被和羽绒被。",
  },
  {
    name: "现代客厅沙发软装",
    group_name: "客厅",
    text_prompt:
      "现代简洁客厅，浅灰或米白布艺沙发，木质茶几，低饱和地毯，背景有绿植和装饰画。自然日光，真实居家软装氛围，适合展示枕头、抱枕、发圈或眼罩的生活方式图。",
  },
  {
    name: "凉感夏日床铺",
    group_name: "夏季",
    text_prompt:
      "夏日清爽卧室，白墙、浅蓝灰床品、通透窗帘，阳光明亮但不过曝，整体冷感清洁。适合展示凉感被、夏被、凉感枕套，画面要有清凉、轻薄、透气的感觉。",
  },
  {
    name: "高端酒店床品",
    group_name: "酒店",
    text_prompt:
      "高端精品酒店卧室，整洁铺床，白色床单和饱满羽绒被，床头有暖色壁灯，空间精致克制。适合展示羽绒被、枕头、枕套，强调蓬松度、洁净感和高级睡眠体验。",
  },
  {
    name: "床品细节微距",
    group_name: "细节",
    text_prompt:
      "专业电商细节摄影台面，柔和侧光，背景极简虚化。镜头靠近产品边角，展示面料纹理、包边、缝线、绗缝、拉链或丝绸光泽，适合详情页工艺特写。",
  },
  {
    name: "夜间睡眠仪式感",
    group_name: "睡眠",
    text_prompt:
      "夜间卧室睡眠场景，床头暖光、书本、香薰或水杯，床品柔软自然，画面安静放松。适合眼罩、枕套、枕头、被子组合图，强调助眠、亲肤、安稳。",
  },
];

export const HOME_TEXTILE_PHOTOGRAPHY = [
  {
    name: "家居电商主图",
    description: "软品白底/浅底主图 · 颜色准确 · 轮廓清晰",
    params_text: `【摄影参数】
- Camera: full-frame product photography, 70mm lens
- Light: large softbox from front-left, white reflector fill, clean soft shadow
- Background: warm off-white / light gray seamless surface
- Composition: product centered, complete silhouette visible, 10-15% margin
- Color: accurate white balance, low saturation drift, no filter
- Detail: fabric texture, stitching, piping, quilting, zipper and fill volume must be visible`,
    is_default: 1 as const,
    sort_order: 10,
  },
  {
    name: "家居场景大片",
    description: "卧室/客厅生活方式图 · 真实居家光线",
    params_text: `【摄影参数】
- Camera: editorial interior photography, 35-50mm lens
- Light: natural window light plus subtle warm practical lamp
- Composition: product styled naturally on bed / sofa / chair, not floating
- Styling: restrained props, breathable negative space, premium home catalog look
- Color: warm neutral base with one accent color, realistic shadows`,
    is_default: 0 as const,
    sort_order: 20,
  },
  {
    name: "详情页微距",
    description: "纹理、包边、绗缝、丝绸光泽特写",
    params_text: `【摄影参数】
- Camera: 100mm macro lens, f/5.6
- Focus: fabric weave, seam, quilting, zipper, edge piping or silk highlight
- Light: low side light to reveal texture relief
- Composition: product detail fills 65-80% of frame
- Output: extremely sharp, realistic fibers, no waxy smoothing`,
    is_default: 0 as const,
    sort_order: 30,
  },
];

export const HOME_TEXTILE_REALISM = {
  name: "家居软品质感",
  description: "布料、填充、绗缝、丝绸和凉感材质真实",
  constraints_text: `【真实感约束 / Home Textile Realism】
- Product must look physically real: correct scale, gravity, soft deformation, contact shadows.
- Preserve textile construction: seams, piping, hem, quilting grids, zipper openings, labels if visible.
- Fabric fibers must remain visible at 100% crop; no plastic smoothing, no waxy AI texture.
- Bedding products need believable volume: pillows and duvets compress against the surface; lightweight summer quilts stay flatter; down duvets have puffy quilted cells.
- Silk eye masks and scrunchies need soft directional highlights, not hard plastic reflections.
- Cooling products should feel clean, light, and cool-toned, without becoming metallic.
- No watermark, text, logo, extra limbs, people, mannequins, fashion runway, or clothing try-on logic.`,
  is_default: 1 as const,
  sort_order: 10,
};

export const HOME_TEXTILE_PROMPT_TEMPLATE = `你是一位专业的家居软品电商摄影师。本次任务不是服装上身，也不需要模特。请根据我提供的产品参考图，生成 {{n}} 张真实可商用的家居软品摄影图。

【适用类目】
枕头、枕套、眼罩、发圈、凉感被、夏被、羽绒被，以及同类床品/软装。

【参考图职责分解】
▸ 参考图 1-3（产品图）—— 只取产品本身
  - 使用：产品形状、颜色、面料、纹理、图案、包边、缝线、绗缝、拉链、厚度、蓬松度
  - 必须忽略：原图背景、手、人体、衣服、杂物、拍摄瑕疵

▸ 参考图 4（如有）—— 场景/空间参考
  - 只取室内空间、光线、床/沙发/椅子/台面关系
  - 产品仍必须使用参考图 1-3 的设计，不可替换

【产品解析信息】
{{garment_attrs}}

【材质质感】
{{material_details}}

【真实感】
{{realism_constraints}}

【拍摄任务】
围绕参考产品生成 {{n}} 张图，每张按下面的镜头/场景描述执行：

{{pose}}

{{photography_params}}

【核心硬约束】
1. 只生成家居软品产品图，不生成真人模特、穿搭、鞋履、礼服、T 台或人物上身图。
2. 产品设计必须与参考图一致：颜色、面料、图案、缝线、包边、拉链、绗缝和蓬松度不能变。
3. 产品必须自然落在床、沙发、椅子或台面上，有真实接触阴影，不能漂浮。
4. 枕头/羽绒被要有蓬松空气感；夏被/凉感被要轻薄平整；眼罩/发圈要柔软可弯折。
5. 场景只服务于产品展示，不能喧宾夺主，不要添加文字、水印、logo 或多余品牌标识。

【补充要求】
{{user_seed}}

请按顺序输出 {{n}} 张高质量家居软品电商图片。`;

export const HOME_TEXTILE_DETAIL_TEMPLATE = `你是一位专业的家居软品详情页摄影师。请根据参考产品图生成 {{n}} 张产品工艺/材质细节图。

【产品解析信息】
{{garment_attrs}}

【材质质感】
{{material_details}}

【真实感】
{{realism_constraints}}

【镜头】
{{pose}}

{{photography_params}}

【必须展示】
- 面料纤维、织纹、丝绸光泽、凉感平滑度、绗缝鼓包、包边、车线、拉链、标签或填充蓬松度
- 产品局部要真实锐利，背景简洁虚化
- 不要出现真人模特、鞋、礼服、穿搭、身体部位

{{user_seed}}

请输出 {{n}} 张可用于详情页的高清细节图。`;

