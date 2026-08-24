'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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
  name: string;
  workflow: LiveWorkflowPrefs;
  activeButtonKeys: Partial<Record<CodingButtonGroupKey, string[]>>;
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
  profiles: LiveCodingProfile[];
  selectedProfileId?: string;
  onSaveProfile: (profile: LiveCodingProfile) => void;
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
  workflow,
  onWorkflowChange,
  groups,
  profiles,
  selectedProfileId = '',
  onSaveProfile,
  onDeleteProfile,
  onApplyProfile,
  onChanged,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'workflow' | 'buttons'>(initialTab);
  const [rows, setRows] = useState<Editable[]>([]);
  const [initialKeys, setInitialKeys] = useState<Record<CodingButtonGroupKey, string[]>>({
    system: [], temps: [], 'att-action': [], 'def-action': [], coverage: [], result: [], foul: [], rebound: [],
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  // Les blocs optionnels peuvent être retirés/réajoutés. Leur état est
  // sauvegardé par équipe et synchronisé avec le chemin de codage.
  const [hiddenBlocks, setHiddenBlocks] = useState<CodingButtonGroupKey[]>([]);

  const [profileName, setProfileName] = useState('');
  const [profileId, setProfileId] = useState(selectedProfileId);
  // Sert à détecter uniquement un vrai passage OFF → ON depuis « Logique & chemin ».
  // Ainsi, retirer un bloc ne le fait pas réapparaître pendant le même render.
  const previousWorkflowRef = useRef<LiveWorkflowPrefs>({ ...workflow });

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setProfileId(selectedProfileId);
    const selected = profiles.find((p) => p.id === selectedProfileId);
    setProfileName(selected?.name || '');

    const nextRows: Editable[] = [];
    const keys = { system: [], temps: [], 'att-action': [], 'def-action': [], coverage: [], result: [], foul: [], rebound: [] } as Record<CodingButtonGroupKey, string[]>;
    groups.forEach((group) => {
      group.rows.forEach((x, i) => {
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
  }, [open, initialTab, groups, profiles, selectedProfileId]);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);

  const optionalBlocks = useMemo(
    () => new Set<CodingButtonGroupKey>(['system', 'temps', 'coverage', 'rebound']),
    [],
  );
  const blockStorageKey = `mybasket:livestat-hidden-blocks:${teamId || 'default'}`;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(blockStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setHiddenBlocks(Array.isArray(parsed) ? parsed.filter((key) => groups.some((g) => g.key === key)) : []);
    } catch {
      setHiddenBlocks([]);
    }
  }, [open, blockStorageKey, groups]);

  const persistHiddenBlocks = (next: CodingButtonGroupKey[]) => {
    setHiddenBlocks(next);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(blockStorageKey, JSON.stringify(next)); } catch { /* noop */ }
    }
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
        if (next.length !== current.length && typeof window !== 'undefined') {
          try { window.localStorage.setItem(blockStorageKey, JSON.stringify(next)); } catch { /* noop */ }
        }
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
    if (key === 'system') onWorkflowChange({ ...workflow, system: false });
    if (key === 'temps') onWorkflowChange({ ...workflow, temps: false });
    if (key === 'coverage') onWorkflowChange({ ...workflow, coverage: false });
    if (key === 'rebound') onWorkflowChange({ ...workflow, rebound: false });
    setMessage('Bloc retiré du chemin de codage. Tu peux le rajouter à tout moment.');
  };

  const restoreBlock = (key: CodingButtonGroupKey) => {
    persistHiddenBlocks(hiddenBlocks.filter((item) => item !== key));
    if (key === 'system') onWorkflowChange({ ...workflow, system: true });
    if (key === 'temps') onWorkflowChange({ ...workflow, temps: true });
    if (key === 'coverage') onWorkflowChange({ ...workflow, coverage: true });
    if (key === 'rebound') onWorkflowChange({ ...workflow, rebound: true });
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

  const saveButtons = async () => {
    if (!teamId) return;
    setSaving(true);
    setMessage('');
    try {
      const supabase = createClient();
      const codingRows = rows.filter((r) => r.category !== 'temps');
      const tagRows = rows.filter((r) => r.category === 'temps');

      const currentByCategory = new Map<CodingButtonGroupKey, string[]>();
      groups.forEach((g) => currentByCategory.set(g.key, rows.filter((r) => r.category === g.key).map((r) => r.key)));

      for (const group of groups) {
        const before = initialKeys[group.key] || [];
        const after = currentByCategory.get(group.key) || [];
        const deleted = before.filter((key) => !after.includes(key));
        if (!deleted.length) continue;
        if (group.key === 'temps') {
          await supabase.from('livestat_tags').delete().eq('team_id', teamId).in('key', deleted);
        } else {
          await supabase.from('livestat_coding_buttons').delete().eq('team_id', teamId).eq('category', group.key).in('key', deleted);
        }
      }

      if (codingRows.length) {
        const payload = codingRows.map((r, index) => ({
          team_id: teamId,
          key: r.key,
          label: r.label.trim() || 'Sans nom',
          emoji: r.emoji || null,
          category: r.category,
          stage: r.stage,
          sort_order: r.sort_order ?? index,
          is_active: r.is_active !== false,
        }));
        const { error } = await supabase.from('livestat_coding_buttons').upsert(payload, { onConflict: 'team_id,category,key' });
        if (error) throw error;

        const systemRows = codingRows.filter((r) => r.category === 'system');
        for (const r of systemRows) {
          await supabase
            .from('match_actions')
            .update({ systeme_name: r.label.trim() || 'Sans nom' })
            .eq('team_id', teamId)
            .eq('systeme_slot', r.key);
        }
      }

      if (tagRows.length) {
        const payload = tagRows.map((r, index) => ({
          team_id: teamId,
          key: r.key,
          label: r.label.trim() || 'Sans nom',
          category: 'offense',
          emoji: r.emoji || null,
          sort_order: r.sort_order ?? index,
          is_active: r.is_active !== false,
          clip_mode: 'possession',
          pre_roll: 5,
          post_roll: 3,
        }));
        const { error } = await supabase.from('livestat_tags').upsert(payload, { onConflict: 'team_id,key' });
        if (error) throw error;
      }

      setMessage('Boutons enregistrés ✓');
      onChanged();
    } catch (e: any) {
      console.error(e);
      setMessage(e?.message ? `Erreur : ${e.message}` : 'Impossible d’enregistrer la configuration');
    } finally {
      setSaving(false);
    }
  };

  const preset = (name: 'rapide' | 'coach' | 'complet') => {
    if (name === 'rapide') onWorkflowChange({ system: false, temps: true, player: false, coverage: false, zone: false, rebound: true, assist: false });
    if (name === 'coach') onWorkflowChange({ system: true, temps: true, player: false, coverage: false, zone: false, rebound: true, assist: false });
    if (name === 'complet') onWorkflowChange({ ...DEFAULT_WORKFLOW_PREFS });
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

  const saveProfile = () => {
    const name = profileName.trim();
    if (!name) {
      setMessage('Donne un nom à cette logique de codage.');
      return;
    }
    const existing = profiles.find((p) => p.id === profileId);
    const now = new Date().toISOString();
    const profile: LiveCodingProfile = {
      id: existing?.id || uid(),
      name,
      workflow: { ...workflow },
      activeButtonKeys: activeKeys(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    onSaveProfile(profile);
    setProfileId(profile.id);
    setMessage(`Logique « ${name} » enregistrée ✓`);
  };

  const selectedProfile = profiles.find((p) => p.id === profileId);

  return (
    <div className="lcsOverlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lcsCard">
        <div className="lcsHead">
          <div><b>⚙ Constructeur de codage LiveStats</b><span>Les blocs reprennent la même grille que pendant le codage.</span></div>
          <button onClick={onClose}>×</button>
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
                  if (p) { setProfileName(p.name); onApplyProfile(p); }
                  else setProfileName('');
                }}>
                  <option value="">Nouvelle logique…</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="grow">
                <span>Nom</span>
                <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Ex : Coach U18 sans Shot Chart" />
              </label>
              <button className="saveProfile" onClick={saveProfile}>💾 Enregistrer la logique</button>
              {selectedProfile && (
                <button
                  type="button"
                  className="deleteProfile"
                  onClick={() => {
                    if (!window.confirm(`Supprimer définitivement la configuration « ${selectedProfile.name} » ?`)) return;
                    onDeleteProfile(selectedProfile.id);
                    setProfileId('');
                    setProfileName('');
                    setMessage(`Configuration « ${selectedProfile.name} » supprimée ✓`);
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
                    onChange={(e) => onWorkflowChange({ ...workflow, [key]: e.target.checked })}
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
            <div className="lcsFoot"><span>{message}</span><button className="save" onClick={saveProfile}>💾 Sauvegarder cette logique</button></div>
          </div>
        ) : (
          <div className="lcsBody">
            <div className="lcsInfo">Chaque bloc garde la même présentation que pendant le codage. Tu peux retirer puis rajouter les blocs optionnels. Les blocs statistiques indispensables restent protégés pour ne pas casser les calculs.</div>
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
                      <div><b>{group.icon} {group.title}</b><small>{visible.filter((r) => r.is_active !== false && r.included !== false).length} utilisé(s)</small></div>
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
                    <div className="lcsCodingGrid">
                      {visible.map((r, index) => (
                        <div className={`lcsTile ${r.is_active === false || r.included === false ? 'off' : ''}`} key={`${r.category}-${r.key}`}>
                          <div className="lcsTileEdit">
                            <input className="emoji" value={r.emoji || ''} onChange={(e) => patch(r.key, r.category, { emoji: e.target.value })} />
                            <input className="label" value={r.label} onChange={(e) => patch(r.key, r.category, { label: e.target.value })} />
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
                  </section>
                );
              })}
            </div>
            <div className="lcsFoot"><span>{message}</span><button className="save" disabled={saving || !teamId} onClick={() => void saveButtons()}>{saving ? '⏳ Enregistrement…' : '💾 Enregistrer les boutons'}</button></div>
          </div>
        )}
      </div>
      <style jsx>{`
        .lcsOverlay{position:fixed;inset:0;z-index:5000;background:rgba(3,7,15,.80);display:flex;align-items:center;justify-content:center;padding:18px}.lcsCard{width:min(1320px,98vw);max-height:94vh;overflow:hidden;border:1px solid #33415a;border-radius:16px;background:#0b1321;color:#eef3fb;box-shadow:0 24px 80px rgba(0,0,0,.55);display:flex;flex-direction:column}.lcsHead{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #27344a}.lcsHead>div{display:grid;gap:3px}.lcsHead b{font-size:16px}.lcsHead span{font-size:11px;color:#93a0b5}.lcsHead button{width:34px;height:34px;border:1px solid #33415a;border-radius:9px;background:#111c2e;color:#fff;font-size:20px}.lcsTabs,.lcsPresets{display:flex;gap:8px;flex-wrap:wrap}.lcsTabs{padding:10px 16px;border-bottom:1px solid #27344a}.lcsTabs button,.lcsPresets button{border:1px solid #33415a;border-radius:9px;background:#111c2e;color:#aeb8ca;padding:8px 11px;font-weight:850;cursor:pointer}.lcsTabs button.on{border-color:#d4a24c;color:#f4c765;background:rgba(212,162,76,.1)}.lcsBody{padding:14px 16px 16px;overflow:auto}.lcsInfo{margin:8px 0 12px;padding:9px 10px;border:1px solid #2b3950;border-radius:9px;background:#0e1828;color:#a7b2c5;font-size:11px}.lcsProfileBar{display:grid;grid-template-columns:minmax(190px,.9fr) minmax(220px,1.2fr) auto auto;gap:8px;align-items:end;margin-bottom:10px}.lcsProfileBar label{display:grid;gap:5px}.lcsProfileBar label>span{font-size:9px;color:#8794aa;font-weight:900;text-transform:uppercase}.lcsProfileBar select,.lcsProfileBar input{height:38px;border:1px solid #34415a;border-radius:9px;background:#0d1727;color:#fff;padding:0 10px}.saveProfile,.deleteProfile{height:38px;white-space:nowrap;border:1px solid #d4a24c;border-radius:9px;background:rgba(212,162,76,.12);color:#f3c862;font-weight:900;padding:0 12px}.deleteProfile{border-color:#61313a;color:#ff8a96;background:#1c1117}.lcsWorkflow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lcsWorkflowRow{display:flex;gap:10px;align-items:flex-start;border:1px solid #29364c;border-radius:10px;background:#101a2a;padding:11px}.lcsWorkflowRow input{margin-top:3px}.lcsWorkflowRow span{display:grid;gap:3px}.lcsWorkflowRow b{font-size:12px}.lcsWorkflowRow small{color:#8491a6;font-size:10px}.lcsPath{margin-top:12px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.lcsPath>b{margin-right:4px;color:#d4a24c}.lcsPath>span{border:1px solid #34415a;border-radius:999px;padding:5px 8px;background:#111b2d;font-size:10px}.lcsIndividualPaths{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.lcsIndividualPaths>div{display:grid;gap:4px;border:1px solid #2d3b52;border-radius:10px;background:#101a2a;padding:10px}.lcsIndividualPaths b{font-size:11px;color:#f1c45e}.lcsIndividualPaths span{font-size:10px;color:#9aa7bc}.lcsBlocks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.lcsBlock{border:1px solid #2b3950;border-radius:12px;background:#0f1929;padding:10px;min-width:0}.lcsBlockHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.lcsBlockHead>div{display:grid;gap:2px}.lcsBlockHead b{font-size:12px}.lcsBlockHead small{font-size:9px;color:#78869c}.lcsBlockHead button{border:1px solid #d4a24c;border-radius:8px;background:rgba(212,162,76,.1);color:#f4c765;padding:6px 9px;font-size:10px;font-weight:900}.lcsCodingGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.lcsTile{min-width:0;border:1px solid #35425a;border-radius:10px;background:#121d30;padding:7px;display:grid;gap:6px}.lcsTile.off{opacity:.48}.lcsTileEdit{display:grid;grid-template-columns:36px minmax(0,1fr);gap:5px}.lcsTile input.emoji,.lcsTile input.label{min-width:0;height:32px;border:1px solid #3a4962;border-radius:7px;background:#0b1422;color:#fff}.lcsTile input.emoji{text-align:center;padding:0}.lcsTile input.label{padding:0 7px;font-size:10px;font-weight:850}.lcsTileTools{display:grid;grid-template-columns:1fr 26px 26px 26px;gap:4px;align-items:center}.lcsTileTools label{font-size:8px;color:#98a5b8;white-space:nowrap}.lcsTileTools button{width:26px;height:25px;border:1px solid #39475e;border-radius:6px;background:#101a2b;color:#dce5f4;font-size:10px}.lcsTileTools button:disabled{opacity:.25}.lcsTileTools .trash{color:#ff8a96}.lcsFoot{position:sticky;bottom:-16px;background:#0b1321;border-top:1px solid #27344a;margin:14px -16px -16px;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}.lcsFoot span{font-size:10px;color:#9eabc0}.lcsFoot .save{border:1px solid #d4a24c;border-radius:9px;background:#d4a24c;color:#17110b;padding:9px 13px;font-weight:900}@media(max-width:900px){.lcsBlocks,.lcsIndividualPaths,.lcsWorkflow{grid-template-columns:1fr}.lcsProfileBar{grid-template-columns:1fr 1fr}.lcsProfileBar .grow{grid-column:2}.lcsCodingGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.lcsOverlay{padding:6px}.lcsProfileBar{grid-template-columns:1fr}.lcsProfileBar .grow{grid-column:auto}.lcsCodingGrid{grid-template-columns:1fr}.lcsFoot{align-items:stretch;flex-direction:column}.lcsFoot .save{width:100%}}

        .lcsBlockManager{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #29364b;background:#0e1727;border-radius:12px;padding:10px 12px;margin-bottom:10px}
        .lcsBlockManager>b{font-size:10px;color:#d4a24c;text-transform:uppercase;letter-spacing:.05em}
        .lcsBlockPalette{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.lcsBlockPalette span{font-size:9px;color:#7e8ba0}
        .lcsBlockPalette button{border:1px dashed #d4a24c;background:rgba(212,162,76,.08);color:#d4a24c;border-radius:8px;padding:6px 8px;font-size:9px;font-weight:900;cursor:pointer}
        .lcsBlockHeadActions{display:flex;gap:6px;align-items:center}.lcsBlockHeadActions .removeBlock{border-color:#46546b;background:#141f31;color:#aab4c3}.lcsBlockHeadActions .removeBlock:hover{border-color:#ef4444;color:#fecaca}
      `}</style>
    </div>
  );
}
