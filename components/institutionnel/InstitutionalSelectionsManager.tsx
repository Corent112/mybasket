"use client";

import { useEffect, useMemo, useState } from "react";
import PlayerForm from "@/components/equipes/PlayerForm";
import type { Player as MyBasketPlayer } from "@/types/player";
import InstitutionalSelectionOperations from "@/components/institutionnel/InstitutionalSelectionOperations";

type InstitutionalPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  birthdate: string | null;
  club_name: string | null;
  category: string | null;
  linked_user_id: string | null;
  photo_url?: string | null;
  profile_data?: Record<string, unknown> | null;
  email?: string | null;
  tutor1_email?: string | null;
  tutor2_email?: string | null;
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
  player?: InstitutionalPlayer | null;
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

type ShareState = {
  playerId: string;
  playerName: string;
  email: string;
  label: string;
  message: string;
  accessLevel: "viewer" | "editor" | "manager";
} | null;

export default function InstitutionalSelectionsManager({
  structureId,
  structureType,
}: Props) {
  const [rows, setRows] = useState<Selection[]>([]);
  const [allPlayers, setAllPlayers] = useState<InstitutionalPlayer[]>([]);
  const [secondaryTeams, setSecondaryTeams] = useState<SecondaryTeam[]>([]);
  const [opened, setOpened] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [share, setShare] = useState<ShareState>(null);
  const [form, setForm] = useState({
    name: structureType === "federation" ? "Équipe de France U16" : "Sélection U13",
    category: structureType === "federation" ? "U16" : "U13",
    seasonLabel: "2026-2027",
    gender: "",
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

    if (!selectionRes.ok) {
      setMessage(selectionJson.error || "Chargement impossible.");
      return;
    }

    setRows(selectionJson.selections || []);
    setAllPlayers(playerJson.players || []);
    setSecondaryTeams(
      (teamJson.teams || []).filter(
        (row: SecondaryTeam) => row.kind === "secondary"
      )
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
    setMessage("Sélection créée avec son équipe MyBasket complète.");
    await load();

    if (json.selection?.id) setOpened(json.selection.id);
  }

  async function createPlayer(player: MyBasketPlayer) {
    if (!current) return;

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        mode: "create_full",
        selectionId: current.id,
        playerData: {
          ...player,
          club: player.club || "",
          categorie: player.categorie || current.category || "",
        },
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      alert(json.error || "Création du joueur impossible.");
      return;
    }

    setShowPlayerForm(false);
    setMessage(
      "Joueur créé avec la fiche MyBasket complète : photo, identité, RPE, charge, entraînements, grille de tir, stats, vidéo et suivi."
    );
    await load();

    if (json.teamId && json.teamPlayerId) {
      window.location.href = `/equipes/${json.teamId}/${json.teamPlayerId}`;
    }
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
    setMessage(
      "Joueur existant ajouté à la sélection sans créer une nouvelle identité."
    );
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
        ? "Responsable invité par email. La sélection apparaîtra dans Mes équipes après activation."
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
      "Joueur associé à l’équipe secondaire. La même identité institutionnelle relie maintenant les deux contextes."
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
        ? "Compte utilisateur invité et associé à la fiche joueur."
        : "Compte utilisateur associé à la fiche joueur."
    );
    await load();
  }

  async function sendShare() {
    if (!share) return;
    if (!share.email.includes("@")) return alert("Email destinataire invalide.");

    setBusy(true);
    const response = await fetch("/api/institutionnel/player-transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        playerIds: [share.playerId],
        target_email: share.email.trim().toLowerCase(),
        target_label: share.label.trim() || "Club / Institution destinataire",
        access_level: share.accessLevel,
        message: share.message.trim(),
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      alert(json.error || "Envoi impossible.");
      return;
    }

    setShare(null);
    setMessage(
      "Fiche envoyée par email. Le destinataire reçoit un lien sécurisé MyBasket pour consulter ou reprendre le suivi selon le droit choisi."
    );
  }

  return (
    <div className="selections">
      {message && <div className="notice">✓ {message}</div>}

      <div className="head">
        <div>
          <small>SÉLECTIONS</small>
          <h3>La même logique joueur que dans Mes équipes</h3>
          <p>
            Une sélection est une vraie équipe MyBasket. La création d’un joueur
            utilise exactement le formulaire joueur existant : photo, identité,
            licence, postes, taille, poids, tuteurs et informations sportives.
            Ensuite la fiche complète donne accès au RPE, à la charge,
            aux entraînements, à la grille de tir, aux stats, à la vidéo et au suivi.
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
        {!rows.length && <div className="empty">Aucune sélection créée.</div>}
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
              <button className="primary" onClick={() => setShowPlayerForm(true)}>
                + Créer un joueur
              </button>
              <a href={`/equipes/${current.team_id}`}>Ouvrir l’équipe complète →</a>
            </div>
          </div>

          <div className="featureStrip">
            <span><b>📷 Photo</b>Upload direct</span>
            <span><b>♥ RPE</b>Suivi individuel</span>
            <span><b>↗ Charge</b>Charge d’entraînement</span>
            <span><b>▦ Entraînements</b>Historique & présence</span>
            <span><b>◎ Grille de tir</b>Shot chart</span>
            <span><b>▶ Vidéo</b>Clips & stats</span>
          </div>

          <div className="twoCols">
            <div className="panel">
              <h4>Responsables de la sélection</h4>
              <p>
                Ils obtiennent un accès Premium à cette sélection et la voient
                dans leur espace Mes équipes.
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
                <button className="primary" disabled={busy} onClick={addSelectionStaff}>
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
                On rattache son identité existante à la sélection sans recréer
                une deuxième fiche institutionnelle.
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

          <div className="roster">
            <div className="rosterHead">
              <b>Effectif & accès</b>
              <span>
                Chaque ligne ouvre la vraie fiche MyBasket complète.
              </span>
            </div>

            {current.players?.map((entry) => {
              const player = entry.player;
              if (!player) return null;

              return (
                <article key={entry.id}>
                  <div className="avatar">
                    {player.photo_url ? (
                      <img src={player.photo_url} alt="" />
                    ) : (
                      <>
                        {player.first_name?.[0]}
                        {player.last_name?.[0]}
                      </>
                    )}
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
                        : "Aucun compte utilisateur associé"}
                    </small>
                  </div>

                  <div className="context">
                    <label>Équipe secondaire / club suivi</label>
                    <select
                      value={
                        teamChoice[player.id] ||
                        entry.secondary_team_id ||
                        ""
                      }
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
                    <button disabled={busy} onClick={() => associateSecondary(player.id)}>
                      Associer
                    </button>
                  </div>

                  <div className="userLink">
                    <label>Associer au compte du joueur</label>
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
                        Ouvrir la fiche complète
                      </a>
                    )}
                    <button
                      onClick={() =>
                        setShare({
                          playerId: player.id,
                          playerName: `${player.first_name} ${player.last_name}`,
                          email: "",
                          label: player.club_name || "",
                          message: "",
                          accessLevel: "editor",
                        })
                      }
                    >
                      ✉ Envoyer / partager
                    </button>
                  </div>
                </article>
              );
            })}

            {!current.players?.length && (
              <div className="empty">Aucun joueur dans cette sélection.</div>
            )}
          </div>

          <InstitutionalSelectionOperations structureId={structureId} selection={current} />
        </section>
      )}

      {showPlayerForm && current && (
        <PlayerForm
          onClose={() => setShowPlayerForm(false)}
          onSave={(player) => void createPlayer(player)}
        />
      )}

      {share && (
        <div className="shareOverlay" onClick={() => setShare(null)}>
          <div className="shareModal" onClick={(e) => e.stopPropagation()}>
            <small>PARTAGER UNE FICHE JOUEUR</small>
            <h3>{share.playerName}</h3>
            <p>
              Envoie la fiche à une autre Institution, un club ou un coach par
              email. Le destinataire reçoit un lien sécurisé MyBasket.
            </p>

            <label>
              Destinataire / organisation
              <input
                placeholder="AS Monaco, Dijon, Ligue..."
                value={share.label}
                onChange={(e) =>
                  setShare((s) => (s ? { ...s, label: e.target.value } : s))
                }
              />
            </label>

            <label>
              Email
              <input
                type="email"
                placeholder="coach@club.fr"
                value={share.email}
                onChange={(e) =>
                  setShare((s) => (s ? { ...s, email: e.target.value } : s))
                }
              />
            </label>

            <label>
              Droit accordé
              <select
                value={share.accessLevel}
                onChange={(e) =>
                  setShare((s) =>
                    s
                      ? {
                          ...s,
                          accessLevel: e.target.value as
                            | "viewer"
                            | "editor"
                            | "manager",
                        }
                      : s
                  )
                }
              >
                <option value="viewer">Lecture</option>
                <option value="editor">Contribuer / remplir les informations</option>
                <option value="manager">Responsable du suivi</option>
              </select>
            </label>

            <label>
              Message
              <textarea
                rows={4}
                placeholder="Message accompagnant le partage..."
                value={share.message}
                onChange={(e) =>
                  setShare((s) => (s ? { ...s, message: e.target.value } : s))
                }
              />
            </label>

            <div className="shareActions">
              <button onClick={() => setShare(null)}>Annuler</button>
              <button className="primary" disabled={busy} onClick={sendShare}>
                {busy ? "Envoi…" : "Envoyer la fiche"}
              </button>
            </div>

            <div className="pdfNote">
              <b>PDF</b>
              <span>
                L’export PDF complet restera branché ici ensuite : fiche unique
                ou sélection multiple, logo/couleurs de l’Institution et envoi email.
              </span>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .selections{display:grid;gap:14px}
        .notice{padding:10px 12px;border-radius:10px;border:1px solid #c9e2cf;background:#eef8f1;color:#27623a;font-weight:900}
        .head,.detailHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
        .head small,.detailHead small,.shareModal small{color:#b17a21;font-weight:1000;letter-spacing:.12em}
        .head h3,.detailHead h3,.shareModal h3{margin:4px 0;color:#4d1420}
        .head p,.detailHead p,.panel p,.shareModal p{margin:0;color:#7d6e66;line-height:1.45}
        button,input,select,textarea{font:inherit}
        button{cursor:pointer}
        .primary{border:0;border-radius:10px;background:#6b1a2c;color:#fff;font-weight:900;padding:10px 14px}
        .createSelection{display:grid;grid-template-columns:2fr 120px 140px 150px auto;gap:7px;border:1px solid #ead7b2;background:#fffaf0;border-radius:13px;padding:12px}
        input,select,textarea{min-width:0;border:1px solid #ddcfc8;border-radius:9px;padding:9px 10px;background:#fff}
        .selectionGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .selectionCard{border:1px solid #e5d9d3;border-radius:12px;background:#fff;text-align:left;padding:13px;display:grid;gap:3px}
        .selectionCard b{color:#3c292d}.selectionCard span{color:#786b65;font-size:.76rem}.selectionCard small{color:#b17a21;font-weight:900}
        .selectionCard.on{border-color:#6b1a2c;box-shadow:inset 0 0 0 1px #6b1a2c;background:#fff8fa}
        .detail{display:grid;gap:12px;border-top:1px solid #eadfd8;padding-top:14px}
        .detailActions{display:flex;gap:7px;flex-wrap:wrap}
        .detailActions a{border-radius:9px;background:#fff;color:#6b1a2c;border:1px solid #d9cbc5;text-decoration:none;font-weight:900;padding:9px 12px}
        .featureStrip{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
        .featureStrip span{border:1px solid #eadfd8;border-radius:10px;padding:9px;background:#fff;color:#796a64;font-size:.67rem}
        .featureStrip b{display:block;color:#6b1a2c;font-size:.72rem}
        .twoCols{display:grid;grid-template-columns:1fr 1fr;gap:9px}
        .panel{border:1px solid #eadfd8;border-radius:12px;padding:13px;background:#fff}
        .panel h4{margin:0 0 4px;color:#4d1420}.panel p{font-size:.76rem;margin-bottom:9px}
        .inline{display:flex;gap:7px}.inline>input,.inline>select{flex:1}
        .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.chips span{border-radius:999px;background:#f7edda;color:#6b1a2c;padding:5px 8px;font-size:.68rem;font-weight:900}
        .roster{display:grid;gap:7px}.rosterHead{display:flex;justify-content:space-between;gap:12px;color:#6b1a2c}.rosterHead span{color:#7a6c66;font-size:.72rem}
        .roster article{display:grid;grid-template-columns:52px minmax(150px,1fr) minmax(220px,1fr) minmax(220px,1fr) auto;gap:10px;align-items:center;border:1px solid #eadfd8;border-radius:12px;padding:11px;background:#fff}
        .avatar{width:52px;height:52px;border-radius:50%;background:#6b1a2c;color:#fff;display:grid;place-items:center;font-weight:1000;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}
        .identity{display:grid;gap:2px}.identity b{color:#35272a}.identity span{color:#796c66;font-size:.72rem}.identity small{color:#b17a21;font-weight:900}
        .context,.userLink{display:grid;grid-template-columns:1fr auto;gap:5px}.context label,.userLink label{grid-column:1/-1;color:#7d6d66;font-size:.64rem;font-weight:900}
        .context button,.userLink button,.openLinks button{border:1px solid #d9cbc5;border-radius:8px;background:#fff;color:#6b1a2c;font-weight:900}
        .openLinks{display:grid;gap:5px}.openLinks a{white-space:nowrap;text-decoration:none;border-radius:8px;background:#6b1a2c;color:#fff;padding:7px 9px;font-size:.7rem;font-weight:900;text-align:center}.openLinks button{padding:7px 9px;font-size:.7rem}
        .empty{border:1px dashed #ddcfc8;border-radius:12px;padding:20px;text-align:center;color:#897a73}
        .shareOverlay{position:fixed;inset:0;background:rgba(30,18,21,.48);z-index:200;display:grid;place-items:center;padding:20px}
        .shareModal{width:min(560px,100%);background:#fff;border-radius:16px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.25);display:grid;gap:10px}
        .shareModal label{display:grid;gap:5px;color:#6f6059;font-size:.74rem;font-weight:900}
        .shareActions{display:flex;justify-content:flex-end;gap:7px}.shareActions>button:not(.primary){border:1px solid #ddcfc8;border-radius:9px;background:#fff;color:#6b1a2c;font-weight:900;padding:9px 12px}
        .pdfNote{border-left:4px solid #d4a24c;background:#fff9ec;border-radius:8px;padding:10px 12px;display:grid;gap:2px}.pdfNote b{color:#6b1a2c}.pdfNote span{font-size:.72rem;color:#766961}
        @media(max-width:1100px){.featureStrip{grid-template-columns:repeat(3,1fr)}.selectionGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.roster article{grid-template-columns:52px 1fr 1fr}.userLink,.openLinks{grid-column:2/-1}}
        @media(max-width:800px){.head,.detailHead{flex-direction:column}.createSelection,.selectionGrid,.twoCols{grid-template-columns:1fr}.featureStrip{grid-template-columns:repeat(2,1fr)}.inline{flex-direction:column}.roster article{grid-template-columns:52px 1fr}.context,.userLink,.openLinks{grid-column:1/-1}}
      `}</style>
    </div>
  );
}
