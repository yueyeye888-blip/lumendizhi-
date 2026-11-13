# 消息协议

## 当前格式

```text
📩 新的个人资料提交
姓名：ALICE EXAMPLE
第 1 行地址：123 Example Street
第 2 行地址：Testville
第 3 行地址：ZZ 00000, Exampleland
接收邮箱：alice@example.test
```

## 规则

- 标签和中文全角冒号必须保留。
- 标题可以不在第一行，但必须单独占一行。
- 第 1 行地址和邮箱为必填。
- 第 2、3 行地址可以为空，但标签应保留以维持协议稳定。
- 字段中的控制字符会被替换为空格。
- 姓名最长 120 字符；每行地址最长 160 字符；邮箱最长 254 字符。

## 兼容性

网站端的格式化函数位于 `site-integration/lib/personal-details-notice.mjs`，Windows 端解析器位于 `app/lib/parser.mjs`。修改协议时必须同时更新两端及测试。
