"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StructureType = "committee" | "league" | "federation" | "pole";
type Structure = {
  id: string;
  structure_type: StructureType;
  name: string;
  short_name: string | null;
  season_label: string | null;
  city: string | null;
};

type AccessPayload = {
  allowed: boolean;
  allowedTypes: StructureType[];
  structures: Structure[];
  canCreate: boolean;
};

const LABELS: Record<StructureType, { icon: string; label: string; description: string }> = {
  committee: { icon: "🏛️", label: "Comité", description: "Clubs, détections, sélections, formation du joueur et des cadres." },
  league: { icon: "🌍", label: "Ligue", description: "Supervision des Comités, formation régionale, Pôles et parcours joueurs." },
  federation: { icon: "🇫🇷", label: "Fédération", description: "Pilotage national, Ligues, formation, sélections et ressources." },
  pole: { icon: "⭐", label: "Pôle / Performance", description: "Polistes, groupes, équipes championnat, charge, vidéo et scolaire." },
};

export default function InstitutionalHome() {
  const supabase = useMemo(() => createClient(), []);
  const [access, setAccess] = useState<AccessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    structure_type: "committee" as StructureType,
    name: "",
    short_name: "",
    ffbb_code: "",
    city: "",
    season_label: "2026-2027",
    email: "",
    phone: "",
  });

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch("/api/institutionnel/access", { cache: "no-store" });
      const json = await res.json();
      setAccess(json as AccessPayload);
      const first = (json?.allowedTypes?.[0] || "committee") as StructureType;
      setForm((current) => ({ ...current, structure_type: first }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  async function createStructure() {
    if (!form.name.trim()) return alert("Le nom officiel est obligatoire.");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("institutional_structures")
      .insert({
        structure_type: form.structure_type,
        name: form.name.trim(),
        short_name: form.short_name.trim() || null,
        ffbb_code: form.ffbb_code.trim() || null,
        city: form.city.trim() || null,
        season_label: form.season_label.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) return alert(error.message);

    const member = await supabase.from("institutional_members").insert({
      structure_id: data.id,
      user_id: user.id,
      role: "owner",
      status: "active",
      permissions: { all: true },
    });
    if (member.error) return alert(member.error.message);

    window.location.href = `/institutionnel/${data.id}`;
  }

  if (loading) return <main className="institution-page"><div className="loading">Chargement de l'espace Institutionnel…</div><style jsx>{css}</style></main>;
  if (!access?.allowed) {
    return (
      <main className="institution-page">
        <section className="hero"><p>INSTITUTIONNEL</p><h1>Accès institutionnel</h1><span>Cet espace apparaît uniquement avec un abonnement institutionnel ou une invitation dans une structure.</span></section>
        <section className="empty-card"><h2>Aucun accès institutionnel</h2><p>Choisis une offre Comité, Ligue ou Fédération, ou demande à un responsable de t'inviter.</p><Link href="/abonnements">Voir les abonnements</Link></section>
        <style jsx>{css}</style>
      </main>
    );
  }

  return (
    <main className="institution-page">
      <Link href="/mon-compte" className="back-link">← Retour Mon Compte</Link>
      <section className="hero">
        <div><p>INSTITUTIONNEL</p><h1>Mes structures</h1><span>Un seul environnement pour Comité, Ligue, Fédération et structures de performance.</span></div>
        {access.canCreate && <button onClick={() => setCreating((value) => !value)}>{creating ? "Fermer" : "+ Créer une structure"}</button>}
      </section>

      {creating && (
        <section className="create-card">
          <div className="section-title"><div><p>NOUVELLE STRUCTURE</p><h2>Informations principales</h2></div></div>
          <div className="form-grid">
            <label><span>Type</span><select value={form.structure_type} onChange={(e) => setForm({ ...form, structure_type: e.target.value as StructureType })}>{access.allowedTypes.map((type) => <option key={type} value={type}>{LABELS[type].label}</option>)}</select></label>
            <label><span>Saison</span><input value={form.season_label} onChange={(e) => setForm({ ...form, season_label: e.target.value })} /></label>
            <label className="wide"><span>Nom officiel *</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Comité des Yvelines de Basketball" /></label>
            <label><span>Nom court</span><input value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} /></label>
            <label><span>Code / affiliation</span><input value={form.ffbb_code} onChange={(e) => setForm({ ...form, ffbb_code: e.target.value })} /></label>
            <label><span>Ville</span><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            <label><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label><span>Téléphone</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          </div>
          <button className="primary" onClick={createStructure}>Créer mon espace</button>
        </section>
      )}

      <section className="structure-grid">
        {access.structures.map((structure) => {
          const meta = LABELS[structure.structure_type] || LABELS.committee;
          return <Link key={structure.id} href={`/institutionnel/${structure.id}`} className="structure-card"><div className="icon">{meta.icon}</div><div><small>{meta.label.toUpperCase()}</small><h2>{structure.name}</h2><p>{meta.description}</p><span>{structure.season_label || "Saison non définie"}{structure.city ? ` · ${structure.city}` : ""}</span></div><b>→</b></Link>;
        })}
        {!access.structures.length && <div className="empty-card"><h2>Aucune structure créée</h2><p>Ton abonnement autorise la création de : {access.allowedTypes.map((t) => LABELS[t].label).join(", ")}.</p></div>}
      </section>
      <style jsx>{css}</style>
    </main>
  );
}

const css = `
  :global(body){background:#f6f2ee}.back-link{display:inline-flex;align-items:center;margin:0 0 12px;color:#6b1a2c;text-decoration:none;font-weight:950;font-size:.82rem}.back-link:hover{text-decoration:underline}.institution-page{max-width:1180px;margin:auto;padding:28px 18px 60px}.hero{display:flex;justify-content:space-between;align-items:center;gap:16px;background:linear-gradient(135deg,#6b1a2c,#35101a);color:#fff;border-radius:24px;padding:24px}.hero p,.section-title p{margin:0;color:#d4a24c;font-weight:1000;letter-spacing:.12em;font-size:.7rem}.hero h1{margin:5px 0;font-size:2.3rem}.hero span{opacity:.86}.hero button,.primary{border:0;border-radius:10px;background:#d4a24c;color:#2a1719;font-weight:1000;padding:10px 14px;cursor:pointer}.structure-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.structure-card,.empty-card,.create-card{background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:16px}.structure-card{display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:center;text-decoration:none;color:inherit}.structure-card:hover{border-color:#6b1a2c;transform:translateY(-1px)}.structure-card .icon{width:48px;height:48px;display:grid;place-items:center;border-radius:13px;background:#6b1a2c;color:#fff;font-size:1.45rem}.structure-card small{color:#d4a24c;font-weight:1000}.structure-card h2{margin:3px 0;color:#2d211d}.structure-card p{margin:3px 0;color:#796b64;font-size:.78rem}.structure-card span{font-size:.72rem;color:#91837b}.structure-card>b{color:#6b1a2c;font-size:1.4rem}.create-card{margin-top:12px}.section-title h2{margin:4px 0}.form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.form-grid label{display:grid;gap:4px}.form-grid span{font-size:.65rem;text-transform:uppercase;font-weight:900;color:#766860}.form-grid input,.form-grid select{border:1px solid #ddd1ca;border-radius:9px;padding:9px}.wide{grid-column:1/-1}.empty-card{margin-top:12px}.empty-card a{display:inline-block;margin-top:6px;background:#6b1a2c;color:#fff;border-radius:9px;padding:9px 12px;text-decoration:none;font-weight:900}.loading{padding:40px;text-align:center;color:#6b1a2c;font-weight:900}@media(max-width:760px){.hero{align-items:flex-start;flex-direction:column}.structure-grid,.form-grid{grid-template-columns:1fr}.wide{grid-column:auto}}
`;
