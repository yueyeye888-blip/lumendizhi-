import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function deriveAddress(privateKey) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "wallet-address.mjs")], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)));
    child.stdin.end(`${privateKey}\n`);
  });
}

test("derives the expected public address from a public test key", async () => {
  const result = await deriveAddress("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  assert.equal(result.address, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  assert.equal(result.chainId, 56);
});

test("local importer hides input and stores it with CurrentUser DPAPI", async () => {
  const source = await readFile(path.join(root, "scripts", "import-payer-wallet.ps1"), "utf8");
  assert.ok(source.includes('Read-Host "请输入新的专用钱包私钥（输入隐藏）" -AsSecureString'));
  assert.ok(source.includes("ConvertFrom-SecureString $normalizedSecure"));
  assert.ok(source.includes("payer-private-key.dpapi"));
  assert.ok(source.includes("/inheritance:r"));
  assert.ok(!source.includes("Write-Host $plainText"));
});

test("payment key reader only returns the DPAPI-decrypted key through stdout", async () => {
  const source = await readFile(path.join(root, "scripts", "read-payer-key.ps1"), "utf8");
  assert.ok(source.includes("ConvertTo-SecureString $encrypted"));
  assert.ok(source.includes("[Console]::Out.Write($plainText)"));
  assert.ok(source.includes("ZeroFreeBSTR"));
  assert.ok(!source.includes("Write-Host $plainText"));
});
