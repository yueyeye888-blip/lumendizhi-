# Lumen 网站发送端集成快照

这里保存与地址资料自动填入链路直接相关的生产网站代码快照，方便以后在新网站或新版本中恢复同样的消息格式与 Telegram 路由。

## 文件

- `app/api/personal-details/submit/route.ts`：登录用户提交资料后，通过 Telegram Bot API 发送固定格式消息。
- `app/api/supplier-templates/route.ts`：提供当前 addrs.xyz 模版目录快照。
- `app/api/settings/telegram/route.ts`：管理员读取和保存发送 Bot 配置。
- `components/personal-details-form.tsx`：要求先选模版，并把模版 ID/名称随资料提交。
- `components/supplier-template-library.tsx`：把当前所选模版传给资料表单。
- `lib/addrs-catalog.ts` 与 `lib/submitted-template.mjs`：目录快照读取及服务端模版一致性校验。
- `lib/test-address.mjs`：62 个国家的三行英文地址生成器，作为正常表单功能使用。
- `lib/personal-details-notice.mjs`：唯一的消息格式化函数。
- `lib/telegram-settings.ts`：读取数据库设置，并允许生产环境 `TELEGRAM_CHAT_ID` 覆盖接收方。
- `tests/personal-details-notice.test.mjs`：确保网站输出与 Windows 解析器协议一致。

这些文件依赖原 Lumen 网站中的身份认证、数据库、加密与资料验证模块，不能作为独立应用直接运行。迁移到新网站时，应将相同逻辑合并到目标项目，而不是单独部署本目录。

## 生产配置模型

推荐配置：

```text
数据库中的 Bot Token = 网页发送 Bot Token
生产环境 TELEGRAM_CHAT_ID = @专用接收Bot用户名
Windows telegramBotToken = 专用接收 Bot Token
Windows trustedSenderBotIds = 网页发送 Bot 数字 ID
Windows notifyChatId = 管理员个人 Chat ID
```

`lib/telegram-settings.ts` 会优先使用生产环境的 `TELEGRAM_CHAT_ID` 覆盖数据库中的旧 Chat ID，但不会覆盖数据库中加密保存的发送 Bot Token。这样可以在不重新输入 Token 的情况下切换接收方。

## 部署检查

1. 两个 Bot 均在 BotFather 中启用 Bot-to-Bot Communication Mode。
2. 网站能访问 `api.telegram.org`。
3. `TELEGRAM_CHAT_ID` 使用 `@receiver_bot` 或合法数字 Chat ID。
4. Windows 接收器信任网站发送 Bot 的数字 ID。
5. 自动生成地址功能可选择国家，生成后仍可修改，不依赖已删除的隔离测试流程。
6. 网站未选模版时不能提交，服务端也会拒绝缺失或被篡改的模版。
7. 使用虚构资料测试，并确认 addrs.xyz 先选中同名模版、再填入资料且不提交。
