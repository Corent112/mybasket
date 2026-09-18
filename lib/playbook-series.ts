import { createClient } from '@/lib/supabase/client';
import { addSystemToPlaybook, listPlaybooks, type Playbook, type PlaybookSystem } from '@/lib/playbook';
import type { SystemItem } from '@/lib/systems';

export type PlaybookSeries = { id:string; owner_id:string; playbook_id:string; name:string; position:number; tags:string[]; created_at?:string; updated_at?:string };
export type PersonalSystemTag = { id:string; owner_id:string; name:string; created_at?:string };
export type PendingPlaybookSave = { playbookId:string|null; seriesId:string|null; tags:string[] };
export const PENDING_PLAYBOOK_SAVE_KEY = 'mybasket_pending_playbook_save';

async function uid(){ const s=createClient(); const {data,error}=await s.auth.getUser(); if(error||!data.user) throw new Error('Session utilisateur indisponible'); return data.user.id; }
const clean=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&!!x.trim()):[];

export async function listPrivatePlaybooks():Promise<Playbook[]>{ return listPlaybooks(); }
export const DEFAULT_PERSONAL_SYSTEM_TAGS=['Pick top','Pick side','Pick non porteur','Post up','1v1','Pick the picker','Spanish'];
export async function ensureDefaultPersonalSystemTags():Promise<PersonalSystemTag[]>{ const existing=await listPersonalSystemTags(); if(existing.length)return existing; for(const name of DEFAULT_PERSONAL_SYSTEM_TAGS) await createPersonalSystemTag(name); return listPersonalSystemTags(); }
export async function listPlaybookSeries(playbookId:string):Promise<PlaybookSeries[]>{ if(!playbookId)return[]; const s=createClient(), owner=await uid(); const {data,error}=await s.from('playbook_series').select('*').eq('owner_id',owner).eq('playbook_id',playbookId).order('position').order('created_at'); if(error)throw error; return (data||[]).map((x:any)=>({...x,tags:clean(x.tags)})); }
export async function createPlaybookSeries(playbookId:string,name:string,tags:string[]=[]):Promise<PlaybookSeries>{ const s=createClient(),owner=await uid(); const current=await listPlaybookSeries(playbookId); const {data,error}=await s.from('playbook_series').insert({owner_id:owner,playbook_id:playbookId,name:name.trim(),position:current.length,tags:clean(tags)}).select('*').single(); if(error)throw error; return {...data,tags:clean(data.tags)} as PlaybookSeries; }
export async function updatePlaybookSeries(id:string,patch:Partial<Pick<PlaybookSeries,'name'|'position'|'tags'>>){
 const s=createClient(),owner=await uid();
 const before=(await s.from('playbook_series').select('*').eq('id',id).eq('owner_id',owner).single()).data as any;
 const oldTags=clean(before?.tags); const p:any={...patch,updated_at:new Date().toISOString()}; if(p.tags)p.tags=clean(p.tags);
 const {data,error}=await s.from('playbook_series').update(p).eq('id',id).eq('owner_id',owner).select('*').single(); if(error)throw error;
 // Quand les tags d'une série changent, les systèmes de cette série sont immédiatement réindexés pour les filtres.
 if(p.tags){
   const rel=await s.from('playbook_series_systems').select('playbook_system_id').eq('owner_id',owner).eq('series_id',id);
   const ids=(rel.data||[]).map((x:any)=>x.playbook_system_id);
   if(ids.length){
     const pbRows=await s.from('playbook_systems').select('id,system_id,tags').eq('owner_id',owner).in('id',ids);
     for(const row of pbRows.data||[]){
       const direct=clean(row.tags).filter(t=>!oldTags.includes(t)); const merged=Array.from(new Set([...direct,...p.tags]));
       await s.from('playbook_systems').update({tags:merged,updated_at:new Date().toISOString()}).eq('id',row.id).eq('owner_id',owner);
       if(row.system_id) await s.from('systems').update({tags:merged,temps_forts:merged,updated_at:new Date().toISOString()}).eq('id',row.system_id).eq('user_id',owner);
     }
   }
 }
 return {...data,tags:clean(data.tags)} as PlaybookSeries;
}
export async function deletePlaybookSeries(id:string){ const s=createClient(),owner=await uid(); const {error}=await s.from('playbook_series').delete().eq('id',id).eq('owner_id',owner); if(error)throw error; }
export async function listPersonalSystemTags():Promise<PersonalSystemTag[]>{ const s=createClient(),owner=await uid(); const {data,error}=await s.from('personal_system_tags').select('*').eq('owner_id',owner).order('name'); if(error)throw error; return (data||[]) as PersonalSystemTag[]; }
export async function createPersonalSystemTag(name:string){ const s=createClient(),owner=await uid(); const cleanName=name.trim(); const {data,error}=await s.from('personal_system_tags').upsert({owner_id:owner,name:cleanName},{onConflict:'owner_id,name'}).select('*').single(); if(error)throw error; return data as PersonalSystemTag; }
export async function deletePersonalSystemTag(name:string){
 const cleanName=name.trim(); if(!cleanName)return;
 const s=createClient(),owner=await uid();
 // Supprimer un dossier ne supprime jamais les systèmes : on retire seulement ce tag de classement.
 const {data:rows,error:rowsError}=await s.from('systems').select('id,tags,temps_forts').eq('user_id',owner); if(rowsError)throw rowsError;
 for(const row of rows||[]){
   const tags=clean(row.tags).filter(t=>t!==cleanName);
   const temps=clean(row.temps_forts).filter(t=>t!==cleanName);
   if(tags.length!==clean(row.tags).length||temps.length!==clean(row.temps_forts).length){
     const {error}=await s.from('systems').update({tags,temps_forts:temps,updated_at:new Date().toISOString()}).eq('id',row.id).eq('user_id',owner); if(error)throw error;
   }
 }
 const {error}=await s.from('personal_system_tags').delete().eq('owner_id',owner).eq('name',cleanName); if(error)throw error;
}
export function savePendingPlaybookSelection(value:PendingPlaybookSave){ localStorage.setItem(PENDING_PLAYBOOK_SAVE_KEY,JSON.stringify(value)); }
export function readPendingPlaybookSelection():PendingPlaybookSave|null{ try{return JSON.parse(localStorage.getItem(PENDING_PLAYBOOK_SAVE_KEY)||'null')}catch{return null} }
export function clearPendingPlaybookSelection(){ localStorage.removeItem(PENDING_PLAYBOOK_SAVE_KEY); }

