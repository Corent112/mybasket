"use client";

import { useMemo, useRef, useState } from "react";
import {
  exportGamePlanMontage,
  type GamePlanMontageExportItem,
} from "@/lib/gameplan-montage-export";
import type { ScoutImportItem } from "./GamePlanScoutingDataPicker";

export type GamePlanMontageItem = GamePlanMontageExportItem;

type SystemSource = { id: string; title: string; schemaImage?: string; section?: string };

function newId() {
  try { return crypto.randomUUID(); } catch { return `gp_${Date.now()}_${Math.random()}`; }
}

export default function GamePlanMontage({
  teamName,
  opponent,
  items,
  onChange,
  imports,
  systems,
}: {
  teamName: string;
  opponent: string;
  items: GamePlanMontageItem[];
  onChange: (items: GamePlanMontageItem[]) => void;
  imports: ScoutImportItem[];
  systems: SystemSource[];
}) {
  const [libraryTab, setLibraryTab] = useState<"clips" | "data" | "systems" | "media">("clips");
  const [selected, setSelected] = useState<string | null>(items[0]?.id || null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const current = items.find((x) => x.id === selected) || null;
  const clips = imports.filter((x) => x.kind === "clip");
  const data = imports.filter((x) => x.kind !== "clip");
  const duration = useMemo(() => items.reduce((sum, item) => sum + (item.type === "clip" ? Math.max(.25, Number(item.clipEnd || 0) - Number(item.clipStart || 0)) : Math.max(1, Number(item.duration || 3))), 0), [items]);

  const add = (item: GamePlanMontageItem) => {
    onChange([...items, item]);
    setSelected(item.id);
  };
  const patch = (id: string, next: Partial<GamePlanMontageItem>) => onChange(items.map((item) => item.id === id ? { ...item, ...next } : item));
  const remove = (id: string) => {
    onChange(items.filter((x) => x.id !== id));
    if (selected === id) setSelected(null);
  };
  const move = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const next = [...items];
    const from = next.findIndex((x) => x.id === fromId);
    const to = next.findIndex((x) => x.id === toId);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const addImport = (source: ScoutImportItem) => {
    if (source.kind === "clip") {
      add({ id:newId(), type:"clip", title:source.title, subtitle:source.subtitle, videoUrl:source.videoUrl, clipStart:source.clipStart || 0, clipEnd:source.clipEnd || (source.clipStart || 0) + 6 });
      return;
    }
    add({ id:newId(), type:"data", title:source.title, subtitle:source.subtitle, lines:source.lines || [], duration:4 });
  };

  const exportVideo = async () => {
    if (!items.length || exporting) return;
    setExporting(true); setProgress(0);
    try {
      const result = await exportGamePlanMontage(items, `game-plan-${teamName || "equipe"}-vs-${opponent || "adversaire"}`.replace(/[^a-z0-9_-]+/gi,"-"), setProgress);
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url; a.download = result.file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Export vidéo impossible.");
    } finally {
      setExporting(false); setTimeout(() => setProgress(null), 800);
    }
  };

  return <div className="gpm">
    <div className="gpm-head">
      <div><small>MONTAGE GAME PLAN</small><h3>{teamName || "Mon équipe"} <span>vs {opponent || "Adversaire"}</span></h3><p>Assemble clips, schémas, chiffres, images et titres. Glisse les blocs pour les réorganiser.</p></div>
      <div><span className="gpm-time">{Math.floor(duration/60)}:{String(Math.round(duration%60)).padStart(2,"0")}</span><button className="primary" onClick={exportVideo} disabled={!items.length || exporting}>{exporting ? `Export ${Math.round(progress || 0)}%` : "⬇ Exporter MP4"}</button></div>
    </div>

    <div className="gpm-workspace">
      <aside className="gpm-library">
        <nav>{(["clips","data","systems","media"] as const).map((key) => <button key={key} className={libraryTab===key?"on":""} onClick={() => setLibraryTab(key)}>{key === "clips" ? "Clips" : key === "data" ? "Données" : key === "systems" ? "Systèmes" : "Médias"}</button>)}</nav>
        <div className="gpm-liblist">
          {libraryTab === "clips" && clips.map((clip) => <LibraryRow key={clip.id} icon="🎬" title={clip.title} subtitle={clip.subtitle || "Clip scouting"} onAdd={() => addImport(clip)} />)}
          {libraryTab === "clips" && !clips.length && <Empty text="Ajoute des clips depuis l'onglet Scouting adverse." />}
          {libraryTab === "data" && data.map((d) => <LibraryRow key={d.id} icon={d.kind === "player" ? "👤" : d.kind === "system" ? "🏀" : d.kind === "shot" ? "🎯" : "📊"} title={d.title} subtitle={d.subtitle || "Donnée scouting"} onAdd={() => addImport(d)} />)}
          {libraryTab === "data" && !data.length && <Empty text="Sélectionne des tableaux dans « Ajouter depuis mes données »." />}
          {libraryTab === "systems" && systems.map((s) => <LibraryRow key={s.id} icon="✏️" title={s.title} subtitle={s.section || "Système du match"} image={s.schemaImage} onAdd={() => add({ id:newId(), type:"system", title:s.title, imageUrl:s.schemaImage, duration:4 })} />)}
          {libraryTab === "media" && <>
            <button className="gpm-create" onClick={() => add({ id:newId(), type:"title", title:"NOUVEAU TITRE", subtitle:"", duration:3 })}>＋ Titre</button>
            <button className="gpm-create" onClick={() => add({ id:newId(), type:"text", title:"POINT CLÉ", subtitle:"", lines:["Consigne 1"], duration:4 })}>＋ Texte</button>
            <button className="gpm-create" onClick={() => fileRef.current?.click()}>＋ Image</button>
            <input ref={fileRef} hidden type="file" accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const url = URL.createObjectURL(file);
              add({ id:newId(), type:"image", title:file.name.replace(/\.[^.]+$/, ""), imageUrl:url, duration:4 });
              e.currentTarget.value = "";
            }} />
          </>}
        </div>
      </aside>

      <main className="gpm-main">
        <div className="gpm-preview">
          {current ? <Preview item={current} /> : <div className="gpm-placeholder"><b>APERÇU</b><span>Sélectionne un bloc dans la timeline.</span></div>}
        </div>
        <div className="gpm-timeline-head"><b>TIMELINE</b><span>{items.length} élément{items.length>1?"s":""}</span></div>
        <div className="gpm-timeline">
          {items.map((item, index) => <button
            type="button"
            draggable
            key={item.id}
            className={`gpm-block ${selected===item.id?"on":""}`}
            onClick={() => setSelected(item.id)}
            onDragStart={() => setDragId(item.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId) move(dragId,item.id); setDragId(null); }}
          ><span className="num">{index+1}</span><i>{item.type === "clip" ? "🎬" : item.type === "system" ? "🏀" : item.type === "image" ? "🖼" : item.type === "data" ? "📊" : "T"}</i><b>{item.title}</b><small>{item.type === "clip" ? `${Math.max(.25,Number(item.clipEnd||0)-Number(item.clipStart||0)).toFixed(1)}s` : `${item.duration || 3}s`}</small></button>)}
          {!items.length && <div className="gpm-emptytimeline">Glisse ton scouting vers ici ou clique sur ＋.</div>}
        </div>
      </main>

      <aside className="gpm-editor">
        <h4>ÉDITION</h4>
        {current ? <>
          <label>Titre<input value={current.title} onChange={(e) => patch(current.id,{title:e.target.value})} /></label>
          <label>Sous-titre<input value={current.subtitle || ""} onChange={(e) => patch(current.id,{subtitle:e.target.value})} /></label>
          {current.type !== "clip" && <label>Durée (sec)<input type="number" min="1" max="30" value={current.duration || 3} onChange={(e) => patch(current.id,{duration:Number(e.target.value)||3})} /></label>}
          {current.type === "clip" && <div className="gpm-trim"><label>Début<input type="number" step=".1" value={current.clipStart || 0} onChange={(e) => patch(current.id,{clipStart:Number(e.target.value)})} /></label><label>Fin<input type="number" step=".1" value={current.clipEnd || 0} onChange={(e) => patch(current.id,{clipEnd:Number(e.target.value)})} /></label></div>}
          {(current.type === "text" || current.type === "data") && <label>Texte<textarea rows={7} value={(current.lines || []).join("\n")} onChange={(e) => patch(current.id,{lines:e.target.value.split("\n")})} /></label>}
          <button className="danger" onClick={() => remove(current.id)}>Supprimer du montage</button>
        </> : <p>Sélectionne un élément.</p>}
      </aside>
    </div>
    {progress != null && <div className="gpm-progress"><span style={{width:`${progress}%`}} /></div>}

    <style jsx>{`
      .gpm{background:#fff;border:1px solid #eadfce;border-radius:20px;overflow:hidden;box-shadow:0 14px 38px rgba(60,30,20,.07)}
      .gpm-head{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:17px 18px;border-bottom:1px solid #eee3d6;background:linear-gradient(180deg,#fff,#fffaf4)}.gpm-head small{color:#d4a24c;font-weight:950;letter-spacing:.08em}.gpm-head h3{margin:2px 0;color:#6b1a2c;font-size:1.3rem}.gpm-head h3 span{font-weight:500;color:#6d6260}.gpm-head p{margin:0;color:#8a7b73;font-size:.78rem}.gpm-head>div:last-child{display:flex;align-items:center;gap:9px}.gpm-time{font-weight:900;color:#6b1a2c}.primary{border:0;background:#6b1a2c;color:#fff;border-radius:10px;padding:9px 12px;font-weight:900;cursor:pointer}.primary:disabled{opacity:.45}
      .gpm-workspace{display:grid;grid-template-columns:250px minmax(0,1fr) 230px;min-height:620px}.gpm-library{border-right:1px solid #eee3d6;background:#fffaf4;min-width:0}.gpm-library nav{display:grid;grid-template-columns:1fr 1fr;padding:8px;gap:4px}.gpm-library nav button{border:0;background:#fff;border-radius:8px;padding:8px;font-size:.68rem;font-weight:900;color:#746a66;cursor:pointer}.gpm-library nav button.on{background:#6b1a2c;color:#fff}.gpm-liblist{padding:8px;display:grid;gap:6px;max-height:560px;overflow:auto}.gpm-create{border:1px dashed #d4a24c;background:#fff;color:#6b1a2c;border-radius:10px;padding:12px;font-weight:900;cursor:pointer;text-align:left}
      .gpm-main{padding:13px;min-width:0}.gpm-preview{aspect-ratio:16/9;background:#12080c;border-radius:14px;overflow:hidden;display:grid;place-items:center;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.18)}.gpm-placeholder{text-align:center}.gpm-placeholder b,.gpm-placeholder span{display:block}.gpm-placeholder b{color:#d4a24c}.gpm-placeholder span{font-size:.75rem;color:#b9adb0;margin-top:4px}.gpm-timeline-head{display:flex;justify-content:space-between;margin:14px 0 7px;font-size:.72rem;color:#6b1a2c}.gpm-timeline{display:flex;gap:6px;overflow:auto;padding:5px 2px 12px;min-height:105px}.gpm-block{position:relative;flex:0 0 138px;height:88px;border:1px solid #e4d8ca;background:#fff;border-radius:11px;padding:10px 8px 8px;text-align:left;cursor:grab;display:grid;grid-template-columns:25px 1fr;grid-template-rows:1fr auto;gap:3px}.gpm-block.on{border-color:#d4a24c;box-shadow:0 0 0 2px rgba(212,162,76,.18)}.gpm-block .num{position:absolute;top:4px;right:5px;font-size:.6rem;color:#aaa}.gpm-block i{font-style:normal;font-size:18px}.gpm-block b{font-size:.7rem;overflow:hidden;line-height:1.15}.gpm-block small{grid-column:2;font-size:.62rem;color:#8a7b73}.gpm-emptytimeline{width:100%;border:1px dashed #d8c8b8;border-radius:11px;display:grid;place-items:center;color:#9a8d86;font-size:.75rem}
      .gpm-editor{border-left:1px solid #eee3d6;padding:12px;background:#fbfaf8}.gpm-editor h4{color:#6b1a2c;margin:0 0 12px;font-size:.75rem}.gpm-editor label{display:block;color:#7b6f69;font-size:.66rem;font-weight:900;text-transform:uppercase;margin-bottom:10px}.gpm-editor input,.gpm-editor textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #ded4ca;background:#fff;border-radius:8px;padding:8px;margin-top:4px;font-family:inherit;color:#111;text-transform:none;font-weight:500}.gpm-trim{display:grid;grid-template-columns:1fr 1fr;gap:6px}.danger{width:100%;border:1px solid #d8a4aa;background:#fff;color:#9e1f35;border-radius:9px;padding:8px;font-weight:900;cursor:pointer}.gpm-progress{height:4px;background:#eee}.gpm-progress span{display:block;height:100%;background:#d4a24c;transition:width .2s}
      @media(max-width:1050px){.gpm-workspace{grid-template-columns:210px minmax(0,1fr)}.gpm-editor{grid-column:1/-1;border-left:0;border-top:1px solid #eee3d6;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.gpm-editor h4,.gpm-editor .danger{grid-column:1/-1}}
      @media(max-width:720px){.gpm-head{align-items:flex-start;flex-direction:column}.gpm-workspace{grid-template-columns:1fr}.gpm-library{border-right:0;border-bottom:1px solid #eee3d6}.gpm-liblist{max-height:260px}.gpm-editor{display:block}}
    `}</style>
  </div>;
}

