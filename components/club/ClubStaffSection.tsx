'use client'
// components/club/ClubStaffSection.tsx
// Module Staff pour l'onglet "Gestion administrative" de l'Espace Mon Club.
// Inviter des coachs, suivre les invitations, relier un coach à des équipes.
// Aucune écriture directe dans club_members -> non bloquant.
import { useEffect, useState, useCallback } from 'react'
import {
  getClubStaff,
  getClubTeams,
  getPendingInvitations,
  inviteStaff,
  revokeInvitation,
  setCoachTeams,
  buildInvitationLink,
  type StaffMember,
  type ClubTeam,
  type StaffInvitation,
  type ClubRole,
} from '@/lib/club-staff-supabase'

const C = {
  bordeaux: 'var(--bordeaux, #6B1A2C)',
  or: 'var(--or, #D4A24C)',
  noir: 'var(--noir, #0F0F12)',
  gris: 'var(--gris-text, #6b6b6b)',
  bord: 'var(--gris-med, #E5E1D8)',
  bg: 'var(--creme, #FAF7F0)',
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propriétaire', admin: 'Admin', coach: 'Coach',
  player: 'Joueur', viewer: 'Observateur', member: 'Membre',
}

export default function ClubStaffSection({
  clubId,
  onOpenTeam,
}: {
  clubId: string
  onOpenTeam?: (teamId: string) => void
}) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [teams, setTeams] = useState<ClubTeam[]>([])
  const [invites, setInvites] = useState<StaffInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // modales
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<ClubRole>('coach')
  const [teamsFor, setTeamsFor] = useState<StaffMember | null>(null)
  const [teamSel, setTeamSel] = useState<string[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, t, i] = await Promise.all([
        getClubStaff(clubId), getClubTeams(clubId), getPendingInvitations(clubId),
      ])
      setStaff(s); setTeams(t); setInvites(i)
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => { if (clubId) load() }, [clubId, load])

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '—'

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setBusy(true); setError(null)
    try {
      await inviteStaff(clubId, inviteEmail, inviteRole)
      setInviteOpen(false); setInviteEmail(''); setInviteRole('coach')
      await load()
    } catch (e: any) {
      setError(e?.message ?? "Échec de l'invitation")
    } finally { setBusy(false) }
  }

  async function handleRevoke(id: string) {
    setBusy(true)
    try { await revokeInvitation(id); await load() }
    catch (e: any) { setError(e?.message ?? 'Échec de la révocation') }
    finally { setBusy(false) }
  }

  function openTeams(m: StaffMember) {
    setTeamsFor(m); setTeamSel(m.teamIds)
  }
  async function saveTeams() {
    if (!teamsFor) return
    setBusy(true); setError(null)
    try {
      await setCoachTeams(clubId, teamsFor.userId, teamSel)
      setTeamsFor(null); await load()
    } catch (e: any) {
      setError(e?.message ?? "Échec de l'affectation")
    } finally { setBusy(false) }
  }

  function copyLink(token: string) {
    const link = buildInvitationLink(token)
    navigator.clipboard?.writeText(link)
    setCopied(token); setTimeout(() => setCopied(null), 1800)
  }

  return (
    <div style={{ fontSize: '.92rem', color: C.noir }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.6rem', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '.68rem', letterSpacing: '.12em', textTransform: 'uppercase', color: C.or, fontWeight: 800 }}>Gestion administrative</div>
          <h3 style={{ margin: '.15rem 0 0', fontSize: '1.25rem', fontWeight: 800 }}>Staff & invitations</h3>
        </div>
        <button onClick={() => setInviteOpen(true)} style={btnPrimary}>+ Inviter un coach</button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <p style={{ color: C.gris, padding: '1.5rem 0' }}>Chargement…</p>
      ) : (
        <>
          {/* Invitations en attente */}
          {invites.length > 0 && (
            <div style={{ marginBottom: '1.3rem' }}>
              <div style={sectionLabel}>Invitations en attente ({invites.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {invites.map((inv) => (
                  <div key={inv.id} style={inviteRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</div>
                      <div style={{ fontSize: '.75rem', color: C.gris }}>{ROLE_LABEL[inv.role]} · en attente</div>
                    </div>
                    <div style={{ display: 'flex', gap: '.4rem', flexShrink: 0 }}>
                      <button onClick={() => copyLink(inv.token)} style={btnGhost}>
                        {copied === inv.token ? '✓ Copié' : '🔗 Copier le lien'}
                      </button>
                      <button onClick={() => handleRevoke(inv.id)} disabled={busy} style={btnDanger}>Révoquer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liste du staff */}
          <div style={sectionLabel}>Équipe encadrante ({staff.length})</div>
          {staff.length === 0 ? (
            <p style={{ color: C.gris, padding: '1rem 0' }}>Aucun coach pour l'instant. Invite ton premier coach ci-dessus.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '.7rem' }}>
              {staff.map((m) => (
                <div key={m.userId} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                    <div style={avatar}>
                      {m.avatarUrl
                        ? <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                        : (m.displayName?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.displayName}</div>
                      <div style={{ fontSize: '.74rem', color: C.gris, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
                    </div>
                    <span style={{ ...roleBadge, marginLeft: 'auto' }}>{ROLE_LABEL[m.role] ?? m.role}</span>
                  </div>

                  <div style={{ marginTop: '.6rem' }}>
                    <div style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.05em', color: C.gris, marginBottom: '.3rem' }}>Équipes</div>
                    {m.teamIds.length === 0 ? (
                      <span style={{ fontSize: '.78rem', color: C.gris }}>Aucune équipe</span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                        {m.teamIds.map((tid) => (
                          <button key={tid} onClick={() => onOpenTeam?.(tid)} style={chip} title="Ouvrir l'équipe">{teamName(tid)}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={() => openTeams(m)} style={{ ...btnGhost, width: '100%', marginTop: '.6rem' }}>
                    Gérer les équipes
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modale : inviter */}
      {inviteOpen && (
        <Modal onClose={() => setInviteOpen(false)} title="Inviter un coach">
          <label style={fieldLabel}>E-mail</label>
          <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="coach@exemple.fr" type="email" style={input} />
          <label style={fieldLabel}>Rôle</label>
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as ClubRole)} style={input}>
            <option value="coach">Coach</option>
            <option value="admin">Admin du club</option>
          </select>
          <div style={modalActions}>
            <button onClick={() => setInviteOpen(false)} style={btnGhost}>Annuler</button>
            <button onClick={handleInvite} disabled={busy || !inviteEmail.trim()} style={btnPrimary}>
              {busy ? '…' : 'Envoyer l\'invitation'}
            </button>
          </div>
          <p style={{ fontSize: '.72rem', color: C.gris, marginTop: '.6rem' }}>
            Un lien d'invitation sera généré — copie-le depuis la liste « en attente » pour le transmettre.
          </p>
        </Modal>
      )}

      {/* Modale : affecter aux équipes */}
      {teamsFor && (
        <Modal onClose={() => setTeamsFor(null)} title={`Équipes de ${teamsFor.displayName}`}>
          {teams.length === 0 ? (
            <p style={{ color: C.gris }}>Aucune équipe dans ce club pour le moment.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', maxHeight: 280, overflowY: 'auto' }}>
              {teams.map((t) => {
                const on = teamSel.includes(t.id)
                return (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.45rem .6rem', border: `1px solid ${C.bord}`, borderRadius: 8, cursor: 'pointer', background: on ? C.bg : '#fff' }}>
                    <input type="checkbox" checked={on}
                      onChange={() => setTeamSel((s) => on ? s.filter((x) => x !== t.id) : [...s, t.id])} />
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                  </label>
                )
              })}
            </div>
          )}
          <div style={modalActions}>
            <button onClick={() => setTeamsFor(null)} style={btnGhost}>Annuler</button>
            <button onClick={saveTeams} disabled={busy} style={btnPrimary}>{busy ? '…' : 'Enregistrer'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// --- petit composant Modale ---
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: '1.3rem 1.4rem', width: 'min(440px,100%)', boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800 }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

// --- styles ---
const btnPrimary: React.CSSProperties = { background: C.bordeaux, color: '#fff', border: 'none', borderRadius: 8, padding: '.5rem .9rem', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }
const btnGhost: React.CSSProperties = { background: '#fff', color: C.noir, border: `1px solid ${C.bord}`, borderRadius: 8, padding: '.45rem .8rem', fontWeight: 600, fontSize: '.82rem', cursor: 'pointer' }
const btnDanger: React.CSSProperties = { background: '#fff', color: '#E63946', border: '1px solid #E63946', borderRadius: 8, padding: '.45rem .8rem', fontWeight: 600, fontSize: '.82rem', cursor: 'pointer' }
const card: React.CSSProperties = { background: '#fff', border: `1.5px solid ${C.bord}`, borderRadius: 12, padding: '.9rem' }
const avatar: React.CSSProperties = { width: 40, height: 40, borderRadius: '50%', background: C.bordeaux, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0, overflow: 'hidden' }
const roleBadge: React.CSSProperties = { background: C.bg, color: C.bordeaux, border: `1px solid ${C.or}`, borderRadius: 999, padding: '.1rem .5rem', fontSize: '.7rem', fontWeight: 700, whiteSpace: 'nowrap' }
const chip: React.CSSProperties = { background: C.bg, border: `1px solid ${C.bord}`, borderRadius: 999, padding: '.15rem .55rem', fontSize: '.74rem', cursor: 'pointer', color: C.noir }
const sectionLabel: React.CSSProperties = { fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.06em', color: C.gris, fontWeight: 700, marginBottom: '.5rem' }
const inviteRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.6rem', background: '#fff', border: `1px solid ${C.bord}`, borderRadius: 10, padding: '.55rem .8rem' }
const errorBox: React.CSSProperties = { background: '#FFEBE9', border: '1px solid #E63946', color: '#E63946', borderRadius: 8, padding: '.55rem .8rem', fontSize: '.82rem', marginBottom: '.8rem' }
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: '.75rem', fontWeight: 700, color: C.gris, margin: '.6rem 0 .25rem' }
const input: React.CSSProperties = { width: '100%', padding: '.55rem .7rem', border: `1px solid ${C.bord}`, borderRadius: 8, fontSize: '.88rem', boxSizing: 'border-box' }
const modalActions: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '.5rem', marginTop: '1rem' }