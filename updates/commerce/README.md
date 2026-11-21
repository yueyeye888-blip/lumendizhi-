# 商城钱包、退款复核和客服

钱包版商城按实际售价预扣地址订单费用。正常排队按入队顺序处理。接单程序超过 3 分钟无心跳且原单仍未领取时，平台将原单移出队列并列入人工复核。处理失败或已领取后超过 10 分钟仍无回执也会列入复核。顾客可以提交工单并查看处理结果。退款须由现有平台所有者在“退款审核”列表确认程序故障并批准，原订单的实扣金额随后退回原平台余额。

Yorke AI 平台右上角提供语言切换，右下角客服弹窗可发送消息、提交工单或联系 Telegram 客服 [@YorkeYue](https://t.me/YorkeYue)。所有者从平台导航的“退款审核”进入 `/__host/refund-review`。已扣费的失败订单自动进入该列表，无需提交工单。所有者可从右上角铃铛查看未读消息并回复。消息、工单和重试队列保存在 SQLite，新消息与新工单会发送通知至现有 Telegram 机器人的已验证私聊。工单历史入口为 `/__host/support`。工单、复核记录和余额账本都保存在商城原有的 `data/commerce.sqlite` 数据库中。迁移已有站点时，使用一致的 SQLite 备份保留这些业务记录。仓库补丁包含代码、测试和校验清单。

## 恢复钱包版商城

1. 在 [Lumenziyuan 商城源码](https://github.com/yueyeye888-blip/Lumenziyuan/tree/aa9fa7ecabe3fccf6a020576204f860605fd54f0) 基线 `aa9fa7ecabe3fccf6a020576204f860605fd54f0` 上，依次应用本目录的 `unclaimed-address-refund.patch`、`owner-review-and-support.patch`、`refund-review-list.patch`、`yorke-ai-support-inbox.patch`、`workspace-refunds-and-esim.patch`、`template-country-filters.patch`、`inline-template-introductions.patch` 和 `yorkeai-template-previews.patch`。对每个补丁先执行 `git apply --check <补丁路径>`，再执行 `git apply <补丁路径>`。八个补丁都应用后再发布，并按下文恢复预览图片。
2. 按商城原部署流程发布。复用原 `superAdminEmail` 或首个配置的管理员邮箱作为唯一复核账号。确认站内客服入口可用、普通账号只看到自己的工单、所有者可见退款复核。
3. Windows 接单任务使用本仓库的 `app/lib/site-order-queue.mjs`，站点对应文件为 `selfhost/site/site-order-queue.mjs`。完整恢复脚本会把这两个更新覆盖到 2026-11-16 的旧快照。旧快照早于商城钱包，安装钱包版还需执行前两步。

Bot 与商城部署在同一台 Windows 服务器时，通知会从接单目录上两级的机器人 `runtime-config.json` 读取现有 `telegramBotToken` 和 `notifyChatId`。分开部署时可在商城私有配置中设置 `supportTelegram` 的 `token`、`chatId` 和 `username`。接收方必须是已与机器人建立会话的 Telegram 私聊，配置默认核对用户名 `YorkeYue`。


## 2026-11-22 工作台更新

第五个补丁包含新版退款审核、右上角语言菜单、全球模版库和地址生成器界面。我的购买支持逐条归档和恢复。购买、续订、认领和模板下载沿用原报价、余额和确认流程，独立支付密码已停用。历史 eSIM 提醒沿用原提醒记录，套餐到期和最晚激活期限分别在进入五天、一天窗口时通知，每个窗口按同一 eSIM 和到期时间去重。

迁移时保留原站数据和已有的 Telegram 配置，确保 `archiveOwnerEmail` 指向原有的模板上传管理员。未配置时，便携版采用 `RESOURCE_ADMIN_EMAILS` 的首个邮箱。常规集成测试在商城源码根目录使用 Node.js 22.22.1 运行 `node --test tests/*.test.mjs selfhost/test/*.test.mjs`。

第六个补丁将地址证明生成器调整为工作台浅色风格，并给全球模版库和生成器加入按国家或地区筛选的标签。地址模板按原目录标注的主要国家或地区归类，原始说明保留在模板资料中。未明确标注的条目可从“未标注”查看。

## 恢复官方模板介绍

第七个补丁将“官方模板介绍”放在预览窗口中，以模板编号读取原站公开资料。商城可以从供应商目录更新介绍。归档 `official-template-reference` 保留了本次发布的 374 条目录记录，支持上游暂时无法访问时显示介绍。迁移已有站点时，复制商城的 `data/supplier-template-introductions.json` 即可。

全新服务器可在网站启动前从本次归档恢复。以下命令在本备份仓库的根目录执行，使用原 2026-11-16 快照的恢复密钥。

```powershell
node tools/backup/vault.mjs decrypt updates/commerce/official-template-reference/manifest.json D:\Private\20261116-828a0280-RECOVERY-KEY.json "$env:TEMP\yorke-template-reference.tar.gz"
tar -xf "$env:TEMP\yorke-template-reference.tar.gz" -C C:\LumenResourceHub
```

也可在商城目录运行 `node sync-template-introductions.mjs`，或传入从官方目录下载的 JSON 文件路径。更新本地文件后，重启商城网站即可加载这份离线资料。

## 恢复 YorkeAI 模板预览图

第八个补丁将模板卡片、生成器选中样张和放大预览指向站内的 WebP 图片。归档 `yorkeai-template-previews` 包含 373 张地址模板预览和 45 张证件类预览。地址模版 11404 的上游样张返回 HTTP 404，页面会显示“暂无样张”。

在备份仓库根目录运行以下命令，将图片恢复至自托管网站。恢复使用与 2026-11-16 备份相同的密钥。

```powershell
node tools/backup/vault.mjs decrypt updates/commerce/yorkeai-template-previews/manifest.json D:\Private\20261116-828a0280-RECOVERY-KEY.json "$env:TEMP\yorke-previews.tar.gz"
tar -xf "$env:TEMP\yorke-previews.tar.gz" -C C:\LumenResourceHub
```

网站启动后，用普通账号进入全球模版库，打开一张样张，再从生成器选中同一模版，两个视图应显示相同的 YorkeAI 图。需要从源码重建前端时，把解包得到的 `dist/client/yorke-previews` 整个目录复制到源码的 `public/` 下再构建。预览图片的逐文件 SHA-256 在商城的 `selfhost/release-manifest.json` 中。

若需从相同的公开样张重新生成图片，在商城源码安装开发依赖，将已核对的源预览以 `addr-编号.img` 或 `windx-编号.img` 保存到单独目录，运行 `node scripts/template-previews/build.mjs <源预览目录> <输出目录>`。每张样张的来源校验和与水印位置保存在 `scripts/template-previews/layouts.json`。供应商更新样张时，先核对新图的水印位置，再更新对应记录。
