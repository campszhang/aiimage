# 补氪氪批量图片工具 · Prompt 体系与细节控制总览

> 整理日期：2026-05-25 · 范围：全工具
> 目的：把每个功能涉及的 prompt、每个"细节控制开关"的取值范围、以及它如何进入最终 prompt 讲清楚，方便日后按图索骥地调参 / 排错。

---

## 0. 通用底层：图像生成调用层

所有出图功能最终都走 `lib/image-gen.ts` 分发器（gemini / openai 双通道），核心实现在 `lib/gemini-image.ts:generateImage()`。

| 参数 | 作用 | 默认 / 取值 |
|---|---|---|
| `responseModalities` | 同时要图和文本 | `["IMAGE","TEXT"]` |
| `temperature` | 采样自由度，越低越一致 | 默认 0.4；批量主图 0.15；仿图 base 0.35 / variant 0.6；场景图 0.4 |
| `seed` | 同 batch 共享种子 → 脸/光线/背景一致 | 主图整批共享 `batch_seed`；其它功能多不传 |
| `thinkingConfig.thinkingBudget` | Pro Image 思考预算 | 仅 `*pro-image*` 模型注入 2048，防止无限思考卡死 |
| `imageConfig.aspectRatio` | 输出比例 | `1:1 / 3:2 / 2:3 / 3:4 / 4:3 / 4:5 / 5:4 / 9:16 / 16:9` |
| `imageConfig.imageSize` | 输出档位 | `0.5K / 1K / 2K / 4K` |
| 超时 | 单次调用硬超时 | 580s（配合 route `maxDuration`） |

**关键坑（务必记住）**：
- `imageSize`（2K/4K）**只有 Pro Image 模型真的按它出**；`Flash Image` / 2.5 系列**静默忽略**，始终 ~1K。要真 4K 必须用 Pro 模型。
- Gemini 图像模型即使锁了 seed 仍有 5-15% 自由度，必须配合低 temperature 才最大化一致性。
- OpenAI 通道忽略 `seed` / `temperature`，按 size×quality 固定单价计费（`estimateImageCostUSD` 覆盖记账）。

---

## 1. 五大功能 + Prompt 构造器一览

| 功能 | 入口 route | Prompt 构造器 | 说明 |
|---|---|---|---|
| 款式解析（产品图分析） | `/api/analyze`、`/api/replicate/analyze` | `lib/gemini.ts:analyzeGarment / analyzeReference` | Vision 出结构化 JSON，不出图 |
| 模特身份生成（模特图） | `/api/identities/generate` 等 | `lib/identity-prompt.ts:buildIdentityPrompt` | 出"白底 nude bodysuit 全身参考图" |
| 主图批量（产品上身图） | `/api/jobs/batch-photo` | DB 模板 `{{占位符}}` + `buildImageManifest` + `buildSolidBgInstruction` | 产品图+模特+姿势+表情+场景，核心生产线 |
| 场景图 | `/api/scene-tools` | `lib/scene-prompt.ts` + `lib/scene-tools-prompt.ts` | 把模特放进新场景重拍，含特写/材质/焦点 |
| 仿图 | `/api/replicate` | `lib/replicate-prompt.ts:buildReplicatePrompt` | 复刻参考图构图，换我方模特+服装 |
| AI 换颜色 | `/api/jobs/recolor` | `lib/gemini-image.ts:buildRecolorPrompt` | 只改服装主色，色卡锚定 |

---

## 2. 款式解析（analyzeGarment / analyzeReference）

`lib/gemini.ts`，Gemini Vision + `responseSchema` 强制结构化输出，`temperature 0.2`。

**款式解析 `analyzeGarment`** —— 8 个字段（伴娘服/礼服专用）：
`主色调 / 整体版型 / 长度 / 领口设计 / 袖型 / 后背设计 / 面料材质 / 装饰细节[]`
系统提示要点：商品化精简描述、看不到的部位填"未提供"不许脑补。
→ 结果用于下游：`shoe_spec` 选鞋、`garment_attrs` 注入主图/换色 prompt、材质库自动匹配。

