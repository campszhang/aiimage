# 交给 Gemini 做 UI 优化 · 提示词 + 源文件清单

> 建议用 **Gemini 2.5 Pro**（大上下文）。把"提示词"整段贴进去，再把下面"源文件清单"里的文件**带路径**一并贴上（每个文件前加一行 `=== 文件路径 ===`，Gemini 才知道改哪个、放哪里）。

---

## 一、提示词（整段复制给 Gemini）

```
你是一名资深前端 / UX 工程师，负责一个商用 SaaS 内部工具（伴娘服电商团队用的 AI 批量图片工具）的界面重构。技术栈：Next.js 15（App Router）+ React 19 + TypeScript（strict）+ Tailwind CSS。

# 任务
重构「服饰场景图」页面 app/scene-tools/page.tsx 的 UI/UX，达到商业级产品的易用度和精致度。这是全工具 UI 重构的样板页，确认后会推广到其它页面，所以你建立的任何可复用组件都要干净、通用。

# 硬性约束（必须遵守，违反即报废）
1. 只改"表现层"：JSX 结构、className、布局、新增展示型组件。绝对不要改动任何业务逻辑——所有 useState / useEffect / 事件处理函数（onPickProducts、handleSubmit、addTextScene、updateSceneCount、toggleSceneCloseup 等）、fetch 调用、FormData 字段名、props 形状、轮询逻辑、prefill 逻辑全部保持原样。
2. 复用现有设计系统：颜色 / 间距 / 圆角 / 阴影都用 app/globals.css 里定义的 CSS 变量 token 和 tailwind.config.js 里暴露的类（如 bg-bg-secondary、text-fg-primary/secondary/tertiary/muted、text-brand-600、border-border-subtle、bg-brand-50、bg-bg-tertiary、--brand-50-bg、--warn-bg 等）。不要硬编码颜色（如 #fff、gray-500），不要引入新的颜色体系。
3. 复用现有 UI 组件库 app/_components/ui/（已有：Button、Card、Chip、Select、Input、Textarea、Tabs、CollapsibleSection、Dropzone、SegmentedControl、PageHeader、ProgressBar、StatusDot、EmptyState）。需要新组件就在 app/_components/ui/ 下新建文件并在 index.ts 导出，命名风格保持一致。
4. 不要新增任何 npm 依赖。图标统一用 lucide-react（已安装）。
5. UI 文案保持中文。
6. 输出必须是【完整文件】，不许用 "// ... 省略" 之类的省略号。改了哪些文件就把每个文件的完整内容给出，并在最前面列出"改动文件清单 + 每个文件改了什么"。
7. 保证 TypeScript strict 下零报错；不要留未使用的 import / 变量。

# 已确认的设计方向（保留并在此基础上打磨，不要推翻）
- 页面采用「左侧分区配置 + 右侧 sticky 出图预估」双栏布局：左边是 ①产品图 ②场景 ③输出设置 三张编号卡片，右边是常驻的「出图预估」面板（总张数 + 明细 + 参数 chips + 主 CTA「开始生成」），让提交按钮和预估始终可见，不用滚到底。
- 互斥单选（画面焦点、画质）用 SegmentedControl：选中态=品牌色填充+白字+加粗+右上角✓。
- 次要内容（场景预设库、高级设置）用 CollapsibleSection 折叠，默认收起。
- 文字层级清晰：编号徽章 + icon + 标题（粗）/ 字段标签（中等、带 icon）/ 备注（小、muted）。

# 必须修复的具体易用性问题（这是本次重点，务必逐条做到）
A. 【场景卡选中标记】场景预设库的缩略图卡、以及"选场景图"弹窗里的场景卡，被选中 / 已添加时，必须在卡片【右上角】显示明显的选中标记（一个实心圆底的 ✓ 角标 + 卡片整体高亮边框 border-brand-400 + 轻微品牌色蒙层），让用户一眼看出"这张已经选了"。当前完全没有或太弱。
B. 【就地折叠按钮】场景预设库（可折叠区）展开后内容很长，用户滚到底想收起时，必须在该区域【内容底部、靠右下角】再放一个"收起 ▲"按钮，点击直接把这个区折叠回去——而不是逼用户滚回顶部去点标题。顶部和底部都能折叠。
C. 【减少翻页 / 减少滚动】重新组织信息密度：能横排的横排、能折叠的折叠、缩略图网格用合适的列数和尺寸，避免从上到下一长条铺开。核心操作（选场景、设张数、点生成）尽量集中、少跳屏。
D. 【选中态全局加强】所有"已选/激活"状态（材质 tag、特写镜头 chip、张数按钮、场景张数）都要有强对比的选中样式，不能是浅浅一层难以分辨。
E. 【层级与精致度】标题 / 说明 / 备注的字号、字重、颜色层级分明；该加边框加边框、该加 icon 加 icon。整体要像成熟商业产品，不要粗糙偷懒。

# 交互细节
- 每个场景卡（预设/弹窗）hover 有反馈；选中后再点可取消（如果该卡语义是"已加入则禁用"，则显示"已加"角标 + 禁用态）。
- SceneEntryCard（已选场景的那张小卡）：缩略图 + 名称 + 行内「常规张数 0-5 步进器」+「特写多选 chip」+ 本场景小计，排布紧凑清晰。
- 右侧出图预估面板在 lg 断点 sticky（lg:sticky lg:top-6）；小屏下自然回落到底部。
- 空状态、加载中（材质分析中）、数量过大警告都要有合适的视觉。

# 上下文（我会一并提供这些源文件）
- app/scene-tools/page.tsx（要改的主文件）
- app/_components/ui/ 下的组件 + index.ts（可复用组件库）
- app/globals.css（设计 token + .btn/.input/.select/.chip 等工具类）
- tailwind.config.js（暴露了哪些 token 类）
- app/layout.tsx、app/_components/app-shell.tsx、left-nav.tsx（页面外壳/左导航，决定可用宽度）
- app/_components/task-viewport.tsx（任务运行时整页切换到它，别破坏这个分支）
- lib/scene-tools-prompt.ts（CLOSEUP_PRESETS 的结构：key/label/isBack/recommended/description）
- lib/text-scene-presets.ts（TextScenePreset 类型：group/name/text/thumb）
- lib/hooks/use-job-polling.ts、use-current-user.ts（页面用到的 hook 签名）
- package.json、tsconfig.json（版本、依赖、strict）

# 输出
1. 先给「改动文件清单」+ 每个文件改了什么（一句话）。
2. 再依次给每个改动 / 新增文件的【完整内容】。
3. 最后给一段「自检说明」：逐条对照上面"必须修复的问题 A-E"说明你是怎么实现的。
```

