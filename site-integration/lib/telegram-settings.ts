import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { integrationSettings } from "@/db/schema";
import { decryptSetting } from "@/lib/security-crypto";

export type TelegramSettings = { botToken: string; chatId: string; botUsername?: string };

export async function getTelegramSettings(): Promise<TelegramSettings | null> {
  const configuredChatId = env.TELEGRAM_CHAT_ID?.trim();
  const row = await getDb().select().from(integrationSettings).where(eq(integrationSettings.key, "telegram")).limit(1);
  if (row.length) {
    const settings = JSON.parse(await decryptSetting(row[0].encryptedValue, row[0].iv)) as TelegramSettings;
    return configuredChatId ? { ...settings, chatId: configuredChatId } : settings;
  }
  if (env.TELEGRAM_BOT_TOKEN && configuredChatId) {
    return { botToken: env.TELEGRAM_BOT_TOKEN, chatId: configuredChatId };
  }
  return null;
}
