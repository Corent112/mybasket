'use client';

/* ============================================================================
 * PlaybookProfitability (§15 + §24) — Playbook → onglet Rentabilité
 * ----------------------------------------------------------------------------
 * Tableau des systèmes du playbook avec leurs stats agrégées, calculées depuis
 * match_actions (filtré par playbook_id). Le nom affiché vient du systeme_name
 * réel (playbook), pas du slot brut. Chaque ligne est cliquable → clips.
 * Colonnes : Nom, Catégorie, Matchs utilisés, Possessions, Points, PPP,
 * Tirs marqués/tentés, %, Pertes, Fautes provoquées. Lecture seule.
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PlaybookSystem } from '@/lib/playbook';
import ActionClipsModal, { type ClipAction } from '@/components/prise-stats-pro/ActionClipsModal';
import { type VideoSyncState, NATIVE_SYNC, normalizeSync } from '@/lib/video-sync';

type Row = Record<string, any>;
type MatchInfo = { date: string; opponent: string; video: string; sync: VideoSyncState };

function toClip(row: Row, mi: Map<string, MatchInfo>): ClipAction & Row {
  const m = mi.get(String(row.match_id));
  return {
    id: row.client_action_id ?? row.id ?? undefined,
    matchId: row.match_id ?? null,
    matchLabel: m ? `vs ${m.opponent}` : null,
    date: m?.date ?? null,
    opponent: m?.opponent ?? null,
    q: Number(row.quarter ?? 0),
    clock: String(row.clock ?? ''),
    context: row.context ?? undefined,
    systemeSlot: row.systeme_slot ?? null,
    systemeId: row.systeme_id ?? null,
    systemeName: row.systeme_name ?? null,
    tempsFort: row.temps_fort ?? null,
    playerId: row.player_id ?? null,
    actionType: row.action_type ?? null,
    shotType: row.shot_type ?? null,
    shotResult: row.shot_result ?? null,
    zone: row.shot_zone_id ?? null,
    clipStart: row.clip_start ?? null,
    clipEnd: row.clip_end ?? null,
    videoTime: row.video_time ?? null,
    possessionStart: row.possession_start ?? null,
    possessionEnd: row.possession_end ?? null,
    match_id: row.match_id,
  };
}

const shotPts = (a: Row): number => {
  if (a.action_type === 'tir' && a.shot_result === 'made') return a.shot_type === '3PTS' ? 3 : a.shot_type === '2PTS' ? 2 : 0;
  if (a.shot_type === 'LF') return Number(a.ft_made ?? 0);
  return 0;
};

export default function PlaybookProfitability({ playbookId, systems }: { playbookId: string; systems: PlaybookSystem[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [videoByMatch, setVideoByMatch] = useState<Map<string, MatchInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [clip, setClip] = useState<{ title: string; items: (ClipAction & Row)[]; videoUrl: string | null; sync: VideoSyncState } | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const { data: acts } = await supabase
        .from('match_actions')
        .select('*')
        .eq('playbook_id', playbookId);
      const list = (acts ?? []) as Row[];

      const matchIds = Array.from(new Set(list.map((a) => String(a.match_id ?? '')).filter(Boolean)));
      const mi = new Map<string, MatchInfo>();
      if (matchIds.length) {
        const { data: matches } = await supabase
          .from('match_stats')
          .select('id, opponent, match_date, video_url, video_sync_mode, video_sync_offset, video_sync_rate')
          .in('id', matchIds);
        (matches ?? []).forEach((m: any) => mi.set(String(m.id), {
          date: String(m.match_date ?? ''), opponent: String(m.opponent ?? 'Adversaire'), video: String(m.video_url ?? ''),
          sync: normalizeSync(m),
        }));
      }
      if (!alive) return;
      setRows(list);
      setVideoByMatch(mi);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookId]);

  // Agrégation par système : clé = systeme_id (réel), sinon systeme_slot.
  const stats = useMemo(() => {
    const byId = new Map<string, Row[]>();
    rows.forEach((a) => {
      const key = String(a.systeme_id ?? a.systeme_slot ?? '');
      if (!key) return;
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key)!.push(a);
    });
    // On liste les systèmes du playbook + tout système présent dans les actions.
    const known = new Map(systems.map((s) => [s.id, s]));
    const result = Array.from(byId.entries()).map(([key, list]) => {
      const sys = known.get(key);
      const name = sys?.title ?? list[0]?.systeme_name ?? list[0]?.systeme_slot ?? key;
      const category = sys?.category ?? '—';
      const matchesUsed = new Set(list.map((a) => String(a.match_id))).size;
      const made = list.filter((a) => a.action_type === 'tir' && a.shot_result === 'made').length;
      const missed = list.filter((a) => a.action_type === 'tir' && a.shot_result === 'missed').length;
      const lost = list.filter((a) => a.action_type === 'perte').length;
      const fouls = list.filter((a) => a.action_type === 'faute-provoquee').length;
      const points = list.reduce((s, a) => s + shotPts(a), 0);
      const poss = list.length;
      const shots = made + missed;
      return { key, name, category, list, matchesUsed, made, missed, lost, fouls, points, poss,
        pct: shots ? Math.round((made / shots) * 100) : 0, ppp: poss ? points / poss : 0 };
    }).filter((r) => r.poss > 0).sort((a, b) => b.ppp - a.ppp);
    return result;
  }, [rows, systems]);

  const openClips = (title: string, list: Row[]) => {
    if (!list.length) return;
    const mid = String(list[0].match_id ?? '');
    const clips = list.map((r) => toClip(r, videoByMatch));
    setClip({ title, items: clips, videoUrl: videoByMatch.get(mid)?.video || null, sync: videoByMatch.get(mid)?.sync ?? NATIVE_SYNC });
  };

  if (loading) return <div className="pbp-empty">Chargement de la rentabilité…</div>;
  if (stats.length === 0) return <div className="pbp-empty">Aucune donnée de match pour ce playbook. Associe ce playbook à un match dans la Prise de stats, puis code des possessions sur ses systèmes.</div>;

  return (
    <div className="pbp">
      <div className="pbp-tablewrap">
        <table className="pbp-table">
          <thead>
            <tr>
              <th className="l">Système</th><th>Catégorie</th><th>Matchs</th><th>Poss.</th>
              <th>Points</th><th>PPP</th><th>Marqués</th><th>Tentés</th><th>%</th><th>Pertes</th><th>Fautes prov.</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((r) => (
              <tr key={r.key}>
                <td className="l click" onClick={() => openClips(r.name, r.list)}>{r.name}</td>
                <td>{r.category}</td>
                <td>{r.matchesUsed}</td>
                <td>{r.poss}</td>
                <td>{r.points}</td>
                <td><b style={{ color: r.ppp >= 1 ? '#1c7c46' : r.ppp >= 0.8 ? '#a9772a' : '#b3272c' }}>{r.ppp.toFixed(2)}</b></td>
                <td><button className="cell ok" onClick={() => openClips(`${r.name} · marqués`, r.list.filter((a) => a.action_type === 'tir' && a.shot_result === 'made'))}>{r.made}</button></td>
                <td>{r.made + r.missed}</td>
                <td>{r.pct}%</td>
                <td>{r.lost}</td>
                <td>{r.fouls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ActionClipsModal
        open={!!clip}
        actions={(clip?.items ?? []) as ClipAction[]}
        title={clip?.title ?? ''}
        videoUrl={clip?.videoUrl ?? null}
        sync={clip?.sync ?? NATIVE_SYNC}
        onClose={() => setClip(null)}
      />

      <style>{`
        .pbp { margin-top: 8px; }
        .pbp-empty { color: #9a8f93; font-size: 13px; padding: 16px; background: #faf7f8; border: 1px dashed #e3d9dd; border-radius: 12px; }
        .pbp-tablewrap { overflow-x: auto; }
        .pbp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 720px; }
        .pbp-table th, .pbp-table td { padding: 8px 10px; text-align: center; border-bottom: 1px solid #f0e9eb; }
        .pbp-table th.l, .pbp-table td.l { text-align: left; }
        .pbp-table th { color: #9a8f93; font-size: 11px; text-transform: uppercase; }
        .pbp-table td.click { cursor: pointer; color: #6B1A2C; font-weight: 800; }
        .pbp-table td.click:hover { text-decoration: underline; }
        .pbp-table .cell { border: none; background: transparent; font: inherit; font-weight: 800; cursor: pointer; color: #1c7c46; padding: 2px 6px; border-radius: 6px; }
        .pbp-table .cell:hover { background: #faf7f8; }
      `}</style>
    </div>
  );
}