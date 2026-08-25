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
};
type Person = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; role_label: string | null };
type Player = { id: string; first_name: string; last_name: string; birthdate: string | null; club_name: string | null; category: string | null; email: string | null; height_cm: number | null; years_basket: number | null };
type SavedDocument = { id: string; title: string; document_type: string; content: any; created_at: string; updated_at?: string | null };

type Props = {
  structureId: string;
  compact?: boolean;
  savedOnly?: boolean;
  categories?: InstitutionalResourceCategory[];
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

function buildPrefilledHtml(template: InstitutionalResourceTemplate, structure: Structure, person?: Person | null, player?: Player | null) {
  let html = template.bodyHtml;
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
  };
  Object.entries(tokens).forEach(([token, value]) => { html = replaceToken(html, token, value); });
  return html.replace(/\{\{[^}]+\}\}/g, "");
}

function documentCss() {
  return `
    :root{font-family:Arial,Helvetica,sans-serif;color:#231f20;background:#f3f0ed}
    *{box-sizing:border-box} body{margin:0;padding:24px}.sheet{max-width:1050px;margin:0 auto;background:white;min-height:1120px;padding:42px;border:1px solid #ddd}
    .doc-brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #6b1a2c;padding-bottom:16px;margin-bottom:22px}.doc-brand strong{font-size:20px;color:#6b1a2c}.doc-brand span{color:#7a6b64;font-size:12px}.doc-title{font-size:28px;margin:0 0 4px;color:#241115}.doc-subtitle{margin:0 0 24px;color:#776b65;font-size:13px}
    h1,h2,h3,p{overflow-wrap:anywhere} h2{font-size:16px;color:#6b1a2c;margin:0 0 10px}.mb-section{margin:18px 0}.mb-area{border:1px solid #d8cec9;min-height:72px;padding:12px;line-height:1.5}.mb-grid{display:grid;gap:10px}.mb-grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.mb-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.mb-field{border:1px solid #ddd4cf;padding:10px;min-height:58px}.mb-field b{display:block;color:#5b4e48;font-size:11px;text-transform:uppercase;margin-bottom:7px}.mb-field span{display:block;min-height:18px}
    table{width:100%;border-collapse:collapse;margin:14px 0 22px;table-layout:fixed}th,td{border:1px solid #333;padding:8px;vertical-align:top;min-height:38px;font-size:12px;overflow-wrap:anywhere}th{background:#eeeae7;text-align:center;font-weight:800}.mb-scenario-head{text-align:center;margin-bottom:0}.mb-scenario-level{font-size:30px;font-weight:900;color:#10194d;margin-bottom:12px}.mb-scenario-theme{border:1px solid #333;padding:11px;color:#df3324;font-size:18px;font-weight:800}.mb-swot{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mb-swot section{border:1px solid #d8cec9;padding:12px;min-height:180px}.mb-practical h1{color:#6b1a2c;border-bottom:4px solid #d4a24c;padding-bottom:10px}
    [contenteditable=true]:focus{outline:3px solid rgba(212,162,76,.35);outline-offset:2px}
    @media(max-width:760px){body{padding:0}.sheet{padding:20px;border:0;min-height:0}.mb-grid-2,.mb-grid-3,.mb-swot{grid-template-columns:1fr}table{display:block;overflow:auto;white-space:normal}}
    @media print{body{background:#fff;padding:0}.sheet{border:0;max-width:none;min-height:0;padding:16mm}.no-print{display:none!important}}
  `;
}

