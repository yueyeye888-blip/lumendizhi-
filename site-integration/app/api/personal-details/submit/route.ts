import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { addressOrders } from "@/db/schema";
import { getAddrsSnapshot } from "@/lib/addrs-catalog";
import { validatePersonalDetails } from "@/lib/personal-details";
import { formatPersonalDetailsNotice } from "@/lib/personal-details-notice.mjs";
import { validateSubmittedTemplate } from "@/lib/submitted-template.mjs";
import { getTelegramSettings } from "@/lib/telegram-settings";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };

function requestNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `ADDR-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "请求来源不匹配" }, { status: 403, headers });
  }

  let profile;
  let template: { id: string; name: string };
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 8192) {
      return Response.json({ error: "提交内容过大" }, { status: 413, headers });
    }
    const payload = JSON.parse(text) as { profile?: unknown; template?: unknown };
    profile = validatePersonalDetails(payload.profile);
    template = validateSubmittedTemplate(payload.template, getAddrsSnapshot().items);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "提交内容无效" }, { status: 400, headers });
  }

  const db = getDb();
  const row: typeof addressOrders.$inferInsert = {
    id: crypto.randomUUID(),
    requestNo: requestNumber(),
    userId: user.userId,
    userEmail: user.email.toLowerCase(),
    userName: user.displayName,
    templateId: template.id,
    templateName: template.name,
    subjectName: profile.fullName,
    recipientEmail: profile.recipientEmail.toLowerCase(),
    status: "queued",
    statusMessage: "资料已提交，等待自动处理",
  };
  await db.insert(addressOrders).values(row);

  const failOrder = async (message: string) => {
    await db.update(addressOrders).set({
      status: "failed",
      statusMessage: message,
      error: message,
      updatedAt: new Date().toISOString(),
    }).where(eq(addressOrders.id, row.id));
  };

  const settings = await getTelegramSettings().catch(() => null);
  if (!settings) {
    await failOrder("Telegram 通知尚未配置，请联系管理员");
    return Response.json({ ok: true, requestNo: row.requestNo, message: "已提交，等待管理员处理" }, { status: 202, headers });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: settings.chatId, text: formatPersonalDetailsNotice(profile, user.email, template.name, row.requestNo) }),
    });
    const result = await response.json() as { ok?: boolean };
    if (!response.ok || !result.ok) {
      await failOrder("Telegram 通知发送失败，请联系管理员重试");
      return Response.json({ ok: true, requestNo: row.requestNo, message: "已提交，但自动处理暂未启动" }, { status: 202, headers });
    }
    return Response.json({ ok: true, requestNo: row.requestNo, message: "已提交，正在自动处理" }, { status: 202, headers });
  } catch {
    await failOrder("Telegram 通知发送失败，请联系管理员重试");
    return Response.json({ ok: true, requestNo: row.requestNo, message: "已提交，但自动处理暂未启动" }, { status: 202, headers });
  }
}
