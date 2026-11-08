Anonymous Chat 3.0

基于 Cloudflare Workers 的轻量匿名聊天室项目，使用 WebSocket、D1、R2 和 Durable Objects 提供聊天及管理功能。

项目状态： 本项目仍在开发和测试中，尚未经过完整安全审计。公开使用前，请完成部署检查和安全测试。

功能介绍

普通用户

* 匿名浏览器 ID，无需注册账号。
* 公共聊天室，支持 WebSocket 实时消息。
* 昵称设置。
* 私信 API，支持持久化消息。
* 在线用户信息。
* 图片上传至 Cloudflare R2。
* 举报用户。
* 查看相关处理通知。

管理员

* 独立管理员登录页面：/admin
* 管理员密码登录。
* 8 小时登录会话。
* 安全退出登录。
* Dashboard。
* 举报管理。
* 访问记录。
* 安全中心。
* 处罚记录。
* 管理员 API 支持举报处理及处罚操作。

注意：当前管理页面提供基础举报查看和“警告并处理”操作。完整处罚表单、申诉流程等仍需继续开发。

技术架构

技术	用途
Cloudflare Workers	后端服务
Cloudflare D1	数据库
Cloudflare R2	图片存储
Durable Objects	聊天连接管理
TypeScript	后端代码
JavaScript	前端逻辑
Wrangler	本地开发与部署

管理员登录

访问：

https://你的域名/admin

输入管理员密码即可登录。

需要在 Cloudflare Worker Secrets 中配置：

* ADMIN_PASSWORD：管理员密码。
* ADMIN_SESSION_SECRET：管理员会话签名密钥。
* IP_HASH_SALT：IP 哈希盐值。

管理员会话有效期为 8 小时。

不要将这些 Secret 写入 GitHub 或公开分享。

Cloudflare 资源配置

需要准备：

1. D1 数据库，绑定名称 CHAT_DB。
2. R2 Bucket，绑定名称 CHAT_IMAGES。
3. Durable Object，绑定名称 CHAT_ROOM，类名 ChatRoom。

普通变量：

* MAX_IMAGE_BYTES：图片大小限制，当前示例为 5242880。
* MESSAGE_LIMIT：消息长度限制，当前示例为 500。

请核对 wrangler.jsonc 中的数据库 ID、Worker 名称及所有资源绑定。

本地开发

需要安装 Node.js LTS 和 Wrangler。

安装依赖：

npm install

登录 Cloudflare：

npx wrangler login

本地运行：

npm run dev

应用远程数据库迁移：

npm run db:remote

部署：

npm run deploy

package.json 命令

命令	作用
npm run dev	本地开发
npm run deploy	部署 Worker
npm run db:local	本地数据库迁移
npm run db:remote	远程数据库迁移
npm run typecheck	TypeScript 类型检查

部署前请检查 wrangler.jsonc 中的 name。当前仓库配置曾使用 chatbeta，请确认它与你准备部署的 Worker 一致，避免部署到错误的 Worker。

安全测试清单

* [ ]	两个浏览器之间可以正常聊天。
* [ ]	刷新后公共消息历史正常。
* [ ]	WebSocket 断开后连接数恢复。
* [ ]	图片上传正常。
* [ ]	私信只能由相关用户读取。
* [ ]	举报可以正常提交。
* [ ]	管理员可以查看举报。
* [ ]	举报处理后通知正常。
* [ ]	未登录用户无法访问管理员 API。
* [ ]	退出登录后管理员会话失效。
* [ ]	检查处罚到期和解除。
* [ ]	检查管理员操作审计记录。

隐私与安全说明

* 匿名 ID 保存在浏览器 localStorage 中，不是可靠的账号身份认证。
* 聊天消息和私信不是端到端加密。
* IP 指纹是带盐哈希后的可关联标识，不等于真实身份。
* 访问日志应限制访问权限，并制定数据保留期限。
* 当前 visitor_logs 会清理超过 7 天的记录。
* IP 封禁可能影响使用同一网络的其他用户，应谨慎使用。
* 上线前仍需评估速率限制、滥用防护、数据备份和删除机制。

本项目不应被视为经过完整安全审计的生产系统。请在获得许可的范围内使用。

自动部署

可以在 Cloudflare Dashboard 配置 GitHub 集成和 Workers Builds。

请确认：

* GitHub 仓库和分支正确。
* Worker 名称正确。
* Secrets 已配置。
* D1、R2 和 Durable Objects 绑定正确。
* 部署后完成基本功能测试。

相关链接

* GitHub：https://github.com/Fzhai0110/anonymous-chat
* Cloudflare Workers：https://developers.cloudflare.com/workers/
* Cloudflare D1：https://developers.cloudflare.com/d1/
* Cloudflare R2：https://developers.cloudflare.com/r2/
* Wrangler：https://developers.cloudflare.com/workers/wrangler/