"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LiveStatShotChart, { type ShotLike } from "@/components/prise-stats-pro/ShotChart";
import ShootingComparison from "@/components/shooting/ShootingComparison";
import type { Player } from "@/types/player";

type Grid = { id:string; name:string; court_schema_url:string|null };
type Row = { id:string; grid_id:string; name:string; sort_order:number };
type Session = { id:string; grid_id:string; session_date:string };
type Result = { id:string; session_id:string; row_id:string; player_id:string; made:number; attempted:number };

const B="#6B1A2C", G="#D4A24C", BD="#E8DDD7", M="#7B6E68", SOFT="#FBF7F3";
const pct=(m:number,a:number)=>a?Math.round(m/a*1000)/10:0;
const fmt=(v:string)=>new Date(`${v}T12:00:00`).toLocaleDateString("fr-FR");
const sum=(rs:Result[])=>({made:rs.reduce((n,r)=>n+r.made,0),attempted:rs.reduce((n,r)=>n+r.attempted,0)});
const norm=(v:string)=>v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\b(2pts?|3pts?)\b/g,"").replace(/[^a-z0-9]+/g," ").trim();

/** Associe les spots nommés d'une grille aux zones OFFICIELLES de la ShotChart LiveStat. */
function liveZoneForRow(name:string):{zone:string;type:"2PTS"|"3PTS"}|null{
  const n=name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if(n.includes("lf")||n.includes("lancer")) return null;
  const is3=n.includes("3pt")||n.includes("3 pts")||n.includes("3pts");
  if(is3){
    if(n.includes("corner droit")) return {zone:"z10",type:"3PTS"};
    if(n.includes("aile droite")) return {zone:"z11",type:"3PTS"};
    if(n.includes("axe")) return {zone:"z13",type:"3PTS"};
    if(n.includes("aile gauche")) return {zone:"z15",type:"3PTS"};
    if(n.includes("corner gauche")) return {zone:"z16",type:"3PTS"};
  }
  if(n.includes("corner droit")) return {zone:"z9",type:"2PTS"};
  if(n.includes("aile droite")) return {zone:"z8",type:"2PTS"};
  if(n.includes("axe")) return {zone:"z7",type:"2PTS"};
  if(n.includes("aile gauche")) return {zone:"z6",type:"2PTS"};
  if(n.includes("corner gauche")) return {zone:"z5",type:"2PTS"};
  return null;
}

function toLiveShots(rows:Row[],results:Result[]):ShotLike[]{
  const rowMap=new Map(rows.map(r=>[r.id,r]));
  const shots:ShotLike[]=[];
  for(const r of results){
    const row=rowMap.get(r.row_id); if(!row) continue;
    const z=liveZoneForRow(row.name); if(!z) continue;
    const made=Math.max(0,Math.min(r.made,r.attempted));
    for(let i=0;i<r.attempted;i++) shots.push({shot_type:z.type,shot_result:i<made?"made":"missed",shot_zone_id:z.zone});
  }
  return shots;
}

function GridBlock({grid,rows,sessions,results}:{grid:Grid;rows:Row[];sessions:Session[];results:Result[]}){
  const [chartSession,setChartSession]=useState("all");
  const sessionIds=new Set(sessions.map(s=>s.id));
  const gridResults=results.filter(r=>sessionIds.has(r.session_id));
  const chartResults=chartSession==="all"?gridResults:gridResults.filter(r=>r.session_id===chartSession);
  const total=sum(gridResults);
  const liveShots=toLiveShots(rows,chartResults);

  return <article style={card}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start",flexWrap:"wrap"}}>
      <div><span style={eye}>ANALYSE PAR GRILLE</span><h3 style={{margin:"4px 0",color:B,fontSize:18}}>{grid.name}</h3><span style={{fontSize:11,color:M}}>{sessions.length} session(s) · {total.made}/{total.attempted} · <b>{pct(total.made,total.attempted)}%</b></span></div>
      <select value={chartSession} onChange={e=>setChartSession(e.target.value)} style={select}>
        <option value="all">Shot chart · toutes les sessions</option>
        {sessions.map(s=><option key={s.id} value={s.id}>Shot chart · {fmt(s.session_date)}</option>)}
      </select>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"minmax(260px,.72fr) minmax(0,1.8fr)",gap:18,marginTop:14,alignItems:"start"}}>
      <div style={{background:SOFT,border:`1px solid ${BD}`,borderRadius:14,padding:10}}>
        <LiveStatShotChart mode="analysis" size="md" shots={liveShots} showStats showDots={false}/>
        <div style={{textAlign:"center",marginTop:8,fontSize:10,color:M}}>{chartSession==="all"?"Cumul de la grille":"Session sélectionnée"} · les % utilisent les zones LiveStat</div>
      </div>

      <div style={{overflowX:"auto",border:`1px solid ${BD}`,borderRadius:12}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,whiteSpace:"nowrap"}}>
          <thead><tr><th style={{...th,textAlign:"left",position:"sticky",left:0,zIndex:2}}>Date</th>{rows.map(r=><th key={r.id} style={th}>{r.name}</th>)}<th style={th}>Total</th><th style={th}>%</th></tr></thead>
          <tbody>
            {sessions.map(s=>{
              const sr=gridResults.filter(r=>r.session_id===s.id), st=sum(sr);
              return <tr key={s.id} onClick={()=>setChartSession(s.id)} style={{cursor:"pointer",background:chartSession===s.id?"#FFF8E9":"#fff"}}>
                <td style={{...td,textAlign:"left",fontWeight:800,color:B,position:"sticky",left:0,background:"inherit"}}>{fmt(s.session_date)}</td>
                {rows.map(row=>{const rr=sr.find(r=>r.row_id===row.id);return <td key={row.id} style={td}>{rr&&rr.attempted?`${rr.made}/${rr.attempted} · ${pct(rr.made,rr.attempted)}%`:"—"}</td>})}
                <td style={{...td,fontWeight:900}}>{st.made}/{st.attempted}</td><td style={{...td,fontWeight:1000,color:B}}>{pct(st.made,st.attempted)}%</td>
              </tr>
            })}
            <tr onClick={()=>setChartSession("all")} style={{cursor:"pointer",background:"#F7F2EE"}}>
              <td style={{...td,textAlign:"left",fontWeight:1000,color:B,position:"sticky",left:0,background:"#F7F2EE"}}>TOTAL / MOY.</td>
              {rows.map(row=>{const rr=gridResults.filter(r=>r.row_id===row.id),x=sum(rr);return <td key={row.id} style={{...td,fontWeight:900}}>{x.attempted?`${x.made}/${x.attempted} · ${pct(x.made,x.attempted)}%`:"—"}</td>})}
              <td style={{...td,fontWeight:1000}}>{total.made}/{total.attempted}</td><td style={{...td,fontWeight:1000,color:B}}>{pct(total.made,total.attempted)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </article>
}

