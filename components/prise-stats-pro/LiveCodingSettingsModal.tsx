'use client';

import { useEffect, useMemo, useState } from 'react';
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

type Props = {
  open: boolean;
  teamId: string;
  initialTab?: 'workflow' | 'buttons';
  workflow: LiveWorkflowPrefs;
  onWorkflowChange: (next: LiveWorkflowPrefs) => void;
  systems: ConfigButton[];
  tempsForts: ConfigButton[];
  onChanged: () => void;
  onClose: () => void;
};

type Editable = ConfigButton & { category: 'system' | 'temps'; isNew?: boolean };

const slug = (s: string) => s
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 44);

const makeKey = (prefix: string, label: string) => {
  const base = slug(label) || 'bouton';
  const tail = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${base}-${tail}`;
};

export default function LiveCodingSettingsModal({
  open,
  teamId,
  initialTab = 'workflow',
  workflow,
  onWorkflowChange,
  systems,
  tempsForts,
  onChanged,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'workflow' | 'buttons'>(initialTab);
  const [buttonTab, setButtonTab] = useState<'system' | 'temps'>('system');
  const [rows, setRows] = useState<Editable[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    const sys = systems.map((x, i) => ({ ...x, category: 'system' as const, is_active: x.is_active !== false, sort_order: x.sort_order ?? i }));
    const tf = tempsForts.map((x, i) => ({ ...x, category: 'temps' as const, is_active: x.is_active !== false, sort_order: x.sort_order ?? i }));
    setRows([...sys, ...tf]);
    setMessage('');
  }, [open, initialTab, systems, tempsForts]);

  const visible = useMemo(() => rows.filter((r) => r.category === buttonTab), [rows, buttonTab]);

  if (!open) return null;

  const patch = (key: string, category: Editable['category'], p: Partial<Editable>) => {
    setRows((all) => all.map((r) => r.key === key && r.category === category ? { ...r, ...p } : r));
  };

  const add = () => {
    const category = buttonTab;
    const label = category === 'system' ? 'Nouveau système' : 'Nouveau temps fort';
    setRows((all) => [
      ...all,
      {
        key: makeKey(category === 'system' ? 'sys' : 'tf', label),
        label,
        emoji: category === 'system' ? '🏀' : '⚡',
        category,
        is_active: true,
        sort_order: visible.length,
        isNew: true,
      },
    ]);
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
      const systemRows = rows.filter((r) => r.category === 'system');
      const tagRows = rows.filter((r) => r.category === 'temps');

      if (systemRows.length) {
        const payload = systemRows.map((r, index) => ({
          team_id: teamId,
          key: r.key,
          label: r.label.trim() || 'Sans nom',
          emoji: r.emoji || null,
          category: 'system',
          stage: 'systeme',
          sort_order: r.sort_order ?? index,
          is_active: r.is_active !== false,
        }));
        const { error } = await supabase.from('livestat_coding_buttons').upsert(payload, { onConflict: 'team_id,category,key' });
        if (error) throw error;

        // Le système est stocké par key stable dans systeme_slot. On met à jour
        // systeme_name pour les écrans historiques qui l'affichent encore directement.
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

      setMessage('Configuration enregistrée ✓');
      onChanged();
    } catch (e: any) {
      console.error(e);
      setMessage(e?.message ? `Erreur : ${e.message}` : 'Impossible d’enregistrer la configuration');
    } finally {
      setSaving(false);
    }
  };

  const preset = (name: 'rapide' | 'coach' | 'complet') => {
    if (name === 'rapide') onWorkflowChange({ system: false, temps: true, player: false, coverage: false, zone: false, rebound: false, assist: false });
    if (name === 'coach') onWorkflowChange({ system: true, temps: true, player: false, coverage: false, zone: false, rebound: true, assist: false });
    if (name === 'complet') onWorkflowChange({ ...DEFAULT_WORKFLOW_PREFS });
  };

  const workflowRows: Array<[keyof LiveWorkflowPrefs, string, string]> = [
    ['system', 'Système de jeu', 'Peut être ignoré pour un codage très rapide.'],
    ['temps', 'Temps fort', 'Alimente les analyses, filtres et clips par temps fort.'],
    ['player', 'Joueur', 'Si désactivé, le codage reste collectif.'],
    ['coverage', 'Défense sur écran', 'Étape spécifique aux pick & roll.'],
    ['zone', 'Shot chart', 'Si décochée, la zone est réellement sautée dans le chemin.'],
    ['rebound', 'Conséquence / rebond', 'Si décochée, un tir raté est validé sans demander le rebond.'],
    ['assist', 'Passe décisive', 'Si décochée, un panier est validé directement.'],
  ];

  return (
    <div className="lcsOverlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lcsCard">
        <div className="lcsHead">
          <div><b>⚙ Configuration LiveStats</b><span>Le réglage modifie directement le chemin de codage.</span></div>
          <button onClick={onClose}>×</button>
        </div>
        <div className="lcsTabs">
          <button className={tab === 'workflow' ? 'on' : ''} onClick={() => setTab('workflow')}>⚙ Mon chemin de codage</button>
          <button className={tab === 'buttons' ? 'on' : ''} onClick={() => setTab('buttons')}>🧩 Mes boutons</button>
        </div>

        {tab === 'workflow' ? (
          <div className="lcsBody">
            <div className="lcsPresets">
              <button onClick={() => preset('rapide')}>⚡ Rapide</button>
              <button onClick={() => preset('coach')}>🏀 Coach</button>
              <button onClick={() => preset('complet')}>🎬 Complet</button>
            </div>
            <div className="lcsInfo">Contexte, Type d’action et Résultat restent protégés : ils sont nécessaires pour conserver des statistiques cohérentes.</div>
            <div className="lcsWorkflow">
              {workflowRows.map(([key, title, desc]) => (
                <label key={key} className="lcsWorkflowRow">
                  <input type="checkbox" checked={workflow[key]} onChange={(e) => onWorkflowChange({ ...workflow, [key]: e.target.checked })} />
                  <span><b>{title}</b><small>{desc}</small></span>
                </label>
              ))}
            </div>
            <div className="lcsPath">
              <b>Chemin actif</b>
              <span>Contexte</span>
              {workflow.system && <span>Système</span>}
              {workflow.temps && <span>Temps fort</span>}
              {workflow.player && <span>Joueur</span>}
              <span>Action</span><span>Résultat</span>
              {workflow.zone && <span>Shot chart</span>}
              {workflow.rebound && <span>Rebond</span>}
              {workflow.assist && <span>PD</span>}
            </div>
          </div>
        ) : (
          <div className="lcsBody">
            <div className="lcsSubTabs">
              <button className={buttonTab === 'system' ? 'on' : ''} onClick={() => setButtonTab('system')}>🏀 Systèmes</button>
              <button className={buttonTab === 'temps' ? 'on' : ''} onClick={() => setButtonTab('temps')}>⚡ Temps forts</button>
              <button className="add" onClick={add}>＋ Créer un bouton</button>
            </div>
            <div className="lcsInfo">La <b>key</b> reste stable. Tu peux renommer le bouton : les actions déjà codées continuent d’être reliées au même élément.</div>
            <div className="lcsButtonList">
              {visible.sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)).map((r, index) => (
                <div className="lcsButtonRow" key={`${r.category}-${r.key}`}>
                  <input className="emoji" value={r.emoji || ''} onChange={(e) => patch(r.key, r.category, { emoji: e.target.value })} />
                  <input className="label" value={r.label} onChange={(e) => patch(r.key, r.category, { label: e.target.value })} />
                  <span className="key" title={r.key}>{r.key}</span>
                  <label className="active"><input type="checkbox" checked={r.is_active !== false} onChange={(e) => patch(r.key, r.category, { is_active: e.target.checked })} /> Actif</label>
                  <button disabled={index === 0} onClick={() => move(r, -1)}>↑</button>
                  <button disabled={index === visible.length - 1} onClick={() => move(r, 1)}>↓</button>
                </div>
              ))}
            </div>
            <div className="lcsFoot">
              <span>{message}</span>
              <button className="save" disabled={saving || !teamId} onClick={() => void saveButtons()}>{saving ? '⏳ Enregistrement…' : '💾 Enregistrer les boutons'}</button>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        .lcsOverlay{position:fixed;inset:0;z-index:5000;background:rgba(3,7,15,.78);display:flex;align-items:center;justify-content:center;padding:24px}.lcsCard{width:min(980px,96vw);max-height:90vh;overflow:hidden;border:1px solid #33415a;border-radius:16px;background:#0b1321;color:#eef3fb;box-shadow:0 24px 80px rgba(0,0,0,.55);display:flex;flex-direction:column}.lcsHead{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #27344a}.lcsHead>div{display:grid;gap:3px}.lcsHead b{font-size:16px}.lcsHead span{font-size:11px;color:#93a0b5}.lcsHead button{width:34px;height:34px;border:1px solid #33415a;border-radius:9px;background:#111c2e;color:#fff;font-size:20px}.lcsTabs,.lcsSubTabs,.lcsPresets{display:flex;gap:8px;flex-wrap:wrap}.lcsTabs{padding:10px 16px;border-bottom:1px solid #27344a}.lcsTabs button,.lcsSubTabs button,.lcsPresets button{border:1px solid #33415a;border-radius:9px;background:#111c2e;color:#aeb8ca;padding:8px 11px;font-weight:850}.lcsTabs button.on,.lcsSubTabs button.on{border-color:#d4a24c;color:#f4c765;background:rgba(212,162,76,.1)}.lcsBody{padding:16px;overflow:auto}.lcsInfo{margin:10px 0;padding:9px 10px;border:1px solid #2b3950;border-radius:9px;background:#0e1828;color:#a7b2c5;font-size:11px}.lcsWorkflow{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lcsWorkflowRow{display:flex;gap:10px;align-items:flex-start;border:1px solid #29364c;border-radius:10px;background:#101a2a;padding:11px}.lcsWorkflowRow input{margin-top:3px}.lcsWorkflowRow span{display:grid;gap:3px}.lcsWorkflowRow b{font-size:12px}.lcsWorkflowRow small{color:#8491a6;font-size:10px}.lcsPath{margin-top:14px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.lcsPath>b{margin-right:4px;color:#d4a24c}.lcsPath>span{border:1px solid #34415a;border-radius:999px;padding:5px 8px;background:#111b2d;font-size:10px}.lcsSubTabs{align-items:center;margin-bottom:8px}.lcsSubTabs .add{margin-left:auto;border-color:#d4a24c;color:#f4c765}.lcsButtonList{display:grid;gap:7px}.lcsButtonRow{display:grid;grid-template-columns:54px minmax(180px,1fr) minmax(120px,.8fr) 82px 34px 34px;gap:7px;align-items:center;border:1px solid #29364c;border-radius:10px;background:#101a2a;padding:8px}.lcsButtonRow input.emoji,.lcsButtonRow input.label{min-width:0;border:1px solid #34415a;border-radius:8px;background:#0c1524;color:#fff;padding:8px}.lcsButtonRow .emoji{text-align:center}.lcsButtonRow .key{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#68778f;font-size:9px}.lcsButtonRow .active{font-size:10px;color:#aeb8ca}.lcsButtonRow button{height:32px;border:1px solid #34415a;border-radius:8px;background:#111c2e;color:#fff}.lcsButtonRow button:disabled{opacity:.3}.lcsFoot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px}.lcsFoot span{font-size:10px;color:#9eabc0}.lcsFoot .save{border:1px solid #d4a24c;border-radius:9px;background:#d4a24c;color:#17110b;padding:9px 13px;font-weight:900}@media(max-width:760px){.lcsOverlay{padding:8px}.lcsWorkflow{grid-template-columns:1fr}.lcsButtonRow{grid-template-columns:48px minmax(0,1fr) 70px 32px 32px}.lcsButtonRow .key{display:none}.lcsButtonRow .active{grid-column:2/4}.lcsFoot{align-items:stretch;flex-direction:column}.lcsFoot .save{width:100%}}
      `}</style>
    </div>
  );
}
