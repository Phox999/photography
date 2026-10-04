import { assertMutation,endpoint,json,readJson,requireAdmin,supabaseRequest,HttpError } from '../../../../../server/auth.js';
import { allowMethods,parseId } from '../../../../../server/admin-validation.js';
import { centerResult } from '../../../../../server/cooperation-center.js';
import { notificationChannels } from '../../../../../server/notifications.js';
export const onRequest=endpoint(async context=>{
 const unsupported=allowMethods(context.request,['GET','PATCH']);if(unsupported)return unsupported;
 if(context.request.method==='PATCH') assertMutation(context.request);
 const {config,accessToken}=await requireAdmin(context);const id=parseId(context.params.id);
 const input=context.request.method==='PATCH'?await readJson(context.request,1024):{action:'read',version:null,galleryId:null};
 if(context.request.method==='PATCH' && (Object.keys(input).some(k=>!['action','version','galleryId'].includes(k)) || !['gallery','resolveChange'].includes(input.action) || !Number.isInteger(input.version)||input.version<0)) throw new HttpError(400,'資料格式不正確。','invalid_input');
 const galleryId=input.galleryId==null?null:parseId(input.galleryId);
 const {data}=await supabaseRequest(config,'/rest/v1/rpc/admin_cooperation_center',{method:'POST',accessToken,body:{p_inquiry_id:id,p_action:input.action,p_version:input.version,p_gallery_id:galleryId}});
 return json({item:data?centerResult(data):null,galleryId:data?.galleryId??null,notificationCounts:data?.notificationCounts??null,notificationServices:notificationChannels(context.env)});
});