function AllGridsBySpot({grids,rows,sessions,results}:{grids:Grid[];rows:Row[];sessions:Session[];results:Result[]}){
  const spotKeys=Array.from(new Map(rows.map(r=>[norm(r.name),r.name])).entries()).filter(([k])=>k).map(([key,label])=>({key,label}));
  const sessionGrid=new Map(sessions.map(s=>[s.id,s.grid_id]));
  const grand=sum(results);
  return <article style={card}>
    <span style={eye}>ANALYSE GLOBALE</span><h3 style={{margin:"4px 0",color:B,fontSize:18}}>Toutes les grilles par spot</h3>
    <p style={{margin:"0 0 12px",fontSize:11,color:M}}>Une ligne par grille. Les spots portant le même nom sont rapprochés pour comparer les performances, sans modifier les données d'origine.</p>
    <div style={{overflowX:"auto",border:`1px solid ${BD}`,borderRadius:12}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:10,whiteSpace:"nowrap"}}>
      <thead><tr><th style={{...th,textAlign:"left",position:"sticky",left:0,zIndex:2}}>Grille</th>{spotKeys.map(s=><th key={s.key} style={th}>{s.label}</th>)}<th style={th}>Total</th><th style={th}>%</th></tr></thead>
      <tbody>{grids.map(g=>{
        const gRows=rows.filter(r=>r.grid_id===g.id); const ids=new Set(gRows.map(r=>r.id));
        const gr=results.filter(r=>ids.has(r.row_id)&&sessionGrid.get(r.session_id)===g.id); const gt=sum(gr);
        return <tr key={g.id}><td style={{...td,textAlign:"left",fontWeight:900,color:B,position:"sticky",left:0,background:"#fff"}}>{g.name}</td>{spotKeys.map(sp=>{const rowIds=new Set(gRows.filter(r=>norm(r.name)===sp.key).map(r=>r.id));const x=sum(gr.filter(r=>rowIds.has(r.row_id)));return <td key={sp.key} style={td}>{x.attempted?`${x.made}/${x.attempted} · ${pct(x.made,x.attempted)}%`:"—"}</td>})}<td style={{...td,fontWeight:900}}>{gt.made}/{gt.attempted}</td><td style={{...td,fontWeight:1000,color:B}}>{pct(gt.made,gt.attempted)}%</td></tr>
      })}<tr style={{background:"#F7F2EE"}}><td style={{...td,textAlign:"left",fontWeight:1000,color:B,position:"sticky",left:0,background:"#F7F2EE"}}>TOTAL / MOY.</td>{spotKeys.map(sp=>{const rowIds=new Set(rows.filter(r=>norm(r.name)===sp.key).map(r=>r.id));const x=sum(results.filter(r=>rowIds.has(r.row_id)));return <td key={sp.key} style={{...td,fontWeight:900}}>{x.attempted?`${x.made}/${x.attempted} · ${pct(x.made,x.attempted)}%`:"—"}</td>})}<td style={{...td,fontWeight:1000}}>{grand.made}/{grand.attempted}</td><td style={{...td,fontWeight:1000,color:B}}>{pct(grand.made,grand.attempted)}%</td></tr></tbody>
    </table></div>
  </article>
}

