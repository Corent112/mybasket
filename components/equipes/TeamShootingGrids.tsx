"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Player } from "@/types/player";

type InputMode = "fixed_attempts" | "fixed_makes";

type Grid = {
  id: string;
  team_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  input_mode: InputMode;
  fixed_value: number;
  court_schema_url: string | null;
  court_schema_data: any | null;
  created_at: string;
  updated_at: string;
};

type GridRow = {
  id: string;
  grid_id: string;
  name: string;
  sort_order: number;
};

type Session = {
  id: string;
  grid_id: string;
  owner_id: string;
  session_date: string;
  notes: string | null;
  created_at: string;
};

type SessionPlayer = {
  id: string;
  session_id: string;
  player_id: string;
};

type Result = {
  id?: string;
  session_id: string;
  row_id: string;
  player_id: string;
  made: number;
  attempted: number;
};

const BORDEAUX="#6B1A2C";
const GOLD="#D4A24C";
const BORDER="#E8DDD7";
const TEXT="#221A18";
const MUTED="#7C6F68";
const SOFT="#FBF7F3";
const OK="#2E8B57";

const DEFAULT_ROWS=[
  "2PTS · Corner droit",
  "2PTS · Aile droite",
  "2PTS · Axe",
  "2PTS · Aile gauche",
  "2PTS · Corner gauche",
  "3PTS · Corner droit",
  "3PTS · Aile droite",
  "3PTS · Axe",
  "3PTS · Aile gauche",
  "3PTS · Corner gauche",
  "LF",
];

function safeInt(v:unknown){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.floor(n)):0}
function pct(m:number,a:number){return a?Math.round((m/a)*1000)/10:0}
function playerName(p:Player){return `${p.firstName||""} ${p.lastName||""}`.trim()||"Joueur"}
function fmtDate(v:string){return new Date(`${v}T12:00:00`).toLocaleDateString("fr-FR")}

function CourtPreview({image}:{image:string|null}){
  if(image){
    return (
      <div style={{display:"grid",gap:8}}>
        <img
          src={image}
          alt="Schéma Plaquette de la grille de tirs"
          style={{width:"100%",height:300,objectFit:"contain",borderRadius:14,border:`1px solid ${BORDER}`,background:"#fff"}}
        />
        <div style={{fontSize:10,color:MUTED}}>
          Ce schéma vient directement de <b>Plaquette MyBasket</b>.
        </div>
      </div>
    );
  }

  return (
    <div style={{height:300,border:`1px dashed ${GOLD}`,borderRadius:14,background:"#FCF8F3",display:"grid",placeItems:"center",padding:24,textAlign:"center"}}>
      <div>
        <div style={{fontSize:36,marginBottom:8}}>🏀</div>
        <strong style={{display:"block",color:BORDEAUX,fontSize:15}}>Aucun schéma associé</strong>
        <span style={{display:"block",marginTop:6,color:MUTED,fontSize:11,lineHeight:1.5}}>
          Clique sur <b>Dessiner dans Plaquette</b>. Le demi-terrain de Plaquette s'ouvre, tu places tes spots puis tu l'insères dans cette grille.
        </span>
      </div>
    </div>
  );
}

type ShotGroup = "2PTS"|"3PTS"|"LF"|"AUTRES";
function shotGroup(name:string):ShotGroup{
  const n=name.trim().toUpperCase();
  if(n==="LF"||n.startsWith("LF ")||n.includes("LANCER")) return "LF";
  if(n.includes("2PTS")||n.includes("2 PTS")||n.includes("2 POINT")) return "2PTS";
  if(n.includes("3PTS")||n.includes("3 PTS")||n.includes("3 POINT")) return "3PTS";
  return "AUTRES";
}
function spotLabel(name:string){
  return name.replace(/^(2PTS|3PTS)\s*[·:\\-]\s*/i,"").trim();
}
function groupRows(rows:GridRow[]){
  const order:ShotGroup[]=["2PTS","3PTS","LF","AUTRES"];
  return order.map(group=>({group,rows:rows.filter(r=>shotGroup(r.name)===group)})).filter(x=>x.rows.length);
}
async function imageUrlToDataUrl(url:string|null){
  if(!url)return null;
  try{
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok)return null;
    const blob=await response.blob();
    return await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||""));
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }catch{return null}
}

