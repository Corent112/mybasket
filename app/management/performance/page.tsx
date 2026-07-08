'use client';

/** Onglet "Performances" — bilan V/D/N, taux de victoire, points, différentiel, historique récent. */

import { useMemo } from 'react';
import { useMgmt, teamRecord, pct, type Match } from '../../../lib/management';

export default function PerformancesPage() {
  const { team, matches } = useMgmt();
  const rec = useMemo(() => teamRecord(matches), [matches]);
  if (!team) return <div className="mg-empty">Aucune équipe.</div>;
  const winRate = pct(rec.w, rec.gp);
  const recent = [...matches].filter((m) => m.type === 'match').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  return (
    <>
      <div className="mg-steps"><span><b>Marche à suivre :</b> le bilan se calcule automatiquement à partir des matchs saisis. Plus tu saisis de matchs, plus les indicateurs sont fiables.</span></div>
      <div className="mg-bar"><h2>Performances <small>saison en cours</small></h2></div>
      <div className="mg-cards">
        <div className="mg-card"><div className="mg-card-l">Victoires</div><div className="mg-card-v" style={{ color: 'var(--green)' }}>{rec.w}</div></div>
        <div className="mg-card"><div className="mg-card-l">Défaites</div><div className="mg-card-v" style={{ color: 'var(--red)' }}>{rec.l}</div></div>
        <div className="mg-card"><div className="mg-card-l">Nuls</div><div className="mg-card-v">{rec.d}</div></div>
        <div className="mg-card"><div className="mg-card-l">Taux de victoire</div><div className="mg-card-v">{winRate}%</div></div>
      </div>
      <div className="mg-cards" style={{ marginTop: 12 }}>
        <div className="mg-card"><div className="mg-card-l">Points marqués</div><div className="mg-card-v" style={{ color: 'var(--bordeaux)' }}>{rec.pf}</div></div>
        <div className="mg-card"><div className="mg-card-l">Points encaissés</div><div className="mg-card-v" style={{ color: 'var(--red)' }}>{rec.pa}</div></div>
        <div className="mg-card"><div className="mg-card-l">Différentiel</div><div className="mg-card-v" style={{ color: rec.pf - rec.pa >= 0 ? 'var(--green)' : 'var(--red)' }}>{rec.pf - rec.pa >= 0 ? '+' : ''}{rec.pf - rec.pa}</div></div>
        <div className="mg-card"><div className="mg-card-l">Pts / match</div><div className="mg-card-v">{rec.gp ? (rec.pf / rec.gp).toFixed(1) : 0}</div></div>
      </div>
      <h3 style={{ margin: '18px 0 8px', fontSize: 15 }}>Historique récent</h3>
      <div className="mg-form-line">
        {recent.map((m: Match) => { const w = m.scoreUs > m.scoreThem, d = m.scoreUs === m.scoreThem; return <span key={m.id} className={`mg-pill ${w ? 'w' : d ? 'd' : 'l'}`}>{w ? 'V' : d ? 'N' : 'D'} {m.scoreUs}-{m.scoreThem}</span>; })}
        {recent.length === 0 && <span className="mg-empty">Aucun match enregistré.</span>}
      </div>
    </>
  );
}