# 运维手册

## 目录

- 运行目录：`C:\SafeTGDemo`
- 私密配置：`C:\SafeTGDemo\runtime-config.json`
- 消费进度：`C:\SafeTGDemo\telegram-offset.json`
- Telegram 日志：`C:\SafeTGDemo\telegram-bot.log`
- 状态页日志：`C:\SafeTGDemo\server.log`
- 最近填表截图：`C:\SafeTGDemo\demo-preview.png`
- Chrome Profile：当前 Windows 用户目录下的 `safe_tg_demo_profile`

## 状态检查

```powershell
.\scripts\status-windows.ps1
.\scripts\status-windows.ps1 -RunTests
```

状态脚本只显示 Token 是否存在，不输出 Token 内容。

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

## 日志轮转

运行日志通常很小。长期运行后可以在停止服务时手工归档 `telegram-bot.log`，但不要删除 `telegram-offset.json`，否则旧 update 可能被重新读取。
