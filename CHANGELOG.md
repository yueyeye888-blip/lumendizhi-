# Changelog

## 2026.11.14

- 网站提交页移除“隔离流程测试”及其模拟接口、虚构地址生成器。
- 网站前后端同时强制选择有效模版，Telegram 消息新增“模版”字段。
- Windows Chrome CDP 在填资料前精确选择并校验 addrs.xyz 对应模版，找不到时终止处理。
- 更新 addrs.xyz 当前姓名和邮箱字段选择器，并通过 A2A 真实页面只填不提交验证。
- 接收端回归测试增加到 12 项，备份加入网站模版选择组件和服务端校验快照。
- 备份当前生产使用的 Telegram → Windows → Chrome CDP → addrs.xyz 完整链路。
- 支持可信网页发送 Bot 与专用接收 Bot 之间的 Bot-to-Bot 消息。
- 处理结果固定通知管理员，避免 Bot 互相回复形成循环。
- 修复浏览器注入脚本中的换行转义。
- 匹配 addrs.xyz 当前可见字段 `address_line1`、`address_line2`、`address_line3`，忽略隐藏的标准化字段。
- 加入 Windows 一键安装、更新、启停、状态检查和 WinRM 远程部署工具。
- 加入生产网站发送端的集成快照与迁移文档。
