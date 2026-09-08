"use client";

import { useState } from "react";
import InstitutionalPlayerNotebook from "@/components/institutionnel/InstitutionalPlayerNotebook";
import InstitutionalPolePerformance from "@/components/institutionnel/InstitutionalPolePerformance";
import InstitutionalPlayerWorkflow from "@/components/institutionnel/InstitutionalPlayerWorkflow";
import InstitutionalLinkedEvents from "@/components/institutionnel/InstitutionalLinkedEvents";
import InstitutionalTeamsManager from "@/components/institutionnel/InstitutionalTeamsManager";
import InstitutionalSelectionsManager from "@/components/institutionnel/InstitutionalSelectionsManager";

type Props = {
  structureId: string;
  structureType: "committee" | "league" | "federation" | "pole";
};

type View =
  | "teams"
  | "selections"
  | "notebook"
  | "workflow"
  | "events"
  | "pole";

export default function InstitutionalPlayersHub({
  structureId,
  structureType,
}: Props) {
  const [view, setView] = useState<View>("teams");
  const showPole = structureType === "league" || structureType === "pole";

  return (
    <div className="iph">
      <div className="iphHead">
        <div>
          <p>ÉQUIPES · SÉLECTIONS · JOUEURS</p>
          <h2>Une seule identité joueur, plusieurs contextes de suivi</h2>
          <span>
            Crée les équipes de l’Institution, les sélections, associe les mêmes
            joueurs à plusieurs équipes et donne des accès ciblés aux coachs et
            responsables.
          </span>
        </div>
      </div>

      <nav className="iphTabs">
        <button
          className={view === "teams" ? "on" : ""}
          onClick={() => setView("teams")}
        >
          Équipes
        </button>
        <button
          className={view === "selections" ? "on" : ""}
          onClick={() => setView("selections")}
        >
          Sélections
        </button>
        <button
          className={view === "notebook" ? "on" : ""}
          onClick={() => setView("notebook")}
        >
          Joueurs / Cahier
        </button>
        <button
          className={view === "workflow" ? "on" : ""}
          onClick={() => setView("workflow")}
        >
          Détection & passations
        </button>
        <button
          className={view === "events" ? "on" : ""}
          onClick={() => setView("events")}
        >
          Événements & stages
        </button>
        {showPole && (
          <button
            className={view === "pole" ? "on" : ""}
            onClick={() => setView("pole")}
          >
            Pôle / Performance
          </button>
        )}
      </nav>

      {view === "teams" && (
        <InstitutionalTeamsManager
          structureId={structureId}
          structureType={structureType}
        />
      )}

      {view === "selections" && (
        <InstitutionalSelectionsManager
          structureId={structureId}
          structureType={structureType}
        />
      )}

      {view === "notebook" && (
        <InstitutionalPlayerNotebook structureId={structureId} />
      )}

      {view === "workflow" && (
        <InstitutionalPlayerWorkflow structureId={structureId} />
      )}

      {view === "events" && (
        <InstitutionalLinkedEvents structureId={structureId} scope="player" />
      )}

      {view === "pole" && showPole && (
        <InstitutionalPolePerformance structureId={structureId} />
      )}

      <style jsx>{`
        .iph {
          display: grid;
          gap: 12px;
        }

        .iphHead {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }

        .iphHead p {
          margin: 0;
          color: #d4a24c;
          font-size: 0.68rem;
          font-weight: 1000;
          letter-spacing: 0.12em;
        }

        .iphHead h2 {
          margin: 3px 0;
          color: #251a1b;
        }

        .iphHead span {
          color: #7f7169;
        }

        .iphTabs {
          display: flex;
          gap: 6px;
          overflow: auto;
          border-bottom: 1px solid #eadfd8;
          padding-bottom: 8px;
        }

        .iphTabs button {
          white-space: nowrap;
          border: 1px solid #e1d4cd;
          background: #fff;
          color: #6b1a2c;
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .iphTabs button.on {
          background: #6b1a2c;
          color: #fff;
          border-color: #6b1a2c;
        }
      `}</style>
    </div>
  );
}
