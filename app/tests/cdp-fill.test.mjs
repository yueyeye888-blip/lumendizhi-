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
  assert.ok(source.includes("if (el && isUsableField(el)) return el;"));
});