**仿图参考图解析 `analyzeReference`** —— 字段：
`person_count / persons[{position,pose}] / scene / lighting / composition / overall`
系统提示要点：只描述看到的、人物从左到右排序、不描述长相/服装（会被替换）、描述要可执行（让另一摄影师能复刻）。

---

## 3. 模特身份生成（buildIdentityPrompt）

`lib/identity-prompt.ts`，5 个枚举参数拼 ~150 行英文 prompt，喂 Pro Image 出"临床参考图"。

**5 个控制参数（前端下拉，全部带中文 label）：**
- `ethnicity` 人种：东亚/东南亚/南亚/北欧西欧/南欧/非裔/拉美/中东/混血（9）
- `age` 年龄：20-25 / 25-30 / 30-35 / 35-40
- `hairColor` 发色：黑/深栗棕/中棕/浅金/蜂蜜金/红棕/灰白（7）
- `hairStyle` 发型：长直/长波浪/齐肩内卷/波波短发/低盘发（5）
- `bodyShape` 体型：纤瘦/标准/运动/曲线丰满/大码/孕妇/青少年（7）
- 眼睛颜色由人种自动推导，不暴露给前端。

**Prompt 分层（优先级递减）：**
1. **PRIORITY 0**：这是合成用临床参考图，不是时尚大片 → 全身（头到脚趾，头占 12-13%）、纯白底 (248,248,248)、仅穿无缝裸色 bodysuit、赤脚、无首饰、素颜。违反任一条都"WRONG, regenerate"。
2. **PRIORITY 1 解剖比例**：反"模特腿过长"偏见 —— 头高 = 总高 1/7.5、腿（髋到地）47-50%，给了像素级自检清单。
3. **SUBJECT SPEC**：注入 5 参数英文描述。
4. **皮肤微纹理**：毛孔/胶片颗粒/T 区油光/卡粉/色素微变化/极少雀斑（≤5-8 个 <1mm）/发丝/眼虹膜/唇纹 —— 真实感来自微纹理而非斑点。
5. **FORBIDDEN**：磨皮塑料感、>1mm 痣斑、对称完美、AI 通用脸。
6. **POSE / CAMERA**：正面直立、Phase One 150MP、80mm f/5.6、5500K。

---

## 4. 主图批量 batch-photo（核心生产线）

`/api/jobs/batch-photo`，是"产品图 → 模特上身图"的主力。Prompt = **DB 可编辑模板**（`prompt_templates` 表 `kind='on_model'`）用 `{{占位符}}` 填充，再前后拼接清单、画质、取景块。

### 4.1 输入
- 产品图 1-3 张（1=通用 / 2=正背 / 3=正背细节）
- `identity_id` 模特（必填）、`template_id` Prompt 模板（必填）
- 三类背景并存：①纯色背景（必填，默认 `#F5F1EA 浅米色`）②图片场景 ≤2（每 1-5 张）③文字场景 ≤2（每 1-5 张）
- `pose_ids`（纯色背景用，1-10 个，来自 `poses` 表）

### 4.2 模板占位符（`{{xxx}}`，worker 填充）
| 占位符 | 来源 | 控制项 |
|---|---|---|
| `{{garment_attrs}}` | 款式解析格式化 | 款式信息 |
| `{{material_details}}` | 材质库 `formatMaterialDetails` | 面料词库 |
| `{{pose}}` | `poses` 表 / 场景自由互动 | 姿势 |
| `{{expression}}` | `expressions` 表（含 is_default） | 表情/眼神/情绪（独立于姿势） |
| `{{photography_params}}` | `photography_params` 表 | 摄影参数 |
| `{{realism_constraints}}` | `realism_presets` 表 | 真实感约束 |
| `{{shoe_spec}}` | `pickShoeSpec()` 整批锁定 | 鞋型一致性 |
| `{{user_seed}}` | 用户补充指令 | 自由追加 |
| `{{identity_name}} / {{scene_name}} / {{n}}` | 元信息 | — |

