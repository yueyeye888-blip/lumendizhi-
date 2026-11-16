# Lumen 地址订单系统：完整备份与恢复

本仓库保存 **2026-11-16 当前 Windows 生产系统的完整加密快照**，以及对应运行代码和恢复工具。后续人工验证码等待修复保存在 `config/restore-overlays.json` 声明的代码补丁中，恢复此快照时会自动校验并应用。恢复入口是 `scripts/restore-full.ps1`；旧版 `bootstrap.ps1` 仅安装机器人程序，不用于恢复整套生产环境。

## 已备份的内容

快照 [20261116-828a0280](backups/20261116-828a0280/manifest.json) 包含 8,079 个文件，原始大小 1,247,809,051 字节，加密包 620,001,355 字节，拆为 30 个文件。覆盖：

- `C:\SafeTGDemo` 全目录：Telegram 私聊/通知、队列消费、Chrome 自动填表、支付、付款防重记录、Outlook 邮件转发、配置、日志、全部依赖。
- `C:\LumenResourceHub` 全目录：当前线上完整网页构建产物、HTTPS 网关、登录认证、数据库与迁移、邮件和附件、所有 API 配置、Caddy、证书及历史备份。
- Node.js 22.22.1、已安装的 Windows Chrome 程序、Chrome 用户资料归档。
- 五个计划任务的 XML、任务运行状态、关键目录权限；额外导出可迁移的钱包及 Outlook 凭据，解决 Windows DPAPI 不能直接跨机器复制的问题。

完整数据库、真实配置、客户资料、私钥、令牌都在 **AES-256-GCM 加密快照内**。恢复密钥单独保存，仓库不包含密钥。没有密钥无法恢复。每个分片、完整密文、明文压缩包和快照内每个文件都有 SHA-256 校验。

## 恢复完整网站

在空白 Windows x64 服务器上，用长期运行程序的桌面账户登录，以管理员身份打开 PowerShell。至少预留 6 GB 磁盘空间，安装 Git，准备恢复密钥文件，把域名 DNS 指向新服务器并允许入站 TCP 443。

```powershell
git clone https://github.com/yueyeye888-blip/lumendizhi-.git C:\lumendizhi
cd C:\lumendizhi
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\restore-full.ps1 -KeyFile 'D:\Private\20261116-828a0280-RECOVERY-KEY.json' -Origin 'https://your-domain.example' -Mode Full
```

恢复器验证并解密快照、复制完整离线依赖、重包 DPAPI 凭据、核对付款钱包地址、生成新服务器后端证书、配置域名代理、注册任务、修复队列权限并用 LOCAL SERVICE 实测写入。已有目标目录会拒绝覆盖。

此时任务保持禁用、付款处于 dry-run、邮箱轮询暂停，旧的待处理队列被保留并暂停。停止旧服务器消费者、确认域名和桌面会话后启用：

```powershell
.\scripts\start-restored.ps1 -PreviousServerStopped
# 确认需要恢复备份中的真实付款模式和邮件转发后：
.\scripts\start-restored.ps1 -PreviousServerStopped -EnableLivePayments -ResumeMailRelay
```

第二条命令恢复备份原有付款配置，不更换钱包、API 或令牌。如果原配置不是 live，该开关不会强行设为 live。首次启用前阅读 [迁移手册](docs/MIGRATION.md)。

## 只部署地址订单功能

同一恢复命令改为 `-Mode Automation`：只启动独立地址订单 API、处理机器人、自动填表、付款及邮箱交付，不启动资源商城网页服务。依然保存整套快照以免丢失配置。独立 API 是本次新增的可复用入口，不是原商城完整界面，接口见 [独立部署说明](docs/STANDALONE.md)。

现在的网页提交直接写入本机队列，由同一个机器人进程串行处理；**不要求创建 Telegram 群组，也不依赖机器人之间互相接收消息**。管理员通知仍使用原有私聊配置。

## 仓库结构

| 路径 | 内容 |
| --- | --- |
| `backups/20261116-828a0280/` | 完整加密快照和分片校验清单 |
| `app/` | 从当前生产机器提取的自动填表/付款/邮件运行代码 |
| `selfhost/site/` | 当前完整网站部署产物、网关及运行模块 |
| `standalone/` | 新增的独立订单 API 及测试 |
| `scripts/restore-full.ps1` | 空白 Windows 完整恢复/独立恢复入口 |
| `scripts/start-restored.ps1` | 检查服务后启用消费者，可恢复原付款/邮件模式 |
| `scripts/backup-full.ps1` | 在原标准路径服务器制作新的完整快照 |
| `tools/backup/` | 加密、分片、解密、逐文件校验、凭据迁移工具 |
| `docs/BACKUP_VERIFICATION.md` | 快照范围、验证结果与限制 |
| `site-integration/` | 历史网页集成源码参考，不是当前完整网站源码 |

生产网站保留的是**实际线上完整构建产物与运行模块**；没有将历史 TypeScript 示例冒充成当前构建的完整原始工程。恢复原有功能不需要重新编译，也不需要在线重新安装 npm 依赖。

## 后续备份

数据库、支付防重记录和 OAuth 令牌会继续变化。本次快照固定在备份时刻；以后迁移前应停止接收新单、等待在途订单结束，再制作最新快照，避免使用过期交易状态。

```powershell
.\scripts\backup-full.ps1 -Destination 'D:\EncryptedBackups' -KeyDirectory 'D:\OfflineKeys'
```

这个导出器针对本次标准生产路径和域名；换过路径/用户/域名后，应先调整 `tools/backup/export-windows.mjs` 中对应值。恢复密钥应另存一份到安全的离线位置，不要与公开仓库一起上传。

## 验证与外部条件

恢复测试不会替你创建真实订单或执行付款。现有机器人回归测试、网关/队列测试、独立 API 鉴权与防重测试、加密损坏/错误密钥测试见 [验证记录](docs/BACKUP_VERIFICATION.md)。

新机需要有效 DNS、可访问 Telegram/目标网站/RPC/Microsoft、交互式 Windows 登录会话。跨机器 Chrome 登录状态可能失效，微软授权也可能被撤销；这两项需要时在新机重新登录/授权。没有在另一台空白 Windows 上完成真实付款全链路演练，不能把脚本检查等同于此类生产验证。

## 2026-11-16 验证码等待修复

Turnstile 需要人工操作时，订单页显示“等待人工验证”和服务器操作提示，每次最多等待5分钟，完成后继续当前订单。超时发生在创建支付订单之前，不自动重试旧单。不支持绕过人机验证，也不保证第三方网站每次免人工。现有浏览器页面需强制刷新一次以加载新的提示组件。详细记录见 [修复说明](docs/TURNSTILE_WAIT.md)。
