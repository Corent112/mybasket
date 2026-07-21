'use client';

/* ============================================================================
 * LiveProjectsHistory (§11) — Management → Historique
 * ----------------------------------------------------------------------------
 * Deux sections : « Projets en cours » (draft) et « Matchs terminés » (completed).
 * Source unique : listProjects() / deleteProject() de lib/stats-supabase.
 * Aucune nouvelle table, aucune logique de projet dupliquée. La reprise /
 * l'analyse / le montage sont délégués à la Prise de stats via l'URL
 * /management/live?project=<id>&mode=<resume|analysis|montage>.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMgmt } from '../../lib/management';
import { listProjects, deleteProject, type LiveProjectSummary } from '../../lib/stats-supabase';

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export default function LiveProjectsHistory() {
  const { teams, teamId } = useMgmt();
  const router = useRouter();

  const [drafts, setDrafts] = useState<LiveProjectSummary[]>([]);
  const [completed, setCompleted] = useState<LiveProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Filtres.
  const [fTeam, setFTeam] = useState<string>(teamId || 'all');
  const [fStatus, setFStatus] = useState<'all' | 'draft' | 'completed'>('all');
  const [fDate, setFDate] = useState('');
  const [fOpponent, setFOpponent] = useState('');
  const [fPlaybook, setFPlaybook] = useState('');
  const [fSearch, setFSearch] = useState('');

  const teamName = useCallback((id: string) => teams.find((t) => t.id === id)?.name ?? '', [teams]);

  const load = useCallback(async () => {
    const ids = fTeam === 'all' ? teams.map((t) => t.id).filter(isUuid) : (isUuid(fTeam) ? [fTeam] : []);
    if (!ids.length) { setDrafts([]); setCompleted([]); return; }
    setLoading(true);
    try {
      const all = await Promise.all(ids.flatMap((id) => [
        listProjects({ teamId: id, status: 'draft' }),
        listProjects({ teamId: id, status: 'completed' }),
      ]));
      const flat = all.flat();
      setDrafts(flat.filter((p) => p.projectStatus === 'draft'));
      setCompleted(flat.filter((p) => p.projectStatus === 'completed'));
    } finally {
      setLoading(false);
    }
  }, [fTeam, teams]);

  useEffect(() => { load(); }, [load]);

  const applyFilters = useCallback((list: LiveProjectSummary[]) => {
    return list.filter((p) => {
      if (fDate && !p.date.startsWith(fDate)) return false;
      if (fOpponent && !p.opponent.toLowerCase().includes(fOpponent.toLowerCase())) return false;
      if (fPlaybook && !(p.playbookName ?? '').toLowerCase().includes(fPlaybook.toLowerCase())) return false;
      if (fSearch) {
        const hay = `${p.opponent} ${p.date} ${teamName(p.teamId)} ${p.playbookName ?? ''}`.toLowerCase();
        if (!hay.includes(fSearch.toLowerCase())) return false;
      }
      return true;
    });
  }, [fDate, fOpponent, fPlaybook, fSearch, teamName]);

  const shownDrafts = useMemo(() => (fStatus === 'completed' ? [] : applyFilters(drafts)), [fStatus, drafts, applyFilters]);
  const shownCompleted = useMemo(() => (fStatus === 'draft' ? [] : applyFilters(completed)), [fStatus, completed, applyFilters]);

  const open = (id: string, mode: 'resume' | 'analysis' | 'montage', tab?: 'history' | 'players') => {
    const params = new URLSearchParams({ project: id, mode });
    if (tab) params.set('tab', tab);
    router.push(`/management/live?${params.toString()}`);
  };

  const remove = async (p: LiveProjectSummary) => {
    const msg = p.projectStatus === 'draft'
      ? 'Supprimer définitivement le projet ?'
      : 'Supprimer ce match et toutes ses actions ?';
    if (!window.confirm(msg)) return;
    setBusy(p.id);
    const res = await deleteProject(p.id);
    setBusy(null);
    if (res.ok) load();
    else window.alert('Suppression impossible : ' + (res.error ?? ''));
  };

  const fmtDate = (d: string) => d || '—';
  const resultTag = (r: string | null) => r === 'V' ? 'V' : r === 'D' ? 'D' : r === 'N' ? 'N' : '';

  return (
    <div className="lph">
      {/* Filtres */}
      <div className="lph-filters">
        <select value={fTeam} onChange={(e) => setFTeam(e.target.value)}>
          <option value="all">Toutes les équipes</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as any)}>
          <option value="all">Tous les statuts</option>
          <option value="draft">En cours</option>
          <option value="completed">Terminés</option>
        </select>
        <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
        <input placeholder="Adversaire" value={fOpponent} onChange={(e) => setFOpponent(e.target.value)} />
        <input placeholder="Playbook" value={fPlaybook} onChange={(e) => setFPlaybook(e.target.value)} />
        <input placeholder="Recherche…" value={fSearch} onChange={(e) => setFSearch(e.target.value)} />
        <button className="lph-refresh" onClick={load} disabled={loading}>{loading ? '…' : '↻'}</button>
      </div>

      {/* Projets en cours */}
      <section className="lph-sec">
        <h3>⏸ Projets en cours <small>{shownDrafts.length}</small></h3>
        {shownDrafts.length === 0 ? (
          <div className="lph-empty">Aucun projet en cours.</div>
        ) : (
          <div className="lph-grid">
            {shownDrafts.map((p) => (
              <div className="lph-card draft" key={p.id}>
                <div className="lph-card-h">
                  <b>{teamName(p.teamId) || p.teamName || 'Équipe'} <span className="lph-vs">vs {p.opponent}</span></b>
                  <span className="lph-badge draft">Brouillon</span>
                </div>
                <div className="lph-meta">
                  <span>📅 {fmtDate(p.date)}</span>
                  <span>🏀 {p.us}-{p.them}</span>
                  <span>⏱ {p.quarter != null ? `Q${p.quarter}` : '—'} {p.clock ?? ''}</span>
                  <span>🎬 {p.actionsCount} action{p.actionsCount > 1 ? 's' : ''}</span>
                  {p.playbookName && <span>📖 {p.playbookName}</span>}
                  {p.updatedAt && <span className="lph-upd">modifié {new Date(p.updatedAt).toLocaleString('fr-FR')}</span>}
                </div>
                <div className="lph-actions">
                  <button className="lph-primary" onClick={() => open(p.id, 'resume')}>▶ Reprendre le codage</button>
                  <button onClick={() => open(p.id, 'analysis')}>📊 Analyse</button>
                  <button onClick={() => open(p.id, 'montage')}>🎬 Montage</button>
                  <button className="lph-del" disabled={busy === p.id} onClick={() => remove(p)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Matchs terminés */}
      <section className="lph-sec">
        <h3>✅ Matchs terminés <small>{shownCompleted.length}</small></h3>
        {shownCompleted.length === 0 ? (
          <div className="lph-empty">Aucun match terminé.</div>
        ) : (
          <div className="lph-grid">
            {shownCompleted.map((p) => (
              <div className="lph-card done" key={p.id}>
                <div className="lph-card-h">
                  <b>{teamName(p.teamId) || p.teamName || 'Équipe'} <span className="lph-vs">vs {p.opponent}</span></b>
                  <span className={`lph-badge ${p.result === 'V' ? 'win' : p.result === 'D' ? 'loss' : 'draw'}`}>{resultTag(p.result)}</span>
                </div>
                <div className="lph-meta">
                  <span>📅 {fmtDate(p.date)}</span>
                  <span>🏀 {p.us}-{p.them}</span>
                  <span>🎬 {p.actionsCount} action{p.actionsCount > 1 ? 's' : ''}</span>
                  {p.playbookName && <span>📖 {p.playbookName}</span>}
                </div>
                <div className="lph-actions">
                  <button className="lph-primary" onClick={() => open(p.id, 'analysis', 'history')}>▶ Revoir le projet</button>
                  <button onClick={() => open(p.id, 'analysis', 'players')}>📊 Boxscore</button>
                  <button onClick={() => open(p.id, 'montage')}>🎬 Montage</button>
                  <button className="lph-del" disabled={busy === p.id} onClick={() => remove(p)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <style>{`
        .lph { display: flex; flex-direction: column; gap: 18px; }
        .lph-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .lph-filters select, .lph-filters input { border: 1px solid #e3d9dd; background: #fff; color: #2b2b2b; border-radius: 10px; padding: 8px 10px; font: inherit; font-size: 13px; }
        .lph-filters input { min-width: 120px; }
        .lph-refresh { border: 1px solid #e3d9dd; background: #fff; border-radius: 10px; padding: 8px 12px; cursor: pointer; font-weight: 800; }
        .lph-sec h3 { font-size: 15px; color: #6B1A2C; margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }
        .lph-sec h3 small { font-weight: 700; color: #9a8f93; font-size: 12px; }
        .lph-empty { color: #9a8f93; font-size: 13px; padding: 14px; background: #faf7f8; border: 1px dashed #e3d9dd; border-radius: 12px; }
        .lph-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
        .lph-card { border: 1px solid #ece3e6; border-radius: 16px; background: #fff; padding: 14px; box-shadow: 0 6px 20px -14px rgba(107,26,44,.4); display: flex; flex-direction: column; gap: 10px; }
        .lph-card.draft { border-left: 4px solid #D4A24C; }
        .lph-card.done { border-left: 4px solid #6B1A2C; }
        .lph-card-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .lph-card-h b { font-size: 14px; color: #2b2b2b; }
        .lph-vs { color: #6B1A2C; font-weight: 800; }
        .lph-badge { font-size: 11px; font-weight: 900; border-radius: 999px; padding: 3px 9px; }
        .lph-badge.draft { background: rgba(212,162,76,.16); color: #a9772a; }
        .lph-badge.win { background: rgba(34,160,90,.16); color: #1c7c46; }
        .lph-badge.loss { background: rgba(210,55,60,.14); color: #b3272c; }
        .lph-badge.draw { background: #efeaec; color: #6b5f63; }
        .lph-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: #6b5f63; }
        .lph-upd { width: 100%; color: #9a8f93; font-size: 11px; }
        .lph-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
        .lph-actions button { border: 1px solid #e3d9dd; background: #faf7f8; color: #2b2b2b; border-radius: 9px; padding: 7px 10px; font-size: 12px; font-weight: 800; cursor: pointer; }
        .lph-actions .lph-primary { background: #6B1A2C; color: #fff; border-color: #6B1A2C; }
        .lph-actions .lph-del { color: #b3272c; margin-left: auto; }
        .lph-actions button:disabled { opacity: .5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
