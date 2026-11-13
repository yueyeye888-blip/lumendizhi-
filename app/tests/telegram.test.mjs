import test from "node:test";
import assert from "node:assert/strict";

import {
  isMessageAuthorized,
  messageFromUpdate,
  parseAllowedChatIds,
  statusChatIdFor,
} from "../lib/telegram.mjs";

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
        from: { id: 9000000001, is_bot: true },
        text: "hello",
      },
    }),
    {
      chatId: "-456",
      messageId: 9,
      senderId: "9000000001",
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
    chatId: "9000000001",
    senderId: "9000000001",
    senderIsBot: true,
  };
  const config = {
    allowedChatIds: new Set(["8000000001"]),
    trustedSenderBotIds: new Set(["9000000001"]),
    notifyChatId: "8000000001",
  };

  assert.equal(isMessageAuthorized(message, config), true);
  assert.equal(statusChatIdFor(message, config), "8000000001");
});

test("rejects an untrusted bot sender", () => {
  const message = {
    chatId: "100",
    senderId: "200",
    senderIsBot: true,
  };
  const config = {
    allowedChatIds: new Set(["8000000001"]),
    trustedSenderBotIds: new Set(["9000000001"]),
    notifyChatId: "8000000001",
  };

  assert.equal(isMessageAuthorized(message, config), false);
});
