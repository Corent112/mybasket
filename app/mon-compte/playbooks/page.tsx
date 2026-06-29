"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exportElementToPdf } from "@/lib/playbook-export";
import {
  deletePlaybook,
  deletePlaybookSystem,
  duplicatePlaybookSystem,
  getPlaybook,
  listPlaybookSystems,
  updatePlaybook,
  updatePlaybookSystem,
  type Playbook,
  type PlaybookCategory,
  type PlaybookSystem,
} from "@/lib/playbook";

const TABS: Array<{ key: PlaybookCategory; label: string; short: string }> = [
  { key: "Système demi-terrain", label: "DEMI-TERRAIN", short: "DEMI" },
  { key: "SLOB", label: "SLOB", short: "SLOB" },
  { key: "BLOB", label: "BLOB", short: "BLOB" },
  { key: "ATO", label: "ATO", short: "ATO" },
];

type ExportMode = "coach" | "joueurs" | "staff";

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function safeText(value: string | null | undefined) {
  return value?.trim() || "Système du playbook";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function PlaybookPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");

  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [systems, setSystems] = useState<PlaybookSystem[]>([]);
  const [activeTab, setActiveTab] =
    useState<PlaybookCategory>("Système demi-terrain");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("coach");
  const [copied, setCopied] = useState(false);

  const activeSystems = useMemo(
    () => systems.filter((item) => item.category === activeTab),
    [systems, activeTab]
  );

  const counts = useMemo(
    () => ({
      total: systems.length,
      demi: systems.filter((item) => item.category === "Système demi-terrain")
        .length,
      slob: systems.filter((item) => item.category === "SLOB").length,
      blob: systems.filter((item) => item.category === "BLOB").length,
      ato: systems.filter((item) => item.category === "ATO").length,
      favoris: systems.filter((item) => item.tags?.includes("favori")).length,
    }),
    [systems]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      const pb = await getPlaybook(id);
      setPlaybook(pb);
      setNotes(pb?.description || "");

      if (pb) {
        const rows = await listPlaybookSystems(pb.id);
        setSystems(rows);
      }
    } catch (error) {
      console.error(error);
      alert("Erreur chargement playbook");
    } finally {
      setLoading(false);
    }
  }

  async function renamePlaybook() {
    if (!playbook) return;

    const title = window.prompt("Nouveau nom du playbook ?", playbook.title);
    if (!title?.trim()) return;

    const updated = await updatePlaybook(playbook.id, { title: title.trim() });
    setPlaybook(updated);
  }

  async function saveNotes() {
    if (!playbook) return;

    const updated = await updatePlaybook(playbook.id, { description: notes });
    setPlaybook(updated);
    alert("Notes enregistrées");
  }

  async function removePlaybook() {
    if (!playbook) return;

    const ok = confirm(`Supprimer le playbook « ${playbook.title} » ?`);
    if (!ok) return;

    await deletePlaybook(playbook.id);
    router.push("/mon-compte?tab=playbooks");
  }

  async function renameSystem(system: PlaybookSystem) {
    const title = window.prompt("Nouveau nom du système ?", system.title);
    if (!title?.trim()) return;

    const updated = await updatePlaybookSystem(system.id, {
      title: title.trim(),
    });

    setSystems((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  }

  async function removeSystem(system: PlaybookSystem) {
    const ok = confirm(`Retirer « ${system.title} » du playbook ?`);
    if (!ok) return;

    await deletePlaybookSystem(system.id);
    setSystems((prev) => prev.filter((item) => item.id !== system.id));
  }

  async function duplicateSystem(system: PlaybookSystem) {
    const duplicated = await duplicatePlaybookSystem(system);
    setSystems((prev) => [...prev, duplicated]);
  }

  async function toggleFavorite(system: PlaybookSystem) {
    const tags = system.tags || [];
    const nextTags = tags.includes("favori")
      ? tags.filter((tag) => tag !== "favori")
      : [...tags, "favori"];

    const updated = await updatePlaybookSystem(system.id, { tags: nextTags });

    setSystems((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  }

  function addSystem() {
    if (!playbook) return;
    router.push(`/systemes?addToPlaybook=${playbook.id}&category=${activeTab}`);
  }

  function openSystem(system: PlaybookSystem) {
    if (system.system_id) {
      router.push(`/systemes/${system.system_id}`);
      return;
    }

    alert("Ce système n’est pas encore lié à une fiche système.");
  }

  async function exportPdf(mode: ExportMode = exportMode) {
    if (!playbook) return;

    const element = document.getElementById("playbook-pdf-zone");

    if (!element) {
      alert("Zone PDF introuvable.");
      return;
    }

    await exportElementToPdf(
      element,
      `${slugify(playbook.title)}-${mode}-mybasket.pdf`
    );

    setExportOpen(false);
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function shareByMail() {
    if (!playbook) return;

    const subject = encodeURIComponent(`Playbook - ${playbook.title}`);
    const body = encodeURIComponent(
      `Bonjour,\n\nVoici le lien vers le playbook "${playbook.title}" :\n${window.location.href}\n\nSportivement,\nMyBasket`
    );

    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function shareByWhatsApp() {
    if (!playbook) return;

    const text = encodeURIComponent(
      `Voici le playbook "${playbook.title}" : ${window.location.href}`
    );

    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return <main className="pb-page">Chargement...</main>;
  }

  if (!playbook) {
    return (
      <main className="pb-page">
        <style jsx>{CSS}</style>

        <div className="pb-empty">
          <h1>Playbook introuvable</h1>

          <button
            type="button"
            onClick={() => router.push("/mon-compte?tab=playbooks")}
          >
            Retour à mes playbooks
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-page">
      <style jsx>{CSS}</style>

      <div className="pb-breadcrumb">
        <button
          type="button"
          onClick={() => router.push("/mon-compte?tab=playbooks")}
        >
          ← MES PLAYBOOKS
        </button>
        <span>›</span>
        <strong>{playbook.title}</strong>
      </div>

      <header className="pb-cover-hero">
        <div className="pb-cover-content">
          <span className="pb-eyebrow">🏀 PLAYBOOK MYBASKET</span>

          <h1>{playbook.title}</h1>

          <p>
            Playbook offensif · Saison 2026-2027 · {counts.total} système
            {counts.total > 1 ? "s" : ""}
          </p>

          <div className="pb-cover-meta">
            <span>NM2</span>
            <span>Niveau compétition</span>
            <span>{formatDate(playbook.updated_at || playbook.created_at)}</span>
          </div>
        </div>

        <div className="pb-cover-actions">
          <button type="button" onClick={renamePlaybook}>
            ✎ Renommer
          </button>

          <button type="button" onClick={() => setExportOpen(true)}>
            ⬇ Exporter
          </button>

          <button type="button" className="share" onClick={() => setShareOpen(true)}>
            ⇧ Partager
          </button>

          <button type="button" className="gold" onClick={addSystem}>
            ＋ Ajouter un système
          </button>
        </div>
      </header>

      <section className="pb-kpi-tabs">
        {TABS.map((tab) => {
          const value =
            tab.key === "Système demi-terrain"
              ? counts.demi
              : tab.key === "SLOB"
                ? counts.slob
                : tab.key === "BLOB"
                  ? counts.blob
                  : counts.ato;

          return (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "on" : ""}
              onClick={() => setActiveTab(tab.key)}
            >
              <span>{tab.short}</span>
              <strong>{value}</strong>
              <em>{tab.label}</em>
            </button>
          );
        })}
      </section>

      <div id="playbook-pdf-zone">
        <section className="pb-pdf-cover">
          <span>PLAYBOOK MYBASKET</span>
          <h1>{playbook.title}</h1>
          <p>
            Saison 2026-2027 · {counts.total} système
            {counts.total > 1 ? "s" : ""} · Généré depuis MyBasket
          </p>
        </section>

        <section className="pb-pro-summary">
          <div>
            <span>PLAYBOOK STATS</span>
            <strong>{counts.total}</strong>
            <small>Systèmes au total</small>
          </div>

          <ul>
            <li>
              <span>Demi-terrain</span>
              <b>{counts.demi}</b>
            </li>
            <li>
              <span>SLOB</span>
              <b>{counts.slob}</b>
            </li>
            <li>
              <span>BLOB</span>
              <b>{counts.blob}</b>
            </li>
            <li>
              <span>ATO</span>
              <b>{counts.ato}</b>
            </li>
            <li>
              <span>Favoris</span>
              <b>{counts.favoris}</b>
            </li>
          </ul>

          <section>
            <span>Dernière modification</span>
            <strong>{formatDate(playbook.updated_at || playbook.created_at)}</strong>
          </section>
        </section>

        <section className="pb-main-full">
          <div className="pb-section-head">
            <div>
              <span>{activeTab}</span>
              <h2>Systèmes du playbook</h2>
            </div>

            <button type="button" onClick={addSystem}>
              ＋ Ajouter
            </button>
          </div>

          {activeSystems.length === 0 ? (
            <button type="button" className="pb-add-wide" onClick={addSystem}>
              <span>＋</span>
              Ajouter un système dans cette catégorie
            </button>
          ) : (
            <div className="pb-grid">
              {activeSystems.map((system, index) => {
                const image = system.schema_images?.[0] || "";
                const favorite = system.tags?.includes("favori");

                return (
                  <article key={system.id} className="pb-card">
                    <div className="pb-card-top">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {favorite && <b>★ Favori</b>}
                    </div>

                    <button
                      type="button"
                      className="pb-cover"
                      onClick={() => openSystem(system)}
                    >
                      {image ? <img src={image} alt={system.title} /> : <span>🏀</span>}
                    </button>

                    <div className="pb-card-body">
                      <small>{system.category}</small>
                      <h3>{system.title}</h3>
                      <p>{safeText(system.description)}</p>
                    </div>

                    <div className="pb-card-actions">
                      <button type="button" onClick={() => openSystem(system)}>
                        Voir système
                      </button>

                      <button type="button" onClick={() => toggleFavorite(system)}>
                        {favorite ? "★ Favori" : "☆ Favori"}
                      </button>

                      <button type="button" onClick={() => renameSystem(system)}>
                        Modifier
                      </button>

                      <button type="button" onClick={() => duplicateSystem(system)}>
                        Dupliquer
                      </button>

                      <button type="button" onClick={() => removeSystem(system)}>
                        Retirer
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="pb-notes-row">
          <div className="pb-panel">
            <h2>Notes coach</h2>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ajoutez vos notes générales sur ce playbook..."
            />

            <button type="button" onClick={saveNotes}>
              Enregistrer les notes
            </button>
          </div>

          <div className="pb-panel">
            <h2>Actions rapides</h2>

            <button type="button" onClick={() => setExportOpen(true)}>
              ⬇ Exporter le playbook
            </button>

            <button type="button" onClick={() => setShareOpen(true)}>
              ⇧ Partager le playbook
            </button>

            <button type="button" onClick={copyShareLink}>
              🔗 {copied ? "Lien copié" : "Copier le lien"}
            </button>

            <button type="button" className="danger" onClick={removePlaybook}>
              🗑 Supprimer le playbook
            </button>
          </div>
        </section>
      </div>

      {exportOpen && (
        <div className="pb-modal-backdrop" onClick={() => setExportOpen(false)}>
          <div className="pb-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pb-modal-close"
              onClick={() => setExportOpen(false)}
            >
              ×
            </button>

            <span className="pb-label">EXPORT PDF</span>
            <h2>Exporter le playbook</h2>
            <p>Choisis le format à générer selon le destinataire.</p>

            <div className="pb-export-options">
              {[
                ["coach", "PDF Coach", "Version complète avec notes et détails."],
                ["joueurs", "PDF Joueurs", "Version plus simple à partager à l’équipe."],
                ["staff", "PDF Staff", "Version synthèse pour réunion technique."],
              ].map(([value, title, desc]) => (
                <button
                  key={value}
                  type="button"
                  className={exportMode === value ? "on" : ""}
                  onClick={() => setExportMode(value as ExportMode)}
                >
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </button>
              ))}
            </div>

            <button type="button" className="pb-generate" onClick={() => exportPdf()}>
              Générer le PDF
            </button>
          </div>
        </div>
      )}

      {shareOpen && (
        <div className="pb-modal-backdrop" onClick={() => setShareOpen(false)}>
          <div className="pb-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pb-modal-close"
              onClick={() => setShareOpen(false)}
            >
              ×
            </button>

            <span className="pb-label">EXPORT & PARTAGE</span>
            <h2>Partager le playbook</h2>
            <p>PDF, WhatsApp, mail ou lien direct.</p>

            <div className="pb-share-grid">
              <button type="button" onClick={() => setExportOpen(true)}>
                <strong>📄 Exporter PDF</strong>
                <span>Choisir Coach / Joueurs / Staff</span>
              </button>

              <button type="button" onClick={shareByMail}>
                <strong>✉️ Envoyer par mail</strong>
                <span>Prépare un mail avec le lien</span>
              </button>

              <button type="button" onClick={shareByWhatsApp}>
                <strong>💬 WhatsApp</strong>
                <span>Partage rapide du lien</span>
              </button>

              <button type="button" onClick={copyShareLink}>
                <strong>🔗 {copied ? "Lien copié" : "Copier le lien"}</strong>
                <span>À coller où tu veux</span>
              </button>
            </div>

            <div className="pb-modal-note">
              Pour envoyer un vrai PDF en pièce jointe, prochaine étape :
              upload Supabase Storage + lien signé.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const CSS = `
.pb-page {
  min-height: 100vh;
  padding: 32px 5vw 80px;
  background:
    radial-gradient(circle at top right, rgba(212,162,76,.16), transparent 30%),
    radial-gradient(circle at bottom left, rgba(107,26,44,.08), transparent 35%),
    #fafafa;
  color: #111;
  font-family: Roboto, system-ui, sans-serif;
}

.pb-page button {
  font-family: inherit;
}

.pb-breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #eadfce;
  padding-bottom: 18px;
  margin-bottom: 26px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.pb-breadcrumb button {
  border: 0;
  background: none;
  cursor: pointer;
  font-weight: 1000;
  color: #6b1a2c;
}

.pb-cover-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 30px;
  margin-bottom: 24px;
  padding: 38px;
  border-radius: 32px;
  background:
    linear-gradient(135deg, rgba(107,26,44,.98), rgba(58,8,20,.98)),
    radial-gradient(circle at top right, rgba(212,162,76,.38), transparent 40%);
  color: white;
  box-shadow: 0 34px 70px rgba(107,26,44,.22);
  overflow: hidden;
}

.pb-cover-content h1 {
  margin: 16px 0 8px;
  max-width: 900px;
  font-size: clamp(3.8rem, 8vw, 8rem);
  line-height: .78;
  font-weight: 1000;
  letter-spacing: -.075em;
  text-transform: uppercase;
}

.pb-cover-content p {
  margin: 0;
  color: rgba(255,255,255,.84);
  font-size: 18px;
  font-weight: 800;
}

.pb-eyebrow,
.pb-label {
  display: inline-flex;
  width: fit-content;
  padding: 8px 13px;
  border-radius: 999px;
  background: rgba(255,255,255,.14);
  color: #d4a24c;
  font-size: 11px;
  font-weight: 1000;
  letter-spacing: .1em;
  text-transform: uppercase;
}

.pb-cover-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}

.pb-cover-meta span {
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(255,255,255,.08);
  color: white;
  border-radius: 999px;
  padding: 9px 13px;
  font-size: 12px;
  font-weight: 1000;
}

.pb-cover-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-self: end;
}

.pb-cover-actions button {
  min-height: 48px;
  border: 1px solid rgba(255,255,255,.2);
  background: rgba(255,255,255,.1);
  color: white;
  border-radius: 999px;
  padding: 0 18px;
  font-weight: 1000;
  cursor: pointer;
  text-align: left;
}

.pb-cover-actions button:hover {
  background: rgba(255,255,255,.18);
}

.pb-cover-actions .share {
  background: white;
  color: #6b1a2c;
}

.pb-cover-actions .gold {
  background: linear-gradient(180deg, #d4a24c, #b88418);
  border-color: transparent;
  color: white;
}

.pb-kpi-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 26px;
}

.pb-kpi-tabs button {
  border: 0;
  border-radius: 24px;
  background: white;
  padding: 20px;
  cursor: pointer;
  text-align: left;
  box-shadow: 0 10px 28px rgba(0,0,0,.06);
  transition: .2s ease;
}

.pb-kpi-tabs button:hover {
  transform: translateY(-4px);
}

.pb-kpi-tabs button.on {
  background: linear-gradient(135deg, #7d1027, #4f0b18);
  color: white;
}

.pb-kpi-tabs span,
.pb-kpi-tabs em {
  display: block;
}

.pb-kpi-tabs span {
  font-size: 13px;
  font-weight: 1000;
  color: #b88418;
}

.pb-kpi-tabs strong {
  display: block;
  margin: 8px 0;
  font-size: 42px;
  line-height: .9;
}

.pb-kpi-tabs em {
  color: #756b6e;
  font-style: normal;
  font-size: 12px;
  font-weight: 900;
}

.pb-kpi-tabs button.on em {
  color: rgba(255,255,255,.72);
}

.pb-pro-summary {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 260px;
  gap: 18px;
  margin-bottom: 28px;
}

.pb-pro-summary > div,
.pb-pro-summary > ul,
.pb-pro-summary > section {
  margin: 0;
  border-radius: 26px;
  background: white;
  padding: 22px;
  box-shadow: 0 10px 28px rgba(0,0,0,.055);
}

.pb-pro-summary span {
  color: #6b1a2c;
  font-size: 12px;
  font-weight: 1000;
  text-transform: uppercase;
}

.pb-pro-summary strong {
  display: block;
  margin-top: 8px;
  font-size: 36px;
  line-height: 1;
}

.pb-pro-summary small {
  display: block;
  margin-top: 8px;
  color: #70676a;
  font-weight: 800;
}

.pb-pro-summary ul {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  list-style: none;
}

.pb-pro-summary li {
  border-left: 3px solid #d4a24c;
  padding-left: 12px;
}

.pb-pro-summary li b {
  display: block;
  margin-top: 5px;
  font-size: 24px;
}

.pb-section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.pb-section-head span {
  color: #b88418;
  font-size: 12px;
  font-weight: 1000;
  text-transform: uppercase;
}

.pb-section-head h2 {
  margin: 4px 0 0;
  font-size: 36px;
  line-height: .95;
  letter-spacing: -.04em;
  text-transform: uppercase;
}

.pb-section-head button {
  border: 0;
  border-radius: 999px;
  background: #6b1a2c;
  color: white;
  padding: 13px 18px;
  font-weight: 1000;
  cursor: pointer;
}

.pb-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(240px, 1fr));
  gap: 22px;
}

.pb-card {
  position: relative;
  overflow: hidden;
  border: 0;
  border-radius: 26px;
  background: white;
  box-shadow: 0 12px 34px rgba(0,0,0,.07);
  transition: .25s ease;
}

.pb-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 22px 44px rgba(0,0,0,.12);
}

.pb-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px 0;
}

.pb-card-top span {
  color: #6b1a2c;
  font-size: 13px;
  font-weight: 1000;
}

.pb-card-top b {
  color: #b88418;
  font-size: 12px;
}

.pb-cover {
  width: calc(100% - 28px);
  height: 230px;
  margin: 14px;
  border: 0;
  border-radius: 22px;
  background: linear-gradient(135deg, #faf6ef, #ffffff);
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 14px;
}

.pb-cover img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pb-cover span {
  font-size: 44px;
}

.pb-card-body {
  padding: 0 20px 12px;
}

.pb-card-body small {
  display: block;
  color: #b88418;
  font-weight: 1000;
  font-size: 11px;
  text-transform: uppercase;
  margin-bottom: 7px;
}

.pb-card-body h3 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 1000;
}

.pb-card-body p {
  margin: 0;
  color: #5f5659;
  font-size: 14px;
  line-height: 1.4;
}

.pb-card-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 12px 16px 18px;
  gap: 8px;
}

.pb-card-actions button {
  min-height: 36px;
  border: 1px solid #eee2d4;
  background: #fffaf2;
  color: #1f171a;
  cursor: pointer;
  font-size: 12px;
  border-radius: 999px;
  font-weight: 900;
}

.pb-card-actions button:first-child {
  grid-column: span 2;
  background: #6b1a2c;
  color: white;
  border-color: #6b1a2c;
}

.pb-add-wide {
  width: 100%;
  min-height: 110px;
  border: 1px dashed #d8c4a3;
  background: rgba(255,255,255,.8);
  border-radius: 26px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #1f171a;
  font-weight: 1000;
  font-size: 16px;
}

.pb-add-wide span {
  width: 40px;
  height: 40px;
  border: 2px solid #b88418;
  color: #b88418;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 22px;
}

.pb-notes-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 22px;
  margin-top: 28px;
}

.pb-panel {
  border: 0;
  border-radius: 26px;
  padding: 22px;
  background: white;
  box-shadow: 0 10px 28px rgba(0,0,0,.06);
}

.pb-panel h2 {
  margin: 0 0 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eee;
  font-size: 15px;
  text-transform: uppercase;
  font-weight: 1000;
}

.pb-panel textarea {
  width: 100%;
  min-height: 130px;
  border: 1px solid #eee2d4;
  border-radius: 16px;
  resize: vertical;
  font-family: inherit;
  color: #333;
  line-height: 1.5;
  padding: 14px;
  outline: none;
}

.pb-panel button {
  width: 100%;
  min-height: 42px;
  margin-top: 12px;
  border: 1px solid #e4d7c6;
  background: #fff;
  color: #1f171a;
  border-radius: 14px;
  padding: 0 14px;
  font-weight: 900;
  cursor: pointer;
  text-align: left;
}

.pb-panel button:hover {
  background: #fff8ec;
}

.pb-panel button.danger {
  color: #c5283d;
  border-color: #f2c3c3;
}

.pb-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 9, 11, .58);
  backdrop-filter: blur(8px);
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
}

.pb-modal {
  position: relative;
  width: min(640px, 100%);
  background:
    radial-gradient(circle at top right, rgba(212,162,76,.22), transparent 34%),
    #fff;
  border-radius: 30px;
  padding: 30px;
  box-shadow: 0 35px 90px rgba(0,0,0,.28);
}

.pb-modal-close {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: #f3ece3;
  cursor: pointer;
  font-size: 24px;
}

.pb-modal h2 {
  margin: 15px 0 8px;
  font-size: 36px;
  line-height: .95;
  letter-spacing: -.04em;
  text-transform: uppercase;
}

.pb-modal p {
  margin: 0 0 18px;
  color: #5e5558;
}

.pb-share-grid,
.pb-export-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.pb-share-grid button,
.pb-export-options button {
  border: 1px solid #eee2d4;
  border-radius: 18px;
  background: #fff;
  padding: 16px;
  cursor: pointer;
  text-align: left;
}

.pb-export-options button.on {
  border-color: #6b1a2c;
  background: #fff5f8;
}

.pb-share-grid strong,
.pb-share-grid span,
.pb-export-options strong,
.pb-export-options span {
  display: block;
}

.pb-share-grid span,
.pb-export-options span {
  margin-top: 6px;
  color: #6b6265;
  font-size: 12px;
}

.pb-generate {
  width: 100%;
  min-height: 48px;
  margin-top: 16px;
  border: 0;
  border-radius: 999px;
  background: #6b1a2c;
  color: white;
  font-weight: 1000;
  cursor: pointer;
}

.pb-modal-note {
  margin-top: 16px;
  padding: 13px 14px;
  border-radius: 16px;
  background: #f6efe5;
  color: #5e5558;
  font-size: 13px;
  line-height: 1.4;
}

.pb-pdf-cover {
  display: none;
}

.pb-empty {
  max-width: 560px;
  margin: 80px auto;
  border: 1px dashed #ddd;
  border-radius: 18px;
  padding: 38px;
  text-align: center;
  background: white;
}

.pb-empty button {
  border: 0;
  background: #6b1a2c;
  color: #fff;
  padding: 12px 18px;
  border-radius: 10px;
  font-weight: 900;
  cursor: pointer;
}

@media print {
  .pb-breadcrumb,
  .pb-cover-hero,
  .pb-kpi-tabs,
  .pb-card-actions,
  .pb-section-head button,
  .pb-notes-row,
  .pb-modal-backdrop {
    display: none !important;
  }

  .pb-page {
    padding: 18px;
    background: #fff;
  }

  .pb-pdf-cover {
    display: block;
    margin-bottom: 30px;
    padding: 28px;
    border-radius: 18px;
    background: #6b1a2c;
    color: white;
  }

  .pb-pdf-cover span {
    color: #d4a24c;
    font-size: 12px;
    font-weight: 1000;
    letter-spacing: .12em;
  }

  .pb-pdf-cover h1 {
    margin: 10px 0;
    font-size: 48px;
    line-height: .9;
    text-transform: uppercase;
  }

  .pb-pdf-cover p {
    margin: 0;
    color: rgba(255,255,255,.82);
  }

  .pb-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .pb-card {
    break-inside: avoid;
    box-shadow: none;
    border: 1px solid #eee2d4;
  }
}

@media (max-width: 1050px) {
  .pb-cover-hero,
  .pb-pro-summary,
  .pb-notes-row {
    grid-template-columns: 1fr;
  }

  .pb-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pb-pro-summary ul {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 720px) {
  .pb-page {
    padding: 22px 16px 70px;
  }

  .pb-cover-hero {
    padding: 24px;
    border-radius: 24px;
  }

  .pb-cover-content h1 {
    font-size: 3.8rem;
  }

  .pb-kpi-tabs,
  .pb-grid,
  .pb-share-grid,
  .pb-export-options {
    grid-template-columns: 1fr;
  }

  .pb-pro-summary ul {
    grid-template-columns: repeat(2, 1fr);
  }
}
`;