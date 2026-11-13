# 故障排查

## 接收不到消息

1. 运行 `scripts\status-windows.ps1`，确认 Bot 任务和 Node 进程存在。
2. 检查服务器能否访问 `https://api.telegram.org`。
3. 确认接收 Bot 没有配置 Webhook，也没有在另一台服务器运行 `getUpdates`。
4. Bot-to-Bot 场景确认两个 Bot 都开启互通模式。
5. 确认 `trustedSenderBotIds` 是发送 Bot 的数字 ID。

## 收到“消息格式无法识别”

消息必须严格包含标题、订单编号和资料标签。参考 `app/sample-message.txt` 和 `docs/MESSAGE_FORMAT.md`。

## Chrome CDP 不可用

```powershell
Get-ScheduledTask SafeTGDemoBrowser
Invoke-RestMethod http://127.0.0.1:9333/json/version
```

Chrome 需要交互式桌面会话。请用运行计划任务的同一个 Windows 账户登录，不要只保留无桌面的服务会话。

## 网页打开但字段没有填写

1. 确认目标 URL 是 `https://addrs.xyz` 或当前实际地址。
2. 确认 Chrome 没有停在登录页、验证码或错误页。
3. 查看 `telegram-bot.log` 的最新错误。
4. 执行 `status-windows.ps1 -RunTests`。
5. 网站字段若改版，需要更新 `app/cdp-fill.mjs` 的 selector 和对应回归测试。

## 地址填到隐藏字段

当前代码会检查 `display`、`visibility` 和元素尺寸，并优先匹配可见的 `address_line1/2/3`。如果网站再次改版，应先检查 DOM，再更新 selector，不要删除可见性过滤。

## Bot 互相回复形成循环

可信发送 Bot 的处理结果必须发送到 `notifyChatId`，不能回复原发送 Bot。确认该字段是管理员个人 Chat ID。

## 员工订单页一直停在排队

1. 检查 `orderCallbackUrl`、`orderCallbackToken`、`siteAccessToken` 是否都已配置；
2. 受限站点回调必须带 `OAI-Sites-Authorization: Bearer <token>`；
3. 站点回调接口还会独立校验 `Authorization: Bearer <orderCallbackToken>`；
4. 确认生产 D1 已执行 `address_orders` 迁移。

## addrs.xyz 显示人机验证失败

在服务器的自动化 Chrome 中按网站提示人工完成验证，然后重新提交资料。不要尝试绕过验证码或第三方风控。
