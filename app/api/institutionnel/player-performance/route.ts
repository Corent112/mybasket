import {NextResponse} from 'next/server';
import {institutionalSportActor,canManageSport} from '@/lib/institutionnel/sport-access-server';
import {loadPlayerMatchStats} from '@/lib/player-match-stats';
import {tournamentsOf,performanceTotals} from '@/lib/institutionnel/selection-competitions';
import {POST as saveManualLink} from '../pole-performance/route';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status});
export async function GET(req:Request){
 const p=new URL(req.url).searchParams,structureId=p.get('structureId')||'',playerId=p.get('playerId')||'';if(!structureId||!playerId)return json({error:'Institution ou joueur manquant'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;
 const player=await ctx.admin.from('institutional_players').select('id').eq('id',playerId).eq('structure_id',structureId).maybeSingle();if(player.error||!player.data)return json({error:'Joueur introuvable dans cette institution'},404);
 try{
 const links=await ctx.admin.from('institutional_player_team_links').select('team_id,team_player_id,relation_type').eq('structure_id',structureId).eq('player_id',playerId);if(links.error)throw Error(links.error.message);
 const raw:any[]=(links.data||[]).filter((x:any)=>x.team_id&&x.team_player_id).map((x:any)=>({teamId:x.team_id,playerId:x.team_player_id,context:x.relation_type==='selection'?'selection':'club'}));
 // The selection roster itself is authoritative, even if an older auxiliary link is missing.
 const ownedSelections=await ctx.admin.from('institutional_selections').select('id,team_id').eq('structure_id',structureId);if(ownedSelections.error)throw Error(ownedSelections.error.message);
 const selectionIds=(ownedSelections.data||[]).map((s:any)=>s.id);
 if(selectionIds.length){const memberships=await ctx.admin.from('institutional_selection_players').select('selection_id,team_player_id').eq('player_id',playerId).in('selection_id',selectionIds);if(memberships.error)throw Error(memberships.error.message);for(const membership of memberships.data||[]){const selection=(ownedSelections.data||[]).find((s:any)=>s.id===membership.selection_id);if(selection?.team_id&&membership.team_player_id)raw.push({teamId:selection.team_id,playerId:membership.team_player_id,context:'selection'});}}
 // Older Pôle and manually linked sources use existing dedicated relation tables.
 for(const [table,columns,mapper]of [
  ['institutional_pole_player_memberships','pole_team_id,pole_player_id',(x:any)=>({teamId:x.pole_team_id,playerId:x.pole_player_id,context:'pole'})],
  ['institutional_pole_player_team_links','partner_team_id,partner_player_id',(x:any)=>({teamId:x.partner_team_id,playerId:x.partner_player_id,context:'club'})],
  ['institutional_player_selection_links','team_id,roster_player_id,selection_level,label',(x:any)=>({teamId:x.team_id,playerId:x.roster_player_id,context:'selection',selectionLevel:x.selection_level,label:x.label})]
 ] as const){const q=await ctx.admin.from(table).select(columns).eq('structure_id',structureId).eq('institutional_player_id',playerId).eq('active',true);if(q.error&&q.error.code!=='42P01'&&q.error.code!=='PGRST205')throw Error(q.error.message);for(const row of q.data||[])raw.push(mapper(row));}
 const sources=[...new Map(raw.filter(s=>s.teamId&&s.playerId).map(s=>[`${s.teamId}:${s.playerId}`,s])).values()];
 const matches:any[]=[];
 for(const teamId of [...new Set<string>(sources.map(s=>s.teamId))]){
  const team=await ctx.admin.from('teams').select('id,name,metadata,category').eq('id',teamId).maybeSingle();if(team.error)throw Error(team.error.message);if(!team.data)continue;
  const {rows,matchesById}=await loadPlayerMatchStats(ctx.admin,teamId),teamSources=sources.filter(s=>s.teamId===teamId),seen=new Set<string>();
  for(const row of rows){const source=teamSources.find(s=>s.playerId===String(row.player_id)),m=matchesById.get(String(row.match_id)),key=`${teamId}:${row.match_id}`;if(!source||!m||m.team_id!==teamId||row.present===false||!['completed','finished',null,undefined].includes(m.project_status)||seen.has(key))continue;seen.add(key);
   const tournaments=tournamentsOf(team.data.metadata).filter(t=>t.matchIds.includes(String(m.id)));
   const n=(v:any)=>Number(v)||0,reb=row.reb==null?n(row.off_reb)+n(row.def_reb):n(row.reb);
   matches.push({id:String(m.id),teamId,playerId:source.playerId,context:source.context,selectionLevel:source.selectionLevel||null,teamName:source.label||team.data.name,category:team.data.category||'',date:String(m.match_date||'').slice(0,10),opponent:m.opponent||'',matchCategory:m.match_category||'',tournaments:tournaments.map(t=>({id:t.id,name:t.name})),pts:row.pts==null?n(row.p2m)*2+n(row.p3m)*3+n(row.ftm):n(row.pts),reb,ast:n(row.ast),stl:n(row.stl),blk:n(row.blk),turnovers:n(row.turnovers),minutes:row.minutes_seconds==null?(row.minutes==null?null:n(row.minutes)):n(row.minutes_seconds)/60,...Object.fromEntries(['p2m','p2a','p3m','p3a','ftm','fta'].map(key=>[key,n(row[key])]))});
  }
 }
 matches.sort((a,b)=>b.date.localeCompare(a.date));const totals=Object.fromEntries(['all','selection','club','pole'].map(key=>[key,performanceTotals(matches.filter(m=>key==='all'||m.context===key))]));return json({matches,totals,sources});
 }catch(error){return json({error:error instanceof Error?error.message:'Statistiques indisponibles'},400)}
}
export async function POST(req:Request){
 const b=await req.clone().json().catch(()=>({})),ctx=await institutionalSportActor(String(b.structureId||''));if('error'in ctx)return ctx.error;if(!canManageSport(ctx.member))return json({error:'Droits insuffisants'},403);
 const [player,team,roster]=await Promise.all([ctx.admin.from('institutional_players').select('id').eq('id',String(b.playerId||'')).eq('structure_id',String(b.structureId||'')).maybeSingle(),ctx.admin.from('teams').select('id').eq('id',String(b.teamId||'')).eq('user_id',ctx.user.id).maybeSingle(),ctx.admin.from('players').select('id').eq('id',String(b.rosterPlayerId||'')).eq('team_id',String(b.teamId||'')).maybeSingle()]);
 if(!player.data||!team.data||!roster.data||player.error||team.error||roster.error)return json({error:'Joueur ou équipe non accessible'},404);return saveManualLink(req);
}
