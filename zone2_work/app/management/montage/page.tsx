'use client';

/**
 * Management > Montage vidéo
 * -------------------------------------------------------------------------
 * Prépare un montage à partir des actions codées (match_actions) : on pioche
 * des clips, on les ajoute au montage, on réordonne, on supprime, on met un
 * titre + une note coach. Persistance : livestat_montages / _montage_items.
 *
 * L'export vidéo réel (ffmpeg / MP4) N'EST PAS géré : statut "Export à venir".
 * Les temps forts s'affichent via leur libellé (jamais la key brute) ; ici on
 * résout un libellé lisible localement (fallback) sans dépendre du hook.
 *
 * Aucun localStorage : source de vérité = Supabase.
 */

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Team = { id: string; name: string };

type Action = {
  id: string;
  client_action_id: string | null;
  quarter: number | null;
  clock: string | null;
  temps_fort: string | null;
  action_type: string | null;
  shot_result: string | null;
  context: string | null;
  player_id: string | null;
  video_time: number | null;
  clip_start: number | null;
  clip_end: number | null;
};

type Item = {
  id?: string;
  client_action_id: string | null;
  sort_order: number;
  title: string | null;
  note: string | null;
  clip_start: number | null;
  clip_end: number | null;
  // affichage
  _label?: string;
  _sub?: string;
};

type Montage = { id: string; title: string; coach_note: string | null; status: string };

// Libellés lisibles (fallback local — jamais la key brute).
const TF_LABELS: Record<string, string> = {
  'fast-break': 'Fast Break', 'transition': 'Transition', 'jeu-place': 'Jeu placé',
  'pick-side': 'Pick Side', 'pick-top': 'Pick Top', 'hand-off': 'Hand Off',
  '1v1': '1v1', 'drive-kick': 'Drive & Kick', 'stagger': 'Stagger',
  'jeu-sans-ballon': 'Jeu sans ballon', 'off-rebound': 'Offensive Rebound',
};
const tfLabel = (k: string | null) => (k ? TF_LABELS[k] || k.replace(/-/g, ' ') : '—');

function actionLabel(a: Action): { label: string; sub: string } {
  const tf = tfLabel(a.temps_fort);
  const kind = a.action_type === 'tir'
    ? (a.shot_result === 'made' ? 'Tir marqué' : 'Tir manqué')
    : (a.action_type || 'Action');
  const per = a.quarter != null ? (a.quarter <= 4 ? `Q${a.quarter}` : `OT${a.quarter - 4}`) : '';
  return { label: `${tf} · ${kind}`, sub: [per, a.clock, a.context].filter(Boolean).join(' · ') };
}

