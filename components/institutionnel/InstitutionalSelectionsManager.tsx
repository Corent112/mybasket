"use client";

import { useEffect, useMemo, useState } from "react";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  birthdate: string | null;
  club_name: string | null;
  category: string | null;
  linked_user_id: string | null;
};

type SecondaryTeam = {
  id: string;
  team_id: string;
  kind: string;
  team?: { id: string; name: string; category: string | null } | null;
};

type SelectionPlayer = {
  id: string;
  player_id: string;
  team_player_id: string | null;
  secondary_team_id: string | null;
  secondary_team_player_id: string | null;
  player?: Player | null;
};

type Selection = {
  id: string;
  team_id: string;
  name: string;
  category: string | null;
  season_label: string | null;
  gender: string | null;
  staff?: Array<{
    id: string;
    email: string;
    role: string;
    access_level: string;
    status: string;
  }>;
  players?: SelectionPlayer[];
};

type Props = {
  structureId: string;
  structureType: "committee" | "league" | "federation" | "pole";
};

export default function InstitutionalSelectionsManager({
  structureId,
  structureType,
}: Props) {
  const [rows, setRows] = useState<Selection[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [secondaryTeams, setSecondaryTeams] = useState<SecondaryTeam[]>([]);
  const [opened, setOpened] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: structureType === "federation" ? "Équipe de France U16" : "Sélection U13",
    category: structureType === "federation" ? "U16" : "U13",
    seasonLabel: "2026-2027",
    gender: "",
  });
  const [newPlayer, setNewPlayer] = useState({
    firstName: "",
    lastName: "",
    birthdate: "",
    sex: "",
    clubName: "",
    category: "",
  });
  const [existingPlayer, setExistingPlayer] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState("Responsable sélection");
  const [linkUserEmail, setLinkUserEmail] = useState<Record<string, string>>({});
  const [teamChoice, setTeamChoice] = useState<Record<string, string>>({});

  const current = useMemo(
    () => rows.find((row) => row.id === opened) || null,
    [rows, opened]
  );

  async function load() {
    const [selectionRes, playerRes, teamRes] = await Promise.all([
      fetch(
        `/api/institutionnel/sport/selections?structureId=${encodeURIComponent(
          structureId
        )}`,
        { cache: "no-store" }
      ),
      fetch(
        `/api/institutionnel/sport/players?structureId=${encodeURIComponent(
          structureId
        )}`,
        { cache: "no-store" }
      ),
      fetch(
        `/api/institutionnel/sport/teams?structureId=${encodeURIComponent(
          structureId
        )}`,
        { cache: "no-store" }
      ),
    ]);

    const [selectionJson, playerJson, teamJson] = await Promise.all([
      selectionRes.json().catch(() => ({})),
      playerRes.json().catch(() => ({})),
      teamRes.json().catch(() => ({})),
    ]);

    if (!selectionRes.ok)
      return setMessage(selectionJson.error || "Chargement impossible.");

    setRows(selectionJson.selections || []);
    setAllPlayers(playerJson.players || []);
    setSecondaryTeams(
      (teamJson.teams || []).filter((row: SecondaryTeam) => row.kind === "secondary")
    );
  }

  useEffect(() => {
    void load();
  }, [structureId]);

  async function createSelection() {
    if (!form.name.trim()) return alert("Nom obligatoire.");
    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/selections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structureId, ...form }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return alert(json.error || "Création impossible.");

    setShowCreate(false);
    setMessage("Sélection créée avec son équipe MyBasket associée.");
    await load();
    if (json.selection?.id) setOpened(json.selection.id);
  }

  async function createPlayer() {
    if (!current) return;
    if (!newPlayer.firstName.trim() || !newPlayer.lastName.trim()) {
      return alert("Prénom et nom obligatoires.");
    }

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        mode: "create",
        selectionId: current.id,
        firstName: newPlayer.firstName.trim(),
        lastName: newPlayer.lastName.trim(),
        birthdate: newPlayer.birthdate || null,
        sex: newPlayer.sex || null,
        clubName: newPlayer.clubName.trim() || null,
        category: newPlayer.category.trim() || current.category || null,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return alert(json.error || "Création du joueur impossible.");

    setNewPlayer({
      firstName: "",
      lastName: "",
      birthdate: "",
      sex: "",
      clubName: "",
      category: "",
    });
    setMessage("Joueur créé et ajouté à la sélection.");
    await load();
  }

  async function addExistingPlayer() {
    if (!current || !existingPlayer) return;

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        mode: "attach",
        selectionId: current.id,
        playerId: existingPlayer,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return alert(json.error || "Ajout impossible.");

    setExistingPlayer("");
    setMessage("Joueur existant ajouté à la sélection sans dupliquer son identité.");
    await load();
  }

  async function addSelectionStaff() {
    if (!current || !staffEmail.includes("@")) return alert("Email invalide.");

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        scope: "selection",
        selectionId: current.id,
        email: staffEmail.trim().toLowerCase(),
        role: staffRole.trim() || "Responsable sélection",
        accessLevel: "premium",
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return alert(json.error || "Accès impossible.");

    setStaffEmail("");
    setMessage(
      json.invited
        ? "Responsable invité. La sélection apparaîtra dans Mes équipes après activation."
        : "Responsable ajouté à la sélection."
    );
    await load();
  }

  async function associateSecondary(playerId: string) {
    if (!current) return;
    const secondaryTeamId = teamChoice[playerId];
    if (!secondaryTeamId) return alert("Choisis une équipe secondaire.");

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        mode: "associate_secondary",
        selectionId: current.id,
        playerId,
        secondaryTeamId,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return alert(json.error || "Association impossible.");

    setMessage(
      "Joueur associé à l’équipe secondaire. Sa même identité institutionnelle relie désormais les deux contextes."
    );
    await load();
  }

  async function linkUser(playerId: string) {
    const email = (linkUserEmail[playerId] || "").trim().toLowerCase();
    if (!email.includes("@")) return alert("Email utilisateur invalide.");

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        scope: "player_account",
        playerId,
        email,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return alert(json.error || "Association impossible.");

    setLinkUserEmail((v) => ({ ...v, [playerId]: "" }));
    setMessage(
      json.invited
        ? "Compte joueur invité et associé à la fiche."
        : "Compte utilisateur associé à la fiche joueur."
    );
    await load();
  }

  return (
    <div className="selections">
      {message && <div className="notice">✓ {message}</div>}

      <div className="head">
        <div>
          <small>SÉLECTIONS</small>
          <h3>Groupes de suivi institutionnels</h3>
          <p>
            Comité, Ligue, Pôle ou Fédération : une sélection possède son
            effectif, ses responsables et une équipe MyBasket complète pour les
            stats, la vidéo, le LiveStat, la grille de tir et les autres outils
            Premium.
          </p>
        </div>
        <button className="primary" onClick={() => setShowCreate((v) => !v)}>
          + Nouvelle sélection
        </button>
      </div>

      {showCreate && (
        <div className="createSelection">
          <input
            placeholder="Nom de la sélection"
            value={form.name}
            onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
          />
          <input
            placeholder="Catégorie"
            value={form.category}
            onChange={(e) =>
              setForm((v) => ({ ...v, category: e.target.value }))
            }
          />
          <input
            placeholder="Saison"
            value={form.seasonLabel}
            onChange={(e) =>
              setForm((v) => ({ ...v, seasonLabel: e.target.value }))
            }
          />
          <select
            value={form.gender}
            onChange={(e) => setForm((v) => ({ ...v, gender: e.target.value }))}
          >
            <option value="">Mixte / non défini</option>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
          <button className="primary" disabled={busy} onClick={createSelection}>
            {busy ? "Création…" : "Créer"}
          </button>
        </div>
      )}

      <div className="selectionGrid">
        {rows.map((row) => (
          <button
            className={opened === row.id ? "selectionCard on" : "selectionCard"}
            key={row.id}
            onClick={() => setOpened(row.id)}
          >
            <b>{row.name}</b>
            <span>
              {row.category || "—"} · {row.season_label || "—"}
            </span>
            <small>
              {row.players?.length || 0} joueur(s) · {row.staff?.length || 0} responsable(s)
            </small>
          </button>
        ))}
        {!rows.length && (
          <div className="empty">Aucune sélection créée.</div>
        )}
      </div>

      {current && (
        <section className="detail">
          <div className="detailHead">
            <div>
              <small>SÉLECTION ACTIVE</small>
              <h3>{current.name}</h3>
              <p>
                {current.category || "—"} · {current.season_label || "—"}
              </p>
            </div>
            <div className="detailActions">
              <a href={`/equipes/${current.team_id}`}>Ouvrir l’équipe complète →</a>
              <button
                type="button"
                onClick={() =>
                  alert(
                    "Emplacement réservé : export PDF de la fiche joueur et envoi depuis l’Institution. Le moteur PDF sera raccordé dans l’étape suivante."
                  )
                }
              >
                PDF / Envoyer des fiches
              </button>
            </div>
          </div>

          <div className="twoCols">
            <div className="panel">
              <h4>Responsables de la sélection</h4>
              <p>
                Ils obtiennent un accès Premium à cette sélection et la voient
                dans leur onglet Mes équipes.
              </p>
              <div className="inline">
                <input
                  type="email"
                  placeholder="bernard@email.fr"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                />
                <input
                  placeholder="Responsable sélection"
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                />
                <button
                  className="primary"
                  disabled={busy}
                  onClick={addSelectionStaff}
                >
                  Ajouter
                </button>
              </div>
              <div className="chips">
                {current.staff?.map((member) => (
                  <span key={member.id}>
                    {member.email} · {member.role}
                  </span>
                ))}
              </div>
            </div>

            <div className="panel">
              <h4>Ajouter un joueur existant</h4>
              <p>
                La fiche centrale n’est pas dupliquée : on ajoute seulement un
                nouveau contexte de sélection.
              </p>
              <div className="inline">
                <select
                  value={existingPlayer}
                  onChange={(e) => setExistingPlayer(e.target.value)}
                >
                  <option value="">Choisir un joueur…</option>
                  {allPlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.last_name} {player.first_name}
                    </option>
                  ))}
                </select>
                <button
                  className="primary"
                  disabled={busy || !existingPlayer}
                  onClick={addExistingPlayer}
                >
                  Ajouter
                </button>
              </div>
            </div>
          </div>

          <div className="panel">
            <h4>Créer un nouveau joueur</h4>
            <div className="newPlayer">
              <input
                placeholder="Prénom"
                value={newPlayer.firstName}
                onChange={(e) =>
                  setNewPlayer((v) => ({ ...v, firstName: e.target.value }))
                }
              />
              <input
                placeholder="Nom"
                value={newPlayer.lastName}
                onChange={(e) =>
                  setNewPlayer((v) => ({ ...v, lastName: e.target.value }))
                }
              />
              <input
                type="date"
                value={newPlayer.birthdate}
                onChange={(e) =>
                  setNewPlayer((v) => ({ ...v, birthdate: e.target.value }))
                }
              />
              <select
                value={newPlayer.sex}
                onChange={(e) =>
                  setNewPlayer((v) => ({ ...v, sex: e.target.value }))
                }
              >
                <option value="">Sexe</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
              <input
                placeholder="Club actuel"
                value={newPlayer.clubName}
                onChange={(e) =>
                  setNewPlayer((v) => ({ ...v, clubName: e.target.value }))
                }
              />
              <input
                placeholder="Catégorie"
                value={newPlayer.category}
                onChange={(e) =>
                  setNewPlayer((v) => ({ ...v, category: e.target.value }))
                }
              />
              <button className="primary" disabled={busy} onClick={createPlayer}>
                Créer et ajouter
              </button>
            </div>
          </div>

          <div className="roster">
            <div className="rosterHead">
              <b>Effectif</b>
              <span>
                Même joueur = une identité centrale, reliée aux contextes
                sélection / équipe secondaire.
              </span>
            </div>

            {current.players?.map((entry) => {
              const player = entry.player;
              if (!player) return null;

              return (
                <article key={entry.id}>
                  <div className="avatar">
                    {player.first_name?.[0]}
                    {player.last_name?.[0]}
                  </div>
                  <div className="identity">
                    <b>
                      {player.first_name} {player.last_name}
                    </b>
                    <span>
                      {player.club_name || "Club non renseigné"} ·{" "}
                      {player.category || current.category || "—"}
                    </span>
                    <small>
                      {player.linked_user_id
                        ? "Compte utilisateur associé"
                        : "Aucun compte joueur associé"}
                    </small>
                  </div>

                  <div className="context">
                    <label>Équipe secondaire</label>
                    <select
                      value={teamChoice[player.id] || entry.secondary_team_id || ""}
                      onChange={(e) =>
                        setTeamChoice((v) => ({
                          ...v,
                          [player.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Aucune</option>
                      {secondaryTeams.map((team) => (
                        <option key={team.team_id} value={team.team_id}>
                          {team.team?.name || "Équipe secondaire"}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={busy}
                      onClick={() => associateSecondary(player.id)}
                    >
                      Associer
                    </button>
                  </div>

                  <div className="userLink">
                    <label>Compte du joueur</label>
                    <input
                      type="email"
                      placeholder="joueur@email.fr"
                      value={linkUserEmail[player.id] || ""}
                      onChange={(e) =>
                        setLinkUserEmail((v) => ({
                          ...v,
                          [player.id]: e.target.value,
                        }))
                      }
                    />
                    <button disabled={busy} onClick={() => linkUser(player.id)}>
                      Associer
                    </button>
                  </div>

                  <div className="openLinks">
                    {entry.team_player_id && (
                      <a href={`/equipes/${current.team_id}/${entry.team_player_id}`}>
                        Fiche sélection
                      </a>
                    )}
                    {entry.secondary_team_id &&
                      entry.secondary_team_player_id && (
                        <a
                          href={`/equipes/${entry.secondary_team_id}/${entry.secondary_team_player_id}`}
                        >
                          Fiche équipe secondaire
                        </a>
                      )}
                  </div>
                </article>
              );
            })}

            {!current.players?.length && (
              <div className="empty">Aucun joueur dans cette sélection.</div>
            )}
          </div>
        </section>
      )}

      <style jsx>{`
        .selections {
          display: grid;
          gap: 14px;
        }
        .notice {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #c9e2cf;
          background: #eef8f1;
          color: #27623a;
          font-weight: 900;
        }
        .head,
        .detailHead {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }
        .head small,
        .detailHead small {
          color: #b17a21;
          font-weight: 1000;
          letter-spacing: 0.12em;
        }
        .head h3,
        .detailHead h3 {
          margin: 4px 0;
          color: #4d1420;
        }
        .head p,
        .detailHead p,
        .panel p {
          margin: 0;
          color: #7d6e66;
          line-height: 1.45;
        }
        button,
        input,
        select {
          font: inherit;
        }
        .primary {
          border: 0;
          border-radius: 10px;
          background: #6b1a2c;
          color: #fff;
          font-weight: 900;
          padding: 10px 14px;
          cursor: pointer;
        }
        .createSelection,
        .newPlayer {
          display: grid;
          grid-template-columns: 2fr 120px 140px 150px auto;
          gap: 7px;
          border: 1px solid #ead7b2;
          background: #fffaf0;
          border-radius: 13px;
          padding: 12px;
        }
        .newPlayer {
          grid-template-columns: repeat(6, minmax(0, 1fr)) auto;
          border: 0;
          background: transparent;
          padding: 0;
        }
        input,
        select {
          min-width: 0;
          border: 1px solid #ddcfc8;
          border-radius: 9px;
          padding: 9px 10px;
          background: #fff;
        }
        .selectionGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .selectionCard {
          border: 1px solid #e5d9d3;
          border-radius: 12px;
          background: #fff;
          text-align: left;
          padding: 13px;
          cursor: pointer;
          display: grid;
          gap: 3px;
        }
        .selectionCard b {
          color: #3c292d;
        }
        .selectionCard span {
          color: #786b65;
          font-size: 0.76rem;
        }
        .selectionCard small {
          color: #b17a21;
          font-weight: 900;
        }
        .selectionCard.on {
          border-color: #6b1a2c;
          box-shadow: inset 0 0 0 1px #6b1a2c;
          background: #fff8fa;
        }
        .detail {
          display: grid;
          gap: 12px;
          border-top: 1px solid #eadfd8;
          padding-top: 14px;
        }
        .detailActions {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }
        .detailActions a,
        .detailActions button {
          text-decoration: none;
          border: 1px solid #d9cbc5;
          border-radius: 9px;
          background: #fff;
          color: #6b1a2c;
          font-weight: 900;
          padding: 9px 12px;
          cursor: pointer;
        }
        .twoCols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }
        .panel {
          border: 1px solid #eadfd8;
          border-radius: 12px;
          padding: 13px;
          background: #fff;
        }
        .panel h4 {
          margin: 0 0 4px;
          color: #4d1420;
        }
        .panel p {
          font-size: 0.76rem;
          margin-bottom: 9px;
        }
        .inline {
          display: flex;
          gap: 7px;
        }
        .inline > input,
        .inline > select {
          flex: 1;
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 8px;
        }
        .chips span {
          border-radius: 999px;
          background: #f7edda;
          color: #6b1a2c;
          padding: 5px 8px;
          font-size: 0.68rem;
          font-weight: 900;
        }
        .roster {
          display: grid;
          gap: 7px;
        }
        .rosterHead {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: #6b1a2c;
        }
        .rosterHead span {
          color: #7a6c66;
          font-size: 0.72rem;
        }
        .roster article {
          display: grid;
          grid-template-columns: 46px minmax(150px, 1fr) minmax(220px, 1fr) minmax(220px, 1fr) auto;
          gap: 10px;
          align-items: center;
          border: 1px solid #eadfd8;
          border-radius: 12px;
          padding: 11px;
          background: #fff;
        }
        .avatar {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          background: #6b1a2c;
          color: #fff;
          display: grid;
          place-items: center;
          font-weight: 1000;
        }
        .identity {
          display: grid;
          gap: 2px;
        }
        .identity b {
          color: #35272a;
        }
        .identity span {
          color: #796c66;
          font-size: 0.72rem;
        }
        .identity small {
          color: #b17a21;
          font-weight: 900;
        }
        .context,
        .userLink {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 5px;
        }
        .context label,
        .userLink label {
          grid-column: 1 / -1;
          color: #7d6d66;
          font-size: 0.64rem;
          font-weight: 900;
        }
        .context button,
        .userLink button {
          border: 1px solid #d9cbc5;
          border-radius: 8px;
          background: #fff;
          color: #6b1a2c;
          font-weight: 900;
          cursor: pointer;
        }
        .openLinks {
          display: grid;
          gap: 5px;
        }
        .openLinks a {
          white-space: nowrap;
          text-decoration: none;
          border-radius: 8px;
          background: #6b1a2c;
          color: #fff;
          padding: 7px 9px;
          font-size: 0.7rem;
          font-weight: 900;
          text-align: center;
        }
        .empty {
          border: 1px dashed #ddcfc8;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          color: #897a73;
        }
        @media (max-width: 1100px) {
          .selectionGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .roster article {
            grid-template-columns: 46px 1fr 1fr;
          }
          .userLink,
          .openLinks {
            grid-column: 2 / -1;
          }
        }
        @media (max-width: 800px) {
          .head,
          .detailHead {
            flex-direction: column;
          }
          .createSelection,
          .newPlayer,
          .selectionGrid,
          .twoCols {
            grid-template-columns: 1fr;
          }
          .inline {
            flex-direction: column;
          }
          .roster article {
            grid-template-columns: 46px 1fr;
          }
          .context,
          .userLink,
          .openLinks {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </div>
  );
}
