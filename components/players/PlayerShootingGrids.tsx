"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Grid={id:string;name:string;court_schema_url:string|null};
type Row={id:string;grid_id:string;name:string;sort_order:number};
type Session={id:string;grid_id:string;session_date:string};
type Result={id:string;session_id:string;row_id:string;player_id:string;made:number;attempted:number};

const BORDEAUX="#6B1A2C",GOLD="#D4A24C",BORDER="#E8DDD7",TEXT="#211A18",MUTED="#7B6E68";
function pct(m:number,a:number){return a?Math.round((m/a)*1000)/10:0}
function fmt(v:string){return new Date(`${v}T12:00:00`).toLocaleDateString("fr-FR")}

function ProgressChart({data}:{data:{label:string,value:number}[]}){
  const w=760,h=220,l=42,r=18,t=18,b=34,iw=w-l-r,ih=h-t-b;
  const x=(i:number)=>l+(data.length<=1?iw/2:(i/(data.length-1))*iw);
  const y=(v:number)=>t+ih-(v/100)*ih;
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{minWidth:520,display:"block"}}>
    {[0,25,50,75,100].map(v=><g key={v}><line x1={l} x2={w-r} y1={y(v)} y2={y(v)} stroke="#ECE4DF"/><text x={l-7} y={y(v)+4} textAnchor="end" fontSize="10" fill="#8B7E77">{v}%</text></g>)}
    {data.length>=2&&<polyline points={data.map((d,i)=>`${x(i)},${y(d.value)}`).join(" ")} fill="none" stroke={BORDEAUX} strokeWidth="3" strokeLinecap="round"/>}
    {data.map((d,i)=><g key={`${d.label}-${i}`}><circle cx={x(i)} cy={y(d.value)} r="6" fill="#fff" stroke={GOLD} strokeWidth="3"/><circle cx={x(i)} cy={y(d.value)} r="2" fill={BORDEAUX}/><text x={x(i)} y={h-10} textAnchor="middle" fontSize="10" fill="#8B7E77">{d.label}</text></g>)}
  </svg>
}

