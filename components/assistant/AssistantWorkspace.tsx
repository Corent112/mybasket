'use client';
import { useState } from 'react';
import Link from 'next/link';
import CoachChatTab from '@/app/admin/connaissances-ia/tabs/CoachChatTab';
export default function AssistantWorkspace({configured}:{configured:boolean}){
 const[notice,setNotice]=useState('');
 return <main className="coach-assistant"><header><span>TON ASSISTANT MYBASKET</span><h1>Coach IA</h1><p>Prépare tes séances, pose une question basket et retrouve tes échanges.</p></header><nav aria-label="Outils du coach"><Link href="/plaquette?new=1">Scanner un schéma dans Dessin</Link><Link href="/montages">Ouvrir Montage</Link><Link href="/mon-compte?tab=messagerie">Contacter mon équipe</Link></nav>{notice&&<p role="status">{notice}</p>}{configured?<CoachChatTab openAiConfigured notify={message=>setNotice(message)}/>:<p role="status">L’assistant est temporairement indisponible. Tes autres outils restent accessibles.</p>}<style jsx>{`.coach-assistant{max-width:1440px;margin:auto;padding:32px 24px 60px}.coach-assistant header{margin-bottom:20px}.coach-assistant header>span{color:#9d773c;font-size:11px;letter-spacing:.15em;font-weight:800}.coach-assistant h1{font-size:34px;color:#6b1a2c;margin:8px 0}.coach-assistant p{font-size:14px;line-height:1.6}.coach-assistant nav{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}.coach-assistant nav :global(a){padding:11px 15px;border:1px solid #e6dae0;border-radius:12px;text-decoration:none;color:#6b1a2c;font-size:13px;background:#fff}@media(max-width:650px){.coach-assistant{padding:20px 14px}.coach-assistant nav{display:grid}}`}</style></main>;
}
