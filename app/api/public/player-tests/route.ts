import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin-server';
import {hashPlayerTestToken,playerTestTokenTeam,canManageTeamTests,testPlayerActive} from '@/lib/player-test-links';
import {PLAYER_TEST_CATALOG} from '@/lib/player-test-catalog';
import {rateLimit,getClientIp} from '@/lib/security/rate-limit';
export const dynamic='force-dynamic';
const json=(body:any,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
async function context(token:string){
 const teamId=playerTestTokenTeam(token);if(!teamId)return null;const db=createAdminClient();if(!db)return null;
 const q=await db.from('teams').select('id,name,user_id,metadata').eq('id',teamId).maybeSingle(),team=q.data,link=team?.metadata?.playerTestsLink;
 if(q.error||!team||!link?.enabled||link.tokenHash!==hashPlayerTestToken(token)||!await canManageTeamTests(db,team,link.issuedBy))return null;
 return{db,team};
}
export async function GET(req:Request){
 if(!rateLimit(`tests-read:${getClientIp(req.headers)}`,90).allowed)return json({error:'Réessaie dans une minute.'},429);
 const c=await context(new URL(req.url).searchParams.get('token')||'');if(!c)return json({error:'Ce lien de mesures n’est plus actif.'},404);
 const all:any[]=[];for(const linked of [false,true])for(let start=0;;start+=1000){let query=c.db.from('players').select('id,team_id,first_name,last_name,status,metadata');query=linked?query.contains('metadata',{additionalTeamIds:[c.team.id]}):query.eq('team_id',c.team.id);const r=await query.order('id').range(start,start+999);if(r.error)return json({error:'Chargement des joueurs impossible.'},503);all.push(...(r.data||[]));if((r.data||[]).length<1000)break;}
 const players=[...new Map(all.filter(p=>testPlayerActive(p,c.team.id)).map(p=>[p.id,{id:p.id,name:[p.first_name,p.last_name].filter(Boolean).join(' ')}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 return json({teamName:c.team.name,players,tests:PLAYER_TEST_CATALOG});
}
export async function POST(req:Request){
 if(!rateLimit(`tests-write:${getClientIp(req.headers)}`,60).allowed)return json({error:'Trop de saisies. Réessaie dans une minute.'},429);
 const body=await req.json().catch(()=>({})),c=await context(String(body.token||''));if(!c)return json({error:'Ce lien de mesures n’est plus actif.'},404);
 const test=PLAYER_TEST_CATALOG.find(t=>t.label===body.test),value=typeof body.value==='number'?body.value:NaN;
 if(!test||!Number.isFinite(value)||value<0||value>100000||!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date||''))||!Number.isFinite(Date.parse(body.date+'T12:00:00Z'))||new Date(body.date+'T12:00:00Z').toISOString().slice(0,10)!==body.date||! /^[0-9a-f-]{36}$/i.test(String(body.submissionId||'')))return json({error:'Vérifie le test, la date et la valeur.'},400);
 const player=await c.db.from('players').select('id,team_id,status,metadata').eq('id',String(body.playerId||'')).maybeSingle();if(player.error||!player.data||!testPlayerActive(player.data,c.team.id))return json({error:'Ce joueur ne fait pas partie de ce groupe.'},403);
 const payload={id:body.submissionId,team_id:c.team.id,player_id:player.data.id,date:body.date,category:test.category,label:test.label,value,unit:test.unit,notes:null};
 const saved=await c.db.from('player_tests').insert(payload);if(saved.error){if(saved.error.code==='23505'){const old=await c.db.from('player_tests').select('team_id,player_id,date,label,value').eq('id',payload.id).maybeSingle();const previous=old.data;if(previous&&(['team_id','player_id','date','label','value'] as const).every(k=>previous[k]===payload[k]))return json({ok:true});}return json({error:'La mesure n’a pas pu être enregistrée. Réessaie.'},500);}
 return json({ok:true});
}
