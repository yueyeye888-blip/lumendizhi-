# 商城钱包、退款复核和客服

钱包版商城按实际售价预扣地址订单费用。正常排队按入队顺序处理。接单程序超过 3 分钟无心跳且原单仍未领取时，平台将原单移出队列并列入人工复核。处理失败或已领取后超过 10 分钟仍无回执也会列入复核。顾客可以提交工单并查看处理结果。退款须由现有平台所有者在客服中心确认程序故障并批准，原订单的实扣金额随后退回原平台余额。

平台页面及站内支付弹窗提供工单和 Telegram 客服 [@YorkeYue](https://t.me/YorkeYue)。工单入口为 `/__host/support`。工单、复核记录和余额账本都保存在商城原有的 `data/commerce.sqlite` 数据库中。迁移已有站点时，使用一致的 SQLite 备份保留这些业务记录。仓库补丁包含代码、测试和校验清单。

## 恢复钱包版商城

1. 在 Lumenziyuan 商城源码基线 `aa9fa7ecabe3fccf6a020576204f860605fd54f0` 上，依次应用本目录的 `unclaimed-address-refund.patch` 和 `owner-review-and-support.patch`。对每个补丁先执行 `git apply --check <补丁路径>`，再执行 `git apply <补丁路径>`。两个补丁都应用后再发布。
2. 按商城原部署流程发布。复用原 `superAdminEmail` 或首个配置的管理员邮箱作为唯一复核账号。确认站内客服入口可用、普通账号只看到自己的工单、所有者可见退款复核。
3. Windows 接单任务使用本仓库的 `app/lib/site-order-queue.mjs`，站点对应文件为 `selfhost/site/site-order-queue.mjs`。完整恢复脚本会把这两个更新覆盖到 2026-11-16 的旧快照。旧快照早于商城钱包，安装钱包版还需执行前两步。
