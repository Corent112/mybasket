// components/equipe/Sidebar.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import type React from "react";

const ICONS: Record<string, React.ReactNode> = {
  accueil: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  equipe: <path d="M17 20v-2a4 4 0 0 0-3-3.87M7 20v-2a4 4 0 0 1 3-3.87M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />,
  seances: <path d="M4 5h16M4 12h16M4 19h10" />,
  matchs: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20" />,
  stats: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  messagerie: <path d="M4 5h16v11H8l-4 4V5Z" />,
  video: <path d="M4 6h12v12H4zM16 9l5-3v12l-5-3" />,
  calendrier: <path d="M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" />,
  parametres: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3a8 8 0 0 1-.2 1.8l2 1.5-2 3.4-2.3-1a8 8 0 0 1-3 1.8L12 23h-4l-.5-2.7a8 8 0 0 1-3-1.8l-2.3 1-2-3.4 2-1.5A8 8 0 0 1 2 12" />,
};

const NAV: { key: string; label: string; href?: string }[] = [
  { key: "accueil", label: "Accueil" },
  { key: "equipe", label: "Équipe", href: "/equipes" },
  { key: "seances", label: "Séances" },
  { key: "matchs", label: "Matchs" },
  { key: "stats", label: "Statistiques" },
  { key: "messagerie", label: "Messagerie" },
  { key: "video", label: "Vidéo" },
  { key: "calendrier", label: "Calendrier" },
  { key: "parametres", label: "Paramètres" },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const isEquipe = pathname.startsWith("/equipes");

  return (
    <aside className="mbk-side">
      <div className="mbk-logo">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f47b20" strokeWidth="1.7">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2c3.5 3 3.5 17 0 20M12 2c-3.5 3-3.5 17 0 20" />
        </svg>
        <span>
          <span className="my">MY</span>
          <span className="basket">BASKET</span>
        </span>
      </div>
      <nav className="mbk-nav">
        {NAV.map((n) => (
          <a
            key={n.key}
            className={n.key === "equipe" && isEquipe ? "active" : ""}
            onClick={() => n.href && router.push(n.href)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[n.key]}
            </svg>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="mbk-side-foot">
        🗓 Saison
        <br />
        <b style={{ color: "#fff" }}>2025 / 2026</b>
      </div>
    </aside>
  );
}
