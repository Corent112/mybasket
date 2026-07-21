'use client';

/**
 * Management > Fenêtre de codification
 * -------------------------------------------------------------------------
 * Gestion des boutons du panneau de codification de LiveStat (hors temps
 * forts, qui restent dans livestat_tags). Table : livestat_coding_buttons.
 *
 * Règles :
 *  - la `key` reste STABLE (jamais affichée brute → seulement en "id technique"
 *    discret, non éditable) ; matrices / fiches restent reliées.
 *  - si la table est vide pour l'équipe → bouton "Initialiser depuis les
 *    valeurs par défaut" qui seed depuis les constantes ci-dessous (mêmes keys
 *    que LiveStat).
 *  - un changement (label/emoji/couleur/ordre/raccourci/actif/pre-post/clip)
 *    se répercute dans LiveStat (qui lit cette table pour l'équipe active).
 *
 * Aucun localStorage : source de vérité = Supabase.
 */

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/* ---------------- Catalogue de secours (mêmes keys que LiveStat) ---------- */
type Cat = 'att-action' | 'def-action' | 'coverage' | 'result' | 'rebound' | 'foul';

type SeedButton = { key: string; label: string; emoji?: string; category: Cat; stage: string };

const SEED: SeedButton[] = [
  // Actions offensives (stage: action)
  { key: 'tir', label: 'Tir', emoji: '🏀', category: 'att-action', stage: 'action' },
  { key: 'faute-provoquee', label: 'Faute provoquée', emoji: '🔔', category: 'att-action', stage: 'action' },
  { key: 'touche', label: 'Touche / Sortie', emoji: '⤵', category: 'att-action', stage: 'action' },
  { key: 'perte', label: 'Perte de balle', emoji: '✖', category: 'att-action', stage: 'action' },
  { key: 'faute-commise', label: 'Faute commise', emoji: '🟨', category: 'att-action', stage: 'action' },
  // Actions défensives (stage: action)
  { key: 'tir', label: 'Tir adverse', emoji: '🏀', category: 'def-action', stage: 'action' },
  { key: 'interception', label: 'Interception / récupération', emoji: '🖐', category: 'def-action', stage: 'action' },
  { key: 'perte-adverse', label: 'BP adverse', emoji: '✖', category: 'def-action', stage: 'action' },
  { key: 'contre', label: 'Contre', emoji: '🛑', category: 'def-action', stage: 'action' },
  { key: 'faute-provoquee', label: 'Faute provoquée', emoji: '🔔', category: 'def-action', stage: 'action' },
  { key: 'faute-commise', label: 'Faute commise', emoji: '🟨', category: 'def-action', stage: 'action' },
  // Coverages (stage: coverage)
  { key: 'step-out', label: 'Step out', category: 'coverage', stage: 'coverage' },
  { key: 'switch', label: 'Switch', category: 'coverage', stage: 'coverage' },
  { key: 'under', label: 'Under', category: 'coverage', stage: 'coverage' },
  { key: 'protect', label: 'Protect', category: 'coverage', stage: 'coverage' },
  { key: 'ice', label: 'ICE', category: 'coverage', stage: 'coverage' },
  // Résultats (stage: result)
  { key: '2PTS', label: '2 points', emoji: '②', category: 'result', stage: 'result' },
  { key: '3PTS', label: '3 points', emoji: '③', category: 'result', stage: 'result' },
  { key: 'LF', label: 'Lancers francs', emoji: '🎯', category: 'result', stage: 'result' },
  // Rebonds (stage: rebound)
  { key: 'off', label: 'Rebond offensif', emoji: '↺', category: 'rebound', stage: 'rebound' },
  { key: 'def', label: 'Rebond défensif', emoji: '🛡', category: 'rebound', stage: 'rebound' },
  { key: 'touche-pour', label: 'Touche pour', emoji: '➕', category: 'rebound', stage: 'rebound' },
  { key: 'touche-contre', label: 'Touche contre', emoji: '➖', category: 'rebound', stage: 'rebound' },
  // Fautes (stage: faute)
  { key: 'touche', label: 'Touche', category: 'foul', stage: 'faute' },
  { key: 'lf2', label: '2 LF', category: 'foul', stage: 'faute' },
  { key: 'lf3', label: '3 LF', category: 'foul', stage: 'faute' },
  { key: '2plus1', label: '2 + 1', category: 'foul', stage: 'faute' },
  { key: '3plus1', label: '3 + 1', category: 'foul', stage: 'faute' },
];

