import AddressOrderStatus from "@/components/address-order-status";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function AddressOrderPage({
  params,
}: {
  params: Promise<{ requestNo: string }>;
}) {
  const { requestNo } = await params;
  await requireChatGPTUser(`/address-orders/${encodeURIComponent(requestNo)}`);
  return <AddressOrderStatus requestNo={requestNo} />;
}
