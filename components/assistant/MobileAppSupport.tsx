'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export default function MobileAppSupport(){
 const pathname=usePathname();const[standalone,setStandalone]=useState(false);
 useEffect(()=>{
  const media=window.matchMedia('(display-mode: standalone)');const update=()=>setStandalone(media.matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone));update();media.addEventListener('change',update);
  if('serviceWorker'in navigator)void navigator.serviceWorker.register('/mybasket-sw.js',{scope:'/'}).catch(()=>{});
  return()=>media.removeEventListener('change',update);
 },[]);
 if(!standalone||pathname.startsWith('/plaquette')||pathname.includes('/editor')||pathname.startsWith('/prise-stats'))return null;
 return <><nav className="app-dock" aria-label="Navigation de l’application"><Link href="/application">Accueil</Link><Link href="/mon-compte?tab=equipes">Équipes</Link><Link href="/montages">Vidéo</Link><Link href="/mon-compte?tab=messagerie">Messages</Link></nav><style jsx>{`.app-dock{position:fixed;z-index:1000;bottom:0;left:0;right:0;display:flex;justify-content:space-around;background:#fff;border-top:1px solid #ded5dc;padding:12px 8px calc(12px + env(safe-area-inset-bottom));box-shadow:0 -4px 20px #21091310}.app-dock :global(a){color:#6b1a2c;font-size:12px;font-weight:800;text-decoration:none}.app-dock:before{content:'';position:fixed;pointer-events:none}@media(min-width:1000px){.app-dock{left:50%;right:auto;transform:translateX(-50%);width:600px;border:1px solid #ded5dc;border-radius:18px 18px 0 0}}`}</style><style jsx global>{`body:has(.app-dock){padding-bottom:calc(72px + env(safe-area-inset-bottom))}`}</style></>;
}
