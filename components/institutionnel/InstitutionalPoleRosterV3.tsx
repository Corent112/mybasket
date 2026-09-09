"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Data = {
  structure?: {
    id: string;
    name: string;
    short_name?: string | null;
    season_label?: string | null;
  };
  poleTeam?: {
    id: string;
    name: string;
    category?: string | null;
  };
  players: any[];
  partners: any[];
};

export default function InstitutionalPoleRosterV3({
  structureId,
}: {
  structureId: string;
}) {
  const [data, setData] = useState<Data>({ players: [], partners: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"pole" | "players" | "partners">("pole");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch(
      `/api/institutionnel/pole-roster?structureId=${encodeURIComponent(
        structureId
      )}`,
      { cache: "no-store" }
    );
    const json = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "Chargement impossible.");
      return;
    }
    setData(json);
  }

  useEffect(() => {
    void load();
  }, [structureId]);

  const teamId = data.poleTeam?.id || "";
  const playerCount = data.players.length;
  const partnerCount = data.partners.length;

  const sortedPlayers = useMemo(
    () =>
      [...data.players].sort((a, b) =>
        `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(
          `${b.last_name || ""} ${b.first_name || ""}`,
          "fr"
        )
      ),
    [data.players]
  );

  if (loading) return <div className="empty">Chargement du Pôle…</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="poleV3">
      <header className="hero">
        <div>
          <p>PÔLE · SOURCE UNIQUE</p>
          <h2>{data.poleTeam?.name || "Pôle"}</h2>
          <span>
            L'effectif de cette équipe est l'effectif des Polistes. Il n'existe
            plus de deuxième liste joueur à maintenir.
          </span>
        </div>
        {teamId && <Link href={`/equipes/${teamId}`}>Ouvrir l'équipe Pôle →</Link>}
      </header>

      <div className="kpis">
        <button onClick={() => setView("pole")}>
          <strong>1</strong>
          <span>Équipe Pôle</span>
        </button>
        <button onClick={() => setView("players")}>
          <strong>{playerCount}</strong>
          <span>Polistes</span>
        </button>
        <button onClick={() => setView("partners")}>
          <strong>{partnerCount}</strong>
          <span>Équipes partenaires</span>
        </button>
      </div>

      <nav className="tabs">
        <button className={view === "pole" ? "on" : ""} onClick={() => setView("pole")}>
          Pôle
        </button>
        <button
          className={view === "players" ? "on" : ""}
          onClick={() => setView("players")}
        >
          Polistes
        </button>
        <button
          className={view === "partners" ? "on" : ""}
          onClick={() => setView("partners")}
        >
          Équipes partenaires
        </button>
      </nav>

      {view === "pole" && (
        <section className="workspace">
          <div className="sectionHead">
            <div>
              <p>ÉQUIPE PRINCIPALE</p>
              <h3>{data.poleTeam?.name}</h3>
              <span>
                Le nom est automatiquement lié au nom de l'Institution. On ne
                crée plus plusieurs équipes Pôle pour la même Institution.
              </span>
            </div>
            {teamId && <Link href={`/equipes/${teamId}`}>Gérer l'équipe →</Link>}
          </div>

          <div className="rule">
            <b>Une seule porte d'entrée</b>
            <span>
              Ajoute, modifie ou supprime un joueur depuis cette équipe. L'onglet
              Polistes lit directement le même effectif : aucune synchronisation
              manuelle et aucun doublon.
            </span>
          </div>

          <div className="preview">
            {sortedPlayers.slice(0, 8).map((player) => (
              <Link
                key={player.id}
                href={`/equipes/${teamId}/${player.id}`}
                className="miniPlayer"
              >
                <Avatar player={player} />
                <span>
                  <b>
                    {player.first_name} {player.last_name}
                  </b>
                  <small>{player.position_primary || "Poste —"}</small>
                </span>
              </Link>
            ))}
            {!sortedPlayers.length && (
              <div className="empty">
                Aucun joueur. Ouvre l'équipe Pôle pour créer le premier poliste.
              </div>
            )}
          </div>
        </section>
      )}

      {view === "players" && (
        <section className="workspace">
          <div className="sectionHead">
            <div>
              <p>POLISTES</p>
              <h3>{playerCount} joueur{playerCount > 1 ? "s" : ""}</h3>
              <span>
                Cette liste est l'effectif réel de {data.poleTeam?.name}. Un joueur
                créé dans l'équipe apparaît ici automatiquement.
              </span>
            </div>
            {teamId && <Link href={`/equipes/${teamId}`}>+ Ajouter via l'équipe Pôle</Link>}
          </div>

          <div className="playerGrid">
            {sortedPlayers.map((player) => (
              <article key={player.id}>
                <div className="playerTop">
                  <Avatar player={player} />
                  <div>
                    <h4>
                      {player.first_name} {player.last_name}
                    </h4>
                    <p>
                      {player.position_primary || "Poste —"}
                      {player.position_secondary
                        ? ` · ${player.position_secondary}`
                        : ""}
                    </p>
                    <small>
                      {player.height ? `${player.height} cm` : "Taille —"} ·{" "}
                      {player.weight ? `${player.weight} kg` : "Poids —"}
                    </small>
                  </div>
                </div>

                <div className="badges">
                  <span>RPE</span>
                  <span>Charge</span>
                  <span>Entraînements</span>
                  <span>Grille de tir</span>
                  <span>Stats</span>
                  <span>Vidéo</span>
                </div>

                <Link href={`/equipes/${teamId}/${player.id}`}>
                  Ouvrir la fiche complète →
                </Link>
              </article>
            ))}
            {!sortedPlayers.length && (
              <div className="empty">
                Aucun poliste. Crée le joueur depuis l'équipe Pôle.
              </div>
            )}
          </div>
        </section>
      )}

      {view === "partners" && (
        <section className="workspace">
          <div className="sectionHead">
            <div>
              <p>ÉQUIPES PARTENAIRES</p>
              <h3>Consultation uniquement</h3>
              <span>
                Le club reste propriétaire de son équipe. L'Institution ne crée
                pas ses joueurs, ne modifie pas son effectif et ne devient pas
                administrateur de l'équipe.
              </span>
            </div>
          </div>

          <div className="partnerGrid">
            {data.partners.map((partner) => (
              <article key={partner.id}>
                <div className="partnerHead">
                  <span className="consult">CONSULTATION</span>
                  <h4>{partner.team?.name || "Équipe partenaire"}</h4>
                  <p>
                    {partner.team?.club_name || "Club"} ·{" "}
                    {partner.team?.category || "Catégorie —"}
                  </p>
                </div>
                <div className="permissions">
                  <span>✓ Données partagées</span>
                  <span>✓ Suivi du poliste</span>
                  <span>× Administration équipe</span>
                  <span>× Gestion des autres joueurs</span>
                </div>
                <div className="consultOnly">
                  Le détail accessible dépend des droits accordés par le club.
                </div>
              </article>
            ))}
            {!data.partners.length && (
              <div className="empty">
                Aucune équipe partenaire reliée pour le moment.
              </div>
            )}
          </div>
        </section>
      )}

      <style jsx>{`
        .poleV3{display:grid;gap:14px}
        .hero,.sectionHead{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
        .hero p,.sectionHead p{margin:0;color:#d4a24c;font-size:.66rem;font-weight:1000;letter-spacing:.12em}
        .hero h2,.sectionHead h3{margin:4px 0;color:#6b1a2c}
        .hero span,.sectionHead span{color:#786b65;line-height:1.45}
        .hero a,.sectionHead a{background:#6b1a2c;color:#fff;text-decoration:none;border-radius:9px;padding:10px 13px;font-weight:900;white-space:nowrap}
        .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .kpis button{border:1px solid #eadfd8;background:#fff;border-radius:12px;padding:13px;text-align:left;cursor:pointer}
        .kpis strong{display:block;color:#6b1a2c;font-size:1.4rem}.kpis span{color:#796c66;font-weight:800}
        .tabs{display:flex;gap:6px;border-bottom:1px solid #eadfd8;padding-bottom:8px}
        .tabs button{border:1px solid #e1d4cd;background:#fff;color:#6b1a2c;border-radius:999px;padding:8px 12px;font-weight:900;cursor:pointer}
        .tabs button.on{background:#6b1a2c;color:#fff;border-color:#6b1a2c}
        .workspace{display:grid;gap:13px}
        .rule{border-left:4px solid #d4a24c;background:#fff9ec;border-radius:9px;padding:13px;display:grid;gap:3px}
        .rule b{color:#6b1a2c}.rule span{color:#756862;font-size:.78rem}
        .preview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
        :global(.miniPlayer){display:flex;gap:8px;align-items:center;border:1px solid #eadfd8;border-radius:11px;padding:9px;text-decoration:none;color:#34272a;background:#fff}
        :global(.miniPlayer span){display:grid}:global(.miniPlayer small){color:#887a73}
        .avatar{width:46px;height:46px;border-radius:50%;overflow:hidden;background:#6b1a2c;color:#fff;display:grid;place-items:center;font-weight:1000;flex:0 0 auto}
        .avatar img{width:100%;height:100%;object-fit:cover}
        .playerGrid,.partnerGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
        .playerGrid article,.partnerGrid article{border:1px solid #eadfd8;border-radius:13px;padding:13px;background:#fff}
        .playerTop{display:flex;gap:10px;align-items:center}.playerTop h4,.partnerHead h4{margin:0;color:#35272a}.playerTop p,.partnerHead p{margin:2px 0;color:#786b65}.playerTop small{color:#9a8c84}
        .badges{display:flex;flex-wrap:wrap;gap:4px;margin:11px 0}.badges span{background:#f7edda;color:#6b1a2c;border-radius:999px;padding:4px 7px;font-size:.62rem;font-weight:900}
        .playerGrid article>a{display:inline-block;text-decoration:none;color:#6b1a2c;font-weight:900;font-size:.78rem}
        .consult{display:inline-flex;background:#f7edda;color:#6b1a2c;border-radius:999px;padding:5px 8px;font-size:.6rem;font-weight:1000;letter-spacing:.08em;margin-bottom:7px}
        .permissions{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:11px;font-size:.72rem;color:#756862}
        .consultOnly{margin-top:10px;padding-top:9px;border-top:1px solid #eee4df;color:#9a8b84;font-size:.7rem}
        .empty{grid-column:1/-1;border:1px dashed #ddcfc8;border-radius:12px;padding:22px;text-align:center;color:#897a73}
        .error{border:1px solid #efc8c8;background:#fff3f3;color:#8a2424;border-radius:10px;padding:12px}
        @media(max-width:900px){.hero,.sectionHead{flex-direction:column}.preview{grid-template-columns:repeat(2,1fr)}.playerGrid,.partnerGrid{grid-template-columns:1fr}}
        @media(max-width:600px){.kpis,.preview{grid-template-columns:1fr}.tabs{overflow:auto}.permissions{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}

function Avatar({ player }: { player: any }) {
  return (
    <span className="avatar">
      {player.photo_url ? (
        <img src={player.photo_url} alt="" />
      ) : (
        `${player.first_name?.[0] || ""}${player.last_name?.[0] || ""}` || "?"
      )}
      <style jsx>{`
        .avatar{width:46px;height:46px;border-radius:50%;overflow:hidden;background:#6b1a2c;color:#fff;display:grid;place-items:center;font-weight:1000;flex:0 0 auto}
        .avatar img{width:100%;height:100%;object-fit:cover}
      `}</style>
    </span>
  );
}
