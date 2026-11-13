# Changelog

## 2026.11.14

- 备份当前生产使用的 Telegram → Windows → Chrome CDP → addrs.xyz 完整链路。
- 支持可信网页发送 Bot 与专用接收 Bot 之间的 Bot-to-Bot 消息。
- 处理结果固定通知管理员，避免 Bot 互相回复形成循环。
- 修复浏览器注入脚本中的换行转义。
- 匹配 addrs.xyz 当前可见字段 `address_line1`、`address_line2`、`address_line3`，忽略隐藏的标准化字段。
- 加入 Windows 一键安装、更新、启停、状态检查和 WinRM 远程部署工具。
- 加入生产网站发送端的集成快照与迁移文档。
