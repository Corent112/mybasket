"use client";

import { useState } from "react";
import InstitutionalPlayerWorkflow from "@/components/institutionnel/InstitutionalPlayerWorkflow";
import InstitutionalSelectionsManager from "@/components/institutionnel/InstitutionalSelectionsManager";
import InstitutionalPoleRosterV3 from "@/components/institutionnel/InstitutionalPoleRosterV3";

type Props = {
  structureId: string;
  structureType: "committee" | "league" | "federation" | "pole";
};

type PoleView = "pole" | "selections" | "workflow";

export default function InstitutionalPlayersHub({ structureId, structureType }: Props) {
  const isPoleContext = structureType === "league" || structureType === "pole";
  const [poleView, setPoleView] = useState<PoleView>("pole");
  const [committeeView,setCommitteeView]=useState<"workflow"|"selections">("workflow");

  // Les comités conservent la base joueurs et accèdent aussi aux sélections reliées au calendrier.
  if (!isPoleContext) {
    return <div><nav style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><button type="button" style={{border:"1px solid #e4d7d1",borderRadius:20,padding:"10px 16px",fontWeight:800,cursor:"pointer",background:committeeView==="workflow"?"#6b1a2c":"#fff",color:committeeView==="workflow"?"#fff":"#6b1a2c"}} onClick={()=>setCommitteeView("workflow")} aria-pressed={committeeView==="workflow"}>Base joueurs · Détections</button><button type="button" style={{border:"1px solid #e4d7d1",borderRadius:20,padding:"10px 16px",fontWeight:800,cursor:"pointer",background:committeeView==="selections"?"#6b1a2c":"#fff",color:committeeView==="selections"?"#fff":"#6b1a2c"}} onClick={()=>setCommitteeView("selections")} aria-pressed={committeeView==="selections"}>Sélections</button></nav>{committeeView==="workflow"?<InstitutionalPlayerWorkflow structureId={structureId}/>:<InstitutionalSelectionsManager structureId={structureId} structureType={structureType}/>}</div>;
  }

  return (
    <div className="iph">
      <div className="iphHead">
        <div>
          <p>INSTITUTION · JOUEURS</p>
          <h2>Suivi Pôle & parcours joueur</h2>
          <span>L’effectif Pôle, les sélections et les fiches joueur restent reliés à une identité unique.</span>
        </div>
      </div>

      <nav className="iphTabs">
        <button className={poleView === "pole" ? "on" : ""} onClick={() => setPoleView("pole")}>Pôle · Polistes · Partenaires</button>
        <button className={poleView === "selections" ? "on" : ""} onClick={() => setPoleView("selections")}>Sélections</button>
        <button className={poleView === "workflow" ? "on" : ""} onClick={() => setPoleView("workflow")}>Base joueurs · Détection</button>
      </nav>

      {poleView === "pole" && <InstitutionalPoleRosterV3 structureId={structureId} />}
      {poleView === "selections" && <InstitutionalSelectionsManager structureId={structureId} structureType={structureType} />}
      {poleView === "workflow" && <InstitutionalPlayerWorkflow structureId={structureId} />}

      <style jsx>{`
        .iph{display:grid;gap:18px;padding-bottom:30px}
        .iphHead{padding:20px 22px;background:#fff;border:1px solid #e5eaf1;border-radius:14px;box-shadow:0 2px 10px rgba(30,64,175,.03)}
        .iphHead p{margin:0;color:#1765e5;font-size:.66rem;font-weight:900;letter-spacing:.12em}
        .iphHead h2{margin:5px 0 6px;color:#172341;font-size:1.35rem}
        .iphHead span{color:#7b889c;font-size:.8rem;line-height:1.5}
        .iphTabs{display:flex;gap:10px;overflow:auto;background:#fff;border:1px solid #e5eaf1;border-radius:12px;padding:0 10px}
        .iphTabs button{position:relative;white-space:nowrap;border:0;background:transparent;color:#5b6d88;padding:14px 4px 12px;font-weight:800;cursor:pointer}
        .iphTabs button.on{color:#1765e5}
        .iphTabs button.on:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:3px;background:#1765e5;border-radius:3px}
      `}</style>
    </div>
  );
}
