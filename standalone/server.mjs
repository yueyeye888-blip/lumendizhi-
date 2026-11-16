import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';import {pathToFileURL} from 'node:url';
const statuses=new Set(['filling','payment_pending','payment_confirmed','generating','delivered','failed']);
function authorized(header,key){if(!key||typeof header!=='string')return false;const a=Buffer.from(header.replace(/^Bearer\s+/i,'')),b=Buffer.from(key);return a.length===b.length&&timingSafeEqual(a,b);}
function profileOf(value){
 const p=value?.profile,template=value?.template?.name?.trim();if(!p||!Array.isArray(p.addressLines)||p.addressLines.length!==3||!template||template.length>120||/[\r\n]/.test(template))throw new Error('Invalid profile or template');
 const fullName=String(p.fullName||'').trim().replace(/\s+/g,' ');if(!/^[A-Za-z][A-Za-z .'-]{1,119}$/.test(fullName))throw new Error('Invalid name');
 const addressLines=p.addressLines.map(x=>{if(typeof x!=='string'||x.length>160||!/^[\x20-\x7e]*$/.test(x))throw new Error('Invalid address');return x.trim().replace(/\s+/g,' ');});
 const recipientEmail=String(p.recipientEmail||'').trim().toLowerCase();if(!addressLines[0]||recipientEmail.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))throw new Error('Invalid recipient');
 return {profile:{fullName,addressLines,recipientEmail},template:{name:template}};
}
export function createAddressServer(config,enqueue){
 if(!config.accessToken||!config.callbackToken||!config.database||!config.queueDirectory)throw new Error('Standalone configuration is incomplete');
 fs.mkdirSync(path.dirname(config.database),{recursive:true});const db=new DatabaseSync(config.database);
 db.exec(`PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS orders(request_no TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE NOT NULL,payload_hash TEXT NOT NULL,profile_json TEXT NOT NULL,template_name TEXT NOT NULL,status TEXT NOT NULL,status_message TEXT,error TEXT,external_order_no TEXT,external_order_url TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
 const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1');if(url.pathname==='/__host/health')return json(res,200,{ok:true});
   const callback=url.pathname==='/api/address-orders/callback';if(!authorized(req.headers.authorization,callback?config.callbackToken:config.accessToken))return json(res,401,{error:'Unauthorized'});
   if(req.method==='GET'&&/^\/api\/address-orders\/ADDR-\d{8}-[A-Z0-9]{8}$/.test(url.pathname)){
    const row=db.prepare('SELECT * FROM orders WHERE request_no=?').get(url.pathname.split('/').at(-1));if(!row)return json(res,404,{error:'Order not found'});const p=JSON.parse(row.profile_json);
    return json(res,200,{order:{requestNo:row.request_no,templateName:row.template_name,subjectName:p.fullName,recipientEmail:p.recipientEmail,status:row.status,statusMessage:row.status_message,error:row.error,externalOrderNo:row.external_order_no,createdAt:row.created_at,updatedAt:row.updated_at}});
   }
   if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
   const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>8192)return json(res,413,{error:'Body too large'});chunks.push(b);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return json(res,400,{error:'Invalid JSON'});}
   if(callback){
    if(!/^ADDR-\d{8}-[A-Z0-9]{8}$/.test(body.requestNo||'')||!statuses.has(body.status))return json(res,400,{error:'Invalid callback'});
    const row=db.prepare('SELECT * FROM orders WHERE request_no=?').get(body.requestNo);if(!row)return json(res,404,{error:'Order not found'});
    const clean=(s,n)=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n);
    const orderUrl=body.externalOrderUrl===undefined?row.external_order_url:(/^https:\/\/addrs\.xyz\/order\//.test(body.externalOrderUrl)?clean(body.externalOrderUrl,500):null);
    db.prepare('UPDATE orders SET status=?,status_message=?,error=?,external_order_no=?,external_order_url=?,updated_at=? WHERE request_no=?').run(body.status,clean(body.statusMessage,300),body.status==='failed'?clean(body.error||'Processing failed',500):null,body.externalOrderNo===undefined?row.external_order_no:clean(body.externalOrderNo,100),orderUrl,new Date().toISOString(),body.requestNo);
    return json(res,200,{ok:true});
   }
   if(url.pathname!=='/api/personal-details/submit')return json(res,404,{error:'Not found'});
   const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(key))return json(res,400,{error:'Idempotency-Key is required'});
   let snapshot;try{snapshot=profileOf(body);}catch(e){return json(res,400,{error:e.message});}
   const hash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');const existing=db.prepare('SELECT * FROM orders WHERE idempotency_key=?').get(key);
   if(existing)return json(res,existing.payload_hash===hash?200:409,existing.payload_hash===hash?{ok:true,requestNo:existing.request_no,deduplicated:true}:{error:'Idempotency key already used for different details'});
   const no='ADDR-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+randomUUID().slice(0,8).toUpperCase(),now=new Date().toISOString();
   db.prepare('INSERT INTO orders(request_no,idempotency_key,payload_hash,profile_json,template_name,status,status_message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(no,key,hash,JSON.stringify(snapshot.profile),snapshot.template.name,'queued','资料已提交，等待自动处理',now,now);
   try{await enqueue(config.queueDirectory,no,snapshot,snapshot.profile.recipientEmail);}
   catch{db.prepare("UPDATE orders SET status='failed',error=?,status_message=?,updated_at=? WHERE request_no=?").run('自动处理队列写入失败','自动处理队列写入失败',new Date().toISOString(),no);return json(res,503,{ok:false,requestNo:no,error:'Queue unavailable; do not submit with a different idempotency key'});}
   return json(res,202,{ok:true,requestNo:no});
  }catch{if(!res.headersSent)json(res,500,{error:'Internal service error'});else res.end();}
 });
 server.on('close',()=>db.close());return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=path.resolve(process.argv[2]||'standalone-config.private.json');const cfg=JSON.parse(fs.readFileSync(file,'utf8'));
 const {enqueueSiteOrder}=await import(pathToFileURL(path.join(path.dirname(file),'lib/site-order-queue.mjs')).href);
 const server=createAddressServer(cfg,enqueueSiteOrder);server.listen(cfg.port||8770,cfg.host||'127.0.0.1');
}
