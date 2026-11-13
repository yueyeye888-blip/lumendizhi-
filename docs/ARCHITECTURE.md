# 系统架构

## 数据流

```text
┌──────────────────────┐
│ Lumen 个人资料提交页 │
└──────────┬───────────┘
           │ 固定格式文本
           ▼
┌──────────────────────┐
│ 网页发送 Bot         │
│ Telegram sendMessage │
└──────────┬───────────┘
           │ Bot-to-Bot 私聊
           ▼
┌──────────────────────┐
│ 专用接收 Bot         │
│ Telegram getUpdates  │
└──────────┬───────────┘
           │ 白名单 + 可信 Bot 校验
           ▼
┌──────────────────────┐
│ telegram-bot.mjs     │
│ 转发正文、调度、回调 │
└──────────┬───────────┘
           │ 临时消息文件
           ▼
┌──────────────────────┐
│ cdp-fill.mjs         │
│ Chrome DevTools      │
└──────────┬───────────┘
           │ input/change 事件
           ▼
┌──────────────────────┐
│ addrs.xyz 支付订单页 │
│ 读取支付信息         │
└──────────────────────┘
           │
           ▼
┌──────────────────────┐
│ BSC USDT 付款模块  │
│ 默认 dry-run 预检   │
└──────────────────────┘
           │ 状态回调
           ▼
┌──────────────────────┐
│ Lumen 员工订单状态页 │
└──────────────────────┘
```

## 组件职责

### `telegram-bot.mjs`

- 使用 Telegram Bot API 长轮询 `getUpdates`，不依赖公网 Webhook。
- 用 `telegram-offset.json` 保存已处理 update offset，重启不重复消费。
- 允许个人/群组 Chat ID 白名单触发。
- 允许指定数字 Bot ID 作为可信网页发送方。
- 可信 Bot 的完整提交正文与支付订单结果发到管理员 Chat ID，不回复发送 Bot，避免 Bot 循环。
- 使用随机回调令牌和 Sites 服务访问令牌把处理状态写回 Lumen 订单页。
- 每条合法消息创建权限受限的临时文件，调用独立填表进程，完成后删除。

### `lib/parser.mjs`

- 只接受带有 `📩 新的个人资料提交` 标题的消息。
- 提取订单编号、姓名、三行地址、模版和接收邮箱；缺少订单编号或模版时拒绝处理。
- 限制字段长度，清理控制字符并验证邮箱格式。

### `cdp-fill.mjs`

- 连接本机 Chrome CDP 端口，默认 `9333`。
- 优先选择目标域名标签页，没有时创建新标签页。
- 只操作可见、非禁用、非隐藏字段。
- 先按 `.template-card[data-template]` 精确选择消息中的模版，再用 `#template` 校验选择结果；失败时不填资料。
- 模版校验通过后，支持 `addrs.xyz` 当前 `name_input`、`address_line1/2/3`、`email_input` 字段，也保留通用 label/placeholder 回退。
- 使用原生 value setter 并触发 `input`/`change`，兼容 React/Vue 控件。
- 确认当前支付网络为 BSC/BEP20 后，点击“创建支付订单”与“确认并创建订单”。
- 等待独立支付页，读取订单号、精确金额、网络、收款地址和订单 URL 后停止。
- 将支付页当前视口截图保存为 `demo-preview.png`，方便远程核对。

### `lib/payment.mjs`

- 使用当前 Windows 账户的 DPAPI 解密已导入钱包，不把私钥写入命令行、日志或配置。
- 固定校验 BSC Chain ID 56、HTTPS RPC、USDT 合约允许列表、符号和 18 位精度。
- 检查收款地址、金额、USDT/BNB 余额、Gas、单笔/24 小时限额与订单幂等性。
- `dry-run` 会记录预检结果，但不调用签名和广播。`live` 还需要独立的二次启用口令。

### Windows 计划任务

- `SafeTGDemoBrowser`：使用独立 Chrome Profile 启动 CDP。
- `SafeTGDemoBot`：运行 Telegram 长轮询和填表调度。
- `SafeTGDemoServer`：提供本机静态说明页和健康检查。

## 故障隔离

- Telegram 轮询异常会指数退避，最高 30 秒后重试。
- 单条消息失败仍会推进 offset，避免坏消息永久阻塞队列。
- 建单子进程 120 秒超时后终止。
- 配置、日志、offset、截图均为运行时文件，不提交到 Git。
