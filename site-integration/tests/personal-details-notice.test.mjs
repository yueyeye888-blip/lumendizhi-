import assert from "node:assert/strict";
import test from "node:test";
import { formatPersonalDetailsNotice } from "../lib/personal-details-notice.mjs";

test("formats the submission as name, three address lines and email", () => {
  const text = formatPersonalDetailsNotice(
    { fullName: "Jane Doe", addressLines: ["1 Main St", "Austin", ""], recipientEmail: "jane@example.com" },
    "staff@example.com",
  );
  assert.equal(text, [
    "📩 新的个人资料提交",
    "提交人账号：staff@example.com",
    "",
    "姓名：Jane Doe",
    "",
    "第 1 行地址：1 Main St",
    "第 2 行地址：Austin",
    "第 3 行地址：",
    "",
    "接收邮箱：jane@example.com",
  ].join("\n"));
});