### 4.3 三类背景如何进 prompt
- **纯色**：`buildSolidBgInstruction(色名,hex)` —— 无纹理/无渐变/无道具的纯色棚拍背景。
- **图片场景**：附场景图作 IMAGE，姿势改"自由互动"（坐/倚/撑/拿），多变体用 `getVariantCameraHint` 钉死镜头预设防回退正面全身；取景用 `FRAMING_TIGHT_SINGLE`。
- **文字场景**：无图，描述塞进 framing block，让模型读文字里的物件自然互动。

### 4.4 一致性手段（重点）
- **整批共享 `batch_seed`** + `temperature 0.15` → 多张图脸/光线/背景一致。
- **`buildImageManifest`** 按实际输入顺序动态生成"Image N = 什么角色 / 取什么 / 忽略什么"清单，解决产品图数量不固定时硬索引错位。
- **`pickShoeSpec`** 按服装主色调确定性选一双鞋（款式/跟高/材质固定，只换色），整批注入同一描述 → 鞋一致。鞋色映射：黑/深色→黑；金属金→香槟金；银/冷色→银；暖色→裸；浅色→裸/香槟。

### 4.5 出图数量
`总数 = 纯色姿势数 + Σ图片场景count + Σ文字场景count`，item 按这三段顺序排列。

---

## 5. 场景图 scene-tools（细节控制最丰富）

`/api/scene-tools` → `buildSceneShootText`（文字场景）/ `buildSceneShootImage`（图片场景）→ 共用 `buildFramingBlock`。

### 5.1 输入与出图公式
- N 张产品图（每张含模特+服装），最多 30
- M 个场景，每个场景配：`count`（常规变体 0-5）+ `closeup_presets[]`（特写多选）
- **单场景出图 = count + 特写数量（≤10）**
- **总出图 = N × Σ(每个场景的 count + 特写数)**
- 可选每张产品图配一张"背部参考图"（仅背面特写用）

### 5.2 控制开关一览
| 开关 | 取值 | 作用 |
|---|---|---|
| `focus_mode` 画面焦点 | `model_first`（占比70-80%，默认）/ `balanced`（50-60%）/ `environmental`（30-40%） | 控制模特占画面比例 + 切换镜头库 |
| `pose_mode` 姿势模式 | `editorial`（杂志大片随机摆拍，默认）/ `interactive`（读场景与物件互动） | 决定姿势来源 |
| `closeup_presets` 特写 | 9 选 N（见下） | 局部特写镜头 |
| `material_ids` 材质 | 材质库 ID（autoMatch 后可手改） | 注入面料词库 |
| `aspect_ratio` | 9 种比例，默认 3:4 | 比例 |
| `image_size` | 1K/2K/4K，默认 4K | 画质 |
| 背部参考图 | 每产品可选 1 张 | 背面特写专项约束 |
| `user_hint` | ≤200 字 | 自由追加 |

### 5.3 杂志大片随机组合 `buildEditorialCombo`（editorial 模式核心）
用 `mulberry32` 伪随机（种子 = `job.id:variant_idx`，**确定性**：同 job 同序号永远同组合，不同序号必不同），从 6 个维度库各抽一个：

1. **POSES（15 个）**：站立放松/走动 mid-stride/转身/回眸/抚发/抚腰/抚臀回眸/举臂/提裙/单脚交叉/低头/略侧身/双手插袋/扭腰 S 形/倚墙手交叉
2. **ANGLES（7 个）**：眼平/略低仰拍/略高俯拍/Dutch tilt/3-4 侧/完全侧面/完全背身
3. **LENS（按 focus 过滤）**：model_first→50/85/135mm（更虚化压缩）；balanced→35/50/85mm；environmental→28/35/50mm（吃环境）
4. **FRAMINGS（5 个，v8 偏全身）**：4 个全身变体 + 1 个 3/4 身（≤20% 概率穿插）
5. **COMPOSITIONS（5 个）**：居中/左三分/右三分/黄金分割左上/右下
6. **GAZES（7 个）**：直视/看远方/斜上/斜下/闭眼/半笑/侧首

