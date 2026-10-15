'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { versionedHighlightKey } from '@/lib/livestat-labels';
import { createClient } from '@/lib/supabase/client';
import type { PlaybookSeries } from '@/lib/playbook-series';
import type { PlaybookSystem } from '@/lib/playbook';

export type LiveWorkflowPrefs = {
  system: boolean;
  temps: boolean;
  player: boolean;
  coverage: boolean;
  zone: boolean;
  rebound: boolean;
  assist: boolean;
};

export const DEFAULT_WORKFLOW_PREFS: LiveWorkflowPrefs = {
  system: true,
  temps: true,
  player: true,
  coverage: true,
  zone: true,
  rebound: true,
  assist: true,
};

export type ConfigButton = {
  key: string;
  label: string;
  emoji?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

export type CodingButtonGroupKey =
  | 'system'
  | 'temps'
  | 'att-action'
  | 'def-action'
  | 'coverage'
  | 'result'
  | 'foul'
  | 'rebound';

export type CodingButtonGroup = {
  key: CodingButtonGroupKey;
  title: string;
  icon: string;
  stage: string;
  allowAdd?: boolean;
  rows: ConfigButton[];
};

export type LiveCodingProfile = {
  id: string;
  teamId?: string;
  name: string;
  workflow: LiveWorkflowPrefs;
  activeButtonKeys: Partial<Record<CodingButtonGroupKey, string[]>>;
  buttons?: (ConfigButton & { category: CodingButtonGroupKey; stage: string })[];
  blockTitles?: Partial<Record<CodingButtonGroupKey,string>>;
  hiddenBlocks?: CodingButtonGroupKey[];
  createdAt: string;
  updatedAt: string;
};

type Props = {
  open: boolean;
  teamId: string;
  initialTab?: 'workflow' | 'buttons';
  workflow: LiveWorkflowPrefs;
  onWorkflowChange: (next: LiveWorkflowPrefs) => void;
  groups: CodingButtonGroup[];
  playbookId?: string;
  playbookSystems?: PlaybookSystem[];
  profiles: LiveCodingProfile[];
  selectedProfileId?: string;
  onSaveProfile: (profile: LiveCodingProfile, removedIds?: string[]) => void | Promise<void>;
  onDeleteProfile: (profileId: string) => void;
  onApplyProfile: (profile: LiveCodingProfile) => void;
  onChanged: () => void;
  onClose: () => void;
};

type Editable = ConfigButton & {
  category: CodingButtonGroupKey;
  stage: string;
  allowAdd: boolean;
  isNew?: boolean;
  included?: boolean;
};

const slug = (s: string) => s
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 44);

