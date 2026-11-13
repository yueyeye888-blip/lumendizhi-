# Lumen 地址资料自动填入系统

这是当前地址资料生成/传递/自动建单链路的可迁移备份。它接收 Telegram 中固定格式的个人资料与所选模版，解析后通过 Chrome DevTools Protocol 选择 `https://addrs.xyz` 的对应模版、填写资料、创建并确认订单，再把精确金额、BSC/BEP20 网络和收款地址写回员工订单页。

程序已接入 BSC USDT 自动支付模块，但生产默认固定为 **`dry-run`**：会完成钱包解密、链与合约校验、余额、Gas、限额和防重检查，但不签名、不广播。

## 完整链路

```text
Lumen 网页提交
  → 网页发送 Bot
  → 专用接收 Bot
  → Windows Telegram 长轮询服务
  → 消息格式与来源校验
  → Chrome CDP (9333)
  → addrs.xyz 同步选择模版并自动填入
  → 创建并确认支付订单
  → BSC USDT 付款预检（默认 dry-run）
  → 状态回调到员工订单页 + Telegram 通知管理员
```

## 新 Windows 服务器一键安装

前提：

- Windows Server 2019/2022 或 Windows 10/11 x64。
- 使用准备长期运行本程序的 Windows 账户登录桌面。
- 以管理员身份打开 PowerShell。
- 新服务器可访问 GitHub、Telegram API、Node.js 官网、Google 下载站和 `addrs.xyz`。
- 服务器需要开启交互式桌面会话；Chrome 自动填表依赖可见的登录会话。

执行：

```powershell
git clone https://github.com/yueyeye888-blip/lumendizhi-.git C:\lumendizhi
Set-ExecutionPolicy -Scope Process Bypass -Force
cd C:\lumendizhi
.\bootstrap.ps1
```

安装器会隐藏输入接收 Bot Token，并依次询问：

1. 允许直接触发填表的 Chat ID；
2. 网页发送 Bot 的数字 ID；
3. 接收处理结果的管理员 Chat ID；
4. 目标网页和 CDP 端口。
5. Lumen 订单回调地址与随机回调令牌；
6. Sites 服务访问令牌（受限站点需要）。

随后它会：

- 自动安装便携版 Node.js 22；
- 检查并按需静默安装 Google Chrome；
- 将运行文件复制到 `C:\SafeTGDemo`；
- 创建只允许当前 Windows 账户和 SYSTEM 读取的运行配置；
- 注册并启动 `SafeTGDemoBrowser`、`SafeTGDemoBot`、`SafeTGDemoServer` 三个计划任务；
- 执行全部回归测试；
- 验证 Telegram Bot 和 Chrome CDP 是否在线。

如果 Git 未安装，可以下载仓库 ZIP、解压后在目录中执行同一个 `bootstrap.ps1`。

## 使用本地私密配置实现无人值守安装

复制模板，但不要把生成的私密文件提交到 Git：

```powershell
Copy-Item .\config\runtime-config.example.json .\config\runtime-config.json
notepad .\config\runtime-config.json
.\bootstrap.ps1 -ConfigFile .\config\runtime-config.json
```

`config/runtime-config.json` 已被 `.gitignore` 排除。

## 迁移服务器时的顺序

同一个 Telegram Bot Token 不应同时运行两个 `getUpdates` 消费者。迁移时建议：

1. 在旧服务器执行 `scripts\stop-windows.ps1`；
2. 在新服务器完成一键安装；
3. 执行 `scripts\status-windows.ps1 -RunTests`；
4. 从 Lumen 网页提交一条虚构测试资料；
5. 确认 Telegram 收到完整资料与 `dry-run` 支付预检结果，并明确显示“未签名、未广播”。

详细步骤见 [迁移手册](docs/MIGRATION.md)。

## 日常管理

```powershell
# 查看任务、进程、CDP、日志及脱敏配置状态
.\scripts\status-windows.ps1

# 连同 23 项回归测试一起检查
.\scripts\status-windows.ps1 -RunTests

# 启动/停止整套服务
.\scripts\start-windows.ps1
.\scripts\stop-windows.ps1

# 更新仓库代码后，保留现有私密配置并重新安装
.\scripts\update-windows.ps1
```

## 仓库内容

- `app/`：Telegram 接收、解析、CDP 自动填表和测试的完整运行代码。
- `scripts/`：Windows 安装、更新、启动、停止和状态检查脚本。
- `tools/deploy_remote.py`：从 macOS/Linux 通过 WinRM 远程部署到 Windows。
- `site-integration/`：Lumen 网页发送端相关接口与消息格式快照。
- `docs/`：架构、Bot 配置、迁移、运维、安全和故障排查文档。
- `ci/test.workflow.yml.example`：可选 GitHub Actions 测试模板；需要时复制到 `.github/workflows/test.yml`。
- `config/`：不含真实密钥的配置模板。

## 安全说明

仓库不包含 Bot Token、订单回调令牌、Sites 服务访问令牌、Windows 密码、个人 Chat ID、浏览器用户数据或生产数据库。Chrome Profile 也不会备份；如果目标网站需要登录，请在新服务器的自动化 Chrome 窗口中人工登录一次。钱包私钥或助记词也绝不能写入仓库、配置样例或聊天记录。

## 本地测试

需要 Node.js 22：

```bash
cd app
npm test
```

当前 23 项测试还覆盖 BSC USDT 合约允许列表、支付金额限制、`dry-run` 禁止签名/广播、`live` 二次启用门禁和 DPAPI 解密脚本。

## 本地导入付款钱包

安装完成后，在 Windows 服务器桌面双击 `导入付款钱包（窗口保持打开）` 快捷方式。启动器会明确提示何时粘贴，并在成功或失败后保留结果，不会落回普通 `PS>` 命令提示符。工具只接受隐藏输入，使用 ethers 校验公开地址，再通过当前 Windows 账户的 DPAPI 加密私钥。密文和公开元数据保存在 `C:\SafeTGDemo\secrets`，ACL 只允许当前账户和 SYSTEM。

钱包密文与当前 Windows 账户绑定。迁移服务器时不要复制密文，应在新服务器重新运行导入工具。公开充值地址可以记录，私钥和助记词不能进入聊天、GitHub、日志或配置样例。

支付默认限制为单笔 5 USDT、24 小时 20 USDT，网络固定 BSC Chain ID 56，代币固定允许列表中的 Binance-Peg USDT。生产付款必须同时将 `paymentMode` 设为 `live` 并配置二次启用口令；默认安装永远是 `dry-run`。
