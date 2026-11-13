export function formatPersonalDetailsNotice(profile, submitterEmail) {
  const lines = [
    "📩 新的个人资料提交",
    `提交人账号：${submitterEmail}`,
    "",
    `姓名：${profile.fullName}`,
    "",
    ...profile.addressLines.map((line, index) => `第 ${index + 1} 行地址：${line}`),
    "",
    `接收邮箱：${profile.recipientEmail}`,
  ];
  return lines.join("\n");
}