function LibraryRow({ icon, title, subtitle, image, onAdd }: { icon:string; title:string; subtitle:string; image?:string; onAdd:()=>void }) {
  return <button className="lr" onClick={onAdd}>{image ? <img src={image} alt="" /> : <i>{icon}</i>}<span><b>{title}</b><small>{subtitle}</small></span><em>＋</em><style jsx>{`.lr{width:100%;border:1px solid #e9dfd4;background:#fff;border-radius:10px;padding:7px;display:grid;grid-template-columns:38px minmax(0,1fr) 20px;gap:7px;align-items:center;text-align:left;cursor:pointer}.lr:hover{border-color:#d4a24c}.lr img,.lr i{width:38px;height:31px;border-radius:6px;object-fit:cover;display:grid;place-items:center;background:#fff5df;font-style:normal}.lr b,.lr small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lr b{font-size:.7rem;color:#2c2628}.lr small{font-size:.6rem;color:#8a7b73;margin-top:2px}.lr em{font-style:normal;color:#6b1a2c;font-weight:900}`}</style></button>
}
function Empty({ text }: { text:string }) { return <div className="empty">{text}<style jsx>{`.empty{padding:24px 10px;text-align:center;color:#9b8c84;font-size:.7rem;line-height:1.5}`}</style></div>; }
function Preview({ item }: { item:GamePlanMontageItem }) {
  if ((item.type === "image" || item.type === "system") && item.imageUrl) return <div className="pv image"><img src={item.imageUrl} alt="" /><div><b>{item.title}</b><span>{item.subtitle}</span></div><style jsx>{`.pv{width:100%;height:100%;position:relative}.pv img{width:100%;height:100%;object-fit:cover}.pv>div{position:absolute;left:0;right:0;bottom:0;padding:18px;background:linear-gradient(transparent,rgba(10,5,8,.88));}.pv b,.pv span{display:block}.pv b{font-size:1.15rem}.pv span{font-size:.72rem;color:#ddd}`}</style></div>;
  if (item.type === "clip" && item.videoUrl) return <div className="pv clip"><video src={item.videoUrl} controls playsInline /><div><b>{item.title}</b></div><style jsx>{`.pv{width:100%;height:100%;position:relative}.pv video{width:100%;height:100%;object-fit:contain;background:#000}.pv>div{position:absolute;left:12px;bottom:10px;background:rgba(0,0,0,.7);border-radius:8px;padding:6px 9px;font-size:.75rem}`}</style></div>;
  return <div className="pv text"><small>MYBASKET · GAME PLAN</small><b>{item.title}</b>{item.subtitle && <span>{item.subtitle}</span>}{item.lines?.length ? <ul>{item.lines.slice(0,6).map((x,i)=><li key={i}>{x}</li>)}</ul> : null}<style jsx>{`.pv{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:50px;box-sizing:border-box;background:radial-gradient(circle at top,#6b1a2c,#12080c 70%)}small{color:#d4a24c;font-weight:900;letter-spacing:.1em}b{font-size:2rem;margin:10px 0 4px}span{color:#ddd}ul{text-align:left;line-height:1.7;margin-top:18px}`}</style></div>;
}
