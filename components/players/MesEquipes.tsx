'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './MesEquipes.module.css';

// ⚠️ INTÉGRATION 1 — On réutilise TON PlayerForm existant.
// Adapte le chemin si besoin. On le caste en `any` pour ne PAS dépendre
// de la signature exacte de ses props (voir bloc <PlayerForm /> plus bas).
import { PlayerForm } from "./PlayerProfile";

/* =========================================================================
   Types — remplace-les par tes types partagés (types/team.ts) si tu en as.
   ========================================================================= */
export type Player = {
  id: string;
  name?: string;
  prenom?: string;
  nom?: string;
  firstName?: string;
  lastName?: string;
  photo?: string;
  number?: string | number;
  numero?: string | number;
  poste?: string;
  // Ton PlayerForm peut renvoyer d'autres champs (taille, poids, licence…) :
  // on les conserve tels quels.
  [key: string]: any;
};

export type TeamEvent = {
  id: string;
  type: 'match' | 'entrainement';
  title: string;
  date: string; // ISO (yyyy-mm-dd)
  time?: string;
  opponent?: string;
  location?: string;
};

export type Team = {
  id: string;
  name: string;
  club?: string;
  clubLogo?: string; // URL
  banner?: string; // URL
  category?: string;
  level?: string;
  gender?: string;
  season?: string;
  players: Player[];
  events: TeamEvent[];
};

/* =========================================================================
   Persistance — clé namespacée, cohérente avec tes autres modules MyBasket.
   ========================================================================= */
const STORAGE_KEY = 'mybasket:teams';

const LOGO_SRC = '/logo-club.png'; // placeholder par défaut si tu veux un fallback global

function loadTeams(): Team[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Team[];
    return Array.isArray(parsed)
      ? parsed.map((t) => ({ ...t, players: t.players ?? [], events: t.events ?? [] }))
      : [];
  } catch {
    return [];
  }
}

function saveTeams(teams: Team[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
  } catch {
    /* quota / mode privé : on ignore silencieusement */
  }
}

/* ============================== Helpers ============================== */
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;

// Clés possibles pour l'URL de la photo selon la version de ton PlayerForm.
const PHOTO_KEYS = [
  'photo',
  'photoUrl',
  'photoURL',
  'photo_url',
  'avatar',
  'avatarUrl',
  'image',
  'imageUrl',
  'picture',
  'pictureUrl',
  'img',
];