---

## 二、需要提供给 Gemini 的源文件清单

> 路径都相对仓库里的 `week1-mvp/`。贴的时候每个文件前加一行 `=== 路径 ===`。

### 必给（缺了 Gemini 没法正确改）
1. `app/scene-tools/page.tsx` ← 要改的主文件
2. `app/globals.css` ← 设计 token + .btn/.input/.select/.chip 工具类
3. `tailwind.config.js` ← 暴露了哪些 token 类（bg-bg-secondary / text-fg-* / brand-* 等）
4. `app/_components/ui/index.ts` ← 组件库导出清单
5. `app/_components/ui/segmented-control.tsx`
6. `app/_components/ui/collapsible-section.tsx`
7. `app/_components/ui/button.tsx`
8. `app/_components/ui/card.tsx`
9. `app/_components/ui/chip.tsx`
10. `app/_components/ui/select.tsx`（含 Input / Textarea）
11. `app/_components/ui/dropzone.tsx`
12. `app/_components/ui/tabs.tsx`
13. `app/_components/ui/page-header.tsx`
14. `lib/text-scene-presets.ts` ← TextScenePreset 类型 + 预设数据
15. `lib/hooks/use-job-polling.ts`、`lib/hooks/use-current-user.ts` ← hook 签名

### 强烈建议给（让结果更准、布局不跑偏）
16. `app/layout.tsx`
17. `app/_components/app-shell.tsx`、`app/_components/left-nav.tsx` ← 左导航外壳，决定页面可用宽度
18. `app/_components/task-viewport.tsx` ← 任务运行时整页切到它，别破坏
19. `lib/scene-tools-prompt.ts` ← 只需 CLOSEUP_PRESETS 的结构（key/label/isBack/recommended/description）；文件较大，可只截这一段给它
20. `package.json`、`tsconfig.json` ← React 19 / Next 15 / lucide-react / strict

### 可选（要做一致性 / 后续推广才给）
21. `app/replicate/page.tsx` ← 另一个工具页，作"统一风格"参考或第二个改造目标

---

## 三、给 Gemini 用的几条提醒（你转达或自己把关）
- 让它**先只改 scene-tools 一个页**做样板，别一次性动全站。
- 收到结果后，重点验收"问题 A-E"那几条，尤其是 **A 选中角标** 和 **B 就地折叠按钮**。
- 它如果新建了组件，确认有在 `app/_components/ui/index.ts` 里导出。
- 落地前在 `week1-mvp/` 跑一次 `npx tsc --noEmit --skipLibCheck` 确认零报错；这个挂载盘上编辑器有时会静默截断大文件，改完务必 tsc 校验、并检查文件结尾完整。
