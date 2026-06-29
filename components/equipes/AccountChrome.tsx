// components/equipe/AccountChrome.tsx
// Cadre commun « Mon compte » : header d'app + bandeau noir + en-tête profil
// + sidebar de navigation. Réutilisé par /equipes et /management.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "../../lib/equipes-store";
import type { UserProfile } from "../../types/player";
import { emptyProfile } from "../../types/player";

const TOPNAV = ["Bibliothèque", "Plaquette", "Accompagnement", "Annonces", "Abonnements", "Boutique"];

// [emoji, label, route?] — route undefined = lien décoratif
const NAV: [string, string, string?][] = [
  ["👤", "Mon Profil"],
  ["💬", "Messagerie"],
  ["❤️", "Mes Favoris"],
  ["🎟️", "Mes Réservations"],
  ["💳", "Mon Abonnement"],
  ["🗓️", "Mon Calendrier"],
  ["🏀", "Mes Exercices"],
  ["📋", "Mes Playbooks"],
  ["⚡", "Mon Profil Coach"],
  ["📣", "Mes Annonces"],
  ["💰", "Mes Revenus"],
  ["📄", "Mes Papiers"],
  ["👥", "Mes Equipes", "/equipes"],
  ["📊", "Management", "/management"],
];

export default function AccountChrome({
  active,
  onEditProfile,
  children,
}: {
  active: string; // libellé de l'onglet actif
  onEditProfile?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>(emptyProfile());

  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      const profile = await getProfile();
      if (alive) setProfile(profile);
    }

    loadProfile();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="acc-wrap">
      <header className="acc-appbar">
        <div className="acc-brand">
          <span className="logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e0a82e" strokeWidth="1.7">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2c3.5 3 3.5 17 0 20M12 2c-3.5 3-3.5 17 0 20" />
            </svg>
          </span>
          <span>MY<br />BASKET</span>
        </div>
        <nav className="acc-nav">
          {TOPNAV.map((n) => (
            <a key={n}>{n}</a>
          ))}
        </nav>
        <span className="sp" />
        <span className="acc-pill">🇫🇷 FR ▾</span>
        <span className="acc-admin">🏀 Admin MyBasket <span className="o">▾</span></span>
      </header>
      <div className="acc-subbar">
        <span className="burger">☰</span>
        <span className="acc-search">🔍 Rechercher…</span>
        <span className="ico">▦</span>
        <span className="ico">♡</span>
        <span className="ico">🛒</span>
      </div>

      <button className="acc-back" onClick={() => router.back()}>← Retour</button>

      <div className="acc-profile">
        <div className="acc-avatar">
          {profile.photo ? <img src={profile.photo} alt="" /> : (profile.prenom?.[0] || "?")}
        </div>
        <div>
          <h2 className="acc-pname">{profile.prenom} {profile.nom}</h2>
          <div className="acc-pclub">🅿️ {profile.club}</div>
          <div className="acc-pmeta">
            {profile.dob}
            <br />
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <br />
            {profile.telephone}
          </div>
        </div>
        {onEditProfile && (
          <button className="acc-modify" onClick={onEditProfile}>Modifier les informations</button>
        )}
      </div>

      <hr className="acc-sep" />

      <div className="acc-body">
        <aside className="acc-side">
          {NAV.map(([em, label, route]) => (
            <a
              key={label}
              className={label === active ? "active" : ""}
              onClick={() => route && router.push(route)}
            >
              <span className="em">{em}</span> {label}
            </a>
          ))}
          <a className="danger"><span className="em">⚡</span> Administration</a>
          <hr />
          <a><span className="em">⚙️</span> Paramètres</a>
          <a className="danger"><span className="em">🚪</span> Déconnexion</a>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
