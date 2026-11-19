'use client';
import { useEffect,useRef } from 'react';
import type { PreviewVideo } from '@/lib/library/video-previews';
type Player={mute:()=>void;playVideo:()=>void;destroy:()=>void;getIframe:()=>HTMLIFrameElement};
type YouTube={Player:new(element:HTMLElement,options:{videoId:string;host:string;playerVars:Record<string,string|number>;events:{onReady:(event:{target:Player})=>void;onError:()=>void;onAutoplayBlocked:()=>void;onStateChange:(event:{data:number})=>void}})=>Player};
type VideoWindow=Window&{YT?:YouTube;onYouTubeIframeAPIReady?:()=>void};
let youtubeReady:Promise<YouTube>|null=null;
function youtubeAPI(){
 const browser=window as VideoWindow;if(browser.YT?.Player)return Promise.resolve(browser.YT);
 if(!youtubeReady)youtubeReady=new Promise((resolve,reject)=>{
  const previous=browser.onYouTubeIframeAPIReady;
  const timeout=window.setTimeout(()=>reject(Error('Aperçu indisponible')),10000);
  browser.onYouTubeIframeAPIReady=()=>{window.clearTimeout(timeout);try{previous?.()}finally{if(browser.YT?.Player)resolve(browser.YT);else reject(Error('Aperçu indisponible'))}};
  let script=document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
  if(!script){script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;document.head.appendChild(script)}
  script.addEventListener('error',()=>{window.clearTimeout(timeout);reject(Error('Aperçu indisponible'))},{once:true});
 });
 return youtubeReady;
}
export default function HoverVideo({source,title,onFailure}:{source:PreviewVideo;title:string;onFailure:()=>void}){
 const file=useRef<HTMLVideoElement>(null),container=useRef<HTMLDivElement>(null),failure=useRef(onFailure);
 useEffect(()=>{failure.current=onFailure},[onFailure]);
 const id=source.kind==='youtube'?source.id:'',url=source.kind==='file'?source.url:'';
 useEffect(()=>{
  let active=true,player:Player|undefined;const video=file.current,box=container.current;
  const preview = video || box;
  preview?.setAttribute('data-playing', 'false');
  const started = () => {
    if (active) preview?.setAttribute('data-playing', 'true');
  };
  const timeout = window.setTimeout(() => {
    if (active && preview?.getAttribute('data-playing') !== 'true') failure.current();
  }, 12000);
  video?.addEventListener('playing', started);
  if(url&&video){video.muted=true;void video.play()?.catch(()=>{if(active)failure.current()})}
  if(id&&box){const holder=document.createElement('div');box.appendChild(holder);void youtubeAPI().then(api=>{
   if(!active)return;
   player=new api.Player(holder,{videoId:id,host:'https://www.youtube-nocookie.com',playerVars:{autoplay:1,mute:1,controls:0,playsinline:1,loop:1,playlist:id,rel:0,fs:0,disablekb:1,origin:window.location.origin},events:{onReady:({target})=>{if(!active)return;target.mute();target.playVideo()},onError:()=>{if(active)failure.current()},onAutoplayBlocked:()=>{if(active)failure.current()},onStateChange:({data})=>{if(data===1)started()}}});
   player.getIframe().setAttribute('allow','autoplay; encrypted-media; picture-in-picture');
  }).catch(()=>{if(active)failure.current()})}
  return()=>{active=false;window.clearTimeout(timeout);video?.removeEventListener('playing',started);video?.pause();player?.destroy();box?.replaceChildren()};
 },[id,url]);
 return source.kind==='file'?<video ref={file} src={source.url} autoPlay muted playsInline loop preload="metadata" tabIndex={-1} aria-label={`Aperçu vidéo · ${title}`} onError={()=>failure.current()}/>:<div ref={container} aria-label={`Aperçu vidéo · ${title}`} />;
}
