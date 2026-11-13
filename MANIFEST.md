# 备份清单

本仓库备份以下可重建内容：

| 模块 | 路径 | 状态 |
|---|---|---|
| Telegram 长轮询接收器 | `app/telegram-bot.mjs` | 完整 |
| 消息解析与校验 | `app/lib/parser.mjs` | 完整 |
| 白名单/可信 Bot 鉴权 | `app/lib/telegram.mjs` | 完整 |
| Chrome CDP 自动填表 | `app/cdp-fill.mjs` | 完整 |
| 本机状态演示页 | `app/server.mjs`, `app/public/` | 完整 |
| Node 回归测试 | `app/tests/` | 10 项 |
| Windows 一键安装 | `bootstrap.ps1`, `scripts/install-windows.ps1` | 完整 |
| Windows 更新/启停/状态 | `scripts/` | 完整 |
| WinRM 远程部署 | `tools/deploy_remote.py` | 完整 |
| Lumen 网站发送接口 | `site-integration/` | 集成快照 |
| GitHub CI 模板 | `ci/test.workflow.yml.example` | Node 22，可选启用 |
| 架构/迁移/运维/安全文档 | `docs/` | 完整 |

以下敏感或不可移植内容不会备份：

- Bot Token 和 Windows 密码；
- 个人 Chat ID；
- Chrome Profile、Cookie、登录态；
- 生产数据库、加密密钥；
- 运行日志、Telegram offset 和页面截图。

这些内容应在新服务器安装时重新注入或人工登录，不能放入公开 Git 仓库。
