import { Wallet } from "ethers";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 256) throw new Error("私钥输入过长");
}

const privateKey = input.trim();
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("私钥格式无效，应为 0x 加 64 位十六进制字符");
}

const wallet = new Wallet(privateKey);
process.stdout.write(`${JSON.stringify({ address: wallet.address, chainId: 56 })}\n`);
