import { processPayment } from "./lib/payment.mjs";
import { loadConfig } from "./telegram-bot.mjs";

const config = await loadConfig();
if (config.paymentSettings.mode !== "dry-run") {
  throw new Error(`钱包预检只允许 dry-run，当前为 ${config.paymentSettings.mode}`);
}

const result = await processPayment({
  profile: { requestNo: "ADDR-20261114-WALLET01" },
  payment: {
    externalOrderNo: "LOCAL-WALLET-PREFLIGHT",
    externalOrderUrl: "",
    paymentAmount: "0.01",
    paymentCurrency: "USDT",
    paymentNetwork: "BSC (BEP20)",
    paymentAddress: "0x000000000000000000000000000000000000dEaD",
  },
  settings: config.paymentSettings,
});

console.log(JSON.stringify(result, null, 2));
