'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type LinkedMontage = {
  id: string;
  title: string;
  date: string;
  matchId?: string | null;
  clips: number;
  source: 'montages' | 'legacy';
};

export default function PlayerMontages({ teamId, playerId, showEmpty = false }: { teamId: string; playerId: string; showEmpty?: boolean }) {
  const supabase = createClient();
  const [montages, setMontages] = useState<LinkedMontage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError('');

      const current = await supabase
        .from('montages')
        .select('id, title, created_at, updated_at, match_id, player_id, team_id')
        .eq('player_id', playerId)
        .order('updated_at', { ascending: false });

      let rows: LinkedMontage[] = [];
      if (!current.error) {
        rows = (current.data ?? [])
          .filter((m: any) => !m.team_id || String(m.team_id) === String(teamId))
          .map((m: any) => ({
            id: String(m.id),
            title: String(m.title || 'Montage sans titre'),
            date: String(m.updated_at || m.created_at || ''),
            matchId: m.match_id ? String(m.match_id) : null,
            clips: 0,
            source: 'montages' as const,
          }));
      }

      // Compatibilité avec les anciens montages stockés dans project_state.
      if (rows.length === 0) {
        const { data: acts } = await supabase
          .from('match_actions')
          .select('client_action_id')
          .eq('player_id', playerId);
        const playerCaids = new Set((acts ?? []).map((a: any) => String(a.client_action_id)).filter(Boolean));
        const legacy = await supabase
          .from('match_stats')
          .select('id, opponent, match_date, project_state, project_status')
          .eq('team_id', teamId)
          .order('match_date', { ascending: false });

        if (!legacy.error) {
          rows = (legacy.data ?? []).flatMap((m: any) => {
            const state = (m.project_state ?? {}) as Record<string, any>;
            const items = Array.isArray(state.montageItems) ? state.montageItems : [];
            const clips = items.filter((it: any) => it?.caid && playerCaids.has(String(it.caid))).length;
            if (!clips) return [];
            return [{
              id: `legacy-${m.id}`,
              title: String(state.montageTitle || `Montage vs ${m.opponent ?? 'Adversaire'}`),
              date: String(m.match_date ?? ''),
              matchId: String(m.id),
              clips,
              source: 'legacy' as const,
            }];
          });
        } else if (current.error) {
          setError(current.error.message || legacy.error.message || 'Impossible de charger les montages.');
        }
      }

      if (alive) {
        setMontages(rows);
        setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [teamId, playerId]);

  if (loading) return <div className="pm-state">Chargement des montages…</div>;
  if (error) return <div className="pm-state pm-error">{error}</div>;
  if (montages.length === 0) return showEmpty ? <div className="pm-state">Aucun montage assigné à ce joueur.</div> : null;

  return (
    <div className="pm-grid">
      {montages.map((m) => {
        const href = m.source === 'montages'
          ? `/management/montage?montage=${encodeURIComponent(m.id)}`
          : `/management/live?project=${encodeURIComponent(m.matchId || '')}&mode=montage`;
        return (
          <a key={m.id} className="pm-card" href={href}>
            <span className="pm-icon">🎬</span>
            <span className="pm-body">
              <b>{m.title}</b>
              <small>{m.date ? new Date(m.date).toLocaleDateString('fr-FR') : 'Date non renseignée'}</small>
              {m.clips > 0 && <em>{m.clips} clip{m.clips > 1 ? 's' : ''} de ce joueur</em>}
            </span>
            <span className="pm-open">Ouvrir →</span>
          </a>
        );
      })}
      <style>{`
        .pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
        .pm-card{display:flex;align-items:center;gap:12px;min-height:86px;padding:14px;border:1px solid #eadfe2;border-radius:16px;background:#fff;color:inherit;text-decoration:none;box-shadow:0 10px 26px -22px rgba(107,26,44,.65);transition:.18s ease}
        .pm-card:hover{transform:translateY(-2px);border-color:#d4a24c;box-shadow:0 14px 30px -20px rgba(107,26,44,.55)}
        .pm-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:13px;background:#f8f0e5;font-size:21px;flex:0 0 auto}
        .pm-body{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.pm-body b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#2d2528}.pm-body small{color:#8d8085}.pm-body em{font-style:normal;font-size:12px;font-weight:700;color:#6b1a2c}
        .pm-open{font-size:12px;font-weight:800;color:#6b1a2c;white-space:nowrap}.pm-state{padding:28px;border:1px dashed #d9cdd1;border-radius:15px;text-align:center;color:#766b6f;background:#fff}.pm-error{color:#a5222d;background:#fff7f7}
      `}</style>
    </div>
  );
}
