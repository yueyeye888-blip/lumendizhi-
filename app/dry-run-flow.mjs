import { readFile } from "node:fs/promises";

import { parsePersonalDetailsNotice } from "./lib/parser.mjs";
import { processPayment } from "./lib/payment.mjs";
import { loadConfig, runFill } from "./telegram-bot.mjs";

const messagePath = process.argv[2] || "sample-message.txt";
const message = await readFile(messagePath, "utf8");
const profile = parsePersonalDetailsNotice(message);
const config = await loadConfig();
if (config.paymentSettings.mode !== "dry-run") {
  throw new Error(`端到端预演只允许 dry-run，当前为 ${config.paymentSettings.mode}`);
}

const fillResult = await runFill(config, message);
const paymentResult = await processPayment({
  profile,
  payment: fillResult.payment,
  settings: config.paymentSettings,
});

console.log(JSON.stringify({
  ok: true,
  requestNo: profile.requestNo,
  selectedTemplate: fillResult.selectedTemplate,
  filledFields: fillResult.filledFields,
  payment: fillResult.payment,
  preflight: paymentResult,
}, null, 2));
