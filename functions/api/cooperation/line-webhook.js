import { endpoint, json, HttpError, getSecretConfig, supabaseRequest } from '../../../server/auth.js';
import { sha256 } from '../../../server/inquiry-workflow.js';
import { verifyLineSignature } from '../../../server/notifications.js';
export const onRequest=endpoint(async context=>{
 if(context.request.method!=='POST') return json({message:'不支援此操作。'},405,{Allow:'POST'});
 if(!context.env.LINE_CHANNEL_SECRET) throw new HttpError(503,'通知尚未啟用。','not_configured');
 // Streaming bound applies even without Content-Length; signature covers raw bytes.
 const reader=context.request.body?.getReader();if(!reader) throw new HttpError(400,'無效通知。','invalid_input');
 const chunks=[];let size=0;
 try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new HttpError(413,'內容過大。','payload_too_large');}chunks.push(value);}} finally{reader.releaseLock();}
 const raw=new Uint8Array(size);let pos=0;for(const chunk of chunks){raw.set(chunk,pos);pos+=chunk.length;}
 if(!await verifyLineSignature(context.env.LINE_CHANNEL_SECRET,raw,context.request.headers.get('x-line-signature'))) throw new HttpError(403,'無效通知。','invalid_signature');
 let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new HttpError(400,'無效通知。','invalid_input');}
 if(!Array.isArray(body.events)||body.events.length>100) throw new HttpError(400,'無效通知。','invalid_input');
 for(const event of body.events) {
 const code=event.type==='message' && event.message?.type==='text' && event.source?.type==='user' ? /^綁定 ([a-f0-9]{64})$/.exec(event.message.text.trim()):null;
 if(code && /^U[a-f0-9]{32}$/.test(event.source.userId)) await supabaseRequest(getSecretConfig(context.env),'/rest/v1/rpc/bind_cooperation_line',{method:'POST',body:{p_link_hash:await sha256(code[1]),p_user_id:event.source.userId}});
 }
 return json({success:true});
});
