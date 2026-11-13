import assert from "node:assert/strict";
import test from "node:test";
import { validateSubmittedTemplate } from "../lib/submitted-template.mjs";

const templates = [{ id: 11315, name: "A2A" }, { id: 11316, name: "A2ABolletta" }];

test("requires a selected template", () => {
  assert.throws(() => validateSubmittedTemplate(null, templates), /先选择/);
});

test("returns the canonical selected template", () => {
  assert.deepEqual(validateSubmittedTemplate({ id: 11315, name: "A2A" }, templates), { id: 11315, name: "A2A" });
});

test("rejects a mismatched template id and name", () => {
  assert.throws(() => validateSubmittedTemplate({ id: 11315, name: "A2ABolletta" }, templates), /当前目录/);
});
