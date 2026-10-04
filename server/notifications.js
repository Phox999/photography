import { getSecretConfig, supabaseRequest } from './auth.js';
export function notificationChannels(env) {
 const channels=[];
 if(env.RESEND_API_KEY && env.NOTIFICATION_FROM && !/[\r\n]/.test(env.NOTIFICATION_FROM)) channels.push('email');
 if(env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_CHANNEL_SECRET && /^https:\/\/line\.me\//.test(env.LINE_BOT_URL||'')) channels.push('line');
 return channels;
}
export async function deliverNotification(env,job,send=fetch) {
 let url,headers,body;
 if(job.channel==='email') {url='https://api.resend.com/emails';headers={'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Idempotency-Key':`cooperation/${job.id}`};body={from:env.NOTIFICATION_FROM,to:[job.destination],subject:job.kind==='verify'?'Phox999 通知驗證碼':'Phox999 預約進度更新',text:job.body};}
 else if(job.channel==='line') {url='https://api.line.me/v2/bot/message/push';headers={'Authorization':`Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,'X-Line-Retry-Key':job.id};body={to:job.destination,messages:[{type:'text',text:job.body}]};}
 else throw new Error('invalid_channel');
 const r=await send(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!r.ok && !(job.channel==='line' && r.status===409 && r.headers.get('x-line-accepted-request-id'))) throw new Error(`provider_${r.status}`);
}
export async function drainNotifications(env) {
 const channels=notificationChannels(env);if(!channels.length) return;
 const config=getSecretConfig(env);const lease=crypto.randomUUID();
 const call=(name,body)=>supabaseRequest(config,`/rest/v1/rpc/${name}`,{method:'POST',body});
 const {data}=await call('claim_cooperation_notifications',{p_channels:channels,p_lease_id:lease});
 if(!Array.isArray(data)) throw new Error('invalid_outbox');
 for(const job of data) {
 let success=false,error=null;
 try {await deliverNotification(env,job);success=true;} catch(e){error=/^provider_\d{3}$/.test(e?.message||'')?e.message:'delivery_unavailable';}
 await call('complete_cooperation_notification',{p_id:job.id,p_lease_id:lease,p_success:success,p_error:error});
 }
}
export async function verifyLineSignature(secret,raw,signature) {
 if(!secret || !/^[A-Za-z0-9+/]{43}=$/.test(signature||'')) return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),raw);
}
