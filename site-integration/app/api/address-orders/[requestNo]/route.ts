import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { addressOrders } from "@/db/schema";
import { isResourceAdmin } from "@/lib/resource-access";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestNo: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers });

  const requestNo = (await params).requestNo.trim().slice(0, 80);
  const rows = await getDb()
    .select()
    .from(addressOrders)
    .where(eq(addressOrders.requestNo, requestNo))
    .limit(1);
  const row = rows[0];
  if (!row || (row.userId !== user.userId && !isResourceAdmin(user))) {
    return Response.json({ error: "没有找到该订单" }, { status: 404, headers });
  }

  return Response.json({
    order: {
      requestNo: row.requestNo,
      templateName: row.templateName,
      subjectName: row.subjectName,
      recipientEmail: row.recipientEmail,
      status: row.status,
      statusMessage: row.statusMessage,
      externalOrderNo: row.externalOrderNo,
      error: row.error,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
  }, { headers });
}
