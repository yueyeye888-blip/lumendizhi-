import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { addressOrders } from "@/db/schema";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };
const ALLOWED_STATUSES = new Set([
  "filling",
  "payment_pending",
  "payment_confirmed",
  "generating",
  "delivered",
  "failed",
]);

function clean(value: unknown, limit: number) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}

export async function POST(request: Request) {
  const configuredToken = env.ADDRESS_ORDER_CALLBACK_TOKEN?.trim() || "";
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (!configuredToken || suppliedToken !== configuredToken) {
    return Response.json({ error: "未授权" }, { status: 401, headers });
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 8192) {
      return Response.json({ error: "回调内容过大" }, { status: 413, headers });
    }
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "回调内容无效" }, { status: 400, headers });
  }

  const requestNo = clean(body.requestNo, 80);
  const status = clean(body.status, 40);
  if (!/^ADDR-\d{8}-[A-Z0-9]{8}$/.test(requestNo) || !ALLOWED_STATUSES.has(status)) {
    return Response.json({ error: "订单编号或状态无效" }, { status: 400, headers });
  }

  const db = getDb();
  const existing = await db.select({ id: addressOrders.id })
    .from(addressOrders)
    .where(eq(addressOrders.requestNo, requestNo))
    .limit(1);
  if (!existing[0]) return Response.json({ error: "没有找到该订单" }, { status: 404, headers });

  const changes: Partial<typeof addressOrders.$inferInsert> = {
    status,
    statusMessage: clean(body.statusMessage, 300) || null,
    updatedAt: new Date().toISOString(),
  };
  if (body.externalOrderNo !== undefined) changes.externalOrderNo = clean(body.externalOrderNo, 100) || null;
  if (body.externalOrderUrl !== undefined) {
    const url = clean(body.externalOrderUrl, 500);
    changes.externalOrderUrl = /^https:\/\/addrs\.xyz\/order\//.test(url) ? url : null;
  }
  if (body.paymentAmount !== undefined) changes.paymentAmount = clean(body.paymentAmount, 40) || null;
  if (body.paymentCurrency !== undefined) changes.paymentCurrency = clean(body.paymentCurrency, 20) || null;
  if (body.paymentNetwork !== undefined) changes.paymentNetwork = clean(body.paymentNetwork, 100) || null;
  if (body.paymentAddress !== undefined) changes.paymentAddress = clean(body.paymentAddress, 200) || null;
  if (status === "failed") changes.error = clean(body.error, 500) || "自动处理失败";
  else changes.error = null;

  await db.update(addressOrders).set(changes).where(eq(addressOrders.requestNo, requestNo));
  return Response.json({ ok: true }, { headers });
}
