import{n as e,t}from"./mail-delivery-dVzEPzKO.js";function n(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#039;`)}function r(){return t()}async function i(t){if(!r())return{ok:!1,status:`pending`,error:`邮件服务尚未配置`};let i=t.items.map((e,t)=>`资源 ${t+1}：${e.productName}\n供应商：${e.supplier}\n国家/地区：${e.country||`未标注`}\n交付内容：\n${e.payload}`).join(`

--------------------

`),a=t.items.map((e,t)=>`
    <section style="margin:16px 0;padding:18px;border:1px solid #dfe6f0;border-radius:12px;background:#f8fafc">
      <div style="font-weight:700;color:#1d3b72">资源 ${t+1} · ${n(e.productName)}</div>
      <div style="margin-top:8px;font-size:13px;color:#667085">供应商：${n(e.supplier)} · 国家/地区：${n(e.country||`未标注`)}</div>
      <pre style="margin-top:14px;white-space:pre-wrap;word-break:break-all;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#26364f">${n(e.payload)}</pre>
    </section>`).join(``);return e(`lumen-warehouse/${t.claimId}`,{to:t.recipientEmail,subject:`Lumen 资源交付 · ${t.items.length} 项资源`,text:`你已在 Lumen 资源申购中心认领 ${t.items.length} 项资源。\n\n${i}\n\n请妥善保管敏感信息。`,html:`<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#172033"><h2 style="color:#1d3b72">Lumen 资源交付</h2><p>你已认领 <strong>${t.items.length}</strong> 项资源，详情如下：</p>${a}<p style="font-size:12px;color:#8a94a6">该邮件包含敏感交付信息，请勿转发。</p></div>`})}export{i as n,r as t};