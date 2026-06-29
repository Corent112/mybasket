"use client";

// components/club/ClubCoachesSection.tsx
import { useEffect, useMemo, useState } from "react";
import {
  type ClubCoach,
  type ClubTeam,
  inviteCoachAndSendEmail,
  listClubCoaches,
  listClubTeams,
} from "@/lib/club-core";
import { updateClubCoach } from "@/lib/club-coaches";
import { deleteEntity } from "@/lib/club-crud-actions";
import ClubCoachWorkspace from "@/components/club/ClubCoachWorkspace";

const ROLES = ["coach", "assistant", "preparateur_physique", "video", "manager", "direction_technique"];

type CoachForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  teamIds: string[];
};

function emptyForm(): CoachForm {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "coach",
    status: "active",
    teamIds: [],
  };
}

export default function ClubCoachesSection({
  clubId,
  clubName,
}: {
  clubId: string;
  clubName: string;
}) {
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<CoachForm>(emptyForm());
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClubCoach | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");

    try {
      const [coachRows, teamRows] = await Promise.all([
        listClubCoaches(clubId),
        listClubTeams(clubId),
      ]);

      setCoaches(coachRows);
      setTeams(teamRows);
    } catch (e: any) {
      setError(e?.message || "Coachs impossibles à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return coaches.filter((coach) => {
      if (!q) return true;
      return `${coach.name} ${coach.email} ${coach.role}`.toLowerCase().includes(q);
    });
  }, [coaches, query]);

  function edit(coach: ClubCoach) {
    setEditing(coach);
    setForm({
      firstName: coach.firstName,
      lastName: coach.lastName,
      email: coach.email,
      phone: coach.phone || "",
      role: coach.role,
      status: coach.status,
      teamIds: coach.teamIds,
    });
  }

  function toggleTeam(teamId: string) {
    setForm((prev) => ({
      ...prev,
      teamIds: prev.teamIds.includes(teamId)
        ? prev.teamIds.filter((id) => id !== teamId)
        : [...prev.teamIds, teamId],
    }));
  }

  async function saveCoach() {
    if (!form.email.trim()) {
      setError("Email obligatoire pour inviter ou modifier un coach.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (editing) {
        const fullName = `${form.firstName} ${form.lastName}`.trim() || form.email;

        const updated = await updateClubCoach(editing.id, {
          firstName: form.firstName,
          lastName: form.lastName,
          name: fullName,
          email: form.email,
          phone: form.phone || null,
          role: form.role,
          status: form.status,
          teamIds: form.teamIds,
        });

        setCoaches((prev) => prev.map((coach) => (coach.id === updated.id ? updated : coach)));
        setMessage("Coach modifié.");
      } else {
        await inviteCoachAndSendEmail({
          clubId,
          clubName,
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          role: form.role,
          teamIds: form.teamIds,
        });

        setMessage("Invitation envoyée.");
        await load();
      }

      setEditing(null);
      setForm(emptyForm());
    } catch (e: any) {
      setError(e?.message || "Action impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCoach(coach: ClubCoach) {
    if (!confirm(`Supprimer ${coach.name} ? Ses équipes seront détachées.`)) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await deleteEntity({ clubId, entityType: "coach", id: coach.id });
      setMessage("Coach supprimé.");
      if (selectedCoachId === coach.id) setSelectedCoachId(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (selectedCoachId) {
    return (
      <ClubCoachWorkspace
        clubId={clubId}
        coachId={selectedCoachId}
        onBack={() => setSelectedCoachId(null)}
      />
    );
  }

  return (
    <section className="coaches">
      <div className="top">
        <div>
          <p>COACHS</p>
          <h2>Staff sportif</h2>
          <span>Invitations, équipes attribuées, fiche coach et accès à la fiche équipe.</span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <aside className="form">
          <h3>{editing ? "Modifier coach" : "Inviter un coach"}</h3>

          <label>Prénom<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
          <label>Nom<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
          <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Téléphone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Rôle<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select></label>

          {editing && (
            <label>Statut
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Actif</option>
                <option value="invited">Invité</option>
                <option value="disabled">Désactivé</option>
              </select>
            </label>
          )}

          <div className="teamsPick">
            <strong>Équipes à attribuer</strong>
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                className={form.teamIds.includes(team.id) ? "selected" : ""}
                onClick={() => toggleTeam(team.id)}
              >
                {team.name}
              </button>
            ))}
          </div>

          <div className="actions">
            <button disabled={saving || !form.email} onClick={saveCoach}>
              {saving ? "Enregistrement..." : editing ? "Enregistrer" : "Inviter"}
            </button>
            {editing && <button className="ghost" onClick={() => { setEditing(null); setForm(emptyForm()); }}>Annuler</button>}
          </div>
        </aside>

        <main className="main">
          <div className="tools">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher coach..." />
          </div>

          <div className="grid">
            {filtered.map((coach) => {
              const assignedTeams = teams.filter((team) => {
                return (
                  coach.teamIds.includes(team.id) ||
                  team.coachId === coach.id ||
                  team.coachId === coach.userId ||
                  team.assistantId === coach.id ||
                  team.assistantId === coach.userId
                );
              });

              return (
                <article className="coachCard" key={coach.id}>
                  <div className="avatar">{coach.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <strong>{coach.name}</strong>
                    <span>{coach.role} · {coach.status}</span>
                    <small>{coach.email}</small>
                  </div>

                  <div className="teamTags">
                    {assignedTeams.slice(0, 5).map((team) => (
                      <button key={team.id} type="button" onClick={() => setSelectedCoachId(coach.id)}>
                        {team.name}
                      </button>
                    ))}
                    {!assignedTeams.length && <em>Aucune équipe</em>}
                  </div>

                  <div className="cardActions">
                    <button onClick={() => setSelectedCoachId(coach.id)}>Ouvrir fiche</button>
                    <button className="ghost" onClick={() => edit(coach)}>Modifier</button>
                    <button className="danger" onClick={() => removeCoach(coach)}>Supprimer</button>
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      </div>

      <style jsx>{`
        .coaches{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .layout{display:grid;grid-template-columns:360px 1fr;gap:18px;padding:18px}.form,.main{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.form{background:#fffdf8}.form h3{margin:0 0 14px;color:#6b1a2c}
        label{display:grid;gap:6px;margin-bottom:12px;color:#6b7280;font-weight:900;font-size:.78rem}input,select{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.ghost{background:#fffaf2;color:#6b1a2c}.danger{background:#fff0f0;color:#b91c1c;border-color:#f1d3cf}
        .teamsPick{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.teamsPick strong{width:100%;color:#6b1a2c}.teamsPick button{background:#fff;color:#6b1a2c;border-radius:999px}.teamsPick button.selected{background:#6b1a2c;color:white}
        .actions,.cardActions{display:flex;gap:8px;flex-wrap:wrap}.tools{margin-bottom:16px}.tools input{width:100%}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}.coachCard{border:1px solid #eadfd5;border-radius:22px;padding:16px;display:grid;gap:12px}.avatar{width:52px;height:52px;border-radius:18px;background:#6b1a2c;color:#d4a24c;display:grid;place-items:center;font-weight:900}.coachCard strong{display:block;color:#6b1a2c}.coachCard span,.coachCard small{display:block;color:#6b7280;font-weight:800}
        .teamTags{display:flex;gap:6px;flex-wrap:wrap}.teamTags button,.teamTags em{font-style:normal;background:#fff8ee;border:1px solid #eadfd5;border-radius:999px;padding:5px 8px;color:#6b1a2c;font-weight:900;font-size:.72rem}
        @media(max-width:980px){.layout{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
