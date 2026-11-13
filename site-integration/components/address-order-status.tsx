"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Copy, ExternalLink, LoaderCircle, MapPin } from "lucide-react";

type AddressOrder = {
  requestNo: string;
  templateName: string;
  subjectName: string;
  recipientEmail: string;
  status: string;
  statusMessage: string | null;
  externalOrderNo: string | null;
  externalOrderUrl: string | null;
  paymentAmount: string | null;
  paymentCurrency: string | null;
  paymentNetwork: string | null;
  paymentAddress: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

const STEPS = ["资料提交", "自动填表", "等待支付", "付款确认", "邮箱交付"];
const TERMINAL = new Set(["delivered", "failed"]);

function stepFor(status: string) {
  if (status === "queued") return 1;
  if (status === "filling") return 2;
  if (status === "payment_pending") return 3;
  if (status === "payment_confirmed" || status === "generating") return 4;
  if (status === "delivered") return 5;
  return 1;
}

function displayFor(order: AddressOrder) {
  if (order.status === "failed") return { title: "订单处理失败", detail: order.error || order.statusMessage || "请联系管理员处理", tone: "error" };
  if (order.status === "payment_pending") return { title: "支付订单已创建", detail: "已停留在支付页面，等待后续付款处理。", tone: "ready" };
  if (order.status === "payment_confirmed") return { title: "付款已确认", detail: "系统正在等待生成文件。", tone: "ready" };
  if (order.status === "generating") return { title: "正在生成并发送", detail: "付款已确认，文件正在制作。", tone: "ready" };
  if (order.status === "delivered") return { title: "已发送到邮箱", detail: "文件已发送，请同时检查垃圾邮件和订阅邮件。", tone: "ready" };
  if (order.status === "filling") return { title: "正在自动填写资料", detail: "系统正在选择模版、填写资料并创建支付订单。", tone: "working" };
  return { title: "资料已提交", detail: "订单正在排队，页面会自动更新处理状态。", tone: "working" };
}

export default function AddressOrderStatus({ requestNo }: { requestNo: string }) {
  const [order, setOrder] = useState<AddressOrder | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/address-orders/${encodeURIComponent(requestNo)}`, { cache: "no-store" });
      const data = await response.json() as { order?: AddressOrder; error?: string };
      if (!response.ok || !data.order) throw new Error(data.error || "订单状态读取失败");
      setOrder(data.order);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "订单状态读取失败");
    }
  }, [requestNo]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (!order || !TERMINAL.has(order.status)) void refresh();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [order?.status, refresh]);

  const currentStep = order ? stepFor(order.status) : 1;
  const display = useMemo(() => order ? displayFor(order) : null, [order]);
  const copyAddress = async () => {
    if (!order?.paymentAddress) return;
    await navigator.clipboard.writeText(order.paymentAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4ff_0,#f6f8fc_42%,#edf1f7_100%)] px-4 py-5 text-[#202938] sm:px-8 sm:py-8">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-4 rounded-[28px] border border-[#d5dfec] bg-white/90 px-5 py-5 shadow-[0_12px_35px_rgba(51,72,103,0.08)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-4"><span className="flex size-12 items-center justify-center rounded-2xl bg-[#2169df] text-white"><MapPin size={28} fill="currentColor" /></span><div><p className="text-lg font-semibold sm:text-2xl">Lumen 地址订单</p><p className="mt-0.5 text-xs text-slate-400">订单处理状态实时更新</p></div></div>
        <a href="/" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#ccd9ea] px-5 text-sm font-medium text-[#294a77]"><ArrowLeft size={17} />返回主页</a>
      </header>

      <section className="mt-5 rounded-[28px] border border-[#d5dfec] bg-white/90 p-5 shadow-[0_18px_50px_rgba(51,72,103,0.09)] sm:p-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-slate-400">ORDER</p>
        <h1 className="mt-1 break-all text-2xl font-semibold sm:text-4xl">{order?.externalOrderNo || requestNo}</h1>
        {order?.externalOrderNo && <p className="mt-2 text-xs text-slate-400">内部编号：{requestNo}</p>}

        <div className="mt-8 grid grid-cols-5 gap-1 border-t border-slate-200 pt-7 sm:gap-4">
          {STEPS.map((step, index) => {
            const number = index + 1;
            const active = number <= currentStep && order?.status !== "failed";
            return <div key={step} className="relative flex flex-col items-center text-center">
              {index > 0 && <span className={`absolute right-1/2 top-5 h-0.5 w-full ${active ? "bg-[#4b78dc]" : "bg-slate-200"}`} />}
              <span className={`relative z-10 flex size-10 items-center justify-center rounded-full text-sm font-semibold ${active ? "bg-[#4674df] text-white" : "bg-slate-100 text-slate-400"}`}>{number < currentStep && order?.status !== "failed" ? <Check size={17} /> : number}</span>
              <span className={`mt-3 text-[10px] font-medium sm:text-sm ${active ? "text-[#2367d7]" : "text-slate-400"}`}>{step}</span>
            </div>;
          })}
        </div>

        <div className={`mt-8 rounded-3xl border p-6 text-center sm:p-9 ${display?.tone === "error" ? "border-red-200 bg-red-50" : "border-[#d9e3ef] bg-[#fbfcfe]"}`}>
          {!order && !error && <LoaderCircle className="mx-auto animate-spin text-[#4674df]" size={36} />}
          {error && <><CircleAlert className="mx-auto text-red-500" size={36} /><h2 className="mt-3 text-xl font-semibold text-red-800">状态读取失败</h2><p className="mt-2 text-sm text-red-700">{error}</p><button onClick={() => void refresh()} className="mt-4 rounded-xl bg-red-700 px-5 py-2.5 text-sm text-white">重新读取</button></>}
          {order && display && <>
            {display.tone === "working" && <LoaderCircle className="mx-auto animate-spin text-[#4674df]" size={36} />}
            {display.tone === "ready" && <Check className="mx-auto rounded-full bg-emerald-100 p-2 text-emerald-700" size={42} />}
            {display.tone === "error" && <CircleAlert className="mx-auto text-red-500" size={38} />}
            <h2 className="mt-3 text-xl font-semibold sm:text-3xl">{display.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{display.detail}</p>
            {order.status === "payment_pending" && <div className="mx-auto mt-6 grid max-w-3xl gap-3 text-left sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-400">支付金额</p><p className="mt-1 text-xl font-semibold text-[#213d6b]">{order.paymentAmount || "—"} {order.paymentCurrency || ""}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-400">支付网络</p><p className="mt-1 text-sm font-semibold text-[#213d6b]">{order.paymentNetwork || "—"}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2"><p className="text-xs text-slate-400">收款地址</p><div className="mt-1 flex items-center gap-2"><p className="min-w-0 flex-1 break-all font-mono text-sm text-[#213d6b]">{order.paymentAddress || "—"}</p>{order.paymentAddress && <button onClick={() => void copyAddress()} aria-label="复制收款地址" className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500"><Copy size={15} /></button>}</div>{copied && <p className="mt-1 text-xs text-emerald-700">已复制</p>}</div>
            </div>}
            {order.externalOrderUrl && <a href={order.externalOrderUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#cbd8e9] bg-white px-5 py-2.5 text-sm font-medium text-[#315c9f]">查看 addrs.xyz 支付页<ExternalLink size={15} /></a>}
          </>}
        </div>

        {order && <div className="mt-5 grid overflow-hidden rounded-2xl border border-[#d5dfec] bg-white sm:grid-cols-3">
          {[['模版', order.templateName], ['姓名', order.subjectName], ['接收邮箱', order.recipientEmail]].map(([label, value], index) => <div key={label} className={`p-5 ${index ? "border-t border-[#d5dfec] sm:border-l sm:border-t-0" : ""}`}><p className="text-xs text-slate-400">{label}</p><p className="mt-2 break-words text-sm font-semibold text-[#1f3357] sm:text-base">{value}</p></div>)}
        </div>}
      </section>
      <p className="py-5 text-center text-xs text-slate-500">关闭页面不会影响订单处理，请保留当前订单网址以便查询状态。</p>
    </div>
  </main>;
}
