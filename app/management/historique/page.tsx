'use client';

/** Onglet "Historique des matchs" — liste V/N/D, suppression. */

import { useMgmt } from '../../../lib/management';

export default function HistoriquePage() {
  const { team, matches, setMatches } = useMgmt();
  if (!team) return <div className="mg-empty">Aucune équipe.</div>;
  const sorted = [...matches].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <>
      <div className="mg-steps"><span><b>Marche à suivre :</b> les matchs saisis (onglet Stats joueurs ou prise de stats LIVE) apparaissent ici. Clique sur ✕ pour en supprimer un.</span></div>
      <div className="mg-bar"><h2>Historique des matchs <small>{sorted.filter((m) => m.type === 'match').length} match(s)</small></h2></div>
      <div className="mg-list">
        {sorted.map((m) => { const w = m.scoreUs > m.scoreThem, d = m.scoreUs === m.scoreThem; return (
          <div className="mg-row" key={m.id}>
            <div className="mg-row-l"><span className={`mg-tag ${m.type === 'match' ? 'match' : 'train'}`}>{m.type === 'match' ? 'Match' : 'Entraînement'}</span><b>{m.date}</b><span className="mg-vs">{m.home ? 'vs' : '@'} {m.opponent || '—'}</span></div>
            {m.type === 'match' && <span className={`mg-score ${w ? 'w' : d ? 'd' : 'l'}`}>{m.scoreUs} - {m.scoreThem} <i>{w ? 'V' : d ? 'N' : 'D'}</i></span>}
            <button className="mg-x" onClick={() => setMatches(matches.filter((x) => x.id !== m.id))} title="Supprimer">✕</button>
          </div>
        ); })}
        {sorted.length === 0 && <div className="mg-empty">Aucun match enregistré.</div>}
      </div>
    </>
  );
}