export type PreviewVideo = { kind:'youtube'; id:string } | { kind:'file'; url:string };
export function previewVideoSource(value:unknown):PreviewVideo|null{
 if(typeof value!=='string'||!value.trim())return null;
 const source=value.trim();
 if(source.startsWith('/')&&!source.startsWith('//'))return{kind:'file',url:source};
 if(/^blob:|^data:video\//i.test(source))return{kind:'file',url:source};
 try{
  const url=new URL(source);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;
  if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com','youtu.be','www.youtu.be'].includes(url.hostname)){
   const id=url.hostname.endsWith('youtu.be')?url.pathname.split('/')[1]:url.searchParams.get('v')||url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
   return id&&/^[\w-]{11}$/.test(id)?{kind:'youtube',id}:null;
  }
  return{kind:'file',url:source};
 }catch{return null}
}
/** Prefer an actual exercise video, then its exported drawing animation. No database read. */
export function libraryPreviewVideo(input:unknown):string|undefined{
 if(!input||typeof input!=='object')return;
 const row=input as Record<string,unknown>;
 const candidates=[...(Array.isArray(row.videos)?row.videos:[row.videos]),row.videoUrl,row.video_url,row.youtube_url,row.schemaVideo,row.schema_video];
 return candidates.find((value):value is string=>typeof value==='string'&&Boolean(previewVideoSource(value)));
}
