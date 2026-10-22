'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {basketDayIds,loadBasketDay,BASKET_DAY_KEY,type BasketDayContext} from '@/lib/institutionnel/basket-day-context';
export default function InstitutionalSessionBasketBanner(){
 const[context,setContext]=useState<BasketDayContext|null>(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;void(async()=>{try{const params=new URLSearchParams(window.location.search);let stored=null;try{stored=JSON.parse(sessionStorage.getItem(BASKET_DAY_KEY)||'null')}catch{};const ids=basketDayIds(params.has('institutionEventId')?{structureId:params.get('institutionId'),selectionId:params.get('selectionId'),eventId:params.get('institutionEventId')}:stored);if(!ids)return;try{sessionStorage.setItem(BASKET_DAY_KEY,JSON.stringify(ids))}catch{}const day=await loadBasketDay(ids);if(alive)setContext(day);}catch(e){if(alive)setError(e instanceof Error?e.message:'Journée indisponible.');}})();return()=>{alive=false};},[]);
 if(!context&&!error)return null;
 const query=context?new URLSearchParams({institutionId:context.structureId,selectionId:context.selectionId,institutionEventId:context.eventId}).toString():'';
 return <aside className="sessionBasketBanner">{context&&<><div><b>Séance · {context.title}</b><p>{context.team.name} · {context.date.split('-').reverse().join('/')} · Ajoute tes exercices au panier, puis organise et enregistre la séance.</p></div><Link href={'/panier?'+query}>Ouvrir le panier de la séance →</Link></>}{error&&<p role="alert">{error}</p>}<style jsx>{`.sessionBasketBanner{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;max-width:1200px;margin:18px auto;padding:15px 18px;border:1px solid #e1cdd2;border-radius:9px;background:#fcf7f9;color:#6b1a2c}.sessionBasketBanner b{font-size:.9rem}.sessionBasketBanner p{font-size:.78rem;line-height:1.5;margin:5px 0}.sessionBasketBanner :global(a){display:inline-block;background:#6b1a2c;color:white;border-radius:7px;padding:10px 13px;text-decoration:none;font-size:.8rem;font-weight:700}`}</style></aside>;
}
