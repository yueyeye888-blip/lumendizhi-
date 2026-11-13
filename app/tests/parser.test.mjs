import test from "node:test";
import assert from "node:assert/strict";
import { parsePersonalDetailsNotice } from "../lib/parser.mjs";

test("parses the expected notice format", () => {
  const profile = parsePersonalDetailsNotice(`📩 新的个人资料提交
订单编号：ADDR-20261114-AB12CD34
姓名：ALICE EXAMPLE
第 1 行地址：123 Example Street
第 2 行地址：Testville
第 3 行地址：ZZ 00000, Exampleland
模版：A2A
接收邮箱：alice@example.test`);
  assert.equal(profile.requestNo, "ADDR-20261114-AB12CD34");
  assert.equal(profile.fullName, "ALICE EXAMPLE");
  assert.deepEqual(profile.addressLines, ["123 Example Street", "Testville", "ZZ 00000, Exampleland"]);
  assert.equal(profile.template, "A2A");
  assert.equal(profile.recipientEmail, "alice@example.test");
});

test("rejects unrelated messages", () => {
  assert.throws(() => parsePersonalDetailsNotice("hello"), /不是/);
});

test("rejects malformed email", () => {
  assert.throws(() => parsePersonalDetailsNotice(`📩 新的个人资料提交
订单编号：ADDR-20261114-AB12CD34
姓名：ALICE
第 1 行地址：123 Example Street
模版：A2A
接收邮箱：bad-email`), /邮箱/);
});

test("rejects notices without a template", () => {
  assert.throws(() => parsePersonalDetailsNotice(`📩 新的个人资料提交
订单编号：ADDR-20261114-AB12CD34
姓名：ALICE
第 1 行地址：123 Example Street
接收邮箱：alice@example.test`), /模版/);
});

test("rejects notices without a valid order number", () => {
  assert.throws(() => parsePersonalDetailsNotice(`📩 新的个人资料提交
姓名：ALICE
第 1 行地址：123 Example Street
模版：A2A
接收邮箱：alice@example.test`), /订单编号/);
});
