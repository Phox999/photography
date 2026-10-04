import { assertMutation, endpoint, json, readJson, getSecretConfig, supabaseRequest, HttpError } from '../../../server/auth.js';
import { assertReceiptRequest, sha256 } from '../../../server/inquiry-workflow.js';
import { centerInput, centerResult, randomToken } from '../../../server/cooperation-center.js';
import { notificationChannels } from '../../../server/notifications.js';
export const onRequest=endpoint(async context=>{
 if(context.request.method!=='POST') return json({message:'不支援此操作。'},405,{Allow:'POST'});
 assertMutation(context.request);
 const url = new URL(context.request.url);
 const local = context.env.AUTH_ALLOW_LOCALHOST === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
 if (url.protocol !== 'https:' && !local) throw new HttpError(400, '預約中心需要 HTTPS 連線。', 'https_required');
 if (url.search) throw new HttpError(400, '請在頁面中輸入查詢代碼。', 'invalid_input');
 const body=await readJson(context.request,12288);
 let sessionToken='', galleryToken='', lineToken=''; let data;
 const call=async(name,args)=>(await supabaseRequest(getSecretConfig(context.env),`/rest/v1/rpc/${name}`,{method:'POST',body:args})).data;
 if(body.action==='open') {
 if(Object.keys(body).some(k=>!['action','reference'].includes(k))) throw new HttpError(400,'請檢查查詢代碼。','invalid_input');
 const reference=typeof body.reference==='string'?body.reference.trim().toUpperCase():null;
 if(reference!==null&&!/^PHOX-[A-F0-9]{20}$/.test(reference)) throw new HttpError(400,'請輸入完整的 PHOX 查詢代碼。','invalid_reference');
 const tokenHash=reference===null?await sha256(assertReceiptRequest(context)):null;
 sessionToken=randomToken();
 data=await call('open_cooperation_center',{p_reference:reference,p_token_hash:tokenHash,p_session_hash:await sha256(sessionToken)});
 } else {
 const tokenHash=await sha256(assertReceiptRequest(context)); const {action,version,input}=centerInput(body);
 if(['email','verifyEmail'].includes(action)&&!notificationChannels(context.env).includes('email') || action==='lineLink'&&!notificationChannels(context.env).includes('line')) throw new HttpError(503,'通知服務尚未啟用，請使用原聯絡方式。','notifications_unavailable');
 if(action==='email') { const bytes=crypto.getRandomValues(new Uint32Array(1)); const code=String(bytes[0]%1000000).padStart(6,'0'); input.code=code;input.hash=await sha256(code); }
 if(action==='verifyEmail') { input.hash=await sha256(input.code);delete input.code; }
 if(action==='lineLink') {lineToken=randomToken();input.hash=await sha256(lineToken);}
 if(action==='gallery') {galleryToken=randomToken();input.hash=await sha256(galleryToken);}
 data=await call('mutate_cooperation_center',{p_token_hash:tokenHash,p_action:action,p_version:version,p_input:input});
 }
 return json({...centerResult(data),...(sessionToken?{sessionToken}:{}),...(galleryToken?{galleryUrl:`/client/#token=${galleryToken}`} :{}),...(lineToken?{lineCode:`綁定 ${lineToken}`} :{}),notificationServices:{email:notificationChannels(context.env).includes('email'),line:notificationChannels(context.env).includes('line'),lineUrl:notificationChannels(context.env).includes('line')?context.env.LINE_BOT_URL:null}},200,{'X-Robots-Tag':'noindex, nofollow','Vary':'Authorization, Origin'});
});
