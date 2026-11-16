# 完整恢复与切换

主入口是仓库根目录 README 的 `restore-full.ps1`。旧 `bootstrap.ps1` / `install-windows.ps1` / `update-windows.ps1` 仅管理机器人，不恢复完整网站与数据库；不要用它们替代完整恢复。

## 准备

1. 新服务器使用 Windows x64，建议与当前 Windows Server 环境兼容，保留交互式桌面会话；使用同一个新机 Windows 用户完成恢复并运行机器人。必须在 RDP 桌面内打开管理员 PowerShell 执行恢复；WinRM 网络登录可能无法创建 CurrentUser DPAPI 密文，恢复器会提前拒绝该运行方式。
2. 保存加密快照全部分片和对应恢复密钥。2026-11-16 快照不可覆盖之后发生的付款、邮箱处理和新订单记录；正式迁移要取最新一致快照。
3. 停止接收新单，等待自动填表、付款、回调和邮件处理完成。旧进程仍在执行外部动作时不要强行切换。停止旧站点和机器人相关任务与进程，保留原盘作为回退。
4. 同一个 Bot Token 只能由一套消费者读取 `getUpdates`。新机旧机不能同时消费，也不能同时启用同一邮箱交付轮询。
5. 新机 `C:\SafeTGDemo`、`C:\LumenResourceHub`、`C:\Tools\node22`、`C:\Tools\lumen-chrome` 必须不存在。恢复器拒绝覆盖现存目录；不修改其他网站使用的 80 端口。

## 恢复阶段

`restore-full.ps1` 先验证分片/完整密文并通过 AES-GCM 验证，再校验明文归档和每个文件。程序和依赖来自快照。用于解密的临时 Node 22.22.1 从官方分发站下载并与官方 SHA256 对比；后续使用快照中的版本。

钱包私钥和机器人 Outlook refresh token 从加密包中读取，使用新 Windows 用户 DPAPI 重新加密；钱包地址必须与备份元数据一致。网站邮件凭据与其 SETTINGS_ENCRYPTION_KEY 一起恢复。不会生成新付款钱包或改第三方 API。

恢复器只做必要机器配置：新域名/回调地址、队列路径、新后端 TLS 证书与随机 PFX 密码、服务权限、当前用户任务和新 Chrome Profile。网站与机器人使用同一原回调令牌。Caddy 通过 443 的 TLS-ALPN 挑战申请域名证书。DNS 必须到达该机，443 不可被其他软件占用。

任务先保持禁用。完整模式启动网站8443→Caddy443；独立模式启动API8770→Caddy443。两者都是同一个队列与机器人消费者。Chrome CDP 默认9333，机器人本地状态端口8765。不要将 CDP 或本地管理端口暴露到公网。

## 启用阶段

确认 DNS 指向新机、旧服务已停止，执行：

```powershell
.\scripts\start-restored.ps1 -PreviousServerStopped
```

它先启动网站/API、Caddy、桌面 Chrome 和本地状态页，检查公网健康和 CDP 成功后才启动机器人。默认付款 dry-run、邮箱轮询关闭。`dry-run` 仍可能创建第三方订单，仅禁止真实支付，不是完全没有外部副作用的演练。

检查完成后恢复备份原模式：

```powershell
.\scripts\start-restored.ps1 -PreviousServerStopped -EnableLivePayments -ResumeMailRelay
```

生产快照中的待处理 `pending.json` 会改名为 `held-after-restore.json`。`processing.json`、完成、失败、付款去重和邮箱处理记录全部保留。不要直接把旧任务改回 pending；先查第三方订单、链上交易和邮件状态，确认确实需要重办后创建新单。

独立 API 使用新库保存新订单；原商城历史订单仍完整保留在加密快照和恢复目录中，未自动转换成独立 API 订单。独立模式迁移须清空在途旧商城订单，因为旧商城编号不在新 API 库中。

## 恢复后检查

- `https://域名/__host/health` 返回 `ok: true`；网页登录正常，页面资源和已保存订单状态能读取。
- `restore-state.json` 显示钱包匹配、DPAPI 迁移成功；实际 LOCAL SERVICE 队列写入测试已通过。
- 任务没有短时退出；网页 stderr 只记日志，不会因为普通 stderr 输出退出 PowerShell。
- Chrome 在当前桌面会话运行，可访问目标网站；如需要验证码、登录或微软重新授权，由账户持有人完成。
- 付款模式/限额、钱包公开地址、RPC、邮箱、通知对象符合预期。使用所需真实订单验证，不要盲目重跑历史订单。

## 回退

停止新机全部 Lumen / SafeTGDemo 任务和相关进程后才能恢复旧消费者。如果新机已经接单或支付，必须先核对并迁回新增数据库、付款与邮件记录；直接回到旧快照可能丢失防重状态。不要在两台机器交替启动消费者来“试试看”。

## 未自动迁移的边界

整个服务器操作系统、其他无关网站、DNS 服务商、Telegram 账号本身、外部网站、RPC 和微软服务不属于本应用文件快照。域名控制权、网络可达性和外部授权有效性不能靠复制磁盘文件保证。Chrome 用户资料已归档，但不自动用于跨机登录，避免使用无法解密的旧 Windows Cookie。