export default function MontagePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState('');
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [montage, setMontage] = useState<Montage | null>(null);
  const [title, setTitle] = useState('Nouveau montage');
  const [coachNote, setCoachNote] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<'all' | 'made' | 'clip'>('all');

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 2400); };

  /* Équipes */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.from('teams').select('id,name').order('name');
        if (!active) return;
        const list = (data ?? []) as Team[];
        setTeams(list);
        if (list.length) setTeamId((c) => c || list[0].id);
      } catch { /* noop */ }
    })();
    return () => { active = false; };
  }, []);

  /* Clips disponibles = actions codées de l'équipe (match_actions) */
  useEffect(() => {
    if (!teamId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('match_actions')
          .select('id,client_action_id,quarter,clock,temps_fort,action_type,shot_result,context,player_id,video_time,clip_start,clip_end')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(300);
        if (!active) return;
        if (error) { flash('Lecture actions impossible : ' + error.message); setActions([]); }
        else setActions((data ?? []) as Action[]);
      } catch (e: any) {
        if (active) flash('Erreur : ' + (e?.message || 'chargement'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [teamId]);

  const available = useMemo(() => {
    const inMontage = new Set(items.map((i) => i.client_action_id));
    return actions.filter((a) => {
      if (inMontage.has(a.client_action_id)) return false;
      if (filter === 'made') return a.action_type === 'tir' && a.shot_result === 'made';
      if (filter === 'clip') return a.video_time != null;
      return true;
    });
  }, [actions, items, filter]);

  const addClip = (a: Action) => {
    const { label, sub } = actionLabel(a);
    setItems((prev) => [...prev, {
      client_action_id: a.client_action_id,
      sort_order: prev.length,
      title: label,
      note: null,
      clip_start: a.clip_start,
      clip_end: a.clip_end,
      _label: label,
      _sub: sub,
    }]);
  };
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, sort_order: i })));
  const moveItem = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    setItems((prev) => {
      const next = prev.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((it, i) => ({ ...it, sort_order: i }));
    });
  };
  const setItemNote = (idx: number, note: string) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, note } : it));

  /* Enregistrer le montage (upsert montage + remplace ses items) */
  const saveMontage = async () => {
    if (!teamId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      let mId = montage?.id;

      if (!mId) {
        const { data, error } = await supabase
          .from('livestat_montages')
          .insert({ team_id: teamId, title, coach_note: coachNote || null, status: 'draft' })
          .select('id,title,coach_note,status')
          .single();
        if (error || !data) { flash('Création impossible : ' + (error?.message || '')); setSaving(false); return; }
        mId = data.id;
        setMontage(data as Montage);
      } else {
        const { error } = await supabase
          .from('livestat_montages')
          .update({ title, coach_note: coachNote || null, updated_at: new Date().toISOString() })
          .eq('id', mId);
        if (error) { flash('Mise à jour impossible : ' + error.message); setSaving(false); return; }
      }

      // Remplace les items (simple et robuste : delete puis insert ordonné)
      await supabase.from('livestat_montage_items').delete().eq('montage_id', mId);
      if (items.length) {
        const payload = items.map((it, i) => ({
          montage_id: mId,
          client_action_id: it.client_action_id,
          sort_order: i,
          title: it.title,
          note: it.note,
          clip_start: it.clip_start,
          clip_end: it.clip_end,
        }));
        const { error: itErr } = await supabase.from('livestat_montage_items').insert(payload);
        if (itErr) { flash('Clips non enregistrés : ' + itErr.message); setSaving(false); return; }
      }
      flash('Montage enregistré ✓');
    } catch (e: any) {
      flash('Erreur : ' + (e?.message || 'enregistrement'));
    } finally {
      setSaving(false);
    }
  };

  const newMontage = () => {
    setMontage(null); setTitle('Nouveau montage'); setCoachNote(''); setItems([]);
    flash('Nouveau montage vierge.');
  };

  return (
    <div className="mt-root">
      <header className="mt-head">
        <div>
          <div className="mt-kicker">Management · Vidéo</div>
          <h1>Montage</h1>
          <p className="mt-sub">Assemble des séquences à partir des actions codées. L'export vidéo arrivera plus tard — pour l'instant on prépare le montage et la note coach.</p>
        </div>
        <div className="mt-head-actions">
          <label className="mt-teamsel"><span>Équipe</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.length === 0 && <option value="">—</option>}
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button className="mt-btn" onClick={newMontage}>＋ Nouveau</button>
          <button className="mt-btn primary" disabled={saving} onClick={saveMontage}>{saving ? '⏳ …' : '💾 Enregistrer'}</button>
        </div>
      </header>

      <div className="mt-body">
        {/* Bibliothèque de clips */}
        <section className="mt-lib">
          <div className="mt-lib-head">
            <h3>Clips disponibles</h3>
            <div className="mt-filters">
              {([['all', 'Tous'], ['made', 'Paniers'], ['clip', 'Avec clip']] as const).map(([k, l]) => (
                <button key={k} className={`mt-fil ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="mt-lib-list">
            {loading ? <div className="mt-empty">Chargement…</div>
              : available.length === 0 ? <div className="mt-empty">Aucun clip à ajouter.</div>
                : available.map((a) => {
                  const { label, sub } = actionLabel(a);
                  const hasClip = a.video_time != null;
                  return (
                    <div className="mt-clip" key={a.id}>
                      <span className={`mt-dot ${a.shot_result === 'made' ? 'made' : a.action_type === 'tir' ? 'miss' : ''}`} />
                      <div className="mt-clip-body">
                        <b>{label}</b>
                        <small>{sub}{hasClip ? '' : ' · clip à synchroniser'}</small>
                      </div>
                      <button className="mt-add" onClick={() => addClip(a)} title="Ajouter au montage">＋</button>
                    </div>
                  );
                })}
          </div>
        </section>

        {/* Montage en cours */}
        <section className="mt-build">
          <div className="mt-meta">
            <label className="mt-f"><span>Titre du montage</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Défense Q3 à corriger" />
            </label>
            <label className="mt-f"><span>Note coach</span>
              <textarea value={coachNote} onChange={(e) => setCoachNote(e.target.value)} placeholder="Message d'intention, points à montrer aux joueurs…" />
            </label>
            <div className="mt-status">
              <span className="mt-badge">🎬 {items.length} clip{items.length > 1 ? 's' : ''}</span>
              <span className="mt-badge pending">⏳ Export à venir</span>
            </div>
          </div>

          <div className="mt-timeline">
            {items.length === 0 ? (
              <div className="mt-empty big">Ajoute des clips depuis la bibliothèque pour construire le montage.</div>
            ) : items.map((it, idx) => (
              <div className="mt-item" key={(it.client_action_id || 'x') + idx}>
                <span className="mt-num">{idx + 1}</span>
                <div className="mt-item-body">
                  <b>{it.title || it._label || 'Clip'}</b>
                  <small>{it._sub || ''}</small>
                  <input className="mt-note" value={it.note ?? ''} placeholder="Note sur ce clip…" onChange={(e) => setItemNote(idx, e.target.value)} />
                </div>
                <div className="mt-item-ctrl">
                  <button disabled={idx === 0} onClick={() => moveItem(idx, -1)} title="Monter">▲</button>
                  <button disabled={idx === items.length - 1} onClick={() => moveItem(idx, 1)} title="Descendre">▼</button>
                  <button className="rm" onClick={() => removeItem(idx)} title="Retirer">✕</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-foot">
            <button className="mt-btn" disabled title="Bientôt : génération vidéo">🎞 Exporter la vidéo (à venir)</button>
          </div>
        </section>
      </div>

      {toast && <div className="mt-toast">{toast}</div>}

      <style>{`
        .mt-root { --b:#6b1a2c; --g:#d4a24c; --ink:#1e1a17; --mute:#8a7b73; --border:#e9ddd2; --panel:#fff; --bg:#faf6f1;
          background: var(--bg); min-height: 100%; padding: 22px; color: var(--ink); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
        .mt-root * { box-sizing: border-box; }
        .mt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
        .mt-kicker { font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: var(--g); }
        .mt-head h1 { margin: 2px 0 4px; font-size: 24px; color: var(--b); }
        .mt-sub { margin: 0; font-size: 13px; color: var(--mute); max-width: 620px; }
        .mt-head-actions { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
        .mt-teamsel { display: grid; gap: 3px; font-size: 11px; font-weight: 800; color: var(--mute); }
        .mt-teamsel select { border: 1px solid var(--border); border-radius: 9px; padding: 8px 10px; font: inherit; background: #fff; min-width: 170px; }
        .mt-btn { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 9px 14px; font-weight: 800; font-size: 13px; cursor: pointer; }
        .mt-btn.primary { background: var(--b); color: #fff; border-color: var(--b); }
        .mt-btn:disabled { opacity: .5; cursor: not-allowed; }
        .mt-body { display: grid; grid-template-columns: 360px 1fr; gap: 16px; align-items: start; }
        .mt-lib, .mt-build { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
        .mt-lib-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .mt-lib-head h3, .mt-build h3 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--mute); }
        .mt-filters { display: flex; gap: 4px; }
        .mt-fil { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 800; cursor: pointer; color: var(--mute); }
        .mt-fil.on { background: var(--b); color: #fff; border-color: var(--b); }
        .mt-lib-list { display: flex; flex-direction: column; gap: 5px; max-height: 560px; overflow-y: auto; }
        .mt-clip { display: grid; grid-template-columns: 10px 1fr 30px; gap: 8px; align-items: center; border: 1px solid var(--border); border-radius: 9px; padding: 7px 9px; background: #fffdfb; }
        .mt-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mute); }
        .mt-dot.made { background: #2e9e5b; } .mt-dot.miss { background: #c0392b; }
        .mt-clip-body { min-width: 0; display: flex; flex-direction: column; }
        .mt-clip-body b { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mt-clip-body small { font-size: 11px; color: var(--mute); }
        .mt-add { border: 1px solid var(--g); color: var(--b); background: #fff; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 900; height: 28px; }
        .mt-empty { color: var(--mute); font-size: 13px; padding: 24px; text-align: center; }
        .mt-empty.big { border: 1px dashed var(--border); border-radius: 10px; }
        .mt-meta { display: grid; gap: 10px; margin-bottom: 12px; }
        .mt-f { display: grid; gap: 3px; font-size: 11px; font-weight: 800; color: var(--mute); text-transform: uppercase; letter-spacing: .03em; }
        .mt-f input, .mt-f textarea { border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; font: inherit; font-size: 14px; background: #fff; }
        .mt-f textarea { min-height: 64px; resize: vertical; }
        .mt-status { display: flex; gap: 8px; }
        .mt-badge { font-size: 12px; font-weight: 800; border-radius: 999px; padding: 4px 12px; background: rgba(212,162,76,.14); color: var(--b); }
        .mt-badge.pending { background: #f1eae0; color: var(--mute); }
        .mt-timeline { display: flex; flex-direction: column; gap: 7px; }
        .mt-item { display: grid; grid-template-columns: 26px 1fr auto; gap: 10px; align-items: center; border: 1px solid var(--border); border-radius: 10px; padding: 9px 11px; background: #fffdfb; }
        .mt-num { width: 24px; height: 24px; border-radius: 50%; background: var(--b); color: #fff; font-weight: 900; font-size: 12px; display: grid; place-items: center; }
        .mt-item-body { min-width: 0; display: grid; gap: 3px; }
        .mt-item-body b { font-size: 13px; }
        .mt-item-body small { font-size: 11px; color: var(--mute); }
        .mt-note { border: 1px solid var(--border); border-radius: 7px; padding: 5px 8px; font: inherit; font-size: 12px; margin-top: 2px; }
        .mt-item-ctrl { display: flex; gap: 4px; }
        .mt-item-ctrl button { border: 1px solid var(--border); background: #fff; border-radius: 6px; cursor: pointer; font-size: 11px; width: 26px; height: 26px; }
        .mt-item-ctrl button:disabled { opacity: .35; cursor: not-allowed; }
        .mt-item-ctrl .rm { color: #c0392b; border-color: #ecc; }
        .mt-foot { margin-top: 12px; display: flex; justify-content: flex-end; }
        .mt-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 10px 18px; border-radius: 10px; font-size: 13px; font-weight: 700; z-index: 100; }
        @media (max-width: 900px) { .mt-body { grid-template-columns: 1fr; } .mt-lib-list { max-height: 320px; } }
      `}</style>
    </div>
  );
}
