"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Player } from "@/types/player";
import ShotChart, { SHOT_ZONES, type ShotLike } from "@/components/prise-stats-pro/ShotChart";
import ShootingComparison from "@/components/shooting/ShootingComparison";

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
  share_token?: string | null;
  share_enabled?: boolean;
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

function normalizeSpot(v:string){return spotLabel(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim()}
function rowZoneId(row:GridRow):string|null{
  const n=normalizeSpot(row.name); const group=shotGroup(row.name);
  if(group==="LF") return null;
  const want3=group==="3PTS";
  const candidates=SHOT_ZONES.filter(z=>z.type===(want3?"3PTS":"2PTS"));
  const score=(z:(typeof SHOT_ZONES)[number])=>{
    const l=normalizeSpot(z.label+" "+z.shortLabel);
    let v=0;
    for(const token of n.split(" ")) if(token.length>2&&l.includes(token)) v+=2;
    if(n.includes("corner")&&l.includes("corner"))v+=6;
    if((n.includes("axe")||n.includes("face"))&&(l.includes("axe")||l.includes("face")))v+=6;
    if((n.includes("droite")||n.endsWith(" d"))&&(l.includes("droite")||l.includes(" d")))v+=4;
    if((n.includes("gauche")||n.endsWith(" g"))&&(l.includes("gauche")||l.includes(" g")))v+=4;
    if((n.includes("45")||n.includes("aile"))&&l.includes("aile"))v+=5;
    return v;
  };
  const ranked=candidates.map(z=>({z,s:score(z)})).sort((a,b)=>b.s-a.s);
  return ranked[0]?.s>0?ranked[0].z.id:null;
}

function requestedGridIdFromLocation(){
  if(typeof window==="undefined")return "";
  try{
    const url=new URL(window.location.href);
    return url.searchParams.get("shootingGrid")||localStorage.getItem("mybasket_shooting_grid_return_id")||"";
  }catch{return ""}
}
function restoreShootingScroll(){
  if(typeof window==="undefined")return;
  window.requestAnimationFrame(()=>{
    window.requestAnimationFrame(()=>{
      const target=document.getElementById("shooting-grid-tool");
      if(target) target.scrollIntoView({behavior:"auto",block:"start"});
      const saved=Number(localStorage.getItem("mybasket_shooting_grid_scroll_y")||"");
      if(Number.isFinite(saved)&&saved>0) window.scrollTo({top:saved,behavior:"auto"});
      localStorage.removeItem("mybasket_shooting_grid_scroll_y");
    });
  });
}

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
const SHOT_GROUPS: Array<{value:ShotGroup;label:string}> = [
  {value:"2PTS",label:"2 points"},
  {value:"3PTS",label:"3 points"},
  {value:"LF",label:"Lancers francs"},
  {value:"AUTRES",label:"Autres / spots"},
];
function shotGroup(name:string):ShotGroup{
  const n=name.trim().toUpperCase();
  if(n.startsWith("LF ·")||n==="LF"||n.startsWith("LF ")||n.includes("LANCER")) return "LF";
  if(n.startsWith("2PTS ·")||n.includes("2PTS")||n.includes("2 PTS")||n.includes("2 POINT")) return "2PTS";
  if(n.startsWith("3PTS ·")||n.includes("3PTS")||n.includes("3 PTS")||n.includes("3 POINT")) return "3PTS";
  if(n.startsWith("AUTRES ·")) return "AUTRES";
  return "AUTRES";
}
function spotLabel(name:string){
  return name.replace(/^(2PTS|3PTS|LF|AUTRES)\s*[·:\\-]\s*/i,"").trim();
}
function compactSpotLabel(name:string){
  const group=shotGroup(name);
  const raw=spotLabel(name);
  const n=raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const side=n.includes("droit")?"D":n.includes("gauch")?"G":"";
  let zone=raw.toUpperCase();
  if(n.includes("short corner")) zone=`SC ${side}`.trim();
  else if(n.includes("corner")) zone=`CORNER ${side}`.trim();
  else if(n.includes("45")) zone=`45° ${side}`.trim();
  else if(n.includes("axe")||n.includes("face")) zone="AXE";
  else if(n.includes("aile")) zone=`AILE ${side}`.trim();
  return group==="AUTRES"?zone:group==="LF"?"LF":`${group} · ${zone}`;
}
function withShotGroup(name:string,group:ShotGroup){
  const label=spotLabel(name)||"Nouveau tir";
  return `${group} · ${label}`;
}
function groupRows(rows:GridRow[]){
  const order:ShotGroup[]=["2PTS","3PTS","LF","AUTRES"];
  return order.map(group=>({group,rows:rows.filter(r=>shotGroup(r.name)===group)})).filter(x=>x.rows.length);
}
function orderedShotRows(rows:GridRow[]){
  // IMPORTANT : un seul ordre de référence pour l'écran ET le PDF.
  // Sans cela, l'en-tête peut afficher 2PTS/3PTS dans un ordre différent
  // des colonnes de spots et faire apparaître visuellement un tir à 3 pts
  // sous le bandeau 2 points.
  return groupRows(rows).flatMap(block=>block.rows);
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
  scopeType="team",
  scopeId,
  scopeLabel,
}:{
  teamId:string;
  players:Player[];
  canEdit:boolean;
  scopeType?:"team"|"institution";
  scopeId?:string;
  scopeLabel?:string;
}){
  const supabase=useMemo(()=>createClient(),[]);
  const effectiveScopeId=scopeType==="institution"?(scopeId||teamId):teamId;
  const tables=scopeType==="institution"?{
    grids:"institutional_shooting_grids",
    rows:"institutional_shooting_grid_rows",
    sessions:"institutional_shooting_grid_sessions",
    sessionPlayers:"institutional_shooting_grid_session_players",
    results:"institutional_shooting_grid_player_results",
  }:{
    grids:"shooting_grids",
    rows:"shooting_grid_rows",
    sessions:"shooting_grid_sessions",
    sessionPlayers:"shooting_grid_session_players",
    results:"shooting_grid_player_results",
  };
  const [userId,setUserId]=useState("");
  const [grids,setGrids]=useState<Grid[]>([]);
  const [selectedGridId,setSelectedGridId]=useState("");
  const [rows,setRows]=useState<GridRow[]>([]);
  const [selectedRowId,setSelectedRowId]=useState("");
  // Ordre d'affichage garanti : 2PTS puis 3PTS puis LF puis autres.
  // L'ordre interne de chaque groupe reste celui défini par l'utilisateur.
  const displayRows=useMemo(()=>orderedShotRows(rows),[rows]);
  const shootingRows=useMemo(()=>displayRows.filter(r=>shotGroup(r.name)!=="LF"),[displayRows]);
  const freeThrowRows=useMemo(()=>displayRows.filter(r=>shotGroup(r.name)==="LF"),[displayRows]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [sessionPlayers,setSessionPlayers]=useState<Record<string,string[]>>({});
  const [results,setResults]=useState<Record<string,Record<string,Record<string,Result>>>>({});
  const [selectedPlayers,setSelectedPlayers]=useState<string[]>([]);
  const [newDate,setNewDate]=useState(new Date().toISOString().slice(0,10));
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [shootingView,setShootingView]=useState<"editor"|"library">("editor");
  const [message,setMessage]=useState("");
  const [recapMode,setRecapMode]=useState<"average"|"total">("average");
  const [shareBusy,setShareBusy]=useState(false);
  const [teamIdentity,setTeamIdentity]=useState<{name:string;logo:string|null}>({name:"Équipe",logo:null});

  const grid=grids.find(g=>g.id===selectedGridId)||null;
  const toast=(t:string)=>{setMessage(t);window.setTimeout(()=>setMessage(""),2200)};

  const loadDetails=useCallback(async(gridId:string)=>{
    if(!gridId){setRows([]);setSessions([]);setSessionPlayers({});setResults({});return}

    const [{data:r,error:re},{data:s,error:se}]=await Promise.all([
      supabase.from(tables.rows).select("id,grid_id,name,sort_order").eq("grid_id",gridId).order("sort_order"),
      supabase.from(tables.sessions).select("id,grid_id,owner_id,session_date,notes,created_at").eq("grid_id",gridId).order("session_date",{ascending:false}).order("created_at",{ascending:false})
    ]);
    if(re) throw re;if(se) throw se;

    const nextRows=(r||[]) as GridRow[];
    const nextSessions=(s||[]) as Session[];
    setRows(nextRows);setSessions(nextSessions);

    if(!nextSessions.length){setSessionPlayers({});setResults({});return}
    const sessionIds=nextSessions.map(x=>x.id);
    const [{data:sp,error:spe},{data:res,error:rse}]=await Promise.all([
      supabase.from(tables.sessionPlayers).select("id,session_id,player_id").in("session_id",sessionIds),
      supabase.from(tables.results).select("id,session_id,row_id,player_id,made,attempted").in("session_id",sessionIds)
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
    const gridQuery=scopeType==="institution"
      ? supabase.from(tables.grids).select("id,structure_id,owner_id,name,description,input_mode,fixed_value,court_schema_url,court_schema_data,created_at,updated_at").eq("structure_id",effectiveScopeId)
      : supabase.from(tables.grids).select("id,team_id,owner_id,name,description,input_mode,fixed_value,court_schema_url,court_schema_data,created_at,updated_at").eq("team_id",teamId);
    const {data,error}=await gridQuery.order("updated_at",{ascending:false});
    if(error)throw error;
    const list=(data||[]) as Grid[];
    setGrids(list);
    const id=preferred&&list.some(g=>g.id===preferred)?preferred:(list.some(g=>g.id===selectedGridId)?selectedGridId:list[0]?.id||"");
    setSelectedGridId(id);
    await loadDetails(id);
  },[loadDetails,selectedGridId,supabase,teamId,scopeType,effectiveScopeId]);

  useEffect(()=>{void (async()=>{
    try{
      const preferred=requestedGridIdFromLocation();
      await loadGrids(preferred||undefined);
      if(preferred&&typeof window!=="undefined"){
        localStorage.removeItem("mybasket_shooting_grid_return_id");
        restoreShootingScroll();
      }
    }catch(e){
      console.error(e);
      toast("Impossible de charger les grilles.");
    }finally{
      setLoading(false);
    }
  })()},[teamId,scopeType,effectiveScopeId]); // eslint-disable-line

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
        const {error}=await supabase.from(tables.grids).update({
          court_schema_url:image,
          court_schema_data:parsed,
          updated_at:new Date().toISOString()
        }) .eq("id",pending)
        .eq(scopeType==="institution"?"structure_id":"team_id",effectiveScopeId);
        if(error)throw error;
        localStorage.removeItem("mybasket_shooting_grid_pending");
        localStorage.removeItem("mybasket_plaquette_result");
        await loadGrids(pending);
        restoreShootingScroll();
        toast("Schéma Plaquette ajouté à la grille ✓");
      }catch(e){console.error(e)}
    })();
  },[loadGrids,supabase,teamId,scopeType,effectiveScopeId]);

  async function createGrid(){
    if(!canEdit||!userId)return;
    setSaving(true);
    try{
      const {data:g,error}=await supabase.from(tables.grids).insert({
        ...(scopeType==="institution"?{structure_id:effectiveScopeId}:{team_id:teamId}),owner_id:userId,name:"Nouvelle grille de tir",description:"",
        input_mode:"fixed_attempts",fixed_value:10
      }).select("*").single();
      if(error)throw error;
      const {error:rowError}=await supabase.from(tables.rows).insert(DEFAULT_ROWS.map((name,i)=>({grid_id:g.id,name,sort_order:i,target_attempts:10})));
      if(rowError)throw rowError;
      await loadGrids(g.id);toast("Grille créée.");
    }catch(e){console.error(e);toast("Impossible de créer la grille.")}finally{setSaving(false)}
  }

  function patchGrid(patch:Partial<Grid>){
    if(!grid)return;
    setGrids(cur=>cur.map(g=>g.id===grid.id?{...g,...patch}:g));
  }

  async function copyTextSafely(value:string){
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(value);
        return true;
      }
    }catch(e){console.warn("Clipboard API indisponible, utilisation du fallback.",e)}
    try{
      const input=document.createElement("textarea");
      input.value=value;
      input.setAttribute("readonly","");
      input.style.position="fixed";
      input.style.opacity="0";
      document.body.appendChild(input);
      input.select();
      const copied=document.execCommand("copy");
      document.body.removeChild(input);
      return copied;
    }catch(e){console.warn("Copie du lien impossible.",e);return false}
  }

  async function ensureShareLink(target:Grid){
    if(scopeType!=="team")return;
    setShareBusy(true);
    try{
      const token=target.share_token||crypto.randomUUID().replaceAll("-","");
      const {error}=await supabase.from("shooting_grids").update({share_token:token,share_enabled:true}).eq("id",target.id);
      if(error)throw error;

      setGrids(cur=>cur.map(g=>g.id===target.id?{...g,share_token:token,share_enabled:true}:g));
      const url=`${window.location.origin}/tir/${token}`;
      const copied=await copyTextSafely(url);

      if(copied){
        toast(target.share_enabled?"Lien joueur copié ✓":"Lien joueur généré et copié ✓");
      }else{
        // Le lien est bien créé en base : ne jamais afficher "Impossible de générer".
        window.prompt("Lien joueur généré. Copie ce lien :",url);
        toast("Lien joueur généré ✓");
      }
    }catch(e){
      console.error("Erreur génération lien grille de tir",e);
      const message=e instanceof Error?e.message:"";
      if(message.toLowerCase().includes("share_token")||message.toLowerCase().includes("share_enabled")){
        toast("Base de données à mettre à jour pour activer les liens.");
      }else{
        toast("Impossible de générer le lien.");
      }
    }finally{setShareBusy(false)}
  }

  async function disableShareLink(target:Grid){
    if(scopeType!=="team")return;
    const {error}=await supabase.from("shooting_grids").update({share_enabled:false}).eq("id",target.id);
    if(error)return toast("Impossible de désactiver le lien.");
    setGrids(cur=>cur.map(g=>g.id===target.id?{...g,share_enabled:false}:g));
    toast("Lien désactivé.");
  }

  async function saveDefinition(){
    if(!grid||!canEdit)return;
    setSaving(true);
    try{
      const {error}=await supabase.from(tables.grids).update({
        name:grid.name.trim()||"Grille de tir",
        description:grid.description?.trim()||null,
        input_mode:grid.input_mode,
        fixed_value:Math.max(1,safeInt(grid.fixed_value)),
        updated_at:new Date().toISOString()
      }).eq("id",grid.id);
      if(error)throw error;

      for(let i=0;i<rows.length;i++){
        const row=rows[i];
        const {error:re}=await supabase.from(tables.rows).update({name:row.name.trim()||`Position ${i+1}`,sort_order:i}).eq("id",row.id);
        if(re)throw re;
      }
      await loadGrids(grid.id);toast("Modèle enregistré ✓");
    }catch(e){console.error(e);toast("Erreur pendant l'enregistrement.")}finally{setSaving(false)}
  }

  async function addRow(){
    if(!grid||!canEdit)return;
    const {data,error}=await supabase.from(tables.rows).insert({grid_id:grid.id,name:`Position ${rows.length+1}`,sort_order:rows.length,target_attempts:grid.fixed_value}).select("id,grid_id,name,sort_order").single();
    if(error)return alert(error.message);
    setRows(cur=>[...cur,data as GridRow]);
  }

  async function removeRow(id:string){
    if(!canEdit||rows.length<=1)return;
    if(!window.confirm("Supprimer ce spot et tous ses résultats ?"))return;
    const {error}=await supabase.from(tables.rows).delete().eq("id",id);
    if(error)return alert(error.message);
    setRows(cur=>cur.filter(r=>r.id!==id));
  }

  async function moveRow(id:string,direction:-1|1){
    if(!canEdit)return;
    const index=rows.findIndex(r=>r.id===id);
    const target=index+direction;
    if(index<0||target<0||target>=rows.length)return;

    const next=[...rows];
    [next[index],next[target]]=[next[target],next[index]];
    const reordered=next.map((row,i)=>({...row,sort_order:i}));
    setRows(reordered);

    const responses=await Promise.all(
      reordered.map(row=>supabase.from(tables.rows).update({sort_order:row.sort_order}).eq("id",row.id))
    );
    const error=responses.find(r=>r.error)?.error;
    if(error){
      console.error(error);
      toast("Impossible d'enregistrer le nouvel ordre.");
      await loadDetails(grid?.id||"");
      return;
    }
    toast("Ordre des spots enregistré ✓");
  }

  function openPlaquette(){
    if(!grid||typeof window==="undefined")return;

    const returnUrl=new URL(window.location.href);
    returnUrl.searchParams.set("tab","shooting");
    returnUrl.searchParams.set("shootingGrid",grid.id);
    returnUrl.hash="shooting-grid-tool";

    localStorage.setItem("mybasket_shooting_grid_pending",grid.id);
    localStorage.setItem("mybasket_shooting_grid_return_id",grid.id);
    localStorage.setItem("mybasket_shooting_grid_scroll_y",String(window.scrollY));
    localStorage.setItem("mb_plaquette_return_to",`${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
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

      const displayRows=orderedShotRows(rows);
      const grouped=groupRows(displayRows);
      const tableX=margin;
      const tableY=schemaData?47:34;
      const playerW=29;
      const totalW=18;
      const usableW=pageW-margin*2-playerW-totalW;
      const spotW=usableW/Math.max(1,displayRows.length);
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
      for(const row of displayRows){
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
      for(const row of displayRows){
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
      const {data:s,error}=await supabase.from(tables.sessions).insert({grid_id:grid.id,owner_id:userId,session_date:newDate}).select("*").single();
      if(error)throw error;
      const {error:pe}=await supabase.from(tables.sessionPlayers).insert(selectedPlayers.map(pid=>({session_id:s.id,player_id:pid})));
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
        const {error:re}=await supabase.from(tables.results).insert(seed);
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
      const {error}=await supabase.from(tables.results).upsert(rowsToSave,{onConflict:"session_id,row_id,player_id"});
      if(error)throw error;
      toast("Résultats enregistrés ✓");
      await loadDetails(grid.id);
    }catch(e:any){console.error(e);alert(e?.message||"Erreur sauvegarde.")}finally{setSaving(false)}
  }

  async function deleteSession(session:Session){
    if(!canEdit||!window.confirm(`Supprimer la session du ${fmtDate(session.session_date)} ?`))return;
    const {error}=await supabase.from(tables.sessions).delete().eq("id",session.id);
    if(error)return alert(error.message);
    if(grid)await loadDetails(grid.id);
  }

  async function saveSessionGroup(items:Session[]){
    for(const session of items) await saveSession(session);
  }
  async function deletePlayerFromSessionGroup(items:Session[],playerId:string){
    if(!canEdit||!items.length)return;
    const player=players.find(p=>String(p.id)===playerId);
    if(!window.confirm(`Supprimer ${player?playerName(player):"ce joueur"} de la session du ${fmtDate(items[0].session_date)} ?`))return;
    for(const session of items){
      if(!(sessionPlayers[session.id]||[]).includes(playerId))continue;
      const {error:re}=await supabase.from(tables.results).delete().eq("session_id",session.id).eq("player_id",playerId);
      if(re){setMessage(re.message);return;}
      const {error:pe}=await supabase.from(tables.sessionPlayers).delete().eq("session_id",session.id).eq("player_id",playerId);
      if(pe){setMessage(pe.message);return;}
      if((sessionPlayers[session.id]||[]).length<=1){
        const {error:se}=await supabase.from(tables.sessions).delete().eq("id",session.id);
        if(se){setMessage(se.message);return;}
      }
    }
    await loadDetails(selectedGridId); toast("Joueur retiré de la session ✓");
  }

  async function deleteSessionGroup(items:Session[]){
    if(!canEdit||!items.length||!window.confirm(`Supprimer toute la session du ${fmtDate(items[0].session_date)} (${items.length} tableau(x)) ?`))return;
    for(const session of items){
      const {error}=await supabase.from(tables.sessions).delete().eq("id",session.id);
      if(error){setMessage(error.message);return;}
    }
    await loadDetails(selectedGridId);
  }

  async function deleteGrid(){
    if(!grid||!canEdit||!window.confirm(`Supprimer "${grid.name}" ?`))return;
    const {error}=await supabase.from(tables.grids).delete().eq("id",grid.id);
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

  const sessionsByDate=useMemo(()=>{
    const map=new Map<string,Session[]>();
    for(const session of sessions){
      const list=map.get(session.session_date)||[]; list.push(session); map.set(session.session_date,list);
    }
    return Array.from(map.entries()).map(([date,items])=>({date,items}));
  },[sessions]);

  const shotsForSessions=useCallback((items:Session[]):ShotLike[]=>{
    const out:ShotLike[]=[];
    for(const session of items){
      for(const pid of sessionPlayers[session.id]||[]){
        for(const row of displayRows){
          const r=results[session.id]?.[pid]?.[row.id]; if(!r)continue;
          const zoneId=rowZoneId(row); if(!zoneId)continue;
          const zone=SHOT_ZONES.find(z=>z.id===zoneId); if(!zone)continue;
          const made=safeInt(r.made), attempted=safeInt(r.attempted);
          for(let i=0;i<attempted;i++) out.push({shot_type:zone.type,shot_result:i<made?"made":"missed",shot_zone_id:zone.id,court_x:zone.cx,court_y:zone.cy});
        }
      }
    }
    return out;
  },[displayRows,results,sessionPlayers]);

  if(loading)return <div style={{padding:22,color:MUTED}}>Chargement des grilles…</div>;

  return (
    <section id="shooting-grid-tool" style={{display:"grid",gap:12,scrollMarginTop:18}}>
      {message&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:"#251B18",color:"#fff",padding:"10px 17px",borderRadius:999,fontWeight:900}}>{message}</div>}

      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <div>
          <span style={eyebrow}>GRILLES DE TIR</span>
          <h2 style={{margin:"4px 0",color:BORDEAUX}}>Créer · tester · suivre la progression</h2>
          <p style={{margin:0,color:MUTED,fontSize:11}}>Une grille équipe peut être remplie par plusieurs joueurs et alimente automatiquement leur fiche individuelle.</p>
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {grid&&<button onClick={exportBlankPdf} style={secondary}>📄 Exporter grille vierge A4</button>}
          {grid&&scopeType==="team"&&<button onClick={()=>void ensureShareLink(grid)} disabled={shareBusy} style={secondary}>🔗 {grid.share_enabled?"Copier le lien joueur":"Générer le lien joueur"}</button>}
        </div>
      </div>

      {!grids.length?(
        <div style={empty}>
          <strong style={{color:BORDEAUX}}>Aucune grille pour cette équipe.</strong>
          <span>Crée ton premier modèle : nombre de tentés imposé ou nombre de marqués imposé.</span>
        </div>
      ):(
        <>
          <div style={{...card,padding:"11px 12px",display:"grid",gridTemplateColumns:"minmax(220px,420px) minmax(0,1fr) auto",gap:10,alignItems:"end"}}>
            <div className="shooting-tabs" style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:10,gridColumn:"1 / -1"}}>
              <button type="button" onClick={()=>setShootingView("editor")} style={{...chip,...(shootingView==="editor"?activeChip:{})}}>✏️ Créer / modifier</button>
              <button type="button" onClick={()=>setShootingView("library")} style={{...chip,...(shootingView==="library"?activeChip:{})}}>📚 Grilles de tir créées ({grids.length})</button>
            </div>
            {shootingView==="library"&&(
              <div style={{...card,marginBottom:12}}>
                <span style={eyebrow}>MES GRILLES DE TIR</span>
                <h3 style={title}>Choisis une grille à consulter ou à utiliser</h3>
                <div className="shooting-library" style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8}}>
                  {grids.map(g=>(
                    <div key={g.id} role="button" tabIndex={0} onClick={()=>{setSelectedGridId(g.id);void loadDetails(g.id);setShootingView("editor")}}
                      style={{textAlign:"left",border:`1px solid ${g.id===selectedGridId?GOLD:BORDER}`,borderRadius:12,background:g.id===selectedGridId?"#FFF8E9":"#fff",padding:12,cursor:"pointer"}}>
                      <b style={{display:"block",color:BORDEAUX,fontSize:13}}>{g.name}</b>
                      <span style={{display:"block",marginTop:4,color:MUTED,fontSize:10,lineHeight:1.35}}>{g.description||"Aucune consigne"}</span>
                      <span style={{display:"block",marginTop:8,color:TEXT,fontSize:9,fontWeight:900}}>Ouvrir la grille →</span>
                      {scopeType==="team"&&<span style={{display:"flex",gap:5,marginTop:9,flexWrap:"wrap"}} onClick={e=>e.stopPropagation()}>
                        <button type="button" disabled={shareBusy} onClick={()=>void ensureShareLink(g)} style={{...secondary,padding:"6px 8px",fontSize:9}}>🔗 {g.share_enabled?"Copier le lien":"Générer le lien"}</button>
                        {g.share_enabled&&<button type="button" onClick={()=>void disableShareLink(g)} style={{...secondary,padding:"6px 8px",fontSize:9}}>Désactiver</button>}
                      </span>}
                    </div>
                  ))}
                  {!grids.length&&<div style={{color:MUTED,fontSize:11}}>Aucune grille créée.</div>}
                </div>
              </div>
            )}
            {shootingView==="editor"&&(<>
            <label style={{...field,margin:0}}>
              <span>Choisir une grille de tir</span>
              <select
                value={selectedGridId}
                onChange={e=>{
                  const id=e.target.value;
                  setSelectedGridId(id);
                  void loadDetails(id);
                }}
                style={{...input,height:40,background:"#fff",fontWeight:900,color:BORDEAUX}}
              >
                {grids.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <div style={{color:MUTED,fontSize:10,lineHeight:1.45,paddingBottom:4}}>
              <b style={{color:TEXT}}>Bibliothèque de modèles.</b> Chaque grille conserve son nom, ses spots, leur ordre, son mode de saisie et son schéma Plaquette.
            </div>
            {canEdit&&<button onClick={createGrid} disabled={saving} style={primary}>+ Créer une grille</button>}
            </>)}
          </div>

          {shootingView==="editor"&&(<>
          {grid&&(
            <>
              <div className="shooting-editor-grid" style={{display:"grid",gridTemplateColumns:"minmax(0,1.1fr) minmax(320px,.9fr)",gap:12}}>
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
                      {canEdit&&<div style={{display:"flex",gap:6}}><button onClick={addRow} style={secondary}>+ Spot</button><button disabled={!selectedRowId} onClick={()=>selectedRowId&&removeRow(selectedRowId).then(()=>setSelectedRowId(""))} style={{...danger,opacity:selectedRowId?1:.4}}>Supprimer la ligne sélectionnée</button></div>}
                    </div>
                    <div style={{display:"grid",gap:5,marginTop:7}}>
                      {rows.map((row,i)=><div key={row.id} onClick={()=>setSelectedRowId(row.id)} className="shooting-spot-row" style={{display:"grid",gridTemplateColumns:"32px 112px minmax(0,1fr) 72px",gap:6,alignItems:"center",padding:4,borderRadius:9,cursor:"pointer",outline:selectedRowId===row.id?`2px solid ${GOLD}`:"2px solid transparent",background:selectedRowId===row.id?"#FFF9EE":"transparent"}}>
                        <span style={{width:28,height:28,borderRadius:8,background:"#FFF4DE",color:BORDEAUX,display:"grid",placeItems:"center",fontWeight:1000}}>{i+1}</span>
                        <select aria-label={`Catégorie de ${spotLabel(row.name)}`} value={shotGroup(row.name)}
                          onChange={e=>setRows(cur=>cur.map(r=>r.id===row.id?{...r,name:withShotGroup(r.name,e.target.value as ShotGroup)}:r))}
                          disabled={!canEdit} style={{...input,padding:"8px 6px",fontSize:10,fontWeight:900,color:BORDEAUX}}>
                          {SHOT_GROUPS.map(g=><option key={g.value} value={g.value}>{g.label}</option>)}
                        </select>
                        <input value={spotLabel(row.name)} onChange={e=>setRows(cur=>cur.map(r=>r.id===row.id?{...r,name:withShotGroup(e.target.value,shotGroup(r.name))}:r))} disabled={!canEdit} style={input}/>
                        {canEdit&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                          <button type="button" title="Monter ce spot" aria-label={`Monter ${row.name}`} disabled={i===0} onClick={()=>void moveRow(row.id,-1)} style={{...orderButton,opacity:i===0?0.35:1}}>↑</button>
                          <button type="button" title="Descendre ce spot" aria-label={`Descendre ${row.name}`} disabled={i===rows.length-1} onClick={()=>void moveRow(row.id,1)} style={{...orderButton,opacity:i===rows.length-1?0.35:1}}>↓</button>
                        </div>}
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
                <div className="shooting-session-grid" style={{display:"grid",gridTemplateColumns:"160px minmax(0,1fr) auto",gap:10,alignItems:"start"}}>
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

              {sessionsByDate.map(group=>{
                const uniquePids=Array.from(new Set(group.items.flatMap(s=>sessionPlayers[s.id]||[])));
                const sessionShots=shotsForSessions(group.items);
                return (
                  <div key={group.date} style={{...card,padding:0,overflow:"hidden"}}>
                    <div style={{padding:"12px 14px",display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",background:"#FFF9F1",borderBottom:`1px solid ${BORDER}`}}>
                      <div><span style={eyebrow}>SESSION</span><strong style={{display:"block",fontSize:14,color:TEXT,marginTop:3}}>{fmtDate(group.date)} · {grid.name}</strong><span style={{fontSize:10,color:MUTED}}>{uniquePids.length} joueur(s) · tous les résultats de cette date réunis</span></div>
                      <div style={{display:"flex",gap:6}}>{canEdit&&<><button onClick={()=>void saveSessionGroup(group.items)} style={primary}>Enregistrer la session</button><button onClick={()=>void deleteSessionGroup(group.items)} style={danger}>Supprimer la session</button></>}</div>
                    </div>
                    <div className="shooting-session-summary" style={{display:"grid",gridTemplateColumns:"330px minmax(0,1fr)",gap:14,padding:14,alignItems:"start"}}>
                      <div style={{border:`1px solid ${BORDER}`,borderRadius:14,padding:10,background:SOFT}}>
                        <ShotChart mode="analysis" size="lg" shots={sessionShots} showStats showLabels={false} showDots={false}/>
                        <div style={{fontSize:9,color:MUTED,textAlign:"center",marginTop:6}}>Même Shot Chart que LiveStat · cumul de tous les joueurs de la session</div>
                      </div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{borderCollapse:"collapse",width:"100%",minWidth:760,fontSize:10}}>
                          <thead><tr><th style={{...th,textAlign:"left"}}>Joueur</th>{displayRows.map(r=><th key={r.id} style={th}>{compactSpotLabel(r.name)}</th>)}<th style={th}>TM</th><th style={th}>TT</th><th style={th}>%</th></tr></thead>
                          <tbody>{uniquePids.map(pid=>{
                            let tm=0,ta=0;
                            const byRow=displayRows.map(row=>{let m=0,a=0;for(const session of group.items){const r=results[session.id]?.[pid]?.[row.id];if(r){m+=safeInt(r.made);a+=safeInt(r.attempted)}}tm+=m;ta+=a;return {row,m,a}});
                            const player=players.find(p=>String(p.id)===pid);
                            return <tr key={pid}><td style={{...td,textAlign:"left",fontWeight:900}}><span style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}><span>{player?playerName(player):"Joueur"}</span>{canEdit&&<button title="Supprimer uniquement ce joueur de cette session" onClick={()=>void deletePlayerFromSessionGroup(group.items,pid)} style={{border:"1px solid #E7C9C9",background:"#FFF7F7",color:"#A02A2A",width:22,height:22,borderRadius:7,cursor:"pointer",fontWeight:1000,lineHeight:1}}>×</button>}</span></td>{byRow.map(x=><td key={x.row.id} style={td}>{x.m}/{x.a} · <b>{pct(x.m,x.a)}%</b></td>)}<td style={td}><b>{tm}</b></td><td style={td}><b>{ta}</b></td><td style={{...td,fontWeight:1000,color:BORDEAUX}}>{pct(tm,ta)}%</td></tr>
                          })}</tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              })}

              {!!sessions.length&&(
                <div style={{...card,padding:0,overflow:"hidden"}}>
                  <div style={{padding:"12px 14px",borderBottom:`1px solid ${BORDER}`,display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                    <div><span style={eyebrow}>RÉCAPITULATIF JOUEURS</span><h3 style={title}>{grid.name} · synthèse par joueur</h3><div style={{fontSize:10,color:MUTED}}>Une ligne = un joueur. Sessions = nombre de fois où cette grille a été réalisée.</div></div>
                    <div style={{display:"flex",gap:4,padding:3,border:`1px solid ${BORDER}`,borderRadius:10,background:SOFT}}>
                      <button onClick={()=>setRecapMode("average")} style={{...secondary,padding:"6px 9px",background:recapMode==="average"?BORDEAUX:"#fff",color:recapMode==="average"?"#fff":TEXT}}>Moyennes</button>
                      <button onClick={()=>setRecapMode("total")} style={{...secondary,padding:"6px 9px",background:recapMode==="total"?BORDEAUX:"#fff",color:recapMode==="total"?"#fff":TEXT}}>Totaux</button>
                    </div>
                  </div>
                  <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",minWidth:900,fontSize:10}}>
                    <thead><tr><th style={{...th,textAlign:"left"}}>Joueur</th><th style={th}>Sessions</th>{shootingRows.map(r=><th key={r.id} style={th}>{compactSpotLabel(r.name)}</th>)}<th style={th}>{recapMode==="average"?"TM moy.":"TM"}</th><th style={th}>{recapMode==="average"?"TT moy.":"TT"}</th><th style={th}>%</th><th style={th}>LF {recapMode==="average"?"moy.":"total"}</th><th style={th}>LF %</th></tr></thead>
                    <tbody>{Object.keys(aggregate).map(pid=>{
                      const player=players.find(p=>String(p.id)===pid);
                      const count=sessions.filter(s=>(sessionPlayers[s.id]||[]).includes(pid)).length||1;
                      const total=aggregate[pid];
                      const fmtCell=(m:number,a:number)=>recapMode==="average"?`${(m/count).toFixed(1)}/${(a/count).toFixed(1)} · ${pct(m,a)}%`:`${m}/${a} · ${pct(m,a)}%`;
                      const shot=shootingRows.reduce((a,row)=>{const x=total.byRow[row.id]||{made:0,attempted:0};a.m+=x.made;a.a+=x.attempted;return a},{m:0,a:0}); const lf=freeThrowRows.reduce((a,row)=>{const x=total.byRow[row.id]||{made:0,attempted:0};a.m+=x.made;a.a+=x.attempted;return a},{m:0,a:0}); return <tr key={pid}><td style={{...td,textAlign:"left",fontWeight:1000,color:BORDEAUX}}>{player?playerName(player):"Joueur"}</td><td style={{...td,fontWeight:1000}}>{count}</td>{shootingRows.map(row=>{const x=total.byRow[row.id]||{made:0,attempted:0};return <td key={row.id} style={td}>{fmtCell(x.made,x.attempted)}</td>})}<td style={{...td,fontWeight:900}}>{recapMode==="average"?(shot.m/count).toFixed(1):shot.m}</td><td style={{...td,fontWeight:900}}>{recapMode==="average"?(shot.a/count).toFixed(1):shot.a}</td><td style={{...td,fontWeight:1000,color:BORDEAUX}}>{pct(shot.m,shot.a)}%</td><td style={{...td,fontWeight:900}}>{recapMode==="average"?`${(lf.m/count).toFixed(1)}/${(lf.a/count).toFixed(1)}`:`${lf.m}/${lf.a}`}</td><td style={{...td,fontWeight:1000,color:BORDEAUX}}>{pct(lf.m,lf.a)}%</td></tr>
                    })}</tbody>
                  </table></div>
                </div>
              )}
            </>
          )}
          </>)}
        </>
      )}
      {scopeType==="team"&&<ShootingComparison teamId={teamId} players={players}/>}
      <style jsx>{`
        @media (max-width: 900px) {
          .shooting-editor-grid { grid-template-columns: 1fr !important; }
          .shooting-session-grid { grid-template-columns: 1fr !important; }
          .shooting-session-summary { grid-template-columns: 1fr !important; }
          .shooting-library { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
        }
        @media (max-width: 620px) {
          .shooting-library { grid-template-columns: 1fr !important; }
          .shooting-spot-row { grid-template-columns: 30px minmax(0,1fr) 62px 32px !important; }
          .shooting-spot-row > select { grid-column: 2 / 5; grid-row: 1; }
          .shooting-spot-row > input { grid-column: 2 / 3; grid-row: 2; }
          .shooting-spot-row > div { grid-column: 3 / 4; grid-row: 2; }
          .shooting-spot-row > button { grid-column: 4 / 5; grid-row: 2; }
          .shooting-tabs button { flex: 1 1 150px; }
        }
      `}</style>
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
const activeChip:React.CSSProperties={background:BORDEAUX,color:"#fff",border:`1px solid ${BORDEAUX}`};
const modeCard:React.CSSProperties={display:"grid",gap:5,textAlign:"left",border:`1px solid ${BORDER}`,borderRadius:12,background:"#fff",padding:12,cursor:"pointer",color:TEXT};
const modeActive:React.CSSProperties={borderColor:GOLD,background:"#FFF8E9",boxShadow:"inset 0 0 0 1px #E7BB63"};
const playerChip:React.CSSProperties={border:`1px solid ${BORDER}`,borderRadius:999,background:"#fff",color:TEXT,padding:"6px 9px",fontSize:10,fontWeight:800,cursor:"pointer"};
const playerChipActive:React.CSSProperties={background:"#FFF3DB",borderColor:GOLD,color:BORDEAUX};
const orderButton:React.CSSProperties={height:34,border:`1px solid ${BORDER}`,borderRadius:9,background:"#fff",color:BORDEAUX,fontWeight:1000,cursor:"pointer",fontSize:16};
const trash:React.CSSProperties={width:32,height:32,border:`1px solid #E6C5C2`,borderRadius:8,background:"#FFF8F7",color:"#A72D26",cursor:"pointer"};
const trashBig:React.CSSProperties={...trash,width:36,height:36};
const th:React.CSSProperties={padding:"8px 7px",borderRight:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,background:"#F7F2EE",textAlign:"center",color:"#594A45",fontWeight:1000};
const subTh:React.CSSProperties={...th,padding:"6px 5px",fontSize:8,background:"#FBF8F6"};
const td:React.CSSProperties={padding:"7px 5px",borderRight:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,textAlign:"center",verticalAlign:"middle"};
const tableInput:React.CSSProperties={width:54,border:`1px solid ${BORDER}`,borderRadius:7,padding:"5px 4px",textAlign:"center",fontWeight:900,color:TEXT,background:"#fff"};
const fixedInput:React.CSSProperties={background:"#F3EEE9",color:"#8B7D75",borderColor:"#E9E0DA"};
const empty:React.CSSProperties={...card,display:"grid",gap:4,textAlign:"center",padding:30,color:MUTED};
