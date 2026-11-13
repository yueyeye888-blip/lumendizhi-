import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  formatUnits,
  getAddress,
  keccak256,
  parseEther,
  parseUnits,
} from "ethers";

export const BSC_CHAIN_ID = 56;
export const BSC_USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
export const LIVE_PAYMENT_APPROVAL = "ENABLE_BSC_USDT_LIVE_PAYMENT";

const TOKEN_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

function decimalText(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(normalized)) {
    throw new Error(`${label}必须是最多 18 位小数的正数`);
  }
  if (parseUnits(normalized, 18) <= 0n) throw new Error(`${label}必须大于 0`);
  return normalized;
}

function safeError(error) {
  return String(error?.message || error || "未知错误")
    .replace(/0x[0-9a-fA-F]{64}/g, "[redacted]")
    .slice(0, 500);
}

export function normalizePaymentSettings(raw = {}, root = process.cwd()) {
  const mode = String(raw.paymentMode || "dry-run").trim().toLowerCase();
  if (!new Set(["off", "dry-run", "live"]).has(mode)) {
    throw new Error("paymentMode 只能是 off、dry-run 或 live");
  }
  const rpcUrl = String(raw.bscRpcUrl || "https://bsc-dataseed.bnbchain.org").trim();
  const parsedRpc = new URL(rpcUrl);
  if (parsedRpc.protocol !== "https:") throw new Error("BSC RPC 必须使用 HTTPS");
  const tokenContract = getAddress(raw.bscUsdtContract || BSC_USDT_CONTRACT);
  if (tokenContract !== getAddress(BSC_USDT_CONTRACT)) {
    throw new Error("BSC USDT 合约不在允许列表中");
  }
  const maxSingleUsdt = decimalText(raw.paymentMaxSingleUsdt || "5", "单笔上限");
  const maxDailyUsdt = decimalText(raw.paymentMaxDailyUsdt || "20", "24 小时上限");
  const minGasBnb = decimalText(raw.paymentMinGasBnb || "0.001", "最低 Gas BNB");
  if (parseUnits(maxDailyUsdt, 18) < parseUnits(maxSingleUsdt, 18)) {
    throw new Error("24 小时上限不能低于单笔上限");
  }
  return {
    mode,
    rpcUrl: parsedRpc.href,
    chainId: BSC_CHAIN_ID,
    tokenContract,
    maxSingleUsdt,
    maxDailyUsdt,
    minGasBnb,
    liveApproval: String(raw.paymentLiveApproval || ""),
    secretPath: path.join(root, "secrets", "payer-private-key.dpapi"),
    metadataPath: path.join(root, "secrets", "payer-wallet.json"),
    keyReaderPath: path.join(root, "scripts", "read-payer-key.ps1"),
    ledgerPath: path.join(root, "data", "payment-ledger.json"),
  };
}

export function validatePaymentIntent(profile, payment, settings) {
  if (!profile?.requestNo) throw new Error("缺少内部订单编号");
  if (!payment?.externalOrderNo) throw new Error("缺少 addrs.xyz 订单号");
  if (!/BEP20|BNB\s*Smart\s*Chain|\bBSC\b/i.test(String(payment.paymentNetwork || ""))) {
    throw new Error(`支付网络不是 BSC/BEP20：${payment.paymentNetwork || "未识别"}`);
  }
  const currency = String(payment.paymentCurrency || "").trim().toUpperCase();
  if (currency !== "USDT") throw new Error(`支付币种不是 USDT：${currency || "未识别"}`);
  const amount = decimalText(payment.paymentAmount, "支付金额");
  const amountUnits = parseUnits(amount, 18);
  const maxSingleUnits = parseUnits(settings.maxSingleUsdt, 18);
  if (amountUnits > maxSingleUnits) {
    throw new Error(`支付金额 ${amount} USDT 超过单笔上限 ${settings.maxSingleUsdt} USDT`);
  }
  let recipient;
  try {
    recipient = getAddress(String(payment.paymentAddress || "").trim());
  } catch {
    throw new Error("收款地址不是有效的 EVM 地址");
  }
  return {
    key: `${profile.requestNo}:${payment.externalOrderNo}`,
    requestNo: profile.requestNo,
    externalOrderNo: String(payment.externalOrderNo),
    externalOrderUrl: String(payment.externalOrderUrl || ""),
    recipient,
    amount,
    amountUnits,
    currency,
    network: String(payment.paymentNetwork),
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, filePath);
}

