import { spawn } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePersonalDetailsNotice } from "./lib/parser.mjs";
import { createVerificationProgress, fillFailureMessage } from "./lib/verification.mjs";
import { processSiteQueue } from "./lib/site-order-queue.mjs";
import { normalizePaymentSettings, processPayment } from "./lib/payment.mjs";
import {
  loadOutlookRelaySettings,
  queueOutlookDelivery,
  startOutlookRelay,
} from "./lib/outlook-relay.mjs";
import {
  isMessageAuthorized,
  messageFromUpdate,
  parseAllowedChatIds,
  statusChatIdFor,
} from "./lib/telegram.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(temporaryPath, filePath);
}

export async function loadConfig() {
  const configPath = process.env.SAFE_TG_CONFIG_PATH || path.join(root, "runtime-config.json");
  const fileConfig = await readJson(configPath);
  const token = process.env.TELEGRAM_BOT_TOKEN || fileConfig.telegramBotToken || "";
  const allowedChatIds = parseAllowedChatIds(
    process.env.TELEGRAM_ALLOWED_CHAT_IDS || fileConfig.allowedChatIds || []
  );
  const trustedSenderBotIds = parseAllowedChatIds(
    process.env.TELEGRAM_TRUSTED_SENDER_BOT_IDS || fileConfig.trustedSenderBotIds || []
  );
  const notifyChatId = String(
    process.env.TELEGRAM_NOTIFY_CHAT_ID || fileConfig.notifyChatId || ""
  ).trim();
  const targetUrl = process.env.TARGET_URL || fileConfig.targetUrl || "https://addrs.xyz";
  const cdpPort = Number(process.env.SAFE_DEMO_CDP_PORT || fileConfig.cdpPort || 9333);
  const orderCallbackUrl = String(
    process.env.ADDRESS_ORDER_CALLBACK_URL || fileConfig.orderCallbackUrl || ""
  ).trim();
  const orderCallbackToken = String(
    process.env.ADDRESS_ORDER_CALLBACK_TOKEN || fileConfig.orderCallbackToken || ""
  ).trim();
  const siteAccessToken = String(
    process.env.SITES_SERVICE_ACCESS_TOKEN || fileConfig.siteAccessToken || ""
  ).trim();

  if (!token) throw new Error("缺少 TELEGRAM_BOT_TOKEN");
  if (trustedSenderBotIds.size && !/^-?\d+$/.test(notifyChatId)) {
    throw new Error("配置了可信 Bot 发送者时，必须设置 TELEGRAM_NOTIFY_CHAT_ID");
  }
  if (!Number.isInteger(cdpPort) || cdpPort < 1 || cdpPort > 65535) {
    throw new Error("SAFE_DEMO_CDP_PORT 无效");
  }
  const parsedTarget = new URL(targetUrl);
  if (!['http:', 'https:'].includes(parsedTarget.protocol)) throw new Error("TARGET_URL 必须使用 HTTP(S)");
  if (Boolean(orderCallbackUrl) !== Boolean(orderCallbackToken)) {
    throw new Error("订单状态回调地址和令牌必须同时配置");
  }
  if (orderCallbackUrl && new URL(orderCallbackUrl).protocol !== "https:") {
    throw new Error("订单状态回调地址必须使用 HTTPS");
  }
  const paymentSettings = normalizePaymentSettings({
    paymentMode: process.env.PAYMENT_MODE || fileConfig.paymentMode || "dry-run",
    bscRpcUrl: process.env.BSC_RPC_URL || fileConfig.bscRpcUrl,
    bscUsdtContract: process.env.BSC_USDT_CONTRACT || fileConfig.bscUsdtContract,
    paymentMaxSingleUsdt: process.env.PAYMENT_MAX_SINGLE_USDT || fileConfig.paymentMaxSingleUsdt,
    paymentMinGasBnb: process.env.PAYMENT_MIN_GAS_BNB || fileConfig.paymentMinGasBnb,
    paymentLiveApproval: process.env.PAYMENT_LIVE_APPROVAL || fileConfig.paymentLiveApproval,
  }, root);
  const outlookRelay = await loadOutlookRelaySettings({
    enabled: process.env.OUTLOOK_RELAY_ENABLED ?? fileConfig.outlookRelay?.enabled,
    mailbox: process.env.OUTLOOK_RELAY_MAILBOX || fileConfig.outlookRelay?.mailbox,
    clientId: process.env.OUTLOOK_CLIENT_ID || fileConfig.outlookRelay?.clientId,
    brandName: process.env.OUTLOOK_BRAND_NAME || fileConfig.outlookRelay?.brandName,
    pollSeconds: process.env.OUTLOOK_POLL_SECONDS || fileConfig.outlookRelay?.pollSeconds,
  }, root);

  return {
    token,
    allowedChatIds,
    trustedSenderBotIds,
    notifyChatId,
    targetUrl: parsedTarget.href,
    cdpPort,
    orderCallbackUrl,
    orderCallbackToken,
    siteAccessToken,
    siteOrderQueueDirectory: fileConfig.siteOrderQueueDirectory || "",
    paymentSettings,
    outlookRelay,
  };
}

