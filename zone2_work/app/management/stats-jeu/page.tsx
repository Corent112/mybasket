'use client';

/** Onglet "Stats jeu" — efficacité par catégorie de jeu (transition, jeu placé, pick & roll…). */

import { useMemo, useState } from 'react';
import { useMgmt, downloadCsv, uid, pct, type SJCat, type SJEntry } from '../../../lib/management';

export default function StatsJeuPage() {
  const { team, statsjeu, setStatsJeu, flash } = useMgmt();
  const [showEntry, setShowEntry] = useState(false);
  const cats = statsjeu.categories, entries = statsjeu.entries;

  const agg = useMemo(() => cats.map((c) => {
    let played = 0, success = 0, points = 0, bp = 0, reboff = 0, rebdef = 0;
    entries.forEach((e) => { const r = e.rows[c.id]; if (r) { played += r.played; success += r.success; points += r.points; bp += r.bp; reboff += r.reboff; rebdef += r.rebdef; } });
    return { c, played, success, points, bp, reboff, rebdef, rate: pct(success, played), ppc: played ? +(points / played).toFixed(2) : 0 };
  }), [cats, entries]);
  const possessions = entries.reduce((s, e) => s + (e.possessions || 0), 0);

  if (!team) return <div className="mg-empty">Aucune équipe.</div>;

  const addCat = () => { const label = prompt('Nom de la catégorie de jeu ?'); if (!label) return; setStatsJeu({ ...statsjeu, categories: [...cats, { id: uid(), label }] }); flash('Catégorie ajoutée'); };
  const delCat = (id: string) => setStatsJeu({ ...statsjeu, categories: cats.filter((c) => c.id !== id), entries: entries.map((e) => { const rows = { ...e.rows }; delete rows[id]; return { ...e, rows }; }) });
  const delEntry = (id: string) => setStatsJeu({ ...statsjeu, entries: entries.filter((e) => e.id !== id) });
  const exportCsv = () => downloadCsv(`stats-jeu-${team.name}.csv`, [['Catégorie', 'Nb joué', 'Réussite%', 'Points', 'Pts/coup', 'BP', 'Reb off', 'Reb déf'], ...agg.map((a) => [a.c.label, a.played, a.rate + '%', a.points, a.ppc, a.bp, a.reboff, a.rebdef])]);

  return (
    <>
      <div className="mg-steps"><span><b>Marche à suivre :</b> 1. ajuste tes <b>catégories de jeu</b> (+ Catégorie) → 2. <b>+ Saisir un match</b> et renseigne, par catégorie, le nombre de séquences jouées / réussies / points… → 3. le tableau agrège l'efficacité (Pts/coup) et les possessions.</span></div>
      <div className="mg-bar"><h2>Stats jeu <small>efficacité par système</small></h2>
        <div className="mg-actions"><button className="mg-btn primary" onClick={() => setShowEntry(true)}>+ Saisir un match</button><button className="mg-btn" onClick={addCat}>+ Catégorie</button><button className="mg-btn" onClick={exportCsv}>📥 Export CSV</button></div></div>

      <div className="mg-cards"><div className="mg-card"><div className="mg-card-l">Possessions cumulées</div><div className="mg-card-v">{possessions}</div></div><div className="mg-card"><div className="mg-card-l">Saisies</div><div className="mg-card-v">{entries.length}</div></div><div className="mg-card"><div className="mg-card-l">Points (systèmes)</div><div className="mg-card-v">{agg.reduce((s, a) => s + a.points, 0)}</div></div></div>

      <div className="mg-tablewrap" style={{ marginTop: 14 }}><table className="mg-table"><thead><tr><th className="l">Catégorie</th><th>Nb joué</th><th>Réussite</th><th>Points</th><th>Pts/coup</th><th>BP</th><th>Reb off</th><th>Reb déf</th><th></th></tr></thead>
        <tbody>{agg.map((a) => <tr key={a.c.id}><td className="l">{a.c.label}</td><td>{a.played}</td><td>{a.rate}%</td><td><b>{a.points}</b></td><td>{a.ppc}</td><td>{a.bp}</td><td>{a.reboff}</td><td>{a.rebdef}</td><td>{a.c.deletable !== false && <button className="mg-x" title="Supprimer la catégorie" onClick={() => delCat(a.c.id)}>🗑</button>}</td></tr>)}
          {agg.length === 0 && <tr><td className="l" colSpan={9}>Aucune catégorie.</td></tr>}</tbody></table></div>

      <h3 style={{ margin: '20px 0 10px', fontSize: 15 }}>📜 Historique des saisies ({entries.length})</h3>
      <div className="mg-list">
        {[...entries].sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => <div className="mg-row" key={e.id}><div className="mg-row-l"><b>{e.date}</b><span className="mg-vs">vs {e.opponent || '—'} · {e.possessions} poss.</span></div><button className="mg-x" onClick={() => delEntry(e.id)}>🗑</button></div>)}
        {entries.length === 0 && <div className="mg-empty">Aucune saisie. Clique sur « + Saisir un match ».</div>}
      </div>

      {showEntry && <EntryForm cats={cats} onClose={() => setShowEntry(false)} onSave={(en) => { setStatsJeu({ ...statsjeu, entries: [...entries, en] }); setShowEntry(false); flash('Saisie enregistrée'); }} />}
    </>
  );
}

function EntryForm({ cats, onClose, onSave }: { cats: SJCat[]; onClose: () => void; onSave: (e: SJEntry) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [opponent, setOpponent] = useState('');
  const [possessions, setPossessions] = useState(0);
  const [rows, setRows] = useState<Record<string, any>>(() => Object.fromEntries(cats.map((c) => [c.id, { played: 0, success: 0, points: 0, bp: 0, reboff: 0, rebdef: 0 }])));
  const set = (cid: string, f: string, v: any) => setRows((r) => ({ ...r, [cid]: { ...r[cid], [f]: Math.max(0, Number(v) || 0) } }));
  const fields: [string, string][] = [['played', 'Nb joué'], ['success', 'Réussite'], ['points', 'Points'], ['bp', 'BP'], ['reboff', 'Reb off'], ['rebdef', 'Reb déf']];
  return (
    <div className="mg-modal" onClick={onClose}><div className="mg-modal-card" onClick={(e) => e.stopPropagation()}>
      <div className="mg-modal-head"><h3>Saisir un match (stats jeu)</h3><button className="mg-x" onClick={onClose}>✕</button></div>
      <div className="mg-modal-body">
        <div className="mg-form"><label><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label><span>Adversaire</span><input value={opponent} onChange={(e) => setOpponent(e.target.value)} /></label><label><span>Possessions</span><input type="number" value={possessions} onChange={(e) => setPossessions(Math.max(0, Number(e.target.value) || 0))} /></label></div>
        <div className="mg-tablewrap"><table className="mg-table mg-input"><thead><tr><th className="l">Catégorie</th>{fields.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
          <tbody>{cats.map((c) => <tr key={c.id}><td className="l">{c.label}</td>{fields.map(([k]) => <td key={k}><input className="mg-num" type="number" value={rows[c.id]?.[k] ?? 0} onChange={(e) => set(c.id, k, e.target.value)} /></td>)}</tr>)}</tbody></table></div>
      </div>
      <div className="mg-modal-foot"><button className="mg-btn" onClick={onClose}>Annuler</button><button className="mg-btn primary" onClick={() => onSave({ id: uid(), date, opponent, possessions, rows })}>Enregistrer</button></div>
    </div></div>
  );
}