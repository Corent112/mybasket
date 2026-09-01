"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  INSTITUTIONAL_RESOURCE_TEMPLATES,
  RESOURCE_AUDIENCES,
  RESOURCE_CATEGORIES,
  type InstitutionalAudience,
  type InstitutionalResourceCategory,
  type InstitutionalResourceTemplate,
} from "@/lib/institutional-resource-templates";

type Structure = {
  id: string;
  structure_type: "committee" | "league" | "federation" | "pole";
  name: string;
  short_name: string | null;
  season_label: string | null;
  city: string | null;
  email: string | null;
  logo_url: string | null;
  document_primary_color: string | null;
  document_secondary_color: string | null;
};
type Person = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; role_label: string | null };
type Player = { id: string; first_name: string; last_name: string; birthdate: string | null; club_name: string | null; category: string | null; email: string | null; height_cm: number | null; years_basket: number | null };
type SavedDocument = { id: string; title: string; document_type: string; content: any; created_at: string; updated_at?: string | null };

type TrainingCohort = { id:string; name:string; planning_title?:string|null };
type TrainingCandidate = { id:string; cohort_id:string; first_name?:string|null; last_name?:string|null; email?:string|null; club_name?:string|null };
type InstitutionEvent = { id:string; event_date:string|null; start_time:string|null; end_time:string|null; title:string; location:string|null; intervenant:string|null; cohort_id:string|null };

type Props = {
  structureId: string;
  compact?: boolean;
  savedOnly?: boolean;
  categories?: InstitutionalResourceCategory[];
  eventId?: string;
  eventTitle?: string;
};

const TYPE_TO_AUDIENCE: Record<Structure["structure_type"], InstitutionalAudience> = {
  committee: "Comité",
  league: "Ligue",
  federation: "Fédération",
  pole: "Pôle",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeEditableHtml(raw: string) {
  if (typeof window === "undefined") return raw;
  const doc = new DOMParser().parseFromString(`<div id="mb-root">${raw}</div>`, "text/html");
  doc.querySelectorAll("script,iframe,object,embed,meta,link,base,form").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "src") && value.startsWith("javascript:"))) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return doc.querySelector("#mb-root")?.innerHTML ?? "";
}

function replaceToken(source: string, token: string, value: unknown) {
  return source.split(`{{${token}}}`).join(escapeHtml(value));
}

function eventTitleFallback(event?: InstitutionEvent | null) { return event?.title || "Formation à préciser"; }

function buildPrefilledHtml(template: InstitutionalResourceTemplate, structure: Structure, person?: Person | null, player?: Player | null, event?: InstitutionEvent | null, cohort?: TrainingCohort | null, recipients: TrainingCandidate[] = []) {
  let html = template.bodyHtml;
  const recipientList = recipients.length ? `<ul>${recipients.map((r) => `<li>${escapeHtml(`${r.first_name || ""} ${r.last_name || ""}`.trim())}${r.club_name ? ` — ${escapeHtml(r.club_name)}` : ""}</li>`).join("")}</ul>` : "Liste à compléter";
  html = html.split("{{recipients.list}}").join(recipientList);
  const personName = person ? `${person.first_name} ${person.last_name}`.trim() : "";
  const playerName = player ? `${player.first_name} ${player.last_name}`.trim() : "";
  const tokens: Record<string, unknown> = {
    "structure.name": structure.name,
    "structure.short_name": structure.short_name || structure.name,
    "structure.season": structure.season_label || "",
    "structure.city": structure.city || "",
    "structure.email": structure.email || "",
    today: new Intl.DateTimeFormat("fr-FR").format(new Date()),
    "person.full_name": personName,
    "person.email": person?.email || "",
    "person.phone": person?.phone || "",
    "person.role": person?.role_label || "",
    "player.full_name": playerName,
    "player.birthdate": player?.birthdate || "",
    "player.club_name": player?.club_name || "",
    "player.category": player?.category || "",
    "player.email": player?.email || "",
    "player.height_cm": player?.height_cm ? `${player.height_cm} cm` : "",
    "player.years_basket": player?.years_basket ?? "",
    "event.title": event?.title || "Événement à préciser",
    "event.date": event?.event_date ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(`${event.event_date}T12:00:00`)) : "Date à préciser",
    "event.hours": [event?.start_time?.slice(0,5), event?.end_time?.slice(0,5)].filter(Boolean).join(" - ") || "Horaires à préciser",
    "event.location": event?.location || "⚠ Lieu non renseigné",
    "event.training": cohort?.planning_title || cohort?.name || eventTitleFallback(event),
  };
  Object.entries(tokens).forEach(([token, value]) => { html = replaceToken(html, token, value); });
  return html.replace(/\{\{[^}]+\}\}/g, "");
}

