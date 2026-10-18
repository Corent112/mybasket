'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, Search } from 'lucide-react';
import { listMyExercises } from '@/lib/exercises';
import { exerciseDrawingGroups } from '@/lib/drawing-exercise-library';
import type { Exercise } from '@/types/exercise';

export default function DrawingExerciseLibrary({ onOpen, onSave }: {
  onOpen?: (exercise: Exercise, index: number) => void;
  onSave?: () => void | Promise<void>;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(new Set(['Mes exercices']));
  useEffect(() => {
    let alive = true;
    const load = async () => { setLoading(true); try { const result = await listMyExercises(); if (alive) { setExercises(result); setError(''); } }
      catch { if (alive) setError('Impossible de charger les exercices.'); } finally { if (alive) setLoading(false); } };
    void load(); window.addEventListener('mybasket:library-exercise-saved', load);
    return () => { alive = false; window.removeEventListener('mybasket:library-exercise-saved', load); };
  }, []);
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visible = useMemo(() => exercises.filter(exercise => normalize(`${exercise.title} ${exercise.theme || ''} ${(exercise.themes || []).join(' ')} ${(exercise.tags || []).join(' ')}`)
    .includes(normalize(query))), [exercises, query]);
  const folders = useMemo(() => {
    const map = new Map<string, Exercise[]>([['Mes exercices', visible]]);
    visible.forEach(exercise => { const theme = exercise.themes?.[0] || exercise.theme || 'Non classés'; if (theme === 'Mes exercices') return; map.set(theme, [...(map.get(theme) || []), exercise]); });
    return [...map];
  }, [visible]);
  return <div className="cn-exercises">
    <div className="cn44-search"><Search size={14} /><input aria-label="Rechercher dans mes exercices" placeholder="Rechercher dans mes exercices…" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="cn50-library-title"><div><b>MES EXERCICES</b><small>{visible.length} exercice{visible.length > 1 ? 's' : ''}</small></div></div>
    <div className="cn50-folder-list">
      {loading && <div className="cn50-empty">Chargement des exercices…</div>}
      {error && <div className="cn50-empty" role="alert">{error}</div>}
      {!loading && !visible.length && <div className="cn50-empty">{query ? 'Aucun exercice correspondant.' : 'Aucun exercice personnel enregistré.'}</div>}
      {!loading && folders.filter(([, items]) => items.length).map(([folder, items]) => <div className="cn50-folder" key={folder}>
        <button className="cn50-folder-head" aria-expanded={open.has(folder) || !!query} onClick={() => setOpen(previous => { const next = new Set(previous); next.has(folder) ? next.delete(folder) : next.add(folder); return next; })}>
          {open.has(folder) || query ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<FolderOpen size={15} /><b>{folder}</b><span>{items.length}</span>
        </button>
        {(open.has(folder) || query) && <div className="cn50-folder-children">{items.map(exercise => {
          const groups = exerciseDrawingGroups(exercise);
          return <div className="cn-exercise" key={exercise.id}>
            <div className="cn-exercise-heading">{(exercise.schemaImage || exercise.schemaImages?.[0]) && <img src={exercise.schemaImage || exercise.schemaImages?.[0]} alt="" />}<b>{exercise.title}</b></div>
            {groups.length ? groups.map((group, position) => <button key={group.index} className="cn-exercise-open" aria-pressed={selected === `${exercise.id}:${group.index}`}
              disabled={!group.editable} title={group.editable ? `Ouvrir ${exercise.title} — schéma ${position + 1}` : 'Image seule : ce schéma ne contient pas de données de dessin modifiables.'}
              onClick={() => { setSelected(`${exercise.id}:${group.index}`); onOpen?.(exercise, group.index); }}>
              {group.image && <img src={group.image} alt="" />}<span>Schéma {position + 1}{!group.editable ? ' · image seule' : ''}</span>
            </button>) : <small>Aucun schéma modifiable.</small>}
            {groups.some(group => selected === `${exercise.id}:${group.index}`) && onSave && <button className="cn-exercise-save" onClick={() => void onSave()}>Enregistrer les modifications</button>}
          </div>;
        })}</div>}
      </div>)}
    </div>
  </div>;
}