function telegramApi(config, method, payload, timeoutMs = 40_000) {
  return fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      throw new Error(`Telegram API ${method} 失败 (${response.status})`);
    }
    return body.result;
  });
}

async function reply(config, chatId, text, replyToMessageId) {
  await telegramApi(config, "sendMessage", {
    chat_id: chatId,
    text,
    reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
  });
}

async function updateOrderStatus(config, requestNo, payload) {
  if (!config.orderCallbackUrl) return;
  const response = await fetch(config.orderCallbackUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.orderCallbackToken}`,
      "content-type": "application/json",
      ...(config.siteAccessToken && new URL(config.orderCallbackUrl).hostname.endsWith('.chatgpt.site')
        ? { "OAI-Sites-Authorization": `Bearer ${config.siteAccessToken}` }
        : {}),
    },
    body: JSON.stringify({ requestNo, ...payload }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`订单状态回调失败 (${response.status})`);
}

export async function runFill(config, text, onProgress) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "safe-tg-message-"));
  const messagePath = path.join(temporaryDirectory, "message.txt");
  try {
    await writeFile(messagePath, text, { encoding: "utf8", mode: 0o600 });
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, "cdp-fill.mjs"), messagePath], {
        cwd: root,
        env: {
          ...process.env,
          TARGET_URL: config.targetUrl,
          SAFE_DEMO_CDP_PORT: String(config.cdpPort),
          ...(config.outlookRelay.active
            ? { ADDRS_DELIVERY_EMAIL: config.outlookRelay.mailbox }
            : {}),
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let output = "";
      let errorOutput = "";
      let settled = false;
      const progress = createVerificationProgress(onProgress);
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        progress.drain().then(callback);
      };
      const timeout = setTimeout(() => {
        child.kill();
        finish(() => reject(new Error("订单处理超过总等待时限，已停止；请管理员核对外部订单状态后再处理")));
      }, 840_000);
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        if (!settled) progress.write(chunk);
        errorOutput = (errorOutput + chunk).slice(-16384);
      });
      child.on("error", (error) => finish(() => reject(error)));
      child.on("close", (code) => {
        finish(() => {
          if (code === 0) {
            try {
              resolve(JSON.parse(output.trim()));
            } catch {
              reject(new Error("创建支付订单进程返回了无效结果"));
            }
          }
          else reject(new Error(fillFailureMessage(errorOutput, code)));
        });
      });
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function handleMessage(config, message) {
  const command = message.text.trim().split(/\s+/, 1)[0].split("@", 1)[0].toLowerCase();
  if (!message.senderIsBot && (command === "/chatid" || command === "/start")) {
    await reply(
      config,
      message.chatId,
      `当前 Chat ID：${message.chatId}\n收到“📩 新的个人资料提交”后，程序会自动填表、创建支付订单并执行当前付款模式（现为 dry-run）。`,
      message.messageId
    );
    return;
  }

  if (!isMessageAuthorized(message, config)) {
    if (!message.senderIsBot) {
      await reply(config, message.chatId, `此会话未获授权。Chat ID：${message.chatId}`, message.messageId);
    }
    return;
  }

  const statusChatId = statusChatIdFor(message, config);
  const replyToMessageId = statusChatId === message.chatId ? message.messageId : undefined;

  let profile;
  try {
    profile = parsePersonalDetailsNotice(message.text);
  } catch {
    await reply(config, statusChatId, "消息格式无法识别，未执行填表。", replyToMessageId);
    return;
  }

  if (message.senderIsBot && config.trustedSenderBotIds.has(message.senderId)) {
    await reply(config, statusChatId, message.text);
  }
  await updateOrderStatus(config, profile.requestNo, {
    status: "filling",
    statusMessage: "正在选择模版、自动填表并创建支付订单",
  });

  try {
    const result = await runFill(config, message.text, statusMessage =>
      updateOrderStatus(config, profile.requestNo, {status: "filling", statusMessage})
    );
    const payment = result?.payment || {};
    const paymentResult = await processPayment({
      profile,
      payment,
      settings: config.paymentSettings,
    });
    const isDryRun = paymentResult.mode === "dry-run";
    const isConfirmed = paymentResult.confirmed === true;
    await updateOrderStatus(config, profile.requestNo, {
      status: isConfirmed ? "payment_confirmed" : "payment_pending",
      statusMessage: isConfirmed
        ? "支付已确认，文件正在处理"
        : "支付信息已校验，文件正在处理",
      externalOrderNo: payment.externalOrderNo,
      externalOrderUrl: payment.externalOrderUrl,
      paymentAmount: payment.paymentAmount,
      paymentCurrency: payment.paymentCurrency,
      paymentNetwork: payment.paymentNetwork,
      paymentAddress: payment.paymentAddress,
    });
    await queueOutlookDelivery(config.outlookRelay, profile, payment);
    await reply(
      config,
      statusChatId,
      [
        isDryRun
          ? (paymentResult.ready ? "🧪 自动支付预演通过（未签名、未广播）" : "⚠️ 自动支付预演未通过（未签名、未广播）")
          : "✅ BSC USDT 支付已确认",
        "",
        `订单编号：${profile.requestNo}`,
        `addrs.xyz 订单：${payment.externalOrderNo || "未读取"}`,
        `支付金额：${payment.paymentAmount || "—"} ${payment.paymentCurrency || ""}`.trim(),
        `支付网络：${payment.paymentNetwork || "—"}`,
        `收款地址：${payment.paymentAddress || "—"}`,
        `付款钱包：${paymentResult.walletAddress || "—"}`,
        `USDT 余额：${paymentResult.usdtBalance || "—"}`,
        `BNB Gas 余额：${paymentResult.bnbBalance || "—"}`,
        ...(paymentResult.reasons?.length ? [`未通过原因：${paymentResult.reasons.join("；")}`] : []),
        ...(paymentResult.transactionHash ? [`交易哈希：${paymentResult.transactionHash}`, `链上查询：${paymentResult.explorerUrl}`] : []),
        "",
        isDryRun ? "dry-run 模式已确认：本次不会发起链上交易。" : "链上交易已获得 1 个区块确认。",
      ].join("\n"),
      replyToMessageId,
    );
  } catch (error) {
    await updateOrderStatus(config, profile.requestNo, {
      status: "failed",
      statusMessage: "自动处理失败，请联系管理员",
      error: error instanceof Error ? error.message : "自动处理失败",
    }).catch(() => {});
    throw error;
  }
}

export async function runBot() {
  const config = await loadConfig();
  const statePath = process.env.SAFE_TG_STATE_PATH || path.join(root, "telegram-offset.json");
  const state = await readJson(statePath, { offset: 0 });
  let offset = Number.isSafeInteger(state.offset) ? state.offset : 0;
  let stopped = false;
  let retryDelay = 1_000;

  process.once("SIGINT", () => { stopped = true; });
  process.once("SIGTERM", () => { stopped = true; });
  console.log(`[telegram-bot] started; allowed chats: ${config.allowedChatIds.size}`);
  const outlookRelay = startOutlookRelay(config.outlookRelay, {
    onDelivered: async (job) => {
      if (!job.telegramNotifiedAt) {
        if (!/^-?\d+$/.test(config.notifyChatId)) throw new Error("Telegram 交付通知 Chat ID 无效");
        await reply(
          config,
          config.notifyChatId,
          [
            "📧 文件已完成品牌邮箱交付",
            "",
            `订单编号：${job.requestNo}`,
            `addrs.xyz 订单：${job.externalOrderNo}`,
            `接收邮箱：${job.recipientEmail}`,
          ].join("\n"),
        );
        job.telegramNotifiedAt = new Date().toISOString();
      }
      if (!job.siteNotifiedAt) {
        await updateOrderStatus(config, job.requestNo, {
          status: "delivered",
          statusMessage: "文件已通过越大爷邮箱发送",
        });
        job.siteNotifiedAt = new Date().toISOString();
      }
    },
  });

  while (!stopped) {
    try {
      await processSiteQueue(config.siteOrderQueueDirectory, async (job) => {
        parsePersonalDetailsNotice(job.text);
        if (!config.allowedChatIds.has(config.notifyChatId)) throw new Error('Queue notification chat is not authorized');
        await handleMessage(config, { text: job.text, chatId: config.notifyChatId, senderId: config.notifyChatId, senderIsBot: false });
        console.log(`[site-queue] completed ${job.requestNo}`);
      }, async (requestNo, error) => {
        console.error(`[site-queue] failed ${requestNo}: ${error.message}`);
        await updateOrderStatus(config, requestNo, { status: 'failed', statusMessage: '自动处理失败，请联系管理员核查后重试', error: error.message }).catch(() => {});
      });
      const updates = await telegramApi(config, "getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "channel_post"],
      });
      retryDelay = 1_000;

      for (const update of updates) {
        const message = messageFromUpdate(update);
        try {
          if (message) await handleMessage(config, message);
        } catch (error) {
          console.error(`[telegram-bot] update ${update.update_id} failed: ${error.message}`);
          if (message && isMessageAuthorized(message, config)) {
            const statusChatId = statusChatIdFor(message, config);
            const replyToMessageId = statusChatId === message.chatId ? message.messageId : undefined;
            await reply(config, statusChatId, "自动处理失败，请检查服务器日志后重试。", replyToMessageId)
              .catch(() => {});
          }
        } finally {
          offset = update.update_id + 1;
          await writeJsonAtomic(statePath, { offset });
        }
      }
    } catch (error) {
      console.error(`[telegram-bot] polling failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
  outlookRelay.stop();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runBot();
}
