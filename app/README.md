# TG 资料同步自动填入工具 (https://addrs.xyz)

通过 Telegram Bot 长轮询接收“新的个人资料提交”格式消息，并使用独立 Chrome CDP 端口 (`9333`) 自动打开和填入目标网站 `https://addrs.xyz`。填表后程序会创建并确认订单，读取支付金额、BSC/BEP20 网络和收款地址，再进入 BSC USDT 付款模块。默认 `dry-run` 仅完成解密、链 ID、合约、余额、Gas、限额和防重检查，不签名、不广播。

配置说明：

- 默认目标网站：`https://addrs.xyz`（可通过环境变量 `TARGET_URL` 覆盖）。
- 默认使用独立 Chrome 调试端口 `9333`（可通过环境变量 `SAFE_DEMO_CDP_PORT` 覆盖）。
- 先按 Telegram 消息中的“模版”名称选中 addrs.xyz 对应模版，并校验页面隐藏字段 `#template`；匹配失败时不会继续填写。
- 每个新订单都会重新加载 addrs.xyz，等待新的 Cloudflare Turnstile 响应后再填表；验证失败会刷新页面，不复用旧令牌。如果 Turnstile 要求交互，必须在服务器 Chrome 中人工完成，程序不会绕过验证。
- 模版校验通过后，自动匹配目标页面的姓名、三行地址（或合并地址框）及接收邮箱输入框，并触发 React/Vue 兼容的原生 `input`/`change` 事件。
- 只有 `TELEGRAM_ALLOWED_CHAT_IDS` 白名单中的会话可以触发填表。
- 网页发送 Bot 可通过 Bot-to-Bot Communication 把提交正文发给专用接收 Bot；接收端仅信任 `TELEGRAM_TRUSTED_SENDER_BOT_IDS`。
- 来自可信 Bot 的完整资料正文和处理结果都会发到 `TELEGRAM_NOTIFY_CHAT_ID`，不回复发送 Bot，避免循环对话。
- `ADDRESS_ORDER_CALLBACK_URL` 与 `ADDRESS_ORDER_CALLBACK_TOKEN` 用于把“自动填表 / 等待支付 / 失败”等状态写回员工订单页。
- 受限访问站点还需要把 Sites 专用服务令牌保存为 `SITES_SERVICE_ACCESS_TOKEN`；它只用于通过站点访问层，回调接口仍会再次校验订单回调令牌。
- Bot update offset 会写入 `telegram-offset.json`，重启后不会重复处理已经确认过的消息。
- BSC 固定校验 Chain ID `56`、官方 RPC 和允许列表中的 Binance-Peg USDT 合约；默认单笔上限 `5 USDT`，不设 24 小时累计上限。
- `live` 模式必须同时设置独立的二次启用口令；仅改模式字段不会启动付款。
- Outlook 邮件接管使用 OAuth2 读取专用邮箱中的成品邮件，提取 PDF 和图片附件，再以“越大爷”正文发送到员工原收件邮箱；OAuth 刷新令牌使用 Windows CurrentUser DPAPI 加密。

本机测试：

```bash
npm test
SAFE_DEMO_CDP_PORT=9333 TARGET_URL=https://addrs.xyz npm run demo
npm run wallet-preflight
npm run dry-run-flow
```

## 本地导入付款钱包

部署完成后，在 Windows 服务器桌面双击 `导入付款钱包（窗口保持打开）` 快捷方式。启动器会明确提示何时粘贴，并在成功或失败后保留结果，不会落回普通 `PS>` 命令提示符。也可在服务器本机运行：

```powershell
C:\SafeTGDemo\import-payer-wallet.cmd
```

工具会通过隐藏输入读取私钥，使用 ethers 校验对应公开地址，然后以当前 Windows 账户的 DPAPI 加密保存到 `C:\SafeTGDemo\secrets\payer-private-key.dpapi`。公开地址和网络元数据保存在同目录的 `payer-wallet.json`。目录 ACL 只允许当前账户和 SYSTEM 访问；私钥不会出现在命令行、日志、源码或 Telegram 中。

DPAPI 密文绑定当前 Windows 账户。迁移服务器时不要直接复制该密文，应在新服务器重新运行导入工具。

## Outlook 品牌邮件交付

在 `runtime-config.json` 的 `outlookRelay` 中填写专用 Outlook 邮箱和 Microsoft Entra 公共客户端 Client ID。首次保持 `enabled: false`，部署后在服务器桌面双击 `授权 Outlook 邮箱（窗口保持打开）`，按窗口中的设备登录代码完成授权。

