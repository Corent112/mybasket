'use client';

/** Onglet "Stats joueurs" — moyennes + saisie de match + modèle/import/export CSV + historique. */

import { useMemo, useState } from 'react';
import { useMgmt, aggregate, Av, PTS, emptyLine, downloadCsv, uid, type Line, type Match, type Team } from '../../lib/management';

export default function StatsJoueursPage() {
  const { team, matches, setMatches, flash } = useMgmt();
  const [showMatch, setShowMatch] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const rows = useMemo(() => aggregate(matches, team?.players || []), [matches, team]);
  if (!team) return <div className="mg-empty">Aucune équipe. Crée une équipe dans « Mes équipes ».</div>;

  const gp = matches.filter((m) => m.type === 'match').length;

  const exportStats = () => {
    downloadCsv(`stats-${team.name}.csv`, [
      ['Joueur', 'MJ', 'Min', 'Pts', 'Reb', 'PD', 'Int', 'Ct', 'BP', '2PT%', '3PT%', 'LF%'],
      ...rows.map((r) => [`#${r.p.num} ${r.p.name}`, r.gp, r.minAvg, r.ptsAvg, r.rebAvg, r.astAvg, r.stlAvg, r.blkAvg, r.toAvg, r.fg2 + '%', r.fg3 + '%', r.ft + '%']),
    ]); flash('Stats exportées');
  };
  const modeleCsv = () => {
    downloadCsv(`modele-saisie-${team.name}.csv`, [
      ['num', 'joueur', 'min', '2pts_marques', '2pts_tentes', '3pts_marques', '3pts_tentes', 'lf_marques', 'lf_tentes', 'rebonds', 'passes_d', 'interceptions', 'contres', 'balles_perdues', 'fautes'],
      ...team.players.map((p) => [p.num, p.name, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ]); flash('Modèle CSV téléchargé');
  };
  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        const body = lines.slice(1);
        const newLines: Line[] = team.players.map((p) => {
          const row = body.find((r) => { const c = r.split(/[;,]/); return String(c[0]).trim() === String(p.num) || (c[1] || '').trim().toLowerCase() === p.name.toLowerCase(); });
          const l = emptyLine(p.id);
          if (row) { const c = row.split(/[;,]/).map((x) => Number(x) || 0); [l.min, l.p2m, l.p2a, l.p3m, l.p3a, l.ftm, l.fta, l.reb, l.ast, l.stl, l.blk, l.to, l.pf] = [c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12], c[13], c[14]]; }
          return l;
        });
        const scoreUs = newLines.reduce((s, l) => s + PTS(l), 0);
        setMatches([...matches, { id: uid(), date: new Date().toISOString().slice(0, 10), type: 'match', opponent: 'Import CSV', home: true, scoreUs, scoreThem: 0, lines: newLines }]);
        flash('Match importé depuis le CSV');
      } catch { flash('CSV illisible'); }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="mg-steps"><span><b>Marche à suivre :</b> 1. <b>+ Saisir un match</b> (ou importe un CSV rempli) → 2. les moyennes se mettent à jour → 3. <b>Exporter</b> ou consulter l'<b>historique</b>. Tu peux aussi saisir en direct via l'onglet 🔴 Stats Live.</span></div>
      <div className="mg-bar">
        <h2>Stats joueurs <small>moyennes sur {gp} match(s)</small></h2>
        <div className="mg-actions">
          <button className="mg-btn primary" onClick={() => setShowMatch(true)}>+ Saisir un match</button>
          <button className="mg-btn" onClick={modeleCsv} title="Télécharger un fichier à remplir">📥 Modèle CSV</button>
          <label className="mg-btn" title="Importer un fichier rempli">📤 Importer CSV<input type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} /></label>
          <button className="mg-btn" onClick={exportStats}>📊 Exporter stats</button>
          <button className="mg-btn" onClick={() => setShowHist(true)}>📜 Historique</button>
          <button className="mg-btn danger" onClick={() => { if (confirm('Effacer tous les matchs saisis ?')) { setMatches([]); flash('Stats réinitialisées'); } }}>Réinitialiser</button>
        </div>
      </div>
      <div className="mg-tablewrap"><table className="mg-table"><thead><tr><th className="l">Joueur</th><th>MJ</th><th>Min</th><th>Pts</th><th>Reb</th><th>PD</th><th>Int</th><th>Ct</th><th>BP</th><th>2PT%</th><th>3PT%</th><th>LF%</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.p.id}><td className="l"><Av p={r.p} /> #{r.p.num} {r.p.name}</td><td>{r.gp}</td><td>{r.minAvg}</td><td><b>{r.ptsAvg}</b></td><td>{r.rebAvg}</td><td>{r.astAvg}</td><td>{r.stlAvg}</td><td>{r.blkAvg}</td><td>{r.toAvg}</td><td>{r.fg2}%</td><td>{r.fg3}%</td><td>{r.ft}%</td></tr>)}
          {rows.length === 0 && <tr><td className="l" colSpan={12}>Aucun joueur.</td></tr>}</tbody></table></div>

      {showMatch && <MatchForm team={team} onClose={() => setShowMatch(false)} onSave={(m) => { setMatches([...matches, m]); setShowMatch(false); flash('Match enregistré'); }} />}
      {showHist && <HistoryModal matches={matches} onClose={() => setShowHist(false)} onDelete={(id) => setMatches(matches.filter((m) => m.id !== id))} />}
    </>
  );
}