function docHex(value:string|null|undefined,fallback:string){return /^#[0-9a-fA-F]{6}$/.test(String(value||""))?String(value).toUpperCase():fallback;}
function docPrimary(s:Structure){return docHex(s.document_primary_color,"#6B1A2C");}
function docSecondary(s:Structure){return docHex(s.document_secondary_color,"#D4A24C");}
function logoMarkup(s:Structure){return s.logo_url?`<img class="doc-logo" src="${escapeHtml(s.logo_url)}" alt="Logo ${escapeHtml(s.name)}">`:`<strong>${escapeHtml(s.name)}</strong>`;}

function documentCss(structure: Structure, layout: InstitutionalResourceTemplate["layout"] = "portrait") {
  const primary=docPrimary(structure), secondary=docSecondary(structure);
  const pageSize = layout === "landscape" || layout === "presentation" ? "A4 landscape" : "A4";
  const pageWidth = layout === "landscape" || layout === "presentation" ? "297mm" : "210mm";
  const pageHeight = layout === "landscape" || layout === "presentation" ? "210mm" : "297mm";
  return `
    :root{font-family:Arial,Helvetica,sans-serif;color:#241b1e;background:#efe9e7;--wine:${primary};--wine2:${primary};--gold:${secondary};--ink:#241b1e;--muted:#77696d;--blush:#f7eef0;--line:#e3d5d8}
    *{box-sizing:border-box;max-width:100%}body{margin:0;padding:20px;background:linear-gradient(135deg,#f5f0ee,#ebe4e2)}.sheet{position:relative;overflow:hidden;width:min(100%,794px);margin:0 auto;background:#fff;min-height:0;padding:96px 38px 42px;border:0;border-radius:2px;box-shadow:0 18px 60px rgba(54,18,28,.16)}
    .sheet:before{content:"";position:absolute;left:-8%;right:-8%;top:-82px;height:164px;background:var(--wine);border-radius:0 0 48% 52%/0 0 34% 36%;transform:rotate(-1.2deg)}.sheet:after{content:"";position:absolute;left:-5%;right:-5%;top:78px;height:5px;background:var(--gold);border-radius:50%;transform:rotate(-1deg)}
    .doc-brand{position:absolute;z-index:1;left:38px;right:38px;top:22px;height:48px;display:flex;justify-content:space-between;align-items:flex-start;gap:14px;color:#fff;min-width:0}.doc-brand>div{min-width:0}.doc-brand strong{font-size:14px;color:#fff;letter-spacing:.02em}.doc-brand span{color:#f4eef0;font-size:9px;line-height:1.35;overflow-wrap:anywhere}.doc-logo{display:block;max-width:112px;max-height:42px;object-fit:contain;background:#fff;border-radius:5px;padding:3px}.doc-title{position:relative;font-size:22px;line-height:1.05;margin:10px 0 3px;color:var(--wine);letter-spacing:-.025em}.doc-subtitle{margin:0 0 17px;color:var(--muted);font-size:9px}
    h1,h2,h3,p,div,span{overflow-wrap:anywhere}.mb-section{position:relative;margin:15px 0 17px;padding-left:13px;break-inside:avoid}.mb-section:before{content:"";position:absolute;left:0;top:2px;width:3px;height:25px;border-radius:8px;background:var(--gold)}h2{font-size:11px;letter-spacing:.035em;text-transform:uppercase;color:var(--wine);margin:0 0 8px}.mb-area{min-height:43px;padding:8px 0 4px;line-height:1.35;border:0;border-top:1px solid var(--line)}
    .mb-grid{display:grid;gap:7px 14px;min-width:0}.mb-grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.mb-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.mb-field{position:relative;min-width:0;border:0;padding:3px 0 6px;min-height:34px;border-bottom:1px solid #cdbfc3}.mb-field b{display:block;color:#8a777d;font-size:7px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}.mb-field span{display:block;min-height:12px;font-size:9px;color:var(--ink)}
    table{display:table!important;width:100%!important;max-width:100%!important;border-collapse:separate;border-spacing:0;margin:9px 0 14px;table-layout:fixed!important;border:1px solid var(--line);border-radius:8px;overflow:hidden}thead,tbody,tr{max-width:100%}th,td{border:0;border-bottom:1px solid #eadfe2;padding:4px 3px;vertical-align:top;font-size:7.4px;line-height:1.2;overflow-wrap:anywhere!important;word-break:break-word!important;white-space:normal!important;min-width:0!important}th{background:var(--wine)!important;color:#fff!important;text-align:center;font-weight:800;font-size:6.6px;text-transform:uppercase;letter-spacing:.01em}tbody tr:nth-child(even) td{background:#fbf7f8}tbody tr:last-child td{border-bottom:0}
    .mb-scenario-head{position:relative;text-align:left;margin:4px 0 12px;padding:11px 14px;background:linear-gradient(125deg,var(--wine),var(--wine));color:#fff;border-radius:11px 11px 24px 11px}.mb-scenario-level{font-size:17px;font-weight:900;color:#fff;margin-bottom:4px}.mb-scenario-theme{border:0;border-top:1px solid rgba(255,255,255,.25);padding:6px 0 0;color:var(--gold);font-size:11px;font-weight:800}.mb-swot{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mb-swot section{border:0;border-left:3px solid var(--gold);background:#fbf7f8;padding:8px;min-height:90px;border-radius:0 9px 9px 0}.mb-practical h1{color:var(--wine);border:0;padding-bottom:5px}.mb-presentation-cover{margin:4px 0 18px;padding:24px;border-radius:18px;background:linear-gradient(135deg,var(--wine),var(--wine2));color:#fff;min-height:150px;display:flex;flex-direction:column;justify-content:flex-end}.mb-presentation-cover h1{font-size:32px;line-height:1;margin:5px 0;color:#fff}.mb-presentation-cover p{color:#fff;margin:0}.mb-presentation-kicker{color:var(--gold);font-size:10px;font-weight:900;letter-spacing:.14em}.mb-certificate{text-align:center;padding:22px 12px;margin:8px 0 18px;border-top:2px solid var(--gold);border-bottom:2px solid var(--gold)}.mb-certificate h1{font-size:26px;color:var(--wine);margin:10px 0}.mb-certificate h2{font-size:15px;color:var(--wine);text-transform:none}
    input[type=checkbox]{width:13px;height:13px;accent-color:var(--wine)}.mb-check,.checkbox,.check-row{display:flex;align-items:flex-start;gap:6px;break-inside:avoid}
    [contenteditable=true]:focus{outline:2px solid color-mix(in srgb,var(--gold) 35%,transparent);outline-offset:3px;border-radius:4px}
    @media(max-width:760px){body{padding:0}.sheet{padding:88px 14px 30px;width:100%}.doc-brand{left:14px;right:14px}.mb-grid-2,.mb-grid-3,.mb-swot{grid-template-columns:1fr}.mb-section{padding-left:10px}}
    @media print{@page{size:${pageSize};margin:0}html,body{width:${pageWidth};margin:0;padding:0;background:#fff}.sheet{box-shadow:none;width:${pageWidth}!important;max-width:${pageWidth}!important;min-height:${pageHeight};padding:29mm 12mm 12mm;overflow:hidden}.sheet:before{top:-26mm;height:51mm}.sheet:after{top:25mm;height:1.5mm}.doc-brand{left:12mm;right:12mm;top:7mm;height:14mm}.doc-logo{max-width:30mm;max-height:12mm}.doc-title{font-size:18px;margin:2mm 0 1mm}.doc-subtitle{font-size:7.5px;margin-bottom:3mm}.mb-section{margin:3mm 0 3.5mm;padding-left:3.5mm}.mb-section:before{width:.8mm;height:6mm}h2{font-size:8.5px;margin-bottom:1.5mm}.mb-area{min-height:10mm;padding:1.5mm 0}.mb-grid{gap:1.4mm 4mm}.mb-field{min-height:7mm;padding:.8mm 0 1mm}.mb-field b{font-size:5.8px;margin-bottom:.7mm}.mb-field span{font-size:7.5px;min-height:3mm}table{margin:2mm 0 3mm!important}th,td{padding:1.05mm .7mm!important;font-size:6.2px!important;line-height:1.15!important}th{font-size:5.6px!important}.mb-swot section{min-height:20mm;padding:2mm}.no-print{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  `;
}

function printableHtml(title: string, structure: Structure, body: string, layout: InstitutionalResourceTemplate["layout"] = "portrait") {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${documentCss(structure, layout)}</style></head><body><article class="sheet"><header class="doc-brand"><div>${logoMarkup(structure)}<span>${escapeHtml(structure.season_label || "")}</span></div><span>${escapeHtml(structure.email || "")}</span></header><h1 class="doc-title">${escapeHtml(title)}</h1><p class="doc-subtitle">Document institutionnel · contenu entièrement modifiable</p><div contenteditable="true">${body}</div></article></body></html>`;
}

export default function InstitutionalResources({ structureId, compact = false, savedOnly = false, categories, eventId, eventTitle }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [structure, setStructure] = useState<Structure | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [saved, setSaved] = useState<SavedDocument[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(categories?.[0] || "Tous");
  const [audience, setAudience] = useState<string>("Ma structure");
  const [activeTemplate, setActiveTemplate] = useState<InstitutionalResourceTemplate | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [html, setHtml] = useState("");
  const [personId, setPersonId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSaved, setShowSaved] = useState(savedOnly);
  const [cohorts, setCohorts] = useState<TrainingCohort[]>([]);
  const [trainees, setTrainees] = useState<TrainingCandidate[]>([]);
  const [recipientIds, setRecipientIds] = useState<Set<string>>(new Set());
  const [linkedEvent, setLinkedEvent] = useState<InstitutionEvent | null>(null);

  async function load() {
    const [a, b, c, d, e] = await Promise.all([
      supabase.from("institutional_structures").select("id,structure_type,name,short_name,season_label,city,email,logo_url,document_primary_color,document_secondary_color").eq("id", structureId).single(),
      supabase.from("institutional_people").select("id,first_name,last_name,email,phone,role_label").eq("structure_id", structureId).eq("archived", false).order("last_name"),
      supabase.from("institutional_players").select("id,first_name,last_name,birthdate,club_name,category,email,height_cm,years_basket").eq("structure_id", structureId).eq("archived", false).order("last_name"),
      supabase.from("institutional_documents").select("id,title,document_type,content,created_at,updated_at").eq("structure_id", structureId).eq("archived", false).eq("document_type", "resource_instance").order("updated_at", { ascending: false }),
      supabase.from("training_cohorts").select("id,name,planning_title").eq("institution_id", structureId).order("created_at", { ascending: false }),
    ]);
    if (a.data) setStructure(a.data as Structure);
    setPeople((b.data || []) as Person[]);
    setPlayers((c.data || []) as Player[]);
    setSaved((d.data || []) as SavedDocument[]);
    const loadedCohorts=(e.data || []) as TrainingCohort[];
    setCohorts(loadedCohorts);
    if(eventId){
      const ev=await supabase.from("institutional_events").select("id,event_date,start_time,end_time,title,location,intervenant,cohort_id").eq("id",eventId).eq("structure_id",structureId).maybeSingle();
      setLinkedEvent((ev.data || null) as InstitutionEvent | null);
      if(loadedCohorts.length){
        const ids=loadedCohorts.map(x=>x.id);
        const q=await supabase.from("training_candidates").select("id,cohort_id,first_name,last_name,email,club_name").in("cohort_id",ids).eq("status","active").order("last_name");
        setTrainees((q.data || []) as TrainingCandidate[]);
      } else setTrainees([]);
    } else { setLinkedEvent(null); setTrainees([]); }
  }

  useEffect(() => { void load(); }, [structureId, eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentAudience = structure ? TYPE_TO_AUDIENCE[structure.structure_type] : null;
  const visibleTemplates = INSTITUTIONAL_RESOURCE_TEMPLATES.filter((template) => {
    if (categories?.length && !categories.includes(template.category)) return false;
    if (category !== "Tous" && template.category !== category) return false;
    if (audience === "Ma structure" && currentAudience && !template.audiences.includes(currentAudience)) return false;
    if (audience !== "Ma structure" && audience !== "Tous" && !template.audiences.includes(audience as InstitutionalAudience)) return false;
    const q = query.trim().toLowerCase();
    return !q || `${template.title} ${template.description} ${template.category}`.toLowerCase().includes(q);
  });

  function openTemplate(template: InstitutionalResourceTemplate) {
    if (!structure) return;
    setActiveTemplate(template);
    setDocId(null);
    setDocTitle(template.title);
    setPersonId("");
    setPlayerId("");
    const cohort = cohorts.find((c) => c.id === linkedEvent?.cohort_id) || null;
    setHtml(buildPrefilledHtml(template, structure, null, null, linkedEvent, cohort, []));
    if(eventId) setRecipientIds(new Set());
    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function openSaved(row: SavedDocument) {
    const template = INSTITUTIONAL_RESOURCE_TEMPLATES.find((x) => x.key === row.content?.template_key) || null;
    setActiveTemplate(template || {
      key: row.content?.template_key || "custom",
      title: row.title,
      category: row.content?.category || "Administration",
      audiences: row.content?.audiences || (currentAudience ? [currentAudience] : ["Comité"]),
      description: "Document personnalisé",
      icon: "📄",
      bodyHtml: row.content?.html || "",
      layout: row.content?.layout || "portrait",
    });
    setDocId(row.id);
    setDocTitle(row.title);
    setPersonId(row.content?.person_id || "");
    setPlayerId(row.content?.player_id || "");
    setHtml(row.content?.html || "");
    setRecipientIds(new Set(Array.isArray(row.content?.training_candidate_ids)?row.content.training_candidate_ids:[]));
    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function applyPrefill() {
    if (!activeTemplate || !structure) return;
    if (html.trim() && !confirm("Réappliquer le modèle prérempli ? Les modifications non enregistrées seront remplacées.")) return;
    const person = people.find((x) => x.id === personId) || null;
    const player = players.find((x) => x.id === playerId) || null;
    const cohort = cohorts.find((c) => c.id === linkedEvent?.cohort_id) || null;
    const selected = trainees.filter((t) => recipientIds.has(t.id));
    setHtml(buildPrefilledHtml(activeTemplate, structure, person, player, linkedEvent, cohort, selected));
  }

  async function save(asCopy = false) {
    if (!structure || !activeTemplate) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expirée.");
      const cleanHtml = sanitizeEditableHtml(html);
      const content = {
        source: "mybasket_resource_library",
        version: 1,
        template_key: activeTemplate.key,
        category: activeTemplate.category,
        audiences: activeTemplate.audiences,
        layout: activeTemplate.layout || "portrait",
        html: cleanHtml,
        person_id: personId || null,
        player_id: playerId || null,
        event_id: eventId || null,
        event_title: eventTitle || null,
        training_candidate_ids: Array.from(recipientIds),
        updated_at: new Date().toISOString(),
      };
      const title = `${docTitle.trim() || activeTemplate.title}${asCopy ? " – copie" : ""}`;
      let result;
      if (docId && !asCopy) {
        result = await supabase.from("institutional_documents").update({ title, content, updated_at: new Date().toISOString() }).eq("id", docId).select("id").single();
      } else {
        result = await supabase.from("institutional_documents").insert({ structure_id: structureId, title, document_type: "resource_instance", content, created_by: user.id }).select("id").single();
      }
      if (result.error) throw result.error;
      setDocId(result.data.id);
      setDocTitle(title);
      setHtml(cleanHtml);
      if(eventId){
        const names=trainees.filter(t=>recipientIds.has(t.id)).map(t=>`${t.first_name||""} ${t.last_name||""}`.trim()).filter(Boolean);
        const existing=await supabase.from("institutional_event_resources").select("id").eq("event_id",eventId).eq("document_id",result.data.id).maybeSingle();
        const payload={structure_id:structureId,event_id:eventId,resource_type:"document",title,note:names.length?`Destinataires : ${names.join(", ")}`:"Aucun destinataire sélectionné",document_id:result.data.id,completed:true,created_by:user.id};
        const link=existing.data?.id
          ? await supabase.from("institutional_event_resources").update({title:payload.title,note:payload.note,completed:true}).eq("id",existing.data.id)
          : await supabase.from("institutional_event_resources").insert(payload);
        if(link.error) throw link.error;
      }
      await load();
      alert(asCopy ? "Copie enregistrée dans Documents." : "Document enregistré.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  function printDocument() {
    if (!structure || !activeTemplate) return;
    const win = window.open("", "_blank");
    if (!win) return alert("Autorise les fenêtres pop-up pour imprimer / enregistrer en PDF.");
    win.document.open();
    win.document.write(printableHtml(docTitle || activeTemplate.title, structure, sanitizeEditableHtml(html), activeTemplate.layout || "portrait"));
    win.document.close();
    window.setTimeout(() => { win.focus(); win.print(); }, 180);
  }

  async function archive(row: SavedDocument) {
    if (!confirm(`Archiver « ${row.title} » ?`)) return;
    const q = await supabase.from("institutional_documents").update({ archived: true, archived_at: new Date().toISOString() }).eq("id", row.id);
    if (q.error) return alert(q.error.message);
    if (docId === row.id) { setDocId(null); setActiveTemplate(null); setHtml(""); }
    await load();
  }

  if (!structure) return <div className="resources-loading">Chargement des ressources…</div>;

  return (
    <div className={`ir ${compact ? "compact" : ""}`}>
      {!savedOnly && (
        <>
          {!compact && (
            <div className="intro">
              <div><b>Bibliothèque MyBasket</b><span>Modèles préconçus, préremplissables et 100 % éditables.</span></div>
              <button type="button" onClick={() => setShowSaved((v) => !v)}>{showSaved ? "Voir les modèles" : `Mes documents (${saved.length})`}</button>
            </div>
          )}
          {!showSaved && (
            <>
              {!compact && <div className="filters"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une ressource…"/><select value={category} onChange={(e) => setCategory(e.target.value)}><option>Tous</option>{RESOURCE_CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select><select value={audience} onChange={(e) => setAudience(e.target.value)}><option>Ma structure</option><option>Tous</option>{RESOURCE_AUDIENCES.map((x) => <option key={x}>{x}</option>)}</select></div>}
              <div className="template-grid">
                {visibleTemplates.slice(0, compact ? 12 : undefined).map((template) => <article className="template-card" key={template.key}><div className="icon">{template.icon}</div><div className="meta"><small>{template.category}</small><h3>{template.title}</h3><p>{template.description}</p><div className="audiences">{template.audiences.map((x) => <span key={x}>{x}</span>)}</div></div><button type="button" onClick={() => openTemplate(template)}>Ouvrir et remplir</button></article>)}
              </div>
            </>
          )}
        </>
      )}

      {(savedOnly || showSaved) && <section className="saved"><div className="saved-head"><div><b>Documents enregistrés</b><span>Ils restent modifiables, duplicables et imprimables.</span></div>{!savedOnly && <button type="button" onClick={() => setShowSaved(false)}>← Modèles</button>}</div>{saved.length === 0 ? <p className="empty">Aucun document créé pour le moment.</p> : <div className="saved-grid">{saved.map((row) => <article key={row.id}><small>{row.content?.category || "Document"}</small><h3>{row.title}</h3><span>{new Intl.DateTimeFormat("fr-FR").format(new Date(row.updated_at || row.created_at))}</span><div><button type="button" onClick={() => openSaved(row)}>Ouvrir / modifier</button><button type="button" className="danger" onClick={() => void archive(row)}>Archiver</button></div></article>)}</div>}</section>}

      {activeTemplate && (
        <section className="editor" ref={editorRef}>
          <div className="editor-bar">
            <div className="editor-title"><small>{docId ? "DOCUMENT ENREGISTRÉ" : "NOUVEAU DOCUMENT"}</small><input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} /></div>
            <div className="editor-actions"><button type="button" onClick={() => void save(false)} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button><button type="button" className="secondary" onClick={() => void save(true)} disabled={busy}>Dupliquer</button><button type="button" className="secondary" onClick={printDocument}>🖨 Imprimer / PDF</button><button type="button" className="ghost" onClick={() => { setActiveTemplate(null); setHtml(""); setDocId(null); }}>Fermer</button></div>
          </div>
          <div className="prefill"><b>Préremplir sans verrouiller le texte</b><select value={personId} onChange={(e) => setPersonId(e.target.value)}><option value="">Aucune personne</option>{people.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}{p.role_label ? ` · ${p.role_label}` : ""}</option>)}</select><select value={playerId} onChange={(e) => setPlayerId(e.target.value)}><option value="">Aucun joueur</option>{players.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}{p.club_name ? ` · ${p.club_name}` : ""}</option>)}</select><button type="button" onClick={applyPrefill}>Appliquer le préremplissage</button></div>
          {eventId && activeTemplate.key !== "modele_vierge_personnalise" && <div className="smartHint"><b>✨ Préremplissage intelligent</b><span>Les données de l’événement (date, horaires, lieu, formation) sont reprises automatiquement. Après avoir choisi les destinataires, clique sur « Réappliquer le préremplissage » pour intégrer aussi leur liste au document.</span>{linkedEvent && !linkedEvent.location && <strong>⚠ Le lieu n’est pas renseigné : le document peut être préparé, mais vérifie-le avant envoi.</strong>}</div>}
          {eventId && <div className="recipients"><div className="recipientsHead"><div><b>Destinataires · Stagiaires</b><span>Choisis les stagiaires qui recevront ce document. Toutes les formations de l’Institution sont disponibles.</span></div><div><button type="button" onClick={()=>setRecipientIds(new Set(trainees.map(t=>t.id)))}>Tout sélectionner</button><button type="button" onClick={()=>setRecipientIds(new Set())}>Aucun</button></div></div><div className="recipientGroups">{cohorts.map(c=>{const rows=trainees.filter(t=>t.cohort_id===c.id);if(!rows.length)return null;return <section key={c.id}><h4>{c.planning_title||c.name}</h4>{rows.map(t=><label key={t.id}><input type="checkbox" checked={recipientIds.has(t.id)} onChange={e=>setRecipientIds(prev=>{const n=new Set(prev);if(e.target.checked)n.add(t.id);else n.delete(t.id);return n})}/><span><b>{t.first_name} {t.last_name}</b><small>{[t.club_name,t.email].filter(Boolean).join(" · ")}</small></span></label>)}</section>})}</div><p>{recipientIds.size} stagiaire{recipientIds.size>1?"s":""} sélectionné{recipientIds.size>1?"s":""}</p></div>}
          <p className="edit-hint">Clique directement dans le document : <b>titres, phrases, tableaux et contenus sont tous modifiables</b>. Le modèle MyBasket d’origine reste toujours disponible dans Ressources.</p>
          <div className={`paper-wrap ${activeTemplate.layout || "portrait"}`}><article className={`paper paper-${activeTemplate.layout || "portrait"}`} style={{"--doc-primary":docPrimary(structure),"--doc-secondary":docSecondary(structure)} as any}><header className="doc-brand"><div>{structure.logo_url?<img className="doc-logo-screen" src={structure.logo_url} alt={`Logo ${structure.name}`}/>:<strong>{structure.name}</strong>}<br/><span>{structure.season_label || ""}</span></div><span>{structure.email || ""}</span></header><h1 className="doc-title">{docTitle || activeTemplate.title}</h1><p className="doc-subtitle">Document institutionnel · contenu entièrement modifiable</p><div className="editable" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: html }} onInput={(e) => setHtml((e.currentTarget as HTMLDivElement).innerHTML)} /></article></div>
        </section>
      )}

      <style jsx>{`
        .ir{display:grid;gap:14px}.smartHint{display:grid;gap:4px;padding:10px 12px;border:1px solid #ead8b5;background:#fff9ed;border-radius:11px}.smartHint b{color:#6b1a2c}.smartHint span{font-size:.74rem;color:#6f625b}.smartHint strong{font-size:.72rem;color:#a32929}.recipients{border:1px solid #e5d8cf;background:#fffaf5;border-radius:12px;padding:10px;display:grid;gap:9px}.recipientsHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.recipientsHead>div:first-child{display:grid;gap:2px}.recipientsHead b{color:#5a1724}.recipientsHead span{font-size:.72rem;color:#7a6b65}.recipientsHead>div:last-child{display:flex;gap:6px}.recipientsHead button{border:1px solid #d6c5bd;background:#fff;color:#6b1a2c;border-radius:8px;padding:7px 9px;font-weight:850;cursor:pointer}.recipientGroups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.recipientGroups section{border:1px solid #eadfd8;border-radius:10px;padding:8px;background:#fff}.recipientGroups h4{margin:0 0 6px;color:#6b1a2c;font-size:.76rem}.recipientGroups label{display:flex;align-items:flex-start;gap:7px;padding:5px 0;border-top:1px solid #f1e8e3;font-size:.72rem}.recipientGroups label:first-of-type{border-top:0}.recipientGroups label span{display:grid}.recipientGroups label b{color:#4b3138}.recipientGroups label small{color:#84747a}.recipients>p{margin:0;color:#6b1a2c;font-size:.7rem;font-weight:900}.resources-loading{padding:18px;color:#756860}.intro,.saved-head,.editor-bar,.prefill{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.intro>div,.saved-head>div{display:grid}.intro span,.saved-head span{font-size:.78rem;color:#786a63}.intro button,.saved-head button,.editor-actions button,.prefill button,.template-card>button,.saved article button{border:0;border-radius:9px;padding:9px 11px;background:#6b1a2c;color:#fff;font-weight:850;cursor:pointer}.filters{display:grid;grid-template-columns:minmax(220px,1fr) 180px 160px;gap:8px}.filters input,.filters select,.prefill select,.editor-title input{border:1px solid #ddd1ca;border-radius:9px;padding:9px 11px;background:#fff;min-width:0}.template-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.template-card{border:1px solid #e7dcd6;border-radius:13px;padding:12px;background:#fff;display:grid;grid-template-columns:38px 1fr;gap:8px;align-items:start}.template-card .icon{font-size:25px}.template-card .meta{min-width:0}.template-card small,.saved article small,.editor-title small{color:#b67c1f;font-weight:900;text-transform:uppercase;letter-spacing:.05em;font-size:.66rem}.template-card h3,.saved article h3{margin:4px 0 5px;color:#321018;font-size:.96rem}.template-card p{margin:0 0 8px;color:#776b65;font-size:.76rem;line-height:1.35}.audiences{display:flex;gap:4px;flex-wrap:wrap}.audiences span{background:#f7f1ed;border-radius:999px;padding:3px 6px;font-size:.62rem;color:#6d5e57}.template-card>button{grid-column:1/-1;width:100%}.compact .template-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.compact .template-card p,.compact .audiences{display:none}.saved{display:grid;gap:10px}.saved-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.saved article{border:1px solid #e7dcd6;border-radius:11px;padding:10px;background:white}.saved article>span{display:block;color:#85766f;font-size:.7rem;margin-bottom:8px}.saved article>div{display:flex;gap:6px;flex-wrap:wrap}.saved article .danger{background:#fff;color:#a22929;border:1px solid #e6bcbc}.empty{color:#786a63}.editor{border-top:1px solid #e4d9d4;padding-top:14px;display:grid;gap:10px}.editor-title{display:grid;gap:3px;flex:1;min-width:240px}.editor-title input{font-size:1.05rem;font-weight:900}.editor-actions{display:flex;gap:6px;flex-wrap:wrap}.editor-actions .secondary{background:#fff;color:#6b1a2c;border:1px solid #cbaeb5}.editor-actions .ghost{background:#f0ece9;color:#4e403b}.editor-actions button:disabled{opacity:.55;cursor:default}.prefill{justify-content:flex-start;background:#faf6ef;border:1px solid #ead8b5;border-radius:10px;padding:9px}.prefill b{font-size:.78rem;color:#5d4b37}.edit-hint{margin:0;color:#74655e;font-size:.78rem}.paper-wrap{overflow:auto;background:linear-gradient(135deg,#eee8e6,#e5dcda);padding:22px;border-radius:18px}.paper{position:relative;overflow:hidden;max-width:794px;min-height:0;margin:0 auto;background:#fff;padding:96px 38px 42px;border:0;box-shadow:0 16px 45px rgba(64,23,34,.15);color:#231f20}.paper-landscape,.paper-presentation{max-width:1120px}.paper-presentation{min-height:630px}.paper:before{content:"";position:absolute;left:-8%;right:-8%;top:-82px;height:164px;background:var(--doc-primary,#6b1a2c);border-radius:0 0 48% 52%/0 0 34% 36%;transform:rotate(-1deg)}.paper:after{content:"";position:absolute;left:-5%;right:-5%;top:78px;height:5px;background:var(--doc-secondary,#d4a24c);border-radius:50%;transform:rotate(-1deg)}.doc-brand{position:absolute;z-index:1;left:38px;right:38px;top:22px;display:flex;justify-content:space-between;gap:16px;color:#fff}.doc-brand strong{font-size:14px;color:#fff}.doc-logo-screen{display:block;max-width:112px;max-height:42px;object-fit:contain;background:#fff;border-radius:5px;padding:3px}.doc-brand span{font-size:.72rem;color:#f3dfe3}.doc-title{font-size:1.45rem;letter-spacing:-.02em;color:var(--doc-primary,#4d101d);margin:12px 0 3px}.doc-subtitle{margin:0 0 17px;color:#7a6c65;font-size:.75rem}.editable{outline:none;line-height:1.45}.editable :global(h2){font-size:.9rem;letter-spacing:.05em;text-transform:uppercase;color:var(--doc-primary,#6b1a2c);margin:0 0 8px}.editable :global(.mb-section){position:relative;margin:15px 0;padding-left:13px}.editable :global(.mb-section:before){content:"";position:absolute;left:0;top:1px;width:4px;height:32px;border-radius:8px;background:var(--doc-secondary,#d4a24c)}.editable :global(.mb-area){border:0;border-top:1px solid #e3d5d8;min-height:43px;padding:8px 0}.editable :global(.mb-grid){display:grid;gap:7px 14px}.editable :global(.mb-grid-2){grid-template-columns:repeat(2,minmax(0,1fr))}.editable :global(.mb-grid-3){grid-template-columns:repeat(3,minmax(0,1fr))}.editable :global(.mb-field){border:0;border-bottom:1px solid #cdbfc3;padding:3px 0 6px;min-height:34px}.editable :global(.mb-field b){display:block;color:#5b4e48;font-size:.68rem;text-transform:uppercase;margin-bottom:6px}.editable :global(table){display:table!important;width:100%!important;max-width:100%!important;border-collapse:separate;border-spacing:0;margin:9px 0 14px;table-layout:fixed;border:1px solid #e3d5d8;border-radius:13px;overflow:hidden}.editable :global(th),.editable :global(td){border:0;border-bottom:1px solid #eadfe2;padding:4px 3px;vertical-align:top;font-size:.60rem;line-height:1.2;overflow-wrap:anywhere}.editable :global(th){background:var(--doc-primary,#6b1a2c);color:#fff;text-align:center;font-weight:850;text-transform:uppercase;font-size:.54rem}.editable :global(tbody tr:nth-child(even) td){background:#fbf7f8}.editable :global(.mb-scenario-head){text-align:center}.editable :global(.mb-scenario-level){font-size:1.8rem;font-weight:950;color:#10194d;margin-bottom:9px}.editable :global(.mb-scenario-theme){border:1px solid #333;padding:10px;color:#df3324;font-size:1.05rem;font-weight:850}.editable :global(.mb-swot){display:grid;grid-template-columns:1fr 1fr;gap:10px}.editable :global(.mb-swot section){border:1px solid #d8cec9;padding:10px;min-height:170px}.editable :global(.mb-practical h1){color:var(--doc-primary,#6b1a2c);border-bottom:4px solid var(--doc-secondary,#d4a24c);padding-bottom:8px}.editable :global(.mb-presentation-cover){margin:4px 0 18px;padding:24px;border-radius:18px;background:var(--doc-primary,#6b1a2c);color:#fff;min-height:170px;display:flex;flex-direction:column;justify-content:flex-end}.editable :global(.mb-presentation-cover h1){font-size:2rem;line-height:1;margin:6px 0;color:#fff}.editable :global(.mb-presentation-cover p){color:#fff;margin:0}.editable :global(.mb-presentation-kicker){color:var(--doc-secondary,#d4a24c);font-size:.72rem;font-weight:950;letter-spacing:.14em}.editable :global(.mb-certificate){text-align:center;padding:22px 12px;margin:8px 0 18px;border-top:2px solid var(--doc-secondary,#d4a24c);border-bottom:2px solid var(--doc-secondary,#d4a24c)}.editable :global(.mb-certificate h1){font-size:1.8rem;color:var(--doc-primary,#6b1a2c);margin:10px 0}.editable :global(.mb-certificate h2){font-size:1rem;color:var(--doc-primary,#6b1a2c);text-transform:none}.editable :global(th),.editable :global(td){overflow-wrap:anywhere!important;word-break:break-word!important;white-space:normal!important;min-width:0!important}.editable :global(img){max-width:100%;height:auto}.editable:focus{outline:3px solid rgba(212,162,76,.25)}
        @media(max-width:1000px){.template-grid,.compact .template-grid,.saved-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.recipientGroups{grid-template-columns:1fr}.filters{grid-template-columns:1fr}.template-grid,.compact .template-grid,.saved-grid{grid-template-columns:1fr}.paper-wrap{padding:5px}.paper{padding:18px;min-height:0}.editable :global(.mb-grid-2),.editable :global(.mb-grid-3),.editable :global(.mb-swot){grid-template-columns:1fr}.prefill select{width:100%}}
      `}</style>
    </div>
  );
}
