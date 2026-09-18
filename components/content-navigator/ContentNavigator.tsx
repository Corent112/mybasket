'use client';
import {useEffect,useMemo,useState} from 'react';
import {BookOpen,ChevronDown,ChevronRight,Copy,FolderOpen,Maximize2,Minimize2,MoreHorizontal,Plus,Search,Tags,X} from 'lucide-react';
import {createPlaybook,type Playbook} from '@/lib/playbook';
import {createPlaybookSeries,createPersonalSystemTag,ensureDefaultPersonalSystemTags,listPersonalSystemTags,type PersonalSystemTag,type PlaybookSeries} from '@/lib/playbook-series';
import {attachPrivateSystemToPlaybook,createDrawingSeason,detachPrivateSystemFromPlaybook,duplicatePrivateSystem,ensureDrawingSeasons,listDrawingTeams,loadDrawingSystems,renamePrivateSystem,renameSeries,setPrivateSystemTags,type DrawingSeason,type DrawingSystem,type DrawingTeam} from '@/lib/drawing-workspace';
import './content-navigator.css';

type Props={embedded?:boolean;initialKind?:'exercise'|'system'};
type CreateModal='playbook'|'series'|'season'|'tag'|null;
const LIBRARY='__private_library__';
const uniq=(v:string[])=>Array.from(new Set(v.filter(Boolean)));

