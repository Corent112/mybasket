"use client";

// components/club/ClubManagementPro.tsx
import { useEffect, useMemo, useState } from "react";

import CreneauxPlanner from "@/components/club/CreneauxPlanner";
import ClubTeamsActiveSection from "@/components/club/ClubTeamsActiveSection";
import ClubCoachesActiveSection from "@/components/club/ClubCoachesActiveSection";
import ClubCalendarEngineSection from "@/components/club/ClubCalendarEngineSection";
import ClubConvocationsSection from "@/components/club/ClubConvocationsSection";
import ClubCotisationsSection from "@/components/club/ClubCotisationsSection";
import ClubRelancesSection from "@/components/club/ClubRelancesSection";
import ClubDriveSection from "@/components/club/ClubDriveSection";
import ClubCommunicationProSection from "@/components/club/ClubCommunicationProSection";
import ClubMailingListsSection from "@/components/club/ClubMailingListsSection";
import ClubPerformanceProSection from "@/components/club/ClubPerformanceProSection";
import ClubSettingsProSection from "@/components/club/ClubSettingsProSection";
import ClubFinanceProSection from "@/components/club/ClubFinanceProSection";
import ClubAuditExportsSection from "@/components/club/ClubAuditExportsSection";
import ClubIntelligencePresidentSection from "@/components/club/ClubIntelligencePresidentSection";

type ClubManagementProProps = {
  clubId: string;
  clubName?: string | null;
};

