import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { authorizeOutlookDevice, loadOutlookRelaySettings } from "./lib/outlook-relay.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, "runtime-config.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const settings = await loadOutlookRelaySettings({
  ...(config.outlookRelay || {}),
  enabled: true,
}, root);

if (!settings.mailbox || !settings.clientId) {
  throw new Error("请先在 runtime-config.json 中配置 outlookRelay.mailbox 和 outlookRelay.clientId");
}

console.log("");
console.log("Outlook 邮箱授权");
console.log(`邮箱：${settings.mailbox}`);
console.log("程序只申请读取邮件、标记邮件和发送品牌交付邮件所需的权限。");
console.log("");

const profile = await authorizeOutlookDevice(settings, ({ userCode, verificationUri }) => {
  console.log(`1. 打开：${verificationUri}`);
  console.log(`2. 输入代码：${userCode}`);
  console.log(`3. 使用 ${settings.mailbox} 登录并同意授权`);
  console.log("");
  console.log("等待授权完成……");
});

config.outlookRelay = {
  ...(config.outlookRelay || {}),
  enabled: true,
};
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log("");
console.log(`授权成功：${profile.displayName || settings.mailbox}`);
console.log("刷新令牌已使用 Windows DPAPI 加密保存，程序和日志不会记录明文。");
