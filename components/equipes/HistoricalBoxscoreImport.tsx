"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BOX_FIELDS, associateBoxRows, completeBoxStats, formatBoxMinutes, parseBoxMinutes, parseBoxTable, parsePdfBoxPage, type ImportedBoxRow, type ImportRosterPlayer } from "@/lib/historical-boxscores";

type Match = { id: string; opponent: string; match_date: string; source: string | null; minutes_by_player: Record<string,number|null> | null };
type MinuteRow = { player_id: string; minutes_seconds: number | null; present: boolean };
type Sheet = { name: string; rows: ImportedBoxRow[]; score?: number | null };
const blankRow = (): ImportedBoxRow => ({name:"",number:"",playerId:"",minutes:"",stats:{}});
const input = {border:"1px solid #dfd5d8",borderRadius:8,padding:"9px 10px",background:"white",color:"#21191b",minWidth:0};
const card = {border:"1px solid #e7dfe1",borderRadius:14,padding:16,background:"white"};
const field = {display:"grid",gap:5,fontSize:13,fontWeight:700} as const;

export default function HistoricalBoxscoreImport({teamId,teamName,roster,onSaved}:{teamId:string;teamName:string;roster:ImportRosterPlayer[];onSaved:()=>void}) {
  const supabase=useMemo(()=>createClient(),[]);
  const [mode,setMode]=useState<"import"|"minutes"|null>(null);
  const [sheets,setSheets]=useState<Sheet[]>([]);
  const [rows,setRows]=useState<ImportedBoxRow[]>([]);
  const [date,setDate]=useState("");
  const [opponent,setOpponent]=useState("");
  const [home,setHome]=useState(true);
  const [category,setCategory]=useState("");
  const [us,setUs]=useState("");
  const [them,setThem]=useState("");
  const [includeMinutes,setIncludeMinutes]=useState(true);
  const [matches,setMatches]=useState<Match[]>([]);
  const [selected,setSelected]=useState("");
  const [minutes,setMinutes]=useState<Record<string,string>>({});
  const [minuteRows,setMinuteRows]=useState<MinuteRow[]>([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [sheetIndex,setSheetIndex]=useState(0);
  const [fileName,setFileName]=useState("");
  const playerNames=useMemo(()=>new Map(roster.map(p=>[p.id,p.name])),[roster]);

  async function loadMatches(){
    const {data,error}=await supabase.from("match_stats").select("id,opponent,match_date,source,minutes_by_player:project_state->minutesByPlayer").eq("team_id",teamId).or("project_status.eq.completed,project_status.is.null").order("match_date",{ascending:false});
    if(error)throw error;
    setMatches(data as Match[]||[]);
  }
  useEffect(()=>{
    if(mode!=="minutes")return;
    let active=true;
    setLoading(true);
    loadMatches().catch(e=>{if(active)setError(e.message||"Impossible de charger les matchs.");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[mode,teamId,supabase]);

  function chooseSheet(sheet:Sheet,index:number,available=sheets){
    setSheetIndex(index);
    const total=(value:Sheet)=>Number.isInteger(value.score)&&Number(value.score)>=0?String(value.score):value.rows.every(row=>row.stats.pts!=null)
      ? String(value.rows.reduce((sum,row)=>sum+Number(row.stats.pts),0)) : "";
    setUs(total(sheet));
    setThem("");
    setOpponent("");
    if(available.length===2){
      const other=available[1-index];
      setThem(total(other));
      if(!/^Page \d+ · Tableau/.test(other.name))setOpponent(other.name);
    }
    setRows(associateBoxRows(sheet.rows,roster));
  }
  async function readFile(file:File){
    setBusy(true);setError("");setNotice("");
    setFileName(file.name);setRows([]);setSheets([]);setDate("");setOpponent("");setCategory("");setHome(true);setUs("");setThem("");
    try{
      let parsed:Sheet[]=[];
      if(/\.(xlsx?|csv)$/i.test(file.name)){
        if(file.size>20_000_000)throw new Error("Garde les feuilles de stats à importer (20 Mo maximum).");
        const XLSX=await import("xlsx");
        const book=XLSX.read(await file.arrayBuffer(),{type:"array",raw:/\.csv$/i.test(file.name),sheetRows:300});
        parsed=book.SheetNames.map(name=>({name,rows:parseBoxTable(XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name],{header:1,raw:false,defval:""}))})).filter(sheet=>sheet.rows.length);
      }else{
        let upload=file;
        let imageCanvas:HTMLCanvasElement|undefined;
        if(!/\.pdf$/i.test(file.name)){
          if(!file.type.startsWith("image/"))throw new Error("Choisis un PDF, une image, un fichier Excel ou CSV.");
          const bitmap=await createImageBitmap(file);
          try{
            const canvas=document.createElement("canvas"),scale=Math.min(1,2800/Math.max(bitmap.width,bitmap.height));
            imageCanvas=canvas;
            canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
            canvas.getContext("2d")?.drawImage(bitmap,0,0,canvas.width,canvas.height);
            const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.85));
            if(!blob)throw new Error("Image illisible.");
            upload=new File([blob],"statistiques.jpg",{type:"image/jpeg"});
          }finally{bitmap.close();}
        }
        if(upload.size>3_800_000)throw new Error("Le PDF est trop volumineux. Exporte uniquement les pages du match (3,8 Mo maximum).");
        const form=new FormData();
        form.append("teamId",teamId);
        form.append("file",upload);
        const response=await fetch("/api/teams/import-boxscore",{method:"POST",body:form}).catch(()=>null);
        const result=await response?.json().catch(()=>null)??{};
        if(!response?.ok||!Array.isArray(result.teams)||!result.teams.length){
          if(!imageCanvas)throw new Error(result.error||"Lecture impossible.");
          const {ocrCanvas,releaseOcr}=await import("@/lib/import/ocr");
          try{
            const recognized=await ocrCanvas(imageCanvas);
            const heights=recognized.words.map(word=>word.y1-word.y0).sort((a,b)=>a-b);
            const scale=8/Math.max(1,heights[Math.floor(heights.length/2)]||8);
            const tables=parsePdfBoxPage(recognized.words.filter(word=>word.confidence>=.45).map(word=>({
              str:word.text,x:word.x0*scale,y:-(word.y0+word.y1)/2*scale,width:(word.x1-word.x0)*scale
            })));
            if(!tables.length)throw new Error("Aucun tableau lisible. Essaie une capture recadrée sur les statistiques ou un export PDF/Excel.");
            result.teams=tables.map((rows,i)=>({name:`Page 1 · Tableau ${i+1}`,rows}));
          }finally{await releaseOcr();}
        }
        parsed=(Array.isArray(result.teams)?result.teams:[]).slice(0,8).map((sheet:any)=>({
          name:String(sheet.name||"Équipe"),score:Number.isInteger(sheet.score)?sheet.score:null,rows:(Array.isArray(sheet.rows)?sheet.rows:[]).slice(0,100).map((r:any)=>{
            const stats:ImportedBoxRow["stats"]={};
            for(const [key] of BOX_FIELDS)if(r.stats?.[key]!=null&&(key==="plus_minus"?/^[+-]?\d+$/.test(String(r.stats[key])):/^\d+$/.test(String(r.stats[key]))))stats[key]=String(r.stats[key]);
            return {name:String(r.name||""),number:String(r.number??""),playerId:"",minutes:String(r.minutes??""),present:r.present!==false,stats:completeBoxStats(stats)};
          }).filter((r:ImportedBoxRow)=>r.name)
        })).filter((sheet:Sheet)=>sheet.rows.length);
        if(typeof result.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(result.date))setDate(result.date);
      }
      if(!parsed.length)throw new Error("Aucune ligne de joueur reconnue. Vérifie les colonnes Joueur et PTS ou utilise la saisie manuelle.");
      const scores=parsed.map(sheet=>associateBoxRows(sheet.rows,roster).filter(row=>row.playerId).length);
      const best=scores.indexOf(Math.max(...scores));
      setSheets(parsed);chooseSheet(parsed[best],best,parsed);
      setNotice(scores[best]===0?"Aucun joueur reconnu automatiquement. Sélectionne la bonne feuille et associe les lignes.": "Vérifie les joueurs et les scores, puis confirme la création du match.");
    }catch(e){setError(e instanceof Error?e.message:"Lecture du fichier impossible.");}
    finally{setBusy(false);}
  }

  function updateRow(index:number,patch:Partial<ImportedBoxRow>){setRows(current=>current.map((row,i)=>i===index?{...row,...patch}:row));}
  async function save(){
    setError("");setNotice("");setBusy(true);
    try{
      if(!date||!opponent.trim()||!category||!/^\d+$/.test(us)||!/^\d+$/.test(them))throw new Error("Renseigne la date, l’adversaire, la compétition et les deux scores.");
      if(!rows.length||rows.some(row=>!row.playerId||!playerNames.has(row.playerId))||new Set(rows.map(row=>row.playerId)).size!==rows.length)throw new Error("Associe chaque ligne à un joueur différent de l’équipe.");
      const payload=rows.map(row=>{
        const stats=Object.fromEntries(BOX_FIELDS.map(([key,label])=>{
          if(row.present===false)return [key,key==="plus_minus"?null:0];
          const value=row.stats[key];
          if(key==="plus_minus"&&!value)return [key,null];
          if(!value||!(key==="plus_minus"?/^[+-]?\d{1,4}$/:/^\d{1,4}$/).test(value))throw new Error(`${playerNames.get(row.playerId)} : renseigne ${label}. Saisis 0 si la feuille confirme zéro.`);
          return [key,Number(value)];
        }));
        if(row.present!==false&&Number(stats.pts)!==2*Number(stats.p2m)+3*Number(stats.p3m)+Number(stats.ftm))throw new Error(`${playerNames.get(row.playerId)} : les points ne correspondent pas aux paniers réussis.`);
        if(row.present!==false&&Number(stats.reb)!==Number(stats.off_reb)+Number(stats.def_reb))throw new Error(`${playerNames.get(row.playerId)} : le total des rebonds est incohérent.`);
        if([[stats.p2m,stats.p2a],[stats.p3m,stats.p3a],[stats.ftm,stats.fta]].some(([m,a])=>Number(m)>Number(a)))throw new Error("Un nombre de tirs réussis dépasse les tentatives.");
        return {...stats,player_id:row.playerId,present:row.present!==false,minutes_seconds:row.present!==false&&includeMinutes?parseBoxMinutes(row.minutes):null};
      });
      const {error}=await supabase.rpc("import_historical_boxscore",{p_team:teamId,p_date:date,p_opponent:opponent.trim(),p_home:home,p_category:category,p_us:Number(us),p_them:Number(them),p_rows:payload});
      if(error)throw new Error(error.message);
      setRows([]);setSheets([]);setDate("");setOpponent("");setUs("");setThem("");setCategory("");setFileName("");
      setNotice("Match importé. Les statistiques de l’équipe et des joueurs sont enregistrées.");
      onSaved();
    }catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.");}
    finally{setBusy(false);}
  }

  async function selectMatch(id:string){
    setSelected(id);setMinutes({});setMinuteRows([]);setError("");setNotice("");
    if(!id)return;
    setBusy(true);
    try{
      const {data,error}=await supabase.from("match_player_stats").select("player_id,minutes_seconds,present").eq("team_id",teamId).eq("match_id",id);
      if(error)throw new Error(error.message);
      const list=(data||[]) as MinuteRow[];
      const state=matches.find(m=>m.id===id)?.minutes_by_player;
      setMinuteRows(list);setMinutes(Object.fromEntries(list.map(row=>[row.player_id,formatBoxMinutes(state?.[row.player_id]??row.minutes_seconds)])));
    }catch(e){setError(e instanceof Error?e.message:"Chargement impossible.");}
    finally{setBusy(false);}
  }
  async function saveMinutes(){
    setBusy(true);setError("");setNotice("");
    try{
      const payload=minuteRows.filter(row=>row.present).map(row=>({player_id:row.player_id,minutes_seconds:parseBoxMinutes(minutes[row.player_id]||"")}));
      const {error}=await supabase.rpc("edit_historical_boxscore_minutes",{p_team:teamId,p_match:selected,p_rows:payload});
      if(error)throw new Error(error.message);
      setNotice("Temps de jeu enregistrés.");onSaved();await loadMatches();
    }catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.");}
    finally{setBusy(false);}
  }
  return <section className="tl-card" style={{...card,marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
      <div><h3 style={{margin:0,color:"#6b1a2c"}}>Historique des statistiques</h3><p style={{margin:"5px 0",color:"#75666a",fontSize:13}}>Retrouve tes anciens matchs et complète les minutes.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="tl-btn" type="button" disabled={busy} onClick={()=>{setMode(mode==="import"?null:"import");setError("");setNotice("");}}>＋ Importer une feuille</button>
        <button className="tl-btn" type="button" disabled={busy} onClick={()=>{setMode(mode==="minutes"?null:"minutes");setError("");setNotice("");}}>◷ Temps de jeu</button>
      </div>
    </div>
    {mode==="import"&&<div style={{display:"grid",gap:14,marginTop:16}}>
      <label style={field}>Feuille de stats (Excel, CSV, PDF ou image)<input style={input} type="file" accept=".xlsx,.xls,.csv,.pdf,image/*" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void readFile(file);event.target.value="";}}/></label>
      {busy&&<p role="status">Lecture de la feuille en cours…</p>}
      {fileName&&<small>{fileName} · {rows.length} lignes · {rows.filter(row=>row.playerId).length} joueurs associés</small>}
      {rows.length>0&&<small style={{color:"#75666a"}}>Vérifie les correspondances de joueurs. Crée les fiches des anciens joueurs si nécessaire. Laisse MIN vide si inconnu.</small>}
      {sheets.length>1&&<label style={field}>Feuille / équipe à importer<select style={input} value={sheetIndex} disabled={busy} onChange={event=>chooseSheet(sheets[Number(event.target.value)],Number(event.target.value))}>{sheets.map((sheet,i)=><option key={i} value={i}>{sheet.name}</option>)}</select></label>}
      <div style={{background:"#f8f3ed",borderRadius:8,padding:10,fontSize:13}}>Équipe du nouveau match · <strong>{teamName}</strong></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
        <label style={field}>Date<input style={input} type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <label style={field}>Adversaire<input style={input} value={opponent} onChange={e=>setOpponent(e.target.value)} /></label>
        <label style={field}>Lieu<select style={input} value={home?"home":"away"} onChange={e=>setHome(e.target.value==="home")}><option value="home">Domicile</option><option value="away">Extérieur</option></select></label>
        <label style={field}>Compétition<select style={input} value={category} onChange={e=>setCategory(e.target.value)}><option value="">Choisir la compétition…</option><option value="championship">Championnat</option><option value="cup">Coupe</option><option value="friendly">Amical</option></select></label>
        <label style={field}>Notre score<input style={input} inputMode="numeric" value={us} onChange={e=>setUs(e.target.value)} /></label>
        <label style={field}>Score adverse<input style={input} inputMode="numeric" value={them} onChange={e=>setThem(e.target.value)} /></label>
      </div>
      <label style={{display:"flex",alignItems:"center",gap:8,fontWeight:700}}><input type="checkbox" checked={includeMinutes} onChange={e=>setIncludeMinutes(e.target.checked)}/> Importer ou saisir les temps de jeu maintenant (facultatif)</label>
      <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
        <thead><tr><th style={{textAlign:"left",minWidth:120}}>Joueur sur la feuille</th><th style={{textAlign:"left",minWidth:160}}>Joueur MyBasket</th><th>MJ</th>{includeMinutes&&<th>MIN</th>}{BOX_FIELDS.map(([key,label])=><th key={key} title={key} style={{padding:5}}>{label}</th>)}<th/></tr></thead>
        <tbody>{rows.map((row,i)=><tr key={i} style={{borderTop:"1px solid #eee"}}>
          <td style={{padding:5}}>{row.number? "#"+row.number+" ":""}{row.name||"Saisie manuelle"}</td>
          <td><select style={{...input,width:"100%"}} aria-label={`Joueur ligne ${i+1}`} value={row.playerId} onChange={e=>updateRow(i,{playerId:e.target.value})}><option value="">Choisir…</option>{roster.map(p=><option key={p.id} value={p.id} disabled={rows.some((other,j)=>j!==i&&other.playerId===p.id)}>{p.number!=null?`#${p.number} `:""}{p.name}</option>)}</select></td>
          <td><input type="checkbox" aria-label={`A joué · ${row.name||i+1}`} checked={row.present!==false} onChange={e=>updateRow(i,{present:e.target.checked})}/></td>
          {includeMinutes&&<td><input disabled={row.present===false} style={{...input,width:65}} aria-label="Minutes" placeholder="—" value={row.minutes} onChange={e=>updateRow(i,{minutes:e.target.value})}/></td>}
          {BOX_FIELDS.map(([key,label])=><td key={key}><input style={{...input,width:48,textAlign:"center",padding:"8px 4px"}} aria-label={`${label} ${row.name||i+1}`} disabled={row.present===false} inputMode="numeric" placeholder="—" value={row.stats[key]??""} onChange={e=>updateRow(i,{stats:{...row.stats,[key]:e.target.value}})}/></td>)}
          <td><button type="button" className="tl-btn" aria-label="Retirer la ligne" onClick={()=>setRows(current=>current.filter((_,j)=>j!==i))}>×</button></td>
        </tr>)}</tbody>
      </table></div>
      <div style={{display:"flex",gap:8,justifyContent:"space-between"}}><button type="button" className="tl-btn" disabled={busy} onClick={()=>setRows(current=>[...current,blankRow()])}>＋ Ajouter un joueur</button><button type="button" className="tl-btn" style={{background:"#6b1a2c",color:"white"}} disabled={busy||!rows.length} onClick={save}>{busy?"Traitement…":"Créer le match et enregistrer les stats"}</button></div>
    </div>}
    {mode==="minutes"&&<div style={{display:"grid",gap:12,marginTop:16}}>
      <label style={field}>Match terminé<select style={input} disabled={busy||loading} value={selected} onChange={e=>void selectMatch(e.target.value)}><option value="">Choisir un match</option>{matches.map(match=><option key={match.id} value={match.id}>{match.match_date} — {match.opponent}{match.source==="external"?" (importé)":""}</option>)}</select></label>
      {minuteRows.map(row=><label key={row.player_id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}><span>{playerNames.get(row.player_id)||"Ancien joueur"}{row.present?"":" · absent"}</span><input style={{...input,width:90,textAlign:"center"}} placeholder="MM:SS" disabled={!row.present||busy} value={minutes[row.player_id]??""} onChange={e=>setMinutes(old=>({...old,[row.player_id]:e.target.value}))}/></label>)}
      {selected&&minuteRows.length>0&&<><small>Laisse vide si le temps de jeu est inconnu.</small><button type="button" className="tl-btn" style={{background:"#6b1a2c",color:"white",justifySelf:"end"}} disabled={busy} onClick={saveMinutes}>Enregistrer les temps de jeu</button></>}
    </div>}
    {error&&<p role="alert" style={{color:"#a31532",fontSize:13}}>{error}</p>}
    {notice&&<p role="status" style={{color:"#187344",fontSize:13}}>{notice}</p>}
  </section>;
}
