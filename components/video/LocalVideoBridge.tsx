'use client';
import { useEffect } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { serveLocalMatchVideos } from '@/lib/video/local-video-bridge';
import { connectedMatchIds, removeLocalMatchVideo } from '@/lib/local-video-registry';
import { forgetSessionVideos } from '@/lib/video/video-library';
import { resetVideoLibraryOwner } from '@/lib/video/match-video-resolver';
export default function LocalVideoBridge(){
 useEffect(()=>{const db=createClient();let disposed=false,owner:string|null|undefined=undefined,stop=()=>{},revision=0;
 const attach=(id:string|null)=>{
  if(disposed||owner===id)return;stop();
  if(owner!==undefined&&owner!==id){connectedMatchIds().forEach(removeLocalMatchVideo);forgetSessionVideos()}
  resetVideoLibraryOwner();owner=id;stop=id?serveLocalMatchVideos(id):()=>{};
 };
 const initial=revision;void db.auth.getSession().then(({data}:{data:{session:Session|null}})=>{if(revision===initial)attach(data.session?.user.id||null)});
 const{data:{subscription}}=db.auth.onAuthStateChange((_event:AuthChangeEvent,session:Session|null)=>{revision++;attach(session?.user.id||null)});
 return()=>{disposed=true;subscription.unsubscribe();stop()};
 },[]);return null;
}