export default function PlayerShootingGrids({playerId,teamId}:{playerId:string;teamId:string}){
  const sb=useMemo(()=>createClient(),[]);
  const [grids,setGrids]=useState<Grid[]>([]),[rows,setRows]=useState<Row[]>([]),[sessions,setSessions]=useState<Session[]>([]),[results,setResults]=useState<Result[]>([]),[players,setPlayers]=useState<Player[]>([]);
  const [selected,setSelected]=useState<string[]>([]),[open,setOpen]=useState(false);

  useEffect(()=>{(async()=>{
    const pp=await sb.from("players").select("id,first_name,last_name").eq("team_id",teamId); setPlayers((pp.data||[]).map((p:any)=>({id:String(p.id),firstName:p.first_name||"",lastName:p.last_name||""} as Player)));
    const rr=await sb.from("shooting_grid_player_results").select("id,session_id,row_id,player_id,made,attempted").eq("player_id",playerId);
    const res=(rr.data||[]) as Result[]; setResults(res); if(!res.length){setGrids([]);setRows([]);setSessions([]);return;}
    const ids=[...new Set(res.map(x=>x.session_id))];
    const ss=await sb.from("shooting_grid_sessions").select("id,grid_id,session_date").in("id",ids).order("session_date",{ascending:false});
    const ses=(ss.data||[]) as Session[]; setSessions(ses);
    const gids=[...new Set(ses.map(x=>x.grid_id))];
    const [gg,ro]=await Promise.all([
      sb.from("shooting_grids").select("id,name,court_schema_url").in("id",gids),
      sb.from("shooting_grid_rows").select("id,grid_id,name,sort_order").in("grid_id",gids).order("sort_order")
    ]);
    const gs=(gg.data||[]) as Grid[]; setGrids(gs); setRows((ro.data||[]) as Row[]); setSelected(gs.map(g=>g.id));
  })()},[playerId,teamId,sb]);

  if(!grids.length)return <div style={{...card,textAlign:"center",color:M}}>Aucun résultat de grille de tir pour ce joueur.</div>;
  const visible=grids.filter(g=>selected.includes(g.id));
  const visibleSessions=sessions.filter(s=>selected.includes(s.grid_id));
  const visibleSessionIds=new Set(visibleSessions.map(s=>s.id));
  const visibleRows=rows.filter(r=>selected.includes(r.grid_id));
  const visibleResults=results.filter(r=>visibleSessionIds.has(r.session_id));

  return <section style={{display:"grid",gap:14}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start",flexWrap:"wrap"}}>
      <div><span style={eye}>GRILLES DE TIR</span><h2 style={{margin:"4px 0",color:B}}>Progression du joueur</h2><p style={{margin:0,color:M,fontSize:11}}>Une ligne par session, le détail de chaque spot, la Shot Chart LiveStat et le récapitulatif de toutes les grilles.</p></div>
      <div style={{position:"relative"}}><button onClick={()=>setOpen(v=>!v)} style={button}>☑ Grilles affichées ({selected.length}/{grids.length}) ▾</button>{open&&<div style={menu}><label style={{display:"flex",gap:8,padding:7,fontWeight:900}}><input type="checkbox" checked={selected.length===grids.length} onChange={e=>setSelected(e.target.checked?grids.map(g=>g.id):[])}/> Tout sélectionner</label>{grids.map(g=><label key={g.id} style={{display:"flex",gap:8,padding:7}}><input type="checkbox" checked={selected.includes(g.id)} onChange={e=>setSelected(cur=>e.target.checked?[...new Set([...cur,g.id])]:cur.filter(x=>x!==g.id))}/>{g.name}</label>)}</div>}</div>
    </div>
    {visible.map(g=><GridBlock key={g.id} grid={g} rows={rows.filter(r=>r.grid_id===g.id)} sessions={sessions.filter(s=>s.grid_id===g.id)} results={results}/>)}
    {!!visible.length&&<AllGridsBySpot grids={visible} rows={visibleRows} sessions={visibleSessions} results={visibleResults}/>} 
    {!!players.length&&<ShootingComparison teamId={teamId} players={players} initialPlayerId={playerId}/>}
  </section>
}

const eye:React.CSSProperties={display:"block",fontSize:9,fontWeight:1000,letterSpacing:".12em",color:G};
const card:React.CSSProperties={border:`1px solid ${BD}`,borderRadius:16,padding:14,background:"#fff",minWidth:0};
const th:React.CSSProperties={padding:"9px 10px",background:"#F7F2EE",borderBottom:`1px solid ${BD}`,color:"#594B46",textAlign:"center",fontWeight:900};
const td:React.CSSProperties={padding:"9px 10px",borderBottom:`1px solid ${BD}`,textAlign:"center"};
const button:React.CSSProperties={border:`1px solid ${BD}`,borderRadius:10,padding:"10px 12px",background:"#fff",color:B,fontWeight:900,cursor:"pointer"};
const select:React.CSSProperties={...button,minWidth:230,fontSize:11};
const menu:React.CSSProperties={position:"absolute",right:0,top:44,zIndex:20,width:280,background:"#fff",border:`1px solid ${BD}`,borderRadius:12,padding:10,boxShadow:"0 12px 30px rgba(0,0,0,.12)"};
