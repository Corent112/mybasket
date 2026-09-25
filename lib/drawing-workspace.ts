import { createClient } from '@/lib/supabase/client';
import { listMySystems, type SystemItem } from '@/lib/systems';
import { addSystemToPlaybook, listPlaybooks, type Playbook, type PlaybookSystem } from '@/lib/playbook';
import { listPlaybookSeries, listSeriesMembership, updatePlaybookSeries, type PlaybookSeries } from '@/lib/playbook-series';

export type DrawingTeam={id:string;name:string;season:string|null;scouted:boolean};
export type DrawingSeason={id:string;label:string};
export type DrawingSystem=SystemItem & {
  playbookIds:string[];
  seriesIds:string[];
  inheritedTags:string[];
  playbookSystemIds:Record<string,string>;
};

async function userId(){const s=createClient();const {data,error}=await s.auth.getUser();if(error||!data.user)throw new Error('Session utilisateur indisponible');return data.user.id;}
function isScout(row:any){const t=String(row.team_type??row.teamType??row.type??'').toLowerCase();return row.is_scout_team===true||row.isScoutTeam===true||row.scout===true||['scout','scouting','scouted'].includes(t)}
const clean=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&!!x.trim()):[];

export async function listDrawingTeams():Promise<DrawingTeam[]>{const s=createClient(),uid=await userId();const {data,error}=await s.from('teams').select('*').eq('user_id',uid).order('created_at',{ascending:false});if(error)throw error;return (data||[]).map((r:any)=>({id:String(r.id),name:String(r.name||r.nom||'Équipe'),season:r.season||null,scouted:isScout(r)}));}
export async function ensureDrawingSeasons():Promise<DrawingSeason[]>{const s=createClient(),uid=await userId();let {data,error}=await s.from('workspace_seasons').select('*').eq('owner_id',uid).order('label',{ascending:false});if(error)throw error;if(!(data||[]).some((x:any)=>x.label==='2026-2027')){const ins=await s.from('workspace_seasons').insert({owner_id:uid,label:'2026-2027'});if(ins.error)throw ins.error;const r=await s.from('workspace_seasons').select('*').eq('owner_id',uid).order('label',{ascending:false});data=r.data||[];}return (data||[]).map((x:any)=>({id:x.id,label:x.label}));}
export async function createDrawingSeason(label:string):Promise<DrawingSeason>{const value=label.trim();if(!/^\d{4}-\d{4}$/.test(value))throw new Error('Format attendu : 2026-2027');const s=createClient(),uid=await userId();const {data,error}=await s.from('workspace_seasons').upsert({owner_id:uid,label:value},{onConflict:'owner_id,label'}).select('*').single();if(error)throw error;return {id:data.id,label:data.label};}

export async function loadDrawingSystems():Promise<{systems:DrawingSystem[];playbooks:Playbook[];series:PlaybookSeries[]}>{
 const s=createClient(),uid=await userId();
 const [systems,playbooks]=await Promise.all([listMySystems(),listPlaybooks()]);
 const seriesArrays=await Promise.all(playbooks.map(p=>listPlaybookSeries(p.id)));const series=seriesArrays.flat();
 const {data:pbSystems,error}=await s.from('playbook_systems').select('id,playbook_id,system_id,tags').eq('owner_id',uid);if(error)throw error;
 const memberships=await Promise.all(playbooks.map(async p=>({p,m:await listSeriesMembership(p.id)})));
 const seriesByPbSystem=new Map<string,string>();memberships.forEach(({m})=>Object.entries(m).forEach(([pbSystemId,seriesId])=>seriesByPbSystem.set(pbSystemId,seriesId)));
 const seriesById=new Map(series.map(sr=>[sr.id,sr]));
 const map=new Map<string,{playbookIds:string[];seriesIds:string[];tags:string[];playbookSystemIds:Record<string,string>}>();
 for(const row of pbSystems||[]){
   if(!row.system_id)continue;
   const v=map.get(row.system_id)||{playbookIds:[],seriesIds:[],tags:[],playbookSystemIds:{}};
   if(row.playbook_id&&!v.playbookIds.includes(row.playbook_id))v.playbookIds.push(row.playbook_id);
   if(row.playbook_id)v.playbookSystemIds[row.playbook_id]=row.id;
   const sid=seriesByPbSystem.get(row.id);
   if(sid&&!v.seriesIds.includes(sid))v.seriesIds.push(sid);
   const inherited=sid?clean(seriesById.get(sid)?.tags):[];
   v.tags=Array.from(new Set([...v.tags,...clean(row.tags),...inherited]));
   map.set(row.system_id,v);
 }
 return {systems:systems.map(x=>{const v=map.get(x.id)||{playbookIds:[],seriesIds:[],tags:[],playbookSystemIds:{}};return {...x,playbookIds:v.playbookIds,seriesIds:v.seriesIds,inheritedTags:v.tags,playbookSystemIds:v.playbookSystemIds}}),playbooks,series};
}

export function openPrivateSystemInDrawing(systemId:string){localStorage.setItem('mybasket_edit_systeme_id',systemId);localStorage.setItem('mybasket_edit_system_id',systemId);localStorage.setItem('mybasket_current_system_id',systemId);localStorage.setItem('mybasket_edit_schema_index','0');window.location.href='/plaquette?type=systeme';}

