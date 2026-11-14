import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildBrandedMessage,
  loadOutlookRelaySettings,
  matchDeliveryJob,
} from "../lib/outlook-relay.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("builds a clean branded message without the source platform brand", () => {
  const message = buildBrandedMessage({
    externalOrderNo: "2026111329FF31D9FC9A",
    addressLines: ["619 Oak Ave", "Austin", "TX 61397 United States"],
  }, "越大爷");
  assert.match(message.subject, /越大爷/);
  assert.match(message.html, /619 Oak Ave, Austin, TX 61397 United States/);
  assert.match(message.html, /图片和 PDF · 2 个文件/);
  assert.doesNotMatch(message.html, /Addrs\.xyz/i);
  assert.doesNotMatch(message.text, /Addrs\.xyz/i);
});

test("matches an inbox message to the original external order", () => {
  const jobs = [
    { state: "waiting", externalOrderNo: "2026111329FF31D9FC9A" },
    { state: "waiting", externalOrderNo: "OTHER" },
  ];
  const message = {
    subject: "文件生成完成",
    body: { content: "<p>订单号 2026111329FF31D9FC9A</p>" },
  };
  assert.equal(matchDeliveryJob(jobs, message), jobs[0]);
});

test("does not activate Outlook interception before authorization", async () => {
  const settings = await loadOutlookRelaySettings({
    enabled: false,
    mailbox: "collector@outlook.com",
    clientId: "11111111-1111-4111-8111-111111111111",
    brandName: "越大爷",
  }, root);
  assert.equal(settings.active, false);
});

test("only overrides the addrs.xyz recipient when the relay is active", async () => {
  const bot = await readFile(path.join(root, "telegram-bot.mjs"), "utf8");
  const fill = await readFile(path.join(root, "cdp-fill.mjs"), "utf8");
  assert.match(bot, /config\.outlookRelay\.active/);
  assert.match(bot, /ADDRS_DELIVERY_EMAIL/);
  assert.match(fill, /process\.env\.ADDRS_DELIVERY_EMAIL \|\| profile\.recipientEmail/);
});

test("stores Outlook tokens with CurrentUser DPAPI instead of source configuration", async () => {
  const writer = await readFile(path.join(root, "scripts", "write-outlook-token.ps1"), "utf8");
  const reader = await readFile(path.join(root, "scripts", "read-outlook-token.ps1"), "utf8");
  assert.match(writer, /ConvertFrom-SecureString/);
  assert.match(writer, /outlook-refresh-token\.dpapi/);
  assert.match(reader, /ConvertTo-SecureString/);
});

test("enables the relay only after Outlook authorization succeeds", async () => {
  const authorizer = await readFile(path.join(root, "authorize-outlook.mjs"), "utf8");
  const launcher = await readFile(path.join(root, "scripts", "open-outlook-authorizer.ps1"), "utf8");
  const authorizedAt = authorizer.indexOf("const profile = await authorizeOutlookDevice");
  const enabledAt = authorizer.indexOf("enabled: true", authorizedAt);
  assert.ok(authorizedAt >= 0 && enabledAt > authorizedAt);
  assert.match(authorizer, /writeFile\(configPath/);
  assert.match(launcher, /\$exitCode = \$LASTEXITCODE/);
  assert.match(launcher, /Restart-ScheduledTask -TaskName "SafeTGDemoBot"/);
  assert.doesNotMatch(launcher, /ConvertFrom-Json/);
});
