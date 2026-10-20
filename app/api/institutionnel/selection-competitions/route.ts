import {NextResponse} from 'next/server';
import {institutionalSportActor,canManageSport} from '@/lib/institutionnel/sport-access-server';
import {tournamentsOf} from '@/lib/institutionnel/selection-competitions';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status});
async function context(structureId:string,selectionId:string){
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return{ok:false as const,error:ctx.error!};
 const selection=await ctx.admin.from('institutional_selections').select('id,name,team_id').eq('id',selectionId).eq('structure_id',structureId).neq('status','archived').maybeSingle();
 if(selection.error||!selection.data)return{ok:false as const,error:json({error:'Sélection introuvable'},404)};
 const team=await ctx.admin.from('teams').select('metadata').eq('id',selection.data.team_id).maybeSingle();
 if(team.error||!team.data||team.data.metadata?.institutionRosterKind==='preselection')return{ok:false as const,error:json({error:'Choisis une sélection finale'},400)};
 return{ok:true as const,...ctx,selection:selection.data,team:team.data};
}
export async function GET(req:Request){
 const p=new URL(req.url).searchParams,structureId=p.get('structureId')||'',selectionId=p.get('selectionId')||'';if(!structureId||!selectionId)return json({error:'Institution ou sélection manquante'},400);
 const ctx=await context(structureId,selectionId);if(!ctx.ok)return ctx.error;
 const matches:any[]=[];for(let from=0;;from+=500){const q=await ctx.admin.from('match_stats').select('id,team_id,opponent,match_date,us_score,them_score,project_status,match_category').eq('team_id',ctx.selection.team_id).order('id').range(from,from+499);if(q.error)return json({error:q.error.message},400);matches.push(...q.data||[]);if((q.data||[]).length<500)break;}
 return json({tournaments:tournamentsOf(ctx.team.metadata),matches:matches.sort((a,b)=>String(b.match_date).localeCompare(String(a.match_date)))});
}
export async function POST(req:Request){
 const b=await req.json().catch(()=>({})),structureId=String(b.structureId||''),selectionId=String(b.selectionId||'');if(!structureId||!selectionId)return json({error:'Institution ou sélection manquante'},400);
 const ctx=await context(structureId,selectionId);if(!ctx.ok)return ctx.error;if(!canManageSport(ctx.member))return json({error:'Droits insuffisants'},403);
 const name=String(b.name||'').trim(),date=String(b.date||''),location=String(b.location||'').trim(),matchIds=[...new Set<string>((Array.isArray(b.matchIds)?b.matchIds:[]).map(String))];
 if(!name||name.length>160||location.length>500||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||matchIds.length>200)return json({error:'Vérifie le nom, la date et les matchs du tournoi.'},400);
 const known=new Set<string>();for(let from=0;from<matchIds.length;from+=100){const q=await ctx.admin.from('match_stats').select('id').eq('team_id',ctx.selection.team_id).in('id',matchIds.slice(from,from+100));if(q.error)return json({error:q.error.message},400);for(const m of q.data||[])known.add(m.id);}if(matchIds.some(id=>!known.has(id)))return json({error:'Un match appartient à une autre équipe ou n’existe plus.'},400);
 const saved=tournamentsOf(ctx.team.metadata),existing=saved.find(t=>t.id===String(b.id||''));if(b.id&&!existing)return json({error:'Tournoi introuvable'},404);
 const roster=existing?{data:[],error:null}:await ctx.admin.from('institutional_selection_players').select('player_id').eq('selection_id',selectionId).eq('status','active');if(roster.error)return json({error:roster.error.message},400);
 const tournament={id:existing?.id||crypto.randomUUID(),name,date,location,matchIds,playerIds:existing?.playerIds||(roster.data||[]).map((p:any)=>p.player_id)};
 const write=await ctx.admin.from('teams').update({metadata:{...ctx.team.metadata,institutionTournaments:[...saved.filter(t=>t.id!==tournament.id),tournament]}}).eq('id',ctx.selection.team_id);if(write.error)return json({error:write.error.message},400);
 return json({ok:true,tournament});
}