export async function attachPrivateSystemToPlaybook(system:DrawingSystem,playbookId:string,seriesId?:string|null):Promise<PlaybookSystem>{
 const s=createClient(),uid=await userId();
 const existing=await s.from('playbook_systems').select('*').eq('owner_id',uid).eq('playbook_id',playbookId).eq('system_id',system.id).maybeSingle();
 if(existing.error)throw existing.error;
 let row:PlaybookSystem;
 if(existing.data){row=existing.data as PlaybookSystem;}
 else{
   row=await addSystemToPlaybook({playbook_id:playbookId,title:system.title,category:'Système demi-terrain',description:(system as any).deroulement||(system as any).consignes||'',system_id:system.id,schema_images:(system as any).schemaImages||(system as any).schema_images||[],schema_data_list:(system as any).schemaDataList||(system as any).schema_data_list||[],schema_video:(system as any).schemaVideo??(system as any).schema_video??null,tags:Array.from(new Set([...(system as any).tags||[],...system.inheritedTags]))});
 }
 if(seriesId)await movePlaybookSystemToSeries(row.id,seriesId);
 return row;
}

export async function movePlaybookSystemToSeries(playbookSystemId:string,seriesId:string|null){
 const s=createClient(),uid=await userId();
 const del=await s.from('playbook_series_systems').delete().eq('owner_id',uid).eq('playbook_system_id',playbookSystemId);if(del.error)throw del.error;
 if(seriesId){const {error}=await s.from('playbook_series_systems').insert({owner_id:uid,series_id:seriesId,playbook_system_id:playbookSystemId,position:999});if(error)throw error;}
}

export async function detachPrivateSystemFromPlaybook(system:DrawingSystem,playbookId:string){const s=createClient(),uid=await userId();const id=system.playbookSystemIds[playbookId];if(!id)return;const rel=await s.from('playbook_series_systems').delete().eq('owner_id',uid).eq('playbook_system_id',id);if(rel.error)throw rel.error;const del=await s.from('playbook_systems').delete().eq('owner_id',uid).eq('id',id);if(del.error)throw del.error;}


export async function deletePrivateSystem(system:DrawingSystem){
 const s=createClient(),uid=await userId();
 const ids=Object.values(system.playbookSystemIds||{}).filter(Boolean);
 if(ids.length){
  const rel=await s.from('playbook_series_systems').delete().eq('owner_id',uid).in('playbook_system_id',ids);if(rel.error)throw rel.error;
  const pb=await s.from('playbook_systems').delete().eq('owner_id',uid).in('id',ids);if(pb.error)throw pb.error;
 }
 const del=await s.from('systems').delete().eq('id',system.id).eq('user_id',uid);if(del.error)throw del.error;
}

export async function duplicatePrivateSystem(systemId:string,playbookId?:string|null,seriesId?:string|null):Promise<string>{
 const s=createClient(),uid=await userId();const {data,error}=await s.from('systems').select('*').eq('id',systemId).eq('user_id',uid).single();if(error)throw error;
 const id=crypto.randomUUID();const now=new Date().toISOString();const copy:any={...data,id,title:`${data.title||'Système'} - Copie`,visibility:'private',review_status:'draft',original_system_id:data.id,created_at:now,updated_at:now};delete copy.contributor_name;delete copy.contributor_avatar_url;
 const ins=await s.from('systems').insert(copy).select('*').single();if(ins.error)throw ins.error;
 if(playbookId){const pb=await addSystemToPlaybook({playbook_id:playbookId,title:copy.title,category:'Système demi-terrain',description:copy.deroulement||copy.consignes||'',system_id:id,schema_images:copy.schemaImages||copy.schema_images||[],schema_data_list:copy.schemaDataList||copy.schema_data_list||[],schema_video:copy.schemaVideo??copy.schema_video??null,tags:clean(copy.tags)});if(seriesId)await movePlaybookSystemToSeries(pb.id,seriesId);}
 return id;
}

export async function renamePrivateSystem(systemId:string,title:string){
 const value=title.trim();if(!value)throw new Error('Le nom est obligatoire');
 const s=createClient(),uid=await userId();
 const {error}=await s.from('systems').update({title:value,updated_at:new Date().toISOString()}).eq('id',systemId).eq('user_id',uid);if(error)throw error;
 const pb=await s.from('playbook_systems').update({title:value,updated_at:new Date().toISOString()}).eq('system_id',systemId).eq('owner_id',uid);if(pb.error)throw pb.error;
}
export async function setPrivateSystemTags(systemId:string,tags:string[]){
 const s=createClient(),uid=await userId();const values=Array.from(new Set(clean(tags)));
 const {error}=await s.from('systems').update({tags:values,temps_forts:values,updated_at:new Date().toISOString()}).eq('id',systemId).eq('user_id',uid);if(error)throw error;
 const pb=await s.from('playbook_systems').update({tags:values,updated_at:new Date().toISOString()}).eq('system_id',systemId).eq('owner_id',uid);if(pb.error)throw pb.error;
}
export async function renameSeries(seriesId:string,name:string){return updatePlaybookSeries(seriesId,{name:name.trim()});}