const TABS = [
  { key: "intelligence", label: "Dashboard", icon: "📊" },
  { key: "equipes", label: "Équipes", icon: "🏀" },
  { key: "coachs", label: "Coachs", icon: "👤" },
  { key: "planning", label: "Créneaux", icon: "🗓️" },
  { key: "calendrier", label: "Calendrier", icon: "📅" },
  { key: "convocations", label: "Convocations", icon: "📣" },
  { key: "drive", label: "Documents", icon: "📁" },
  { key: "communication", label: "Communication", icon: "✉️" },
  { key: "mailing", label: "Mailings", icon: "📬" },
  { key: "cotisations", label: "Cotisations", icon: "💳" },
  { key: "relances", label: "Relances", icon: "🔔" },
  { key: "finance", label: "Finance", icon: "💰" },
  { key: "performance", label: "Performance", icon: "📈" },
  { key: "audit", label: "Exports", icon: "🧾" },
  { key: "parametres", label: "Paramètres", icon: "⚙️" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STORAGE_KEY = "mybasket_club_management_active_tab";

export default function ClubManagementPro({
  clubId,
  clubName,
}: ClubManagementProProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("intelligence");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as TabKey | null;

    if (saved && TABS.some((tab) => tab.key === saved)) {
      setActiveTab(saved);
    }
  }, []);

  function changeTab(key: TabKey) {
    setActiveTab(key);
    window.localStorage.setItem(STORAGE_KEY, key);
  }

  const title = useMemo(() => {
    return TABS.find((tab) => tab.key === activeTab)?.label || "Club";
  }, [activeTab]);

  const safeClubName = clubName || "Mon club";

  return (
    <section className="clubManagement">
      <header className="hero">
        <div>
          <p>ESPACE CLUB</p>
          <h1>{safeClubName}</h1>
          <span>
            Gestion club : équipes, coachs, calendrier, convocations, documents,
            communication, cotisations et finances.
          </span>
        </div>

        <div className="heroBadge">
          <strong>{title}</strong>
          <span>Club connecté</span>
        </div>
      </header>

      <nav className="tabs" aria-label="Navigation espace club">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? "active" : ""}
            onClick={() => changeTab(tab.key)}
            type="button"
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {activeTab === "intelligence" && (
          <ClubIntelligencePresidentSection clubId={clubId} />
        )}

        {activeTab === "equipes" && (
          <ClubTeamsActiveSection clubId={clubId} />
        )}

        {activeTab === "coachs" && (
          <ClubCoachesActiveSection clubId={clubId} clubName={safeClubName} />
        )}

        {activeTab === "planning" && <CreneauxPlanner clubId={clubId} />}

        {activeTab === "calendrier" && (
          <ClubCalendarEngineSection clubId={clubId} />
        )}

        {activeTab === "convocations" && (
          <ClubConvocationsSection clubId={clubId} />
        )}

        {activeTab === "drive" && <ClubDriveSection clubId={clubId} />}

        {activeTab === "communication" && (
          <ClubCommunicationProSection
            clubId={clubId}
            clubName={safeClubName}
          />
        )}

        {activeTab === "mailing" && (
          <ClubMailingListsSection clubId={clubId} />
        )}

        {activeTab === "cotisations" && (
          <ClubCotisationsSection clubId={clubId} />
        )}

        {activeTab === "relances" && (
          <ClubRelancesSection clubId={clubId} clubName={safeClubName} />
        )}

        {activeTab === "finance" && (
          <ClubFinanceProSection clubId={clubId} />
        )}

        {activeTab === "performance" && (
          <ClubPerformanceProSection clubId={clubId} />
        )}

        {activeTab === "audit" && (
          <ClubAuditExportsSection clubId={clubId} />
        )}

        {activeTab === "parametres" && (
          <ClubSettingsProSection clubId={clubId} />
        )}
      </main>

      <style jsx>{`
        .clubManagement {
          display: grid;
          gap: 18px;
          font-family: Roboto, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }

        .hero {
          border: 1px solid #eadfd5;
          border-radius: 32px;
          background:
            radial-gradient(
              circle at 15% 20%,
              rgba(212, 162, 76, 0.22),
              transparent 28%
            ),
            linear-gradient(135deg, #6b1a2c, #35101a);
          color: white;
          padding: 28px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 24px;
          box-shadow: 0 24px 80px rgba(107, 26, 44, 0.22);
          overflow: hidden;
        }

        .hero p {
          margin: 0 0 8px;
          color: #d4a24c;
          font-weight: 900;
          letter-spacing: 0.16em;
          font-size: 0.75rem;
        }

        .hero h1 {
          margin: 0;
          font-family: "Alfa Slab One", serif;
          font-size: clamp(2rem, 4vw, 4rem);
          font-weight: 400;
          line-height: 1;
        }

        .hero span {
          display: block;
          margin-top: 10px;
          color: #f8e8c8;
          font-weight: 800;
          max-width: 760px;
        }

        .heroBadge {
          min-width: 190px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(14px);
          border-radius: 24px;
          padding: 16px;
          text-align: right;
        }

        .heroBadge strong {
          display: block;
          color: #fff;
          font-size: 1.05rem;
        }

        .heroBadge span {
          margin-top: 4px;
          color: #d4a24c;
          font-size: 0.78rem;
        }

        .tabs {
          border: 1px solid #eadfd5;
          border-radius: 28px;
          background: #fff;
          padding: 10px;
          display: flex;
          gap: 8px;
          overflow-x: auto;
          box-shadow: 0 16px 50px rgba(0, 0, 0, 0.04);
        }

        .tabs button {
          appearance: none;
          border: 1px solid transparent;
          background: #fffaf2;
          color: #6b1a2c;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 900;
          white-space: nowrap;
          cursor: pointer;
          display: flex;
          gap: 7px;
          align-items: center;
          transition: 0.18s ease;
        }

        .tabs button:hover {
          transform: translateY(-1px);
          border-color: #eadfd5;
        }

        .tabs button.active {
          background: #6b1a2c;
          color: #fff;
          box-shadow: 0 10px 24px rgba(107, 26, 44, 0.22);
        }

        .content {
          min-height: 520px;
        }

        @media (max-width: 780px) {
          .hero {
            display: grid;
          }

          .heroBadge {
            text-align: left;
            min-width: 0;
          }
        }
      `}</style>
    </section>
  );
}