const uid = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const makeKey = (prefix: string, label: string) => {
  const base = slug(label) || 'bouton';
  const tail = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${base}-${tail}`;
};

const defaultLabel = (category: CodingButtonGroupKey) => {
  if (category === 'system') return ['Nouveau système', '🏀'];
  if (category === 'temps') return ['Nouveau temps fort', '⚡'];
  if (category === 'att-action') return ['Nouvelle action attaque', '＋'];
  if (category === 'def-action') return ['Nouvelle action défense', '＋'];
  if (category === 'coverage') return ['Nouvelle couverture', '🛡️'];
  return ['Nouveau bouton', '＋'];
};

export default function LiveCodingSettingsModal({
  open,
  teamId,
  initialTab = 'workflow',
  workflow: appliedWorkflow,
  onWorkflowChange,
  groups,
  playbookId = '',
  playbookSystems = [],
  profiles,
  selectedProfileId = '',
  onSaveProfile,
  onDeleteProfile,
  onApplyProfile,
  onChanged,
  onClose,
}: Props) {
  const [workflow,setDraftWorkflow] = useState<LiveWorkflowPrefs>({...appliedWorkflow});
  const [removedIds,setRemovedIds]=useState<string[]>([]);
  const [naming,setNaming] = useState(false);
  const saveBusyRef=useRef(false);
  const [tab, setTab] = useState<'workflow' | 'buttons'>(initialTab);
  const [rows, setRows] = useState<Editable[]>([]);
  const [initialKeys, setInitialKeys] = useState<Record<CodingButtonGroupKey, string[]>>({
    system: [], temps: [], 'att-action': [], 'def-action': [], coverage: [], result: [], foul: [], rebound: [],
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [playbookSeries, setPlaybookSeries] = useState<PlaybookSeries[]>([]);
  const [seriesMembership, setSeriesMembership] = useState<Record<string, string>>({});
  // Les blocs optionnels peuvent être retirés/réajoutés. Leur état est
  // sauvegardé par équipe et synchronisé avec le chemin de codage.
  const [hiddenBlocks, setHiddenBlocks] = useState<CodingButtonGroupKey[]>([]);

  const [blockTitles,setBlockTitles] = useState<LiveCodingProfile['blockTitles']>({});
  const groupsSignature = JSON.stringify(groups);
  const [profileName, setProfileName] = useState('');
  const [profileId, setProfileId] = useState(selectedProfileId);
  // Sert à détecter uniquement un vrai passage OFF → ON depuis « Logique & chemin ».
  // Ainsi, retirer un bloc ne le fait pas réapparaître pendant le même render.
  const previousWorkflowRef = useRef<LiveWorkflowPrefs>({ ...workflow });

  const loadDraft = (selected?: LiveCodingProfile) => {
    const nextWorkflow={...(selected?.workflow??appliedWorkflow)};
    setDraftWorkflow(nextWorkflow);previousWorkflowRef.current=nextWorkflow;
    setProfileId(selected?.id||'');
    setProfileName(selected?.name || '');
    setBlockTitles(selected?.blockTitles || {});
    setHiddenBlocks(selected?.hiddenBlocks?.slice()||[]);

    const nextRows: Editable[] = [];
    const keys = { system: [], temps: [], 'att-action': [], 'def-action': [], coverage: [], result: [], foul: [], rebound: [] } as Record<CodingButtonGroupKey, string[]>;
    groups.forEach((group) => {
      (selected?.buttons?.filter(r=>r.category===group.key) || group.rows).forEach((x, i) => {
        const selectedKeys = selected?.activeButtonKeys?.[group.key];
        nextRows.push({
          ...x,
          category: group.key,
          stage: group.stage,
          allowAdd: group.allowAdd !== false,
          is_active: x.is_active !== false,
          included: x.is_active !== false && (!selectedKeys || selectedKeys.includes(x.key)),
          sort_order: x.sort_order ?? i,
        });
        keys[group.key].push(x.key);
      });
    });
    setRows(nextRows);
    setInitialKeys(keys);
    setMessage('');
  };
  useEffect(() => {
    if(!open)return;
    setTab(initialTab);setRemovedIds([]);setNaming(false);setSaving(false);saveBusyRef.current=false;
    loadDraft(profiles.find(p=>p.id===selectedProfileId));
  }, [open, initialTab, groupsSignature, selectedProfileId]);
  useEffect(()=>{
    if(!open)return;
    const close=(event:KeyboardEvent)=>{if(event.key!=='Escape'||saveBusyRef.current)return;event.stopPropagation();if(naming)setNaming(false);else onClose();};
    window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);
  },[open,naming,onClose]);

  useEffect(()=>{
    if(!open)return;
    const before=document.activeElement as HTMLElement|null;
    const keydown=(event:KeyboardEvent)=>{
      if(event.key!=='Tab')return;
      const card=document.querySelector(naming?'.lcsNameCard':'.lcsCard');
      const controls=Array.from(card?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')||[]);
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&(document.activeElement===first||!card?.contains(document.activeElement))){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!card?.contains(document.activeElement))){event.preventDefault();first?.focus();}
    };
    window.addEventListener('keydown',keydown);return()=>{window.removeEventListener('keydown',keydown);before?.focus();};
  },[open,naming]);

  useEffect(() => {
    if (!open || !playbookId) {
      setPlaybookSeries([]);
      setSeriesMembership({});
      return;
    }
    let alive = true;
    const loadPlaybookSeries = async () => {
      try {
        // Le constructeur est déjà affiché dans une session authentifiée.
        // On laisse donc les RLS Supabase filtrer les lignes au lieu d'appeler
        // auth.getUser() plusieurs fois à l'ouverture de la modale.
        // Cela évite les AuthRetryableFetchError / "Load failed" ajoutés par
        // le chargement des séries, sans modifier la logique d'auth globale.
        const supabase = createClient();
        const { data: seriesRows, error: seriesError } = await supabase
          .from('playbook_series')
          .select('*')
          .eq('playbook_id', playbookId)
          .order('position')
          .order('created_at');
        if (seriesError) throw seriesError;

        const series = (seriesRows ?? []).map((row: any) => ({
          ...row,
          tags: Array.isArray(row.tags) ? row.tags.filter((tag: unknown): tag is string => typeof tag === 'string' && !!tag.trim()) : [],
        })) as PlaybookSeries[];

        let membership: Record<string, string> = {};
        if (series.length) {
          const { data: membershipRows, error: membershipError } = await supabase
            .from('playbook_series_systems')
            .select('series_id,playbook_system_id')
            .in('series_id', series.map((serie) => serie.id));
          if (membershipError) throw membershipError;
          membership = Object.fromEntries(
            (membershipRows ?? []).map((row: any) => [row.playbook_system_id, row.series_id]),
          );
        }

        if (!alive) return;
        setPlaybookSeries(series);
        setSeriesMembership(membership);
      } catch {
        if (!alive) return;
        setPlaybookSeries([]);
        setSeriesMembership({});
      }
    };

    void loadPlaybookSeries();
    return () => { alive = false; };
  }, [open, playbookId]);

  const groupedPlaybookSystems = useMemo(() => {
    if (!playbookId || !playbookSystems.length) return [];
    const groups = playbookSeries.map((serie) => ({
      id: serie.id,
      title: serie.name,
      systems: playbookSystems.filter((system) => seriesMembership[system.id] === serie.id),
    }));
    const withoutSeries = playbookSystems.filter((system) => !seriesMembership[system.id]);
    if (withoutSeries.length) groups.push({ id: '__without_series__', title: 'SANS SÉRIE', systems: withoutSeries });
    return groups.filter((group) => group.systems.length > 0);
  }, [playbookId, playbookSeries, playbookSystems, seriesMembership]);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);

  const optionalBlocks = useMemo(
    () => new Set<CodingButtonGroupKey>(['system', 'temps', 'coverage', 'rebound']),
    [],
  );
  const blockStorageKey = `mybasket:livestat-hidden-blocks:${teamId || 'default'}`;

  const persistHiddenBlocks = (next: CodingButtonGroupKey[]) => {
    setHiddenBlocks(next);

  };


  // Synchronisation inverse : si une étape précédemment désactivée est recochée
  // dans « Logique & chemin », son bloc revient aussitôt dans l'éditeur de boutons.
  useEffect(() => {
    if (!open) {
      previousWorkflowRef.current = { ...workflow };
      return;
    }

    const before = previousWorkflowRef.current;
    const restore: CodingButtonGroupKey[] = [];
    if (!before.system && workflow.system) restore.push('system');
    if (!before.temps && workflow.temps) restore.push('temps');
    if (!before.coverage && workflow.coverage) restore.push('coverage');
    if (!before.rebound && workflow.rebound) restore.push('rebound');

    if (restore.length) {
      setHiddenBlocks((current) => {
        const next = current.filter((key) => !restore.includes(key));

        return next;
      });
      setMessage('Bloc réactivé automatiquement dans « Boutons par bloc » ✓');
    }

    previousWorkflowRef.current = { ...workflow };
  }, [open, workflow.system, workflow.temps, workflow.coverage, workflow.rebound, blockStorageKey]);

  const removeBlock = (key: CodingButtonGroupKey) => {
    if (!optionalBlocks.has(key)) {
      setMessage('Ce bloc alimente une statistique obligatoire. Tu peux désactiver ses boutons, mais pas supprimer l’étape.');
      return;
    }
    const next = Array.from(new Set([...hiddenBlocks, key]));
    persistHiddenBlocks(next);
    if (key === 'system') setDraftWorkflow({ ...workflow, system: false });
    if (key === 'temps') setDraftWorkflow({ ...workflow, temps: false });
    if (key === 'coverage') setDraftWorkflow({ ...workflow, coverage: false });
    if (key === 'rebound') setDraftWorkflow({ ...workflow, rebound: false });
    setMessage('Bloc retiré du chemin de codage. Tu peux le rajouter à tout moment.');
  };

  const restoreBlock = (key: CodingButtonGroupKey) => {
    persistHiddenBlocks(hiddenBlocks.filter((item) => item !== key));
    if (key === 'system') setDraftWorkflow({ ...workflow, system: true });
    if (key === 'temps') setDraftWorkflow({ ...workflow, temps: true });
    if (key === 'coverage') setDraftWorkflow({ ...workflow, coverage: true });
    if (key === 'rebound') setDraftWorkflow({ ...workflow, rebound: true });
    setMessage('Bloc rajouté au chemin de codage.');
  };


  if (!open) return null;

  const patch = (key: string, category: CodingButtonGroupKey, p: Partial<Editable>) => {
    setRows((all) => all.map((r) => r.key === key && r.category === category ? { ...r, ...p } : r));
  };

  const add = (category: CodingButtonGroupKey) => {
    const group = groupMap.get(category);
    if (!group || group.allowAdd === false) return;
    const [label, emoji] = defaultLabel(category);
    const current = rows.filter((r) => r.category === category);
    setRows((all) => [
      ...all,
      {
        key: makeKey(category.replace(/[^a-z]+/g, '-'), label),
        label,
        emoji,
        category,
        stage: group.stage,
        allowAdd: true,
        is_active: true,
        included: true,
        sort_order: current.length,
        isNew: true,
      },
    ]);
  };

  const remove = (row: Editable) => {
    const same = rows.filter((r) => r.category === row.category);
    if (same.length <= 1) {
      setMessage('Garde au moins un bouton dans ce bloc. Tu peux le désactiver si tu ne veux pas l’utiliser.');
      return;
    }
    setRows((all) => all.filter((r) => !(r.key === row.key && r.category === row.category)));
  };

  const move = (row: Editable, dir: -1 | 1) => {
    const same = rows.filter((r) => r.category === row.category).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = same.findIndex((r) => r.key === row.key);
    const other = same[idx + dir];
    if (!other) return;
    const a = row.sort_order ?? idx;
    const b = other.sort_order ?? idx + dir;
    setRows((all) => all.map((r) => {
      if (r.category !== row.category) return r;
      if (r.key === row.key) return { ...r, sort_order: b };
      if (r.key === other.key) return { ...r, sort_order: a };
      return r;
    }));
  };

  const requestSave = () => { setMessage('');setNaming(true); };
  const saveButtons = () => requestSave();

  const preset = (name: 'rapide' | 'coach' | 'complet') => {
    if (name === 'rapide') setDraftWorkflow({ system: false, temps: true, player: false, coverage: false, zone: false, rebound: true, assist: false });
    if (name === 'coach') setDraftWorkflow({ system: true, temps: true, player: false, coverage: false, zone: false, rebound: true, assist: false });
    if (name === 'complet') setDraftWorkflow({ ...DEFAULT_WORKFLOW_PREFS });
  };

  const workflowRows: Array<[keyof LiveWorkflowPrefs, string, string]> = [
    ['system', 'Système de jeu', 'Saut automatique si désactivé.'],
    ['temps', 'Temps fort', 'Alimente analyses, filtres et clips.'],
    ['player', 'Joueur', 'Facultatif en collectif, obligatoire quand le mode individuel l’exige.'],
    ['coverage', 'Défense sur écran', 'Étape spécifique aux pick & roll.'],
    ['zone', 'Shot chart', 'Facultative, y compris en Live individuel.'],
    ['rebound', 'Rebond', 'Après un tir raté, demande RO/RD si activé.'],
    ['assist', 'Passe décisive', 'Après panier marqué, joueurs ou Skip.'],
  ];

  const activeKeys = (): Partial<Record<CodingButtonGroupKey, string[]>> => {
    const out: Partial<Record<CodingButtonGroupKey, string[]>> = {};
    groups.forEach((g) => {
      out[g.key] = rows
        .filter((r) => r.category === g.key && r.is_active !== false && r.included !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((r) => r.key);
    });
    return out;
  };

  const saveProfile = async () => {
    if(saveBusyRef.current)return;
    const name = profileName.trim();
    if (!name) {
      setMessage('Donne un nom à cette logique de codage.');
      return;
    }
    if(profiles.some(profile=>profile.id!==profileId&&!removedIds.includes(profile.id)&&profile.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){setMessage('Ce nom est déjà utilisé. Choisis un autre nom ou ouvre la fenêtre existante.');return;}
    const keyedRows=rows.map(row=>({...row,key:row.category==='temps'?versionedHighlightKey(row.key,row.label):row.key}));
    const keys=activeKeys();
    keys.temps=rows.filter(row=>row.category==='temps'&&row.is_active!==false&&row.included!==false).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)).map(row=>versionedHighlightKey(row.key,row.label));
    const existing = profiles.find((p) => p.id === profileId);
    const now = new Date().toISOString();
    const profile: LiveCodingProfile = {
      id: existing?.id || uid(),
      name,
      teamId,
      workflow: { ...workflow },
      activeButtonKeys: keys,
      buttons: keyedRows.map(r=>({key:r.key,label:r.label.trim()||'Sans nom',emoji:r.emoji,category:r.category,stage:r.stage,is_active:r.is_active!==false,sort_order:r.sort_order})),
      blockTitles: {...blockTitles},
      hiddenBlocks: [...hiddenBlocks],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    saveBusyRef.current=true;setSaving(true);
    try { await onSaveProfile(profile,removedIds);setProfileId(profile.id);setNaming(false);onChanged();onClose(); }
    catch { setMessage('Impossible de sauvegarder cette fenêtre. Le brouillon est conservé ; vérifie l’espace de stockage puis réessaie.'); }
    finally { saveBusyRef.current=false;setSaving(false); }
  };

  const selectedProfile = profiles.find((p) => p.id === profileId);

  return (
    <div className="lcsOverlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saveBusyRef.current && !naming) onClose(); }}>
      <div className="lcsCard" role="dialog" aria-modal="true" aria-label="Fenêtre de codification">
        <div className="lcsHead">
          <div><b>⚙ Constructeur de codage LiveStats</b><span>Les blocs reprennent la même grille que pendant le codage.</span></div>
          <button type="button" aria-label="Fermer sans enregistrer" disabled={saving} onClick={onClose}>×</button>
        </div>
        <div className="lcsTabs">
          <button className={tab === 'workflow' ? 'on' : ''} onClick={() => setTab('workflow')}>⚙ Logique & chemin</button>
          <button className={tab === 'buttons' ? 'on' : ''} onClick={() => setTab('buttons')}>🧩 Boutons par bloc</button>
        </div>

        {tab === 'workflow' ? (
          <div className="lcsBody">
            <div className="lcsProfileBar">
              <label>
                <span>Logique enregistrée</span>
                <select value={profileId} onChange={(e) => {
                  const id = e.target.value;
                  setProfileId(id);
                  const p = profiles.find((x) => x.id === id);
                  loadDraft(p);
                }}>
                  <option value="">Nouvelle logique…</option>
                  {profiles.filter(p=>!removedIds.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="grow">
                <span>Nom</span>
                <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Ex : Coach U18 sans Shot Chart" />
              </label>
              <button type="button" onClick={()=>{setProfileId('');setProfileName('');setMessage('Donne un nom pour enregistrer une nouvelle fenêtre.');}}>＋ Nouvelle fenêtre</button><button type="button" className="saveProfile" onClick={requestSave}>💾 Enregistrer la logique</button>
              {selectedProfile && (
                <button
                  type="button"
                  className="deleteProfile"
                  onClick={() => {
                    if (!window.confirm(`Retirer la configuration « ${selectedProfile.name} » lors du prochain enregistrement ? Annuler conservera cette configuration.`)) return;
                    setRemovedIds(current=>[...current,selectedProfile.id]);
                    setProfileId('');
                    setProfileName('');
                    setMessage(`Suppression de « ${selectedProfile.name} » en attente. Enregistre une fenêtre pour confirmer ou annule.`);
                  }}
                >
                  🗑 Supprimer la configuration
                </button>
              )}
            </div>

            <div className="lcsPresets">
              <button onClick={() => preset('rapide')}>⚡ Rapide</button>
              <button onClick={() => preset('coach')}>🏀 Coach</button>
              <button onClick={() => preset('complet')}>🎬 Complet</button>
            </div>
            <div className="lcsInfo">Les étapes désactivées sont réellement sautées. En Live individuel, Joueur/Contexte restent imposés quand la logique de l’action en a besoin.</div>
            <div className="lcsWorkflow">
              {workflowRows.map(([key, title, desc]) => (
                <label key={key} className="lcsWorkflowRow">
                  <input
                    type="checkbox"
                    checked={workflow[key]}
                    onChange={(e) => setDraftWorkflow({ ...workflow, [key]: e.target.checked })}
                  />
                  <span><b>{title}</b><small>{desc}</small></span>
                </label>
              ))}
            </div>
            <div className="lcsPath">
              <b>Chemin vidéo complet</b>
              <span>Contexte</span>
              {workflow.system && <span>Système</span>}
              {workflow.temps && <span>Temps fort</span>}
              {workflow.player && <span>Joueur</span>}
              <span>Action</span><span>Résultat</span>
              {workflow.zone && <span>Shot chart</span>}
              {workflow.rebound && <span>Rebond</span>}
              {workflow.assist && <span>PD</span>}
            </div>
            <div className="lcsIndividualPaths">
              <div><b>👤 Live individuel · Attaque</b><span>Joueur → Résultat → {workflow.zone ? 'Shot chart → ' : ''}panier : PD/Skip · raté : RO/RD → joueur du RO</span></div>
              <div><b>🛡 Live individuel · Défense</b><span>Résultat → faute : joueur + LF/touche · tir raté : RO/RD → joueur du RD</span></div>
            </div>

          </div>
        ) : (
          <div className="lcsBody">
            <label className="lcsInfo">Nom de la fenêtre <input value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Ex : Codage U21"/></label><div className="lcsInfo">Les fenêtres sont conservées dans ce navigateur, par équipe. Chaque bloc garde la même présentation que pendant le codage. Tu peux retirer puis rajouter les blocs optionnels. Les blocs statistiques indispensables restent protégés pour ne pas casser les calculs.</div>
            <div className="lcsBlockManager">
              <b>Organisation des blocs</b>
              <div className="lcsBlockPalette">
                {hiddenBlocks.length === 0 ? <span>Tous les blocs optionnels sont utilisés.</span> : hiddenBlocks.map((key) => {
                  const group = groupMap.get(key);
                  if (!group) return null;
                  return <button key={key} type="button" onClick={() => restoreBlock(key)}>＋ {group.icon} {group.title}</button>;
                })}
              </div>
            </div>
            <div className="lcsBlocks">
              {groups.filter((group) => !hiddenBlocks.includes(group.key)).map((group) => {
                const visible = rows.filter((r) => r.category === group.key).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                return (
                  <section className="lcsBlock" key={group.key}>
                    <div className="lcsBlockHead">
                      <div><b>{group.icon} <input aria-label="Nom du bloc" value={blockTitles?.[group.key]||group.title} onChange={e=>setBlockTitles(prev=>({...prev,[group.key]:e.target.value}))}/></b><small>{visible.filter((r) => r.is_active !== false && r.included !== false).length} utilisé(s)</small></div>
                      <div className="lcsBlockHeadActions">
                        {group.allowAdd !== false && <button onClick={() => add(group.key)}>＋ Bouton</button>}
                        <button
                          type="button"
                          className="removeBlock"
                          title={optionalBlocks.has(group.key) ? "Retirer ce bloc du codage" : "Bloc statistique obligatoire"}
                          onClick={() => removeBlock(group.key)}
                        >
                          {optionalBlocks.has(group.key) ? "− Bloc" : "🔒"}
                        </button>
                      </div>
                    </div>
                    {group.key === 'system' ? (

                      <div className="lcsSeriesList">
                        {[
                          { key: 'jeu-courant', title: 'JEU COURANT', test: (r: Editable) => /contre|transition|libre/i.test(`${r.key} ${r.label}`) },
                          { key: 'systemes', title: 'SYSTÈMES', test: (r: Editable) => /systeme|système/i.test(`${r.key} ${r.label}`) },
                          { key: 'ato', title: 'ATO', test: (r: Editable) => /(^|[-_ ])ato|temps.?mort/i.test(`${r.key} ${r.label}`) },
                          { key: 'slob', title: 'SLOB · REMISE EN JEU CÔTÉ', test: (r: Editable) => /slob/i.test(`${r.key} ${r.label}`) },
                          { key: 'blob', title: 'BLOB · REMISE EN JEU LIGNE DE FOND', test: (r: Editable) => /blob/i.test(`${r.key} ${r.label}`) },
                        ].map((serie) => {
                          const serieRows = visible.filter(serie.test);
                          if (!serieRows.length) return null;
                          return (
                            <div className="lcsSeries" key={serie.key}>
                              <div className="lcsSeriesHead"><b>{serie.title}</b><span>{serieRows.length}</span></div>
                              <div className="lcsCodingGrid">
                                {serieRows.map((r) => {
                                  const index = visible.findIndex((item) => item.key === r.key);
                                  return (
                                    <div className={`lcsTile ${r.is_active === false || r.included === false ? 'off' : ''}`} key={`${r.category}-${r.key}`}>
                                      <div className="lcsTileEdit">
                                        <input className="emoji" value={r.emoji || ''} onChange={(e) => patch(r.key, r.category, { emoji: e.target.value })} />
                                        <input maxLength={100} className="label" value={r.label} onChange={(e) => patch(r.key, r.category, { label: e.target.value })} />
                                      </div>
                                      <div className="lcsTileTools">
                                        <label><input type="checkbox" disabled={r.is_active === false} checked={r.is_active !== false && r.included !== false} onChange={(e) => patch(r.key, r.category, { included: e.target.checked })} /> utiliser</label>
                                        <button disabled={index === 0} onClick={() => move(r, -1)}>←</button>
                                        <button disabled={index === visible.length - 1} onClick={() => move(r, 1)}>→</button>
                                        <button className="trash" onClick={() => remove(r)}>×</button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {(() => {
                          const classified = visible.filter((r) => /contre|transition|libre|systeme|système|(^|[-_ ])ato|temps.?mort|slob|blob/i.test(`${r.key} ${r.label}`));
                          const otherRows = visible.filter((r) => !classified.some((x) => x.key === r.key));
                          if (!otherRows.length) return null;
                          return <div className="lcsSeries"><div className="lcsSeriesHead"><b>AUTRES SYSTÈMES</b><span>{otherRows.length}</span></div><div className="lcsCodingGrid">{otherRows.map((r) => { const index = visible.findIndex((item) => item.key === r.key); return <div className={`lcsTile ${r.is_active === false || r.included === false ? 'off' : ''}`} key={`${r.category}-${r.key}`}><div className="lcsTileEdit"><input className="emoji" value={r.emoji || ''} onChange={(e) => patch(r.key, r.category, { emoji: e.target.value })} /><input maxLength={100} className="label" value={r.label} onChange={(e) => patch(r.key, r.category, { label: e.target.value })} /></div><div className="lcsTileTools"><label><input type="checkbox" disabled={r.is_active === false} checked={r.is_active !== false && r.included !== false} onChange={(e) => patch(r.key, r.category, { included: e.target.checked })} /> utiliser</label><button disabled={index === 0} onClick={() => move(r, -1)}>←</button><button disabled={index === visible.length - 1} onClick={() => move(r, 1)}>→</button><button className="trash" onClick={() => remove(r)}>×</button></div></div>; })}</div></div>;
                        })()}
                      </div>
                    ) : (
                      <div className="lcsCodingGrid">
                        {visible.map((r, index) => (
                          <div className={`lcsTile ${r.is_active === false || r.included === false ? 'off' : ''}`} key={`${r.category}-${r.key}`}>
                            <div className="lcsTileEdit">
                              <input className="emoji" value={r.emoji || ''} onChange={(e) => patch(r.key, r.category, { emoji: e.target.value })} />
                              <input maxLength={100} className="label" value={r.label} onChange={(e) => patch(r.key, r.category, { label: e.target.value })} />
                            </div>
                            <div className="lcsTileTools">
                              <label><input type="checkbox" disabled={r.is_active === false} checked={r.is_active !== false && r.included !== false} onChange={(e) => patch(r.key, r.category, { included: e.target.checked })} /> utiliser</label>
                              <button disabled={index === 0} onClick={() => move(r, -1)}>←</button>
                              <button disabled={index === visible.length - 1} onClick={() => move(r, 1)}>→</button>
                              <button className="trash" onClick={() => remove(r)}>×</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

          </div>
        )}
        <div className="lcsFooter"><span role="status">{message}</span><div><button type="button" disabled={saving} onClick={onClose}>Annuler</button><button type="button" className="save" disabled={saving||!teamId} onClick={requestSave}>Enregistrer</button></div></div>
        {naming&&<div className="lcsNameOverlay"><form className="lcsNameCard" role="dialog" aria-modal="true" aria-label="Enregistrer la fenêtre de codification" onSubmit={event=>{event.preventDefault();void saveProfile();}}><h3>Enregistrer ma fenêtre</h3><label>Nom de la fenêtre de codification<input autoFocus disabled={saving} maxLength={100} value={profileName} onChange={event=>setProfileName(event.target.value)} placeholder="Ex : Ma fenêtre U18"/></label><small>Les blocs, boutons, leur ordre et la logique seront conservés. Les actions déjà codées gardent leur identité.</small>{message&&<p role="alert">{message}</p>}<div><button type="button" disabled={saving} onClick={()=>setNaming(false)}>Retour</button><button type="submit" disabled={saving||!profileName.trim()}>{saving?'Enregistrement…':'Enregistrer la fenêtre'}</button></div></form></div>}
      </div>
      <style jsx>{`
        .lcsFooter{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;border-top:1px solid #33415a;background:#0b1321}.lcsFooter span{min-width:0;overflow-wrap:anywhere;flex:1;font-size:11px;color:#b7c3d7}.lcsFooter>div,.lcsNameCard>div{flex-shrink:0;display:flex;gap:8px}.lcsFooter button,.lcsNameCard button{border:1px solid #526079;border-radius:8px;background:#152238;color:#fff;padding:10px 16px;font-weight:800;cursor:pointer}.lcsFooter .save,.lcsNameCard button[type=submit]{background:#d4a24c;color:#17110b;border-color:#d4a24c}.lcsNameOverlay{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:16px;background:#03070fd9}.lcsNameCard{max-height:90%;overflow:auto;width:min(440px,100%);box-sizing:border-box;padding:22px;border:1px solid #526079;border-radius:14px;background:#101a2a;display:grid;gap:16px}.lcsNameCard h3{margin:0}.lcsNameCard label{display:grid;gap:8px;font-size:12px}.lcsNameCard input{min-width:0;border:1px solid #526079;border-radius:8px;background:#0b1321;color:white;padding:10px}.lcsNameCard small{font-size:11px;color:#aeb8ca;line-height:1.5}.lcsNameCard>div{justify-content:flex-end}.lcsNameCard p{color:#ffb5bc;font-size:12px}.lcsCard{position:relative}.lcsNameCard button:disabled,.lcsFooter button:disabled{opacity:.5}.lcsOverlay{position:fixed;inset:0;z-index:2147483000;background:rgba(3,7,15,.80);display:flex;align-items:center;justify-content:center;padding:18px}.lcsCard{width:min(1320px,98vw);max-height:94vh;overflow:hidden;border:1px solid #33415a;border-radius:16px;background:#0b1321;color:#eef3fb;box-shadow:0 24px 80px rgba(0,0,0,.55);display:flex;flex-direction:column}.lcsHead{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #27344a}.lcsHead>div{display:grid;gap:3px}.lcsHead b{font-size:16px}.lcsHead span{font-size:11px;color:#93a0b5}.lcsHead button{width:34px;height:34px;border:1px solid #33415a;border-radius:9px;background:#111c2e;color:#fff;font-size:20px}.lcsTabs,.lcsPresets{display:flex;gap:8px;flex-wrap:wrap}.lcsTabs{padding:10px 16px;border-bottom:1px solid #27344a}.lcsTabs button,.lcsPresets button{border:1px solid #33415a;border-radius:9px;background:#111c2e;color:#aeb8ca;padding:8px 11px;font-weight:850;cursor:pointer}.lcsTabs button.on{border-color:#d4a24c;color:#f4c765;background:rgba(212,162,76,.1)}.lcsBody{padding:14px 16px 16px;overflow:auto}.lcsInfo{margin:8px 0 12px;padding:9px 10px;border:1px solid #2b3950;border-radius:9px;background:#0e1828;color:#a7b2c5;font-size:11px}.lcsProfileBar{display:grid;grid-template-columns:minmax(190px,.9fr) minmax(220px,1.2fr) auto auto;gap:8px;align-items:end;margin-bottom:10px}.lcsProfileBar label{display:grid;gap:5px}.lcsProfileBar label>span{font-size:9px;color:#8794aa;font-weight:900;text-transform:uppercase}.lcsProfileBar select,.lcsProfileBar input{height:38px;border:1px solid #34415a;border-radius:9px;background:#0d1727;color:#fff;padding:0 10px}.saveProfile,.deleteProfile{height:38px;white-space:nowrap;border:1px solid #d4a24c;border-radius:9px;background:rgba(212,162,76,.12);color:#f3c862;font-weight:900;padding:0 12px}.deleteProfile{border-color:#61313a;color:#ff8a96;background:#1c1117}.lcsWorkflow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lcsWorkflowRow{display:flex;gap:10px;align-items:flex-start;border:1px solid #29364c;border-radius:10px;background:#101a2a;padding:11px}.lcsWorkflowRow input{margin-top:3px}.lcsWorkflowRow span{display:grid;gap:3px}.lcsWorkflowRow b{font-size:12px}.lcsWorkflowRow small{color:#8491a6;font-size:10px}.lcsPath{margin-top:12px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.lcsPath>b{margin-right:4px;color:#d4a24c}.lcsPath>span{border:1px solid #34415a;border-radius:999px;padding:5px 8px;background:#111b2d;font-size:10px}.lcsIndividualPaths{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.lcsIndividualPaths>div{display:grid;gap:4px;border:1px solid #2d3b52;border-radius:10px;background:#101a2a;padding:10px}.lcsIndividualPaths b{font-size:11px;color:#f1c45e}.lcsIndividualPaths span{font-size:10px;color:#9aa7bc}.lcsBlocks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.lcsBlock{border:1px solid #2b3950;border-radius:12px;background:#0f1929;padding:10px;min-width:0}.lcsBlockHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.lcsBlockHead>div{display:grid;gap:2px}.lcsBlockHead b{font-size:12px}.lcsBlockHead small{font-size:9px;color:#78869c}.lcsBlockHead button{border:1px solid #d4a24c;border-radius:8px;background:rgba(212,162,76,.1);color:#f4c765;padding:6px 9px;font-size:10px;font-weight:900}.lcsSeriesList{display:grid;gap:10px}.lcsSeries{border:1px solid #27364d;border-radius:10px;background:#0c1625;padding:8px}.lcsSeriesHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;padding:0 2px}.lcsSeriesHead b{font-size:9px;letter-spacing:.07em;color:#f0c45f}.lcsPlaybookTile{grid-template-columns:28px minmax(0,1fr);align-items:center;min-height:46px}.lcsPlaybookTile b{font-size:10px;line-height:1.25}.lcsPlaybookIcon{font-size:16px;text-align:center}.lcsPlaybookHint,.lcsEmptyPlaybook{border:1px dashed #34445d;border-radius:9px;padding:9px;color:#8f9db2;font-size:9px;line-height:1.4}.lcsSeriesHead span{min-width:20px;height:20px;display:grid;place-items:center;border:1px solid #34445d;border-radius:999px;color:#9eabc0;font-size:9px}.lcsCodingGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.lcsTile{min-width:0;border:1px solid #35425a;border-radius:10px;background:#121d30;padding:7px;display:grid;gap:6px}.lcsTile.off{opacity:.48}.lcsTileEdit{display:grid;grid-template-columns:36px minmax(0,1fr);gap:5px}.lcsTile input.emoji,.lcsTile input.label{min-width:0;height:32px;border:1px solid #3a4962;border-radius:7px;background:#0b1422;color:#fff}.lcsTile input.emoji{text-align:center;padding:0}.lcsTile input.label{padding:0 7px;font-size:10px;font-weight:850}.lcsTileTools{display:grid;grid-template-columns:1fr 26px 26px 26px;gap:4px;align-items:center}.lcsTileTools label{font-size:8px;color:#98a5b8;white-space:nowrap}.lcsTileTools button{width:26px;height:25px;border:1px solid #39475e;border-radius:6px;background:#101a2b;color:#dce5f4;font-size:10px}.lcsTileTools button:disabled{opacity:.25}.lcsTileTools .trash{color:#ff8a96}.lcsFoot{position:sticky;bottom:-16px;background:#0b1321;border-top:1px solid #27344a;margin:14px -16px -16px;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}.lcsFoot span{font-size:10px;color:#9eabc0}.lcsFoot .save{border:1px solid #d4a24c;border-radius:9px;background:#d4a24c;color:#17110b;padding:9px 13px;font-weight:900}@media(max-width:900px){.lcsBlocks,.lcsIndividualPaths,.lcsWorkflow{grid-template-columns:1fr}.lcsProfileBar{grid-template-columns:1fr 1fr}.lcsProfileBar .grow{grid-column:2}.lcsCodingGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.lcsFooter{flex-wrap:wrap}.lcsFooter>div{margin-left:auto}.lcsOverlay{padding:6px}.lcsProfileBar{grid-template-columns:1fr}.lcsProfileBar .grow{grid-column:auto}.lcsCodingGrid{grid-template-columns:1fr}.lcsFoot{align-items:stretch;flex-direction:column}.lcsFoot .save{width:100%}}

        .lcsBlockManager{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #29364b;background:#0e1727;border-radius:12px;padding:10px 12px;margin-bottom:10px}
        .lcsBlockManager>b{font-size:10px;color:#d4a24c;text-transform:uppercase;letter-spacing:.05em}
        .lcsBlockPalette{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.lcsBlockPalette span{font-size:9px;color:#7e8ba0}
        .lcsBlockPalette button{border:1px dashed #d4a24c;background:rgba(212,162,76,.08);color:#d4a24c;border-radius:8px;padding:6px 8px;font-size:9px;font-weight:900;cursor:pointer}
        .lcsBlockHeadActions{display:flex;gap:6px;align-items:center}.lcsBlockHeadActions .removeBlock{border-color:#46546b;background:#141f31;color:#aab4c3}.lcsBlockHeadActions .removeBlock:hover{border-color:#ef4444;color:#fecaca}
      `}</style>
    </div>
  );
}
