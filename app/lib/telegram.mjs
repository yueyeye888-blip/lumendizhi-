export function parseAllowedChatIds(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return new Set(
    items
      .map((item) => String(item).trim())
      .filter((item) => /^-?\d+$/.test(item))
  );
}

export function messageFromUpdate(update) {
  const message = update?.message || update?.channel_post;
  if (!message || typeof message.text !== "string") return null;
  return {
    chatId: String(message.chat?.id || ""),
    messageId: message.message_id,
    senderId: String(message.from?.id || message.sender_chat?.id || ""),
    senderIsBot: Boolean(message.from?.is_bot),
    text: message.text,
  };
}

export function isMessageAuthorized(message, config) {
  if (config.allowedChatIds.has(message.chatId)) return true;
  return message.senderIsBot && config.trustedSenderBotIds.has(message.senderId);
}

export function statusChatIdFor(message, config) {
  if (message.senderIsBot && config.trustedSenderBotIds.has(message.senderId)) {
    return config.notifyChatId;
  }
  return message.chatId;
}
