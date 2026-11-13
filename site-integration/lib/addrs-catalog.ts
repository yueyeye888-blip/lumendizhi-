import snapshot from "./addrs-catalog-snapshot.json";

export const ADDRS_ORIGIN = "https://addrs.xyz";
export const ADDRS_CATALOG_URL = `${ADDRS_ORIGIN}/template-library/catalog-public.json`;

export type SupplierTemplate = {
  id: number;
  name: string;
  title: string;
  country: string;
  region: string;
  category: string;
  pages: number;
  language: string;
  currency: string;
  fileType: string;
};

export type SupplierTemplateCatalog = {
  source: string;
  syncedAt: string;
  totalTemplates: number;
  totalCountries: number;
  items: SupplierTemplate[];
  mode: "live" | "snapshot";
  notice?: string;
};

const text = (value: unknown, max = 160) => typeof value === "string" ? value.slice(0, max) : "";

export function normalizeAddrsCatalog(value: unknown): Omit<SupplierTemplateCatalog, "mode"> {
  if (!value || typeof value !== "object") throw new Error("目录格式错误");
  const raw = value as { items?: unknown; totalTemplates?: number; totalCountries?: number };
  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > 3000) throw new Error("目录条目不完整");
  const seen = new Set<number>();
  const items = raw.items.map((item) => {
    const row = item as Record<string, unknown>;
    const id = Number(row.publicId);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) throw new Error("模板编号不完整");
    seen.add(id);
    return {
      id,
      name: text(row.displayName),
      title: text(row.title),
      country: text(row.country),
      region: text(row.region),
      category: text(row.category),
      pages: Number.isSafeInteger(row.pages) ? Number(row.pages) : 0,
      language: text(row.language),
      currency: text(row.currency),
      fileType: text(row.fileType),
    };
  });
  if (Number(raw.totalTemplates) !== items.length || items.some((item) => !item.name)) throw new Error("原站返回目录数量不一致");
  return {
    source: ADDRS_CATALOG_URL,
    syncedAt: new Date().toISOString(),
    totalTemplates: items.length,
    totalCountries: Number(raw.totalCountries) || 0,
    items,
  };
}

export function getAddrsSnapshot(): SupplierTemplateCatalog {
  return { ...snapshot, mode: "snapshot" };
}

export function officialTemplatePreview(id: number) {
  return `${ADDRS_ORIGIN}/template-preview/${id}`;
}

export function officialTemplateDetail(id: number) {
  return `${ADDRS_ORIGIN}/templates/Show/${id}`;
}
