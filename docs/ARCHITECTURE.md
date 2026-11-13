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
│ 解析、调度、状态通知 │
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
│ addrs.xyz 可见字段   │
│ 人工核对、人工提交   │
└──────────────────────┘
```

## 组件职责

### `telegram-bot.mjs`

- 使用 Telegram Bot API 长轮询 `getUpdates`，不依赖公网 Webhook。
- 用 `telegram-offset.json` 保存已处理 update offset，重启不重复消费。
- 允许个人/群组 Chat ID 白名单触发。
- 允许指定数字 Bot ID 作为可信网页发送方。
- 可信 Bot 消息的结果发到管理员 Chat ID，不回复发送 Bot，避免 Bot 循环。
- 每条合法消息创建权限受限的临时文件，调用独立填表进程，完成后删除。

### `lib/parser.mjs`

- 只接受带有 `📩 新的个人资料提交` 标题的消息。
- 提取姓名、三行地址、模版和接收邮箱；缺少模版时拒绝处理。
- 限制字段长度，清理控制字符并验证邮箱格式。

### `cdp-fill.mjs`

- 连接本机 Chrome CDP 端口，默认 `9333`。
- 优先选择目标域名标签页，没有时创建新标签页。
- 只操作可见、非禁用、非隐藏字段。
- 先按 `.template-card[data-template]` 精确选择消息中的模版，再用 `#template` 校验选择结果；失败时不填资料。
- 模版校验通过后，支持 `addrs.xyz` 当前 `name_input`、`address_line1/2/3`、`email_input` 字段，也保留通用 label/placeholder 回退。
- 使用原生 value setter 并触发 `input`/`change`，兼容 React/Vue 控件。
- 只填入，不查找或点击提交按钮。
- 将当前视口截图保存为 `demo-preview.png`，方便远程核对。

### Windows 计划任务

- `SafeTGDemoBrowser`：使用独立 Chrome Profile 启动 CDP。
- `SafeTGDemoBot`：运行 Telegram 长轮询和填表调度。
- `SafeTGDemoServer`：提供本机静态说明页和健康检查。

## 故障隔离

- Telegram 轮询异常会指数退避，最高 30 秒后重试。
- 单条消息失败仍会推进 offset，避免坏消息永久阻塞队列。
- 填表子进程 60 秒超时后终止。
- 配置、日志、offset、截图均为运行时文件，不提交到 Git。
