'use client';

/** Onglet "Gestion admin" — administratif (cotisations/paiements) + présence aux entraînements.
 *  Les ENTRAÎNEMENTS proviennent de « Mon Calendrier » (mybasket_calendar_events) : dès que tu
 *  crées un entraînement avec cette équipe, sa date apparaît ici. Les joueurs ASSIGNÉS à
 *  l'entraînement (lors de la création) sont cochés présents par défaut ; tu peux ajuster. */

import { useEffect, useState } from 'react';
import { useMgmt, readCalendarTrainings, type AdminData, type CalTraining } from '../../../lib/management';

const COTIS: [keyof NonNullable<AdminData['cotisations'][string]>, string][] = [
  ['licence', 'Licence'], ['assurance', 'Assurance'], ['equipement', 'Équipement'], ['cotisation', 'Cotisation'],
];

export default function AdminPage() {
  const { team, teamId, admin, setAdmin, flash } = useMgmt();
  const [seances, setSeances] = useState<CalTraining[]>([]);

  // (Re)lecture des entraînements de Mon Calendrier pour cette équipe.
  useEffect(() => { setSeances(readCalendarTrainings(teamId)); }, [teamId]);
  // Resynchronise quand on revient sur l'onglet (le calendrier peut avoir changé).
  useEffect(() => {
    const refresh = () => setSeances(readCalendarTrainings(teamId));
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [teamId]);

  if (!team) return <div className="mg-empty">Aucune équipe.</div>;

  const getCot = (pid: string) => admin.cotisations[pid] || { licence: false, assurance: false, equipement: false, cotisation: false, amount: '' };
  const setCot = (pid: string, patch: any) => setAdmin({ ...admin, cotisations: { ...admin.cotisations, [pid]: { ...getCot(pid), ...patch } } });

  // État présent : override manuel sinon valeur par défaut = "assigné lors de la création".
  const isPresent = (ev: CalTraining, pid: string): boolean => {
    const ov = admin.presence[ev.id]?.[pid];
    if (ov === 'present') return true;
    if (ov === 'absent') return false;
    return ev.assignedPlayers.includes(pid); // par défaut : coché si assigné
  };
  const toggle = (ev: CalTraining, pid: string, checked: boolean) => {
    const cell = { ...(admin.presence[ev.id] || {}) };
    cell[pid] = checked ? 'present' : 'absent';
    setAdmin({ ...admin, presence: { ...admin.presence, [ev.id]: cell } });
  };
  const allPres = (ev: CalTraining, val: 'present' | 'absent') => {
    const cell = Object.fromEntries(team.players.map((p) => [p.id, val]));
    setAdmin({ ...admin, presence: { ...admin.presence, [ev.id]: cell } });
  };
  const totalPres = (pid: string) => seances.filter((ev) => isPresent(ev, pid)).length;
  const totalSeance = (ev: CalTraining) => team.players.filter((p) => isPresent(ev, p.id)).length;

  return (
    <>
      <div className="mg-steps"><span><b>Marche à suivre :</b> coche les éléments <b>administratifs</b> payés et saisis le <b>montant</b>. Pour la <b>présence</b>, crée tes entraînements dans <b>Mon Calendrier</b> (Mon compte) en choisissant cette équipe : la date apparaît ici, et les joueurs <b>assignés</b> à l'entraînement sont <b>cochés présents</b> par défaut.</span></div>

      <h3 style={{ fontSize: 15, color: 'var(--bordeaux)', borderBottom: '1.5px solid var(--gold)', paddingBottom: 5, margin: '0 0 12px' }}>💳 Administratif</h3>
      <div className="mg-tablewrap"><table className="mg-table"><thead><tr><th className="l">Joueur</th><th>N°</th>{COTIS.map(([k, l]) => <th key={k}>{l}</th>)}<th>Montant payé</th></tr></thead>
        <tbody>{team.players.map((p) => { const a = getCot(p.id); return (
          <tr key={p.id}><td className="l">{p.name}</td><td>{p.num}</td>
            {COTIS.map(([k]) => <td key={k}><input type="checkbox" checked={!!(a as any)[k]} onChange={(e) => setCot(p.id, { [k]: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--bordeaux)' }} /></td>)}
            <td><input className="mg-num" style={{ width: 80, textAlign: 'right' }} value={a.amount} onChange={(e) => setCot(p.id, { amount: e.target.value })} placeholder="0€" /></td></tr>
        ); })}</tbody></table></div>

      <h3 style={{ fontSize: 15, color: 'var(--bordeaux)', borderBottom: '1.5px solid var(--gold)', paddingBottom: 5, margin: '24px 0 12px' }}>📋 Présence aux entraînements <small style={{ color: 'var(--mute)', fontWeight: 400 }}>({seances.length} — depuis Mon Calendrier)</small></h3>
      {seances.length === 0 ? (
        <div className="mg-empty">Aucun entraînement pour <b>{team.name}</b>. Va dans <b>Mon Calendrier</b> (Mon compte), crée un entraînement et choisis cette équipe en « Équipe associée » : il apparaîtra ici automatiquement.</div>
      ) : (
        <div className="mg-tablewrap"><table className="mg-table"><thead>
          <tr><th className="l">Joueur</th>{seances.map((ev) => <th key={ev.id} title={`${ev.date}${ev.time ? ' · ' + ev.time : ''}${ev.opponent ? ' · ' + ev.opponent : ''}`}>{ev.date.slice(5)}{ev.time ? <><br /><span style={{ fontSize: 9, opacity: .8 }}>{ev.time}</span></> : null}</th>)}<th>Total</th></tr>
          <tr><th className="l" style={{ fontSize: 9, textTransform: 'none', fontWeight: 400 }}>Tout cocher ↓</th>{seances.map((ev) => <th key={ev.id} style={{ padding: '2px 4px' }}><button className="mg-btn sm" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => allPres(ev, totalSeance(ev) === team.players.length ? 'absent' : 'present')}>{totalSeance(ev) === team.players.length ? '✕' : '✓'}</button></th>)}<th></th></tr>
        </thead>
          <tbody>{team.players.map((p) => (
            <tr key={p.id}><td className="l">#{p.num} {p.name}</td>
              {seances.map((ev) => { const on = isPresent(ev, p.id); const assigned = ev.assignedPlayers.includes(p.id); return (
                <td key={ev.id} style={{ padding: 4 }} title={assigned ? 'Assigné à cet entraînement' : ''}>
                  <input type="checkbox" checked={on} onChange={(e) => toggle(ev, p.id, e.target.checked)} style={{ width: 18, height: 18, accentColor: assigned ? 'var(--green)' : 'var(--bordeaux)', cursor: 'pointer' }} />
                </td>
              ); })}
              <td><b>{totalPres(p.id)}/{seances.length}</b></td></tr>
          ))}
          <tr style={{ background: '#faf7f1' }}><td className="l" style={{ fontWeight: 700 }}>Présents / séance</td>{seances.map((ev) => <td key={ev.id}><b>{totalSeance(ev)}/{team.players.length}</b></td>)}<td></td></tr>
          </tbody></table></div>
      )}
      <p className="mg-note">Astuce : une case <b style={{ color: 'var(--green)' }}>verte</b> = le joueur était assigné à l'entraînement lors de sa création (coché présent par défaut). Tu peux cocher/décocher librement pour ajuster la présence réelle.</p>

      <h3 style={{ fontSize: 15, color: 'var(--bordeaux)', borderBottom: '1.5px solid var(--gold)', paddingBottom: 5, margin: '24px 0 12px' }}>🔗 Raccourcis</h3>
      <div className="mg-links">
        <a className="mg-link" href="/prise-stats-pro">🔴 Prise de stats LIVE</a>
        <a className="mg-link" href="/equipes">👥 Mes équipes</a>
        <a className="mg-link" href="/plaquette">✏️ Plaquette</a>
        <a className="mg-link" href="/exercices">📚 Bibliothèque d’exercices</a>
      </div>
    </>
  );
}