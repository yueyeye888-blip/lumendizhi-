import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BSC_USDT_CONTRACT,
  LIVE_PAYMENT_APPROVAL,
  normalizePaymentSettings,
  processPayment,
  validatePaymentIntent,
} from "../lib/payment.mjs";

const profile = { requestNo: "ADDR-20261114-DEMO1234" };
const payment = {
  externalOrderNo: "20261114ABCDEF123456",
  externalOrderUrl: "https://addrs.xyz/order/20261114ABCDEF123456",
  paymentAmount: "1.25",
  paymentCurrency: "USDT",
  paymentNetwork: "BSC (BEP20)",
  paymentAddress: "0x1111111111111111111111111111111111111111",
};

test("normalizes a dry-run BSC USDT payment configuration", () => {
  const settings = normalizePaymentSettings({}, "/tmp/example");
  assert.equal(settings.mode, "dry-run");
  assert.equal(settings.chainId, 56);
  assert.equal(settings.tokenContract, BSC_USDT_CONTRACT);
  assert.equal(settings.maxSingleUsdt, "5");
  assert.equal(settings.maxDailyUsdt, "20");
});

test("validates the exact BSC USDT payment intent and limits", () => {
  const settings = normalizePaymentSettings({}, "/tmp/example");
  const intent = validatePaymentIntent(profile, payment, settings);
  assert.equal(intent.amount, "1.25");
  assert.equal(intent.recipient, payment.paymentAddress);
  assert.throws(
    () => validatePaymentIntent(profile, { ...payment, paymentNetwork: "TRC20" }, settings),
    /BSC\/BEP20/,
  );
  assert.throws(
    () => validatePaymentIntent(profile, { ...payment, paymentAmount: "5.01" }, settings),
    /单笔上限/,
  );
});

test("dry-run inspects and records but never executes or broadcasts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "payment-dry-run-"));
  try {
    const settings = normalizePaymentSettings({ paymentMode: "dry-run" }, root);
    let executeCalls = 0;
    const result = await processPayment({ profile, payment, settings }, {
      inspectOnChain: async () => ({
        public: {
          chainId: 56,
          walletAddress: "0x2222222222222222222222222222222222222222",
          tokenContract: BSC_USDT_CONTRACT,
          tokenSymbol: "USDT",
          tokenDecimals: 18,
          usdtBalance: "2.0",
          bnbBalance: "0.01",
          estimatedGasBnb: "0.0001",
          ready: true,
          reasons: [],
        },
        execution: {},
      }),
      executeLiveTransfer: async () => { executeCalls += 1; },
    });
    assert.equal(result.mode, "dry-run");
    assert.equal(result.signed, false);
    assert.equal(result.broadcast, false);
    assert.equal(executeCalls, 0);
    const ledger = JSON.parse(await readFile(settings.ledgerPath, "utf8"));
    assert.equal(Object.values(ledger.entries)[0].state, "dry-run");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("live mode refuses to run without the explicit second approval", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "payment-live-gate-"));
  try {
    const settings = normalizePaymentSettings({ paymentMode: "live" }, root);
    await assert.rejects(
      processPayment({ profile, payment, settings }, {
        inspectOnChain: async () => { throw new Error("must not inspect"); },
      }),
      /二次启用口令/,
    );
    assert.notEqual(settings.liveApproval, LIVE_PAYMENT_APPROVAL);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
