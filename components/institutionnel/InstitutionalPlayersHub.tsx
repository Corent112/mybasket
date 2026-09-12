"use client";

import { useState } from "react";
import InstitutionalPlayerNotebook from "@/components/institutionnel/InstitutionalPlayerNotebook";
import InstitutionalPlayerWorkflow from "@/components/institutionnel/InstitutionalPlayerWorkflow";
import InstitutionalLinkedEvents from "@/components/institutionnel/InstitutionalLinkedEvents";
import InstitutionalTeamsManager from "@/components/institutionnel/InstitutionalTeamsManager";
import InstitutionalSelectionsManager from "@/components/institutionnel/InstitutionalSelectionsManager";
import InstitutionalPoleRosterV3 from "@/components/institutionnel/InstitutionalPoleRosterV3";

type Props = {
  structureId: string;
  structureType: "committee" | "league" | "federation" | "pole";
};

type View = "teams" | "selections" | "notebook" | "workflow" | "events" | "pole";

export default function InstitutionalPlayersHub({
  structureId,
  structureType,
}: Props) {
  const isPoleContext = structureType === "league" || structureType === "pole";
  const [view, setView] = useState<View>(isPoleContext ? "pole" : "teams");

  return (
    <div className="iph">
      <div className="iphHead">
        <div>
          <p>ÉQUIPES · SÉLECTIONS · JOUEURS</p>
          <h2>
            {isPoleContext
              ? "Le joueur Pôle n'existe qu'une seule fois"
              : "Une seule identité joueur, plusieurs contextes de suivi"}
          </h2>
          <span>
            {isPoleContext
              ? "L'effectif de l'équipe Pôle est désormais la source directe de l'onglet Polistes. Les clubs partenaires restent propriétaires de leurs équipes."
              : "Crée les équipes de l'Institution, les sélections et donne des accès ciblés aux responsables."}
          </span>
        </div>
      </div>

      <nav className="iphTabs">
        {isPoleContext ? (
          <>
            <button className={view === "pole" ? "on" : ""} onClick={() => setView("pole")}>
              Pôle · Polistes · Partenaires
            </button>
            <button className={view === "selections" ? "on" : ""} onClick={() => setView("selections")}>
              Sélections
            </button>
          </>
        ) : (
          <>
            <button className={view === "teams" ? "on" : ""} onClick={() => setView("teams")}>
              Équipes
            </button>
            <button className={view === "selections" ? "on" : ""} onClick={() => setView("selections")}>
              Sélections
            </button>
            <button className={view === "workflow" ? "on" : ""} onClick={() => setView("workflow")}>
              Joueurs
            </button>
            <button className={view === "notebook" ? "on" : ""} onClick={() => setView("notebook")}>
              Cahier de suivi
            </button>
          </>
        )}

        {isPoleContext && (
          <button className={view === "workflow" ? "on" : ""} onClick={() => setView("workflow")}>
            Joueurs · Détection & passations
          </button>
        )}
        <button className={view === "events" ? "on" : ""} onClick={() => setView("events")}>
          Événements & stages
        </button>
      </nav>

      {view === "pole" && isPoleContext && (
        <InstitutionalPoleRosterV3 structureId={structureId} />
      )}

      {view === "teams" && !isPoleContext && (
        <InstitutionalTeamsManager structureId={structureId} structureType={structureType} />
      )}

      {view === "selections" && (
        <InstitutionalSelectionsManager structureId={structureId} structureType={structureType} />
      )}

      {view === "notebook" && !isPoleContext && (
        <InstitutionalPlayerNotebook structureId={structureId} />
      )}

      {view === "workflow" && (
        <InstitutionalPlayerWorkflow structureId={structureId} />
      )}

      {view === "events" && (
        <InstitutionalLinkedEvents structureId={structureId} scope="player" />
      )}

      <style jsx>{`
        .iph{display:grid;gap:22px;padding-bottom:30px}
        .iphHead{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:24px 26px;background:linear-gradient(135deg,#fff,#fff9f3);border:1px solid #eadfd8;border-radius:22px;box-shadow:0 10px 28px rgba(64,28,37,.035)}
        .iphHead p{margin:0;color:#d4a24c;font-size:.69rem;font-weight:1000;letter-spacing:.13em}
        .iphHead h2{margin:5px 0 7px;color:#4d1420;font-size:1.45rem}
        .iphHead span{color:#7f7169;line-height:1.55;max-width:900px;display:block}
        .iphTabs{display:flex;gap:8px;overflow:auto;padding:4px 2px 12px;border-bottom:1px solid #eadfd8}
        .iphTabs button{white-space:nowrap;border:1px solid #e1d4cd;background:#fff;color:#6b1a2c;border-radius:999px;padding:10px 15px;font-weight:950;cursor:pointer;transition:.15s}
        .iphTabs button:hover{border-color:#c99eaa;background:#fff8fa}
        .iphTabs button.on{background:#6b1a2c;color:#fff;border-color:#6b1a2c;box-shadow:0 7px 17px rgba(107,26,44,.16)}
      `}</style>
    </div>
  );
}
