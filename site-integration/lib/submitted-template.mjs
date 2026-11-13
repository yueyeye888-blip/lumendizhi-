export function validateSubmittedTemplate(value, templates) {
  if (!value || typeof value !== "object") throw new Error("请先选择一个模版");
  const templateId = Number(value.id);
  const requestedName = typeof value.name === "string" ? value.name.trim() : "";
  if (!Number.isSafeInteger(templateId) || templateId <= 0 || !requestedName) {
    throw new Error("所选模版无效，请重新选择");
  }
  const template = Array.isArray(templates) ? templates.find((item) => item?.id === templateId) : null;
  if (!template || template.name !== requestedName) {
    throw new Error("所选模版不在当前目录中，请刷新后重新选择");
  }
  return { id: template.id, name: template.name };
}
