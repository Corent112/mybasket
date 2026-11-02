"use client";

import { useEffect, useState } from "react";
import InstitutionalFamilyForms from "./InstitutionalFamilyForms";
import InstitutionalPlayerWorkflow from "./InstitutionalPlayerWorkflow";
import InstitutionalSelectionsManager from "./InstitutionalSelectionsManager";
import InstitutionalPoleWorkspace from "./InstitutionalPoleWorkspace";

type Props = {structureId:string;structureType:"committee"|"league"|"federation"|"pole"};
type View="players"|"selections"|"partners"|"workflow";
export default function InstitutionalPlayersHub({structureId,structureType}:Props){
 const isPole=structureType==="league"||structureType==="pole";
 const [view,setView]=useState<View>("players");
 useEffect(()=>{setView("players")},[structureId]);
 useEffect(()=>{function open(event:Event){if((event as CustomEvent).detail?.structureId===structureId)setView("players");}window.addEventListener("mybasket:institution-polistes",open);return()=>window.removeEventListener("mybasket:institution-polistes",open)},[structureId]);
 if(!isPole)return <div><InstitutionalFamilyForms key={structureId} structureId={structureId}/><InstitutionalPlayerWorkflow structureId={structureId} structureType={structureType}/></div>;
 return <div className="institutionPlayers">
  <nav aria-label="Parcours des joueurs" className="tabs">{([["players","Polistes"],["selections","Sélections"],["partners","Équipes partenaires"],["workflow","Base · Détections · Événements"]] as const).map(([key,label])=><button key={key} type="button" aria-pressed={view===key} className={view===key?'active':''} onClick={()=>setView(key)}>{label}</button>)}</nav>
  {(view==="players"||view==="partners")&&<InstitutionalPoleWorkspace key={structureId} structureId={structureId} view={view}/>}
  {view==="selections"&&<InstitutionalSelectionsManager structureId={structureId} structureType={structureType} onOpenBase={()=>setView("workflow")}/>}
  {view==="workflow"&&<InstitutionalPlayerWorkflow structureId={structureId} structureType={structureType}/>}
  <details className="forms"><summary>Questionnaires de renseignements · QR codes</summary><InstitutionalFamilyForms key={structureId} structureId={structureId}/></details>
  <style jsx>{`.institutionPlayers{display:grid;gap:20px;min-width:0;padding-bottom:24px}.tabs{display:flex;gap:20px;flex-wrap:wrap;border-bottom:1px solid #eadfd8}.tabs button{border:0;border-bottom:3px solid transparent;background:transparent;color:#7a6b66;font-size:13px;font-weight:750;padding:12px 0;cursor:pointer}.tabs button.active{border-color:#6b1a2c;color:#6b1a2c}.forms{border:1px solid #eadfd8;border-radius:10px;padding:12px;background:#faf8f6}.forms summary{font-size:12px;color:#6b1a2c;font-weight:750;cursor:pointer}.forms[open] summary{margin-bottom:14px}@media(max-width:650px){.tabs{gap:12px}.tabs button{font-size:12px}}`}</style>
 </div>;
}
