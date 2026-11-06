# Anonymous Chat 3.0 — Cloudflare Workers starter

这是一个整合型原型工程，面向初学者。它包含公共聊天室 WebSocket、最近 300 条公共消息、在线连接数、匿名浏览器 ID、私信 API、图片上传到 R2、举报提交、管理员举报处理、处罚记录、双方通知、访问安全日志和管理员操作审计。

## 重要状态说明
- 已编写：上述功能的基础代码与 D1 schema。
- 尚未验证：`npm install`、TypeScript 类型检查、Wrangler 本地启动、Cloudflare 实际部署、D1/R2/Access 配置、多人端到端测试。
- 当前在线人数统计 WebSocket 连接数，不是去重人数；在线用户列表根据最近活动时间展示，尚未做到严格实时的跨房间在线追踪。
- 私信是持久化 API 轮询/读取模型，不是实时推送；尚未实现私信通知、已读状态 UI。
- 举报处理页面当前提供基础查看和“警告并处理”按钮；其他处罚 API/表结构可扩展，但完整处罚表单 UI、申诉流程尚未完成。
- 图片会上传并保存对象，但图片消息在大厅中目前以 URL 文本显示；需要补充图片卡片渲染和图片删除/举报联动。
- IP 采用带盐 SHA-256 指纹保存，不保存明文 IP；后台只能查看指纹。IP 封禁 API 使用指纹，管理员需要从安全流程中获取准确指纹。不要把 IP 指纹当作真实身份。
- 本工程不是安全审计完成的生产系统。先在测试环境部署，不要直接公开给陌生人使用。

## 1. 准备
安装 Node.js LTS 和电脑端终端。iPhone 可以浏览网站，但不适合首次部署。
解压 ZIP 后，在项目目录执行：
```bash
npm install
```

## 2. 创建 Cloudflare 资源
登录 Cloudflare Dashboard：
1. 创建 D1 数据库，名称 `anonymous-chat-db`。
2. 创建 R2 bucket，名称 `anonymous-chat-images`。
3. 在 `wrangler.jsonc` 中把 `REPLACE_WITH_D1_DATABASE_ID` 替换成 D1 页面显示的真实 Database ID。
4. 在 Worker 设置中添加 Secret：`IP_HASH_SALT`，使用随机且长期保密的高强度值。

## 3. 配置管理员 Cloudflare Access
在 Cloudflare Zero Trust 中为 `/admin*` 和 `/api/admin/*` 配置 Access Application，只允许你的管理员邮箱。必须让 Access 对 Worker 请求注入 `Cf-Access-Authenticated-User-Email`。不要只依靠网页隐藏入口；后端 API 也检查该头。
测试时确认未登录管理员访问 `/api/admin/reports` 返回 403，授权管理员访问成功。

## 4. 数据库迁移与部署
```bash
npx wrangler login
npm run db:remote
npm run deploy
```
本地开发可执行：
```bash
npm run db:local
npm run dev
```
如果你修改了 Durable Object SQLite schema 或绑定，先阅读 Cloudflare Durable Objects migration 文档，不要随意重置生产数据。

## 5. 安全测试清单
- 两个不同浏览器使用不同匿名 ID：测试公共消息互通。
- 刷新页面：确认公共历史保留。
- 检查 WebSocket 断开后在线连接数是否恢复。
- 尝试发送超长文本、空文本、频繁消息。
- 尝试上传伪装成 JPEG 的非图片文件、超 5 MB 文件、SVG。
- 普通用户访问 `/api/admin/reports` 应返回 403。
- 用户 A 不应能读取用户 C 与用户 B 的私信；修改 `with` 参数进行越权测试。
- 用户 A 不应能读取用户 B 的 notices；修改匿名 ID 测试。
- 举报处理后，举报者和被举报者分别只能通过自己的匿名 ID 读取各自通知。
- 测试 mute、ban、ip_ban 到期与解除。当前聊天 WebSocket 消息处理还需要补充每条消息的服务器端处罚检查，部署前必须补齐。
- 检查管理员操作是否写入 `admin_audit_logs`。
- 检查 visitor_logs 只保留 7 天，且其中没有明文 IP。
- 检查 IP 级封禁不会因共享网络而误伤无关用户；建议先人工复核并短时限，不要自动处罚。

## 6. 隐私与安全限制
匿名 ID 保存在浏览器 localStorage，清除网站数据会丢失；用户可以复制/伪造 ID，因此它不是可靠账号认证。私信与举报 API 需要在上线前加入更强的速率限制、会话签名和滥用防护。聊天内容和私信不是端到端加密。IP 指纹仍属于可关联的在线标识数据，应限制访问并制定保留期限。向访客清楚说明日志用途。