function resolvePhoto(p: Player): string | undefined {
  for (const k of PHOTO_KEYS) {
    const v = p?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function playerName(p: Player): string {
  if (p?.name && String(p.name).trim()) return String(p.name).trim();
  if (p?.displayName && String(p.displayName).trim()) return String(p.displayName).trim();
  const fr = [p?.prenom, p?.nom].filter(Boolean).join(' ').trim();
  if (fr) return fr;
  const en = [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();
  if (en) return en;
  return 'Joueur';
}

function getInitials(label: string): string {
  return (
    label
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  );
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/* ============================== Icônes ============================== */
const IconEye = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconPlus = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconEdit = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const IconTrash = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
  </svg>
);

/* ============================== Modal générique ============================== */
function Modal({
  title,
  onClose,
  children,
  width,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        className={styles.modal}
        style={width ? { maxWidth: width } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <h3 className={styles.modalTitle}>{title}</h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

/* ============================== Formulaire Équipe ============================== */
const emptyTeam = (): Team => ({
  id: uid(),
  name: '',
  club: '',
  clubLogo: '',
  banner: '',
  category: '',
  level: '',
  gender: '',
  season: '',
  players: [],
  events: [],
});

function TeamForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Team;
  onSave: (team: Team) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Team>(initial);

  const set = <K extends keyof Team>(key: K, value: Team[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    if (!form.name.trim()) {
      alert("Le nom de l'équipe est requis.");
      return;
    }
    onSave({ ...form, name: form.name.trim() });
  };

  return (
    <div className={styles.form}>
      {/* Aperçus images */}
      <div className={styles.previewRow}>
        <div className={styles.previewBox}>
          <span className={styles.previewLabel}>Bannière</span>
          <div
            className={styles.previewBanner}
            style={form.banner ? { backgroundImage: `url(${form.banner})` } : undefined}
          >
            {!form.banner && <span className={styles.previewPlaceholder}>Photo d’équipe</span>}
          </div>
        </div>
        <div className={styles.previewBox}>
          <span className={styles.previewLabel}>Logo club</span>
          <div className={styles.previewLogo}>
            {form.clubLogo ? (
              <img src={form.clubLogo} alt="" />
            ) : (
              <span>{getInitials(form.club || form.name || '?')}</span>
            )}
          </div>
        </div>
      </div>

      <label className={styles.field}>
        <span>Logo du club (URL)</span>
        <input
          type="url"
          value={form.clubLogo || ''}
          placeholder="https://…/logo.png"
          onChange={(e) => set('clubLogo', e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span>Photo de l’équipe / bannière (URL)</span>
        <input
          type="url"
          value={form.banner || ''}
          placeholder="https://…/equipe.jpg"
          onChange={(e) => set('banner', e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span>Nom de l’équipe</span>
        <input
          type="text"
          value={form.name}
          placeholder="U13 Filles 1"
          onChange={(e) => set('name', e.target.value)}
        />
      </label>

      <div className={styles.grid2}>
        <label className={styles.field}>
          <span>Club</span>
          <input type="text" value={form.club || ''} onChange={(e) => set('club', e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Catégorie</span>
          <input
            type="text"
            value={form.category || ''}
            placeholder="U13"
            onChange={(e) => set('category', e.target.value)}
          />
        </label>
      </div>

      <div className={styles.grid2}>
        <label className={styles.field}>
          <span>Niveau</span>
          <input
            type="text"
            value={form.level || ''}
            placeholder="Départemental"
            onChange={(e) => set('level', e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Genre</span>
          <select value={form.gender || ''} onChange={(e) => set('gender', e.target.value)}>
            <option value="">—</option>
            <option value="Masculin">Masculin</option>
            <option value="Féminin">Féminin</option>
            <option value="Mixte">Mixte</option>
          </select>
        </label>
      </div>

      <label className={styles.field}>
        <span>Saison</span>
        <input
          type="text"
          value={form.season || ''}
          placeholder="2025–2026"
          onChange={(e) => set('season', e.target.value)}
        />
      </label>

      <div className={styles.formActions}>
        <button className={styles.btnGhost} type="button" onClick={onCancel}>
          Annuler
        </button>
        <button className={styles.btnPrimary} type="button" onClick={submit}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

/* ============================== Modal Événement ============================== */
function EventForm({ onSave, onCancel }: { onSave: (e: TeamEvent) => void; onCancel: () => void }) {
  const [type, setType] = useState<'match' | 'entrainement'>('match');
  const [title, setTitle] = useState('');
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  const submit = () => {
    if (!date) {
      alert('La date est requise.');
      return;
    }
    const computedTitle =
      title.trim() ||
      (type === 'match'
        ? opponent
          ? `Match vs ${opponent.trim()}`
          : 'Match'
        : 'Entraînement');
    onSave({
      id: uid(),
      type,
      title: computedTitle,
      opponent: type === 'match' ? opponent.trim() || undefined : undefined,
      date,
      time: time || undefined,
      location: location.trim() || undefined,
    });
  };

  return (
    <div className={styles.form}>
      <div className={styles.segmented}>
        <button
          type="button"
          className={type === 'match' ? styles.segActive : styles.seg}
          onClick={() => setType('match')}
        >
          Match
        </button>
        <button
          type="button"
          className={type === 'entrainement' ? styles.segActive : styles.seg}
          onClick={() => setType('entrainement')}
        >
          Entraînement
        </button>
      </div>

      {type === 'match' && (
        <label className={styles.field}>
          <span>Adversaire</span>
          <input type="text" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
        </label>
      )}

      <label className={styles.field}>
        <span>Intitulé {type === 'match' ? '(optionnel)' : ''}</span>
        <input
          type="text"
          value={title}
          placeholder={type === 'match' ? 'Auto : Match vs …' : 'Entraînement'}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <div className={styles.grid2}>
        <label className={styles.field}>
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Heure</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      <label className={styles.field}>
        <span>Lieu</span>
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>

      <div className={styles.formActions}>
        <button className={styles.btnGhost} type="button" onClick={onCancel}>
          Annuler
        </button>
        <button className={styles.btnPrimary} type="button" onClick={submit}>
          Ajouter
        </button>
      </div>
    </div>
  );
}

/* ============================== Carte Équipe ============================== */
function TeamCard({
  team,
  onView,
  onAddPlayer,
  onAddEvent,
  onEdit,
  onDelete,
}: {
  team: Team;
  onView: () => void;
  onAddPlayer: () => void;
  onAddEvent: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const players = team.players ?? [];
  const events = useMemo(
    () =>
      [...(team.events ?? [])].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
    [team.events]
  );

  const visiblePlayers = players.slice(0, 6);
  const extraPlayers = players.length - visiblePlayers.length;
  const visibleEvents = events.slice(0, 3);

  return (
    <article className={styles.card}>
      {/* Bannière */}
      <div
        className={styles.banner}
        style={team.banner ? { backgroundImage: `url(${team.banner})` } : undefined}
      >
        {!team.banner && <span className={styles.bannerInitial}>{getInitials(team.name)}</span>}
        {team.category && <span className={styles.bannerBadge}>{team.category}</span>}
        <div className={styles.logo}>
          {team.clubLogo ? (
            <img src={team.clubLogo} alt={team.club || 'Club'} />
          ) : (
            <span>{getInitials(team.club || team.name)}</span>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <h3 className={styles.teamName}>{team.name}</h3>

        <div className={styles.meta}>
          {team.category && <span className={styles.metaChip}>{team.category}</span>}
          <span className={styles.metaChip}>
            {players.length} {players.length > 1 ? 'joueurs' : 'joueur'}
          </span>
          {team.gender && <span className={styles.metaChipSoft}>{team.gender}</span>}
          {team.level && <span className={styles.metaChipSoft}>{team.level}</span>}
          {team.season && <span className={styles.metaChipSoft}>{team.season}</span>}
        </div>

        {/* Pastilles joueurs */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Joueurs</span>
          {players.length === 0 ? (
            <p className={styles.empty}>Aucun joueur pour l’instant.</p>
          ) : (
            <div className={styles.pills}>
              {visiblePlayers.map((p) => {
                const label = playerName(p);
                const photo = resolvePhoto(p);
                return (
                  <span key={p.id} className={styles.pill} title={label}>
                    <span className={styles.pillAvatar}>
                      {photo ? <img src={photo} alt="" /> : getInitials(label)}
                    </span>
                    <span className={styles.pillName}>{label}</span>
                  </span>
                );
              })}
              {extraPlayers > 0 && <span className={styles.pillMore}>+{extraPlayers}</span>}
            </div>
          )}
        </div>

        {/* Matchs / Entraînements */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Matchs / Entraînements</span>
          {events.length === 0 ? (
            <p className={styles.empty}>Aucun match ni entraînement.</p>
          ) : (
            <ul className={styles.events}>
              {visibleEvents.map((ev) => (
                <li key={ev.id} className={styles.event}>
                  <span
                    className={ev.type === 'match' ? styles.dotMatch : styles.dotTraining}
                    aria-hidden
                  />
                  <span className={styles.eventDate}>{formatDate(ev.date)}</span>
                  <span className={styles.eventTitle}>{ev.title}</span>
                  {ev.time && <span className={styles.eventTime}>{ev.time}</span>}
                </li>
              ))}
              {events.length > visibleEvents.length && (
                <li className={styles.eventMore}>
                  + {events.length - visibleEvents.length} autre(s)
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Actions */}
        <button className={styles.btnView} type="button" onClick={onView}>
          <IconEye /> Voir la page de l’équipe
        </button>

        <div className={styles.actionRow}>
          <button className={styles.btnGhost} type="button" onClick={onAddPlayer}>
            <IconPlus /> Joueur
          </button>
          <button className={styles.btnGhost} type="button" onClick={onAddEvent}>
            <IconPlus /> Match / Entraînement
          </button>
        </div>

        <div className={styles.actionRow}>
          <button className={styles.btnEdit} type="button" onClick={onEdit}>
            <IconEdit /> Éditer
          </button>
          <button className={styles.btnDanger} type="button" onClick={onDelete}>
            <IconTrash /> Supprimer
          </button>
        </div>
      </div>
    </article>
  );
}

/* ============================== Composant principal ============================== */
export default function MesEquipes({
  onViewTeam,
}: {
  /** ⚠️ INTÉGRATION 2 — branche ça sur ta page détail équipe.
   *  Si non fourni, on tente router.push(`/equipes/{id}`). */
  onViewTeam?: (teamId: string) => void;
}) {
  const router = useRouter();

  const [teams, setTeams] = useState<Team[]>([]);
  const [ready, setReady] = useState(false);

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [playerFormTeamId, setPlayerFormTeamId] = useState<string | null>(null);
  const [eventTeamId, setEventTeamId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  // Chargement initial
  useEffect(() => {
    setTeams(loadTeams());
    setReady(true);
  }, []);

  // Persistance à chaque changement (après le 1er chargement)
  useEffect(() => {
    if (ready) saveTeams(teams);
  }, [teams, ready]);

  const upsertTeam = (team: Team) => {
    setTeams((prev) => {
      const exists = prev.some((t) => t.id === team.id);
      return exists ? prev.map((t) => (t.id === team.id ? team : t)) : [...prev, team];
    });
    setEditingTeam(null);
  };

  const handleAddPlayer = (teamId: string, raw: any) => {
    const player: Player = { id: raw?.id || uid(), ...raw };
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId ? { ...t, players: [...(t.players ?? []), player] } : t
      )
    );
    setPlayerFormTeamId(null);
  };

  const handleAddEvent = (teamId: string, ev: TeamEvent) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, events: [...(t.events ?? []), ev] } : t))
    );
    setEventTeamId(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setTeams((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const viewTeam = (teamId: string) => {
    if (onViewTeam) onViewTeam(teamId);
    else router.push(`/equipes/${teamId}`);
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h2 className={styles.title}>Mes Équipes</h2>
        <button
          className={styles.btnPrimary}
          type="button"
          onClick={() => setEditingTeam(emptyTeam())}
        >
          <IconPlus /> Nouvelle équipe
        </button>
      </header>

      {ready && teams.length === 0 && (
        <div className={styles.emptyState}>
          <p>Aucune équipe pour l’instant.</p>
          <button
            className={styles.btnPrimary}
            type="button"
            onClick={() => setEditingTeam(emptyTeam())}
          >
            <IconPlus /> Créer ma première équipe
          </button>
        </div>
      )}

      <div className={styles.grid}>
        {teams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            onView={() => viewTeam(team.id)}
            onAddPlayer={() => setPlayerFormTeamId(team.id)}
            onAddEvent={() => setEventTeamId(team.id)}
            onEdit={() => setEditingTeam(team)}
            onDelete={() => setDeleteTarget(team)}
          />
        ))}
      </div>

      {/* Formulaire équipe (création / édition) */}
      {editingTeam && (
        <Modal
          title={teams.some((t) => t.id === editingTeam.id) ? 'Éditer l’équipe' : 'Nouvelle équipe'}
          onClose={() => setEditingTeam(null)}
          width={560}
        >
          <TeamForm
            initial={editingTeam}
            onSave={upsertTeam}
            onCancel={() => setEditingTeam(null)}
          />
        </Modal>
      )}

      {/* PlayerForm existant */}
      {/* PlayerForm existant */}
{playerFormTeamId && (
  <PlayerForm
    isNew
    onClose={() => setPlayerFormTeamId(null)}
    onSave={(playerForm) => {
      handleAddPlayer(playerFormTeamId, playerForm);
    }}
  />
)}
      {/* Modal événement */}
      {eventTeamId && (
        <Modal title="Match / Entraînement" onClose={() => setEventTeamId(null)} width={480}>
          <EventForm
            onSave={(ev) => handleAddEvent(eventTeamId, ev)}
            onCancel={() => setEventTeamId(null)}
          />
        </Modal>
      )}

      {/* Confirmation suppression */}
      {deleteTarget && (
        <Modal title="Supprimer l’équipe" onClose={() => setDeleteTarget(null)} width={420}>
          <div className={styles.confirm}>
            <p>
              Supprimer définitivement <strong>{deleteTarget.name}</strong> ? Cette action est
              irréversible.
            </p>
            <div className={styles.formActions}>
              <button className={styles.btnGhost} type="button" onClick={() => setDeleteTarget(null)}>
                Annuler
              </button>
              <button className={styles.btnDanger} type="button" onClick={confirmDelete}>
                <IconTrash /> Supprimer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}