'use client';
import { useEffect,useState,useSyncExternalStore } from 'react';
const subscribeSupport=()=>()=>{};
const supportSnapshot=()=>typeof window!=='undefined'&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
function applicationKey(key:string):ArrayBuffer{const text=atob(key.replace(/-/g,'+').replace(/_/g,'/')),buffer=new ArrayBuffer(text.length),bytes=new Uint8Array(buffer);for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);return buffer}
export default function PushNotifications(){
 const[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 const supported=useSyncExternalStore(subscribeSupport,supportSnapshot,()=>false);
 useEffect(()=>{let active=true;const available=supportSnapshot();if(available)void navigator.serviceWorker.getRegistration('/').then(async registration=>{const sub=await registration?.pushManager.getSubscription();if(!sub)return;const r=await fetch(`/api/messages/push?endpoint=${encodeURIComponent(sub.endpoint)}`,{cache:'no-store'});const d=await r.json();if(active)setEnabled(Boolean(r.ok&&d.enabled))}).catch(()=>{});return()=>{active=false}},[]);
 async function toggle(){if(busy)return;setBusy(true);setNote('');try{
  const permission=enabled?'granted':await Notification.requestPermission();if(permission!=='granted')throw Error('Autorise les notifications dans les réglages de ton appareil.');
  const registration=await navigator.serviceWorker.register('/mybasket-sw.js',{scope:'/'});await navigator.serviceWorker.ready;
  if(enabled){const subscription=await registration.pushManager.getSubscription();if(subscription){const r=await fetch('/api/messages/push',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:subscription.endpoint})});if(!r.ok)throw Error('Désactivation impossible. Réessaie.');await subscription.unsubscribe()}setEnabled(false);return}
  // Permission is requested only as a direct consequence of this button click.
  const response=await fetch('/api/messages/push',{cache:'no-store'}),keys=await response.json();if(!response.ok)throw Error(keys.error||'Notifications indisponibles.');
  const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(keys.publicKey)});
  const r=await fetch('/api/messages/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON()})});const result=await r.json();if(!r.ok)throw Error(result.error||'Activation impossible.');setEnabled(true);setNote('Tu recevras une alerte à l’arrivée d’un message sur cet appareil.');
 }catch(error){setNote(error instanceof Error?error.message:'Activation impossible. Sur iPhone/iPad, installe MyBasket sur l’écran d’accueil.')}finally{setBusy(false)}}
 return <div className="push-notifications"><button disabled={!supported||busy} onClick={()=>void toggle()}>{busy?'Un instant…':enabled?'✓ Notifications activées · désactiver':'Activer les notifications sur cet appareil'}</button>{!supported&&<span>Sur iPhone/iPad, ouvre MyBasket depuis l’écran d’accueil pour activer les notifications.</span>}{note&&<span role="status">{note}</span>}<style jsx>{`.push-notifications{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0 20px}.push-notifications button{border:1px solid #e6dce2;border-radius:10px;padding:10px 14px;background:#fff;color:#6b1a2c;font-size:12px;font-weight:750;cursor:pointer}.push-notifications span{font-size:12px;color:#85717d}.push-notifications button:disabled{opacity:.5}`}</style></div>;
}