editorial 模式强调：场景只是 backdrop，模特不必刻意坐/倚/扶物件，每张是独立瞬间，多张之间姿势/角度/焦距必须明显不同。

### 5.4 特写预设 CLOSEUP_PRESETS（9 个）
`back 后背特写* / side_waist 侧腰 / chest_to_thigh 胸口至大腿 / lower_body_motion 下半身动态 / neckline_shoulder 领口至肩 / hand_on_waist 抚腰(推荐) / hand_on_hip_back 抚臀回眸*(推荐) / arms_overhead_back 举臂背身*(推荐) / lift_skirt_step 提裙侧步(推荐)`
（带 * 为 `isBack` 背面取向，会触发背部参考图专项约束）

特写额外注入 **特写光学约束**：f/1.4-2.0 浅景深、背景纯虚化（场景仅作色调）、面料质感锐利、光打到关键面料。

### 5.5 真实摄影质感 PHOTO_REALISM_BLOCK（v8，常规+特写都注入）
硬约束（优先级仅次于身份/服装一致性）：皮肤毛孔/绒毛/自然瑕疵、头发每根可辨、唇眉眼纹理、胶片质感（Portra 400/Pro 400H/Cinestill 800T）+ 自然颗粒。红线：磨皮塑料感/蜡像感/Instagram 滤镜 = 严重失败。

### 5.6 占比强化（getFramingByFocus）
model_first 用 HERO SHOT 术语：占 70-80%、头顶距上边 ≤15%、脚尖距底边 ≤10%；并给负面案例（<60%="小人站大场景"=失败重来）。常规变体另加"商品主图：展示服装全貌、80%+ 完整全身"约束。

### 5.7 IMAGE 顺序（易混点）
- 文字场景：IMAGE 1=产品图；有背部参考图时 IMAGE 2=背部图（prompt 里会说明 framing 里的"IMAGE 3"在此请求实为 IMAGE 2）。
- 图片场景：IMAGE 1=产品图、IMAGE 2=场景 plate、IMAGE 3=背部参考图。
- 图片场景特别提醒：场景图只取"氛围/光线/色调/材质"，**不要复制它的取景和主体比例**（哪怕原图是大远景小人），取景以 framing block 为准。

### 5.8 同场景一致性
单场景出多张时注入"同一地点/同一时段/同一光线方向、同一次拍摄"，特写仅镜头拉近+大光圈虚化，不许换天气/时段/房间。

---

## 6. 仿图 replicate

`/api/replicate` → `buildReplicatePrompt`。流程：上传参考图→Vision 分析→按人数上传 N 张产品图（左到右映射人物槽位）→出 base 复刻 + variant 变体。

**图片顺序**：IMAGE 1=参考图（只复刻摆法/场景/光线，长相服装完全不要）；IMAGE 2..N+1=我方产品图（每张含 1 模特+1 服装，对应参考图一个人物槽位）。

**控制项：**
| 开关 | 取值 | 作用 |
|---|---|---|
| `base_count` | 0-5 | 严格复刻张数（temp 0.35） |
| `variant_count` | 0-8 | 变体张数（temp 0.6，复用 `buildEditorialCombo` 扰动姿势/机位） |
| `mood` 氛围 ⭐新增 | none/cheerful/intimate/gentle/editorial_cold（单选） | 氛围/表情/人物互动 |
| `focus_mode` | 三档 | 变体镜头库 |
| `material_ids` | 材质库 | 面料词库 |
| `aspect_ratio / image_size / model / user_hint` | 同上 | — |

**槽位映射**：参考图 N 人按"从左到右"映射到 IMAGE 2..N+1，严禁串脸串衣服。base 严格照参考图姿势；variant 在"同场景/同光线/同机位风格"下做杂志大片扰动。

**氛围 mood（2026-05-25 新增，单选，全部图统一）**：
- `cheerful` 欢快交谈大笑（互看说话、真实大笑、抓拍感）
- `intimate` 亲密互动（挽手/搭肩/轻拥/理裙摆）
- `gentle` 温柔安静（轻柔微笑、眼神柔和）
- `editorial_cold` 高级冷感（中性表情、疏离、Vogue 气场）
- 硬约束：氛围只改"表情/神态/互动动作"，场景/构图/光线照参考图，模特脸/身份/服装仍 100% 用产品图。

