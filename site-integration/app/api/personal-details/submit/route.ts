import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getAddrsSnapshot } from "@/lib/addrs-catalog";
import { validatePersonalDetails } from "@/lib/personal-details";
import { formatPersonalDetailsNotice } from "@/lib/personal-details-notice.mjs";
import { validateSubmittedTemplate } from "@/lib/submitted-template.mjs";
import { getTelegramSettings } from "@/lib/telegram-settings";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "请求来源不匹配" }, { status: 403, headers });
  }

  let profile;
  let templateName = "";
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 8192) {
      return Response.json({ error: "提交内容过大" }, { status: 413, headers });
    }
    const payload = JSON.parse(text) as { profile?: unknown; template?: unknown };
    profile = validatePersonalDetails(payload.profile);
    const template = validateSubmittedTemplate(payload.template, getAddrsSnapshot().items);
    templateName = template.name;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "提交内容无效" }, { status: 400, headers });
  }

  const settings = await getTelegramSettings().catch(() => null);
  if (!settings) {
    return Response.json({ error: "管理员尚未配置 Telegram 通知，暂时无法提交" }, { status: 503, headers });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: settings.chatId, text: formatPersonalDetailsNotice(profile, user.email, templateName) }),
    });
    const result = await response.json() as { ok?: boolean };
    if (!response.ok || !result.ok) {
      return Response.json({ error: "通知发送失败，请稍后重试" }, { status: 502, headers });
    }
    return Response.json({ ok: true, message: "已提交，管理员已收到通知" }, { headers });
  } catch {
    return Response.json({ error: "通知发送失败，请稍后重试" }, { status: 502, headers });
  }
}
