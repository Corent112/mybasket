'use client';

/** Onglet "Temps de jeu" — répartition des minutes (réelles depuis les matchs + planifiées depuis la rotation). */

import { useMemo } from 'react';
import { useMgmt, aggregate, Av } from '../../../lib/management';

export default function TempsPage() {
  const { team, matches, rotation } = useMgmt();
  const rows = useMemo(() => aggregate(matches, team?.players || []), [matches, team]);
  if (!team) return <div className="mg-empty">Aucune équipe.</div>;

  // minutes planifiées via la rotation (par QT : durée × présence du joueur dans le 5)
  const planned: Record<string, number> = {};
  team.players.forEach((p) => (planned[p.id] = 0));
  [0, 1, 2, 3].forEach((qt) => { const slots = rotation.grid[qt] || []; const dur = rotation.durations[qt] || 0; slots.forEach((id) => { if (id && planned[id] != null) planned[id] += dur; }); });

  const maxReal = Math.max(1, ...rows.map((r) => r.minAvg));
  const maxPlan = Math.max(1, ...Object.values(planned));

  return (
    <>
      <div className="mg-steps"><span><b>Marche à suivre :</b> les minutes <b>réelles</b> proviennent des matchs saisis (moyenne) ; les minutes <b>planifiées</b> proviennent de l'onglet 🔄 Rotation. Compare pour équilibrer ton temps de jeu.</span></div>
      <div className="mg-bar"><h2>Temps de jeu <small>réel (moy. match) vs planifié (rotation)</small></h2></div>

      <h3 style={{ fontSize: 14, margin: '6px 0 8px', color: 'var(--bordeaux)' }}>Minutes moyennes en match</h3>
      <div className="mg-time">
        {[...rows].sort((a, b) => b.minAvg - a.minAvg).map((r) => (
          <div className="mg-timerow" key={r.p.id}><span className="nm"><Av p={r.p} /> #{r.p.num} {r.p.name}</span><div className="mg-bar2"><i style={{ width: `${(r.minAvg / maxReal) * 100}%` }} /></div><b>{r.minAvg}'</b></div>
        ))}
        {rows.length === 0 && <div className="mg-empty">Aucun match saisi.</div>}
      </div>

      <h3 style={{ fontSize: 14, margin: '20px 0 8px', color: 'var(--bordeaux)' }}>Minutes planifiées (rotation)</h3>
      <div className="mg-time">
        {team.players.slice().sort((a, b) => (planned[b.id] || 0) - (planned[a.id] || 0)).map((p) => (
          <div className="mg-timerow" key={p.id}><span className="nm"><Av p={p} /> #{p.num} {p.name}</span><div className="mg-bar2"><i style={{ width: `${(planned[p.id] / maxPlan) * 100}%` }} /></div><b>{planned[p.id]}'</b></div>
        ))}
      </div>
    </>
  );
}