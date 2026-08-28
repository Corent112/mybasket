"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Structure = {
  id: string;
  name: string;
  short_name: string | null;
  structure_type: string;
  season_label: string | null;
  city: string | null;
  email: string | null;
  phone?: string | null;
  logo_url?: string | null;
  document_primary_color?: string | null;
  document_secondary_color?: string | null;
};

type Person = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role_label: string | null;
};

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  birthdate: string | null;
  club_name: string | null;
  category: string | null;
  email: string | null;
  height_cm?: number | null;
  years_basket?: number | null;
};

type EventRow = {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  event_type: string;
  location: string | null;
  intervenant: string | null;
};

type TemplateKey =
  | "attendance"
  | "registration"
  | "player_info"
  | "schedule"
  | "participants"
  | "attendance_certificate"
  | "training_certificate"
  | "player_evaluation"
  | "coach_evaluation"
  | "parental_authorization"
  | "training_report"
  | "stage_summary";

type Template = {
  key: TemplateKey;
  category: "Formation" | "Joueurs" | "Stage / sélection" | "Évaluation";
  title: string;
  description: string;
};

const TEMPLATES: Template[] = [
  { key: "attendance", category: "Formation", title: "Feuille d’émargement", description: "Stagiaires, dates, horaires, signatures et total d’heures." },
  { key: "registration", category: "Formation", title: "Fiche d’inscription formation", description: "Identité, coordonnées, formation et informations administratives." },
  { key: "schedule", category: "Formation", title: "Planning de formation", description: "Planning prérempli à partir des blocs du calendrier Institution." },
  { key: "participants", category: "Formation", title: "Liste des participants", description: "Liste prête à imprimer ou partager avec les intervenants." },
  { key: "attendance_certificate", category: "Formation", title: "Attestation de présence", description: "Attestation individuelle prête à signer." },
  { key: "training_certificate", category: "Formation", title: "Attestation de formation", description: "Document de fin de formation personnalisable." },
  { key: "training_report", category: "Formation", title: "Bilan de formation", description: "Synthèse du dispositif, participants, programme et observations." },
  { key: "player_info", category: "Joueurs", title: "Fiche de renseignements joueur", description: "Identité, club, catégorie et informations sportives utiles." },
  { key: "player_evaluation", category: "Évaluation", title: "Fiche d’évaluation joueur", description: "Support d’évaluation et objectifs de progression." },
  { key: "coach_evaluation", category: "Évaluation", title: "Fiche d’évaluation cadre", description: "Observation, points d’appui, axes de progrès et objectifs." },
  { key: "parental_authorization", category: "Stage / sélection", title: "Autorisation parentale", description: "Modèle pour les participants mineurs." },
  { key: "stage_summary", category: "Stage / sélection", title: "Fiche récapitulative stage / sélection", description: "Dates, lieux, joueurs, staff et programme." },
];

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function frDate(value?: string | null) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function displayName(person: Pick<Person, "first_name" | "last_name">) {
  return `${person.first_name || ""} ${person.last_name || ""}`.trim();
}

function rows(items: string[], cols: number) {
  const empty = Array.from({ length: Math.max(0, 14 - items.length) }, () => "");
  return [...items, ...empty]
    .map((name) => `<tr><td>${escapeHtml(name)}</td>${Array.from({ length: cols - 1 }, () => "<td>&nbsp;</td>").join("")}</tr>`)
    .join("");
}

