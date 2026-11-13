import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { integrationSettings } from "@/db/schema";
import { isResourceAdmin } from "@/lib/resource-access";
import { encryptSetting } from "@/lib/security-crypto";
import { getTelegramSettings } from "@/lib/telegram-settings";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getChatGPTUser();
  if (!user || !isResourceAdmin(user)) return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "无权访问" }, { status: 403 });
  const settings = await getTelegramSettings();
  return Response.json({ configured: Boolean(settings), botUsername: settings?.botUsername || null, maskedChatId: settings?.chatId ? `••••${settings.chatId.slice(-4)}` : null });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "无权访问" }, { status: 403 });
  const body = await request.json() as { botToken?: string; chatId?: string; sendTest?: boolean };
  const previous = await getTelegramSettings();
  const botToken = body.botToken?.trim() || previous?.botToken || "";
  const chatId = body.chatId?.trim() || previous?.chatId || "";
  if (!/^\d{6,12}:[A-Za-z0-9_-]{20,}$/.test(botToken)) return Response.json({ error: "Bot Token 格式不正确" }, { status: 400 });
  if (!/^-?\d{4,20}$/.test(chatId) && !/^@[A-Za-z0-9_]{5,}$/.test(chatId)) return Response.json({ error: "Chat ID 格式不正确" }, { status: 400 });

  const botResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const botResult = await botResponse.json() as { ok?: boolean; result?: { username?: string }; description?: string };
  if (!botResponse.ok || !botResult.ok) return Response.json({ error: botResult.description || "无法验证 Telegram Bot" }, { status: 400 });

  if (body.sendTest) {
    const testResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: "✅ Lumen 资源申购中心 Telegram 提醒已配置成功。" }),
    });
    if (!testResponse.ok) return Response.json({ error: "Bot 有效，但测试消息发送失败，请确认 Chat ID 及机器人会话权限" }, { status: 400 });
  }

  const encrypted = await encryptSetting(JSON.stringify({ botToken, chatId, botUsername: botResult.result?.username || "" }));
  await getDb().insert(integrationSettings).values({ key: "telegram", ...encrypted, updatedBy: user.userId }).onConflictDoUpdate({ target: integrationSettings.key, set: { ...encrypted, updatedBy: user.userId, updatedAt: new Date().toISOString() } });
  return Response.json({ configured: true, botUsername: botResult.result?.username || null, maskedChatId: `••••${chatId.slice(-4)}`, testSent: Boolean(body.sendTest) });
}
