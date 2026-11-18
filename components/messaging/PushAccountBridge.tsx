'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type {AuthChangeEvent,Session} from '@supabase/supabase-js';
export default function PushAccountBridge(){
 useEffect(()=>{
  if(!('serviceWorker'in navigator))return;
  const db=createClient();let active=true,owner:string|null=null,revision=0;
  const sync=()=>{void navigator.serviceWorker.ready.then(registration=>{if(active)registration.active?.postMessage({type:'mybasket:push-owner',userId:owner})})};
  const initial=revision;void db.auth.getSession().then(({data}:{data:{session:Session|null}})=>{if(active&&initial===revision){owner=data.session?.user.id||null;sync()}});
  const{data:{subscription}}=db.auth.onAuthStateChange((_event:AuthChangeEvent,session:Session|null)=>{revision++;owner=session?.user.id||null;sync()});
  navigator.serviceWorker.addEventListener('controllerchange',sync);
  return()=>{active=false;subscription.unsubscribe();navigator.serviceWorker.removeEventListener('controllerchange',sync)};
 },[]);return null;
}
