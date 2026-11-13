import assert from "node:assert/strict";
import test from "node:test";
import { TEST_ADDRESS_COUNTRIES, generateTestAddress } from "../lib/test-address.mjs";

test("generates three non-empty lines for every supported country", () => {
  for (const country of Object.keys(TEST_ADDRESS_COUNTRIES)) {
    const lines = generateTestAddress(country);
    assert.equal(lines.length, 3);
    assert.ok(lines.every((line) => line.length > 0 && line.length <= 160));
  }
});

test("covers all 62 catalog countries", () => {
  assert.equal(Object.keys(TEST_ADDRESS_COUNTRIES).length, 62);
});

test("rejects unsupported countries", () => {
  assert.throws(() => generateTestAddress("XX"));
});
