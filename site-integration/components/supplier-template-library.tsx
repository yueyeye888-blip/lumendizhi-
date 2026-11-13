"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Eye, FileText, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import type { SupplierTemplate, SupplierTemplateCatalog } from "@/lib/addrs-catalog";
import PersonalDetailsForm from "@/components/personal-details-form";

const previewUrl = (id: number) => `https://addrs.xyz/template-preview/${id}`;
const detailUrl = (id: number) => `https://addrs.xyz/templates/Show/${id}`;
const PAGE_SIZE = 24;

function OfficialPreview({ item, className = "", expanded = false }: { item: SupplierTemplate; className?: string; expanded?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`flex flex-col items-center justify-center gap-3 bg-[#f0f3f8] p-6 text-center text-xs text-slate-500 ${className}`}><FileText size={28} className="text-slate-300" /><p>原站预览暂时无法加载</p><span>可通过官方介绍页查看</span></div>;
  return <img src={previewUrl(item.id)} alt={`${item.name} · 原平台水印预览`} loading={expanded ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={className} />;
}

export default function SupplierTemplateLibrary({ selectionMode = false, initialTemplateId = null, onChooseTemplate }: {
  selectionMode?: boolean;
  initialTemplateId?: number | null;
  onChooseTemplate?: (id: number) => void;
}) {
  const [catalog, setCatalog] = useState<SupplierTemplateCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("全部地区");
  const [category, setCategory] = useState("全部类型");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [chosenId, setChosenId] = useState<number | null>(initialTemplateId);
  const [zoom, setZoom] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const load = async (refresh = false) => {
    if (!refresh) setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/supplier-templates${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const data = await response.json() as SupplierTemplateCatalog & { error?: string };
      if (!response.ok) throw new Error(data.error || "目录读取失败");
      setCatalog(data);
      if (!refresh) void load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "目录读取失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { setChosenId(initialTemplateId); }, [initialTemplateId]);

  const regions = useMemo(() => Array.from(new Set(catalog?.items.map((item) => item.region).filter(Boolean) || [])).sort(), [catalog]);
  const categories = useMemo(() => Array.from(new Set(catalog?.items.map((item) => item.category).filter(Boolean) || [])).sort(), [catalog]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (catalog?.items || []).filter((item) =>
      (region === "全部地区" || item.region === region) &&
      (category === "全部类型" || item.category === category) &&
      (!needle || [item.id, item.name, item.title, item.country, item.region, item.category, item.fileType, item.language, item.currency].join(" ").toLowerCase().includes(needle)),
    );
  }, [catalog, query, region, category]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = filtered.find((item) => item.id === selectedId) || catalog?.items.find((item) => item.id === selectedId);
  const selectedIndex = filtered.findIndex((item) => item.id === selectedId);
  const chosen = catalog?.items.find((item) => item.id === chosenId);

  const chooseTemplate = (id: number) => {
    if (!catalog?.items.some((item) => item.id === id)) return;
    setChosenId(id);
    setSelectedId(null);
    onChooseTemplate?.(id);
  };

  useEffect(() => { setPage(1); }, [query, region, category]);
  useEffect(() => { setZoom(false); }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
      if (event.key === "ArrowLeft" && selectedIndex > 0) setSelectedId(filtered[selectedIndex - 1].id);
      if (event.key === "ArrowRight" && selectedIndex >= 0 && selectedIndex < filtered.length - 1) setSelectedId(filtered[selectedIndex + 1].id);
      if (event.key === "Tab") {
        const dialog = closeRef.current?.closest('[role="dialog"]');
        const buttons = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); previousFocus.current?.focus(); };
  }, [selectedId, selectedIndex, filtered]);

  const changePage = (next: number) => { setPage(next); gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return <div className="p-5 md:p-8"><div className="mx-auto max-w-[1440px]">
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#6885bd]">Addrs.xyz · Official Catalog</p><h1 className="mt-2 text-2xl font-semibold">{selectionMode ? "地址证明生成器" : "全球地址证明模版库"}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{selectionMode ? "从全球地址证明模版库中选择任意模版，查看原平台水印预览。" : "原站真实条目与官方水印预览，点击模版可放大，也可选入地址证明生成器。"}</p></div>
    </div>
    <div className="mb-6 flex flex-wrap items-center gap-x-7 gap-y-3 rounded-2xl border border-[#e2e7ef] bg-white px-5 py-4">
      <div><strong className="text-2xl text-[#1d3b72]">{catalog?.totalTemplates ?? "—"}</strong><span className="ml-2 text-xs text-slate-500">个原模板</span></div><div><strong className="text-2xl text-[#1d3b72]">{catalog?.totalCountries ?? "—"}</strong><span className="ml-2 text-xs text-slate-500">个国家 / 地区</span></div>
    </div>
    {catalog?.notice && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{catalog.notice}</p>}
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<button type="button" onClick={() => void load()} className="ml-3 underline">重试</button></div>}
    {selectionMode && <section aria-label="当前选择的原平台模版" className="mb-6 overflow-hidden rounded-2xl border border-[#dce5f3] bg-white">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
        {chosen ? <button type="button" onClick={() => setSelectedId(chosen.id)} aria-label={`放大已选模版 ${chosen.name}`} className="relative h-52 w-full shrink-0 rounded-xl bg-[#eef1f6] p-3 sm:w-44"><OfficialPreview key={chosen.id} item={chosen} className="h-full w-full object-contain" /><span className="absolute bottom-2 right-2 rounded-full bg-white px-2 py-1 text-[10px] text-[#315c9f]">点击放大</span></button> : <div className="flex h-40 w-full shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-[#f6f8fc] sm:h-52 sm:w-44"><FileText size={34} className="text-slate-300" /></div>}
        <div className="min-w-0 flex-1"><div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#6885bd]">{chosen && <CheckCircle2 size={15} />}当前选择</div><h2 className="text-lg font-semibold text-[#243d64]">{chosen ? chosen.name : "请从下方选择一个模版"}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{chosen ? `${chosen.title} · #${chosen.id}` : "全部条目来自原平台目录，保留原名称、编号与预览图。"}</p>{chosen && <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">{[chosen.country, chosen.category, `${chosen.pages} 页`, chosen.language].filter(Boolean).map((value, index) => <span key={index} className="rounded-lg bg-[#f3f6fb] px-2.5 py-1.5">{value}</span>)}</div>}<p className="mt-5 text-xs leading-5 text-slate-500">提交资料后，所选模版会随 Telegram 消息发送，并由 Windows 自动化在 addrs.xyz 中同步选择。</p></div>
      </div>
    </section>}
    {selectionMode && <PersonalDetailsForm selectedTemplate={chosen ? { id: chosen.id, name: chosen.name } : null} />}
    <div ref={gridRef} className="scroll-mt-24">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <label className="relative flex-1"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="搜索原模板" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模板名称、编号、国家、机构或文件类型" className="h-11 w-full rounded-xl border border-[#e2e7ef] bg-white pl-10 pr-4 text-sm outline-none focus:border-[#87a3d9]" /></label>
        <select aria-label="按地区筛选原模板" value={region} onChange={(event) => setRegion(event.target.value)} className="h-11 rounded-xl border border-[#e2e7ef] bg-white px-4 text-sm"><option>全部地区</option>{regions.map((value) => <option key={value}>{value}</option>)}</select>
        <select aria-label="按类型筛选原模板" value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 rounded-xl border border-[#e2e7ef] bg-white px-4 text-sm"><option>全部类型</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
      </div>
      <div className="mb-4 flex justify-between text-xs text-slate-400"><span>{filtered.length} 个匹配模板 · 所有系列版本分别展示</span><span>第 {currentPage} / {totalPages} 页</span></div>
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white py-24 text-center text-sm text-slate-400">正在载入真实模板目录…</div> : !filtered.length ? <div className="rounded-2xl border border-dashed border-slate-200 py-24 text-center text-sm text-slate-400">没有匹配的模板，请调整搜索或筛选条件</div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map((item) => <article key={item.id} className={`${selectionMode && chosenId === item.id ? "border-[#6385bd] ring-2 ring-[#dbe6f8]" : "border-[#e2e7ef]"} overflow-hidden rounded-2xl border bg-white transition hover:border-[#a9bfdf] hover:shadow-md`}>
          <button type="button" onClick={() => setSelectedId(item.id)} aria-label={`预览原模板 ${item.name}`} className="group relative block h-56 w-full overflow-hidden bg-[#eef1f6] p-3"><OfficialPreview item={item} className="h-full w-full object-contain object-top transition group-hover:scale-[1.03]" /><span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-[#172a52]/90 px-3 py-1.5 text-[10px] text-white"><Eye size={12} />查看原预览</span></button>
          <div className="p-4"><div className="flex items-start justify-between gap-2"><h2 className="min-w-0 break-words text-sm font-semibold text-[#243d64]">{item.name}</h2><span className="shrink-0 rounded-lg bg-[#f1f5fb] px-2 py-1 text-[10px] text-[#6885bd]">#{item.id}</span></div><p className="mt-1 truncate text-[11px] text-slate-400" title={item.title}>{item.title}</p><p className="mt-3 text-xs text-slate-600">{item.country || item.region}</p><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500"><span className="rounded-md bg-[#f5f7fb] px-2 py-1">{item.category}</span><span className="rounded-md bg-[#f5f7fb] px-2 py-1">{item.pages ? `${item.pages} 页` : "页数未标注"}</span>{item.language && <span className="max-w-full truncate rounded-md bg-[#f5f7fb] px-2 py-1">{item.language}</span>}</div><button type="button" onClick={() => chooseTemplate(item.id)} aria-pressed={selectionMode && chosenId === item.id} className={`${selectionMode && chosenId === item.id ? "border-[#6385bd] bg-[#edf3fc]" : "border-[#dce5f3] hover:bg-[#f5f8fd]"} mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium text-[#315c9f]`}>{selectionMode && chosenId === item.id ? <><CheckCircle2 size={14} />已选择此模版</> : selectionMode ? "选择此模版" : "在生成器中选择"}</button></div>
        </article>)}
      </div>}
      {!loading && filtered.length > 0 && <nav aria-label="原模板目录分页" className="mt-6 flex flex-wrap items-center justify-center gap-3"><button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs disabled:opacity-40"><ChevronLeft size={14} />上一页</button><label className="inline-flex items-center gap-2 text-xs text-slate-500">前往<select aria-label="跳转模板页" value={currentPage} onChange={(event) => changePage(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white p-2">{Array.from({length:totalPages}, (_, index) => <option key={index + 1} value={index + 1}>第 {index + 1} 页</option>)}</select></label><button type="button" disabled={currentPage === totalPages} onClick={() => changePage(currentPage + 1)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs disabled:opacity-40">下一页<ChevronRight size={14} /></button></nav>}
    </div>
    {selected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0d1b35]/70 p-2 backdrop-blur-sm sm:p-5" onClick={() => setSelectedId(null)}><section role="dialog" aria-modal="true" aria-label={`${selected.name} 原模板预览`} onClick={(event) => event.stopPropagation()} className="flex h-[94vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6"><div className="min-w-0"><h2 className="truncate text-base font-semibold">{selected.name} · 原平台预览</h2><p className="mt-1 text-[11px] text-slate-400">编号 #{selected.id} · {selected.country} · {selected.pages} 页原文件</p></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => setZoom(!zoom)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-[#315c9f]">{zoom ? <ZoomOut size={14} /> : <ZoomIn size={14} />}{zoom ? "适合窗口" : "放大"}</button><button ref={closeRef} type="button" onClick={() => setSelectedId(null)} aria-label="关闭原模板预览" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button></div></header>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto md:flex-row"><div className="min-h-60 flex-1 overflow-auto bg-[#e8ecf2] p-4"><OfficialPreview key={selected.id} item={selected} expanded className={zoom ? "mx-auto h-auto w-[1200px] max-w-none bg-white shadow-lg" : "mx-auto h-auto max-h-none w-full max-w-[790px] bg-white shadow-lg"} /></div><aside className="w-full shrink-0 border-t border-slate-200 p-5 md:w-64 md:overflow-y-auto md:border-l md:border-t-0"><h3 className="mb-4 text-xs font-semibold text-slate-500">原平台目录信息</h3>{[["模板名称", selected.title],["地区", selected.region],["文件类型", selected.fileType],["分类", selected.category],["语言", selected.language],["币种", selected.currency]].map(([label,value]) => <div key={label} className="mb-4"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 break-words text-xs leading-5 text-slate-600">{value || "原站未标注"}</p></div>)}<p className="mt-5 rounded-xl bg-[#f5f7fb] p-3 text-[11px] leading-5 text-slate-500">此处展示原站公开的水印预览图；文件标注的总页数不代表有完整多页预览。</p><a href={detailUrl(selected.id)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#315c9f]">打开官方模板介绍<ExternalLink size={12} /></a></aside></div>
      <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs"><button type="button" disabled={selectedIndex <= 0} onClick={() => setSelectedId(filtered[selectedIndex - 1].id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40"><ChevronLeft size={13} />上一模板</button><button type="button" onClick={() => chooseTemplate(selected.id)} className="rounded-xl bg-[#1d3b72] px-3 py-2.5 text-xs font-medium text-white">{selectionMode ? "选择此模版" : "在生成器中选择"}</button><button type="button" disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} onClick={() => setSelectedId(filtered[selectedIndex + 1].id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">下一模板<ChevronRight size={13} /></button></footer>
    </section></div>}
  </div></div>;
}
