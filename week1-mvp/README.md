# 家居软品 AI 工具

面向抱枕、枕套、眼罩、发圈、凉感被、夏被、羽绒被等家居软品的 AI 出图工具。

## 本地运行

```bash
npm install
npm run dev
```

默认本地登录账号由 `.env.local` 控制：

```bash
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=admin123456
SESSION_SECRET=至少 32 位随机字符串
```

如果刚跑过 `npm run build`，请先停止 `npm run dev`，删除 `.next` 后再重新启动开发服务器。否则浏览器可能请求到旧的 Next.js 静态 chunk，表现为登录按钮点击后没有反应。

## 回归测试

先启动本地服务，再运行：

```bash
npm run test:e2e:login
```

这个测试会用 Chrome 打开 `/login`，填入管理员账号，确认 `/api/auth/login` 返回成功，跳转到 dashboard，并检查 `家居软品AI`、`软品批量摄影`、`家居场景图` 三个核心入口可见。它也会捕获 `/_next/static/` 资源 404，专门防止“按钮没反应”的问题复发。

## 云服务器环境变量

部署到 Google Cloud VM / Docker 时，至少配置：

```bash
NODE_ENV=production
DATA_DIR=/app/data
SESSION_SECRET=至少 32 位随机字符串
INITIAL_ADMIN_USERNAME=你的管理员账号
INITIAL_ADMIN_PASSWORD=你的管理员密码
GEMINI_API_KEY=你的 Gemini API key
OPENAI_API_KEY=可选，使用 OpenAI 出图时配置
```

Docker Compose 会把数据挂载到容器内 `/app/data`，数据库、上传图和生成图都在这里持久化。

## 生产模式检查

Dockerfile 已经按 standalone 模式复制了 `.next/static`，容器内会直接运行：

```bash
node server.js
```

如果在本机或裸 VM 上不用 Docker、直接跑 standalone，需要先复制静态资源：

```bash
npm run build
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/static
SESSION_SECRET=your-secret DATA_DIR=$PWD/data PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js
```

启动后再跑：

```bash
npm run test:e2e:login
```
