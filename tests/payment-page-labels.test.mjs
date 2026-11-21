import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../app/cdp-fill.mjs', import.meta.url), 'utf8');
const expression = source.match(/const payment = await evaluate\((`[\s\S]*?`)\);/)[1];
const parse = body => runInNewContext(runInNewContext(expression), {
  document: { title: '订单 EXAMPLE123', body: { innerText: body } },
  location: { href: 'https://example.invalid/order/EXAMPLE123' },
});

test('reads the precise amount on current and older checkout pages', () => {
  const address = '0x' + '1'.repeat(40);
  for (const label of ['本单精确金额', '支付金额']) {
    const page = ['订单剩余时间', '28:28', label, '2.03 USDT', '复制', '支付网络', 'BNB Smart Chain (BEP20)', '收款地址', address].join('\n');
    const payment = parse(page);
    assert.equal(payment.paymentAmount, '2.03');
    assert.equal(payment.paymentCurrency, 'USDT');
    assert.equal(payment.externalOrderNo, 'EXAMPLE123');
    assert.equal(payment.paymentNetwork, 'BNB Smart Chain (BEP20)');
    assert.equal(payment.paymentAddress, address);
  }
  assert.equal(parse('支付剩余时间\n28:28\n示例\n2.03 USDT').paymentAmount, '');
});
