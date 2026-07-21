'use client';

/* ============================================================================
 * GlobalActionSearch (§26) — Recherche globale dans toutes les actions codées
 * ----------------------------------------------------------------------------
 * Cherche à travers match_actions de TOUS les matchs des équipes de l'utilisateur.
 * Filtres cumulables sans reload : équipe, adversaire, système, temps fort,
 * joueur, type d'action, résultat, contexte. Résultats cliquables → clips.
 * Lecture seule.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMgmt } from '@/lib/management';
import { useLivestatTags } from '@/lib/livestat-tags';
import ActionClipsModal, { type ClipAction } from '@/components/prise-stats-pro/ActionClipsModal';
import { type VideoSyncState, NATIVE_SYNC, normalizeSync } from '@/lib/video-sync';

type Row = Record<string, any>;
type MatchInfo = { date: string; opponent: string; teamId: string; video: string; sync: VideoSyncState };

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export default function GlobalActionSearch() {
  const supabase = createClient();
  const { teams, teamId } = useMgmt();
  const tags = useLivestatTags(teamId);

  const [rows, setRows] = useState<Row[]>([]);
  const [matchInfo, setMatchInfo] = useState<Map<string, MatchInfo>>(new Map());
  const [playerNames, setPlayerNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  // Filtres.
  const [fTeam, setFTeam] = useState('all');
  const [fOpponent, setFOpponent] = useState('');
  const [fContext, setFContext] = useState<'all' | 'attaque' | 'defense'>('all');
  const [fType, setFType] = useState('all');
  const [fResult, setFResult] = useState<'all' | 'made' | 'missed'>('all');
  const [fText, setFText] = useState('');

  const [clip, setClip] = useState<{ title: string; items: (ClipAction & Row)[]; videoUrl: string | null; sync: VideoSyncState } | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const teamIds = teams.map((t: any) => t.id).filter(isUuid);
      if (!teamIds.length) { if (alive) { setRows([]); setLoading(false); } return; }

      const { data: matches } = await supabase
        .from('match_stats')
        .select('id, team_id, opponent, match_date, video_url, project_status, video_sync_mode, video_sync_offset, video_sync_rate')
        .in('team_id', teamIds);

      const mi = new Map<string, MatchInfo>();
      (matches ?? []).forEach((m: any) => mi.set(String(m.id), {
        date: String(m.match_date ?? ''), opponent: String(m.opponent ?? 'Adversaire'),
        teamId: String(m.team_id ?? ''), video: String(m.video_url ?? ''),
        sync: normalizeSync(m),
      }));
      const matchIds = Array.from(mi.keys());
      if (!matchIds.length) { if (alive) { setRows([]); setMatchInfo(mi); setLoading(false); } return; }

      const { data: acts } = await supabase
        .from('match_actions')
        .select('*')
        .in('match_id', matchIds);

      // Noms des joueurs (toutes équipes).
      const names = new Map<string, string>();
      teams.forEach((t: any) => (t.players ?? []).forEach((p: any) => names.set(String(p.id), `#${p.num ?? ''} ${p.name ?? ''}`.trim())));

      if (!alive) return;
      setRows((acts ?? []) as Row[]);
      setMatchInfo(mi);
      setPlayerNames(names);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  const typeOptions = useMemo(() => Array.from(new Set(rows.map((r) => String(r.action_type ?? '')).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const mi = matchInfo.get(String(r.match_id));
      if (fTeam !== 'all' && mi?.teamId !== fTeam) return false;
      if (fOpponent && !String(mi?.opponent ?? '').toLowerCase().includes(fOpponent.toLowerCase())) return false;
      if (fContext !== 'all' && r.context !== fContext) return false;
      if (fType !== 'all' && r.action_type !== fType) return false;
      if (fResult !== 'all' && r.shot_result !== fResult) return false;
      if (fText) {
        const hay = `${r.systeme_name ?? ''} ${r.systeme_slot ?? ''} ${r.temps_fort ?? ''} ${playerNames.get(String(r.player_id)) ?? ''} ${mi?.opponent ?? ''}`.toLowerCase();
        if (!hay.includes(fText.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, matchInfo, playerNames, fTeam, fOpponent, fContext, fType, fResult, fText]);

  const toClip = useCallback((r: Row): ClipAction & Row => {
    const mi = matchInfo.get(String(r.match_id));
    return {
      id: r.client_action_id ?? r.id ?? undefined,
      matchId: r.match_id ?? null,
      matchLabel: mi ? `vs ${mi.opponent}` : null,
      date: mi?.date ?? null,
      opponent: mi?.opponent ?? null,
      q: Number(r.quarter ?? 0),
      clock: String(r.clock ?? ''),
      context: r.context ?? undefined,
      systemeName: r.systeme_name ?? null,
      systemeSlot: r.systeme_slot ?? null,
      tempsFort: r.temps_fort ?? null,
      playerId: r.player_id ?? null,
      actionType: r.action_type ?? null,
      shotType: r.shot_type ?? null,
      shotResult: r.shot_result ?? null,
      zone: r.shot_zone_id ?? null,
      clipStart: r.clip_start ?? null,
      clipEnd: r.clip_end ?? null,
      videoTime: r.video_time ?? null,
      possessionStart: r.possession_start ?? null,
      possessionEnd: r.possession_end ?? null,
      match_id: r.match_id,
    };
  }, [matchInfo]);

  const openResults = () => {
    if (!filtered.length) return;
    const items = filtered.map(toClip);
    const mid = String(filtered[0].match_id ?? '');
    setClip({ title: `Recherche · ${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`, items, videoUrl: matchInfo.get(mid)?.video || null, sync: matchInfo.get(mid)?.sync ?? NATIVE_SYNC });
  };

  const openOne = (r: Row) => {
    const mid = String(r.match_id ?? '');
    setClip({ title: 'Séquence', items: [toClip(r)], videoUrl: matchInfo.get(mid)?.video || null, sync: matchInfo.get(mid)?.sync ?? NATIVE_SYNC });
  };

  return (
    <div className="gas">
      <div className="gas-filters">
        <select value={fTeam} onChange={(e) => setFTeam(e.target.value)}>
          <option value="all">Toutes équipes</option>
          {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input placeholder="Adversaire" value={fOpponent} onChange={(e) => setFOpponent(e.target.value)} />
        <select value={fContext} onChange={(e) => setFContext(e.target.value as any)}>
          <option value="all">Attaque + Défense</option>
          <option value="attaque">Attaque</option>
          <option value="defense">Défense</option>
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="all">Tous types</option>
          {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fResult} onChange={(e) => setFResult(e.target.value as any)}>
          <option value="all">Tous résultats</option>
          <option value="made">Marqué</option>
          <option value="missed">Raté</option>
        </select>
        <input placeholder="Système, joueur, temps fort…" value={fText} onChange={(e) => setFText(e.target.value)} />
      </div>

      <div className="gas-bar">
        <b>{loading ? 'Recherche…' : `${filtered.length} action${filtered.length > 1 ? 's' : ''}`}</b>
        <button className="gas-play" disabled={!filtered.length} onClick={openResults}>▶ Lire tous les clips</button>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="gas-tablewrap">
          <table className="gas-table">
            <thead><tr><th className="l">Match</th><th>QT</th><th>Chrono</th><th>Contexte</th><th>Système</th><th>Temps fort</th><th>Joueur</th><th>Action</th><th>Résultat</th><th></th></tr></thead>
            <tbody>
              {filtered.slice(0, 300).map((r, i) => {
                const mi = matchInfo.get(String(r.match_id));
                return (
                  <tr key={r.client_action_id ?? r.id ?? i}>
                    <td className="l">{mi ? `${mi.date} vs ${mi.opponent}` : '—'}</td>
                    <td>{r.quarter ? `Q${r.quarter}` : '—'}</td>
                    <td>{r.clock ?? ''}</td>
                    <td>{r.context === 'defense' ? 'Déf.' : r.context === 'attaque' ? 'Att.' : ''}</td>
                    <td>{r.systeme_name ?? r.systeme_slot ?? ''}</td>
                    <td>{tags.label(r.temps_fort ?? '') || r.temps_fort || ''}</td>
                    <td>{playerNames.get(String(r.player_id)) ?? (r.opponent_player_name ? `#${r.opponent_player_number ?? ''} ${r.opponent_player_name}` : '')}</td>
                    <td>{r.action_type ?? ''}</td>
                    <td>{r.shot_result === 'made' ? '✓' : r.shot_result === 'missed' ? '✗' : ''}</td>
                    <td><button className="gas-cam" onClick={() => openOne(r)}>🎥</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 300 && <div className="gas-more">300 premiers résultats affichés — affine les filtres.</div>}
        </div>
      )}

      {!loading && filtered.length === 0 && <div className="gas-empty">Aucune action ne correspond à ces filtres.</div>}

      <ActionClipsModal
        open={!!clip}
        actions={(clip?.items ?? []) as ClipAction[]}
        title={clip?.title ?? ''}
        videoUrl={clip?.videoUrl ?? null}
        sync={clip?.sync ?? NATIVE_SYNC}
        onClose={() => setClip(null)}
        tempsFortLabel={(id: string | null | undefined) => tags.label(id ?? '') || undefined}
        playerName={(id: string | null | undefined) => playerNames.get(String(id ?? '')) || undefined}
      />

      <style>{`
        .gas { display: flex; flex-direction: column; gap: 12px; }
        .gas-filters { display: flex; flex-wrap: wrap; gap: 8px; }
        .gas-filters select, .gas-filters input { border: 1px solid #e3d9dd; background: #fff; border-radius: 10px; padding: 8px 10px; font: inherit; font-size: 13px; }
        .gas-filters input { min-width: 160px; }
        .gas-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .gas-bar b { color: #6B1A2C; font-size: 14px; }
        .gas-play { border: 1px solid #6B1A2C; background: #6B1A2C; color: #fff; border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: 800; cursor: pointer; }
        .gas-play:disabled { opacity: .4; cursor: not-allowed; }
        .gas-tablewrap { overflow-x: auto; border: 1px solid #ece3e6; border-radius: 14px; }
        .gas-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 780px; }
        .gas-table th, .gas-table td { padding: 8px 10px; text-align: center; border-bottom: 1px solid #f0e9eb; }
        .gas-table th.l, .gas-table td.l { text-align: left; }
        .gas-table th { color: #9a8f93; font-size: 11px; text-transform: uppercase; background: #faf7f8; }
        .gas-cam { border: 1px solid #e3d9dd; background: #fff; border-radius: 8px; padding: 4px 9px; cursor: pointer; }
        .gas-more, .gas-empty { color: #9a8f93; font-size: 12.5px; padding: 12px; text-align: center; }
        .gas-empty { background: #faf7f8; border: 1px dashed #e3d9dd; border-radius: 12px; }
      `}</style>
    </div>
  );
}