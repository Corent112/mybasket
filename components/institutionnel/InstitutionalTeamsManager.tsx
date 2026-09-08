"use client";

import { useEffect, useMemo, useState } from "react";

type TeamRow = {
  id: string;
  team_id: string;
  kind: "primary" | "secondary" | "selection";
  label: string | null;
  season_label: string | null;
  team?: {
    id: string;
    name: string;
    category: string | null;
    coach_name: string | null;
  } | null;
  staff?: Array<{
    id: string;
    email: string;
    role: string;
    access_level: string;
    status: string;
    user_id: string | null;
  }>;
};

type Props = {
  structureId: string;
  structureType: "committee" | "league" | "federation" | "pole";
};

const defaultName = (type: Props["structureType"]) => {
  if (type === "pole") return "Pôle Espoir";
  if (type === "federation") return "Équipe nationale";
  if (type === "league") return "Équipe régionale";
  return "Équipe départementale";
};

export default function InstitutionalTeamsManager({
  structureId,
  structureType,
}: Props) {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staffTeamId, setStaffTeamId] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState("Coach");
  const [form, setForm] = useState({
    name: defaultName(structureType),
    category: "",
    seasonLabel: "2026-2027",
    kind: "primary" as "primary" | "secondary",
  });

  const visibleRows = useMemo(
    () => rows.filter((row) => row.kind !== "selection"),
    [rows]
  );

  async function load() {
    setLoading(true);
    const response = await fetch(
      `/api/institutionnel/sport/teams?structureId=${encodeURIComponent(
        structureId
      )}`,
      { cache: "no-store" }
    );
    const json = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setMessage(json.error || "Chargement des équipes impossible.");
      return;
    }

    setRows(json.teams || []);
  }

  useEffect(() => {
    void load();
  }, [structureId]);

  async function createTeam() {
    if (!form.name.trim()) return alert("Nom de l’équipe obligatoire.");

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        name: form.name.trim(),
        category: form.category.trim(),
        seasonLabel: form.seasonLabel.trim(),
        kind: form.kind,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) return alert(json.error || "Création impossible.");

    setShowCreate(false);
    setMessage(
      form.kind === "secondary"
        ? "Équipe secondaire créée. Tu peux maintenant lui donner accès à un coach."
        : "Équipe principale créée."
    );
    await load();
  }

  async function addStaff() {
    if (!staffTeamId || !staffEmail.includes("@")) {
      return alert("Choisis une équipe et renseigne un email valide.");
    }

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        scope: "team",
        teamId: staffTeamId,
        email: staffEmail.trim().toLowerCase(),
        role: staffRole.trim() || "Coach",
        accessLevel: "premium",
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) return alert(json.error || "Accès impossible.");

    setStaffEmail("");
    setMessage(
      json.invited
        ? "Invitation envoyée. L’équipe apparaîtra dans Mes équipes dès l’activation du compte."
        : "Accès accordé. L’équipe apparaît dans Mes équipes du coach."
    );
    await load();
  }

  return (
    <div className="teamsManager">
      {message && <div className="notice">✓ {message}</div>}

      <div className="top">
        <div>
          <small>ÉQUIPES DE L’INSTITUTION</small>
          <h3>Équipes principales et secondaires</h3>
          <p>
            Une équipe institutionnelle utilise le moteur normal de MyBasket.
            Les coachs invités la retrouvent dans <b>Mes équipes</b> avec les
            droits Premium limités à cette équipe, sans consommer leur quota
            personnel.
          </p>
        </div>
        <button className="primary" onClick={() => setShowCreate((v) => !v)}>
          + Créer une équipe
        </button>
      </div>

      {showCreate && (
        <div className="createBox">
          <label>
            Type
            <select
              value={form.kind}
              onChange={(e) =>
                setForm((v) => ({
                  ...v,
                  kind: e.target.value as "primary" | "secondary",
                }))
              }
            >
              <option value="primary">Équipe principale Institution</option>
              <option value="secondary">
                Équipe secondaire / partenaire
              </option>
            </select>
          </label>
          <label>
            Nom
            <input
              value={form.name}
              onChange={(e) =>
                setForm((v) => ({ ...v, name: e.target.value }))
              }
            />
          </label>
          <label>
            Catégorie
            <input
              placeholder="U15, U16, Senior…"
              value={form.category}
              onChange={(e) =>
                setForm((v) => ({ ...v, category: e.target.value }))
              }
            />
          </label>
          <label>
            Saison
            <input
              value={form.seasonLabel}
              onChange={(e) =>
                setForm((v) => ({ ...v, seasonLabel: e.target.value }))
              }
            />
          </label>
          <div className="actions">
            <button onClick={() => setShowCreate(false)}>Annuler</button>
            <button className="primary" disabled={busy} onClick={createTeam}>
              {busy ? "Création…" : "Créer l’équipe"}
            </button>
          </div>
        </div>
      )}

      <div className="grid">
        {loading && <div className="empty">Chargement…</div>}
        {!loading && !visibleRows.length && (
          <div className="empty">
            Aucune équipe institutionnelle pour le moment.
          </div>
        )}

        {visibleRows.map((row) => (
          <article key={row.id}>
            <div className={`kind ${row.kind}`}>
              {row.kind === "primary" ? "ÉQUIPE PRINCIPALE" : "ÉQUIPE SECONDAIRE"}
            </div>
            <h4>{row.team?.name || row.label || "Équipe"}</h4>
            <p>
              {row.team?.category || "Catégorie non définie"} ·{" "}
              {row.season_label || "Saison non définie"}
            </p>

            <div className="staffList">
              <b>Accès coachs</b>
              {row.staff?.length ? (
                row.staff.map((member) => (
                  <span key={member.id}>
                    {member.email} · {member.role} ·{" "}
                    {member.access_level === "premium" ? "Premium équipe" : member.access_level}
                  </span>
                ))
              ) : (
                <span>Aucun coach externe associé.</span>
              )}
            </div>

            <div className="cardActions">
              <a href={`/equipes/${row.team_id}`}>Ouvrir l’équipe →</a>
              <button
                onClick={() =>
                  setStaffTeamId((current) =>
                    current === row.team_id ? "" : row.team_id
                  )
                }
              >
                + Donner un accès
              </button>
            </div>

            {staffTeamId === row.team_id && (
              <div className="staffForm">
                <input
                  type="email"
                  placeholder="coach@email.fr"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                />
                <input
                  placeholder="Rôle"
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                />
                <button className="primary" disabled={busy} onClick={addStaff}>
                  {busy ? "Ajout…" : "Donner accès"}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="infoBox">
        <b>All Access Institution</b>
        <span>
          L’Institution n’est pas soumise au quota d’équipes coach. Les droits
          transmis aux coachs sont portés par l’équipe : lorsqu’un coach quitte
          l’équipe, son abonnement personnel redevient sa seule source de droits.
        </span>
      </div>

      <style jsx>{`
        .teamsManager {
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
        .top {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
        }
        .top small {
          color: #b17a21;
          font-weight: 1000;
          letter-spacing: 0.12em;
        }
        .top h3 {
          margin: 4px 0;
          color: #4d1420;
        }
        .top p {
          margin: 0;
          color: #7d6e66;
          max-width: 820px;
          line-height: 1.5;
        }
        button,
        input,
        select {
          font: inherit;
        }
        button {
          cursor: pointer;
        }
        .primary {
          border: 0;
          border-radius: 10px;
          background: #6b1a2c;
          color: #fff;
          font-weight: 900;
          padding: 10px 14px;
        }
        .createBox {
          display: grid;
          grid-template-columns: 180px 1fr 180px 150px;
          gap: 9px;
          border: 1px solid #ead7b2;
          background: #fffaf0;
          border-radius: 14px;
          padding: 14px;
        }
        label {
          display: grid;
          gap: 5px;
          color: #6f6059;
          font-size: 0.74rem;
          font-weight: 900;
        }
        input,
        select {
          width: 100%;
          border: 1px solid #ddcfc8;
          border-radius: 9px;
          padding: 10px;
          background: #fff;
        }
        .actions {
          grid-column: 1 / -1;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .actions > button:not(.primary),
        .cardActions button {
          border: 1px solid #ddcfc8;
          border-radius: 9px;
          background: #fff;
          color: #6b1a2c;
          font-weight: 900;
          padding: 9px 12px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        article {
          border: 1px solid #eadfd8;
          border-radius: 14px;
          padding: 15px;
          background: #fff;
        }
        .kind {
          display: inline-flex;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 0.61rem;
          font-weight: 1000;
          letter-spacing: 0.08em;
        }
        .kind.primary {
          color: #fff;
          background: #6b1a2c;
        }
        .kind.secondary {
          color: #6b1a2c;
          background: #f5e9cc;
        }
        h4 {
          margin: 10px 0 3px;
          color: #2d2022;
          font-size: 1.08rem;
        }
        article > p {
          margin: 0;
          color: #81736d;
          font-size: 0.8rem;
        }
        .staffList {
          display: grid;
          gap: 3px;
          margin-top: 13px;
          padding-top: 11px;
          border-top: 1px solid #f0e6e1;
        }
        .staffList b {
          color: #6b1a2c;
          font-size: 0.74rem;
        }
        .staffList span {
          color: #756862;
          font-size: 0.72rem;
        }
        .cardActions {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 13px;
        }
        .cardActions a {
          text-decoration: none;
          border-radius: 9px;
          background: #6b1a2c;
          color: #fff;
          font-weight: 900;
          padding: 9px 12px;
          font-size: 0.78rem;
        }
        .staffForm {
          display: grid;
          grid-template-columns: 1fr 160px auto;
          gap: 7px;
          margin-top: 9px;
        }
        .empty {
          grid-column: 1 / -1;
          border: 1px dashed #ddcfc8;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          color: #897a73;
        }
        .infoBox {
          display: grid;
          gap: 3px;
          border-left: 4px solid #d4a24c;
          background: #fff9ec;
          border-radius: 9px;
          padding: 12px 14px;
        }
        .infoBox b {
          color: #6b1a2c;
        }
        .infoBox span {
          color: #786a63;
          font-size: 0.78rem;
        }
        @media (max-width: 900px) {
          .top {
            flex-direction: column;
          }
          .createBox,
          .grid {
            grid-template-columns: 1fr;
          }
          .staffForm {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
