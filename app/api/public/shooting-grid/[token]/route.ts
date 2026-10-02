import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin-server";
import {sendTransactionalEmail} from "@/lib/server-notifications";

export const runtime="nodejs";
const esc=(v:unknown)=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");

async function getGrid(db:any,token:string){
 const q=await db.from("shooting_grids").select("id,team_id,owner_id,name,description,input_mode,fixed_value,court_schema_url,share_enabled").eq("share_token",token).eq("share_enabled",true).maybeSingle();
 return q.error?null:q.data;
}
export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){
 const db=createAdminClient(); if(!db)return NextResponse.json({error:"Service indisponible."},{status:503});
 const {token}=await params; const grid=await getGrid(db,token); if(!grid)return NextResponse.json({error:"Lien invalide ou désactivé."},{status:404});
 const [rows,players,team]=await Promise.all([
  db.from("shooting_grid_rows").select("id,name,sort_order").eq("grid_id",grid.id).order("sort_order"),
  db.from("players").select("id,first_name,last_name,number").eq("team_id",grid.team_id).order("first_name"),
  db.from("teams").select("id,name,club_name").eq("id",grid.team_id).maybeSingle(),
 ]);
 return NextResponse.json({grid,rows:rows.data||[],players:players.data||[],team:team.data||null});
}
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
 const db=createAdminClient(); if(!db)return NextResponse.json({error:"Service indisponible."},{status:503});
 const {token}=await params; const grid=await getGrid(db,token); if(!grid)return NextResponse.json({error:"Lien invalide ou désactivé."},{status:404});
 const body=await req.json().catch(()=>({})); const playerId=String(body.playerId||""); const otherName=String(body.otherName||"").trim();
 if(!playerId&&!otherName)return NextResponse.json({error:"Indique ton prénom ou choisis ton nom."},{status:400});
 const rowsQ=await db.from("shooting_grid_rows").select("id,name").eq("grid_id",grid.id).order("sort_order"); if(rowsQ.error)return NextResponse.json({error:rowsQ.error.message},{status:400});
 let player:any=null;
 if(playerId){const p=await db.from("players").select("id,first_name,last_name").eq("id",playerId).eq("team_id",grid.team_id).maybeSingle();player=p.data;if(!player)return NextResponse.json({error:"Joueur introuvable."},{status:400});}
 const values=Array.isArray(body.results)?body.results:[]; const byRow=new Map(values.map((x:any)=>[String(x.rowId),x]));
 const normalized=(rowsQ.data||[]).map((row:any)=>{const x:any=byRow.get(String(row.id))||{};const made=Math.max(0,Number(x.made)||0),attempted=Math.max(0,Number(x.attempted)||0);return {row,made,attempted};});
 if(normalized.some((x:any)=>x.attempted<x.made))return NextResponse.json({error:"Un score contient plus de paniers marqués que de tirs tentés."},{status:400});
 const today=new Date().toISOString().slice(0,10);
 if(player){
  const session=await db.from("shooting_grid_sessions").insert({grid_id:grid.id,owner_id:grid.owner_id,session_date:today,notes:"Saisie via lien joueur"}).select("id").single(); if(session.error)return NextResponse.json({error:session.error.message},{status:400});
  await db.from("shooting_grid_session_players").insert({session_id:session.data.id,player_id:player.id});
  const ins=await db.from("shooting_grid_player_results").insert(normalized.map((x:any)=>({session_id:session.data.id,row_id:x.row.id,player_id:player.id,made:x.made,attempted:x.attempted}))); if(ins.error)return NextResponse.json({error:ins.error.message},{status:400});
  const owner=await db.auth.admin.getUserById(grid.owner_id); const to=owner.data?.user?.email;
  if(to){
   const made=normalized.reduce((a:any,x:any)=>a+x.made,0),attempted=normalized.reduce((a:any,x:any)=>a+x.attempted,0),percent=attempted?Math.round(made/attempted*1000)/10:0;
   const playerName=`${player.first_name||""} ${player.last_name||""}`.trim()||"Joueur";
   const detail=normalized.map((x:any)=>{const p=x.attempted?Math.round(x.made/x.attempted*100):0;return `<tr><td style="padding:9px 8px;border-bottom:1px solid #eee">${esc(x.row.name)}</td><td style="padding:9px 8px;border-bottom:1px solid #eee;text-align:center"><b>${x.made}/${x.attempted}</b></td><td style="padding:9px 8px;border-bottom:1px solid #eee;text-align:right;color:#6B1A2C;font-weight:800">${p}%</td></tr>`}).join("");
   const chartDots=normalized.map((x:any,i:number)=>{const p=x.attempted?x.made/x.attempted:0;const cols=5;const col=i%cols,row=Math.floor(i/cols);const cx=14+col*18,cy=20+row*23;const fill=p>=.6?"#6B1A2C":p>=.4?"#D4A24C":"#9A918C";return `<circle cx="${cx}" cy="${cy}" r="5.2" fill="${fill}" stroke="#fff" stroke-width="2"/><text x="${cx}" y="${cy+1.8}" text-anchor="middle" font-size="4.5" font-weight="800" fill="#fff">${Math.round(p*100)}</text>`}).join("");
   const shotChart=`<div style="margin-top:20px"><div style="font-size:12px;font-weight:900;color:#6B1A2C;margin-bottom:8px">SHOT CHART · ${esc(playerName)}</div><div style="border:1px solid #eadfd9;border-radius:14px;padding:10px;text-align:center;background:#fbf7f3"><svg viewBox="0 0 100 72" role="img" aria-label="Shot chart de ${esc(playerName)}" style="width:100%;max-width:460px;height:auto;background:#efd19a;border-radius:10px"><rect x="2" y="2" width="96" height="68" rx="3" fill="#efd19a" stroke="#fff" stroke-width="1.5"/><path d="M30 2v20h40V2M40 2v12h20V2M32 34a18 18 0 0 0 36 0M50 14a8 8 0 1 0 .1 0" fill="none" stroke="#fff" stroke-width="1.2"/>${chartDots}</svg><div style="font-size:11px;color:#756760;margin-top:7px">Chaque point correspond à une zone de la grille · couleur et chiffre = réussite du joueur.</div></div></div>`;
   try{await sendTransactionalEmail({to,subject:`MyBasket · Grille de tir terminée · ${playerName}`,html:`<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;border:1px solid #eadfd9;border-radius:18px;overflow:hidden;background:#fff"><div style="background:#6B1A2C;color:#fff;padding:22px"><div style="color:#D4A24C;font-weight:900;font-size:12px">MYBASKET · GRILLE DE TIR TERMINÉE</div><h2 style="margin:7px 0 0">${esc(playerName)}</h2></div><div style="padding:22px"><p style="margin-top:0;color:#756760">Un joueur vient de terminer <b style="color:#221A18">${esc(grid.name)}</b>.</p><div style="background:#fbf0f2;border-radius:14px;padding:16px;display:block"><div style="font-size:12px;color:#756760">Résultat global</div><div style="font-size:30px;font-weight:900;color:#6B1A2C;margin-top:3px">${made}/${attempted} · ${percent}%</div></div><h3 style="margin:22px 0 8px;color:#221A18">Détail par zone</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#fbf7f3"><th style="text-align:left;padding:9px 8px">Zone</th><th style="padding:9px 8px">Résultat</th><th style="text-align:right;padding:9px 8px">%</th></tr></thead><tbody>${detail}</tbody></table>${shotChart}<p style="margin:20px 0 0;color:#756760;font-size:12px">La session est enregistrée automatiquement dans MyBasket et rattachée à la fiche du joueur.</p></div></div>`});}catch(e){console.error("Résumé grille non envoyé",e)}
  }
 } else {
  await db.from("shooting_grid_guest_submissions").insert({grid_id:grid.id,team_id:grid.team_id,owner_id:grid.owner_id,guest_name:otherName,submitted_on:today,results:normalized.map((x:any)=>({rowId:x.row.id,rowName:x.row.name,made:x.made,attempted:x.attempted}))});
  const owner=await db.auth.admin.getUserById(grid.owner_id); const to=owner.data?.user?.email;
  if(to){const made=normalized.reduce((a:any,x:any)=>a+x.made,0),attempted=normalized.reduce((a:any,x:any)=>a+x.attempted,0),percent=attempted?Math.round(made/attempted*1000)/10:0;
   try{await sendTransactionalEmail({to,subject:`MyBasket · ${otherName} n'est pas dans la liste joueurs`,html:`<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;border:1px solid #eadfd9;border-radius:16px;overflow:hidden"><div style="background:#6B1A2C;color:#fff;padding:22px"><div style="color:#D4A24C;font-weight:800;font-size:12px">ALERTE GRILLE DE TIR</div><h2 style="margin:7px 0 0">Un joueur manque peut-être dans ton effectif</h2></div><div style="padding:22px"><p><b>${esc(otherName)}</b> a rempli la grille <b>${esc(grid.name)}</b>, mais a indiqué « Je ne suis pas dans la liste ».</p><div style="background:#fbf7f3;padding:14px;border-radius:12px;margin:16px 0"><b>Résultat : ${made}/${attempted} · ${percent}%</b></div>${normalized.map((x:any)=>`<div style="padding:7px 0;border-bottom:1px solid #eee">${esc(x.row.name)} <b style="float:right">${x.made}/${x.attempted}</b></div>`).join("")}<p style="margin-top:18px;color:#756760">Tu peux vérifier l'effectif MyBasket et créer/rattacher ce joueur si nécessaire. Ses résultats sont conservés dans les réponses non rattachées.</p></div></div>`});}catch(e){console.error("Alerte grille non envoyée",e)}
  }
 }
 const made=normalized.reduce((a:any,x:any)=>a+x.made,0),attempted=normalized.reduce((a:any,x:any)=>a+x.attempted,0);
 return NextResponse.json({ok:true,made,attempted,percentage:attempted?Math.round(made/attempted*1000)/10:0,guest:!player});
}
