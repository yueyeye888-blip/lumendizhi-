const LIMITS = {
  fullName: 120,
  address: 160,
  template: 120,
  requestNo: 80,
  email: 254,
};

function clean(value, limit) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}

export function parsePersonalDetailsNotice(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (!lines.some((line) => line.trim() === "📩 新的个人资料提交")) {
    throw new Error("不是【个人资料提交】消息");
  }

  const valueFor = (label) => {
    const line = lines.find((candidate) => candidate.trim().startsWith(`${label}：`));
    return line ? line.trim().slice(label.length + 1) : "";
  };

  const profile = {
    requestNo: clean(valueFor("订单编号"), LIMITS.requestNo),
    fullName: clean(valueFor("姓名"), LIMITS.fullName),
    addressLines: [1, 2, 3].map((index) => clean(valueFor(`第 ${index} 行地址`), LIMITS.address)),
    template: clean(valueFor("模版") || valueFor("模板"), LIMITS.template),
    recipientEmail: clean(valueFor("接收邮箱"), LIMITS.email),
  };

  if (!/^ADDR-\d{8}-[A-Z0-9]{8}$/.test(profile.requestNo)) throw new Error("订单编号格式无效");
  if (!profile.fullName) throw new Error("缺少姓名");
  if (!profile.addressLines[0]) throw new Error("缺少第 1 行地址");
  if (!profile.template) throw new Error("缺少模版");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.recipientEmail)) {
    throw new Error("接收邮箱格式无效");
  }
  return profile;
}
