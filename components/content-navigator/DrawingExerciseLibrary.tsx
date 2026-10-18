'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { listMyExercises, getExercise, updateExercise, duplicateExercise, deleteExercise } from '@/lib/exercises';
import { exerciseDrawingGroups } from '@/lib/drawing-exercise-library';
import type { Exercise } from '@/types/exercise';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const uniq = (values: string[]) => [...new Set(values.filter(Boolean))];
export default function DrawingExerciseLibrary({ onOpen, onSave }: {
  onOpen?: (exercise: Exercise, index: number) => void;
  onSave?: () => void | Promise<void>;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState(''), [theme, setTheme] = useState(''), [level, setLevel] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [selected, setSelected] = useState(''), [menu, setMenu] = useState(''), [expanded, setExpanded] = useState('');
  const [open, setOpen] = useState(new Set(['Mes exercices']));
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]), [dragTarget, setDragTarget] = useState('');
  const [dialog, setDialog] = useState<{kind:'folder'|'rename'|'tags'|'rename-folder'; exercise?:Exercise; folder?:string}|null>(null);
  const [value, setValue] = useState('');
  const [folderKey, setFolderKey] = useState('');
  const owner = exercises.find(e=>e.user_id||e.owner_id)?.user_id || exercises.find(e=>e.owner_id)?.owner_id || '';
  useEffect(()=>{
    if(!owner)return;
    const key=`mybasket:drawing-exercise-folders:${owner}`;
    try { const stored=JSON.parse(window.localStorage.getItem(key)||'[]');setEmptyFolders(prev=>uniq([...prev,...(Array.isArray(stored)?stored.filter((v:unknown)=>typeof v==='string'):[])])); } catch {}
    setFolderKey(key);
  },[owner]);
  useEffect(()=>{if(folderKey)try{window.localStorage.setItem(folderKey,JSON.stringify(emptyFolders));}catch{}},[folderKey,emptyFolders]);
  async function load() { const result = await listMyExercises(); setExercises(result); setError(''); return result; }
  useEffect(() => {
    let alive = true;
    const reload = async () => { setLoading(true); try { const result = await listMyExercises(); if (alive) { setExercises(result); setError(''); } }
      catch { if (alive) setError('Impossible de charger les exercices.'); } finally { if (alive) setLoading(false); } };
    void reload(); window.addEventListener('mybasket:library-exercise-saved', reload);
    return () => { alive = false; window.removeEventListener('mybasket:library-exercise-saved', reload); };
  }, []);
  const themes = uniq(exercises.flatMap(e => e.themes?.length ? e.themes : [e.theme || ''])).sort();
  const levels = uniq(exercises.map(e => e.level || e.niveau || '')).sort();
  const visible = useMemo(() => exercises.filter(e => (!theme || (e.themes?.length ? e.themes : [e.theme]).includes(theme)) && (!level || (e.level || e.niveau) === level)
    && normalize(`${e.title} ${e.theme || ''} ${(e.themes || []).join(' ')} ${(e.tags || []).join(' ')}`).includes(normalize(query))), [exercises, query, theme, level]);
  const folders = useMemo(() => {
    const map = new Map<string, Exercise[]>([['Mes exercices', visible]]);
    emptyFolders.forEach(name => map.set(name, []));
    visible.forEach(e => { const names = e.tags?.length ? uniq(e.tags) : ['Non classés']; names.forEach(name => { if (name !== 'Mes exercices') map.set(name, [...(map.get(name) || []), e]); }); });
    return [...map];
  }, [visible, emptyFolders]);
  const toggleFolder = (folder:string) => setOpen(previous => { const next = new Set(previous); next.has(folder) ? next.delete(folder) : next.add(folder); return next; });
  const openExercise = (exercise:Exercise,index?:number) => {
    const groups=exerciseDrawingGroups(exercise), group=index==null?groups.find(g=>g.editable):groups.find(g=>g.index===index);
    if (!group?.editable) { setError('Image seule : aucun dessin modifiable dans cet exercice.'); return; }
    setSelected(`${exercise.id}:${group.index}`); setMenu(''); onOpen?.(exercise,group.index);
  };
  async function perform(task:()=>Promise<void>) { setBusy(true);setError('');try {await task();} catch(e) {setError(e instanceof Error ? e.message : 'Opération impossible.');} finally {setBusy(false);} }
  async function patch(exercise:Exercise,changes:Partial<Exercise>) {
    const fresh=await getExercise(exercise.id);if(!fresh)throw Error('Exercice introuvable.');
    // L'API existante attend les champs camelCase complets pour préserver les médias.
    const saved=await updateExercise(exercise.id,{...fresh,...changes});if(!saved)throw Error('Enregistrement impossible.');
  }
  async function move(exercise:Exercise,folder:string) {
    if(folder==='Mes exercices')return;
    await perform(async()=>{await patch(exercise,{tags:folder==='Non classés'?[]:uniq([...(exercise.tags||[]),folder])});await load();setOpen(prev=>new Set([...prev,folder]));});
  }
  function edit(kind:'folder'|'rename'|'tags'|'rename-folder',exercise?:Exercise,folder?:string) {setMenu('');setDialog({kind,exercise,folder});setValue(kind==='rename'?exercise?.title||'':kind==='tags'?(exercise?.tags||[]).join(', '):folder||'');}
  async function submit() {
    if(!dialog || (dialog.kind!=='tags'&&!value.trim()))return;
    await perform(async()=>{
      const name=value.trim();
      if(dialog.kind==='folder') {if(['Mes exercices','Non classés'].includes(name))throw Error('Ce dossier existe déjà.');setEmptyFolders(prev=>uniq([...prev,name]));setOpen(prev=>new Set([...prev,name]));}
      if(dialog.kind==='rename'&&dialog.exercise) {await patch(dialog.exercise,{title:name});window.dispatchEvent(new CustomEvent('mybasket:library-exercise-renamed',{detail:{id:dialog.exercise.id,title:name}}));await load();}
      if(dialog.kind==='tags'&&dialog.exercise) {await patch(dialog.exercise,{tags:uniq(value.split(',').map(v=>v.trim()))});await load();}
      if(dialog.kind==='rename-folder'&&dialog.folder) {
        if(['Mes exercices','Non classés'].includes(name))throw Error('Nom de dossier réservé.');
        for(const e of exercises.filter(e=>e.tags?.includes(dialog.folder!)))await patch(e,{tags:uniq((e.tags||[]).map(tag=>tag===dialog.folder?name:tag))});
        setEmptyFolders(prev=>uniq([...prev.filter(f=>f!==dialog.folder),name]));await load();setOpen(prev=>new Set([...prev,name]));
      }
      setDialog(null);
    });
  }
  async function removeFolder(folder:string) {
    if(!window.confirm(`Supprimer le dossier « ${folder} » ? Les exercices sont conservés.`))return;
    await perform(async()=>{for(const e of exercises.filter(e=>e.tags?.includes(folder)))await patch(e,{tags:(e.tags||[]).filter(tag=>tag!==folder)});setEmptyFolders(prev=>prev.filter(f=>f!==folder));await load();});
  }
  function row(exercise:Exercise) {
    const groups=exerciseDrawingGroups(exercise), selectedHere=selected.startsWith(`${exercise.id}:`), opened=menu===exercise.id;
    return <div className="cn-system-wrap" key={exercise.id}>
      <article role="button" tabIndex={0} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openExercise(exercise);}}} className={`cn-system compact ${selectedHere?'selected':''}`} draggable={!busy} onDragStart={e=>{e.dataTransfer.setData('text/mybasket-exercise',exercise.id);e.dataTransfer.effectAllowed='copy';}} onClick={()=>openExercise(exercise)}>
        <div className="thumb">{(exercise.schemaImage||exercise.schemaImages?.[0])?<img src={exercise.schemaImage||exercise.schemaImages?.[0]} alt=""/>:'🏀'}</div>
        <div className="meta"><b>{exercise.title}</b><small>{exercise.tags?.join(' · ')||exercise.theme||'Non classé'}</small></div>
        <button className="more" aria-label={`Actions ${exercise.title}`} aria-expanded={opened} onClick={e=>{e.stopPropagation();setMenu(opened?'':exercise.id);}}><MoreHorizontal size={14}/></button>
      </article>
      {opened&&<div className="cn44-menu">
        <button onClick={()=>openExercise(exercise)}>Afficher sur le terrain</button>
        {groups.length>1&&<button onClick={()=>{setExpanded(expanded===exercise.id?'':exercise.id);setMenu('');}}>Choisir un schéma ({groups.length})</button>}
        <button disabled={busy} onClick={()=>void perform(async()=>{const copy=await duplicateExercise(exercise.id);if(!copy)throw Error('Duplication impossible.');await load();openExercise(copy);})}>Dupliquer et modifier</button>
        <button disabled={!selectedHere||!onSave||busy} onClick={()=>{setMenu('');void onSave?.();}}>💾 Sauvegarder les modifications</button>
        <button onClick={()=>edit('rename',exercise)}>Renommer</button>
        <button onClick={()=>edit('tags',exercise)}>Modifier les tags / dossiers</button>
        <button className="danger" disabled={busy} onClick={()=>{if(window.confirm(`Supprimer l’exercice « ${exercise.title} » ?`))void perform(async()=>{if(!await deleteExercise(exercise.id))throw Error('Suppression impossible.');setMenu('');await load();});}}>Supprimer</button>
      </div>}
      {groups.length>1&&<button className="cn-exercise-schemas-toggle" aria-expanded={expanded===exercise.id} onClick={()=>setExpanded(expanded===exercise.id?'':exercise.id)}>{expanded===exercise.id?'⌄':'›'} {groups.length} schémas</button>}
      {groups.length>1&&expanded===exercise.id&&groups.map((group,position)=><button key={group.index} className="cn-exercise-open" aria-pressed={selected===`${exercise.id}:${group.index}`} disabled={!group.editable} onClick={()=>openExercise(exercise,group.index)}>{group.image&&<img src={group.image} alt=""/>}<span>Schéma {position+1}{!group.editable?' · image seule':''}</span></button>)}
      {selectedHere&&onSave&&<button className="cn-exercise-save" disabled={busy} onClick={()=>void onSave()}>Enregistrer les modifications</button>}
    </div>;
  }
  return <div className="cn-exercises" aria-busy={busy}>
    <div className="cn44-selects"><label>Thème<select aria-label="Thème des exercices" value={theme} onChange={e=>setTheme(e.target.value)}><option value="">Tous les thèmes</option>{themes.map(v=><option key={v}>{v}</option>)}</select></label><label>Niveau<select aria-label="Niveau des exercices" value={level} onChange={e=>setLevel(e.target.value)}><option value="">Tous les niveaux</option>{levels.map(v=><option key={v}>{v}</option>)}</select></label></div>
    <div className="cn44-search"><Search size={14}/><input aria-label="Rechercher dans mes exercices" placeholder="Rechercher dans mes exercices…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="cn50-library-title"><div><b>MES DOSSIERS</b><small>{visible.length} exercices</small></div><button disabled={busy} onClick={()=>edit('folder')} title="Nouveau dossier d’exercices"><Plus size={14}/> Dossier</button></div>
    {error&&<div className="cn-exercise-feedback" role="alert">{error}</div>}
    <div className="cn50-folder-list">
      {loading&&<div className="cn50-empty">Chargement des exercices…</div>}
      {!loading&&!visible.length&&<div className="cn50-empty">{query||theme||level?'Aucun exercice correspondant.':'Aucun exercice personnel enregistré.'}</div>}
      {!loading&&folders.map(([folder,items])=><div className={`cn50-folder ${dragTarget===folder?'cn-exercise-drop':''}`} key={folder} onDragOver={e=>{if(e.dataTransfer.types.includes('text/mybasket-exercise')){e.preventDefault();setDragTarget(folder);}}} onDragLeave={()=>setDragTarget('')} onDrop={e=>{e.preventDefault();setDragTarget('');const item=exercises.find(x=>x.id===e.dataTransfer.getData('text/mybasket-exercise'));if(item)void move(item,folder);}}>
        <div className="cn50-folder-head-row"><button className="cn50-folder-head" aria-expanded={open.has(folder)||!!query} onClick={()=>toggleFolder(folder)}>{open.has(folder)||query?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<FolderOpen size={15}/><b>{folder}</b><span>{items.length}</span></button>{!['Mes exercices','Non classés'].includes(folder)&&<div className="cn50-folder-actions"><button disabled={busy} title="Renommer le dossier" onClick={()=>edit('rename-folder',undefined,folder)}>✎</button><button disabled={busy} title="Supprimer le dossier" onClick={()=>void removeFolder(folder)}>🗑</button></div>}</div>
        {(open.has(folder)||query)&&<div className="cn50-folder-children">{items.map(row)}{!items.length&&<div className="cn50-empty">Glisse un exercice ici pour le classer.</div>}</div>}
      </div>)}
    </div>
    {dialog&&<div className="cn46-modal-backdrop" onClick={()=>{if(!busy)setDialog(null);}}><form className="cn46-modal" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();void submit();}}><div className="cn46-modal-title"><b>{dialog.kind==='folder'?'Nouveau dossier':dialog.kind==='rename-folder'?'Renommer le dossier':dialog.kind==='rename'?'Renommer l’exercice':'Tags / dossiers de l’exercice'}</b><button type="button" aria-label="Fermer" disabled={busy} onClick={()=>setDialog(null)}><X size={15}/></button></div><label>{dialog.kind==='tags'?'Tags séparés par des virgules':'Nom'}<input autoFocus value={value} onChange={e=>setValue(e.target.value)}/></label>{dialog.kind==='folder'&&<p>Glisse ensuite un exercice dans ce dossier pour enregistrer son classement.</p>}{error&&<p role="alert">{error}</p>}<button className="cn46-create" disabled={busy||(dialog.kind!=='tags'&&!value.trim())}>{busy?'Enregistrement…':'Enregistrer'}</button></form></div>}
  </div>;
}
