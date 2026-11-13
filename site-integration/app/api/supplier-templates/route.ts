import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ADDRS_CATALOG_URL, getAddrsSnapshot, normalizeAddrsCatalog, type SupplierTemplateCatalog } from "@/lib/addrs-catalog";

export const dynamic = "force-dynamic";

let cached: SupplierTemplateCatalog | null = null;
let expiresAt = 0;
let pending: Promise<SupplierTemplateCatalog> | null = null;

async function refreshCatalog(): Promise<SupplierTemplateCatalog> {
  try {
    const response = await fetch(ADDRS_CATALOG_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`原站返回 ${response.status}`);
    const result: SupplierTemplateCatalog = { ...normalizeAddrsCatalog(await response.json()), mode: "live" };
    cached = result;
    expiresAt = Date.now() + 10 * 60 * 1000;
    return result;
  } catch {
    const fallback = cached || getAddrsSnapshot();
    return { ...fallback, notice: "原站实时目录暂时不可用，当前显示最近一次核对的真实目录。" };
  }
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (!refresh) return Response.json(cached && expiresAt > Date.now() ? cached : getAddrsSnapshot(), {
    headers: { "cache-control": "private, no-store" },
  });
  if (!pending) pending = refreshCatalog().finally(() => { pending = null; });
  return Response.json(await pending, { headers: { "cache-control": "private, no-store" } });
}
