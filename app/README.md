# TG 资料同步自动填入工具 (https://addrs.xyz)

通过 Telegram Bot 长轮询接收“新的个人资料提交”格式消息，并使用独立 Chrome CDP 端口 (`9333`) 自动打开和填入目标网站 `https://addrs.xyz`。程序只填入字段，不点击提交按钮。

配置说明：

- 默认目标网站：`https://addrs.xyz`（可通过环境变量 `TARGET_URL` 覆盖）。
- 默认使用独立 Chrome 调试端口 `9333`（可通过环境变量 `SAFE_DEMO_CDP_PORT` 覆盖）。
- 先按 Telegram 消息中的“模版”名称选中 addrs.xyz 对应模版，并校验页面隐藏字段 `#template`；匹配失败时不会继续填写。
- 模版校验通过后，自动匹配目标页面的姓名、三行地址（或合并地址框）及接收邮箱输入框，并触发 React/Vue 兼容的原生 `input`/`change` 事件。
- 只有 `TELEGRAM_ALLOWED_CHAT_IDS` 白名单中的会话可以触发填表。
- 网页发送 Bot 可通过 Bot-to-Bot Communication 把提交正文发给专用接收 Bot；接收端仅信任 `TELEGRAM_TRUSTED_SENDER_BOT_IDS`。
- 来自可信 Bot 的处理结果会发到 `TELEGRAM_NOTIFY_CHAT_ID`，不回复发送 Bot，避免循环对话。
- Bot update offset 会写入 `telegram-offset.json`，重启后不会重复处理已经确认过的消息。

本机测试：

```bash
npm test
SAFE_DEMO_CDP_PORT=9333 TARGET_URL=https://addrs.xyz npm run demo
```

## Telegram Bot 配置

1. 在 Telegram 中向 `@BotFather` 发送 `/newbot` 创建 Bot，取得 Bot Token。
2. 第一次部署可以暂不设置 Chat ID。部署完成后，在目标私聊、群组或频道中向 Bot 发送 `/chatid`；Bot 会回复当前 Chat ID，但不会执行填表。
3. 将回复的 Chat ID 加入 `TELEGRAM_ALLOWED_CHAT_IDS`，重新部署使白名单生效。多个 ID 使用英文逗号分隔。

群组使用时需要先把 Bot 加入群组，并在 `@BotFather` 的 `/setprivacy` 中关闭隐私模式，否则 Bot 通常只能收到命令和提及它的消息。频道使用时需要把 Bot 加为管理员，才能接收频道消息和发送状态回复。建议为本工具创建专用 Bot，不要复用已经配置 Webhook 的 Bot。

完整部署请从仓库根目录运行 `bootstrap.ps1`，远程 WinRM 部署使用 `tools/deploy_remote.py`。两种方式都会把 Token 写入服务器的 `C:\SafeTGDemo\runtime-config.json`，并限制为当前 Windows 账户和 SYSTEM 可访问；Token 不会写入项目源码或计划任务命令行。详见仓库根目录 README 与 `docs/`。

Bot 接受的消息格式：

```text
📩 新的个人资料提交
姓名：ALICE EXAMPLE
第 1 行地址：123 Example Street
第 2 行地址：Testville
第 3 行地址：ZZ 00000, Exampleland
模版：A2A
接收邮箱：alice@example.test
```

处理成功后，Bot 回复“资料已填入网页，请人工核对并提交”。格式错误、非白名单会话或填表失败都不会提交表单。

已部署服务器可在仓库根目录运行 `scripts/update-windows.ps1`，它会保留现有私密配置并重新安装代码。使用 `scripts/status-windows.ps1 -RunTests` 检查服务；需要虚构样例填入时执行更新脚本的 `-DemoFill` 参数。
