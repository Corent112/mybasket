"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { exportPlaybookPdf, type PlaybookPdfExportOptions } from "@/lib/playbook-export";
import type { Playbook, PlaybookSystem } from "@/lib/playbook";

type Props = {
  playbook: Playbook;
  systems: PlaybookSystem[];
  counts: { total:number; demi:number; slob:number; blob:number; favoris:number };
  triggerLabel?: string;
};

type SortMode = "manual" | "man" | "zone" | "temps" | "profit";

const norm = (v: unknown) =>
  String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function defenseScore(s: PlaybookSystem, kind: "man"|"zone") {
  const hay = norm([s.title, s.description, ...(s.tags || [])].join(" "));
  if (kind === "zone") return /\bzone\b|2[- ]?3|3[- ]?2|1[- ]?3[- ]?1|1[- ]?2[- ]?2/.test(hay) ? 0 : 1;
  return /homme|man.?to.?man|h2h|individuelle/.test(hay) ? 0 : 1;
}

export default function PlaybookPdfExport({ playbook, systems, counts, triggerLabel="📄 Exporter PDF" }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [open,setOpen]=useState(false);
  const [perRow,setPerRow]=useState<1|2|3|4>(2);
  const [includeComments,setIncludeComments]=useState(true);
  const [includeNames,setIncludeNames]=useState(true);
  const [includePhaseNumbers,setIncludePhaseNumbers]=useState(true);
  const [selected,setSelected]=useState<Record<string,boolean>>({});
  const [comments,setComments]=useState<Record<string,string>>({});
  const [order,setOrder]=useState<string[]>([]);
  const [sortMode,setSortMode]=useState<SortMode>("manual");
  const [ppp,setPpp]=useState<Record<string,number>>({});
  const [dragId,setDragId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    setOrder(systems.map(s=>s.id));
    setSelected(Object.fromEntries(systems.map(s=>[s.id,true])));
    setComments(Object.fromEntries(systems.map(s=>[s.id,s.description || ""])));
  },[systems]);

  useEffect(()=>{
    if(!open || !playbook.id) return;
    let alive=true;
    (async()=>{
      const {data}=await supabase.from("match_actions").select("systeme_id,systeme_slot,action_type,shot_type,shot_result,ft_made").eq("playbook_id",playbook.id);
      if(!alive) return;
      const grouped:Record<string,{pts:number;poss:number}>={};
      for(const a of data || []){
        const key=String((a as any).systeme_id ?? (a as any).systeme_slot ?? "");
        if(!key) continue;
        grouped[key] ||= {pts:0,poss:0}; grouped[key].poss++;
        if((a as any).action_type==="tir" && (a as any).shot_result==="made") grouped[key].pts += (a as any).shot_type==="3PTS" ? 3 : (a as any).shot_type==="2PTS" ? 2 : 0;
        if((a as any).shot_type==="LF") grouped[key].pts += Number((a as any).ft_made ?? 0);
      }
      const next:Record<string,number>={};
      for(const s of systems){
        const g=grouped[s.system_id || ""] || grouped[s.id];
        if(g?.poss) next[s.id]=g.pts/g.poss;
      }
      setPpp(next);
    })();
    return()=>{alive=false};
  },[open,playbook.id,systems,supabase]);

  const byId=useMemo(()=>new Map(systems.map(s=>[s.id,s])),[systems]);
  const ordered=order.map(id=>byId.get(id)).filter(Boolean) as PlaybookSystem[];

  function quickSort(mode:SortMode){
    setSortMode(mode);
    if(mode==="manual") return;
    const original=new Map(order.map((id,i)=>[id,i]));
    const arr=[...order];
    arr.sort((a,b)=>{
      const A=byId.get(a)!, B=byId.get(b)!;
      if(mode==="profit") {
        const ap=ppp[a], bp=ppp[b];
        if(ap==null && bp==null) return (original.get(a)??0)-(original.get(b)??0);
        if(ap==null) return 1; if(bp==null) return -1;
        return bp-ap;
      }
      if(mode==="temps"){
        const at=(A.tags||[]).join(" · "), bt=(B.tags||[]).join(" · ");
        if(!at && bt) return 1; if(at && !bt) return -1;
        return at.localeCompare(bt,"fr") || ((original.get(a)??0)-(original.get(b)??0));
      }
      const ak=defenseScore(A,mode), bk=defenseScore(B,mode);
      return ak-bk || ((original.get(a)??0)-(original.get(b)??0));
    });
    setOrder(arr);
  }

  function drop(target:string){
    if(!dragId || dragId===target) return;
    const next=[...order]; const from=next.indexOf(dragId), to=next.indexOf(target);
    next.splice(from,1); next.splice(to,0,dragId); setOrder(next); setSortMode("manual"); setDragId(null);
  }

  async function generate(){
    const chosen=ordered.filter(s=>selected[s.id]);
    if(!chosen.length){ alert("Sélectionne au moins un système."); return; }
    setBusy(true);
    try{
      const options:PlaybookPdfExportOptions={
        courtsPerRow:perRow,
        includeComments,
        includeSystemNames:includeNames,
        includePhaseNumbers,
        comments,
        preserveOrder:true,
      };
      await exportPlaybookPdf(playbook,chosen,{...counts,total:chosen.length},options);
      setOpen(false);
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={()=>setOpen(true)}>{triggerLabel}</button>
    {open && <div className="px-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <div className="px-modal">
        <div className="px-head"><div><b>Préparer mon Playbook PDF</b><span>{playbook.title}</span></div><button onClick={()=>setOpen(false)}>×</button></div>
        <div className="px-grid">
          <section>
            <h3>Mise en page</h3>
            <label>Terrains par ligne</label>
            <div className="px-seg">{([1,2,3,4] as const).map(n=><button key={n} className={perRow===n?"on":""} onClick={()=>setPerRow(n)}>{n}</button>)}</div>
            <label className="px-check"><input type="checkbox" checked={includeNames} onChange={e=>setIncludeNames(e.target.checked)}/> Nom des systèmes</label>
            <label className="px-check"><input type="checkbox" checked={includePhaseNumbers} onChange={e=>setIncludePhaseNumbers(e.target.checked)}/> Numéro des phases</label>
            <label className="px-check"><input type="checkbox" checked={includeComments} onChange={e=>setIncludeComments(e.target.checked)}/> Commentaires</label>
            <h3>⚡ Ordre rapide</h3>
            <select value={sortMode} onChange={e=>quickSort(e.target.value as SortMode)}>
              <option value="manual">Ordre manuel</option>
              <option value="man">Homme à homme en premier</option>
              <option value="zone">Zone en premier</option>
              <option value="temps">Temps forts / tags</option>
              <option value="profit">Meilleure rentabilité (PPP)</option>
            </select>
            {sortMode==="profit" && <small>Les systèmes sans données restent après ceux disposant de statistiques.</small>}
          </section>
          <section className="px-order">
            <div className="px-orderhead"><h3>Ordre des systèmes</h3><button onClick={()=>setSelected(Object.fromEntries(systems.map(s=>[s.id,true])))}>Tout</button><button onClick={()=>setSelected({})}>Aucun</button></div>
            <p>Glisse-dépose pour ajuster l’ordre après un rangement rapide.</p>
            <div className="px-list">{ordered.map((s,i)=><div key={s.id} className="px-item" draggable onDragStart={()=>setDragId(s.id)} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(s.id)}>
              <div className="px-row">
                <span className="px-grip">☰</span>
                <input type="checkbox" checked={!!selected[s.id]} onChange={e=>setSelected(v=>({...v,[s.id]:e.target.checked}))}/>
                <b>{i+1}. {s.title}</b>
                {ppp[s.id]!=null && <em>{ppp[s.id].toFixed(2)} PPP</em>}
              </div>
              {includeComments && selected[s.id] && <textarea value={comments[s.id]??""} onChange={e=>setComments(v=>({...v,[s.id]:e.target.value}))} placeholder="Commentaire pour le PDF…"/>}
            </div>)}</div>
          </section>
        </div>
        <div className="px-foot"><span>{ordered.filter(s=>selected[s.id]).length} système(s) sélectionné(s)</span><button onClick={()=>setOpen(false)}>Annuler</button><button className="primary" disabled={busy} onClick={generate}>{busy?"Génération…":"Générer le PDF"}</button></div>
      </div>
      <style>{`
        .px-backdrop{position:fixed;inset:0;background:#0008;z-index:9999;display:grid;place-items:center;padding:20px}
        .px-modal{width:min(1050px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 25px 80px #0004;color:#26191d}
        .px-head,.px-foot{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #eee}.px-head>div{flex:1;display:flex;flex-direction:column}.px-head b{font-size:20px}.px-head span{color:#87777c}.px-head button{font-size:24px;border:0;background:none}
        .px-grid{display:grid;grid-template-columns:280px 1fr;gap:20px;padding:20px}.px-grid section:first-child{border-right:1px solid #eee;padding-right:20px}
        h3{margin:8px 0 12px}label{display:block;font-weight:800;font-size:12px;margin:12px 0 7px}.px-seg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.px-seg button{padding:10px;border:1px solid #ddd;background:#fff;border-radius:9px}.px-seg .on{background:#6B1A2C;color:#fff;border-color:#6B1A2C}.px-check{display:flex;gap:8px;align-items:center;font-weight:600}
        select{width:100%;padding:10px;border:1px solid #ddd;border-radius:9px;background:#fff}.px-orderhead{display:flex;align-items:center;gap:6px}.px-orderhead h3{margin-right:auto}.px-orderhead button{border:1px solid #ddd;background:#fff;border-radius:8px;padding:6px 9px}.px-order>p{font-size:12px;color:#87777c}.px-list{display:grid;gap:8px}.px-item{border:1px solid #e7dfe2;border-radius:11px;padding:10px;background:#fff}.px-row{display:flex;align-items:center;gap:8px}.px-row b{flex:1}.px-row em{font-size:11px;font-style:normal;background:#f3e3b4;padding:4px 7px;border-radius:99px}.px-grip{cursor:grab;color:#999}.px-item textarea{width:100%;min-height:58px;margin-top:8px;border:1px solid #e3dadd;border-radius:8px;padding:8px;resize:vertical}
        .px-foot{border-top:1px solid #eee;border-bottom:0;justify-content:flex-end;position:sticky;bottom:0;background:#fff}.px-foot span{margin-right:auto}.px-foot button{padding:10px 14px;border-radius:9px;border:1px solid #ddd;background:#fff;font-weight:800}.px-foot .primary{background:#6B1A2C;color:#fff;border-color:#6B1A2C}.px-foot .primary:disabled{opacity:.6}
        @media(max-width:760px){.px-grid{grid-template-columns:1fr}.px-grid section:first-child{border-right:0;border-bottom:1px solid #eee;padding-right:0;padding-bottom:15px}}
      `}</style>
    </div>}
  </>;
}