function MatchForm({ team, onClose, onSave }: { team: Team; onClose: () => void; onSave: (m: Match) => void }) {
  const [meta, setMeta] = useState({ date: new Date().toISOString().slice(0, 10), type: 'match' as 'match' | 'entrainement', opponent: '', home: true, scoreThem: 0 });
  const [lines, setLines] = useState<Line[]>(team.players.map((p) => emptyLine(p.id)));
  const set = (id: string, f: keyof Line, v: any) => setLines((arr) => arr.map((l) => (l.playerId === id ? { ...l, [f]: f === 'present' ? v : Math.max(0, Number(v) || 0) } : l)));
  const scoreUs = lines.reduce((s, l) => s + PTS(l), 0);
  const cols: [keyof Line, string][] = [['min', 'Min'], ['p2m', '2pM'], ['p2a', '2pT'], ['p3m', '3pM'], ['p3a', '3pT'], ['ftm', 'LFM'], ['fta', 'LFT'], ['reb', 'Reb'], ['ast', 'PD'], ['stl', 'Int'], ['blk', 'Ct'], ['to', 'BP'], ['pf', 'F']];
  return (
    <div className="mg-modal" onClick={onClose}>
      <div className="mg-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="mg-modal-head"><h3>Saisir un match</h3><button className="mg-x" onClick={onClose}>✕</button></div>
        <div className="mg-modal-body">
          <div className="mg-form">
            <label><span>Date</span><input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></label>
            <label><span>Type</span><select value={meta.type} onChange={(e) => setMeta({ ...meta, type: e.target.value as any })}><option value="match">Match</option><option value="entrainement">Entraînement</option></select></label>
            <label><span>Adversaire</span><input value={meta.opponent} onChange={(e) => setMeta({ ...meta, opponent: e.target.value })} placeholder="Adversaire" /></label>
            <label><span>Lieu</span><select value={meta.home ? '1' : '0'} onChange={(e) => setMeta({ ...meta, home: e.target.value === '1' })}><option value="1">Domicile</option><option value="0">Extérieur</option></select></label>
            <label><span>Score adverse</span><input type="number" value={meta.scoreThem} onChange={(e) => setMeta({ ...meta, scoreThem: Number(e.target.value) })} /></label>
            <div className="mg-scoreus">Score équipe (auto) : <b>{scoreUs}</b></div>
          </div>
          <div className="mg-tablewrap"><table className="mg-table mg-input"><thead><tr><th className="l">Joueur</th><th>Présent</th>{cols.map(([k, l]) => <th key={k}>{l}</th>)}<th>Pts</th></tr></thead>
            <tbody>{team.players.map((p) => { const l = lines.find((x) => x.playerId === p.id)!; return (
              <tr key={p.id} className={l.present ? '' : 'off'}><td className="l">#{p.num} {p.name}</td>
                <td><input type="checkbox" checked={l.present} onChange={(e) => set(p.id, 'present', e.target.checked)} /></td>
                {cols.map(([k]) => <td key={k}><input className="mg-num" type="number" value={(l as any)[k]} onChange={(e) => set(p.id, k, e.target.value)} disabled={!l.present} /></td>)}
                <td><b>{PTS(l)}</b></td></tr>
            ); })}</tbody></table></div>
        </div>
        <div className="mg-modal-foot"><button className="mg-btn" onClick={onClose}>Annuler</button><button className="mg-btn primary" onClick={() => onSave({ id: uid(), date: meta.date, type: meta.type, opponent: meta.opponent, home: meta.home, scoreUs, scoreThem: Number(meta.scoreThem) || 0, lines })}>Enregistrer le match</button></div>
      </div>
    </div>
  );
}

function HistoryModal({ matches, onClose, onDelete }: { matches: Match[]; onClose: () => void; onDelete: (id: string) => void }) {
  const sorted = [...matches].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <div className="mg-modal" onClick={onClose}>
      <div className="mg-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="mg-modal-head"><h3>Historique des saisies</h3><button className="mg-x" onClick={onClose}>✕</button></div>
        <div className="mg-modal-body"><div className="mg-list">
          {sorted.map((m) => { const w = m.scoreUs > m.scoreThem, d = m.scoreUs === m.scoreThem; return (
            <div className="mg-row" key={m.id}><div className="mg-row-l"><span className={`mg-tag ${m.type === 'match' ? 'match' : 'train'}`}>{m.type === 'match' ? 'Match' : 'Entr.'}</span><b>{m.date}</b><span className="mg-vs">{m.home ? 'vs' : '@'} {m.opponent || '—'}</span></div>
              {m.type === 'match' && <span className={`mg-score ${w ? 'w' : d ? 'd' : 'l'}`}>{m.scoreUs}-{m.scoreThem} <i>{w ? 'V' : d ? 'N' : 'D'}</i></span>}
              <button className="mg-x" onClick={() => onDelete(m.id)}>✕</button></div>
          ); })}
          {sorted.length === 0 && <div className="mg-empty">Aucune saisie.</div>}
        </div></div>
      </div>
    </div>
  );
}