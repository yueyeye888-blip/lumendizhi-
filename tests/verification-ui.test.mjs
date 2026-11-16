import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
const files=['selfhost/site/dist/client/_next/static/chunks/address-order-status-BTX-VmrS.js','selfhost/site/dist/server/ssr/_next/static/address-order-status-KUcGNkvB.js'];
for(const file of files)test('verification wait is visible even after the generic stale threshold: '+file,()=>{
 const text=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');const start=text.search(/function \w+\(\w+,\w+=Date.now\(\)\)/);const end=text.indexOf('var ',start);const fn=text.slice(start,end);const view=vm.runInNewContext('('+fn+')');
 const message='等待人工人机验证：请在服务器 Chrome 完成验证';const result=view({status:'filling',statusMessage:message,updatedAt:'2000-01-01',createdAt:'2000-01-01'});assert.equal(result.title,'等待人工验证');assert.equal(result.detail,message);
 assert.equal(view({status:'failed',error:'failure',statusMessage:message}).title,'订单处理失败');
});
