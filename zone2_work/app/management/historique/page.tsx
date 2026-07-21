'use client';

/** Management → Historique (§11) : projets LiveStat en cours / terminés,
 *  plus l'ancien récap V/N/D conservé en dessous. */

import LiveProjectsHistory from '../../../components/management/LiveProjectsHistory';
import { useMgmt } from '../../../lib/management';

export default function HistoriquePage() {
  const { team, matches, setMatches } = useMgmt();

  const sorted = [...matches].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <div className="mg-steps"><span><b>Projets LiveStat :</b> reprends un match en cours, ouvre-le en analyse ou en montage, ou consulte les matchs terminés.</span></div>

      {/* §11 · Projets en cours / Matchs terminés */}
      <LiveProjectsHistory />

      {/* Ancien récap conservé */}
      {team && (
        <>
          <div className="mg-bar" style={{ marginTop: 22 }}><h2>Récapitulatif V/N/D <small>{sorted.filter((m) => m.type === 'match').length} match(s)</small></h2></div>
          <div className="mg-list">
            {sorted.map((m) => { const w = m.scoreUs > m.scoreThem, d = m.scoreUs === m.scoreThem; return (
              <div className="mg-row" key={m.id}>
                <div className="mg-row-l"><span className={`mg-tag ${m.type === 'match' ? 'match' : 'train'}`}>{m.type === 'match' ? 'Match' : 'Entraînement'}</span><b>{m.date}</b><span className="mg-vs">{m.home ? 'vs' : '@'} {m.opponent || '—'}</span></div>
                {m.type === 'match' && <span className={`mg-score ${w ? 'w' : d ? 'd' : 'l'}`}>{m.scoreUs} - {m.scoreThem} <i>{w ? 'V' : d ? 'N' : 'D'}</i></span>}
                <button className="mg-x" onClick={() => setMatches(matches.filter((x) => x.id !== m.id))} title="Supprimer">✕</button>
              </div>
            ); })}
            {sorted.length === 0 && <div className="mg-empty">Aucun match dans le récap.</div>}
          </div>
        </>
      )}
    </>
  );
}