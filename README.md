Anonymous Chat 3.0

基于 Cloudflare Workers 构建的轻量级匿名聊天室，使用 WebSocket、D1、R2 和 Durable Objects 提供聊天、图片上传及管理功能。

项目状态：开发与测试中

项目尚未完成完整的安全审计。正式公开使用前，请检查 Cloudflare 配置、权限控制和安全设置。

⸻

目录

* 功能介绍
* 技术架构
* 项目结构
* 运行环境
* Cloudflare 配置
* 本地开发
* 部署
* 管理员后台
* 安全与隐私

⸻

功能介绍

普通用户

* 匿名浏览器 ID，无需注册账号。
* 公共聊天室，支持 WebSocket 实时消息。
* 自定义昵称。
* 私信 API，支持持久化消息。
* 查看在线用户信息。
* 上传图片至 Cloudflare R2。
* 举报其他用户。
* 查看相关处理通知。

管理员

* 独立管理员登录页面：/admin
* 管理员密码验证。
* 管理员会话管理，支持退出登录。
* 查看举报记录。
* 处理举报。
* 查看访问记录。
* 查看安全事件。
* 查看处罚记录。

举报处理

目前支持以下处理类型：

类型	说明
none	不进行处罚
warning	警告
mute	禁言
ban	封禁用户
ip_ban	IP 指纹封禁

具体处理结果以服务器实际实现为准。

⸻

技术架构

技术	用途
Cloudflare Workers	后端服务
TypeScript	后端开发
WebSocket	实时公共聊天
Cloudflare D1	数据库
Cloudflare R2	图片对象存储
Durable Objects	聊天房间状态管理
HTML / CSS / JavaScript	前端页面
Wrangler	本地开发和部署

⸻

项目结构

anonymous-chat/
├── public/
│   ├── index.html
│   ├── admin.html
│   └── admin.js
├── src/
│   └── index.ts
├── package.json
├── wrangler.jsonc
└── README.md

以上为主要文件示意，实际目录以仓库中的文件为准。

⸻

运行环境

开始之前，需要准备：

* Node.js
* npm
* Cloudflare 账号
* Wrangler CLI
* Cloudflare D1 数据库
* Cloudflare R2 存储桶
* Durable Objects

⸻

Cloudflare 配置

1. D1 数据库

在 Cloudflare 创建 D1 数据库，并将绑定名称设置为：

CHAT_DB

2. R2 存储桶

创建 R2 Bucket，并配置 Worker 绑定：

{
  "r2_buckets": [
    {
      "binding": "CHAT_IMAGES",
      "bucket_name": "你的R2存储桶名称"
    }
  ]
}

注意：需要将这段配置合并到 wrangler.jsonc 的现有配置中，而不是直接覆盖整个文件。

3. Durable Objects

需要配置以下绑定：

{
  "durable_objects": {
    "bindings": [
      {
        "name": "CHAT_ROOM",
        "class_name": "ChatRoom"
      }
    ]
  }
}

同时需要保留项目已有的 Durable Objects migration 配置。

4. Secrets

在 Cloudflare Worker 中设置以下 Secrets：

npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put IP_HASH_SALT

这些值应使用安全、独立的随机内容。

不要将真实密码、密钥或 Token 提交到 GitHub。

5. 环境变量

项目使用以下配置：

MAX_IMAGE_BYTES=5242880
MESSAGE_LIMIT=500

⸻

本地开发

1. 下载项目

git clone https://github.com/Fzhai0110/anonymous-chat.git
cd anonymous-chat

2. 安装依赖

npm install

3. 本地数据库迁移

npm run db:local

4. 启动开发服务器

npm run dev

⸻

部署

1. 检查配置

部署之前，请确认：

* wrangler.jsonc 中的 Worker 名称正确。
* D1 数据库绑定正确。
* R2 Bucket 绑定正确。
* Durable Objects 绑定和 migration 正确。
* 必需的 Secrets 已设置。

2. 执行远程数据库迁移

npm run db:remote

3. 部署 Worker

npm run deploy

部署后，请检查聊天室、图片上传、举报提交和管理员登录是否正常。

⸻

npm 命令

命令	用途
npm run dev	启动本地开发服务器
npm run deploy	部署 Worker
npm run db:local	执行本地 D1 迁移
npm run db:remote	执行远程 D1 迁移
npm run typecheck	TypeScript 类型检查

⸻

管理员后台

访问：

https://你的Worker域名/admin

使用管理员密码登录。

后台目前包含：

* Dashboard
* Reports
* Visitors
* Security
* Sanctions

管理员会话由服务器验证。请勿将管理员密码分享给其他人。

⸻

安全与隐私

项目包含以下安全相关设计：

* 匿名浏览器 ID。
* 管理员密码验证。
* HttpOnly、Secure、SameSite Strict 会话 Cookie。
* 管理员 API 会话验证。
* IP 地址使用带盐 SHA-256 生成指纹。
* 访问记录定期清理。
* 举报和处罚记录。

隐私说明：

项目使用 IP 指纹辅助安全管理，不代表完全匿名，也不代表不会产生其他访问日志。

本项目目前不应被视为已经通过专业安全审计的生产级系统。

⸻

自动部署

可以通过 GitHub 与 Cloudflare Workers 的部署集成实现自动部署。

请在 Cloudflare 中检查 GitHub 仓库连接、构建配置和部署目标，确保部署的是正确的 Worker。

⸻

项目地址

GitHub：

https://github.com/Fzhai0110/anonymous-chat

Cloudflare Workers：

https://workers.cloudflare.com/

Wrangler 文档：

https://developers.cloudflare.com/workers/wrangler/

Cloudflare D1：

https://developers.cloudflare.com/d1/

Cloudflare R2：

https://developers.cloudflare.com/r2/

⸻

License

如需公开分发或允许他人使用，请在仓库中明确添加许可证。