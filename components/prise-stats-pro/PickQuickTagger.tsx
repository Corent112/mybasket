'use client';
import { useMemo, useState } from 'react';
import type { PickPayload } from '@/lib/live-mutualization';

type P={id:string;num:number;name:string};
type Step='zone'|'handler'|'screener'|'outcome'|'coverage'|'review';
const ZONES=['top','side','angle','high','left','right'];
const OUTCOMES=['roll','pop','short-roll','slip','ghost','rescreen'];
const COVERAGES=['drop','switch','ice','hedge','trap','under','show','over'];
export default function PickQuickTagger({players,onSave,onClose}:{players:P[];onSave:(p:PickPayload)=>void|Promise<void>;onClose:()=>void}){
 const [step,setStep]=useState<Step>('zone'); const [zone,setZone]=useState(''); const [handler,setHandler]=useState(''); const [screener,setScreener]=useState(''); const [outcome,setOutcome]=useState<PickPayload['screenerOutcome']>(null); const [coverage,setCoverage]=useState<PickPayload['defenseCoverage']>(null);
 const available=useMemo(()=>players.filter(p=>p.id!==handler),[players,handler]); const player=(id:string)=>players.find(p=>p.id===id);
 const choose=(value:string,setter:(v:any)=>void,next:Step)=>{setter(value);setStep(next)};
 const chip=(label:string,active:boolean,onClick:()=>void)=><button type="button" onClick={onClick} style={{padding:'11px 13px',borderRadius:12,border:active?'2px solid #111':'1px solid #c9cdd3',background:active?'#111':'#fff',color:active?'#fff':'#111',fontWeight:850,cursor:'pointer'}}>{label}</button>;
 const title:Record<Step,string>={zone:'1 · ZONE DU PICK',handler:'2 · HANDLER',screener:"3 · POSEUR D’ÉCRAN",outcome:'4 · SORTIE DU POSEUR',coverage:'5 · COUVERTURE DÉFENSIVE',review:'PICK PRÊT · AVANT RÉSULTAT'};
 return <div style={{position:'fixed',inset:0,zIndex:10000,background:'rgba(0,0,0,.58)',display:'grid',placeItems:'center'}}><div style={{width:'min(720px,95vw)',maxHeight:'92vh',overflow:'auto',background:'#fff',borderRadius:20,padding:18,color:'#111',boxShadow:'0 24px 90px #0007'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><b style={{fontSize:21}}>PICK · MODE MUTUALISÉ</b><div style={{fontSize:12,opacity:.65}}>1 choix → étape suivante. Le résultat vient du Live Individuel.</div></div><button onClick={onClose}>✕</button></div>
  <div style={{display:'flex',gap:6,margin:'14px 0',flexWrap:'wrap'}}>{(['zone','handler','screener','outcome','coverage'] as Step[]).map((s,i)=><span key={s} style={{padding:'5px 9px',borderRadius:999,background:step===s?'#111':'#eef0f3',color:step===s?'#fff':'#555',fontSize:11,fontWeight:800}}>{i+1}</span>)}</div>
  <h3>{title[step]}</h3>
  {step==='zone'&&<div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{ZONES.map(x=>chip(x.toUpperCase(),zone===x,()=>choose(x,setZone,'handler')))}</div>}
  {step==='handler'&&<div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{players.map(p=>chip(`#${p.num} ${p.name}`,handler===p.id,()=>{setHandler(p.id);if(screener===p.id)setScreener('');setStep('screener') }))}</div>}
  {step==='screener'&&<div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{available.map(p=>chip(`#${p.num} ${p.name}`,screener===p.id,()=>choose(p.id,setScreener,'outcome')))}</div>}
  {step==='outcome'&&<div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{OUTCOMES.map(x=>chip(x.toUpperCase(),outcome===x,()=>choose(x,setOutcome,'coverage')))}</div>}
  {step==='coverage'&&<div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{COVERAGES.map(x=>chip(x.toUpperCase(),coverage===x,()=>choose(x,setCoverage,'review')))}{chip('INCONNUE',coverage===null,()=>{setCoverage(null);setStep('review')})}</div>}
  {step==='review'&&<div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:8,marginBottom:14}}>{[['ZONE',zone],['HANDLER',player(handler)?`#${player(handler)!.num} ${player(handler)!.name}`:handler],['SCREENER',player(screener)?`#${player(screener)!.num} ${player(screener)!.name}`:screener],['SORTIE',outcome||'—'],['DÉFENSE',coverage||'—']].map(([a,b])=><button type="button" key={a} onClick={()=>setStep(a==='ZONE'?'zone':a==='HANDLER'?'handler':a==='SCREENER'?'screener':a==='SORTIE'?'outcome':'coverage')} style={{textAlign:'left',padding:11,border:'1px solid #ddd',borderRadius:12,background:'#fafafa'}}><small>{a}</small><br/><b>{String(b).toUpperCase()}</b></button>)}</div><div style={{padding:12,borderRadius:12,background:'#f2f6ff',fontSize:13}}><b>Étape suivante : résultat.</b><br/>En mode mutualisé, le résultat individuel sera rattaché à ce Pick automatiquement quand la correspondance est fiable.</div></div>}
  <div style={{display:'flex',gap:8,marginTop:18}}><button type="button" onClick={()=>{const prev:Record<Step,Step>={zone:'zone',handler:'zone',screener:'handler',outcome:'screener',coverage:'outcome',review:'coverage'};setStep(prev[step])}} disabled={step==='zone'} style={{padding:12,borderRadius:11}}>← Retour</button><span style={{flex:1}}/>{step==='review'&&<button type="button" disabled={!zone||!handler||!screener||!outcome} onClick={()=>onSave({zone,handlerPlayerId:handler,screenerPlayerId:screener,rollerPlayerId:outcome==='roll'||outcome==='short-roll'||outcome==='slip'?screener:null,screenerOutcome:outcome,defenseCoverage:coverage})} style={{padding:'12px 18px',borderRadius:11,fontWeight:900,background:'#111',color:'#fff'}}>VALIDER → RÉSULTAT</button>}</div>
 </div></div>
}
