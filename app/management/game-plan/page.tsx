'use client';

/** Onglet "Game Plan" — préparation de match : systèmes, consignes, rotation incluse,
 *  points de fin de match (BLOB/SLOB/Systèmes), export PDF (impression navigateur). */

import { useMgmt, type GamePlan } from '../../../lib/management';

export default function GamePlanPage() {
  const { team, plan, setPlan, rotation, flash } = useMgmt();
  if (!team) return <div className="mg-empty">Aucune équipe.</div>;
  const upd = (patch: Partial<GamePlan>) => setPlan({ ...plan, ...patch });
  const hasRotation = [0, 1, 2, 3].some((qt) => (rotation.grid[qt] || []).some(Boolean));

  const fields: [keyof GamePlan, string, string, number][] = [
    ['offSys', 'Systèmes offensifs', 'Nos systèmes à lancer, options, déclencheurs…', 4],
    ['defSys', 'Systèmes défensifs', 'Défense(s) prévue(s), ajustements, pièges…', 4],
    ['consignes', 'Consignes adversaire / joueurs clés', 'Forces/faiblesses adverses, joueurs à neutraliser…', 4],
  ];
  const finFields: [keyof GamePlan, string, string][] = [
    ['finBlob', 'BLOB (remise ligne de fond)', 'Systèmes BLOB de fin de match'],
    ['finSlob', 'SLOB (remise côté)', 'Systèmes SLOB de fin de match'],
    ['finSys', 'Systèmes (égalité / dernière possession)', 'Dernière possession, fautes, money-time'],
  ];

  return (
    <>
      <div className="mg-steps"><span><b>Marche à suivre :</b> 1. renseigne <b>date & adversaire</b> → 2. remplis <b>systèmes off/déf</b> et <b>consignes</b> → 3. inclus ta <b>rotation</b> si besoin → 4. prépare les <b>points fin de match</b> → 5. <b>Exporter en PDF</b> (impression). Tout est enregistré automatiquement.</span></div>
      <div className="mg-bar"><h2>Game Plan</h2><div className="mg-actions"><a className="mg-btn" href="/plaquette" target="_blank" rel="noopener">✏️ Plaquette</a><button className="mg-btn" onClick={() => { setPlan(plan); flash('Game plan enregistré'); }}>💾 Enregistrer</button><button className="mg-btn primary" onClick={() => window.print()}>📄 Exporter PDF</button></div></div>

      <div className="mg-form" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <label><span>Date du match</span><input type="date" value={plan.date} onChange={(e) => upd({ date: e.target.value })} /></label>
        <label><span>Adversaire</span><input value={plan.opponent} onChange={(e) => upd({ opponent: e.target.value })} placeholder="Ex : ASVEL" /></label>
      </div>

      {fields.map(([id, label, ph, rows]) => (
        <label key={id} style={{ display: 'block', marginBottom: 14 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--bordeaux)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>{label}</span>
          <textarea className="mg-textarea" style={{ minHeight: rows * 26 }} value={plan[id] as string} onChange={(e) => upd({ [id]: e.target.value } as any)} placeholder={ph} />
        </label>
      ))}

      <div style={{ border: '1px solid var(--line)', borderRadius: 11, padding: 14, margin: '4px 0 16px', background: '#faf7f1' }}>
        <div className="mg-bar" style={{ marginBottom: 8 }}><h3 style={{ fontSize: 15, margin: 0, color: 'var(--bordeaux)' }}>🔄 Rotation</h3>{hasRotation ? <span className="mg-pill w" style={{ background: 'var(--green)' }}>Rotation définie</span> : <span className="mg-pill d">Aucune rotation</span>}</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}><input type="checkbox" checked={plan.inclureRotation} onChange={(e) => upd({ inclureRotation: e.target.checked })} /> Inclure ma rotation dans le PDF du Game Plan</label>
        {plan.inclureRotation && hasRotation && (
          <div style={{ marginTop: 10, fontSize: 13 }}>{[0, 1, 2, 3].map((qt) => { const items = (rotation.grid[qt] || []).map((id) => { const p = team.players.find((x) => x.id === id); return p ? `#${p.num}` : null; }).filter(Boolean); return <div key={qt} style={{ padding: '3px 0' }}><b style={{ color: 'var(--bordeaux)' }}>QT{qt + 1} ({rotation.durations[qt]}min)</b> · {items.length ? items.join(' · ') : '—'}</div>; })}</div>
        )}
        {plan.inclureRotation && !hasRotation && <p className="mg-note">Aucune rotation configurée — va dans l’onglet 🔄 Rotation pour la créer.</p>}
      </div>

      <div className="mg-bar" style={{ marginBottom: 8 }}><h3 style={{ fontSize: 15, margin: 0, color: 'var(--bordeaux)' }}>🏁 Points fin de match</h3><span style={{ fontSize: 12, color: 'var(--mute)', fontStyle: 'italic' }}>BLOB · SLOB · Systèmes</span></div>
      {finFields.map(([id, label, ph]) => (
        <label key={id} style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--bordeaux)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>{label}</span>
          <textarea className="mg-textarea" style={{ minHeight: 70 }} value={plan[id] as string} onChange={(e) => upd({ [id]: e.target.value } as any)} placeholder={ph} />
        </label>
      ))}
    </>
  );
}