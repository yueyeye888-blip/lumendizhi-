import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));

test("escapes newline literals embedded in the browser evaluation script", async () => {
  const source = await readFile(path.join(testDir, "..", "cdp-fill.mjs"), "utf8");

  assert.ok(source.includes("? '\\\\n' :"));
  assert.ok(source.includes("join('\\\\n')"));
});

test("targets the current visible addrs.xyz address fields", async () => {
  const source = await readFile(path.join(testDir, "..", "cdp-fill.mjs"), "utf8");

  assert.ok(source.includes("'#address_line1'"));
  assert.ok(source.includes("'#address_line2'"));
  assert.ok(source.includes("'#address_line3'"));
  assert.ok(source.includes(".filter(isUsableField)"));
  assert.ok(source.includes("if (element && isUsableField(element)) return element;"));
});

test("selects and verifies the requested addrs.xyz template before filling fields", async () => {
  const source = await readFile(path.join(testDir, "..", "cdp-fill.mjs"), "utf8");

  assert.ok(source.includes("document.querySelectorAll('.template-card')"));
  assert.ok(source.includes("element.dataset.template === profile.template"));
  assert.ok(source.includes("templateCard.click()"));
  assert.ok(source.includes("document.querySelector('#template')?.value"));
  assert.ok(source.includes("templateSelected: true"));
  assert.ok(source.indexOf("templateCard.click()") < source.indexOf("const fieldDefs"));
});

test("creates and confirms a BSC payment order after filling", async () => {
  const source = await readFile(path.join(testDir, "..", "cdp-fill.mjs"), "utf8");

  assert.ok(source.includes("#payment_method_trigger"));
  assert.ok(source.includes("#create_order_button"));
  assert.ok(source.includes("#order_confirm_submit"));
  assert.ok(source.includes("location.pathname.startsWith('/order/')"));
  assert.ok(source.includes("paymentAmount"));
  assert.ok(source.includes("paymentNetwork"));
  assert.ok(source.includes("paymentAddress"));
  assert.ok(source.indexOf("#create_order_button") < source.indexOf("#order_confirm_submit"));
});

test("starts every order from a newly loaded addrs.xyz form", async () => {
  const source = await readFile(path.join(testDir, "..", "cdp-fill.mjs"), "utf8");
  assert.ok(source.includes("Always start a new document"));
  assert.ok(source.includes('Page.navigate'));
});

test("waits for the storefront confirmation only after filling and starting preflight", async () => {
  const source = await readFile(path.join(testDir, "..", "cdp-fill.mjs"), "utf8");
  const fill = source.indexOf("const fillResult =");
  const submit = source.indexOf("const createResult =");
  const wait = source.indexOf("await waitForOrderConfirmation(");
  const confirm = source.indexOf("const confirmResult =");
  assert.ok(fill >= 0 && fill < submit && submit < wait && wait < confirm);
  assert.ok(source.includes("dialog?.open && confirm && !confirm.disabled"));
  assert.ok(!source.includes("cf-turnstile-response"));
});
