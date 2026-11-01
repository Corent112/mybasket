/** Reject browser cross-site mutations, while allowing same-origin API calls without Origin. */
export function isSameOriginMutation(request:Request){
 const site=request.headers.get('sec-fetch-site');if(site==='cross-site')return false;
 const origin=request.headers.get('origin');if(!origin)return true;
 try{return new URL(origin).origin===new URL(request.url).origin}catch{return false}
}
