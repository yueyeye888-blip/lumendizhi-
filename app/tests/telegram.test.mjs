import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isMessageAuthorized,
  messageFromUpdate,
  parseAllowedChatIds,
  statusChatIdFor,
} from "../lib/telegram.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));

test("normalizes the Telegram chat allowlist", () => {
  assert.deepEqual([...parseAllowedChatIds("123, -456,invalid")], ["123", "-456"]);
});

test("extracts a text message without retaining unrelated fields", () => {
  assert.deepEqual(
    messageFromUpdate({
      update_id: 8,
      message: {
        message_id: 9,
        chat: { id: -456 },
        from: { id: 9295969331, is_bot: true },
        text: "hello",
      },
    }),
    {
      chatId: "-456",
      messageId: 9,
      senderId: "9295969331",
      senderIsBot: true,
      text: "hello",
    }
  );
});

test("ignores Telegram updates without text", () => {
  assert.equal(messageFromUpdate({ message: { chat: { id: 123 }, photo: [] } }), null);
});

test("authorizes a trusted bot sender and routes status to the owner", () => {
  const message = {
    chatId: "9295969331",
    senderId: "9295969331",
    senderIsBot: true,
  };
  const config = {
    allowedChatIds: new Set(["8018345095"]),
    trustedSenderBotIds: new Set(["9295969331"]),
    notifyChatId: "8018345095",
  };

  assert.equal(isMessageAuthorized(message, config), true);
  assert.equal(statusChatIdFor(message, config), "8018345095");
});

test("rejects an untrusted bot sender", () => {
  const message = {
    chatId: "100",
    senderId: "200",
    senderIsBot: true,
  };
  const config = {
    allowedChatIds: new Set(["8018345095"]),
    trustedSenderBotIds: new Set(["9295969331"]),
    notifyChatId: "8018345095",
  };

  assert.equal(isMessageAuthorized(message, config), false);
});

test("forwards trusted submission text and reports the payment preflight", async () => {
  const source = await readFile(path.join(testDir, "..", "telegram-bot.mjs"), "utf8");
  assert.ok(source.includes("await reply(config, statusChatId, message.text)"));
  assert.ok(source.includes('"payment_pending"'));
  assert.ok(source.includes("paymentAddress"));
  assert.ok(source.includes('"OAI-Sites-Authorization"'));
  assert.ok(source.includes("自动支付预演通过"));
  assert.ok(source.includes("dry-run 模式已确认"));
});
