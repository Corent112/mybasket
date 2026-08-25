export type LocalVideoDescriptor = { version: 1; name: string; size: number; type: string; lastModified: number; duration: number | null; signature: string; };

function hex(buffer: ArrayBuffer) { return Array.from(new Uint8Array(buffer)).map((b)=>b.toString(16).padStart(2,"0")).join(""); }
async function digestBytes(bytes: ArrayBuffer) {
  if (globalThis.crypto?.subtle) return hex(await crypto.subtle.digest("SHA-256",bytes)).slice(0,32);
  const a=new Uint8Array(bytes); let h=2166136261; for(const b of a){h^=b;h=Math.imul(h,16777619)} return Math.abs(h>>>0).toString(16).padStart(8,"0");
}
async function sampledSignature(file: File) {
  const n=64*1024; const pts=[0,Math.max(0,Math.floor(file.size/2-n/2)),Math.max(0,file.size-n)];
  const chunks=await Promise.all(pts.map((s)=>file.slice(s,Math.min(file.size,s+n)).arrayBuffer()));
  const total=chunks.reduce((x,c)=>x+c.byteLength,0); const merged=new Uint8Array(total); let off=0;
  for(const c of chunks){merged.set(new Uint8Array(c),off);off+=c.byteLength} return digestBytes(merged.buffer);
}
async function readDuration(file: File): Promise<number|null> {
  if(typeof document==="undefined") return null;
  return new Promise((resolve)=>{const v=document.createElement("video"),u=URL.createObjectURL(file);v.preload="metadata";v.muted=true;
    const done=(x:number|null)=>{URL.revokeObjectURL(u);v.removeAttribute("src");v.load();resolve(x)};
    v.onloadedmetadata=()=>done(Number.isFinite(v.duration)?v.duration:null);v.onerror=()=>done(null);v.src=u;});
}
export async function buildLocalVideoDescriptor(file: File): Promise<LocalVideoDescriptor> {
  const [duration,signature]=await Promise.all([readDuration(file),sampledSignature(file)]);
  return {version:1,name:file.name,size:file.size,type:file.type||"video/*",lastModified:file.lastModified,duration:duration==null?null:Math.round(Math.max(0,duration)*10)/10,signature};
}
export function descriptorMatches(a:LocalVideoDescriptor,b:LocalVideoDescriptor){
  if(a.signature&&b.signature)return a.signature===b.signature;
  const durationClose=a.duration==null||b.duration==null||Math.abs(a.duration-b.duration)<=1.5; return a.size===b.size&&durationClose;
}
