// Only locally rendered, visibly marked SAMPLE SVGs are accepted by this sender.
// This module does not read mailboxes or forward supplier attachments.
export function sampleMailAttachments(payload, key) {
  if (payload.attachments === undefined) return [];
  if (!Array.isArray(payload.attachments) || payload.attachments.length !== 1 ||
      !key.startsWith('lumen-sample/') || !payload.subject.startsWith('[SAMPLE / NOT VALID]')) {
    throw new Error('附件仅适用于带水印的 SAMPLE 测试样张');
  }
  return payload.attachments.map(file => {
    if (!file || typeof file.name !== 'string' || !/^[A-Za-z0-9_-]{1,110}-SAMPLE\.svg$/.test(file.name) ||
        file.contentType !== 'image/svg+xml' || typeof file.contentBase64 !== 'string' ||
        file.contentBase64.length > 350000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.contentBase64)) {
      throw new Error('测试附件的名称、类型或大小无效');
    }
    const bytes = Buffer.from(file.contentBase64, 'base64');
    const svg = bytes.toString('utf8');
    if (bytes.length === 0 || bytes.length > 250000 || !svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') ||
        !svg.endsWith('</svg>') || !/<text\b[^>]*>SAMPLE \/ NOT VALID<\/text>/.test(svg) ||
        /<(?:script|foreignObject|image|use|style|animate|set)\b|\bon\w+\s*=|\bhref\s*=|<!|url\s*\(/i.test(svg)) {
      throw new Error('测试附件内容未通过校验，请保留可见 SAMPLE 水印');
    }
    return { '@odata.type': '#microsoft.graph.fileAttachment', name: file.name, contentType: 'image/svg+xml', contentBytes: file.contentBase64 };
  });
}