function decryptPrivateKey(settings) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        settings.keyReaderPath,
        "-SecretPath",
        settings.secretPath,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errorOutput += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const privateKey = output.trim();
      if (code !== 0) return reject(new Error(`无法解密付款钱包：${safeError(errorOutput)}`));
      if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
        return reject(new Error("解密程序未返回有效钱包密钥"));
      }
      return resolve(privateKey);
    });
  });
}

async function inspectOnChain(intent, settings) {
  const metadata = await readJson(settings.metadataPath, null);
  if (!metadata?.address) throw new Error("未找到已导入的付款钱包元数据");
  if (Number(metadata.chainId) !== BSC_CHAIN_ID) throw new Error("已导入钱包不是 BSC 主网配置");

  const provider = new JsonRpcProvider(settings.rpcUrl);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== BSC_CHAIN_ID) {
    throw new Error(`RPC 返回错误链 ID：${network.chainId}`);
  }
  const code = await provider.getCode(settings.tokenContract);
  if (code === "0x") throw new Error("BSC USDT 合约地址没有合约代码");

  let privateKey = await decryptPrivateKey(settings);
  let wallet;
  try {
    wallet = new Wallet(privateKey, provider);
  } finally {
    privateKey = null;
  }
  const expectedAddress = getAddress(String(metadata.address));
  if (wallet.address !== expectedAddress) throw new Error("加密钱包与公开地址元数据不匹配");
  if (wallet.address === intent.recipient) throw new Error("收款地址不能与付款钱包相同");

  const token = new Contract(settings.tokenContract, TOKEN_ABI, wallet);
  const [decimals, symbol, tokenBalance, bnbBalance, feeData] = await Promise.all([
    token.decimals(),
    token.symbol(),
    token.balanceOf(wallet.address),
    provider.getBalance(wallet.address),
    provider.getFeeData(),
  ]);
  if (Number(decimals) !== 18) throw new Error(`BSC USDT 合约精度异常：${decimals}`);
  if (String(symbol).toUpperCase() !== "USDT") throw new Error(`BSC USDT 合约代号异常：${symbol}`);

  const reasons = [];
  if (tokenBalance < intent.amountUnits) reasons.push("USDT 余额不足");
  const configuredMinGas = parseEther(settings.minGasBnb);
  let gasLimit = 0n;
  let gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
  let estimatedGasCost = 0n;
  if (tokenBalance >= intent.amountUnits) {
    try {
      gasLimit = await token.transfer.estimateGas(intent.recipient, intent.amountUnits);
      gasLimit = (gasLimit * 120n + 99n) / 100n;
      estimatedGasCost = gasLimit * gasPrice;
    } catch (error) {
      reasons.push(`无法估算 Gas：${safeError(error)}`);
    }
  }
  const requiredGas = estimatedGasCost > configuredMinGas ? estimatedGasCost : configuredMinGas;
  if (bnbBalance < requiredGas) reasons.push("BNB Gas 余额不足");

  return {
    public: {
      chainId: BSC_CHAIN_ID,
      walletAddress: wallet.address,
      tokenContract: settings.tokenContract,
      tokenSymbol: String(symbol),
      tokenDecimals: Number(decimals),
      usdtBalance: formatUnits(tokenBalance, Number(decimals)),
      bnbBalance: formatEther(bnbBalance),
      estimatedGasBnb: formatEther(estimatedGasCost),
      ready: reasons.length === 0,
      reasons,
    },
    execution: { provider, wallet, token, gasLimit, gasPrice },
  };
}

async function executeLiveTransfer(intent, context) {
  const { provider, wallet, token, gasLimit, gasPrice } = context;
  const transfer = await token.transfer.populateTransaction(intent.recipient, intent.amountUnits);
  const nonce = await provider.getTransactionCount(wallet.address, "pending");
  const transaction = await wallet.populateTransaction({
    ...transfer,
    chainId: BSC_CHAIN_ID,
    nonce,
    gasLimit,
    gasPrice,
  });
  const signedTransaction = await wallet.signTransaction(transaction);
  const transactionHash = keccak256(signedTransaction);
  return { signedTransaction, transactionHash, nonce };
}

function recentLiveTotal(ledger, now) {
  const cutoff = now - 24 * 60 * 60 * 1000;
  return Object.values(ledger.entries || {})
    .filter((entry) => ["signed", "broadcast", "confirmed"].includes(entry.state))
    .filter((entry) => Date.parse(entry.createdAt || 0) >= cutoff)
    .reduce((total, entry) => total + parseUnits(String(entry.amount), 18), 0n);
}