export default function ContentNavigator({embedded=false}:Props){
 const[teams,setTeams]=useState<DrawingTeam[]>([]),[seasons,setSeasons]=useState<DrawingSeason[]>([]),[playbooks,setPlaybooks]=useState<Playbook[]>([]),[series,setSeries]=useState<PlaybookSeries[]>([]),[systems,setSystems]=useState<DrawingSystem[]>([]),[tags,setTags]=useState<PersonalSystemTag[]>([]);
 const[teamId,setTeamId]=useState(''),[season,setSeason]=useState('2026-2027'),[playbookId,setPlaybookId]=useState(''),[tag,setTag]=useState(''),[q,setQ]=useState(''),[libraryQ,setLibraryQ]=useState(''),[openSeries,setOpenSeries]=useState<Set<string>>(new Set()),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[actionId,setActionId]=useState('');
 const[view,setView]=useState<'playbook'|'library'>('playbook'),[expanded,setExpanded]=useState(false),[dragTarget,setDragTarget]=useState(''),[toast,setToast]=useState(''),[openLibraryFolders,setOpenLibraryFolders]=useState<Set<string>>(new Set(['__unclassified__']));
 const[modal,setModal]=useState<CreateModal>(null),[createName,setCreateName]=useState(''),[createTags,setCreateTags]=useState<string[]>([]);
 const[addSystemId,setAddSystemId]=useState(''),[addPlaybookId,setAddPlaybookId]=useState(''),[addSeriesId,setAddSeriesId]=useState('');
 async function load(){try{const[t,ss,ws,tg]=await Promise.all([listDrawingTeams(),ensureDrawingSeasons(),loadDrawingSystems(),ensureDefaultPersonalSystemTags()]);setTeams(t);setSeasons(ss);setSystems(ws.systems);setPlaybooks(ws.playbooks);setSeries(ws.series);setTags(tg)}catch(e){console.error('DESSIN workspace',e)}}
 useEffect(()=>{void load()},[]);
 const flash=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(''),1800)};
 const filteredPlaybooks=useMemo(()=>playbooks.filter(p=>
   (!teamId||!p.team_id||p.team_id===teamId)&&
   (!season||!p.season||p.season===season)
 ),[playbooks,teamId,season]);
 const activePlaybook=playbooks.find(p=>p.id===playbookId);const activeSeries=series.filter(s=>s.playbook_id===playbookId).sort((a,b)=>a.position-b.position);
 const contextSystems=useMemo(()=>playbookId?systems.filter(s=>s.playbookIds.includes(playbookId)):[],[systems,playbookId]);
 const matches=(s:DrawingSystem,query=q)=>{const allTags=uniq([...(s.tags||[]),...s.inheritedTags]);return (!tag||allTags.includes(tag))&&(!query||`${s.title} ${allTags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))};
 const visible=useMemo(()=>contextSystems.filter(s=>matches(s)),[contextSystems,tag,q]);
 const libraryVisible=useMemo(()=>systems.filter(s=>matches(s,libraryQ)),[systems,tag,libraryQ]);
 const unclassified=playbookId?visible.filter(s=>!s.seriesIds.some(id=>activeSeries.some(sr=>sr.id===id))):[];
 const privatePool=useMemo(()=>systems.filter(s=>!playbookId||!s.playbookIds.includes(playbookId)).filter(s=>!libraryQ||`${s.title} ${(s.tags||[]).join(' ')}`.toLowerCase().includes(libraryQ.toLowerCase())),[systems,playbookId,libraryQ]);
 const libraryFolders=useMemo(()=>{
   const map=new Map<string,DrawingSystem[]>();
   for(const system of libraryVisible){
     const ownTags=uniq(system.tags||[]);
     const folder=ownTags[0]||'__unclassified__';
     const list=map.get(folder)||[];list.push(system);map.set(folder,list);
   }
   const ordered=[...map.entries()].sort(([a],[b])=>a==='__unclassified__'?1:b==='__unclassified__'?-1:a.localeCompare(b,'fr'));
   return ordered;
 },[libraryVisible]);
 const selectedIndex=visible.findIndex(s=>s.id===selected);
 useEffect(()=>{const h=(e:KeyboardEvent)=>{if(!(e.metaKey||e.ctrlKey)||!selected)return;if(e.key.toLowerCase()==='c'){e.preventDefault();localStorage.setItem('mybasket_copied_system_id',selected);flash('Système copié')}if(e.key.toLowerCase()==='v'){const id=localStorage.getItem('mybasket_copied_system_id');if(id){e.preventDefault();void doDuplicate(id)}}};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[selected,playbookId]);
 function openCreate(kind:CreateModal){setCreateName(kind==='season'?'2027-2028':'');setCreateTags([]);setModal(kind)}
 async function submitCreate(){const name=createName.trim();if(!name)return;setBusy(true);try{
   if(modal==='season'){const row=await createDrawingSeason(name);await load();setSeason(row.label);flash('Saison créée')}
   if(modal==='playbook'){const pb=await createPlaybook({title:name,team_id:teamId||null,season:season||null});await load();setPlaybookId(pb.id);setView('playbook');flash('Playbook créé dans Mes Playbooks')}
   if(modal==='tag'){await createPersonalSystemTag(name);setTags(await listPersonalSystemTags());setTag(name);flash('Tag créé')}
   if(modal==='series'){if(!playbookId)throw new Error('Choisis d’abord un Playbook');for(const value of createTags)await createPersonalSystemTag(value);const row=await createPlaybookSeries(playbookId,name,createTags);await load();setOpenSeries(v=>new Set(v).add(row.id));flash('Série créée')}
   setModal(null);setCreateName('');setCreateTags([]);
 }catch(e:any){alert(e?.message||'Création impossible')}finally{setBusy(false)}}
 function previewSystem(id:string){
   setSelected(id);setActionId('');
   const system=systems.find(s=>s.id===id);
   localStorage.setItem('mybasket_edit_systeme_id',id);
   localStorage.setItem('mybasket_edit_system_id',id);
   localStorage.setItem('mybasket_current_system_id',id);
   localStorage.setItem('mybasket_edit_schema_index','0');
   // Un système ouvert depuis la bibliothèque est un modèle de travail.
   // Toute sauvegarde depuis DESSIN créera une nouvelle fiche privée et ne modifiera jamais la source.
   localStorage.setItem('mybasket_drawing_flow','library-system-copy');
   localStorage.setItem('mybasket_drawing_source_system_id',id);
   try { localStorage.setItem('mybasket_drawing_source_system', JSON.stringify(system || null)); } catch {}

   // Dans DESSIN on ne navigue jamais : on transmet directement le système
   // déjà chargé par la bibliothèque. PlaquetteClient peut donc l'afficher
   // immédiatement, sans refaire une lecture Supabase ni changer de page.
   window.dispatchEvent(new CustomEvent('mybasket:preview-system',{
     detail:{systemId:id,system:system||null}
   }));
  }
 function toggleLibraryFolder(id:string){setOpenLibraryFolders(v=>{const n=new Set(v);n.has(id)?n.delete(id):n.add(id);return n})}
 function toggle(id:string){setOpenSeries(v=>{const n=new Set(v);n.has(id)?n.delete(id):n.add(id);return n})}
 async function doDuplicate(id:string){setBusy(true);try{const source=systems.find(s=>s.id===id);const sr=source?.seriesIds.find(x=>activeSeries.some(a=>a.id===x))||null;const newId=await duplicatePrivateSystem(id,playbookId||null,sr);await load();setSelected(newId);flash('Copie créée dans la bibliothèque privée');previewSystem(newId)}catch(e:any){alert(e?.message||'Duplication impossible')}finally{setBusy(false)}}
 function openAddToPlaybook(systemId:string){
   const preferred=(playbookId&&playbooks.some(p=>p.id===playbookId))?playbookId:(filteredPlaybooks[0]?.id||playbooks[0]?.id||'');
   setAddSystemId(systemId);setAddPlaybookId(preferred);setAddSeriesId('');
 }
 async function confirmAddToPlaybook(){
   if(!addSystemId||!addPlaybookId)return;
   const s=systems.find(x=>x.id===addSystemId);if(!s)return;
   setBusy(true);
   try{
     await attachPrivateSystemToPlaybook(s,addPlaybookId,addSeriesId||null);
     await load();
     setPlaybookId(addPlaybookId);setView('playbook');setSelected(addSystemId);
     if(addSeriesId)setOpenSeries(v=>new Set(v).add(addSeriesId));
     flash(`✓ ${s.title} ajouté au Playbook`);
     setAddSystemId('');setAddPlaybookId('');setAddSeriesId('');
   }catch(e:any){alert(e?.message||'Ajout au Playbook impossible')}
   finally{setBusy(false)}
 }
 async function dropOnPlaybook(systemId:string){if(!playbookId)return;const s=systems.find(x=>x.id===systemId);if(!s)return;setBusy(true);try{await attachPrivateSystemToPlaybook(s,playbookId,null);await load();flash(`✓ ${s.title} ajouté à ${activePlaybook?.title||'ce Playbook'}`)}catch(e:any){alert(e?.message||'Ajout impossible')}finally{setBusy(false);setDragTarget('')}}
 async function dropOnSeries(systemId:string,sr:PlaybookSeries){const s=systems.find(x=>x.id===systemId);if(!s)return;setBusy(true);try{await attachPrivateSystemToPlaybook(s,sr.playbook_id,sr.id);await load();setPlaybookId(sr.playbook_id);setOpenSeries(v=>new Set(v).add(sr.id));flash(`✓ ${s.title} classé dans ${sr.name}`)}catch(e:any){alert(e?.message||'Classement impossible')}finally{setBusy(false);setDragTarget('')}}
 async function removeFromPlaybook(s:DrawingSystem){if(!playbookId)return;setBusy(true);try{await detachPrivateSystemFromPlaybook(s,playbookId);await load();setSelected('');flash('Système retiré du Playbook, conservé dans la bibliothèque privée')}catch(e:any){alert(e?.message||'Retrait impossible')}finally{setBusy(false)}}
 async function renameSystem(s:DrawingSystem){const name=prompt('Nouveau nom du système ?',s.title);if(!name?.trim())return;setBusy(true);try{await renamePrivateSystem(s.id,name);await load()}catch(e:any){alert(e?.message||'Renommage impossible')}finally{setBusy(false)}}
 async function editSystemTags(s:DrawingSystem){const current=uniq([...(s.tags||[]),...s.inheritedTags]);const value=prompt('Tags du système (séparés par des virgules)',current.join(', '));if(value===null)return;const values=uniq(value.split(',').map(x=>x.trim()));setBusy(true);try{for(const x of values)await createPersonalSystemTag(x);await setPrivateSystemTags(s.id,values);await load();setTags(await listPersonalSystemTags())}catch(e:any){alert(e?.message||'Tags impossibles à enregistrer')}finally{setBusy(false)}}
 async function editSeries(sr:PlaybookSeries){const name=prompt('Nom de la série ?',sr.name);if(!name?.trim())return;setBusy(true);try{await renameSeries(sr.id,name);await load()}catch(e:any){alert(e?.message||'Renommage impossible')}finally{setBusy(false)}}
 function systemRow(s:DrawingSystem,compact=false){const opened=actionId===s.id;return <div key={s.id} className='cn-system-wrap'><article className={`cn-system ${selected===s.id?'selected':''} ${compact?'compact':''}`} draggable onDragStart={e=>{e.dataTransfer.setData('text/mybasket-system',s.id);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>setDragTarget('')} onClick={()=>previewSystem(s.id)}><div className='thumb'>{s.schemaImage?<img src={s.schemaImage} alt=''/>:'🏀'}</div><div className='meta'><b>{s.title}</b><small>{uniq([...(s.tags||[]),...s.inheritedTags]).slice(0,3).join(' · ')||'Non classé'}</small></div><button className='more' onClick={e=>{e.stopPropagation();setActionId(opened?'':s.id)}}><MoreHorizontal size={14}/></button></article>{opened&&<div className='cn44-menu'><button onClick={()=>previewSystem(s.id)}>Afficher sur le terrain</button><button onClick={()=>void doDuplicate(s.id)}>Dupliquer et modifier</button><button onClick={()=>void renameSystem(s)}>Renommer</button><button onClick={()=>void editSystemTags(s)}>Modifier les tags</button>{view==='library'&&<button onClick={()=>openAddToPlaybook(s.id)}>+ Ajouter à un Playbook</button>}{playbookId&&s.playbookIds.includes(playbookId)&&<button className='danger' onClick={()=>void removeFromPlaybook(s)}>Retirer du Playbook</button>}</div>}</div>}
 return <aside className={`content-nav-v46 ${embedded?'embedded':''} ${busy?'busy':''} ${expanded?'expanded':''}`}>
  {toast&&<div className='cn46-toast'>{toast}</div>}
  <div className='cn46-head'><div><BookOpen size={16}/><b>DESSIN</b></div><button onClick={()=>setExpanded(v=>!v)} title={expanded?'Réduire':'Agrandir'}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button></div>
  <div className='cn46-mode'><button className={view==='playbook'?'active':''} onClick={()=>setView('playbook')}>PLAYBOOK</button><button className={view==='library'?'active':''} onClick={()=>setView('library')}>BIBLIOTHÈQUE</button></div>
  <div className='cn44-selects'>
   <label>Équipe<select value={teamId} onChange={e=>{setTeamId(e.target.value);setPlaybookId('')}}><option value=''>Toutes mes équipes</option><optgroup label='Mes équipes'>{teams.filter(t=>!t.scouted).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</optgroup><optgroup label='Équipes scoutées'>{teams.filter(t=>t.scouted).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</optgroup></select></label>
   <label>Saison<div className='row'><select value={season} onChange={e=>{setSeason(e.target.value);setPlaybookId('')}}>{seasons.map(s=><option key={s.id}>{s.label}</option>)}</select><button onClick={()=>openCreate('season')} title='Nouvelle saison'><Plus size={14}/></button></div></label>
   {view==='playbook'&&<label>Playbook<div className='row'><select value={playbookId} onChange={e=>{setPlaybookId(e.target.value);setOpenSeries(new Set())}}><option value=''>Choisir un Playbook…</option>{filteredPlaybooks.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select><button onClick={()=>openCreate('playbook')} title='Nouveau Playbook'><Plus size={14}/></button></div></label>}
  </div>
  {view==='library'?<>
    {playbookId&&<div className='cn46-destinations'><b>DESTINATION : {activePlaybook?.title}</b><div className={`cn46-dest ${dragTarget==='playbook'?'drag':''}`} onDragEnter={()=>setDragTarget('playbook')} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void dropOnPlaybook(e.dataTransfer.getData('text/mybasket-system'))}}>+ Playbook</div>{activeSeries.map(sr=><div key={sr.id} className={`cn46-dest ${dragTarget===sr.id?'drag':''}`} onDragEnter={()=>setDragTarget(sr.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void dropOnSeries(e.dataTransfer.getData('text/mybasket-system'),sr)}}>↳ {sr.name}</div>)}</div>}
    <div className='cn44-search'><Search size={14}/><input value={libraryQ} onChange={e=>setLibraryQ(e.target.value)} placeholder='Rechercher dans mes systèmes…'/></div>
    <div className='cn50-library-title'><div><b>MES DOSSIERS</b><small>{libraryVisible.length} système{libraryVisible.length>1?'s':''}</small></div><button onClick={()=>openCreate('tag')} title='Nouveau dossier'><Plus size={14}/> Dossier</button></div>
    <div className='cn50-folder-list'>{libraryFolders.length?libraryFolders.map(([folder,items])=>{const isOpen=openLibraryFolders.has(folder)||!!libraryQ;const label=folder==='__unclassified__'?'Non classés':folder;return <div className='cn50-folder' key={folder}><button className='cn50-folder-head' onClick={()=>toggleLibraryFolder(folder)}>{isOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<FolderOpen size={15}/><b>{label}</b><span>{items.length}</span></button>{isOpen&&<div className='cn50-folder-children'>{items.map(s=>systemRow(s,true))}</div>}</div>}):<div className='cn50-empty'>Aucun système dans cette bibliothèque.</div>}</div>
    {selected&&libraryVisible.some(s=>s.id===selected)&&<button className='cn49-add-playbook' onClick={()=>openAddToPlaybook(selected)}><Plus size={14}/> Ajouter à un Playbook</button>}
   </>:!playbookId?<div className='cn44-empty'><FolderOpen size={26}/><b>Reprends un Playbook</b><span>Choisis un Playbook existant ou crée-en un nouveau. Tes systèmes privés restent dans l’onglet Bibliothèque.</span><button onClick={()=>openCreate('playbook')}><Plus size={14}/> Nouveau Playbook</button></div>:<>
    <div className='cn46-context'><div><b>{activePlaybook?.title}</b><small>{season||activePlaybook?.season}</small></div><button onClick={()=>setView('library')}>Bibliothèque</button></div>
    <div className='cn44-search'><Search size={14}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder='Rechercher dans ce Playbook…'/></div>
    <div className='cn46-filterbar'><button className={!tag?'on':''} onClick={()=>setTag('')}>Tous</button>{tags.map(t=><button key={t.id} className={tag===t.name?'on':''} onClick={()=>setTag(tag===t.name?'':t.name)}>{t.name}</button>)}<button onClick={()=>openCreate('tag')}>+</button></div>
    <div className={`cn46-drop-playbook ${dragTarget==='playbook'?'drag':''}`} onDragEnter={()=>setDragTarget('playbook')} onDragOver={e=>e.preventDefault()} onDragLeave={()=>setDragTarget('')} onDrop={e=>{e.preventDefault();void dropOnPlaybook(e.dataTransfer.getData('text/mybasket-system'))}}><b>+ Déposer dans {activePlaybook?.title}</b></div>
    <section><div className='cn44-section'><b>SÉRIES</b><button onClick={()=>openCreate('series')}><Plus size={14}/></button></div>{activeSeries.length?activeSeries.map(sr=>{const children=visible.filter(s=>s.seriesIds.includes(sr.id));return <div key={sr.id} className={`cn44-series ${dragTarget===sr.id?'drag':''}`} onDragEnter={()=>setDragTarget(sr.id)} onDragOver={e=>e.preventDefault()} onDragLeave={()=>setDragTarget('')} onDrop={e=>{e.preventDefault();e.stopPropagation();void dropOnSeries(e.dataTransfer.getData('text/mybasket-system'),sr)}}><div className='series-head-row'><button className='series-head' onClick={()=>toggle(sr.id)}>{openSeries.has(sr.id)?<ChevronDown size={14}/>:<ChevronRight size={14}/>} {sr.name}<span>{children.length}</span></button><button className='series-more' onClick={()=>void editSeries(sr)}><MoreHorizontal size={13}/></button></div>{sr.tags.length>0&&<div className='series-tags'>{sr.tags.map(x=><span key={x}>{x}</span>)}</div>}{openSeries.has(sr.id)&&<div className='series-children'>{children.map(s=>systemRow(s,true))}<small className='drop-hint'>+ Déposer dans {sr.name}</small></div>}</div>}):<small>Aucune série. Crée ta première série avec +.</small>}</section>
    <div className='cn44-unclassified'><b>SANS SÉRIE</b>{unclassified.length?unclassified.map(s=>systemRow(s,true)):<small>Aucun système non classé.</small>}</div>
    <button className='cn46-add-system' onClick={()=>setView('library')}><Plus size={14}/> Ajouter un système depuis ma bibliothèque</button>
    {selected&&<div className='cn46-nav-actions'>{selectedIndex>0&&<button onClick={()=>previewSystem(visible[selectedIndex-1].id)}>← Précédent</button>}<button onClick={()=>previewSystem(selected)}>Afficher</button>{selectedIndex>=0&&selectedIndex<visible.length-1&&<button onClick={()=>previewSystem(visible[selectedIndex+1].id)}>Suivant →</button>}<button onClick={()=>void doDuplicate(selected)}><Copy size={12}/> Dupliquer</button></div>}
   </>}
  {addSystemId&&<div className='cn44-modal-back' onMouseDown={()=>setAddSystemId('')}><div className='cn44-modal cn49-add-modal' onMouseDown={e=>e.stopPropagation()}><div className='modal-title'><b>Ajouter à un Playbook</b><button onClick={()=>setAddSystemId('')}><X size={16}/></button></div>
   <label>Playbook<select value={addPlaybookId} onChange={e=>{setAddPlaybookId(e.target.value);setAddSeriesId('')}}><option value=''>Choisir un Playbook…</option>{playbooks.map(p=><option key={p.id} value={p.id}>{p.title}{p.season?` · ${p.season}`:''}</option>)}</select></label>
   <label>Série<select value={addSeriesId} onChange={e=>setAddSeriesId(e.target.value)} disabled={!addPlaybookId}><option value=''>Sans série</option>{series.filter(sr=>sr.playbook_id===addPlaybookId).sort((a,b)=>a.position-b.position).map(sr=><option key={sr.id} value={sr.id}>{sr.name}</option>)}</select></label>
   <div className='cn49-modal-actions'><button onClick={()=>setAddSystemId('')}>Annuler</button><button className='primary' disabled={!addPlaybookId||busy} onClick={()=>void confirmAddToPlaybook()}>Ajouter</button></div>
  </div></div>}{modal&&<div className='cn46-modal-backdrop' onClick={()=>setModal(null)}><div className='cn46-modal' onClick={e=>e.stopPropagation()}><div className='cn46-modal-title'><b>{modal==='playbook'?'Nouveau Playbook':modal==='series'?'Nouvelle Série':modal==='season'?'Nouvelle Saison':'Nouveau Tag'}</b><button onClick={()=>setModal(null)}><X size={15}/></button></div><label>{modal==='season'?'Saison':'Nom'}<input autoFocus value={createName} onChange={e=>setCreateName(e.target.value)} placeholder={modal==='season'?'2027-2028':modal==='series'?'Transition / Horns / Spain…':modal==='tag'?'Pick top / Spanish…':'Nom du Playbook'}/></label>{modal==='playbook'&&<div className='cn46-summary'>Équipe : <b>{teams.find(t=>t.id===teamId)?.name||'Aucune'}</b><br/>Saison : <b>{season||'Aucune'}</b></div>}{modal==='series'&&<><div className='cn46-summary'>Playbook : <b>{activePlaybook?.title}</b></div><div className='cn46-modal-tags'><span>Tags de la série</span>{tags.map(t=><button key={t.id} className={createTags.includes(t.name)?'on':''} onClick={()=>setCreateTags(v=>v.includes(t.name)?v.filter(x=>x!==t.name):[...v,t.name])}>{t.name}</button>)}</div></>}<button className='cn46-create' disabled={!createName.trim()} onClick={()=>void submitCreate()}>Créer</button></div></div>}
 </aside>
}
