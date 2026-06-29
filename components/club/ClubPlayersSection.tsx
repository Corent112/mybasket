"use client";

// components/club/ClubPlayersSection.tsx
import { useEffect, useMemo, useState } from "react";
import {
  type ClubPlayer,
  type ClubTeam,
  createClubPlayer,
  listClubPlayers,
  listClubTeams,
  updateClubPlayer,
} from "@/lib/club-core";

const CATEGORIES = ["U7", "U9", "U11", "U13", "U15", "U18", "U21", "Seniors", "Anciens", "Basket École", "Autre"];
const GENDERS = ["Mixte", "M", "F"];

type PlayerForm = {
  firstName: string;
  lastName: string;
  teamId: string;
  category: string;
  gender: string;
  birthdate: string;
  licenseNumber: string;
  licenseStatus: string;
  paymentStatus: string;
  medicalStatus: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  email: string;
  phone: string;
  notes: string;
};

function emptyForm(): PlayerForm {
  return {
    firstName: "",
    lastName: "",
    teamId: "",
    category: "U11",
    gender: "Mixte",
    birthdate: "",
    licenseNumber: "",
    licenseStatus: "pending",
    paymentStatus: "pending",
    medicalStatus: "",
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    email: "",
    phone: "",
    notes: "",
  };
}