export default function TeamShootingGrids({
  teamId,
  players,
  canEdit,
}:{
  teamId:string;
  players:Player[];
  canEdit:boolean;
}){
  const supabase=useMemo(()=>createClient(),[]);
  const [userId,setUserId]=useState("");
  const [grids,setGrids]=useState<Grid[]>([]);
  const [selectedGridId,setSelectedGridId]=useState("");
  const [rows,setRows]=useState<GridRow[]>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [sessionPlayers,setSessionPlayers]=useState<Record<string,string[]>>({});
  const [results,setResults]=useState<Record<string,Record<string,Record<string,Result>>>>({});
  const [selectedPlayers,setSelectedPlayers]=useState<string[]>([]);
  const [newDate,setNewDate]=useState(new Date().toISOString().slice(0,10));
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [teamIdentity,setTeamIdentity]=useState<{name:string;logo:string|null}>({name:"Équipe",logo:null});

  const grid=grids.find(g=>g.id===selectedGridId)||null;
  const toast=(t:string)=>{setMessage(t);window.setTimeout(()=>setMessage(""),2200)};

  const loadDetails=useCallback(async(gridId:string)=>{
    if(!gridId){setRows([]);setSessions([]);setSessionPlayers({});setResults({});return}

    const [{data:r,error:re},{data:s,error:se}]=await Promise.all([
      supabase.from("shooting_grid_rows").select("id,grid_id,name,sort_order").eq("grid_id",gridId).order("sort_order"),
      supabase.from("shooting_grid_sessions").select("id,grid_id,owner_id,session_date,notes,created_at").eq("grid_id",gridId).order("session_date",{ascending:false}).order("created_at",{ascending:false})
    ]);
    if(re) throw re;if(se) throw se;

    const nextRows=(r||[]) as GridRow[];
    const nextSessions=(s||[]) as Session[];
    setRows(nextRows);setSessions(nextSessions);

    if(!nextSessions.length){setSessionPlayers({});setResults({});return}
    const sessionIds=nextSessions.map(x=>x.id);
    const [{data:sp,error:spe},{data:res,error:rse}]=await Promise.all([
      supabase.from("shooting_grid_session_players").select("id,session_id,player_id").in("session_id",sessionIds),
      supabase.from("shooting_grid_player_results").select("id,session_id,row_id,player_id,made,attempted").in("session_id",sessionIds)
    ]);
    if(spe) throw spe;if(rse) throw rse;

    const spMap:Record<string,string[]>={};
    for(const x of (sp||[]) as SessionPlayer[]){(spMap[x.session_id]??=[]).push(String(x.player_id))}
    setSessionPlayers(spMap);

    const map:Record<string,Record<string,Record<string,Result>>>={};
    for(const x of (res||[]) as Result[]){
      map[x.session_id]??={}; map[x.session_id][x.player_id]??={}; map[x.session_id][x.player_id][x.row_id]=x;
    }
    setResults(map);
  },[supabase]);

  const loadGrids=useCallback(async(preferred?:string)=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    setUserId(user.id);
    const {data:teamRow}=await supabase.from("teams").select("name,logo_url").eq("id",teamId).maybeSingle();
    if(teamRow){
      setTeamIdentity({
        name:String((teamRow as {name?:unknown}).name||"Équipe"),
        logo:typeof (teamRow as {logo_url?:unknown}).logo_url==="string"?String((teamRow as {logo_url?:unknown}).logo_url):null
      });
    }
    const {data,error}=await supabase.from("shooting_grids").select("id,team_id,owner_id,name,description,input_mode,fixed_value,court_schema_url,court_schema_data,created_at,updated_at").eq("team_id",teamId).order("updated_at",{ascending:false});
    if(error)throw error;
    const list=(data||[]) as Grid[];
    setGrids(list);
    const id=preferred&&list.some(g=>g.id===preferred)?preferred:(list.some(g=>g.id===selectedGridId)?selectedGridId:list[0]?.id||"");
    setSelectedGridId(id);
    await loadDetails(id);
  },[loadDetails,selectedGridId,supabase,teamId]);

  useEffect(()=>{void (async()=>{try{await loadGrids()}catch(e){console.error(e);toast("Impossible de charger les grilles.")}finally{setLoading(false)}})()},[teamId]); // eslint-disable-line

  useEffect(()=>{
    if(typeof window==="undefined") return;
    const pending=localStorage.getItem("mybasket_shooting_grid_pending");
    const raw=localStorage.getItem("mybasket_plaquette_result");
    if(!pending||!raw)return;

    void (async()=>{
      try{
        const parsed=JSON.parse(raw);
        const image=Array.isArray(parsed?.schemaImages)?parsed.schemaImages[0]:null;
        if(!image)return;
        const {error}=await supabase.from("shooting_grids").update({
          court_schema_url:image,
          court_schema_data:parsed,
          updated_at:new Date().toISOString()
        }).eq("id",pending).eq("team_id",teamId);
        if(error)throw error;
        localStorage.removeItem("mybasket_shooting_grid_pending");
        localStorage.removeItem("mybasket_plaquette_result");
        await loadGrids(pending);
        toast("Schéma Plaquette ajouté à la grille ✓");
      }catch(e){console.error(e)}
    })();
  },[loadGrids,supabase,teamId]);

  async function createGrid(){
    if(!canEdit||!userId)return;
    setSaving(true);
    try{
      const {data:g,error}=await supabase.from("shooting_grids").insert({
        team_id:teamId,owner_id:userId,name:"Nouvelle grille de tir",description:"",
        input_mode:"fixed_attempts",fixed_value:10
      }).select("*").single();
      if(error)throw error;
      const {error:rowError}=await supabase.from("shooting_grid_rows").insert(DEFAULT_ROWS.map((name,i)=>({grid_id:g.id,name,sort_order:i,target_attempts:10})));
      if(rowError)throw rowError;
      await loadGrids(g.id);toast("Grille créée.");
    }catch(e){console.error(e);toast("Impossible de créer la grille.")}finally{setSaving(false)}
  }

  function patchGrid(patch:Partial<Grid>){
    if(!grid)return;
    setGrids(cur=>cur.map(g=>g.id===grid.id?{...g,...patch}:g));
  }

  async function saveDefinition(){
    if(!grid||!canEdit)return;
    setSaving(true);
    try{
      const {error}=await supabase.from("shooting_grids").update({
        name:grid.name.trim()||"Grille de tir",
        description:grid.description?.trim()||null,
        input_mode:grid.input_mode,
        fixed_value:Math.max(1,safeInt(grid.fixed_value)),
        updated_at:new Date().toISOString()
      }).eq("id",grid.id);
      if(error)throw error;

      for(let i=0;i<rows.length;i++){
        const row=rows[i];
        const {error:re}=await supabase.from("shooting_grid_rows").update({name:row.name.trim()||`Position ${i+1}`,sort_order:i}).eq("id",row.id);
        if(re)throw re;
      }
      await loadGrids(grid.id);toast("Modèle enregistré ✓");
    }catch(e){console.error(e);toast("Erreur pendant l'enregistrement.")}finally{setSaving(false)}
  }

  async function addRow(){
    if(!grid||!canEdit)return;
    const {data,error}=await supabase.from("shooting_grid_rows").insert({grid_id:grid.id,name:`Position ${rows.length+1}`,sort_order:rows.length,target_attempts:grid.fixed_value}).select("id,grid_id,name,sort_order").single();
    if(error)return alert(error.message);
    setRows(cur=>[...cur,data as GridRow]);
  }

  async function removeRow(id:string){
    if(!canEdit||rows.length<=1)return;
    if(!window.confirm("Supprimer ce spot et tous ses résultats ?"))return;
    const {error}=await supabase.from("shooting_grid_rows").delete().eq("id",id);
    if(error)return alert(error.message);
    setRows(cur=>cur.filter(r=>r.id!==id));
  }

  function openPlaquette(){
    if(!grid||typeof window==="undefined")return;
    localStorage.setItem("mybasket_shooting_grid_pending",grid.id);
    localStorage.setItem("mb_plaquette_return_to",window.location.pathname);
    localStorage.removeItem("mybasket_plaquette_result");
    window.location.href="/plaquette";
  }

  async function exportBlankPdf(){
    if(!grid||!rows.length)return;
    try{
      const {jsPDF}=await import("jspdf");
      const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
      const pageW=297,pageH=210,margin=9;
      const burgundy:[number,number,number]=[107,26,44];
      const gold:[number,number,number]=[212,162,76];
      const soft:[number,number,number]=[249,246,242];

      const logoData=await imageUrlToDataUrl(teamIdentity.logo);
      const schemaData=await imageUrlToDataUrl(grid.court_schema_url);

      if(logoData){
        try{pdf.addImage(logoData,"PNG",margin,7,18,18,undefined,"FAST")}catch{}
      }
      pdf.setTextColor(...burgundy);
      pdf.setFont("helvetica","bold");
      pdf.setFontSize(15);
      pdf.text(grid.name||"Grille de tir",logoData?31:margin,13);
      pdf.setTextColor(90,80,75);
      pdf.setFont("helvetica","normal");
      pdf.setFontSize(8);
      pdf.text(teamIdentity.name||"Équipe",logoData?31:margin,18);
      if(grid.description){
        const desc=pdf.splitTextToSize(grid.description,145);
        pdf.text(desc,logoData?31:margin,22);
      }

      if(schemaData){
        try{
          pdf.setDrawColor(232,221,215);
          pdf.roundedRect(224,6,64,36,2,2,"S");
          pdf.addImage(schemaData,"PNG",226,8,60,32,undefined,"FAST");
        }catch{}
      }

      const grouped=groupRows(rows);
      const tableX=margin;
      const tableY=schemaData?47:34;
      const playerW=29;
      const totalW=18;
      const usableW=pageW-margin*2-playerW-totalW;
      const spotW=usableW/Math.max(1,rows.length);
      const subW=spotW/3;
      const h1=7,h2=8,h3=6,rowH=7;
      const blankRows=Math.max(8,Math.min(15,players.length||12));

      const line=(x1:number,y1:number,x2:number,y2:number)=>{pdf.setDrawColor(205,196,191);pdf.setLineWidth(.2);pdf.line(x1,y1,x2,y2)};
      const fill=(x:number,y:number,w:number,h:number,c:[number,number,number])=>{pdf.setFillColor(...c);pdf.rect(x,y,w,h,"F")};
      const text=(v:string,x:number,y:number,size=6.5,bold=false,align:"left"|"center"|"right"="center")=>{
        pdf.setFont("helvetica",bold?"bold":"normal");pdf.setFontSize(size);pdf.text(v,x,y,{align});
      };

      // Group header
      fill(tableX,tableY,playerW,h1+h2+h3,burgundy);
      pdf.setTextColor(255,255,255);
      text("JOUEUR",tableX+playerW/2,tableY+(h1+h2+h3)/2+2,7,true);

      let x=tableX+playerW;
      for(const block of grouped){
        const w=block.rows.length*spotW;
        fill(x,tableY,w,h1,burgundy);
        pdf.setTextColor(255,255,255);
        text(block.group==="AUTRES"?"SPOTS":block.group,x+w/2,tableY+4.8,7,true);
        x+=w;
      }
      fill(x,tableY,totalW,h1+h2,burgundy);
      pdf.setTextColor(255,255,255);
      text("TOTAL",x+totalW/2,tableY+8,7,true);

      // Spot headers + TM TT %
      x=tableX+playerW;
      for(const row of rows){
        fill(x,tableY+h1,spotW,h2,soft);
        pdf.setTextColor(...burgundy);
        const label=pdf.splitTextToSize(spotLabel(row.name),spotW-1.5).slice(0,2);
        pdf.setFont("helvetica","bold");pdf.setFontSize(5.5);
        pdf.text(label,x+spotW/2,tableY+h1+3.2,{align:"center"});
        for(let k=0;k<3;k++){
          fill(x+k*subW,tableY+h1+h2,subW,h3,[255,255,255]);
          pdf.setTextColor(...burgundy);
          text(["TM","TT","%"][k],x+k*subW+subW/2,tableY+h1+h2+4.1,5.8,true);
        }
        x+=spotW;
      }
      const totalSub=totalW/3;
      for(let k=0;k<3;k++){
        fill(x+k*totalSub,tableY+h1+h2,totalSub,h3,[255,255,255]);
        pdf.setTextColor(...burgundy);
        text(["TM","TT","%"][k],x+k*totalSub+totalSub/2,tableY+h1+h2+4.1,5.8,true);
      }

      const bodyTop=tableY+h1+h2+h3;
      const tableRight=pageW-margin;
      // vertical lines
      line(tableX,tableY,tableX,bodyTop+(blankRows+1)*rowH);
      line(tableX+playerW,tableY,tableX+playerW,bodyTop+(blankRows+1)*rowH);
      x=tableX+playerW;
      for(const row of rows){
        line(x,tableY+h1,x,bodyTop+(blankRows+1)*rowH);
        line(x+subW,tableY+h1+h2,x+subW,bodyTop+(blankRows+1)*rowH);
        line(x+subW*2,tableY+h1+h2,x+subW*2,bodyTop+(blankRows+1)*rowH);
        x+=spotW;
      }
      line(x,tableY,x,bodyTop+(blankRows+1)*rowH);
      line(x+totalSub,tableY+h1+h2,x+totalSub,bodyTop+(blankRows+1)*rowH);
      line(x+totalSub*2,tableY+h1+h2,x+totalSub*2,bodyTop+(blankRows+1)*rowH);
      line(tableRight,tableY,tableRight,bodyTop+(blankRows+1)*rowH);

      // horizontal lines
      line(tableX,tableY,tableRight,tableY);
      line(tableX+playerW,tableY+h1,tableRight-totalW,tableY+h1);
      line(tableX+playerW,tableY+h1+h2,tableRight,tableY+h1+h2);
      line(tableX,bodyTop,tableRight,bodyTop);
      for(let i=0;i<=blankRows;i++)line(tableX,bodyTop+i*rowH,tableRight,bodyTop+i*rowH);

      // Blank player lines numbered for handwriting
      pdf.setTextColor(120,110,105);
      for(let i=0;i<blankRows;i++){
        pdf.setFont("helvetica","normal");pdf.setFontSize(5.5);
        pdf.text(`${i+1}.`,tableX+2,bodyTop+i*rowH+4.7);
      }

      // Total line
      const totalY=bodyTop+blankRows*rowH;
      fill(tableX,totalY,tableRight-tableX,rowH,burgundy);
      pdf.setTextColor(255,255,255);
      text("TOTAL ÉQUIPE",tableX+playerW/2,totalY+4.7,6.5,true);
      x=tableX+playerW;
      for(let i=0;i<rows.length;i++){
        for(let k=0;k<3;k++) text(["TM","TT","%"][k],x+k*subW+subW/2,totalY+4.7,5.3,true);
        x+=spotW;
      }
      for(let k=0;k<3;k++) text(["TM","TT","%"][k],x+k*totalSub+totalSub/2,totalY+4.7,5.3,true);

      pdf.setTextColor(140,130,125);
      pdf.setFont("helvetica","normal");pdf.setFontSize(6);
      pdf.text("TM = tirs marqués   •   TT = tirs tentés   •   % = pourcentage",margin,pageH-5);

      const safeName=(grid.name||"grille-de-tir").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase();
      pdf.save(`${safeName||"grille-de-tir"}-vierge.pdf`);
    }catch(e){
      console.error(e);
      alert("Impossible de générer le PDF.");
    }
  }

  async function createSession(){
    if(!grid||!userId||!newDate||!selectedPlayers.length)return;
    setSaving(true);
    try{
      const {data:s,error}=await supabase.from("shooting_grid_sessions").insert({grid_id:grid.id,owner_id:userId,session_date:newDate}).select("*").single();
      if(error)throw error;
      const {error:pe}=await supabase.from("shooting_grid_session_players").insert(selectedPlayers.map(pid=>({session_id:s.id,player_id:pid})));
      if(pe)throw pe;

      const seed:Result[]=[];
      for(const pid of selectedPlayers){
        for(const row of rows){
          seed.push({
            session_id:s.id,row_id:row.id,player_id:pid,
            made:grid.input_mode==="fixed_makes"?grid.fixed_value:0,
            attempted:grid.input_mode==="fixed_attempts"?grid.fixed_value:grid.fixed_value
          })
        }
      }
      if(seed.length){
        const {error:re}=await supabase.from("shooting_grid_player_results").insert(seed);
        if(re)throw re;
      }

      setSelectedPlayers([]);
      await loadDetails(grid.id);
      toast("Session créée : tableau prêt à remplir.");
    }catch(e:any){console.error(e);alert(e?.message||"Impossible de créer la session.")}finally{setSaving(false)}
  }

  function patchResult(sessionId:string,playerId:string,rowId:string,field:"made"|"attempted",value:number){
    setResults(cur=>{
      const session={...(cur[sessionId]||{})};
      const player={...(session[playerId]||{})};
      const base=player[rowId]||{session_id:sessionId,row_id:rowId,player_id:playerId,made:0,attempted:0};
      let next={...base,[field]:Math.max(0,safeInt(value))};
      if(field==="made"&&next.made>next.attempted) next.attempted=next.made;
      if(field==="attempted"&&next.attempted<next.made) next.attempted=next.made;
      player[rowId]=next;session[playerId]=player;
      return {...cur,[sessionId]:session};
    })
  }

  async function saveSession(session:Session){
    if(!grid||!canEdit)return;
    setSaving(true);
    try{
      const rowsToSave:Result[]=[];
      for(const pid of sessionPlayers[session.id]||[]){
        for(const row of rows){
          const r=results[session.id]?.[pid]?.[row.id];
          if(!r)continue;
          rowsToSave.push({
            session_id:session.id,row_id:row.id,player_id:pid,
            made:safeInt(r.made),attempted:Math.max(safeInt(r.attempted),safeInt(r.made))
          });
        }
      }
      const {error}=await supabase.from("shooting_grid_player_results").upsert(rowsToSave,{onConflict:"session_id,row_id,player_id"});
      if(error)throw error;
      toast("Résultats enregistrés ✓");
      await loadDetails(grid.id);
    }catch(e:any){console.error(e);alert(e?.message||"Erreur sauvegarde.")}finally{setSaving(false)}
  }

  async function deleteSession(session:Session){
    if(!canEdit||!window.confirm(`Supprimer la session du ${fmtDate(session.session_date)} ?`))return;
    const {error}=await supabase.from("shooting_grid_sessions").delete().eq("id",session.id);
    if(error)return alert(error.message);
    if(grid)await loadDetails(grid.id);
  }

  async function deleteGrid(){
    if(!grid||!canEdit||!window.confirm(`Supprimer "${grid.name}" ?`))return;
    const {error}=await supabase.from("shooting_grids").delete().eq("id",grid.id);
    if(error)return alert(error.message);
    await loadGrids();
  }

  const aggregate=useMemo(()=>{
    const map:Record<string,{made:number;attempted:number;byRow:Record<string,{made:number;attempted:number}>}>={};
    for(const session of sessions){
      for(const pid of sessionPlayers[session.id]||[]){
        map[pid]??={made:0,attempted:0,byRow:{}};
        for(const row of rows){
          const r=results[session.id]?.[pid]?.[row.id];
          if(!r)continue;
          map[pid].made+=Number(r.made||0);map[pid].attempted+=Number(r.attempted||0);
          map[pid].byRow[row.id]??={made:0,attempted:0};
          map[pid].byRow[row.id].made+=Number(r.made||0);
          map[pid].byRow[row.id].attempted+=Number(r.attempted||0);
        }
      }
    }
    return map;
  },[results,rows,sessionPlayers,sessions]);

  if(loading)return <div style={{padding:22,color:MUTED}}>Chargement des grilles…</div>;

  return (
    <section style={{display:"grid",gap:12}}>
      {message&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:"#251B18",color:"#fff",padding:"10px 17px",borderRadius:999,fontWeight:900}}>{message}</div>}

      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <div>
          <span style={eyebrow}>GRILLES DE TIR</span>
          <h2 style={{margin:"4px 0",color:BORDEAUX}}>Créer · tester · suivre la progression</h2>
          <p style={{margin:0,color:MUTED,fontSize:11}}>Une grille équipe peut être remplie par plusieurs joueurs et alimente automatiquement leur fiche individuelle.</p>
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {grid&&<button onClick={exportBlankPdf} style={secondary}>📄 Exporter grille vierge A4</button>}
          {canEdit&&<button onClick={createGrid} disabled={saving} style={primary}>+ Nouvelle grille</button>}
        </div>
      </div>

      {!grids.length?(
        <div style={empty}>
          <strong style={{color:BORDEAUX}}>Aucune grille pour cette équipe.</strong>
          <span>Crée ton premier modèle : nombre de tentés imposé ou nombre de marqués imposé.</span>
        </div>
      ):(
        <>
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
            {grids.map(g=><button key={g.id} onClick={()=>{setSelectedGridId(g.id);void loadDetails(g.id)}} style={{...chip,...(g.id===selectedGridId?activeChip:{})}}>{g.name}</button>)}
          </div>

          {grid&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.1fr) minmax(320px,.9fr)",gap:12}}>
                <div style={card}>
                  <span style={eyebrow}>CRÉATION DU MODÈLE</span>
                  <h3 style={title}>Comment fonctionne cette grille ?</h3>

                  <label style={field}><span>Nom de la grille</span><input value={grid.name} onChange={e=>patchGrid({name:e.target.value})} disabled={!canEdit}/></label>
                  <label style={field}><span>Description / consigne</span><textarea value={grid.description||""} onChange={e=>patchGrid({description:e.target.value})} placeholder="Ex. 5 spots à 3pts, déplacement après chaque série…" disabled={!canEdit}/></label>

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <button type="button" onClick={()=>canEdit&&patchGrid({input_mode:"fixed_attempts"})} style={{...modeCard,...(grid.input_mode==="fixed_attempts"?modeActive:{})}}>
                      <b>🎯 Nombre de tirs imposé</b>
                      <span>Exemple : 10 tirs par spot. Les tentés sont déjà remplis, tu saisis uniquement les marqués.</span>
                    </button>
                    <button type="button" onClick={()=>canEdit&&patchGrid({input_mode:"fixed_makes"})} style={{...modeCard,...(grid.input_mode==="fixed_makes"?modeActive:{})}}>
                      <b>🔥 Nombre de paniers imposé</b>
                      <span>Exemple : marquer 10 tirs par spot. Les marqués sont déjà remplis, tu saisis le nombre de tentés.</span>
                    </button>
                  </div>

                  <label style={{...field,marginTop:10,maxWidth:260}}>
                    <span>{grid.input_mode==="fixed_attempts"?"Nombre de tentés par spot":"Nombre de marqués à atteindre"}</span>
                    <input type="number" min={1} max={500} value={grid.fixed_value} onChange={e=>patchGrid({fixed_value:Math.max(1,safeInt(e.target.value))})} disabled={!canEdit}/>
                  </label>

                  <div style={{marginTop:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                      <div><span style={eyebrow}>POSITIONS / SPOTS</span><strong style={{display:"block",color:TEXT,fontSize:13,marginTop:3}}>Colonnes du futur tableau</strong></div>
                      {canEdit&&<button onClick={addRow} style={secondary}>+ Spot</button>}
                    </div>
                    <div style={{display:"grid",gap:5,marginTop:7}}>
                      {rows.map((row,i)=><div key={row.id} style={{display:"grid",gridTemplateColumns:"32px 1fr 34px",gap:6,alignItems:"center"}}>
                        <span style={{width:28,height:28,borderRadius:8,background:"#FFF4DE",color:BORDEAUX,display:"grid",placeItems:"center",fontWeight:1000}}>{i+1}</span>
                        <input value={row.name} onChange={e=>setRows(cur=>cur.map(r=>r.id===row.id?{...r,name:e.target.value}:r))} disabled={!canEdit} style={input}/>
                        {canEdit&&<button onClick={()=>removeRow(row.id)} style={trash}>×</button>}
                      </div>)}
                    </div>
                  </div>

                  {canEdit&&<div style={{display:"flex",gap:7,marginTop:12,flexWrap:"wrap"}}>
                    <button onClick={saveDefinition} disabled={saving} style={primary}>Enregistrer le modèle</button>
                    <button onClick={deleteGrid} style={danger}>Supprimer</button>
                  </div>}
                </div>

                <div style={card}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"start"}}>
                    <div><span style={eyebrow}>SCHÉMA DE LA GRILLE</span><h3 style={title}>{grid.court_schema_url?"Ton schéma Plaquette":"Demi-terrain Plaquette"}</h3></div>
                    {canEdit&&<button onClick={openPlaquette} style={secondary}>✏️ Dessiner dans Plaquette</button>}
                  </div>
                  <CourtPreview image={grid.court_schema_url}/>
                  <div style={{marginTop:8,color:MUTED,fontSize:10,lineHeight:1.45}}>
                    Le bouton ouvre directement <b>Plaquette MyBasket</b>. Place tes spots sur le demi-terrain puis clique sur <b>Insérer dans la grille de tir</b> : le dessin revient ici et reste sauvegardé avec la grille.
                  </div>
                </div>
              </div>

              <div style={card}>
                <span style={eyebrow}>NOUVELLE SESSION</span>
                <h3 style={title}>Qui réalise la grille ?</h3>
                <div style={{display:"grid",gridTemplateColumns:"160px minmax(0,1fr) auto",gap:10,alignItems:"start"}}>
                  <label style={field}><span>Date</span><input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}/></label>
                  <div>
                    <span style={{...eyebrow,color:MUTED}}>JOUEURS</span>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:5}}>
                      {players.map(p=>{
                        const id=String(p.id);const selected=selectedPlayers.includes(id);
                        return <button key={id} onClick={()=>setSelectedPlayers(cur=>selected?cur.filter(x=>x!==id):[...cur,id])} style={{...playerChip,...(selected?playerChipActive:{})}}>{selected?"✓ ":""}{playerName(p)}</button>
                      })}
                    </div>
                  </div>
                  <button onClick={createSession} disabled={!canEdit||!selectedPlayers.length||saving} style={{...primary,marginTop:17}}>Créer le tableau</button>
                </div>
              </div>

              {sessions.map(session=>{
                const pids=sessionPlayers[session.id]||[];
                return (
                  <div key={session.id} style={{...card,padding:0,overflow:"hidden"}}>
                    <div style={{padding:"12px 14px",display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",background:"#FFF9F1",borderBottom:`1px solid ${BORDER}`}}>
                      <div><span style={eyebrow}>SESSION</span><strong style={{display:"block",fontSize:14,color:TEXT,marginTop:3}}>{fmtDate(session.session_date)} · {pids.length} joueur(s)</strong></div>
                      <div style={{display:"flex",gap:6}}>
                        {canEdit&&<button onClick={()=>saveSession(session)} style={primary}>Enregistrer résultats</button>}
                        {canEdit&&<button onClick={()=>deleteSession(session)} style={trashBig}>🗑</button>}
                      </div>
                    </div>

                    <div style={{overflowX:"auto"}}>
                      <table style={{borderCollapse:"collapse",width:"100%",minWidth:Math.max(850,180+rows.length*210),fontSize:10}}>
                        <thead>
                          <tr>
                            <th rowSpan={3} style={{...th,textAlign:"left",position:"sticky",left:0,zIndex:4,background:BORDEAUX,color:"#fff"}}>JOUEUR</th>
                            {groupRows(rows).map(block=><th key={block.group} colSpan={block.rows.length*3} style={{...th,background:BORDEAUX,color:"#fff",fontSize:11}}>{block.group==="AUTRES"?"SPOTS":block.group}</th>)}
                            <th rowSpan={2} colSpan={3} style={{...th,background:BORDEAUX,color:"#fff"}}>TOTAL</th>
                          </tr>
                          <tr>
                            {rows.map(row=><th key={row.id} colSpan={3} style={{...th,background:"#F7F2EE",color:BORDEAUX}}>{spotLabel(row.name)}</th>)}
                          </tr>
                          <tr>
                            {rows.flatMap(row=>[
                              <th key={`${row.id}-m`} style={subTh}>TM</th>,
                              <th key={`${row.id}-t`} style={subTh}>TT</th>,
                              <th key={`${row.id}-p`} style={subTh}>%</th>
                            ])}
                            <th style={subTh}>TM</th><th style={subTh}>TT</th><th style={subTh}>%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pids.map(pid=>{
                            const player=players.find(p=>String(p.id)===pid);
                            let tm=0,ta=0;
                            const cells=rows.map(row=>{
                              const r=results[session.id]?.[pid]?.[row.id]||{
                                session_id:session.id,row_id:row.id,player_id:pid,
                                made:grid.input_mode==="fixed_makes"?grid.fixed_value:0,
                                attempted:grid.input_mode==="fixed_attempts"?grid.fixed_value:grid.fixed_value
                              };
                              tm+=safeInt(r.made);ta+=safeInt(r.attempted);
                              return {row,r};
                            });
                            return <tr key={pid}>
                              <td style={{...td,textAlign:"left",position:"sticky",left:0,zIndex:2,background:"#fff",fontWeight:900,minWidth:160}}>{player?playerName(player):"Joueur"}</td>
                              {cells.flatMap(({row,r})=>[
                                <td key={`${row.id}-m`} style={td}>
                                  <input type="number" min={0} value={r.made} disabled={!canEdit||grid.input_mode==="fixed_makes"} onChange={e=>patchResult(session.id,pid,row.id,"made",Number(e.target.value))} style={{...tableInput,...(grid.input_mode==="fixed_makes"?fixedInput:{})}}/>
                                </td>,
                                <td key={`${row.id}-t`} style={td}>
                                  <input type="number" min={0} value={r.attempted} disabled={!canEdit||grid.input_mode==="fixed_attempts"} onChange={e=>patchResult(session.id,pid,row.id,"attempted",Number(e.target.value))} style={{...tableInput,...(grid.input_mode==="fixed_attempts"?fixedInput:{})}}/>
                                </td>,
                                <td key={`${row.id}-p`} style={{...td,fontWeight:1000,color:pct(r.made,r.attempted)>=50?OK:BORDEAUX}}>{pct(r.made,r.attempted)}%</td>
                              ])}
                              <td style={{...td,fontWeight:1000,background:"#FCF8F5"}}>{tm}</td>
                              <td style={{...td,fontWeight:1000,background:"#FCF8F5"}}>{ta}</td>
                              <td style={{...td,fontWeight:1000,color:BORDEAUX,background:"#FCF8F5"}}>{pct(tm,ta)}%</td>
                            </tr>
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}

              {!!sessions.length&&(
                <div style={{...card,padding:0,overflow:"hidden"}}>
                  <div style={{padding:"12px 14px",borderBottom:`1px solid ${BORDER}`}}>
                    <span style={eyebrow}>CUMUL DE LA GRILLE</span>
                    <h3 style={title}>Totaux joueurs sur toutes les sessions</h3>
                  </div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{borderCollapse:"collapse",width:"100%",minWidth:900,fontSize:10}}>
                      <thead><tr><th style={{...th,textAlign:"left"}}>Joueur</th>{rows.map(r=><th key={r.id} style={th}>{r.name}</th>)}<th style={th}>Marqués</th><th style={th}>Tentés</th><th style={th}>% global</th></tr></thead>
                      <tbody>
                        {Object.entries(aggregate).map(([pid,a])=>{
                          const player=players.find(p=>String(p.id)===pid);
                          return <tr key={pid}><td style={{...td,textAlign:"left",fontWeight:900}}>{player?playerName(player):"Joueur"}</td>
                            {rows.map(r=>{const x=a.byRow[r.id]||{made:0,attempted:0};return <td key={r.id} style={td}>{x.made}/{x.attempted} · <b>{pct(x.made,x.attempted)}%</b></td>})}
                            <td style={td}><b>{a.made}</b></td><td style={td}><b>{a.attempted}</b></td><td style={{...td,color:BORDEAUX,fontWeight:1000}}>{pct(a.made,a.attempted)}%</td>
                          </tr>
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

const eyebrow:React.CSSProperties={display:"block",fontSize:9,fontWeight:1000,letterSpacing:".12em",color:GOLD,textTransform:"uppercase"};
const card:React.CSSProperties={background:"#fff",border:`1px solid ${BORDER}`,borderRadius:16,padding:14,minWidth:0};
const title:React.CSSProperties={margin:"4px 0 10px",color:TEXT,fontSize:15};
const field:React.CSSProperties={display:"grid",gap:4,marginBottom:8,fontSize:10,fontWeight:900,color:MUTED,textTransform:"uppercase"};
const input:React.CSSProperties={border:`1px solid ${BORDER}`,borderRadius:9,padding:"8px 9px",background:"#fff",color:TEXT,minWidth:0};
const primary:React.CSSProperties={border:0,borderRadius:9,background:BORDEAUX,color:"#fff",padding:"8px 11px",fontWeight:900,cursor:"pointer"};
const secondary:React.CSSProperties={border:`1px solid ${BORDEAUX}`,borderRadius:9,background:"#fff",color:BORDEAUX,padding:"7px 10px",fontWeight:900,cursor:"pointer"};
const danger:React.CSSProperties={...secondary,color:"#A72D26",borderColor:"#E5BDBA"};
const chip:React.CSSProperties={border:`1px solid ${BORDER}`,borderRadius:999,background:"#fff",color:BORDEAUX,padding:"7px 10px",fontWeight:900,whiteSpace:"nowrap",cursor:"pointer"};
const activeChip:React.CSSProperties={background:BORDEAUX,color:"#fff",borderColor:BORDEAUX};
const modeCard:React.CSSProperties={display:"grid",gap:5,textAlign:"left",border:`1px solid ${BORDER}`,borderRadius:12,background:"#fff",padding:12,cursor:"pointer",color:TEXT};
const modeActive:React.CSSProperties={borderColor:GOLD,background:"#FFF8E9",boxShadow:"inset 0 0 0 1px #E7BB63"};
const playerChip:React.CSSProperties={border:`1px solid ${BORDER}`,borderRadius:999,background:"#fff",color:TEXT,padding:"6px 9px",fontSize:10,fontWeight:800,cursor:"pointer"};
const playerChipActive:React.CSSProperties={background:"#FFF3DB",borderColor:GOLD,color:BORDEAUX};
const trash:React.CSSProperties={width:32,height:32,border:`1px solid #E6C5C2`,borderRadius:8,background:"#FFF8F7",color:"#A72D26",cursor:"pointer"};
const trashBig:React.CSSProperties={...trash,width:36,height:36};
const th:React.CSSProperties={padding:"8px 7px",borderRight:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,background:"#F7F2EE",textAlign:"center",color:"#594A45",fontWeight:1000};
const subTh:React.CSSProperties={...th,padding:"6px 5px",fontSize:8,background:"#FBF8F6"};
const td:React.CSSProperties={padding:"7px 5px",borderRight:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,textAlign:"center",verticalAlign:"middle"};
const tableInput:React.CSSProperties={width:54,border:`1px solid ${BORDER}`,borderRadius:7,padding:"5px 4px",textAlign:"center",fontWeight:900,color:TEXT,background:"#fff"};
const fixedInput:React.CSSProperties={background:"#F3EEE9",color:"#8B7D75",borderColor:"#E9E0DA"};
const empty:React.CSSProperties={...card,display:"grid",gap:4,textAlign:"center",padding:30,color:MUTED};
