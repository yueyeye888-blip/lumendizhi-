import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("employee order page uses processing language and hides payment details", async () => {
  const source = await readFile(path.join(root, "components", "address-order-status.tsx"), "utf8");
  assert.ok(source.includes('"等待处理"'));
  assert.ok(source.includes('"处理完成"'));
  assert.ok(source.includes("预计处理时间约 5 分钟"));
  assert.ok(!source.includes("查看 addrs.xyz 支付页"));
  assert.ok(!source.includes("支付金额"));
  assert.ok(!source.includes("收款地址"));
});

test("payment confirmation waits one minute before completing email delivery", async () => {
  const source = await readFile(path.join(root, "components", "address-order-status.tsx"), "utf8");
  assert.ok(source.includes('new Set(["payment_confirmed", "delivered", "failed"])'));
  assert.ok(source.includes("const DELIVERY_DELAY_MS = 60_000"));
  assert.ok(source.includes('order.status === "payment_confirmed") return deliveryReady(order, now) ? 5 : 4'));
  assert.ok(source.includes('title: "处理完成"'));
  assert.ok(source.includes("预计 1 分钟内完成交付"));
  assert.ok(source.includes('order.status === "payment_confirmed") return { title: "已发送到邮箱"'));
});

test("employee order API does not expose payment destination", async () => {
  const source = await readFile(path.join(root, "app", "api", "address-orders", "[requestNo]", "route.ts"), "utf8");
  assert.ok(!source.includes("row.externalOrderUrl"));
  assert.ok(!source.includes("row.paymentAmount"));
  assert.ok(!source.includes("row.paymentNetwork"));
  assert.ok(!source.includes("row.paymentAddress"));
});
