# 新服务器迁移手册

## 1. 迁移前记录

在旧服务器以管理员 PowerShell 执行：

```powershell
cd C:\lumendizhi
.\scripts\status-windows.ps1 -RunTests
```

记录但不要公开以下信息：

- 接收 Bot Token；
- 允许的 Chat ID；
- 网页发送 Bot 数字 ID；
- 管理员通知 Chat ID；
- 目标 URL 和 CDP 端口。

不要复制旧 Chrome Profile。Profile 可能包含 Cookie、登录会话和其他敏感数据。

## 2. 停止旧服务器

```powershell
.\scripts\stop-windows.ps1
```

必须先停止旧 Telegram 长轮询，再启动新服务器。同一个 Token 并行运行两个 `getUpdates` 消费者会造成消息争抢。

## 3. 安装新服务器

以将长期运行本程序的 Windows 账户登录桌面，并以管理员身份运行：

```powershell
git clone https://github.com/yueyeye888-blip/lumendizhi-.git C:\lumendizhi
Set-ExecutionPolicy -Scope Process Bypass -Force
cd C:\lumendizhi
.\bootstrap.ps1
```

也可以在本机 macOS/Linux 执行 WinRM 远程部署：

```bash
python3 -m pip install -r requirements.txt
export SAFE_DEMO_HOST="NEW_SERVER_IP"
export SAFE_DEMO_USER="administrator"
export SAFE_DEMO_PASSWORD="WINDOWS_PASSWORD"
export TELEGRAM_BOT_TOKEN="RECEIVER_BOT_TOKEN"
export TELEGRAM_ALLOWED_CHAT_IDS="ALLOWED_CHAT_ID"
export TELEGRAM_TRUSTED_SENDER_BOT_IDS="WEBSITE_SENDER_BOT_ID"
export TELEGRAM_NOTIFY_CHAT_ID="ADMIN_CHAT_ID"
python3 tools/deploy_remote.py
```

## 4. Telegram 设置

在 BotFather 中确认：

- 网页发送 Bot 已启用 Bot-to-Bot Communication Mode；
- 专用接收 Bot 也已启用 Bot-to-Bot Communication Mode；
- Lumen 网页端的目标 Chat ID 是接收 Bot 用户名（如 `@receiver_bot`）；
- Windows 配置中的 Token 属于接收 Bot；
- `trustedSenderBotIds` 使用发送 Bot 的数字 ID，而不是用户名。

## 5. 验证

```powershell
.\scripts\status-windows.ps1 -RunTests
```

发送以下虚构消息：

```text
📩 新的个人资料提交
姓名：ALICE EXAMPLE
第 1 行地址：123 Example Street
第 2 行地址：Testville
第 3 行地址：ZZ 00000, Exampleland
接收邮箱：alice@example.test
```

验证：

1. Chrome 打开 `addrs.xyz`；
2. 姓名、三行地址和邮箱均已填入；
3. Telegram 管理员收到“资料已填入网页”；
4. 网页没有自动提交；
5. `C:\SafeTGDemo\demo-preview.png` 已更新。

## 6. 回滚

如果新服务器验证失败：

1. 在新服务器停止服务；
2. 修复网络、Chrome 或配置；
3. 确实需要临时恢复时，再启动旧服务器；
4. 始终保证同一接收 Bot 只在一台服务器轮询。
