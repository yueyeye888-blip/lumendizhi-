# 单独复用地址订单功能

在空白服务器使用 `restore-full.ps1 -Mode Automation`。系统保留原配置、队列处理、钱包付款防重及 Outlook 交付模块，仅用新的轻量 HTTP API 替代完整资源商城界面。原 Telegram 私聊操作与管理员通知仍沿用原配置，不需要创建群组。

新的 API 接入密钥生成在 `C:\SafeTGDemo\standalone-config.private.json` 的 `accessToken`，只在后端使用。回调凭据使用原 `orderCallbackToken`；两者不能混用。不要把 API 密钥写入公共前端 JavaScript。

## 接口

| 请求 | 用途 |
| --- | --- |
| `GET /__host/health` | 无鉴权健康检查，仅返回 ok |
| `POST /api/personal-details/submit` | 创建订单，需要 API Bearer Token 和 Idempotency-Key |
| `GET /api/address-orders/{requestNo}` | 查询状态，需要 API Bearer Token |
| `POST /api/address-orders/callback` | 仅自动处理器使用，需要原回调 Bearer Token |

提交体：

```json
{
  "profile": {
    "fullName": "TEST USER",
    "addressLines": ["1 Test Street", "", ""],
    "recipientEmail": "test@example.invalid"
  },
  "template": {"name": "Clphk"}
}
```

使用真实有效的模版名、三行英文地址与实际接收邮箱；以上只是结构示例，不应发送给已启用的生产消费者。每次真实用户操作生成唯一 `Idempotency-Key`，网络重试沿用该值。成功返回 202 和 `requestNo`，同一键/同一内容重试返回原编号；同一键不同内容返回409。未传密钥返回401。

接口接受后立即把完整资料持久化到本机共享队列，不等待 Telegram 转送。消费者依次执行填表、建单、现有付款流程、回调和邮件转发。需要完整网页状态页时使用 Full 模式；Automation 提供的是 API，宿主应用可自行显示查询结果。

旧商城订单库保留在恢复目录，但独立 API 使用 `standalone-data/orders.sqlite` 存储新订单，不自动搬迁旧商城订单。在途旧订单应先完成再切换。`held-after-restore.json` 不会自动重放。

独立 API 是为复用本次新增的模块，已做隔离鉴权、防重和回调测试。它不在原生产快照内，而由恢复器从仓库复制安装。当前生产服务器仍保持原网页入口，本次备份没有将它切换成独立 API。
