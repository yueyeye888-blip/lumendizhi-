# Outlook 品牌邮件交付

本功能让 Addrs.xyz 先把成品邮件发送到专用 Outlook 邮箱。Windows 服务按外部订单号找到员工原收件邮箱，提取一个 PDF 和一个图片附件，重新生成“越大爷”品牌邮件并发送。原平台正文、Logo 和发件品牌不会转发。

## Microsoft OAuth 应用

1. 登录 Microsoft Entra 管理中心并进入“应用注册”。
2. 新建应用，账户类型选择支持个人 Microsoft 账户。
3. 在“身份验证”中启用公共客户端流。
4. 添加 Microsoft Graph 委托权限：`User.Read`、`Mail.ReadWrite`、`Mail.Send` 和 `offline_access`。
5. 复制“应用程序（客户端）ID”。Client ID 不是密码，可以写入受限的运行配置。

## 首次授权

在服务器 `C:\SafeTGDemo\runtime-config.json` 中设置：

```json
{
  "outlookRelay": {
    "enabled": false,
    "mailbox": "专用 Outlook 邮箱",
    "clientId": "应用程序客户端 ID",
    "brandName": "越大爷",
    "pollSeconds": 30
  }
}
```

部署后在 Windows 桌面双击“授权 Outlook 邮箱（窗口保持打开）”，按窗口显示的网址和设备代码登录专用邮箱并授权。成功后刷新令牌会以 Windows CurrentUser DPAPI 密文保存到：

```text
C:\SafeTGDemo\secrets\outlook-refresh-token.dpapi
```

完成授权后把 `enabled` 改为 `true` 并重启 `SafeTGDemoBot`。

## 安全与迁移

- 不需要把 Outlook 主密码或应用密码写入程序。
- 刷新令牌不会出现在命令行、日志、源码或 GitHub 中。
- 订单交付队列包含姓名、地址及接收邮箱，保存在 ACL 受限的 `C:\SafeTGDemo\data`。
- DPAPI 密文绑定 Windows 账户。迁移服务器时不要复制该令牌文件，应在新服务器重新授权。
- OAuth 未完成或功能未启用时，程序继续把员工原邮箱填入 Addrs.xyz，不会截留邮件。
