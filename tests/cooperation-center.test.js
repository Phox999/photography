import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/cooperation/center.js';
import {onRequest as webhook} from '../functions/api/cooperation/line-webhook.js';
import {centerInput,centerResult} from '../server/cooperation-center.js';
import {deliverNotification,verifyLineSignature,notificationChannels} from '../server/notifications.js';
import {recommendPlan} from '../src/lib/plan-recommendation.js';
import {shootBrief} from '../src/lib/shoot-brief.js';
const token='a'.repeat(64);
const req=(body,headers={})=>new Request('https://example.test/api/cooperation/center',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json','X-Phox-Request':'1',Authorization:`Bearer ${token}`,...headers},body:JSON.stringify(body)});
test('center rejects cross-origin, query credentials and malformed changes before upstream access',async()=>{
 assert.equal((await onRequest({request:req({action:'open'},{Origin:'https://else.test'}),env:{}})).status,403);
 assert.equal((await onRequest({request:req({action:'open',reference:'PHOX-111'}),env:{}})).status,400);
 for(const body of [{action:'cancel',version:0,input:{confirm:false}},{action:'email',version:0,input:{email:'test@test.test\r\nBcc:test@test.test'}},{action:'lineLink',version:0,input:{userId:'fake'}},{action:'checklist',version:1,input:{checklist:{isAdmin:true}}},{action:'change',version:1,input:{preferredDate:'test',description:' '}},{action:'hold',version:0,input:{slotId:'anything'}}])assert.throws(()=>centerInput(body));
 const request=new Request('https://example.test/api/cooperation/center?token='+token,{method:'POST',headers:req({}).headers,body:JSON.stringify({action:'open'})});
 assert.equal((await onRequest({request,env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'}})).status,400);
});
test('notification providers use stable deduplication keys, bounded waits and no HTML interpolation',async()=>{
 const job={id:'11111111-1111-4111-8111-111111111111',destination:'test@example.test',channel:'email',kind:'status',body:'<script>private</script>'};
 const calls=[];const send=async(url,options)=>{calls.push({url,...options});return new Response('{}')};
 await deliverNotification({RESEND_API_KEY:'test',NOTIFICATION_FROM:'test@example.test'},job,send);
 assert.equal(calls[0].headers['Idempotency-Key'],`cooperation/${job.id}`);assert.equal(JSON.parse(calls[0].body).text,job.body);assert(!Object.hasOwn(JSON.parse(calls[0].body),'html'));
 await deliverNotification({LINE_CHANNEL_ACCESS_TOKEN:'test'},{...job,channel:'line',destination:'U'+'a'.repeat(32)},send);
 assert.equal(calls[1].headers['X-Line-Retry-Key'],job.id);
 await assert.rejects(deliverNotification({},job,async()=>new Response('{}',{status:429})),/provider_429/);
 await assert.rejects(deliverNotification({},{...job,channel:'line'},async()=>new Response('{}',{status:409})),/provider_409/);
 await deliverNotification({},{...job,channel:'line'},async()=>new Response('{}',{status:409,headers:{'x-line-accepted-request-id':'already-accepted'}}));
 assert.deepEqual(notificationChannels({}),[]);
});
test('LINE accepts only HMAC over the unchanged raw payload',async()=>{
 const secret='test-channel-secret';const raw=new TextEncoder().encode('{"events":[]}');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,raw))));
 assert.equal(await verifyLineSignature(secret,raw,signature),true);
 assert.equal(await verifyLineSignature(secret,new TextEncoder().encode('{"events": []}'),signature),false);
 const r=await webhook({request:new Request('https://example.test/api/cooperation/line-webhook',{method:'POST',headers:{'X-Line-Signature':signature},body:'{"events": []}'}),env:{LINE_CHANNEL_SECRET:secret}});assert.equal(r.status,403);
});
test('center response projects fields without exposing destinations, tokens, internal notes or draft confirmation',()=>{
 const data={reference:'PHOX-'+'A'.repeat(20),createdAt:new Date().toISOString(),status:'new',summary:{name:'Luna',collaborationType:'主題合作',preferredDate:null,description:'Sunset',referenceLinks:[]},confirmation:null,center:{version:0,checklist:{wardrobe:true},notifications:{email:true},email:'private@test.test',token_hash:'secret',admin_notes:'secret'},favorites:[],storage_path:'private'};
 const result=centerResult(data);const json=JSON.stringify(result);assert(!json.includes('private@test.test'));assert(!json.includes('secret'));assert(!json.includes('storage_path'));
 const brief=shootBrief(result);assert(brief.includes('尚未發布拍攝確認單'));assert(!brief.includes('private@test.test'));assert(brief.includes('待雙方確認'));
});
test('recommendation uses existing offers and names uncertain time constraints',()=>{
 assert.equal(recommendPlan({goal:'portrait',preparation:'exploring',time:'flexible'}).title,'一般互惠');
 assert.equal(recommendPlan({goal:'story',preparation:'exploring',time:'short'}).title,'主題企劃');
 assert.equal(recommendPlan({goal:'portrait',preparation:'ready',time:'flexible'}).value,'主題合作');
 assert.equal(recommendPlan({goal:'paid',preparation:'ready',time:'flexible'}),null);
});