---

## 7. AI 换颜色 recolor

`/api/jobs/recolor` → `buildRecolorPrompt(colorName, hex, options)`。一次最多 50 张图 × 多个目标色，每个"色×图"组合一条 item。

**Prompt 关键设计：**
- **目标色多重表示**：色名 + HEX + RGB 三种一起给，减少理解偏差。
- **零偏差约束**：主色像素 CIE76 ΔE ≤ 5，禁止 desaturate 中性化漂移、禁止朝原色折中、禁止美学化偏移。
- **必须改色**：注入原图主色名，强调"即使原色与目标色相近也要完整替换，几乎不变=失败"。
- **色卡锚定**（hasSwatch）：附一张纯色色卡 PNG 作最后一张参考图，要求像素级对齐色卡而非自行解读 HEX 字符串；但不要把色卡形状复制进输出。
- **必须保留**：廓形/版型/长度/剪裁、面料质感（按材质词库）、所有装饰、模特姿势/脸/发/肤色/背景。
- **buildQualityHint（hd/2k/4k）**：核心是命令模型"REDRAW 重绘而非改图"——即使输入糊也按目标分辨率重新渲染锐利；并加构图约束（主体居中、不裁切）。
- 可叠加 `garment_attrs / material_details / realism_constraints / user_seed`。

---

## 8. 共用词库 / 控制项（DB 维护）

| 词库 | 表 | 字段 / 内容 |
|---|---|---|
| 材质库 | `materials` | `visual_traits 视觉特征 / light_behavior 光线特性 / texture_rules 纹理规则 / dont_confuse_with 禁止画成`；`autoMatchMaterials` 按关键词自动匹配，`formatMaterialDetails` 格式化进 prompt |
| 真实感预设 | `realism_presets` | `constraints_text`（有 is_default） |
| 姿势 | `poses` | 主图纯色背景用 |
| 表情 | `expressions` | 独立于姿势的脸/眼神/情绪（有 is_default） |
| 摄影参数 | `photography_params` | 镜头/灯光等 |
| 场景 | `scenes` | 图片场景（usage=single 主图场景 / scene 场景图） |
| 文字场景预设 | `text_scene_presets` | 文字场景库（带缩略图、可 AI 重新解析） |
| 颜色 | `colors` | 换色目标色（50 色） |

材质多选时额外加："严格区分不同材质表面属性，不要把一种材质质感错画成另一种"。

---

## 9. 各功能默认参数速查

| 功能 | temperature | seed | 画质默认 | 一致性主手段 |
|---|---|---|---|---|
| 主图 batch-photo | 0.15 | 整批共享 batch_seed | 2K | seed + shoe_spec + manifest |
| 场景图 scene-tools | 0.4 | 不传 | 4K | mulberry32 镜头种子 + 同场景一致块 |
| 仿图 base | 0.35 | 不传 | 2K | 严格复刻参考图 |
| 仿图 variant | 0.6 | 不传 | 2K | 同场景/光线下 editorial 扰动 |
| 换色 recolor | 默认 0.4 | 不传 | 2K | 色卡锚定 + ΔE≤5 |
| 模特身份 identity | 默认 | 不传 | 4K | priority 0/1 硬约束 |

---

## 10. 关键设计取舍备注

- **为什么场景图用确定性随机（mulberry32）而非真随机**：同一 job 重试某张时组合不变，可复现；但同 job 内不同序号必不同，保证多样性。
- **为什么主图锁鞋型而场景图不锁**：主图是 N 次独立调用易出现不同鞋，需整批钉死；场景图本身在追求多样性。
- **为什么换色要"重绘"而非"编辑"**：让模型不拘泥输入像素，顺带把糊图洗清晰。
- **为什么 4K 要选 Pro 模型**：Flash 系列静默忽略 imageSize。