export default function ClubPlayersSection({ clubId }: { clubId: string }) {
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [form, setForm] = useState<PlayerForm>(emptyForm());
  const [editing, setEditing] = useState<ClubPlayer | null>(null);
  const [teamFilter, setTeamFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");
    try {
      const [teamRows, playerRows] = await Promise.all([
        listClubTeams(clubId),
        listClubPlayers(clubId),
      ]);
      setTeams(teamRows);
      setPlayers(playerRows);
    } catch (e: any) {
      setError(e?.message || "Chargement impossible.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((player) => {
      const bySearch = !q || `${player.firstName} ${player.lastName} ${player.licenseNumber || ""}`.toLowerCase().includes(q);
      const byTeam = !teamFilter || player.teamId === teamFilter;
      const byCategory = !categoryFilter || player.category === categoryFilter;
      return bySearch && byTeam && byCategory;
    });
  }, [players, search, teamFilter, categoryFilter]);

  function edit(player: ClubPlayer) {
    setEditing(player);
    setForm({
      firstName: player.firstName,
      lastName: player.lastName,
      teamId: player.teamId || "",
      category: player.category || "U11",
      gender: player.gender || "Mixte",
      birthdate: player.birthdate || "",
      licenseNumber: player.licenseNumber || "",
      licenseStatus: player.licenseStatus || "pending",
      paymentStatus: player.paymentStatus || "pending",
      medicalStatus: player.medicalStatus || "",
      parentName: player.parentName || "",
      parentEmail: player.parentEmail || "",
      parentPhone: player.parentPhone || "",
      email: player.email || "",
      phone: player.phone || "",
      notes: player.notes || "",
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        teamId: form.teamId || null,
        category: form.category,
        gender: form.gender,
        birthdate: form.birthdate || null,
        licenseNumber: form.licenseNumber || null,
        licenseStatus: form.licenseStatus,
        paymentStatus: form.paymentStatus,
        medicalStatus: form.medicalStatus || null,
        parentName: form.parentName || null,
        parentEmail: form.parentEmail || null,
        parentPhone: form.parentPhone || null,
        email: form.email || null,
        phone: form.phone || null,
        notes: form.notes,
      };

      if (editing) {
        const updated = await updateClubPlayer(editing.id, payload);
        setPlayers((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await createClubPlayer(clubId, payload);
        setPlayers((prev) => [created, ...prev]);
      }

      setEditing(null);
      setForm(emptyForm());
    } catch (e: any) {
      setError(e?.message || "Joueur non enregistré.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="clubPlayers">
      <div className="top">
        <div>
          <p>JOUEURS</p>
          <h2>Base joueurs du club</h2>
          <span>Tous les joueurs créés apparaissent ici avec filtres équipe, catégorie et recherche.</span>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm()); }}>+ Joueur</button>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="filters">
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
          <option value="">Toutes équipes</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, prénom, licence..." />
      </div>

      <div className="layout">
        <div className="formBox">
          <h3>{editing ? "Modifier le joueur" : "Créer un joueur"}</h3>
          <div className="grid">
            <label>Prénom<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
            <label>Nom<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
            <label>Équipe<select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}><option value="">Aucune</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            <label>Catégorie<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Genre<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>{GENDERS.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Naissance<input type="date" value={form.birthdate} onChange={(e) => setForm({ ...form, birthdate: e.target.value })} /></label>
            <label>N° licence<input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} /></label>
            <label>Licence<select value={form.licenseStatus} onChange={(e) => setForm({ ...form, licenseStatus: e.target.value })}><option value="pending">En attente</option><option value="valid">Validée</option><option value="missing">Manquante</option></select></label>
            <label>Paiement<select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}><option value="pending">En attente</option><option value="paid">Payé</option><option value="late">Retard</option></select></label>
            <label>Médical<input value={form.medicalStatus} onChange={(e) => setForm({ ...form, medicalStatus: e.target.value })} placeholder="OK, blessé, certificat..." /></label>
            <label>Parent<input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} /></label>
            <label>Tél parent<input value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} /></label>
            <label>Email parent<input value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} /></label>
            <label>Email joueur<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="full">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <div className="actions">
            <button disabled={saving || !form.firstName || !form.lastName} onClick={save}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
            {editing && <button className="ghost" onClick={() => { setEditing(null); setForm(emptyForm()); }}>Annuler</button>}
          </div>
        </div>

        <div className="tableBox">
          <div className="stats">
            <b>{filtered.length}<small>joueurs</small></b>
            <b>{filtered.filter((p) => p.licenseStatus === "valid").length}<small>licences OK</small></b>
            <b>{filtered.filter((p) => p.paymentStatus === "paid").length}<small>payés</small></b>
          </div>
          <div className="table">
            <div className="row head"><span>Joueur</span><span>Équipe</span><span>Cat.</span><span>Licence</span><span>Paiement</span><span>Médical</span></div>
            {filtered.map((player) => (
              <button className="row" key={player.id} onClick={() => edit(player)}>
                <span>{player.lastName} {player.firstName}</span>
                <span>{teams.find((t) => t.id === player.teamId)?.name || "—"}</span>
                <span>{player.category || "—"}</span>
                <span>{player.licenseStatus}</span>
                <span>{player.paymentStatus}</span>
                <span>{player.medicalStatus || "—"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .clubPlayers{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}
        .top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.ghost{background:#fffaf2;color:#6b1a2c}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;background:#fff0f0;color:#b91c1c;font-weight:900}.filters{display:flex;gap:10px;padding:14px 18px;border-bottom:1px solid #eef2f7;background:#fcfcfd}
        input,select,textarea{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}textarea{min-height:80px}
        .layout{display:grid;grid-template-columns:420px 1fr;gap:18px;padding:18px}.formBox,.tableBox{border:1px solid #eadfd5;border-radius:24px;background:#fff;padding:18px}.formBox h3{margin:0 0 14px;color:#6b1a2c}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grid label{display:flex;flex-direction:column;gap:6px;font-size:.78rem;color:#6b7280;font-weight:900}.full{grid-column:1/-1}.actions{display:flex;gap:10px;margin-top:14px}
        .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}.stats b{background:#fff8ee;border:1px solid #eadfd5;border-radius:16px;padding:12px;text-align:center;color:#6b1a2c}.stats small{display:block;color:#6b7280}
        .table{border:1px solid #eef2f7;border-radius:18px;overflow:hidden}.row{display:grid;grid-template-columns:1.3fr 1fr .7fr .8fr .8fr .8fr;width:100%;border:0;border-bottom:1px solid #eef2f7;background:#fff;color:#111827;text-align:left;border-radius:0}.row span{padding:12px;font-weight:800}.row.head{background:#f8fafc;color:#6b7280}
        @media(max-width:1050px){.layout{grid-template-columns:1fr}.grid,.stats{grid-template-columns:1fr}.row{grid-template-columns:1fr}.row.head{display:none}.filters{flex-direction:column}}
      `}</style>
    </section>
  );
}
