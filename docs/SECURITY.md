# 安全边界

## 不进入 Git 的内容

- Telegram Bot Token；
- Windows 登录密码；
- 个人 Chat ID；
- 生产数据库和加密密钥；
- Chrome Profile、Cookie、登录会话；
- Telegram offset、运行日志和填表截图。

## 配置权限

安装器通过 `icacls` 移除 `runtime-config.json` 的继承权限，只允许当前 Windows 账户和 SYSTEM 完全控制。

## 消息来源

只有以下来源会触发填表：

- `allowedChatIds` 中的会话；
- `trustedSenderBotIds` 中的 Bot。

其他人工会话只会收到未授权提示；其他 Bot 消息会静默忽略。

## 网页行为

填表程序不包含提交、购买、支付或确认按钮的查找和点击逻辑。最终网页提交必须人工完成。

## 公网暴露

- 不需要开放 Telegram Webhook 端口；
- Chrome CDP 应仅绑定本机，禁止映射到公网；
- WinRM 若用于远程部署，应限制来源 IP，并优先通过 VPN/Tailscale 等私网访问；
- 不要将含 Token 的配置文件上传到工单、聊天或公开仓库。

## Token 泄露处理

如果 Token 曾出现在公开位置，应立即在 BotFather 撤销/重新生成 Token，更新 Windows 私密配置并重启 `SafeTGDemoBot`。