export default function PlayerShootingGrids({playerId,teamId}:{playerId:string;teamId:string}){
  const supabase=useMemo(()=>createClient(),[]);
  const [grids,setGrids]=useState<Grid[]>([]);
  const [rows,setRows]=useState<Row[]>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [results,setResults]=useState<Result[]>([]);
  const [selectedGridId,setSelectedGridId]=useState("");

  async function reload(){
    /**
     * Source de vérité : shooting_grid_player_results.
     *
     * On part d'abord du joueur, puis on remonte session -> grille. Cela évite
     * qu'une ancienne équipe dont l'id d'URL diffère du team_id Supabase masque
     * les résultats pourtant bien enregistrés depuis la fiche équipe.
     */
    const {data:playerResults,error:playerResultsError}=await supabase
      .from("shooting_grid_player_results")
      .select("id,session_id,row_id,player_id,made,attempted")
      .eq("player_id",playerId);

    if(playerResultsError){
      console.error(playerResultsError);
      setGrids([]);setRows([]);setSessions([]);setResults([]);
      return;
    }

    const rr=(playerResults||[]) as Result[];
    setResults(rr);

    if(!rr.length){
      // On charge tout de même les modèles de l'équipe pour afficher un état
      // cohérent, mais aucune performance n'est inventée.
      const {data:g,error:ge}=await supabase
        .from("shooting_grids")
        .select("id,name,court_schema_url")
        .eq("team_id",teamId)
        .order("updated_at",{ascending:false});
      if(ge) console.error(ge);
      setGrids((g||[]) as Grid[]);
      setRows([]);setSessions([]);
      setSelectedGridId("");
      return;
    }

    const sessionIds=Array.from(new Set(rr.map(x=>String(x.session_id)).filter(Boolean)));
    const {data:s,error:sessionError}=await supabase
      .from("shooting_grid_sessions")
      .select("id,grid_id,session_date")
      .in("id",sessionIds)
      .order("session_date",{ascending:true});

    if(sessionError){
      console.error(sessionError);
      setGrids([]);setRows([]);setSessions([]);
      return;
    }

    const sessionList=(s||[]) as Session[];
    setSessions(sessionList);
    const gridIds=Array.from(new Set(sessionList.map(x=>String(x.grid_id)).filter(Boolean)));
    if(!gridIds.length){setGrids([]);setRows([]);return}

    const [{data:g,error:gridError},{data:r,error:rowError}]=await Promise.all([
      supabase.from("shooting_grids").select("id,name,court_schema_url").in("id",gridIds).order("updated_at",{ascending:false}),
      supabase.from("shooting_grid_rows").select("id,grid_id,name,sort_order").in("grid_id",gridIds).order("sort_order",{ascending:true})
    ]);

    if(gridError) console.error(gridError);
    if(rowError) console.error(rowError);

    const gridList=(g||[]) as Grid[];
    setGrids(gridList);
    setRows((r||[]) as Row[]);

    const firstGrid=sessionList.find(sx=>rr.some(result=>result.session_id===sx.id))?.grid_id||gridList[0]?.id||"";
    setSelectedGridId(cur=>cur&&gridList.some(x=>x.id===cur)?cur:firstGrid);
  }

  useEffect(()=>{void reload()},[playerId,teamId]); // eslint-disable-line

  const grid=grids.find(g=>g.id===selectedGridId)||null;
  const gridRows=rows.filter(r=>r.grid_id===selectedGridId);
  const gridSessions=sessions.filter(s=>s.grid_id===selectedGridId).filter(s=>results.some(r=>r.session_id===s.id));

  const sessionStats=useMemo(()=>gridSessions.map(s=>{
    const rs=results.filter(r=>r.session_id===s.id);
    const made=rs.reduce((a,r)=>a+Number(r.made||0),0);
    const attempted=rs.reduce((a,r)=>a+Number(r.attempted||0),0);
    return {session:s,made,attempted,percentage:pct(made,attempted)};
  }),[gridSessions,results]);

  const totals=useMemo(()=>{
    const rs=results.filter(r=>gridSessions.some(s=>s.id===r.session_id));
    const made=rs.reduce((a,r)=>a+Number(r.made||0),0);
    const attempted=rs.reduce((a,r)=>a+Number(r.attempted||0),0);
    const byRow=gridRows.map(row=>{
      const x=rs.filter(r=>r.row_id===row.id);
      const m=x.reduce((a,r)=>a+Number(r.made||0),0),a=x.reduce((aa,r)=>aa+Number(r.attempted||0),0);
      return {row,made:m,attempted:a,percentage:pct(m,a)};
    });
    return {made,attempted,percentage:pct(made,attempted),byRow};
  },[gridRows,gridSessions,results]);

  if(!grids.length||!results.length)return <div style={{border:`1px solid ${BORDER}`,borderRadius:16,padding:24,textAlign:"center",color:MUTED,background:"#fff"}}><strong style={{display:"block",color:BORDEAUX,marginBottom:5}}>Aucun résultat de grille de tir</strong>Les résultats remplis depuis la fiche équipe apparaîtront automatiquement ici.</div>;

  return <section style={{display:"grid",gap:12}}>
    <div>
      <span style={{display:"block",fontSize:9,fontWeight:1000,letterSpacing:".12em",color:GOLD}}>GRILLES DE TIR</span>
      <h2 style={{margin:"4px 0",color:BORDEAUX,fontSize:19}}>Progression individuelle</h2>
      <p style={{margin:0,color:MUTED,fontSize:11}}>Tous les résultats saisis dans les grilles de l'équipe sont regroupés ici automatiquement.</p>
    </div>

    <label style={{display:"grid",gap:5,maxWidth:420}}>
      <span style={{fontSize:9,fontWeight:1000,letterSpacing:".08em",color:MUTED,textTransform:"uppercase"}}>Grille suivie</span>
      <select value={selectedGridId} onChange={e=>setSelectedGridId(e.target.value)} style={{height:40,border:`1px solid ${BORDER}`,borderRadius:11,padding:"0 11px",background:"#fff",color:BORDEAUX,fontWeight:900}}>
        {grids.filter(g=>sessions.some(s=>s.grid_id===g.id&&results.some(r=>r.session_id===s.id))).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </label>

    {grid&&<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
        <K label="Sessions" value={sessionStats.length}/>
        <K label="Marqués" value={totals.made}/>
        <K label="Tentés" value={totals.attempted}/>
        <K label="% global" value={`${totals.percentage}%`}/>
      </div>

      <div className={`player-shooting-main ${grid.court_schema_url ? "has-schema" : ""}`}>
        <div style={card}>
          <span style={eye}>ÉVOLUTION</span><h3 style={title}>Pourcentage par session</h3>
          <div style={{overflowX:"auto"}}><ProgressChart data={sessionStats.map(x=>({label:new Date(`${x.session.session_date}T12:00:00`).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}),value:x.percentage}))}/></div>
        </div>
        {grid.court_schema_url&&<div style={card}><span style={eye}>SCHÉMA</span><h3 style={title}>{grid.name}</h3><img src={grid.court_schema_url} alt="Schéma grille de tir" style={{width:"100%",height:230,objectFit:"contain",borderRadius:12,border:`1px solid ${BORDER}`}}/></div>}
      </div>

      <div style={{...card,padding:0,overflow:"hidden"}}>
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${BORDER}`}}><span style={eye}>PAR POSITION</span><h3 style={title}>Cumul de la grille</h3></div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:650,fontSize:10}}><thead><tr><th style={th}>Position</th><th style={th}>Marqués</th><th style={th}>Tentés</th><th style={th}>%</th></tr></thead><tbody>
          {totals.byRow.map(x=><tr key={x.row.id}><td style={{...td,textAlign:"left",fontWeight:900}}>{x.row.name}</td><td style={td}>{x.made}</td><td style={td}>{x.attempted}</td><td style={{...td,color:BORDEAUX,fontWeight:1000}}>{x.percentage}%</td></tr>)}
          <tr><td style={{...td,textAlign:"left",fontWeight:1000,background:"#FBF7F3"}}>TOTAL</td><td style={{...td,fontWeight:1000,background:"#FBF7F3"}}>{totals.made}</td><td style={{...td,fontWeight:1000,background:"#FBF7F3"}}>{totals.attempted}</td><td style={{...td,fontWeight:1000,color:BORDEAUX,background:"#FBF7F3"}}>{totals.percentage}%</td></tr>
        </tbody></table></div>
      </div>

      <div style={{...card,padding:0,overflow:"hidden"}}>
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${BORDER}`}}>
          <span style={eye}>SUIVI PAR DATE</span>
          <h3 style={title}>Les spots en ligne · les dates en colonne</h3>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:Math.max(760,220+gridSessions.length*120),fontSize:10}}>
            <thead>
              <tr>
                <th style={{...th,textAlign:"left",position:"sticky",left:0,zIndex:3}}>Spot</th>
                {gridSessions.map(s=><th key={s.id} style={th}>{fmt(s.session_date)}</th>)}
                <th style={{...th,background:"#F4EBE5"}}>MOYENNE</th>
              </tr>
            </thead>
            <tbody>
              {gridRows.map(row=>{
                const rowResults=gridSessions.map(s=>results.find(r=>r.session_id===s.id&&r.row_id===row.id));
                const made=rowResults.reduce((sum,r)=>sum+Number(r?.made||0),0);
                const attempted=rowResults.reduce((sum,r)=>sum+Number(r?.attempted||0),0);
                return <tr key={row.id}>
                  <td style={{...td,textAlign:"left",fontWeight:900,position:"sticky",left:0,zIndex:2,background:"#fff"}}>{row.name}</td>
                  {rowResults.map((r,i)=><td key={gridSessions[i].id} style={td}>{r?`${r.made}/${r.attempted} · ${pct(r.made,r.attempted)}%`:"—"}</td>)}
                  <td style={{...td,color:BORDEAUX,fontWeight:1000,background:"#FCF8F5"}}>{made}/{attempted} · {pct(made,attempted)}%</td>
                </tr>
              })}
              <tr>
                <td style={{...td,textAlign:"left",fontWeight:1000,position:"sticky",left:0,zIndex:2,background:"#FBF7F3"}}>TOTAL</td>
                {sessionStats.map(x=><td key={x.session.id} style={{...td,fontWeight:1000,background:"#FBF7F3"}}>{x.made}/{x.attempted} · {x.percentage}%</td>)}
                <td style={{...td,color:BORDEAUX,fontWeight:1000,background:"#F4EBE5"}}>{totals.made}/{totals.attempted} · {totals.percentage}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>}
    <style jsx>{`
      .player-shooting-main { display:grid; grid-template-columns:1fr; gap:10px; }
      .player-shooting-main.has-schema { grid-template-columns:minmax(0,1fr) 280px; }
      @media (max-width: 820px) {
        .player-shooting-main.has-schema { grid-template-columns:1fr; }
      }
      @media (max-width: 640px) {
        :global(.player-shooting-scroll-hint) { font-size:9px; }
      }
    `}</style>
  </section>
}

function K({label,value}:{label:string;value:string|number}){return <div style={{border:`1px solid ${BORDER}`,borderRadius:13,padding:"11px 12px",background:"#fff"}}><span style={{display:"block",color:MUTED,fontSize:9,fontWeight:900,textTransform:"uppercase"}}>{label}</span><strong style={{display:"block",marginTop:4,color:BORDEAUX,fontSize:22}}>{value}</strong></div>}
const eye:React.CSSProperties={display:"block",fontSize:9,fontWeight:1000,letterSpacing:".12em",color:GOLD};
const card:React.CSSProperties={border:`1px solid ${BORDER}`,borderRadius:16,padding:14,background:"#fff",minWidth:0};
const title:React.CSSProperties={margin:"4px 0 8px",color:TEXT,fontSize:14};
const th:React.CSSProperties={padding:"8px 7px",background:"#F7F2EE",borderRight:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,color:"#594B46",fontWeight:1000,textAlign:"center"};
const td:React.CSSProperties={padding:"8px 7px",borderRight:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`,textAlign:"center"};
