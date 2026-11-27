> 历史模块说明：当前整套恢复以 [README](../README.md) 和 [迁移手册](MIGRATION.md) 为准。网页下单现在直接写本机队列，不依赖机器人群组；真实配置和数据保存在加密快照中。下文旧版安装命令仅适用于对应单模块。

# 运维手册

## 目录

- 运行目录：`C:\SafeTGDemo`
- 私密配置：`C:\SafeTGDemo\runtime-config.json`
- 消费进度：`C:\SafeTGDemo\telegram-offset.json`
- Telegram 日志：`C:\SafeTGDemo\telegram-bot.log`
- 状态页日志：`C:\SafeTGDemo\server.log`
- 最近填表截图：`C:\SafeTGDemo\demo-preview.png`
- Chrome Profile：当前 Windows 用户目录下的 `safe_tg_demo_profile`
- 付款钱包 DPAPI 密文：`C:\SafeTGDemo\secrets\payer-private-key.dpapi`
- 付款钱包公开元数据：`C:\SafeTGDemo\secrets\payer-wallet.json`
- 付款预演/幂等记录：`C:\SafeTGDemo\data\payment-ledger.json`

`runtime-config.json` 还保存订单回调地址、回调令牌和 Sites 服务访问令牌。状态脚本只显示它们是否存在，不输出内容。

## 状态检查

```powershell
.\scripts\status-windows.ps1
.\scripts\status-windows.ps1 -RunTests
```

状态脚本只显示 Token 是否存在，不输出 Token 内容。

钱包状态只显示是否已导入、公开地址、Chain ID 和加密方式，不会解密或输出私钥。

支付状态只显示模式、限额、是否配置 live 二次口令以及记录数量，不输出私密配置。

```powershell
# 独立检查钱包、BSC RPC、USDT/BNB 余额与 Gas；必须处于 dry-run
C:\Tools\node22\node.exe C:\SafeTGDemo\wallet-preflight.mjs

# 使用虚构资料完整建单并预检；会创建未付款测试订单
C:\Tools\node22\node.exe C:\SafeTGDemo\dry-run-flow.mjs C:\SafeTGDemo\sample-message.txt
```

## 启停

```powershell
.\scripts\start-windows.ps1
.\scripts\stop-windows.ps1
```

## 更新代码

```powershell
cd C:\lumendizhi
git pull --ff-only
.\scripts\update-windows.ps1
```

更新脚本会读取已安装的私密配置，重新运行测试并重启计划任务。

## 手工查看 CDP

```powershell
Invoke-RestMethod http://127.0.0.1:9333/json/version
Invoke-RestMethod http://127.0.0.1:9333/json/list
```

CDP 只监听本机端口，不需要在防火墙中向公网开放。

## addrs.xyz 人机验证

每个新订单都会重新加载 addrs.xyz。程序选择模板并填表后，点击“创建支付订单”，此时网站开始验证和资料检查。等待超过 5 秒会报告进度，确认窗口打开且确认按钮可用时立即继续。等待上限为 60 秒。

网站返回错误时，订单记录会显示网站提供的原因。确认窗口超时时，本单在确认创建上游订单前结束。

## 日志轮转

运行日志通常很小。长期运行后可以在停止服务时手工归档 `telegram-bot.log`，但不要删除 `telegram-offset.json`，否则旧 update 可能被重新读取。