const CATEGORIES: { id: Cat; label: string; hint: string }[] = [
  { id: 'att-action', label: 'Actions offensives', hint: 'Étape "Type d\'action" en attaque' },
  { id: 'def-action', label: 'Actions défensives', hint: 'Étape "Type d\'action" en défense' },
  { id: 'coverage', label: 'Défense sur écran', hint: 'Étape coverage (pick)' },
  { id: 'result', label: 'Résultats', hint: 'Type de tir' },
  { id: 'rebound', label: 'Rebonds', hint: 'Conséquence sur tir manqué' },
  { id: 'foul', label: 'Fautes', hint: 'Issue de faute' },
];

const CLIP_MODES = ['default', 'action', 'possession', 'custom'];

/* ---------------- Types ---------------- */
type Row = {
  id?: string;
  team_id: string;
  key: string;
  label: string;
  emoji: string | null;
  category: string;
  stage: string | null;
  color: string | null;
  shortcut_key: string | null;
  shortcut_modifier: string | null;
  sort_order: number;
  is_active: boolean;
  clip_mode: string | null;
  pre_roll: number | null;
  post_roll: number | null;
  _dirty?: boolean;
};

type Team = { id: string; name: string };

export default function CodificationPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [cat, setCat] = useState<Cat>('att-action');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 2200); };

  /* Charger les équipes Supabase de l'utilisateur */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.from('teams').select('id,name').order('name');
        if (!active) return;
        const list = (data ?? []) as Team[];
        setTeams(list);
        if (list.length) setTeamId((cur) => cur || list[0].id);
      } catch { /* noop */ }
    })();
    return () => { active = false; };
  }, []);

  /* Charger les boutons de l'équipe active */
  useEffect(() => {
    if (!teamId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('livestat_coding_buttons')
          .select('id,team_id,key,label,emoji,category,stage,color,shortcut_key,shortcut_modifier,sort_order,is_active,clip_mode,pre_roll,post_roll')
          .eq('team_id', teamId)
          .order('category')
          .order('sort_order');
        if (!active) return;
        if (error) { flash('Lecture impossible : ' + error.message); setRows([]); }
        else setRows(((data ?? []) as Row[]).map((r) => ({ ...r })));
      } catch (e: any) {
        if (active) { flash('Erreur : ' + (e?.message || 'chargement')); setRows([]); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [teamId]);

  const catRows = useMemo(
    () => rows.filter((r) => r.category === cat).sort((a, b) => a.sort_order - b.sort_order),
    [rows, cat]
  );
  const isEmpty = !loading && rows.length === 0;

  const patch = (id: string | undefined, key: string, k: keyof Row, v: unknown) => {
    setRows((prev) => prev.map((r) => (
      (id && r.id === id) || (!id && r.key === key && r.category === cat)
        ? { ...r, [k]: v, _dirty: true }
        : r
    )));
  };

  const move = (row: Row, dir: -1 | 1) => {
    const list = catRows.slice();
    const idx = list.findIndex((r) => r === row || (r.key === row.key && r.id === row.id));
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= list.length) return;
    const a = list[idx], b = list[j];
    const ao = a.sort_order, bo = b.sort_order;
    setRows((prev) => prev.map((r) => {
      if (r === a) return { ...r, sort_order: bo, _dirty: true };
      if (r === b) return { ...r, sort_order: ao, _dirty: true };
      return r;
    }));
  };

  /* Initialiser depuis les constantes (seed) — insert non destructif */
  const seedDefaults = async () => {
    if (!teamId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = SEED.map((s, i) => ({
        team_id: teamId,
        key: s.key,
        label: s.label,
        emoji: s.emoji ?? null,
        category: s.category,
        stage: s.stage,
        color: null,
        shortcut_key: null,
        shortcut_modifier: null,
        sort_order: SEED.filter((x) => x.category === s.category).findIndex((x) => x.key === s.key && x.label === s.label) >= 0
          ? SEED.filter((x) => x.category === s.category).findIndex((x) => x.key === s.key && x.label === s.label)
          : i,
        is_active: true,
        clip_mode: 'default',
        pre_roll: 6,
        post_roll: 4,
      }));
      const { error } = await supabase
        .from('livestat_coding_buttons')
        .upsert(payload, { onConflict: 'team_id,category,key' });
      if (error) { flash('Seed impossible : ' + error.message); }
      else {
        flash('Boutons initialisés ✓');
        setTeamId((t) => t); // retrigger fetch
        const { data } = await supabase
          .from('livestat_coding_buttons')
          .select('id,team_id,key,label,emoji,category,stage,color,shortcut_key,shortcut_modifier,sort_order,is_active,clip_mode,pre_roll,post_roll')
          .eq('team_id', teamId)
          .order('category').order('sort_order');
        setRows(((data ?? []) as Row[]).map((r) => ({ ...r })));
      }
    } catch (e: any) {
      flash('Erreur seed : ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  /* Enregistrer les modifications (upsert) */
  const saveAll = async () => {
    if (!teamId) return;
    const dirty = rows.filter((r) => r._dirty);
    if (!dirty.length) { flash('Rien à enregistrer.'); return; }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = dirty.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        team_id: teamId,
        key: r.key,
        label: r.label,
        emoji: r.emoji,
        category: r.category,
        stage: r.stage,
        color: r.color,
        shortcut_key: r.shortcut_key,
        shortcut_modifier: r.shortcut_modifier,
        sort_order: r.sort_order,
        is_active: r.is_active,
        clip_mode: r.clip_mode,
        pre_roll: r.pre_roll,
        post_roll: r.post_roll,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('livestat_coding_buttons')
        .upsert(payload, { onConflict: 'team_id,category,key' });
      if (error) { flash('Enregistrement échoué : ' + error.message); }
      else {
        flash('Enregistré ✓ — LiveStat affichera les nouveaux libellés.');
        setRows((prev) => prev.map((r) => ({ ...r, _dirty: false })));
      }
    } catch (e: any) {
      flash('Erreur : ' + (e?.message || 'enregistrement'));
    } finally {
      setSaving(false);
    }
  };

  const dirtyCount = rows.filter((r) => r._dirty).length;

  return (
    <div className="cw-root">
      <header className="cw-head">
        <div>
          <div className="cw-kicker">Management</div>
          <h1>Fenêtre de codification</h1>
          <p className="cw-sub">Personnalise les boutons de LiveStat. Les identifiants techniques restent fixes : renommer un bouton ne casse pas les stats existantes.</p>
        </div>
        <div className="cw-head-actions">
          <label className="cw-teamsel">
            <span>Équipe</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.length === 0 && <option value="">—</option>}
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button className="cw-btn primary" disabled={saving || !dirtyCount} onClick={saveAll}>
            {saving ? '⏳ …' : `💾 Enregistrer${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </button>
        </div>
      </header>

      {isEmpty ? (
        <div className="cw-empty">
          <div className="cw-empty-ic">🎛</div>
          <h2>Aucun bouton personnalisé</h2>
          <p>LiveStat fonctionne actuellement avec les boutons par défaut. Initialise-les ici pour pouvoir les modifier (libellé, emoji, couleur, ordre, raccourci, pré/post-roll…).</p>
          <button className="cw-btn primary" disabled={saving || !teamId} onClick={seedDefaults}>
            {saving ? '⏳ …' : '✨ Initialiser depuis les valeurs par défaut'}
          </button>
        </div>
      ) : (
        <div className="cw-body">
          <nav className="cw-cats">
            {CATEGORIES.map((c) => (
              <button key={c.id} className={`cw-cat ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
                <b>{c.label}</b>
                <small>{c.hint}</small>
                <span className="cw-catcount">{rows.filter((r) => r.category === c.id).length}</span>
              </button>
            ))}
          </nav>

          <section className="cw-panel">
            {loading ? (
              <div className="cw-loading">Chargement…</div>
            ) : catRows.length === 0 ? (
              <div className="cw-loading">Aucun bouton dans cette catégorie.</div>
            ) : (
              <div className="cw-list">
                {catRows.map((r, i) => (
                  <div className={`cw-row ${r.is_active ? '' : 'off'}`} key={(r.id || r.key) + i}>
                    <div className="cw-order">
                      <button disabled={i === 0} onClick={() => move(r, -1)}>▲</button>
                      <button disabled={i === catRows.length - 1} onClick={() => move(r, 1)}>▼</button>
                    </div>

                    <div className="cw-preview" style={{ borderColor: r.color || 'var(--cw-border)' }}>
                      <span className="cw-emoji">{r.emoji || '•'}</span>
                      <span className="cw-lbl" style={{ color: r.color || undefined }}>{r.label || '(sans libellé)'}</span>
                    </div>

                    <div className="cw-fields">
                      <label className="cw-f"><span>Libellé</span>
                        <input value={r.label} onChange={(e) => patch(r.id, r.key, 'label', e.target.value)} />
                      </label>
                      <label className="cw-f sm"><span>Emoji</span>
                        <input value={r.emoji ?? ''} maxLength={4} onChange={(e) => patch(r.id, r.key, 'emoji', e.target.value || null)} />
                      </label>
                      <label className="cw-f sm"><span>Couleur</span>
                        <input type="color" value={r.color || '#6b1a2c'} onChange={(e) => patch(r.id, r.key, 'color', e.target.value)} />
                      </label>
                      <label className="cw-f sm"><span>Raccourci</span>
                        <input value={r.shortcut_key ?? ''} maxLength={3} placeholder="—" onChange={(e) => patch(r.id, r.key, 'shortcut_key', e.target.value.toUpperCase() || null)} />
                      </label>
                      <label className="cw-f sm"><span>Modif.</span>
                        <select value={r.shortcut_modifier ?? ''} onChange={(e) => patch(r.id, r.key, 'shortcut_modifier', e.target.value || null)}>
                          <option value="">—</option>
                          <option value="shift">⇧ Shift</option>
                          <option value="alt">⌥ Alt</option>
                          <option value="ctrl">⌃ Ctrl</option>
                        </select>
                      </label>
                      <label className="cw-f sm"><span>Clip</span>
                        <select value={r.clip_mode ?? 'default'} onChange={(e) => patch(r.id, r.key, 'clip_mode', e.target.value)}>
                          {CLIP_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                      <label className="cw-f xs"><span>Pré-roll (s)</span>
                        <input type="number" value={r.pre_roll ?? 0} min={0} max={30} onChange={(e) => patch(r.id, r.key, 'pre_roll', Number(e.target.value))} />
                      </label>
                      <label className="cw-f xs"><span>Post-roll (s)</span>
                        <input type="number" value={r.post_roll ?? 0} min={0} max={30} onChange={(e) => patch(r.id, r.key, 'post_roll', Number(e.target.value))} />
                      </label>
                    </div>

                    <div className="cw-toggle">
                      <button className={`cw-switch ${r.is_active ? 'on' : ''}`} onClick={() => patch(r.id, r.key, 'is_active', !r.is_active)} title={r.is_active ? 'Actif' : 'Inactif'}>
                        <span />
                      </button>
                      <small>{r.is_active ? 'Actif' : 'Masqué'}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {toast && <div className="cw-toast">{toast}</div>}

      <style>{`
        .cw-root { --cw-bordeaux:#6b1a2c; --cw-gold:#d4a24c; --cw-ink:#1e1a17; --cw-mute:#8a7b73; --cw-border:#e9ddd2; --cw-panel:#fff; --cw-bg:#faf6f1;
          background: var(--cw-bg); min-height: 100%; padding: 22px; color: var(--cw-ink); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
        .cw-root * { box-sizing: border-box; }
        .cw-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
        .cw-kicker { font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: var(--cw-gold); }
        .cw-head h1 { margin: 2px 0 4px; font-size: 24px; color: var(--cw-bordeaux); }
        .cw-sub { margin: 0; font-size: 13px; color: var(--cw-mute); max-width: 620px; }
        .cw-head-actions { display: flex; align-items: flex-end; gap: 10px; }
        .cw-teamsel { display: grid; gap: 3px; font-size: 11px; font-weight: 800; color: var(--cw-mute); }
        .cw-teamsel select { border: 1px solid var(--cw-border); border-radius: 9px; padding: 8px 10px; font: inherit; background: #fff; min-width: 180px; }
        .cw-btn { border: 1px solid var(--cw-border); background: #fff; border-radius: 9px; padding: 9px 14px; font-weight: 800; font-size: 13px; cursor: pointer; }
        .cw-btn.primary { background: var(--cw-bordeaux); color: #fff; border-color: var(--cw-bordeaux); }
        .cw-btn:disabled { opacity: .5; cursor: not-allowed; }
        .cw-empty { background: var(--cw-panel); border: 1px solid var(--cw-border); border-radius: 16px; padding: 40px; text-align: center; max-width: 560px; margin: 40px auto; }
        .cw-empty-ic { font-size: 40px; }
        .cw-empty h2 { margin: 8px 0; color: var(--cw-bordeaux); }
        .cw-empty p { color: var(--cw-mute); font-size: 13px; margin: 0 0 18px; }
        .cw-body { display: grid; grid-template-columns: 230px 1fr; gap: 16px; }
        .cw-cats { display: flex; flex-direction: column; gap: 6px; }
        .cw-cat { position: relative; text-align: left; border: 1px solid var(--cw-border); background: #fff; border-radius: 11px; padding: 10px 12px; cursor: pointer; display: grid; gap: 2px; }
        .cw-cat b { font-size: 13px; }
        .cw-cat small { font-size: 11px; color: var(--cw-mute); }
        .cw-cat.on { border-color: var(--cw-bordeaux); background: #fbf1f0; }
        .cw-catcount { position: absolute; top: 10px; right: 10px; font-size: 11px; font-weight: 900; color: var(--cw-gold); background: rgba(212,162,76,.14); border-radius: 999px; padding: 1px 8px; }
        .cw-panel { background: var(--cw-panel); border: 1px solid var(--cw-border); border-radius: 14px; padding: 12px; min-height: 300px; }
        .cw-loading { color: var(--cw-mute); padding: 30px; text-align: center; }
        .cw-list { display: flex; flex-direction: column; gap: 8px; }
        .cw-row { display: grid; grid-template-columns: 32px 180px 1fr 66px; gap: 10px; align-items: center; border: 1px solid var(--cw-border); border-radius: 11px; padding: 8px 10px; background: #fffdfb; }
        .cw-row.off { opacity: .55; }
        .cw-order { display: grid; gap: 2px; }
        .cw-order button { border: 1px solid var(--cw-border); background: #fff; border-radius: 6px; cursor: pointer; font-size: 10px; padding: 1px 4px; }
        .cw-order button:disabled { opacity: .35; cursor: not-allowed; }
        .cw-preview { display: flex; align-items: center; gap: 8px; border: 1.5px solid var(--cw-border); border-radius: 9px; padding: 8px 10px; background: #fff; }
        .cw-emoji { font-size: 18px; }
        .cw-lbl { font-weight: 800; font-size: 13px; }
        .cw-fields { display: flex; flex-wrap: wrap; gap: 8px; }
        .cw-f { display: grid; gap: 2px; font-size: 10px; font-weight: 800; color: var(--cw-mute); text-transform: uppercase; letter-spacing: .03em; }
        .cw-f input, .cw-f select { border: 1px solid var(--cw-border); border-radius: 7px; padding: 6px 8px; font: inherit; font-size: 13px; background: #fff; }
        .cw-f input { width: 150px; }
        .cw-f.sm input, .cw-f.sm select { width: 92px; }
        .cw-f.xs input { width: 84px; }
        .cw-f input[type="color"] { width: 44px; height: 32px; padding: 2px; }
        .cw-toggle { display: grid; justify-items: center; gap: 3px; }
        .cw-toggle small { font-size: 10px; color: var(--cw-mute); }
        .cw-switch { width: 42px; height: 24px; border-radius: 999px; border: 1px solid var(--cw-border); background: #eee; position: relative; cursor: pointer; }
        .cw-switch span { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: left .15s; }
        .cw-switch.on { background: var(--cw-bordeaux); border-color: var(--cw-bordeaux); }
        .cw-switch.on span { left: 20px; }
        .cw-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--cw-ink); color: #fff; padding: 10px 18px; border-radius: 10px; font-size: 13px; font-weight: 700; z-index: 100; }
        @media (max-width: 860px) {
          .cw-body { grid-template-columns: 1fr; }
          .cw-cats { flex-direction: row; overflow-x: auto; }
          .cw-cat { min-width: 180px; }
          .cw-row { grid-template-columns: 28px 1fr; }
          .cw-preview { grid-column: 2; }
          .cw-fields { grid-column: 1 / -1; }
          .cw-toggle { grid-column: 1 / -1; justify-items: start; grid-auto-flow: column; }
        }
      `}</style>
    </div>
  );
}
