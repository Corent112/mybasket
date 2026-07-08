'use client';

/** Onglet "Calendrier" — matchs & entraînements (À venir / Passés), pièce jointe, export CSV.
 *  Les entraînements alimentent la grille de présence de l'onglet Gestion admin. */

import { useState } from 'react';
import { useMgmt, downloadCsv, uid, type Evt } from '../../../lib/management';

const blank = (): Evt => ({ id: '', date: new Date().toISOString().slice(0, 10), time: '20:00', type: 'match', opponent: '', place: '', home: true, attachment: '' });

export default function CalendrierPage() {
  const { team, events, setEvents, flash } = useMgmt();
  const [f, setF] = useState<Evt>(blank());
  const [editId, setEditId] = useState<string | null>(null);
  if (!team) return <div className="mg-empty">Aucune équipe.</div>;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = [...events].filter((e) => e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const past = [...events].filter((e) => e.date < today).sort((a, b) => (a.date < b.date ? 1 : -1));

  const submit = () => {
    if (editId) { setEvents(events.map((e) => (e.id === editId ? { ...f, id: editId } : e))); setEditId(null); flash('Événement modifié'); }
    else { setEvents([...events, { ...f, id: uid() }]); flash('Événement ajouté'); }
    setF(blank());
  };
  const edit = (e: Evt) => { setF(e); setEditId(e.id); };
  const exportCsv = () => downloadCsv(`calendrier-${team.name}.csv`, [['Date', 'Heure', 'Type', 'Adversaire/Intitulé', 'Lieu', 'Domicile', 'PJ'], ...[...events].sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => [e.date, e.time, e.type, e.opponent, e.place, e.home ? 'Domicile' : 'Extérieur', e.attachment || ''])]);

  const Row = ({ e }: { e: Evt }) => (
    <div className="mg-row"><div className="mg-row-l"><span className={`mg-tag ${e.type === 'match' ? 'match' : 'train'}`}>{e.type === 'match' ? 'Match' : 'Entraînement'}</span><b>{e.date}</b><span className="mg-vs">{e.time} · {e.home ? 'vs' : '@'} {e.opponent || '—'}{e.place ? ` · ${e.place}` : ''}</span>{e.attachment ? <span className="mg-tag" style={{ background: 'var(--gold)', color: '#3a2a00' }} title={e.attachment}>📎 PJ</span> : null}</div>
      <button className="mg-btn sm" onClick={() => edit(e)}>✎</button>
      <button className="mg-x" onClick={() => setEvents(events.filter((x) => x.id !== e.id))}>🗑</button></div>
  );

  return (
    <>
      <div className="mg-steps"><span><b>Marche à suivre :</b> 1. remplis le formulaire → 2. <b>Ajouter</b> (les <b>entraînements</b> nourrissent la grille de présence dans Gestion admin) → 3. modifie/supprime, ajoute une <b>pièce jointe</b> (feuille de match), exporte en CSV.</span></div>
      <div className="mg-bar"><h2>Calendrier des matchs & entraînements</h2><div className="mg-actions"><button className="mg-btn" onClick={exportCsv}>📥 Exporter CSV</button></div></div>

      <div className="mg-form">
        <label><span>Date</span><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label><span>Heure</span><input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
        <label><span>Type</span><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as any })}><option value="match">Match</option><option value="entrainement">Entraînement</option></select></label>
        <label><span>Adversaire / intitulé</span><input value={f.opponent} onChange={(e) => setF({ ...f, opponent: e.target.value })} placeholder="Adversaire" /></label>
        <label><span>Lieu</span><input value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="Salle" /></label>
        <label><span>Domicile</span><select value={f.home ? '1' : '0'} onChange={(e) => setF({ ...f, home: e.target.value === '1' })}><option value="1">Domicile</option><option value="0">Extérieur</option></select></label>
        <label><span>Pièce jointe (nom)</span><input value={f.attachment} onChange={(e) => setF({ ...f, attachment: e.target.value })} placeholder="feuille-match.pdf" /></label>
        <button className="mg-btn primary" onClick={submit}>{editId ? 'Enregistrer' : '+ Nouveau'}</button>
        {editId && <button className="mg-btn" onClick={() => { setEditId(null); setF(blank()); }}>Annuler</button>}
      </div>

      <h3 style={{ color: 'var(--bordeaux)', fontSize: 15, margin: '10px 0 8px' }}>📌 À venir ({upcoming.length})</h3>
      <div className="mg-list">{upcoming.map((e) => <Row key={e.id} e={e} />)}{upcoming.length === 0 && <div className="mg-empty">Aucun événement à venir.</div>}</div>

      <h3 style={{ color: 'var(--mute)', fontSize: 15, margin: '18px 0 8px' }}>📜 Passés ({past.length})</h3>
      <div className="mg-list">{past.map((e) => <Row key={e.id} e={e} />)}{past.length === 0 && <div className="mg-empty">Aucun événement passé.</div>}</div>
    </>
  );
}