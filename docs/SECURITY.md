# 安全边界

## 不进入 Git 的内容

- Telegram Bot Token；
- Windows 登录密码；
- 个人 Chat ID；
- 订单回调令牌与 Sites 服务访问令牌；
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

## 网页与支付行为

程序会选择模版、填入资料并创建/确认 addrs.xyz 支付订单，但只读取支付信息后停下。当前代码不接收钱包私钥或助记词，不签名交易，也不会发起链上转账。

订单状态回调同时要求：

- Sites 专用服务访问令牌通过站点访问层；
- 独立随机回调令牌通过应用接口鉴权。

两种令牌只保存在 Windows ACL 保护的运行配置和 Sites 环境变量中，不进入源码。

## 公网暴露

- 不需要开放 Telegram Webhook 端口；
- Chrome CDP 应仅绑定本机，禁止映射到公网；
- WinRM 若用于远程部署，应限制来源 IP，并优先通过 VPN/Tailscale 等私网访问；
- 不要将含 Token 的配置文件上传到工单、聊天或公开仓库。

## Token 泄露处理

如果 Token 曾出现在公开位置，应立即在 BotFather 撤销/重新生成 Token，更新 Windows 私密配置并重启 `SafeTGDemoBot`。
