# Telegram Bot 配置

## 角色

- **网页发送 Bot**：Lumen 网站提交接口使用的 Bot，负责发出格式化资料。
- **专用接收 Bot**：Windows 服务使用的 Bot，负责 `getUpdates` 和状态通知。

建议两个角色使用不同 Bot，避免网站通知、人工对话和自动化消费互相干扰。

## Bot-to-Bot

网页发送 Bot 直接私聊接收 Bot 时，需要在 BotFather 的管理界面为两个 Bot 都启用 Bot-to-Bot Communication Mode。

Windows 运行配置：

- `telegramBotToken`：专用接收 Bot Token；
- `trustedSenderBotIds`：网页发送 Bot 的数字 ID；
- `notifyChatId`：管理员个人 Chat ID；
- `allowedChatIds`：允许人工直接发送资料的会话 ID，可为空。
- `orderCallbackUrl`：Lumen 的 `/api/address-orders/callback` 地址；
- `orderCallbackToken`：与站点环境变量一致的随机令牌；
- `siteAccessToken`：Sites 为受限站点签发的服务访问令牌。

接收 Bot 收到可信发送 Bot 的资料后，会先把原始正文转发到管理员个人 Chat，再自动创建 addrs.xyz 支付订单并发送支付信息。

## 获取数字 ID

- 接收 Bot 启动后，人工向它发送 `/chatid`，可获得当前会话 Chat ID。
- Bot 数字 ID 通常是 Token 冒号前的数字，但 Token 本身必须视为密码，不能提交到仓库或发到公开频道。

## 网站发送端

网站使用发送 Bot Token 调用：

```json
{
  "chat_id": "@YOUR_RECEIVER_BOT",
  "text": "📩 新的个人资料提交\n订单编号：ADDR-20261114-AB12CD34\n姓名：..."
}
```

网站端参考实现位于 `site-integration/`。

## Webhook 冲突

接收器使用 `getUpdates`。如果同一 Bot 配置了 Webhook，Telegram 不允许同时轮询。迁移前应确认接收 Bot 没有被其他系统占用。
