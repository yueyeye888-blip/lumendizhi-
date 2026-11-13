export function formatPersonalDetailsNotice(profile, submitterEmail, templateName, requestNo) {
  const lines = [
    "📩 新的个人资料提交",
    `订单编号：${requestNo}`,
    "",
    `提交人账号：${submitterEmail}`,
    "",
    `姓名：${profile.fullName}`,
    "",
    ...profile.addressLines.map((line, index) => `第 ${index + 1} 行地址：${line}`),
    "",
    `模版：${templateName}`,
    "",
    `接收邮箱：${profile.recipientEmail}`,
  ];
  return lines.join("\n");
}
