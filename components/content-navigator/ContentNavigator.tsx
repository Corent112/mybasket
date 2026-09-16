'use client';
import {useEffect,useMemo,useState} from 'react';
import {BookOpen,ChevronDown,ChevronRight,Plus,Search,Star} from 'lucide-react';
import {createPlaybook,type Playbook} from '@/lib/playbook';
import {createPlaybookSeries,createPersonalSystemTag,ensureDefaultPersonalSystemTags,listPersonalSystemTags,type PersonalSystemTag,type PlaybookSeries} from '@/lib/playbook-series';
import {createDrawingSeason,ensureDrawingSeasons,listDrawingTeams,loadDrawingSystems,openPrivateSystemInDrawing,type DrawingSeason,type DrawingSystem,type DrawingTeam} from '@/lib/drawing-workspace';
import './content-navigator.css';

type Props={embedded?:boolean;initialKind?:'exercise'|'system'};
export default function ContentNavigator({embedded=false}:Props){
 const[teams,setTeams]=useState<DrawingTeam[]>([]),[seasons,setSeasons]=useState<DrawingSeason[]>([]),[playbooks,setPlaybooks]=useState<Playbook[]>([]),[series,setSeries]=useState<PlaybookSeries[]>([]),[systems,setSystems]=useState<DrawingSystem[]>([]),[tags,setTags]=useState<PersonalSystemTag[]>([]);
 const[teamId,setTeamId]=useState(''),[season,setSeason]=useState('2026-2027'),[playbookId,setPlaybookId]=useState(''),[seriesId,setSeriesId]=useState(''),[tag,setTag]=useState(''),[q,setQ]=useState(''),[openSeries,setOpenSeries]=useState<Set<string>>(new Set());
 async function load(){try{const[t,ss,ws,tg]=await Promise.all([listDrawingTeams(),ensureDrawingSeasons(),loadDrawingSystems(),ensureDefaultPersonalSystemTags()]);setTeams(t);setSeasons(ss);setSystems(ws.systems);setPlaybooks(ws.playbooks);setSeries(ws.series);setTags(tg)}catch(e){console.error('DESSIN workspace',e)}}
 useEffect(()=>{load()},[]);
 const selectedTeam=teams.find(t=>t.id===teamId);const filteredPlaybooks=useMemo(()=>playbooks.filter(p=>(!teamId||p.team_id===teamId)&&(!season||p.season===season)),[playbooks,teamId,season]);
 useEffect(()=>{if(playbookId&&!filteredPlaybooks.some(p=>p.id===playbookId)){setPlaybookId('');setSeriesId('')}},[teamId,season]);
 const visible=useMemo(()=>systems.filter(s=>!playbookId||s.playbookIds.includes(playbookId)).filter(s=>!seriesId||s.seriesIds.includes(seriesId)).filter(s=>!tag||Array.from(new Set([...(s.tags||[]),...s.inheritedTags])).includes(tag)).filter(s=>!q||`${s.title} ${(s.tags||[]).join(' ')} ${s.inheritedTags.join(' ')}`.toLowerCase().includes(q.toLowerCase())),[systems,playbookId,seriesId,tag,q]);
 const activeSeries=series.filter(s=>!playbookId||s.playbook_id===playbookId);
 async function addSeason(){const v=prompt('Nouvelle saison (ex. 2027-2028) ?');if(!v)return;try{const row=await createDrawingSeason(v);await load();setSeason(row.label)}catch(e:any){alert(e?.message||'Impossible de créer la saison')}}
 async function addPlaybook(){const name=prompt('Nom du nouveau Playbook ?');if(!name?.trim())return;const pb=await createPlaybook({title:name.trim(),team_id:teamId||null,season:season||null});await load();setPlaybookId(pb.id)}
 async function addSeries(){if(!playbookId){alert('Choisis ou crée d’abord un Playbook.');return}const name=prompt('Nom de la nouvelle série ?');if(!name?.trim())return;const row=await createPlaybookSeries(playbookId,name,tag?[tag]:[]);await load();setSeriesId(row.id)}
 async function addTag(){const name=prompt('Nouveau tag de jeu ?');if(!name?.trim())return;await createPersonalSystemTag(name);setTags(await listPersonalSystemTags());setTag(name.trim())}
 function toggle(id:string){setOpenSeries(v=>{const n=new Set(v);n.has(id)?n.delete(id):n.add(id);return n})}
 return <aside className={`content-nav-v43 ${embedded?'embedded':''}`}>
  <div className='cn43-title'><BookOpen size={16}/><b>BIBLIOTHÈQUE</b></div>
  <div className='cn43-tabs'><button>EXERCICES</button><button className='active'>SYSTÈMES</button></div>
  <div className='cn43-selects'>
   <label>Équipe<select value={teamId} onChange={e=>{setTeamId(e.target.value);setPlaybookId('');setSeriesId('')}}><option value=''>Toutes les équipes</option><optgroup label='Mes équipes'>{teams.filter(t=>!t.scouted).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</optgroup><optgroup label='Équipes scoutées'>{teams.filter(t=>t.scouted).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</optgroup></select></label>
   <label>Saison<div className='row'><select value={season} onChange={e=>{setSeason(e.target.value);setPlaybookId('');setSeriesId('')}}><option value=''>Toutes les saisons</option>{seasons.map(s=><option key={s.id}>{s.label}</option>)}</select><button onClick={addSeason} title='Nouvelle saison'><Plus size={14}/></button></div></label>
   <label>Playbook<div className='row'><select value={playbookId} onChange={e=>{setPlaybookId(e.target.value);setSeriesId('')}}><option value=''>Tous les systèmes créés</option>{filteredPlaybooks.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select><button onClick={addPlaybook} title='Nouveau Playbook'><Plus size={14}/></button></div></label>
  </div>
  <div className='cn43-search'><Search size={14}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder='Rechercher un système…'/></div>
  <div className='cn43-quick'><button onClick={()=>{setSeriesId('');setTag('')}}>Tous les systèmes <span>{systems.length}</span></button><button><Star size={13}/> Favoris</button></div>
  <section><div className='cn43-section'><b>SÉRIES</b><button onClick={addSeries}><Plus size={14}/></button></div>{playbookId?activeSeries.map(sr=>{const children=systems.filter(s=>s.seriesIds.includes(sr.id));return <div key={sr.id} className='cn43-series'><button className='series-head' onClick={()=>toggle(sr.id)}>{openSeries.has(sr.id)?<ChevronDown size={14}/>:<ChevronRight size={14}/>} {sr.name}<span>{children.length}</span></button>{openSeries.has(sr.id)&&children.map(s=><button key={s.id} className='series-system' onDoubleClick={()=>openPrivateSystemInDrawing(s.id)} onClick={()=>setSeriesId(sr.id)}>{s.schemaImage?<img src={s.schemaImage} alt=''/>:<i>🏀</i>}<span>{s.title}</span></button>)}</div>}):<small>Choisis un Playbook pour afficher ses séries.</small>}</section>
  <section><div className='cn43-section'><b>TAGS / TEMPS FORTS</b><button onClick={addTag}><Plus size={14}/></button></div><div className='cn43-tags'><button className={!tag?'on':''} onClick={()=>setTag('')}>Tous</button>{tags.map(t=><button key={t.id} className={tag===t.name?'on':''} onClick={()=>setTag(tag===t.name?'':t.name)}>{t.name}</button>)}</div></section>
  <div className='cn43-list-title'><b>{playbookId?playbooks.find(p=>p.id===playbookId)?.title:'Bibliothèque privée'}</b><span>{visible.length}</span></div>
  <div className='cn43-list'>{visible.map(s=><article key={s.id} onDoubleClick={()=>openPrivateSystemInDrawing(s.id)}><div className='thumb'>{s.schemaImage?<img src={s.schemaImage} alt=''/>:'🏀'}</div><div><b>{s.title}</b><small>{Array.from(new Set([...(s.tags||[]),...s.inheritedTags])).slice(0,3).join(' · ')||'Non classé'}</small></div></article>)}</div>
  {selectedTeam&&<div className='cn43-foot'>{selectedTeam.scouted?'Équipe scoutée':'Mon équipe'} · {season||'Toutes saisons'}</div>}
 </aside>
}
