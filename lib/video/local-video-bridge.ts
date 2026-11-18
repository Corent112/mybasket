import { fingerprintVideo, fingerprintsMatch } from '@/lib/local-match-project';
import { getLocalMatchVideo, setLocalMatchVideo } from '@/lib/local-video-registry';
const CHANNEL='mybasket-local-match-video-v1';
const pending=new Map<string,Promise<boolean>>();
let activeOwner:string|null=null;
/** Only same-origin tabs of the same signed-in account can exchange a selected local file. */
export function serveLocalMatchVideos(userId:string){
 activeOwner=userId;
 if(typeof BroadcastChannel==='undefined')return()=>{if(activeOwner===userId)activeOwner=null};
 const channel=new BroadcastChannel(CHANNEL);
 channel.onmessage=event=>{
  const data=event.data;if(data?.type!=='request'||data.userId!==userId||typeof data.matchId!=='string'||typeof data.requestId!=='string')return;
  const video=getLocalMatchVideo(data.matchId);if(!video?.file)return;
  channel.postMessage({type:'response',requestId:data.requestId,userId,matchId:data.matchId,file:video.file,fingerprint:video.fingerprint});
 };
 return()=>{channel.close();if(activeOwner===userId)activeOwner=null};
}
export function requestVideoFromOpenTabs(userId:string,matchId:string):Promise<boolean>{
 if(activeOwner!==userId)return Promise.resolve(false);
 if(getLocalMatchVideo(matchId))return Promise.resolve(true);
 if(typeof BroadcastChannel==='undefined')return Promise.resolve(false);
 const key=`${userId}:${matchId}`,existing=pending.get(key);if(existing)return existing;
 const result=new Promise<boolean>(resolve=>{
  const channel=new BroadcastChannel(CHANNEL),requestId=crypto.randomUUID();let done=false;
  const finish=(found:boolean)=>{if(done)return;done=true;clearTimeout(timer);channel.close();resolve(found)};
  const timer=setTimeout(()=>finish(false),4000);
  channel.onmessage=async event=>{
   const data=event.data;if(done||data?.type!=='response'||data.requestId!==requestId||data.userId!==userId||data.matchId!==matchId||!(data.file instanceof File))return;
   try{const fingerprint=await fingerprintVideo(data.file);if(done||activeOwner!==userId||!data.fingerprint||!fingerprintsMatch(fingerprint,data.fingerprint))return;setLocalMatchVideo({matchId,file:data.file,url:URL.createObjectURL(data.file),fingerprint});finish(true)}catch{finish(false)}
  };
  channel.postMessage({type:'request',requestId,userId,matchId});
 }).finally(()=>pending.delete(key));
 pending.set(key,result);return result;
}