export async function processPayment({ profile, payment, settings }, dependencies = {}) {
  if (settings.mode === "off") return { mode: "off", skipped: true };
  const intent = validatePaymentIntent(profile, payment, settings);
  const inspect = dependencies.inspectOnChain || inspectOnChain;
  const execute = dependencies.executeLiveTransfer || executeLiveTransfer;
  const ledger = await readJson(settings.ledgerPath, { version: 1, entries: {} });
  const existing = ledger.entries?.[intent.key];
  if (settings.mode === "live" && existing && ["signed", "broadcast", "confirmed"].includes(existing.state)) {
    throw new Error(`该订单已存在付款记录（${existing.state}），已拒绝重复付款`);
  }
  if (settings.mode === "live" && settings.liveApproval !== LIVE_PAYMENT_APPROVAL) {
    throw new Error("实时付款缺少二次启用口令");
  }

  const chain = await inspect(intent, settings);
  const now = Date.now();
  const dailyTotal = recentLiveTotal(ledger, now);
  const dailyLimit = parseUnits(settings.maxDailyUsdt, 18);
  if (dailyTotal + intent.amountUnits > dailyLimit) {
    chain.public.ready = false;
    chain.public.reasons.push(`24 小时累计金额将超过 ${settings.maxDailyUsdt} USDT`);
  }

  const publicResult = {
    mode: settings.mode,
    requestNo: intent.requestNo,
    externalOrderNo: intent.externalOrderNo,
    amount: intent.amount,
    currency: intent.currency,
    recipient: intent.recipient,
    network: intent.network,
    maxSingleUsdt: settings.maxSingleUsdt,
    maxDailyUsdt: settings.maxDailyUsdt,
    ...chain.public,
  };

  if (settings.mode === "dry-run") {
    const dryRunKey = `dry-run:${intent.key}:${new Date(now).toISOString()}`;
    ledger.entries[dryRunKey] = {
      state: "dry-run",
      createdAt: new Date(now).toISOString(),
      requestNo: intent.requestNo,
      externalOrderNo: intent.externalOrderNo,
      walletAddress: chain.public.walletAddress,
      recipient: intent.recipient,
      amount: intent.amount,
      tokenContract: settings.tokenContract,
      ready: chain.public.ready,
      reasons: chain.public.reasons,
    };
    await writeJsonAtomic(settings.ledgerPath, ledger);
    return { ...publicResult, signed: false, broadcast: false };
  }

  if (!chain.public.ready) {
    throw new Error(`付款前置检查未通过：${chain.public.reasons.join("；")}`);
  }
  const prepared = await execute(intent, chain.execution);
  ledger.entries[intent.key] = {
    state: "signed",
    createdAt: new Date(now).toISOString(),
    requestNo: intent.requestNo,
    externalOrderNo: intent.externalOrderNo,
    walletAddress: chain.public.walletAddress,
    recipient: intent.recipient,
    amount: intent.amount,
    tokenContract: settings.tokenContract,
    transactionHash: prepared.transactionHash,
    nonce: prepared.nonce,
  };
  await writeJsonAtomic(settings.ledgerPath, ledger);

  const response = await chain.execution.provider.broadcastTransaction(prepared.signedTransaction);
  if (response.hash.toLowerCase() !== prepared.transactionHash.toLowerCase()) {
    throw new Error("广播返回的交易哈希与本地签名哈希不一致");
  }
  ledger.entries[intent.key].state = "broadcast";
  ledger.entries[intent.key].broadcastAt = new Date().toISOString();
  await writeJsonAtomic(settings.ledgerPath, ledger);
  const receipt = await chain.execution.provider.waitForTransaction(response.hash, 1, 180_000);
  if (!receipt || receipt.status !== 1) throw new Error("链上交易未成功确认");
  ledger.entries[intent.key].state = "confirmed";
  ledger.entries[intent.key].confirmedAt = new Date().toISOString();
  ledger.entries[intent.key].blockNumber = receipt.blockNumber;
  await writeJsonAtomic(settings.ledgerPath, ledger);
  return {
    ...publicResult,
    signed: true,
    broadcast: true,
    confirmed: true,
    transactionHash: response.hash,
    explorerUrl: `https://bscscan.com/tx/${response.hash}`,
  };
}
