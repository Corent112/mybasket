'use client';

// components/equipes/ui.tsx
// Petits composants réutilisables (avatars, badges, KPI, icônes SVG).

import React from 'react';
import { THEME, initiales, avatarColor, formatDateFr } from '../../lib/equipes';

type EventType = 'match' | 'entrainement' | 'reunion' | 'autre' | string;

type EventResult = {
  pour: number;
  contre: number;
};

type Evenement = {
  id?: string;
  titre?: string | null;
  title?: string | null;
  adversaire?: string | null;
  opponent?: string | null;
  type?: EventType | null;
  date?: string | number | Date | null;
  heure?: string | null;
  time?: string | null;
  lieu?: string | null;
  location?: string | null;
  resultat?: EventResult | null;
  result?: EventResult | null;
};

/* ----------------------------- Avatar ----------------------------- */
export function Avatar({
  prenom = '',
  nom = '',
  photo,
  size = 36,
  ring = false,
}: {
  prenom?: string;
  nom?: string;
  photo?: string;
  size?: number;
  ring?: boolean;
}) {
  const fullName = `${prenom ?? ''} ${nom ?? ''}`.trim();

  const style: React.CSSProperties = {
    width: size,
    height: size,
    backgroundColor: avatarColor(fullName),
    fontSize: size * 0.4,
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${
        ring ? 'ring-2 ring-white' : ''
      }`}
      style={style}
      title={fullName}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={fullName} className="h-full w-full rounded-full object-cover" />
      ) : (
        initiales(fullName)
      )}
    </span>
  );
}

/* ----------------------------- Badge ----------------------------- */
export function Badge({
  children,
  tone = 'gris',
}: {
  children: React.ReactNode;
  tone?: 'gris' | 'bordeaux' | 'gold' | 'noir' | 'vert' | 'rouge';
}) {
  const tones: Record<string, string> = {
    gris: 'bg-neutral-100 text-neutral-700',
    bordeaux: 'text-white',
    gold: 'text-black',
    noir: 'bg-neutral-900 text-white',
    vert: 'bg-emerald-100 text-emerald-700',
    rouge: 'bg-red-100 text-red-700',
  };

  const style =
    tone === 'bordeaux'
      ? { backgroundColor: THEME.bordeaux }
      : tone === 'gold'
        ? { backgroundColor: THEME.gold }
        : undefined;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]}`}
      style={style}
    >
      {children}
    </span>
  );
}

/* ----------------------------- KPI ----------------------------- */
export function Kpi({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white px-3 py-2.5 text-center shadow-sm">
      <div className="text-xl font-extrabold leading-none" style={{ color: accent || THEME.noir }}>
        {value}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-neutral-400">{label}</div>
      {sub && <div className="text-[10px] text-neutral-400">{sub}</div>}
    </div>
  );
}

/* ----------------------------- Event row ----------------------------- */
const EVENT_META: Record<string, { label: string; icon: keyof typeof ICONS; color: string }> = {
  match: { label: 'Match', icon: 'trophy', color: THEME.bordeaux },
  entrainement: { label: 'Entraînement', icon: 'whistle', color: THEME.gold },
  reunion: { label: 'Réunion', icon: 'users', color: '#374151' },
  autre: { label: 'Évènement', icon: 'calendar', color: '#6b7280' },
};

export function EventRow({ ev }: { ev: Evenement }) {
  const eventType = String(ev.type || 'autre');
  const meta = EVENT_META[eventType] ?? EVENT_META.autre;
  const title = String(ev.titre || ev.title || 'Évènement');
  const opponent = ev.adversaire || ev.opponent;
  const time = String(ev.heure || ev.time || '—');
  const location = String(ev.lieu || ev.location || '—');
  const result = ev.resultat || ev.result || null;

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-neutral-50">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor: meta.color }}
      >
        <Icon name={meta.icon} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-neutral-800">
          {title}
          {opponent ? ` · ${opponent}` : ''}
        </p>
        <p className="truncate text-xs text-neutral-400">
          {formatDateFr(ev.date)} · {time} · {location}
        </p>
      </div>
      {result && (
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-extrabold ${
            result.pour > result.contre ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {result.pour}-{result.contre}
        </span>
      )}
    </div>
  );
}

/* ----------------------------- Icônes ----------------------------- */
export const ICONS = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  chart: 'M3 3v18h18M7 16v-5M12 16V8M17 16v-9',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3',
  whistle: 'M3 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0zM15 9l6-3M21 6v4',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  back: 'M19 12H5M12 19l-7-7 7-7',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  video: 'M23 7l-7 5 7 5V7zM1 5h15v14H1z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 0 0 0 4 4.5v15z',
  dumbbell: 'M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12',
  pin: 'M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
} as const;

export function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/* ----------------------------- Icon button ----------------------------- */
export function IconButton({
  name,
  label,
  onClick,
  tone = 'neutral',
}: {
  name: keyof typeof ICONS;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition hover:scale-105 ${
        tone === 'danger'
          ? 'border-red-200 text-red-500 hover:bg-red-50'
          : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
      }`}
    >
      <Icon name={name} size={16} />
    </button>
  );
}
