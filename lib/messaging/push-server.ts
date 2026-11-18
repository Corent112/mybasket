import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import * as webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MessagingAccessError } from './team-contacts';
// Private server-only objects. No SQL migration or public Storage policy is required.
const BUCKET='message-push-private';
type Subscription=webpush.PushSubscription;
type Registration={userId:string;subscription:Subscription};
export function validPushSubscription(value:unknown):value is Subscription{
 try{
  const s=value as Subscription;if(!s||typeof s.endpoint!=='string'||s.endpoint.length>4096)return false;
  const u=new URL(s.endpoint);const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!(hosts.includes(u.hostname)||u.hostname.endsWith('.notify.windows.com')))return false;
  if(!s.keys||typeof s.keys.auth!=='string'||typeof s.keys.p256dh!=='string'||!/^[\w-]+$/.test(s.keys.auth)||!/^[\w-]+$/.test(s.keys.p256dh))return false;
  const auth=Buffer.from(s.keys.auth,'base64url'),key=Buffer.from(s.keys.p256dh,'base64url');
  return auth.length===16&&key.length===65&&key[0]===4;
 }catch{return false}
}
const hash=(endpoint:string)=>createHash('sha256').update(endpoint).digest('hex');
function storageKey(){const secret=process.env.MESSAGE_PUSH_STORAGE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret)throw Error('Notifications indisponibles');return createHash('sha256').update('mybasket-message-push-v1:'+secret).digest()}
function encode(value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',storageKey(),iv),data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})}
function decode<T>(raw:string):T{const value=JSON.parse(raw);if(value.v!==1)throw Error('Notifications indisponibles');const cipher=createDecipheriv('aes-256-gcm',storageKey(),Buffer.from(value.iv,'base64'));cipher.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.data,'base64')),cipher.final()]).toString('utf8'))}

async function privateBucket(db:SupabaseClient,create=false){
 const result=await db.storage.getBucket(BUCKET);
 if(result.data){if(result.data.public)throw new MessagingAccessError('Les notifications sont temporairement indisponibles.',503);return db.storage.from(BUCKET)}
 if(!create)return null;
 const made=await db.storage.createBucket(BUCKET,{public:false,fileSizeLimit:16384,allowedMimeTypes:['application/json']});
 if(made.error){const retry=await db.storage.getBucket(BUCKET);if(!retry.data||retry.data.public)throw new MessagingAccessError('Les notifications ne peuvent pas être activées.',503)}
 return db.storage.from(BUCKET);
}
async function readJson<T>(bucket:NonNullable<Awaited<ReturnType<typeof privateBucket>>>,path:string):Promise<T|null>{
 const{data,error}=await bucket.download(path);if(error||!data)return null;return decode<T>(await data.text());
}
export async function pushKeys(db:SupabaseClient){
 const bucket=await privateBucket(db,true);if(!bucket)throw Error('Notifications indisponibles');
 const existing=await readJson<{publicKey:string;privateKey:string}>(bucket,'system/vapid.json');if(existing)return existing;
 const generated=webpush.generateVAPIDKeys();
 const{error}=await bucket.upload('system/vapid.json',encode(generated),{contentType:'application/json',upsert:false});
 if(!error)return generated;
 const winner=await readJson<typeof generated>(bucket,'system/vapid.json');if(winner)return winner;
 throw new MessagingAccessError('Les notifications ne peuvent pas être activées.',503);
}
export async function pushRegistered(db:SupabaseClient,userId:string,endpoint:string){
 const bucket=await privateBucket(db);if(!bucket)return false;
 const registered=await readJson<Registration>(bucket,`endpoints/${hash(endpoint)}.json`);
 const index=await readJson<{enabled:boolean}>(bucket,`users/${userId}/${hash(endpoint)}.json`);
 return registered?.userId===userId&&index?.enabled===true;
}
export async function registerPush(db:SupabaseClient,userId:string,subscription:Subscription){
 if(!validPushSubscription(subscription))throw new MessagingAccessError('Abonnement de notification invalide.',400);
 const bucket=await privateBucket(db,true);if(!bucket)throw Error('Notifications indisponibles');
 const id=hash(subscription.endpoint);
 const listed=await bucket.list(`users/${userId}`,{limit:21});if(listed.error)throw new MessagingAccessError('Notifications indisponibles.',503);
 if((listed.data?.length||0)>=20&&!listed.data?.some(row=>row.name===`${id}.json`))throw new MessagingAccessError('Limite de 20 appareils atteinte.',400);
 // The endpoint has one canonical owner; an account switch cannot deliver another user's messages.
 const owner=await bucket.upload(`endpoints/${id}.json`,encode({userId,subscription}),{contentType:'application/json',upsert:true});
 if(owner.error)throw new MessagingAccessError('Activation impossible.',503);
 const index=await bucket.upload(`users/${userId}/${id}.json`,encode({enabled:true}),{contentType:'application/json',upsert:true});
 if(index.error)throw new MessagingAccessError('Activation impossible.',503);
}
export async function unregisterPush(db:SupabaseClient,userId:string,endpoint:string){
 const bucket=await privateBucket(db);if(!bucket)return;
 const result=await bucket.remove([`users/${userId}/${hash(endpoint)}.json`]);
 if(result.error)throw new MessagingAccessError('Désactivation impossible.',503);
}
export async function sendMessagePush(db:SupabaseClient,userIds:string[],input:{title:string;conversationId:string}){
 try{
  const bucket=await privateBucket(db);if(!bucket)return;
  const keys=await readJson<{publicKey:string;privateKey:string}>(bucket,'system/vapid.json');if(!keys)return;
  const targets:Array<{userId:string;file:string;registration:Registration}>=[];
  await Promise.all([...new Set(userIds)].map(async userId=>{
   const files=await bucket.list(`users/${userId}`,{limit:20});
   await Promise.all((files.data||[]).filter(file=>/^[a-f0-9]{64}\.json$/.test(file.name)).map(async file=>{
    const registration=await readJson<Registration>(bucket,`endpoints/${file.name}`);
    if(registration?.userId===userId&&validPushSubscription(registration.subscription))targets.push({userId,file:file.name,registration});
   }));
  }));
  let cursor=0;const deadline=Date.now()+25_000;
  await Promise.all(Array.from({length:Math.min(8,targets.length)},async()=>{
   while(cursor<targets.length&&Date.now()<deadline){
    const {userId,file,registration}=targets[cursor++];
    try{await webpush.sendNotification(registration.subscription,JSON.stringify({title:input.title.slice(0,80),body:'Nouveau message sur MyBasket',userId,url:`/mon-compte?tab=messagerie&conversation=${input.conversationId}`,tag:`message-${input.conversationId}`}),{TTL:3600,timeout:3000,vapidDetails:{subject:'https://mybasket.vercel.app',...keys}})}
    catch(error){const status=(error as {statusCode?:number}).statusCode;if(status===404||status===410)await bucket.remove([`users/${userId}/${file}`])}
   }
  }));
 }catch{console.warn('Notification de message non distribuée ; le message reste disponible dans la messagerie.')}
}
