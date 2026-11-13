"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Languages, Loader2, X } from "lucide-react";
import type { SupplierTemplate } from "@/lib/addrs-catalog";
import { ADDRESS_LINE_LIMIT, EMPTY_PERSONAL_DETAILS, SOURCE_ADDRESS_LIMIT, type AddressTranslation, type PersonalDetails, validatePersonalDetails } from "@/lib/personal-details";

export default function PersonalDetailsForm({ selectedTemplate }: { selectedTemplate: Pick<SupplierTemplate, "id" | "name"> | null }) {
  const [profile, setProfile] = useState<PersonalDetails>({ ...EMPTY_PERSONAL_DETAILS, addressLines: ["", "", ""] });
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"manual" | "translate">("manual");
  const [sourceAddress, setSourceAddress] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configurationError, setConfigurationError] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<AddressTranslation | null>(null);
  const [translationSource, setTranslationSource] = useState("");
  const [translationError, setTranslationError] = useState("");
  const [showComparison, setShowComparison] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const sourceRef = useRef("");
  const addressSnapshotRef = useRef("");

  useEffect(() => {
    let active = true;
    fetch("/api/addresses/normalize", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { configured?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "翻译服务状态读取失败");
      if (active) setConfigured(Boolean(data.configured));
    }).catch(() => { if (active) setConfigurationError("暂时无法读取翻译服务状态，请稍后刷新；仍可手动填写地址。"); });
    return () => { active = false; requestRef.current?.abort(); };
  }, []);

  const change = (key: "fullName" | "recipientEmail", value: string) => {
    setProfile((current) => ({ ...current, [key]: value })); setMessage("");
  };
  const changeLine = (index: number, value: string) => {
    setProfile((current) => ({ ...current, addressLines: current.addressLines.map((line, i) => i === index ? value : line) as PersonalDetails["addressLines"] }));
    setMessage("");
  };
  const changeSource = (value: string) => {
    requestRef.current?.abort(); requestRef.current = null;
    sourceRef.current = value;
    setTranslating(false); setSourceAddress(value); setTranslation(null); setTranslationError("");
  };

  const translate = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const original = sourceAddress.trim();
    sourceRef.current = sourceAddress;
    addressSnapshotRef.current = JSON.stringify(profile.addressLines);
    setTranslating(true); setTranslation(null); setTranslationError(""); setShowComparison(false);
    try {
      const response = await fetch("/api/addresses/normalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: original }), signal: controller.signal });
      const data = await response.json() as AddressTranslation & { error?: string; code?: string };
      if (!response.ok) { if (data.code === "translation_not_configured") setConfigured(false); throw new Error(data.error || "地址翻译失败"); }
      if (controller.signal.aborted || sourceRef.current.trim() !== original) return;
      setTranslation(data); setTranslationSource(original);
    } catch (e) { if (!controller.signal.aborted) setTranslationError(e instanceof Error ? e.message : "地址翻译失败，原文未改动"); }
    finally { if (requestRef.current === controller) { requestRef.current = null; setTranslating(false); } }
  };

  const applyTranslation = () => {
    if (!translation || sourceAddress.trim() !== translationSource) { setTranslationError("地址原文已变化，请重新翻译后应用"); return; }
    if (JSON.stringify(profile.addressLines) !== addressSnapshotRef.current && !window.confirm("你在翻译期间修改了英文地址。是否用刚确认的翻译结果替换当前三行地址？")) return;
    setProfile((current) => ({ ...current, addressLines: translation.lines }));
    setMessage("已应用翻译结果，请核对三行地址。");
    setTranslation(null); setMode("manual");
  };

  const submitProfile = async () => {
    if (submitting) return;
    setMessage("");
    if (!selectedTemplate) {
      setMessage("请先从模版库中选择一个模版，再提交资料");
      return;
    }
    let validated: PersonalDetails;
    try {
      validated = validatePersonalDetails(profile);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "请检查填写的资料");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/personal-details/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ profile: validated, template: selectedTemplate }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "提交失败");
      setMessage(data.message || "已提交");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return <form onSubmit={(event) => { event.preventDefault(); void submitProfile(); }} autoComplete="off" aria-label="填写个人资料" className="mb-6 rounded-2xl border border-[#dce5f3] bg-white p-5 sm:p-6">
    <div className="mb-5"><h2 className="text-base font-semibold text-[#243d64]">填写个人资料</h2><p className="mt-1 text-xs leading-5 text-slate-500">一次性填写，本页不保存资料；接收邮箱请每次手动输入。</p></div>
    <fieldset className="min-w-0 space-y-5">
      <label className="block"><span className="mb-2 block text-sm font-medium">姓名</span><input required maxLength={120} autoComplete="off" value={profile.fullName} onChange={(event) => change("fullName", event.target.value)} placeholder="请输入本人的英文姓名或拼音" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#87a3d9]" /><span className="mt-2 block text-xs leading-5 text-slate-400">建议使用大写拼音；可包含空格、连字符和撇号，不得包含表情。</span></label>
      <div><p className="mb-2 text-sm font-medium">地址模式</p><div className="flex flex-wrap gap-2" role="group" aria-label="地址填写模式"><button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")} className={`${mode === "manual" ? "border-[#6385bd] bg-[#edf3fc] text-[#315c9f]" : "border-slate-200 text-slate-500"} rounded-xl border px-4 py-2.5 text-xs font-medium`}>填写地址信息</button><button type="button" aria-pressed={mode === "translate"} onClick={() => setMode("translate")} className={`${mode === "translate" ? "border-[#6385bd] bg-[#edf3fc] text-[#315c9f]" : "border-slate-200 text-slate-500"} inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium`}><Languages size={15} />翻译并规范已有地址</button></div></div>
      {mode === "translate" && <section aria-label="翻译并规范已有地址" className="rounded-2xl border border-[#dce5f3] bg-[#f7f9fd] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-[#315c9f]">翻译并规范已有地址</h3><p className="mt-2 text-xs leading-6 text-slate-500">粘贴你自己的中文或本地语言地址。AI 只翻译、去重并整理为三行英文，不会补造缺失的门牌、地区或邮编。</p>
        <label className="mt-4 block"><span className="mb-2 block text-xs font-medium text-slate-600">地址原文</span><textarea rows={4} maxLength={SOURCE_ADDRESS_LIMIT} value={sourceAddress} onChange={(event) => changeSource(event.target.value)} placeholder="粘贴你已有的真实地址；缺失的信息不必填写" className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-[#87a3d9]" /></label>
        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-slate-400"><span>仅发送地址原文至 OpenAI，姓名和邮箱不参与翻译。</span><span className="shrink-0">{sourceAddress.length} / {SOURCE_ADDRESS_LIMIT}</span></div>
        {configured === false && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">AI 翻译尚未启用，请管理员完成 OpenAI 服务配置。你仍可手动填写三行英文地址。</p>}
        {configurationError && <p className="mt-3 text-xs text-amber-700">{configurationError}</p>}
        <div className="mt-4 flex items-center gap-3"><button type="button" disabled={!configured || translating || sourceAddress.trim().length < 3} onClick={() => void translate()} className="inline-flex items-center gap-2 rounded-xl bg-[#1d3b72] px-4 py-2.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">{translating ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}{translating ? "正在翻译并整理" : "翻译并整理为三行英文"}</button>{translating && <button type="button" onClick={() => { requestRef.current?.abort(); requestRef.current = null; setTranslating(false); }} className="inline-flex items-center gap-1 text-xs text-slate-500"><X size={13} />取消</button>}</div>
        {translationError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{translationError}</p>}
        {translation && <div className="mt-4 rounded-xl border border-[#cddde8] bg-white p-4"><h4 className="mb-3 text-xs font-semibold text-[#315c9f]">翻译结果 · 核对后应用</h4><div className="space-y-2">{translation.lines.map((line, i) => <div key={i} className="grid grid-cols-[45px_1fr] gap-3 rounded-lg bg-[#f7f9fc] px-3 py-2.5 text-xs leading-5"><span className="text-slate-400">第 {i + 1} 行</span><span className={line ? "break-words text-slate-700" : "text-slate-400"}>{line || "留空（原文未提供）"}</span></div>)}</div>{translation.notes.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-amber-800">{translation.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}<button type="button" onClick={() => setShowComparison(!showComparison)} className="mt-3 text-xs text-[#6885bd]">{showComparison ? "收起原文对照" : "查看原文与英文对照"}</button>{showComparison && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">{translation.segments.map((segment, i) => <div key={i} className="grid gap-1 text-[11px] sm:grid-cols-2 sm:gap-4"><span className="break-words text-slate-400">{segment.source}</span><span className="break-words text-slate-600">{segment.translation}</span></div>)}</div>}<button type="button" onClick={applyTranslation} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#edf6f1] px-4 py-2.5 text-xs font-medium text-[#26775f]"><CheckCircle2 size={14} />应用到三行地址</button></div>}
      </section>}
      <div className={`rounded-xl border px-4 py-3 text-xs leading-5 ${selectedTemplate ? "border-[#cddde8] bg-[#f7f9fd] text-[#315c9f]" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
        {selectedTemplate ? <>本次提交模版：<strong>{selectedTemplate.name}</strong></> : "请先从下方模版库选择一个模版；未选择时无法提交资料。"}
      </div>
      <div><h3 className="mb-2 text-sm font-medium">填写地址信息</h3><p className="mb-3 text-xs leading-5 text-slate-400">按三行填写英文地址，每行最多 160 字符；缺失的第二、三行可留空，请勿补造信息。</p><div className="space-y-3">{profile.addressLines.map((line, i) => <label key={i} className="block"><span className="mb-1.5 block text-xs text-slate-500">地址第 {i + 1} 行{i > 0 ? "（可留空）" : ""}</span><input required={i === 0} maxLength={ADDRESS_LINE_LIMIT} autoComplete="off" value={line} onChange={(event) => changeLine(i, event.target.value)} placeholder={["门牌、房间、楼宇、街道等已有信息", "地区、城市等已有信息", "省州、邮编、国家等已有信息"][i]} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#87a3d9]" /></label>)}</div></div>
      <label className="block"><span className="mb-2 block text-sm font-medium">接收邮箱</span><input required type="email" maxLength={254} autoComplete="off" value={profile.recipientEmail} onChange={(event) => change("recipientEmail", event.target.value)} placeholder="请手动填写本次接收邮箱" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#87a3d9]" /><span className="mt-2 block text-xs text-slate-400">请每次手动填写；不会使用登录邮箱或历史邮箱作为默认值。</span></label>
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">{message}</p>}
      <button type="submit" disabled={submitting || !selectedTemplate} className="h-11 rounded-xl bg-[#1d3b72] px-6 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "提交中…" : selectedTemplate ? "提交资料" : "请先选择模版"}</button>
    </fieldset>
  </form>;
}
