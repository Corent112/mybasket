'use client';

/* ============================================================================
 * TeamLiveStatsBlock (§14, §16, §17) — Fiche équipe → Stats (analyse LiveStat)
 * ----------------------------------------------------------------------------
 * Source unique : match_actions (matchs terminés de l'équipe). Trois vues, toutes
 * cliquables via ActionClipsModal :
 *   - Matrice attaque/défense × systèmes/temps forts (§14) ;
 *   - Shot Charts attaque + défense côte à côte (§16) ;
 *   - Tableau des temps forts (§17).
 * Filtres cumulables sans reload (§13, subset). Design MyBasket clair.
 * N'écrit rien : lecture seule.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLivestatTags } from '@/lib/livestat-tags';
import ShotChart from '@/components/prise-stats-pro/ShotChart';
import ActionClipsModal, { type ClipAction } from '@/components/prise-stats-pro/ActionClipsModal';
import { type VideoSyncState, NATIVE_SYNC, normalizeSync } from '@/lib/video-sync';

type Row = Record<string, any>;

// Miroir des temps forts (ids underscore de PriseStatsPro), tolérant aux tirets.
const TF_ORDER = ['pick_side', 'pick_top', 'pick_non_porteur', 'one_vs_one', 'hand_off', 'drive_kick', 'jeu_sans_ballon', 'rebond_offensif'];
const normTf = (k: string | null | undefined) => String(k ?? '').replace(/-/g, '_');

// Convertit une ligne match_actions (SQL) en objet exploitable + ClipAction.
function toAction(row: Row, matchInfo: Map<string, { date: string; opponent: string; home: boolean; result: string }>): ClipAction & Row {
  const mi = matchInfo.get(String(row.match_id));
  return {
    id: row.client_action_id ?? row.id ?? undefined,
    matchId: row.match_id ?? null,
    matchLabel: mi ? `vs ${mi.opponent}` : null,
    date: mi?.date ?? null,
    opponent: mi?.opponent ?? null,
    q: Number(row.quarter ?? 0),
    clock: String(row.clock ?? ''),
    context: row.context ?? undefined,
    playbookId: row.playbook_id ?? null,
    systemeSlot: row.systeme_slot ?? null,
    systemeId: row.systeme_id ?? null,
    systemeName: row.systeme_name ?? null,
    tempsFort: row.temps_fort ?? null,
    playerId: row.player_id ?? null,
    opponentPlayerId: row.opponent_player_id ?? null,
    opponentPlayerName: row.opponent_player_name ?? null,
    opponentPlayerNumber: row.opponent_player_number ?? null,
    actionType: row.action_type ?? null,
    shotType: row.shot_type ?? null,
    shotResult: row.shot_result ?? null,
    zone: row.shot_zone_id ?? null,
    courtX: row.court_x ?? null,
    courtY: row.court_y ?? null,
    clipStart: row.clip_start ?? null,
    clipEnd: row.clip_end ?? null,
    videoTime: row.video_time ?? null,
    possessionStart: row.possession_start ?? null,
    possessionEnd: row.possession_end ?? null,
    // champs bruts conservés pour les calculs
    match_id: row.match_id,
    context_raw: row.context,
    result: mi?.result ?? '',        // V / N / D du match (filtre §13)
    ftMade: Number(row.ft_made ?? 0), // LF réussis (points PPP)
  };
}

const ptsOfShot = (a: Row): number => {
  // Tir réussi : 2 ou 3 points selon le type.
  if (a.actionType === 'tir' && a.shotResult === 'made') {
    return a.shotType === '3PTS' ? 3 : a.shotType === '2PTS' ? 2 : 0;
  }
  // Lancers francs : chaque LF réussi vaut 1 point (LF codé en action séparée).
  if (a.shotType === 'LF') return Number(a.ftMade ?? 0);
  return 0;
};

export default function TeamLiveStatsBlock({ teamId }: { teamId: string }) {
  const supabase = createClient();
  const tags = useLivestatTags(teamId);

  const [actions, setActions] = useState<(ClipAction & Row)[]>([]);
  const [loading, setLoading] = useState(true);
  const [videoByMatch, setVideoByMatch] = useState<Map<string, string>>(new Map());
  const [syncByMatch, setSyncByMatch] = useState<Map<string, VideoSyncState>>(new Map());

  // Vue courante.
  const [side, setSide] = useState<'attaque' | 'defense'>('attaque');
  const [axis, setAxis] = useState<'systemes' | 'temps'>('systemes');

  // Filtres.
  const [fOpponent, setFOpponent] = useState('');
  const [fResult, setFResult] = useState<'all' | 'V' | 'N' | 'D'>('all');
  const [fShotType, setFShotType] = useState<'all' | '2PTS' | '3PTS'>('all');

  // Popup clips.
  const [clip, setClip] = useState<{ title: string; items: (ClipAction & Row)[] } | null>(null);
  const [clipVideoUrl, setClipVideoUrl] = useState<string | null>(null);
  const [clipSync, setClipSync] = useState<VideoSyncState>(NATIVE_SYNC);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      // 1) matchs terminés de l'équipe (exclut les brouillons).
      const { data: matchData } = await supabase
        .from('match_stats')
        .select('id, opponent, match_date, us_score, them_score, result, home, project_status, video_url, video_sync_mode, video_sync_offset, video_sync_rate')
        .eq('team_id', teamId)
        .or('project_status.is.null,project_status.eq.completed')
        .order('match_date', { ascending: false });

      const matches = (matchData ?? []) as Row[];
      const matchInfo = new Map<string, { date: string; opponent: string; home: boolean; result: string }>();
      const vids = new Map<string, string>();
      const syncs = new Map<string, VideoSyncState>();
      matches.forEach((m) => {
        matchInfo.set(String(m.id), {
          date: String(m.match_date ?? ''),
          opponent: String(m.opponent ?? 'Adversaire'),
          home: m.home ?? true,
          result: String(m.result ?? ''),
        });
        if (m.video_url) vids.set(String(m.id), String(m.video_url));
        syncs.set(String(m.id), normalizeSync(m));
      });

      const matchIds = matches.map((m) => String(m.id));
      if (!matchIds.length) { if (alive) { setActions([]); setVideoByMatch(vids); setSyncByMatch(syncs); setLoading(false); } return; }

      // 2) actions complètes.
      const { data: actionData } = await supabase
        .from('match_actions')
        .select('*')
        .in('match_id', matchIds);

      if (!alive) return;
      const mapped = ((actionData ?? []) as Row[]).map((r) => toAction(r, matchInfo));
      setActions(mapped);
      setVideoByMatch(vids);
      setSyncByMatch(syncs);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  // Application des filtres (résultat via matchInfo indisponible ici → on filtre
  // adversaire + type de tir, le résultat se filtre sur le libellé du match).
  const filtered = useMemo(() => {
    return actions.filter((a) => {
      if (fOpponent && !String(a.opponent ?? '').toLowerCase().includes(fOpponent.toLowerCase())) return false;
      if (fShotType !== 'all' && a.shotType !== fShotType) return false;
      if (fResult !== 'all' && String(a.result ?? '') !== fResult) return false;
      return true;
    });
  }, [actions, fOpponent, fShotType, fResult]);

  const sideActions = useMemo(() => filtered.filter((a) => a.context === side), [filtered, side]);

  // Lignes de la matrice, par système OU par temps fort.
  const rows = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; list: (ClipAction & Row)[] }>();
    sideActions.forEach((a) => {
      let key: string; let label: string;
      if (axis === 'systemes') {
        key = String(a.systemeSlot ?? a.systemeName ?? '—');
        label = String(a.systemeName ?? a.systemeSlot ?? '—');
      } else {
        const tf = normTf(a.tempsFort);
        if (!tf) return;
        key = tf; label = tags.label(a.tempsFort ?? '') || tf;
      }
      if (!groups.has(key)) groups.set(key, { key, label, list: [] });
      groups.get(key)!.list.push(a);
    });
    return Array.from(groups.values()).map((g) => {
      const made = g.list.filter((a) => a.actionType === 'tir' && a.shotResult === 'made').length;
      const missed = g.list.filter((a) => a.actionType === 'tir' && a.shotResult === 'missed').length;
      const lost = g.list.filter((a) => side === 'attaque' ? a.actionType === 'perte' : a.actionType === 'perte-adverse').length;
      const fouls = g.list.filter((a) => side === 'attaque' ? a.actionType === 'faute-provoquee' : a.actionType === 'faute-commise').length;
      const points = g.list.reduce((s, a) => s + ptsOfShot(a), 0);
      const poss = g.list.length;
      const shots = made + missed;
      return { ...g, made, missed, lost, fouls, points, poss, pct: shots ? Math.round((made / shots) * 100) : 0, ppp: poss ? points / poss : 0 };
    }).filter((r) => r.poss > 0).sort((a, b) => b.ppp - a.ppp);
  }, [sideActions, axis, side, tags]);

  // Tirs pour la shot chart d'un côté donné.
  const shotsFor = useCallback((s: 'attaque' | 'defense') =>
    filtered.filter((a) => a.context === s && a.actionType === 'tir'), [filtered]);

  const openClips = (title: string, items: (ClipAction & Row)[]) => {
    if (!items.length) return;
    const mid = items[0].match_id ? String(items[0].match_id) : '';
    setClipVideoUrl(videoByMatch.get(mid) ?? null);
    setClipSync(syncByMatch.get(mid) ?? NATIVE_SYNC);
    setClip({ title, items });
  };

  if (loading) return <div className="tls-loading">Chargement des statistiques LiveStat…</div>;

  const SideAxis = (
    <div className="tls-switch">
      <div className="tls-seg">
        <button className={side === 'attaque' ? 'on' : ''} onClick={() => setSide('attaque')}>Attaque</button>
        <button className={side === 'defense' ? 'on' : ''} onClick={() => setSide('defense')}>Défense</button>
      </div>
      <div className="tls-seg">
        <button className={axis === 'systemes' ? 'on' : ''} onClick={() => setAxis('systemes')}>Systèmes</button>
        <button className={axis === 'temps' ? 'on' : ''} onClick={() => setAxis('temps')}>Temps forts</button>
      </div>
    </div>
  );

  return (
    <div className="tls">
      <h3 className="tls-h">📊 Analyse LiveStat</h3>

      {/* Filtres */}
      <div className="tls-filters">
        <input placeholder="Adversaire" value={fOpponent} onChange={(e) => setFOpponent(e.target.value)} />
        <select value={fResult} onChange={(e) => setFResult(e.target.value as any)}>
          <option value="all">Tous résultats</option>
          <option value="V">Victoires</option>
          <option value="N">Nuls</option>
          <option value="D">Défaites</option>
        </select>
        <select value={fShotType} onChange={(e) => setFShotType(e.target.value as any)}>
          <option value="all">Tous tirs</option>
          <option value="2PTS">2 points</option>
          <option value="3PTS">3 points</option>
        </select>
      </div>

      {actions.length === 0 ? (
        <div className="tls-empty">Aucune action LiveStat pour cette équipe. Termine un match codé en Prise de stats pour alimenter cette analyse.</div>
      ) : (
        <>
          {/* §14 · Matrice cliquable */}
          <section className="tls-sec">
            <div className="tls-sec-h"><b>Matrice {side === 'attaque' ? 'offensive' : 'défensive'}</b>{SideAxis}</div>
            {rows.length === 0 ? (
              <div className="tls-empty">Aucune possession {side} rattachée à {axis === 'systemes' ? 'un système' : 'un temps fort'}.</div>
            ) : (
              <div className="tls-tablewrap">
                <table className="tls-table">
                  <thead>
                    <tr>
                      <th className="l">{axis === 'systemes' ? 'Système' : 'Temps fort'}</th>
                      <th>Poss.</th><th>{side === 'attaque' ? 'Marqué' : 'Encaissé'}</th><th>Raté</th>
                      <th>{side === 'attaque' ? 'BP' : 'BP adv.'}</th><th>{side === 'attaque' ? 'Faute prov.' : 'Faute com.'}</th>
                      <th>%</th><th>Points</th><th>PPP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td className="l click" onClick={() => openClips(`${side} · ${r.label}`, r.list)}>{r.label}</td>
                        <td>{r.poss}</td>
                        <td><button className="cell ok" onClick={() => openClips(`${r.label} · marqués`, r.list.filter((a) => a.actionType === 'tir' && a.shotResult === 'made'))}>{r.made}</button></td>
                        <td><button className="cell ko" onClick={() => openClips(`${r.label} · ratés`, r.list.filter((a) => a.actionType === 'tir' && a.shotResult === 'missed'))}>{r.missed}</button></td>
                        <td>{r.lost}</td>
                        <td>{r.fouls}</td>
                        <td>{r.pct}%</td><td>{r.points}</td>
                        <td><b style={{ color: r.ppp >= 1 ? '#1c7c46' : r.ppp >= 0.8 ? '#a9772a' : '#b3272c' }}>{r.ppp.toFixed(2)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* §16 · Shot Charts attaque + défense côte à côte */}
          <section className="tls-sec">
            <div className="tls-sec-h"><b>Shot Charts</b></div>
            <div className="tls-charts">
              <div className="tls-chart">
                <div className="tls-chart-t">Attaque</div>
                {shotsFor('attaque').length === 0 ? <div className="tls-empty">Aucun tir attaque localisé.</div> :
                  <ShotChart mode="analysis" size="md" showStats showDots shots={shotsFor('attaque')}
                    onShotClick={(s: any) => openClips('Tir attaque', [s as ClipAction & Row])}
                    onZoneClick={(z: string) => openClips(`Zone ${z} · attaque`, shotsFor('attaque').filter((a) => (a.zone ?? '') === z))} />}
              </div>
              <div className="tls-chart">
                <div className="tls-chart-t">Défense (tirs concédés)</div>
                {shotsFor('defense').length === 0 ? <div className="tls-empty">Aucun tir concédé localisé.</div> :
                  <ShotChart mode="analysis" size="md" showStats showDots shots={shotsFor('defense')}
                    onShotClick={(s: any) => openClips('Tir concédé', [s as ClipAction & Row])}
                    onZoneClick={(z: string) => openClips(`Zone ${z} · défense`, shotsFor('defense').filter((a) => (a.zone ?? '') === z))} />}
              </div>
            </div>
          </section>

          {/* §17 · Tableau des temps forts */}
          <section className="tls-sec">
            <div className="tls-sec-h"><b>Temps forts {side === 'attaque' ? 'offensifs' : 'défensifs'}</b></div>
            <div className="tls-tablewrap">
              <table className="tls-table">
                <thead><tr><th className="l">Temps fort</th><th>Poss.</th><th>Points</th><th>PPP</th><th>Réussis</th><th>Tentés</th><th>%</th><th>BP</th><th>Fautes prov.</th></tr></thead>
                <tbody>
                  {TF_ORDER.map((tf) => {
                    const list = sideActions.filter((a) => normTf(a.tempsFort) === tf);
                    if (!list.length) return null;
                    const made = list.filter((a) => a.actionType === 'tir' && a.shotResult === 'made').length;
                    const missed = list.filter((a) => a.actionType === 'tir' && a.shotResult === 'missed').length;
                    const lost = list.filter((a) => side === 'attaque' ? a.actionType === 'perte' : a.actionType === 'perte-adverse').length;
                    const fouls = list.filter((a) => side === 'attaque' ? a.actionType === 'faute-provoquee' : a.actionType === 'faute-commise').length;
                    const points = list.reduce((s, a) => s + ptsOfShot(a), 0);
                    const shots = made + missed;
                    return (
                      <tr key={tf}>
                        <td className="l click" onClick={() => openClips(`${side} · ${tags.label(tf) || tf}`, list)}>{tags.emoji(tf)} {tags.label(tf) || tf}</td>
                        <td>{list.length}</td><td>{points}</td>
                        <td><b style={{ color: (list.length ? points / list.length : 0) >= 1 ? '#1c7c46' : '#a9772a' }}>{(list.length ? points / list.length : 0).toFixed(2)}</b></td>
                        <td>{made}</td><td>{shots}</td><td>{shots ? Math.round((made / shots) * 100) : 0}%</td>
                        <td>{lost}</td><td>{fouls}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <ActionClipsModal
        open={!!clip}
        actions={(clip?.items ?? []) as ClipAction[]}
        title={clip?.title ?? ''}
        videoUrl={clipVideoUrl}
        sync={clipSync}
        onClose={() => setClip(null)}
        tempsFortLabel={(id: string | null | undefined) => tags.label(id ?? '') || undefined}
      />

      <style>{`
        .tls { margin-top: 22px; display: flex; flex-direction: column; gap: 16px; }
        .tls-h { font-size: 16px; color: #6B1A2C; margin: 0; }
        .tls-loading, .tls-empty { color: #9a8f93; font-size: 13px; padding: 14px; background: #faf7f8; border: 1px dashed #e3d9dd; border-radius: 12px; }
        .tls-filters { display: flex; flex-wrap: wrap; gap: 8px; }
        .tls-filters input, .tls-filters select { border: 1px solid #e3d9dd; background: #fff; border-radius: 10px; padding: 8px 10px; font: inherit; font-size: 13px; }
        .tls-sec { background: #fff; border: 1px solid #ece3e6; border-radius: 16px; padding: 14px; box-shadow: 0 6px 20px -16px rgba(107,26,44,.4); }
        .tls-sec-h { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .tls-sec-h b { color: #6B1A2C; font-size: 14px; }
        .tls-switch { display: flex; gap: 8px; }
        .tls-seg { display: inline-flex; border: 1px solid #e3d9dd; border-radius: 9px; overflow: hidden; }
        .tls-seg button { border: none; background: #fff; color: #6b5f63; padding: 6px 12px; font-size: 12px; font-weight: 800; cursor: pointer; }
        .tls-seg button.on { background: #6B1A2C; color: #fff; }
        .tls-tablewrap { overflow-x: auto; }
        .tls-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 560px; }
        .tls-table th, .tls-table td { padding: 7px 9px; text-align: center; border-bottom: 1px solid #f0e9eb; }
        .tls-table th.l, .tls-table td.l { text-align: left; }
        .tls-table th { color: #9a8f93; font-size: 11px; text-transform: uppercase; }
        .tls-table td.click { cursor: pointer; color: #6B1A2C; font-weight: 800; }
        .tls-table td.click:hover { text-decoration: underline; }
        .tls-table .cell { border: none; background: transparent; font: inherit; font-weight: 800; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
        .tls-table .cell.ok { color: #1c7c46; } .tls-table .cell.ko { color: #b3272c; }
        .tls-table .cell:hover { background: #faf7f8; }
        .tls-charts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .tls-chart-t { font-size: 12px; font-weight: 800; color: #6b5f63; margin-bottom: 6px; text-align: center; }
        @media (max-width: 720px) { .tls-charts { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}