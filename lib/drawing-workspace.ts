import { createClient } from '@/lib/supabase/client';
import { listMySystems, type SystemItem } from '@/lib/systems';
import { listPlaybooks, type Playbook } from '@/lib/playbook';
import { listPlaybookSeries, listSeriesMembership, type PlaybookSeries } from '@/lib/playbook-series';

export type DrawingTeam={id:string;name:string;season:string|null;scouted:boolean};
export type DrawingSeason={id:string;label:string};
export type DrawingSystem=SystemItem & { playbookIds:string[]; seriesIds:string[]; inheritedTags:string[] };

async function userId(){const s=createClient();const {data,error}=await s.auth.getUser();if(error||!data.user)throw new Error('Session utilisateur indisponible');return data.user.id;}
function isScout(row:any){const t=String(row.team_type??row.teamType??row.type??'').toLowerCase();return row.is_scout_team===true||row.isScoutTeam===true||row.scout===true||['scout','scouting','scouted'].includes(t)}
export async function listDrawingTeams():Promise<DrawingTeam[]>{const s=createClient(),uid=await userId();const {data,error}=await s.from('teams').select('*').eq('user_id',uid).order('created_at',{ascending:false});if(error)throw error;return (data||[]).map((r:any)=>({id:String(r.id),name:String(r.name||r.nom||'Équipe'),season:r.season||null,scouted:isScout(r)}));}
export async function ensureDrawingSeasons():Promise<DrawingSeason[]>{const s=createClient(),uid=await userId();let {data,error}=await s.from('workspace_seasons').select('*').eq('owner_id',uid).order('label',{ascending:false});if(error)throw error;if(!(data||[]).some((x:any)=>x.label==='2026-2027')){const ins=await s.from('workspace_seasons').insert({owner_id:uid,label:'2026-2027'});if(ins.error)throw ins.error;const r=await s.from('workspace_seasons').select('*').eq('owner_id',uid).order('label',{ascending:false});data=r.data||[];}return (data||[]).map((x:any)=>({id:x.id,label:x.label}));}
export async function createDrawingSeason(label:string):Promise<DrawingSeason>{const clean=label.trim();if(!/^\d{4}-\d{4}$/.test(clean))throw new Error('Format attendu : 2026-2027');const s=createClient(),uid=await userId();const {data,error}=await s.from('workspace_seasons').upsert({owner_id:uid,label:clean},{onConflict:'owner_id,label'}).select('*').single();if(error)throw error;return {id:data.id,label:data.label};}
export async function loadDrawingSystems():Promise<{systems:DrawingSystem[];playbooks:Playbook[];series:PlaybookSeries[]}>{
 const s=createClient(),uid=await userId();const [systems,playbooks]=await Promise.all([listMySystems(),listPlaybooks()]);
 const seriesArrays=await Promise.all(playbooks.map(p=>listPlaybookSeries(p.id)));const series=seriesArrays.flat();
 const {data:pbSystems,error}=await s.from('playbook_systems').select('id,playbook_id,system_id,tags').eq('owner_id',uid);if(error)throw error;
 const memberships=await Promise.all(playbooks.map(async p=>({p, m:await listSeriesMembership(p.id)})));
 const seriesByPbSystem=new Map<string,string>();memberships.forEach(({m})=>Object.entries(m).forEach(([pbSystemId,seriesId])=>seriesByPbSystem.set(pbSystemId,seriesId)));
 const map=new Map<string,{playbookIds:string[];seriesIds:string[];tags:string[]}>();
 for(const row of pbSystems||[]){if(!row.system_id)continue;const v=map.get(row.system_id)||{playbookIds:[],seriesIds:[],tags:[]};if(row.playbook_id&&!v.playbookIds.includes(row.playbook_id))v.playbookIds.push(row.playbook_id);const sid=seriesByPbSystem.get(row.id);if(sid&&!v.seriesIds.includes(sid))v.seriesIds.push(sid);v.tags=Array.from(new Set([...v.tags,...(Array.isArray(row.tags)?row.tags:[])]));map.set(row.system_id,v)}
 return {systems:systems.map(x=>{const v=map.get(x.id)||{playbookIds:[],seriesIds:[],tags:[]};return {...x,playbookIds:v.playbookIds,seriesIds:v.seriesIds,inheritedTags:v.tags}}),playbooks,series};
}
export function openPrivateSystemInDrawing(systemId:string){localStorage.setItem('mybasket_edit_systeme_id',systemId);localStorage.setItem('mybasket_current_system_id',systemId);localStorage.setItem('mybasket_edit_schema_index','0');window.location.href='/plaquette?type=systeme';}