export async function attachSystemToPlaybook(system:SystemItem, pending:PendingPlaybookSave):Promise<PlaybookSystem|null>{
  const s=createClient(),owner=await uid();
  // Les tags choisis dans DESSIN appartiennent toujours à la fiche privée, même sans Playbook.
  let tags=Array.from(new Set(pending.tags));
  let series:PlaybookSeries|undefined;
  if(pending.playbookId && pending.seriesId){ series=(await listPlaybookSeries(pending.playbookId)).find(x=>x.id===pending.seriesId); tags=Array.from(new Set([...(series?.tags||[]),...tags])); }
  await s.from('systems').update({tags,temps_forts:tags,updated_at:new Date().toISOString()}).eq('id',system.id).eq('user_id',owner);
  if(!pending.playbookId) return null;
  const row=await addSystemToPlaybook({playbook_id:pending.playbookId,title:system.title,category:'Système demi-terrain',description:system.deroulement||system.consignes||'',system_id:system.id,schema_images:system.schemaImages||[],schema_data_list:system.schemaDataList||[],schema_video:(system as any).schemaVideo||null,tags});
  if(series){ const {error}=await s.from('playbook_series_systems').upsert({owner_id:owner,series_id:series.id,playbook_system_id:row.id,position:999},{onConflict:'series_id,playbook_system_id'}); if(error)throw error; }
  return row;
}
export async function duplicateSystemIntoSeries(source:PlaybookSystem, seriesId:string|null){
  const s=createClient(),owner=await uid(); const {data,error}=await s.from('systems').select('*').eq('id',source.system_id).eq('user_id',owner).maybeSingle(); if(error)throw error;
  if(!data) throw new Error('Système source introuvable dans votre bibliothèque privée');
  const newId=crypto.randomUUID(); const title=`${data.title||source.title} - Copie`;
  const copy={...data,id:newId,title,visibility:'private',review_status:'draft',original_system_id:data.id,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  delete (copy as any).contributor_name; delete (copy as any).contributor_avatar_url;
  const ins=await s.from('systems').insert(copy).select('*').single(); if(ins.error)throw ins.error;
  const pb=await addSystemToPlaybook({playbook_id:source.playbook_id,title,category:(source.category||'Système demi-terrain') as any,description:source.description||'',system_id:newId,schema_images:clean(source.schema_images),schema_data_list:Array.isArray(source.schema_data_list)?source.schema_data_list:[],schema_video:source.schema_video??null,tags:clean(source.tags)});
  if(seriesId){const rel=await s.from('playbook_series_systems').insert({owner_id:owner,series_id:seriesId,playbook_system_id:pb.id,position:999});if(rel.error)throw rel.error;}
  localStorage.setItem('mybasket_edit_system_id',newId); localStorage.setItem('mybasket_current_system_id',newId);
  return {systemId:newId,playbookSystem:pb};
}
export async function listSeriesMembership(playbookId:string):Promise<Record<string,string>>{
 const s=createClient(),owner=await uid(); const series=await listPlaybookSeries(playbookId); if(!series.length)return{};
 const {data,error}=await s.from('playbook_series_systems').select('series_id,playbook_system_id').eq('owner_id',owner).in('series_id',series.map(x=>x.id)); if(error)throw error;
 return Object.fromEntries((data||[]).map((x:any)=>[x.playbook_system_id,x.series_id]));
}
export async function setPlaybookSystemSeries(playbookSystemId:string,seriesId:string|null){
 const s=createClient(),owner=await uid(); const del=await s.from('playbook_series_systems').delete().eq('owner_id',owner).eq('playbook_system_id',playbookSystemId); if(del.error)throw del.error;
 if(seriesId){const ins=await s.from('playbook_series_systems').insert({owner_id:owner,series_id:seriesId,playbook_system_id:playbookSystemId,position:999});if(ins.error)throw ins.error;}
}