function templateHex(value:string|null|undefined,fallback:string){return /^#[0-9a-fA-F]{6}$/.test(String(value||""))?String(value).toUpperCase():fallback;}
function templatePrimary(s:Structure){return templateHex(s.document_primary_color,"#6B1A2C");}
function templateSecondary(s:Structure){return templateHex(s.document_secondary_color,"#D4A24C");}

function baseStyles(structure: Structure) {
  const primary=templatePrimary(structure), secondary=templateSecondary(structure);
  return `
    @page{size:A4;margin:0}
    *{box-sizing:border-box;max-width:100%}html,body{width:210mm;margin:0}body{font-family:Arial,Helvetica,sans-serif;color:#241b1e;font-size:8px;padding:29mm 12mm 12mm;position:relative;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow-x:hidden}
    body:before{content:"";position:absolute;left:-10%;right:-10%;top:-26mm;height:51mm;background:${primary};border-radius:0 0 48% 52%/0 0 32% 36%;transform:rotate(-1deg);z-index:-1}body:after{content:"";position:absolute;left:-5%;right:-5%;top:25mm;height:1.5mm;background:${secondary};border-radius:50%;transform:rotate(-1deg);z-index:-1}
    .hero{position:absolute;top:7mm;left:12mm;right:12mm;height:14mm;color:#fff;display:flex;justify-content:space-between;align-items:flex-start;gap:8mm}.hero .brand{font-weight:900;font-size:11px;letter-spacing:.04em}.hero .logo{max-width:30mm;max-height:12mm;object-fit:contain;background:#fff;border-radius:1.5mm;padding:1mm}.hero .org{text-align:right;color:#f5ecef;font-size:7px;line-height:1.3;min-width:0}.hero .org b{display:block;color:#fff;font-size:8.5px}
    .editbar{position:fixed;z-index:9999;top:4mm;left:50%;transform:translateX(-50%);background:#fff;border:1px solid #ddd;border-radius:6px;padding:4px 8px;box-shadow:0 4px 18px rgba(0,0,0,.15)}.editbar button{border:0;border-radius:5px;background:${primary};color:#fff;padding:6px 10px;font-weight:800;cursor:pointer}
    main[contenteditable=true]:focus{outline:2px dashed ${secondary};outline-offset:2mm}
    h1{font-size:18px;letter-spacing:-.02em;margin:2mm 0 1mm;color:${primary}}h2{font-size:8.5px;letter-spacing:.04em;text-transform:uppercase;margin:3mm 0 1.5mm;color:${primary};border-left:.8mm solid ${secondary};padding-left:2mm}.subtitle{color:#77696d;margin-bottom:3mm}.meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.5mm 4mm;margin:2mm 0 3mm}.meta>div{min-width:0;border-bottom:.25mm solid #d4c6ca;padding:1mm 0}.meta b{display:block;font-size:5.8px;color:#8a777d;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5mm}
    table{display:table!important;width:100%!important;max-width:100%!important;border-collapse:separate;border-spacing:0;margin:2mm 0 3mm;border:.25mm solid #e3d5d8;border-radius:2mm;overflow:hidden;table-layout:fixed!important}th,td{border:0;border-bottom:.25mm solid #eadfe2;padding:1mm .65mm;vertical-align:middle;font-size:6.2px;line-height:1.15;overflow-wrap:anywhere!important;word-break:break-word!important;white-space:normal!important;min-width:0!important}th{background:${primary};color:#fff;font-weight:700;text-align:center;font-size:5.5px;text-transform:uppercase;letter-spacing:.01em}tbody tr:nth-child(even) td{background:#fbf7f8}tbody tr:last-child td{border-bottom:0}
    .sign{height:7mm}.big{height:12mm}.box{border:0;border-left:.8mm solid ${secondary};background:#fbf7f8;padding:2mm;border-radius:0 2mm 2mm 0;margin:1.5mm 0;min-height:9mm}.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:3mm}.line{border-bottom:.25mm solid #a9949a;display:inline-block;max-width:100%;min-width:25mm;height:3mm}.footer{margin-top:3mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm}.right{text-align:right}.section{margin:3mm 0}.fieldrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2mm 5mm}.field{min-width:0;padding:1mm 0 1.5mm;border-bottom:.25mm solid #d4c6ca}.field small{display:block;color:#8a777d;text-transform:uppercase;letter-spacing:.05em;font-weight:700;font-size:5.8px;margin-bottom:.5mm}.structure-card{display:grid;grid-template-columns:1.4fr 1fr;gap:3mm;background:linear-gradient(120deg,#f8f0f2,#fff);border-left:1mm solid ${secondary};padding:2mm 3mm;border-radius:0 2mm 2mm 0;margin:2mm 0 3mm}.structure-card strong{font-size:10px;color:${primary}}.structure-card span{display:block;color:#77696d;margin-top:.5mm}.doc-footer{position:absolute;left:12mm;right:12mm;bottom:4mm;border-top:.25mm solid #eadfe2;padding-top:1mm;color:#8a777d;font-size:5.7px;display:flex;justify-content:space-between}
    .consent{display:flex;gap:2mm;align-items:flex-start;margin:1.5mm 0}.consent .boxcheck{width:4mm;height:4mm;border:.35mm solid ${primary};border-radius:.5mm;flex:0 0 4mm}
    @media print{.editbar{display:none!important}main[contenteditable=true]:focus{outline:none}body{overflow:visible}}
  `;
}

function shell(structure: Structure, title: string, body: string) {
  const brand=structure.logo_url?`<img class="logo" src="${escapeHtml(structure.logo_url)}" alt="Logo">`:`<div class="brand">MYBASKET</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${baseStyles(structure)}</style></head><body>
    <div class="editbar no-print"><button type="button" onclick="window.print()">Imprimer / PDF</button></div>
    <header class="hero"><div>${brand}</div><div class="org"><b>${escapeHtml(structure.name)}</b>${escapeHtml(structure.season_label || "")}${structure.city ? ` · ${escapeHtml(structure.city)}` : ""}</div></header>
    <main contenteditable="true"><h1>${escapeHtml(title)}</h1><div class="subtitle">Document institutionnel · contenu entièrement modifiable avant impression</div>
    <section class="structure-card"><div><strong>${escapeHtml(structure.name)}</strong><span>${escapeHtml(structure.structure_type)}${structure.city ? ` · ${escapeHtml(structure.city)}` : ""}</span></div><div><span>${escapeHtml(structure.email || "")}</span><span>${escapeHtml(structure.phone || "")}</span><span>Saison ${escapeHtml(structure.season_label || "")}</span></div></section>
    ${body}</main><footer class="doc-footer"><span>${escapeHtml(structure.name)}</span><span>${escapeHtml(structure.season_label || "")}</span></footer>
  </body></html>`;
}

function buildDocument(key: TemplateKey, structure: Structure, people: Person[], players: Player[], events: EventRow[]) {
  const eventRows = events.slice(0, 30).map((e) => `
    <tr><td>${escapeHtml(frDate(e.event_date))}</td><td>${escapeHtml(e.start_time || "")}</td><td>${escapeHtml(e.end_time || "")}</td><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.location || "")}</td><td>${escapeHtml(e.intervenant || "")}</td></tr>`).join("");
  const participantNames = people.map(displayName).filter(Boolean);
  const playerNames = players.map((p) => `${p.first_name} ${p.last_name}`.trim());

  if (key === "attendance") {
    const dates = Array.from(new Set(events.map((e) => e.event_date))).slice(0, 3);
    const headers = dates.length ? dates : ["Date 1", "Date 2", "Date 3"];
    return shell(structure, "Feuille d’émargement", `
      <table><thead><tr><th>Nom et prénom des stagiaires</th>${headers.map((d) => `<th>${escapeHtml(frDate(d))}<br>Matin</th><th>${escapeHtml(frDate(d))}<br>Après-midi</th>`).join("")}<th>Nombre d’heures total</th></tr></thead>
      <tbody>${rows(participantNames, 2 * headers.length + 2)}</tbody></table>
      <div class="footer"><div><b>Signature du formateur :</b><div class="box big"></div></div><div><b>Cachet de l’organisme :</b><div class="box big"></div></div></div>`);
  }

  if (key === "schedule") {
    return shell(structure, "Planning de formation / stage", `<table><thead><tr><th>Date</th><th>Début</th><th>Fin</th><th>Contenu</th><th>Lieu</th><th>Intervenant</th></tr></thead><tbody>${eventRows || rows([], 6)}</tbody></table>`);
  }

  if (key === "participants") {
    return shell(structure, "Liste des participants", `<table><thead><tr><th>#</th><th>Nom et prénom</th><th>Email</th><th>Téléphone</th><th>Rôle / statut</th></tr></thead><tbody>${people.map((p, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(displayName(p))}</td><td>${escapeHtml(p.email || "")}</td><td>${escapeHtml(p.phone || "")}</td><td>${escapeHtml(p.role_label || "")}</td></tr>`).join("") || rows([], 5)}</tbody></table>`);
  }

  if (key === "player_info") {
    return shell(structure, "Fiche de renseignements joueur", `<table><thead><tr><th>Nom / prénom</th><th>Naissance</th><th>Club</th><th>Catégorie</th><th>Années basket</th><th>Taille</th><th>Email</th></tr></thead><tbody>${players.map((p) => `<tr><td>${escapeHtml(`${p.first_name} ${p.last_name}`)}</td><td>${escapeHtml(frDate(p.birthdate))}</td><td>${escapeHtml(p.club_name || "")}</td><td>${escapeHtml(p.category || "")}</td><td>${escapeHtml(p.years_basket ?? "")}</td><td>${escapeHtml(p.height_cm ? `${p.height_cm} cm` : "")}</td><td>${escapeHtml(p.email || "")}</td></tr>`).join("") || rows(playerNames, 7)}</tbody></table><p class="muted">Seules les informations nécessaires au dispositif doivent être demandées et conservées.</p>`);
  }

  if (key === "registration") {
    return shell(structure, "Fiche d’inscription formation", `<h2>Identité</h2><div class="fieldrow"><div class="field"><small>Nom</small>&nbsp;</div><div class="field"><small>Prénom</small>&nbsp;</div><div class="field"><small>Date de naissance</small>&nbsp;</div><div class="field"><small>Email</small>&nbsp;</div><div class="field"><small>Téléphone</small>&nbsp;</div><div class="field"><small>Adresse</small>&nbsp;</div></div><h2>Structure du participant</h2><div class="fieldrow"><div class="field"><small>Club / structure</small>&nbsp;</div><div class="field"><small>N° affiliation / identifiant</small>&nbsp;</div><div class="field"><small>Fonction dans la structure</small>&nbsp;</div><div class="field"><small>Responsable / référent</small>&nbsp;</div><div class="field"><small>Email du responsable</small>&nbsp;</div><div class="field"><small>Téléphone du responsable</small>&nbsp;</div></div><h2>Formation</h2><div class="fieldrow"><div class="field"><small>Intitulé</small>&nbsp;</div><div class="field"><small>Session / promotion</small>&nbsp;</div><div class="field"><small>Dates</small>&nbsp;</div><div class="field"><small>Lieu</small>&nbsp;</div></div><h2>Motivation & attentes</h2><div class="box big"></div><div class="footer"><div>Fait à <span class="line"></span>, le <span class="line"></span></div><div>Signature : <span class="line"></span></div></div>`);
  }

  if (key === "attendance_certificate" || key === "training_certificate") {
    const label = key === "attendance_certificate" ? "Attestation de présence" : "Attestation de formation";
    return shell(structure, label, `<div style="margin-top:35px;font-size:16px;line-height:2"><p>Je soussigné(e), représentant(e) de <b>${escapeHtml(structure.name)}</b>, atteste que :</p><p><b>Madame / Monsieur :</b> <span class="line" style="min-width:360px"></span></p><p>a ${key === "attendance_certificate" ? "participé à" : "suivi"} la formation : <span class="line" style="min-width:360px"></span></p><p>du <span class="line"></span> au <span class="line"></span>, pour un volume total de <span class="line"></span> heures.</p></div><div class="footer" style="margin-top:70px"><div>Fait à ${escapeHtml(structure.city || "")}, le <span class="line"></span></div><div class="right"><b>Signature et cachet</b><div class="box big" style="width:260px"></div></div></div>`);
  }

  if (key === "player_evaluation" || key === "coach_evaluation") {
    const who = key === "player_evaluation" ? "joueur" : "cadre";
    return shell(structure, `Fiche d’évaluation ${who}`, `<div class="grid2"><div class="box"><b>Nom / prénom :</b> <span class="line"></span><br><br><b>Dispositif :</b> <span class="line"></span></div><div class="box"><b>Évaluateur :</b> <span class="line"></span><br><br><b>Date :</b> <span class="line"></span></div></div><table><thead><tr><th>Compétence / domaine</th><th>À développer</th><th>En acquisition</th><th>Acquis</th><th>Maîtrisé</th><th>Observations</th></tr></thead><tbody>${rows([], 6)}</tbody></table><h2>Points d’appui</h2><div class="box big"></div><h2>Axes de progression / objectifs</h2><div class="box big"></div>`);
  }

  if (key === "parental_authorization") {
    return shell(structure, "Autorisation parentale", `<div style="line-height:1.55"><p>Je soussigné(e) <span class="line"></span>, responsable légal de <span class="line"></span>, autorise sa participation au stage / rassemblement organisé par <b>${escapeHtml(structure.name)}</b>.</p><p>Intitulé : <span class="line"></span></p><p>Date(s) : <span class="line"></span> &nbsp; Lieu : <span class="line"></span></p><p>Téléphone à joindre en cas de besoin : <span class="line"></span></p></div><h2>Autorisations</h2><div class="consent"><span class="boxcheck"></span><span>J’autorise la participation de mon enfant à l’action indiquée ci-dessus.</span></div><div class="consent"><span class="boxcheck"></span><span>J’autorise les prises de vues photographiques et audiovisuelles dans le cadre des activités de l’institution.</span></div><div class="consent"><span class="boxcheck"></span><span>J’autorise la diffusion non commerciale de ces images sur les supports de l’institution.</span></div><div class="footer"><div>Fait à <span class="line"></span>, le <span class="line"></span></div><div>Signature du responsable légal : <div class="box big"></div></div></div>`);
  }

  if (key === "training_report" || key === "stage_summary") {
    const title = key === "training_report" ? "Bilan de formation" : "Fiche récapitulative stage / sélection";
    return shell(structure, title, `<div class="grid2"><div class="box"><b>Intitulé :</b><br><br><b>Date(s) :</b><br><br><b>Lieu :</b></div><div class="box"><b>Responsable :</b><br><br><b>Nombre de participants :</b> ${key === "training_report" ? participantNames.length : playerNames.length}<br><br><b>Nombre d’intervenants :</b></div></div><h2>Programme</h2><table><thead><tr><th>Date</th><th>Horaires</th><th>Contenu</th><th>Lieu</th><th>Intervenant</th></tr></thead><tbody>${events.slice(0, 15).map((e) => `<tr><td>${escapeHtml(frDate(e.event_date))}</td><td>${escapeHtml(`${e.start_time || ""} - ${e.end_time || ""}`)}</td><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.location || "")}</td><td>${escapeHtml(e.intervenant || "")}</td></tr>`).join("") || rows([], 5)}</tbody></table><h2>Observations / bilan</h2><div class="box big"></div><h2>Suites / actions à mener</h2><div class="box big"></div>`);
  }

  return shell(structure, "Document MyBasket", "");
}

export default function InstitutionalDocumentTemplates({ structureId }: { structureId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [structure, setStructure] = useState<Structure | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tous");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [a, b, c, d] = await Promise.all([
        supabase.from("institutional_structures").select("*").eq("id", structureId).single(),
        supabase.from("institutional_people").select("id,first_name,last_name,email,phone,role_label").eq("structure_id", structureId).eq("archived", false).order("last_name"),
        supabase.from("institutional_players").select("id,first_name,last_name,birthdate,club_name,category,email,height_cm,years_basket").eq("structure_id", structureId).eq("archived", false).order("last_name"),
        supabase.from("institutional_events").select("id,event_date,start_time,end_time,title,event_type,location,intervenant").eq("structure_id", structureId).eq("archived", false).order("event_date"),
      ]);
      if (a.data) setStructure(a.data as Structure);
      setPeople((b.data || []) as Person[]);
      setPlayers((c.data || []) as Player[]);
      setEvents((d.data || []) as EventRow[]);
    }
    void load();
  }, [structureId, supabase]);

  const visible = TEMPLATES.filter((t) => {
    const q = query.trim().toLowerCase();
    return (category === "Tous" || t.category === category) && (!q || `${t.title} ${t.description}`.toLowerCase().includes(q));
  });

  function preview(template: Template) {
    if (!structure) return;
    const html = buildDocument(template.key, structure, people, players, events);
    const win = window.open("", "_blank");
    if (!win) return alert("Autorise les fenêtres pop-up pour prévisualiser le document.");
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  async function saveTemplate(template: Template) {
    if (!structure) return;
    setBusy(template.key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const html = buildDocument(template.key, structure, people, players, events);
      const { error } = await supabase.from("institutional_documents").insert({
        structure_id: structureId,
        title: template.title,
        document_type: "generated_template",
        content: {
          template_key: template.key,
          html,
          generated_at: new Date().toISOString(),
          prefilled: true,
        },
        created_by: user.id,
      });
      if (error) throw error;
      alert("Document prérempli enregistré dans Documents.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d’enregistrer le document.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="templates">
      <div className="toolbar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un modèle…" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option>Tous</option><option>Formation</option><option>Joueurs</option><option>Stage / sélection</option><option>Évaluation</option>
        </select>
      </div>
      <div className="info"><b>Préremplissage automatique :</b> organisme, saison, contacts, participants, joueurs et planning sont repris depuis l’espace Institution. Tu gardes toujours la possibilité de compléter le document avant signature.</div>
      <div className="grid">
        {visible.map((template) => (
          <article key={template.key}>
            <small>{template.category}</small>
            <h3>{template.title}</h3>
            <p>{template.description}</p>
            <div className="actions">
              <button className="secondary" onClick={() => preview(template)}>Prévisualiser / PDF</button>
              <button onClick={() => void saveTemplate(template)} disabled={busy === template.key}>{busy === template.key ? "Enregistrement…" : "Enregistrer prérempli"}</button>
            </div>
          </article>
        ))}
      </div>
      <style jsx>{`
        .templates{display:grid;gap:12px}.toolbar{display:flex;gap:8px;flex-wrap:wrap}.toolbar input{flex:1;min-width:220px}.toolbar input,.toolbar select{border:1px solid #ddd1ca;border-radius:9px;padding:9px 11px;background:#fff}.info{background:#fbf6ed;border:1px solid #ead6ae;border-radius:10px;padding:10px 12px;color:#665749;font-size:.8rem}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}article{border:1px solid #eadfd9;border-radius:12px;padding:12px;background:#fff;display:flex;flex-direction:column;min-height:165px}article small{color:#d4a24c;font-weight:900;text-transform:uppercase;font-size:.68rem;letter-spacing:.06em}article h3{margin:6px 0 5px;font-size:.98rem;color:#331015}article p{margin:0;color:#796b64;font-size:.78rem;line-height:1.4;flex:1}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.actions button{border:0;border-radius:8px;padding:8px 10px;background:#6b1a2c;color:#fff;font-weight:800;font-size:.75rem;cursor:pointer}.actions .secondary{background:#fff;color:#6b1a2c;border:1px solid #cbaeb5}.actions button:disabled{opacity:.55;cursor:default}@media(max-width:1000px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
