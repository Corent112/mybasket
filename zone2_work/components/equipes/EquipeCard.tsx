'use client';

// components/equipes/EquipeCard.tsx

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  THEME,
  statsEquipe,
  prochainsEvenements,
  labelSexe,
  type Equipe,
} from '../../lib/equipes';
import { Avatar, Badge, Kpi, EventRow, IconButton, Icon } from './ui';

export default function EquipeCard({
  equipe,
  onArchive,
  onDelete,
}: {
  equipe: Equipe;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const router = useRouter();
  const stats = statsEquipe(equipe);
  const prochains = prochainsEvenements(equipe, 3);
  const visibles = equipe.joueurs.slice(0, 8);
  const reste = equipe.joueurs.length - visibles.length;
  const winRate =
    stats.victoires + stats.defaites > 0
      ? Math.round((stats.victoires / (stats.victoires + stats.defaites)) * 100)
      : 0;

  const go = (tab?: string) =>
    router.push(`/equipes/${equipe.id}${tab ? `?tab=${tab}` : ''}`);

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl ${
        equipe.archived ? 'opacity-60' : ''
      }`}
    >
      {/* ===== En-tête : bannière + logo ===== */}
      <div className="relative h-28">
        <div
          className="absolute inset-0"
          style={{
            background: equipe.banniere
              ? `url(${equipe.banniere}) center/cover`
              : `linear-gradient(120deg, ${THEME.bordeauxDark}, ${THEME.bordeaux})`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute right-3 top-3 flex gap-1.5">
          <Badge tone="gold">{equipe.saison}</Badge>
          {equipe.archived && <Badge tone="noir">Archivée</Badge>}
        </div>
        {/* Logo */}
        <div className="absolute -bottom-6 left-5">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white bg-white shadow-md"
            style={{ color: THEME.bordeaux }}
          >
            {equipe.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={equipe.logo} alt={equipe.nom} className="h-full w-full rounded-xl object-cover" />
            ) : (
              <span className="text-3xl">🏀</span>
            )}
          </div>
        </div>
      </div>

      {/* ===== Identité ===== */}
      <div className="px-5 pb-4 pt-8">
        <h3 className="text-lg font-extrabold leading-tight tracking-tight text-neutral-900">{equipe.nom}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone="bordeaux">{equipe.categorie}</Badge>
          <Badge>{labelSexe(equipe.sexe)}</Badge>
          <Badge>{equipe.niveau}</Badge>
          <span className="text-xs text-neutral-400">· {equipe.club}</span>
        </div>
      </div>

      {/* ===== KPI rapides ===== */}
      <div className="grid grid-cols-3 gap-2 px-5">
        <Kpi label="Joueurs" value={stats.joueurs} />
        <Kpi label="Matchs" value={stats.matchs} />
        <Kpi label="Entraîn." value={stats.entrainements} />
        <Kpi label="Victoires" value={stats.victoires} accent="#059669" />
        <Kpi label="Défaites" value={stats.defaites} accent="#dc2626" />
        <Kpi label="Présence" value={`${stats.presence}%`} accent={THEME.gold} />
      </div>

      {/* Barre win-rate */}
      <div className="px-5 pt-3">
        <div className="flex items-center justify-between text-[11px] font-bold text-neutral-400">
          <span>Bilan</span>
          <span>{winRate}% victoires</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full" style={{ width: `${winRate}%`, backgroundColor: THEME.bordeaux }} />
        </div>
      </div>

      {/* ===== Effectif (avatars) ===== */}
      <div className="px-5 pt-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-400">Effectif</p>
        <div className="flex items-center">
          <div className="flex -space-x-2">
            {visibles.map((j) => (
              <Avatar key={j.id} prenom={j.prenom} nom={j.nom} photo={j.photo} size={32} ring />
            ))}
          </div>
          {reste > 0 && (
            <span className="ml-2 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-600">
              +{reste} autres
            </span>
          )}
          {equipe.joueurs.length === 0 && <span className="text-xs text-neutral-400">Aucun joueur</span>}
        </div>
      </div>

      {/* ===== Prochains événements ===== */}
      <div className="px-3 pt-4">
        <p className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-neutral-400">Prochains événements</p>
        {prochains.length > 0 ? (
          <div className="space-y-0.5">
            {prochains.map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </div>
        ) : (
          <p className="px-2 py-1 text-xs text-neutral-400">Aucun événement à venir</p>
        )}
      </div>

      {/* ===== Actions principales ===== */}
      <div className="mt-4 grid grid-cols-2 gap-2 px-5 sm:grid-cols-4">
        <button
          onClick={() => go()}
          className="col-span-2 rounded-lg py-2 text-sm font-extrabold text-white transition hover:opacity-90 sm:col-span-1"
          style={{ backgroundColor: THEME.bordeaux }}
        >
          Voir l’équipe
        </button>
        <ActionLink onClick={() => go('effectif')} icon="users">Effectif</ActionLink>
        <ActionLink onClick={() => go('calendrier')} icon="calendar">Calendrier</ActionLink>
        <ActionLink onClick={() => go('statistiques')} icon="chart">Stats</ActionLink>
      </div>

      {/* ===== Actions rapides ===== */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-neutral-100 px-5 py-3">
        <IconButton name="plus" label="Ajouter un joueur" onClick={() => go('effectif')} />
        <IconButton name="trophy" label="Ajouter un match" onClick={() => go('calendrier')} />
        <IconButton name="whistle" label="Ajouter un entraînement" onClick={() => go('calendrier')} />
        <div className="flex-1" />
        <IconButton name="edit" label="Modifier" onClick={() => router.push(`/equipes/${equipe.id}?edit=1`)} />
        <IconButton
          name="archive"
          label={equipe.archived ? 'Désarchiver' : 'Archiver'}
          onClick={() => onArchive?.(equipe.id)}
        />
        <IconButton name="trash" label="Supprimer" tone="danger" onClick={() => onDelete?.(equipe.id)} />
      </div>
    </article>
  );
}

function ActionLink({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  icon: 'users' | 'calendar' | 'chart';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-2 text-xs font-bold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
    >
      <Icon name={icon} size={14} />
      {children}
    </button>
  );
}