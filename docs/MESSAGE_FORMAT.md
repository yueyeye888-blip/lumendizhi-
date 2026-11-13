# 消息协议

## 当前格式

```text
📩 新的个人资料提交

订单编号：ADDR-20261114-AB12CD34

提交人账号：staff@example.com

姓名：ALICE EXAMPLE

第 1 行地址：123 Example Street
第 2 行地址：Testville
第 3 行地址：ZZ 00000, Exampleland

模版：A2A

接收邮箱：alice@example.test
```

## 规则

- 标签和中文全角冒号必须保留。
- 标题可以不在第一行，但必须单独占一行。
- 订单编号、姓名、第 1 行地址、模版和邮箱为必填。
- 订单编号固定为 `ADDR-YYYYMMDD-XXXXXXXX`，用于将 Windows 处理结果回写到正确的员工订单。
- 第 2、3 行地址可以为空，但标签应保留以维持协议稳定。
- 接收端同时兼容“模版”和“模板”标签；网站发送端固定使用“模版”。
- 字段中的控制字符会被替换为空格。
- 姓名和模版最长 120 字符；每行地址最长 160 字符；邮箱最长 254 字符。

## 兼容性

网站端会按当前模版目录验证 ID 与名称后再发送，格式化函数位于 `site-integration/lib/personal-details-notice.mjs`；Windows 端解析器位于 `app/lib/parser.mjs`。修改协议时必须同时更新两端及测试。