function printableHtml(title: string, structure: Structure, body: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${documentCss()}</style></head><body><article class="sheet"><header class="doc-brand"><div><strong>MYBASKET · ${escapeHtml(structure.name)}</strong><br><span>${escapeHtml(structure.season_label || "")}</span></div><span>${escapeHtml(structure.email || "")}</span></header><h1 class="doc-title">${escapeHtml(title)}</h1><p class="doc-subtitle">Document institutionnel · contenu entièrement modifiable</p>${body}</article></body></html>`;
}

export default function InstitutionalResources({ structureId, compact = false, savedOnly = false, categories }: Props) {
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

  async function load() {
    const [a, b, c, d] = await Promise.all([
      supabase.from("institutional_structures").select("id,structure_type,name,short_name,season_label,city,email").eq("id", structureId).single(),
      supabase.from("institutional_people").select("id,first_name,last_name,email,phone,role_label").eq("structure_id", structureId).eq("archived", false).order("last_name"),
      supabase.from("institutional_players").select("id,first_name,last_name,birthdate,club_name,category,email,height_cm,years_basket").eq("structure_id", structureId).eq("archived", false).order("last_name"),
      supabase.from("institutional_documents").select("id,title,document_type,content,created_at,updated_at").eq("structure_id", structureId).eq("archived", false).eq("document_type", "resource_instance").order("updated_at", { ascending: false }),
    ]);
    if (a.data) setStructure(a.data as Structure);
    setPeople((b.data || []) as Person[]);
    setPlayers((c.data || []) as Player[]);
    setSaved((d.data || []) as SavedDocument[]);
  }

  useEffect(() => { void load(); }, [structureId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setHtml(buildPrefilledHtml(template, structure));
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
    });
    setDocId(row.id);
    setDocTitle(row.title);
    setPersonId(row.content?.person_id || "");
    setPlayerId(row.content?.player_id || "");
    setHtml(row.content?.html || "");
    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function applyPrefill() {
    if (!activeTemplate || !structure) return;
    if (html.trim() && !confirm("Réappliquer le modèle prérempli ? Les modifications non enregistrées seront remplacées.")) return;
    const person = people.find((x) => x.id === personId) || null;
    const player = players.find((x) => x.id === playerId) || null;
    setHtml(buildPrefilledHtml(activeTemplate, structure, person, player));
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
        html: cleanHtml,
        person_id: personId || null,
        player_id: playerId || null,
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
    win.document.write(printableHtml(docTitle || activeTemplate.title, structure, sanitizeEditableHtml(html)));
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
                {visibleTemplates.slice(0, compact ? 6 : undefined).map((template) => <article className="template-card" key={template.key}><div className="icon">{template.icon}</div><div className="meta"><small>{template.category}</small><h3>{template.title}</h3><p>{template.description}</p><div className="audiences">{template.audiences.map((x) => <span key={x}>{x}</span>)}</div></div><button type="button" onClick={() => openTemplate(template)}>Ouvrir et remplir</button></article>)}
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
          <p className="edit-hint">Clique directement dans le document : <b>titres, phrases, tableaux et contenus sont tous modifiables</b>. Le modèle MyBasket d’origine reste toujours disponible dans Ressources.</p>
          <div className="paper-wrap"><article className="paper"><header className="doc-brand"><div><strong>MYBASKET · {structure.name}</strong><br/><span>{structure.season_label || ""}</span></div><span>{structure.email || ""}</span></header><h1 className="doc-title">{docTitle || activeTemplate.title}</h1><p className="doc-subtitle">Document institutionnel · contenu entièrement modifiable</p><div className="editable" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: html }} onInput={(e) => setHtml((e.currentTarget as HTMLDivElement).innerHTML)} /></article></div>
        </section>
      )}

      <style jsx>{`
        .ir{display:grid;gap:14px}.resources-loading{padding:18px;color:#756860}.intro,.saved-head,.editor-bar,.prefill{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.intro>div,.saved-head>div{display:grid}.intro span,.saved-head span{font-size:.78rem;color:#786a63}.intro button,.saved-head button,.editor-actions button,.prefill button,.template-card>button,.saved article button{border:0;border-radius:9px;padding:9px 11px;background:#6b1a2c;color:#fff;font-weight:850;cursor:pointer}.filters{display:grid;grid-template-columns:minmax(220px,1fr) 180px 160px;gap:8px}.filters input,.filters select,.prefill select,.editor-title input{border:1px solid #ddd1ca;border-radius:9px;padding:9px 11px;background:#fff;min-width:0}.template-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.template-card{border:1px solid #e7dcd6;border-radius:13px;padding:12px;background:#fff;display:grid;grid-template-columns:38px 1fr;gap:8px;align-items:start}.template-card .icon{font-size:25px}.template-card .meta{min-width:0}.template-card small,.saved article small,.editor-title small{color:#b67c1f;font-weight:900;text-transform:uppercase;letter-spacing:.05em;font-size:.66rem}.template-card h3,.saved article h3{margin:4px 0 5px;color:#321018;font-size:.96rem}.template-card p{margin:0 0 8px;color:#776b65;font-size:.76rem;line-height:1.35}.audiences{display:flex;gap:4px;flex-wrap:wrap}.audiences span{background:#f7f1ed;border-radius:999px;padding:3px 6px;font-size:.62rem;color:#6d5e57}.template-card>button{grid-column:1/-1;width:100%}.compact .template-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.compact .template-card p,.compact .audiences{display:none}.saved{display:grid;gap:10px}.saved-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.saved article{border:1px solid #e7dcd6;border-radius:11px;padding:10px;background:white}.saved article>span{display:block;color:#85766f;font-size:.7rem;margin-bottom:8px}.saved article>div{display:flex;gap:6px;flex-wrap:wrap}.saved article .danger{background:#fff;color:#a22929;border:1px solid #e6bcbc}.empty{color:#786a63}.editor{border-top:1px solid #e4d9d4;padding-top:14px;display:grid;gap:10px}.editor-title{display:grid;gap:3px;flex:1;min-width:240px}.editor-title input{font-size:1.05rem;font-weight:900}.editor-actions{display:flex;gap:6px;flex-wrap:wrap}.editor-actions .secondary{background:#fff;color:#6b1a2c;border:1px solid #cbaeb5}.editor-actions .ghost{background:#f0ece9;color:#4e403b}.editor-actions button:disabled{opacity:.55;cursor:default}.prefill{justify-content:flex-start;background:#faf6ef;border:1px solid #ead8b5;border-radius:10px;padding:9px}.prefill b{font-size:.78rem;color:#5d4b37}.edit-hint{margin:0;color:#74655e;font-size:.78rem}.paper-wrap{overflow:auto;background:#ece9e6;padding:16px;border-radius:12px}.paper{max-width:1000px;min-height:1080px;margin:0 auto;background:#fff;padding:38px;border:1px solid #d7d0cb;color:#231f20}.doc-brand{display:flex;justify-content:space-between;gap:16px;border-bottom:4px solid #6b1a2c;padding-bottom:14px;margin-bottom:20px}.doc-brand strong{font-size:18px;color:#6b1a2c}.doc-brand span{font-size:.72rem;color:#766861}.doc-title{font-size:1.65rem;margin:0 0 3px}.doc-subtitle{margin:0 0 22px;color:#7a6c65;font-size:.75rem}.editable{outline:none;line-height:1.45}.editable :global(h2){font-size:1rem;color:#6b1a2c;margin:0 0 9px}.editable :global(.mb-section){margin:17px 0}.editable :global(.mb-area){border:1px solid #d8cec9;min-height:72px;padding:12px}.editable :global(.mb-grid){display:grid;gap:9px}.editable :global(.mb-grid-2){grid-template-columns:repeat(2,minmax(0,1fr))}.editable :global(.mb-grid-3){grid-template-columns:repeat(3,minmax(0,1fr))}.editable :global(.mb-field){border:1px solid #ddd4cf;padding:9px;min-height:56px}.editable :global(.mb-field b){display:block;color:#5b4e48;font-size:.68rem;text-transform:uppercase;margin-bottom:6px}.editable :global(table){width:100%;border-collapse:collapse;margin:12px 0 20px;table-layout:fixed}.editable :global(th),.editable :global(td){border:1px solid #333;padding:7px;vertical-align:top;min-height:36px;font-size:.74rem;overflow-wrap:anywhere}.editable :global(th){background:#eeeae7;text-align:center;font-weight:850}.editable :global(.mb-scenario-head){text-align:center}.editable :global(.mb-scenario-level){font-size:1.8rem;font-weight:950;color:#10194d;margin-bottom:9px}.editable :global(.mb-scenario-theme){border:1px solid #333;padding:10px;color:#df3324;font-size:1.05rem;font-weight:850}.editable :global(.mb-swot){display:grid;grid-template-columns:1fr 1fr;gap:10px}.editable :global(.mb-swot section){border:1px solid #d8cec9;padding:10px;min-height:170px}.editable :global(.mb-practical h1){color:#6b1a2c;border-bottom:4px solid #d4a24c;padding-bottom:8px}.editable:focus{outline:3px solid rgba(212,162,76,.25)}
        @media(max-width:1000px){.template-grid,.compact .template-grid,.saved-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.filters{grid-template-columns:1fr}.template-grid,.compact .template-grid,.saved-grid{grid-template-columns:1fr}.paper-wrap{padding:5px}.paper{padding:18px;min-height:0}.editable :global(.mb-grid-2),.editable :global(.mb-grid-3),.editable :global(.mb-swot){grid-template-columns:1fr}.prefill select{width:100%}}
      `}</style>
    </div>
  );
}