授权完成并把 `enabled` 改为 `true` 后，自动填表会把 Addrs.xyz 接收邮箱改为专用 Outlook 邮箱；服务器按外部订单号匹配原员工邮箱，仅重新发送 PDF 和图片附件。原邮件正文、Logo 和 Addrs.xyz 品牌不会转发。

邮箱密码、访问令牌和刷新令牌都不会写入源码或 GitHub。迁移服务器时不要复制 `outlook-refresh-token.dpapi`，需要在新服务器重新授权。

## BSC USDT 付款预演

`runtime-config.json` 默认使用 `paymentMode: "dry-run"`。每次建单后会实际解密本机 DPAPI 钱包，连接 BSC 主网，校验 USDT 合约与收款地址，读取 USDT/BNB 余额并估算 Gas。预演记录写入 `data/payment-ledger.json`，不包含私钥。

`dry-run` 结果会在 Telegram 明确显示 `未签名、未广播`。不要在未检查限额、余额和订单幂等记录前把生产配置切换为 `live`。

## Telegram Bot 配置

1. 在 Telegram 中向 `@BotFather` 发送 `/newbot` 创建 Bot，取得 Bot Token。
2. 第一次部署可以暂不设置 Chat ID。部署完成后，在目标私聊、群组或频道中向 Bot 发送 `/chatid`；Bot 会回复当前 Chat ID，但不会执行填表。
3. 将回复的 Chat ID 加入 `TELEGRAM_ALLOWED_CHAT_IDS`，重新部署使白名单生效。多个 ID 使用英文逗号分隔。

群组使用时需要先把 Bot 加入群组，并在 `@BotFather` 的 `/setprivacy` 中关闭隐私模式，否则 Bot 通常只能收到命令和提及它的消息。频道使用时需要把 Bot 加为管理员，才能接收频道消息和发送状态回复。建议为本工具创建专用 Bot，不要复用已经配置 Webhook 的 Bot。

部署到 Windows 服务器前，在本机设置连接信息；不要把密码写入脚本或提交到版本库：

```bash
export SAFE_DEMO_HOST="服务器 IP"
export SAFE_DEMO_USER="administrator"
export SAFE_DEMO_PASSWORD="服务器密码"
export TELEGRAM_BOT_TOKEN="从 BotFather 获得的 Token"
# 首次部署可以留空；取得 /chatid 回复后再设置并重新部署
export TELEGRAM_ALLOWED_CHAT_IDS="123456789,-1001234567890"
export TELEGRAM_TRUSTED_SENDER_BOT_IDS="网页发送 Bot 的数字 ID"
export TELEGRAM_NOTIFY_CHAT_ID="接收处理结果的个人 Chat ID"
export ADDRESS_ORDER_CALLBACK_URL="https://站点域名/api/address-orders/callback"
export ADDRESS_ORDER_CALLBACK_TOKEN="与站点环境变量相同的随机令牌"
export SITES_SERVICE_ACCESS_TOKEN="Sites 为该站点签发的服务访问令牌"
export TARGET_URL="https://addrs.xyz"
python3 ../deploy_safe_tg_demo.py
```

部署脚本会把 Token 写入服务器的 `C:\SafeTGDemo\runtime-config.json`，并限制为当前 Windows 账户和 SYSTEM 可访问。Token 不会写入项目源码或计划任务命令行。

Bot 接受的消息格式：

```text
📩 新的个人资料提交
订单编号：ADDR-20261114-AB12CD34
姓名：ALICE EXAMPLE
第 1 行地址：123 Example Street
第 2 行地址：Testville
第 3 行地址：ZZ 00000, Exampleland
模版：A2A
接收邮箱：alice@example.test
```

处理成功后，Bot 会发送 addrs.xyz 订单号、精确支付金额、BSC/BEP20 网络和收款地址。格式错误、非白名单会话或填表失败都不会继续创建订单。

服务器已经存在 `runtime-config.json` 时，只更新程序代码并保留现有 Bot Token、白名单和通知配置：

```bash
python3 ../deploy_safe_tg_demo.py --code-only
```

只检查并启动已经部署的 Bot（不会执行样例填入）：

```bash
python3 ../deploy_safe_tg_demo.py --run-only
```

确实需要使用 `sample-message.txt` 做一次样例填入时，显式增加：

```bash
python3 ../deploy_safe_tg_demo.py --run-only --demo-fill
```
