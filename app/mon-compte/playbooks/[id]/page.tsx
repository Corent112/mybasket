"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { exportPlaybookPdf } from "@/lib/playbook-export";
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

const TABS: Array<{ key: PlaybookCategory; label: string }> = [
  { key: "Système demi-terrain", label: "DEMI-TERRAIN" },
  { key: "SLOB", label: "SLOB" },
  { key: "BLOB", label: "BLOB" },
  { key: "ATO", label: "ATO" },
];

function formatDate(value: string | null) {
  if (!value) return "aujourd’hui";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PlaybookDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id || "");

  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [systems, setSystems] = useState<PlaybookSystem[]>([]);
  const [activeTab, setActiveTab] =
    useState<PlaybookCategory>("Système demi-terrain");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
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

    const updated = await updatePlaybook(playbook.id, {
      title: title.trim(),
    });

    setPlaybook(updated);
  }

  async function saveNotes() {
    if (!playbook) return;

    const updated = await updatePlaybook(playbook.id, {
      description: notes,
    });

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

    const updated = await updatePlaybookSystem(system.id, {
      tags: nextTags,
    });

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

  async function exportPdf() {
    if (!playbook) return;

    await exportPlaybookPdf(playbook, systems, counts);
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
          MES PLAYBOOKS
        </button>

        <span>›</span>
        <strong>{playbook.title}</strong>
      </div>

      <header className="pb-header">
        <div>
          <h1>
            {playbook.title}

            <button type="button" onClick={renamePlaybook}>
              ✎
            </button>
          </h1>

          <p>
            {playbook.category || "Catégorie"} · {playbook.level || "Niveau"} ·{" "}
            {playbook.season || "Saison"} · {counts.total} système
            {counts.total > 1 ? "s" : ""} · Dernière mise à jour :{" "}
            {formatDate(playbook.updated_at || playbook.created_at)}
          </p>
        </div>

        <div className="pb-actions">
          <button type="button" onClick={exportPdf}>
            📄 Exporter PDF
          </button>

          <button type="button" onClick={() => window.print()}>
            🖨️ Imprimer
          </button>

          <button type="button" onClick={() => setShareOpen(true)}>
            ⇧ Partager
          </button>

          <button type="button" className="gold" onClick={addSystem}>
            ＋ Ajouter un système
          </button>
        </div>
      </header>

      <div className="pb-layout">
        <section className="pb-main">
          <nav className="pb-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? "on" : ""}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeSystems.length === 0 ? (
            <button type="button" className="pb-add-wide" onClick={addSystem}>
              <span>＋</span>
              Ajouter un système
            </button>
          ) : (
            <>
              <div className="pb-grid">
                {activeSystems.map((system) => {
                  const image = system.schema_images?.[0] || "";
                  const favorite = system.tags?.includes("favori");

                  return (
                    <article key={system.id} className="pb-card">
                      {favorite && <div className="pb-ribbon">★</div>}

                      <button
                        type="button"
                        className="pb-cover"
                        onClick={() => openSystem(system)}
                      >
                        {image ? (
                          <img src={image} alt={system.title} />
                        ) : (
                          <span>🏀</span>
                        )}
                      </button>

                      <div className="pb-card-content">
                        <div className="pb-card-title-row">
                          <div>
                            <h3>{system.title}</h3>
                            <p>{system.description || "Système du playbook"}</p>
                          </div>

                          <button
                            type="button"
                            className="dots"
                            onClick={() => renameSystem(system)}
                            aria-label="Modifier le titre"
                          >
                            …
                          </button>
                        </div>

                        <div className="pb-card-actions">
                          <button
                            type="button"
                            onClick={() => toggleFavorite(system)}
                            title="Favori"
                          >
                            {favorite ? "★" : "☆"}
                          </button>

                          <button
                            type="button"
                            onClick={() => renameSystem(system)}
                            title="Modifier"
                          >
                            ✎
                          </button>

                          <button
                            type="button"
                            onClick={() => duplicateSystem(system)}
                            title="Dupliquer"
                          >
                            ⧉
                          </button>

                          <button
                            type="button"
                            onClick={() => removeSystem(system)}
                            title="Supprimer"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <button type="button" className="pb-add-wide" onClick={addSystem}>
                <span>＋</span>
                Ajouter un système
              </button>
            </>
          )}
        </section>

        <aside className="pb-side">
          <section className="pb-panel">
            <h2>Résumé du playbook</h2>

            <div className="pb-kpi">
              <span>Total systèmes</span>
              <strong>{counts.total}</strong>
            </div>

            <div className="pb-row">
              <span>Demi-terrain</span>
              <strong>{counts.demi}</strong>
            </div>

            <div className="pb-row">
              <span>SLOB</span>
              <strong>{counts.slob}</strong>
            </div>

            <div className="pb-row">
              <span>BLOB</span>
              <strong>{counts.blob}</strong>
            </div>

            <div className="pb-row">
              <span>ATO</span>
              <strong>{counts.ato}</strong>
            </div>

            <div className="pb-fav">
              <span>★</span>
              <strong>Favoris</strong>
              <b>{counts.favoris}</b>
            </div>
          </section>

          <section className="pb-panel">
            <h2>Notes du playbook</h2>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ajoutez vos notes générales sur ce playbook..."
            />

            <button type="button" onClick={saveNotes}>
              Modifier
            </button>
          </section>

          <section className="pb-panel">
            <h2>Actions rapides</h2>

            <button type="button" onClick={exportPdf}>
              📄 Exporter PDF
            </button>

            <button type="button" onClick={() => window.print()}>
              🖨️ Imprimer
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
          </section>
        </aside>
      </div>

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

            <span className="pb-label">PARTAGE</span>

            <h2>Partager le playbook</h2>

            <p>
              Exporte ton playbook en PDF ou partage le lien par mail, WhatsApp
              ou copier-coller.
            </p>

            <div className="pb-share-grid">
              <button type="button" onClick={exportPdf}>
                <strong>📄 Exporter PDF</strong>
                <span>Télécharger le playbook</span>
              </button>

              <button type="button" onClick={shareByMail}>
                <strong>✉️ Envoyer par mail</strong>
                <span>Prépare un mail avec le lien</span>
              </button>

              <button type="button" onClick={shareByWhatsApp}>
                <strong>💬 WhatsApp</strong>
                <span>Partager rapidement</span>
              </button>

              <button type="button" onClick={copyShareLink}>
                <strong>🔗 {copied ? "Lien copié" : "Copier le lien"}</strong>
                <span>À coller où tu veux</span>
              </button>
            </div>

            <div className="pb-modal-note">
              Prochaine amélioration : envoyer le PDF en pièce jointe via
              Supabase Storage + lien signé.
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
  padding: 28px 4.8vw 70px;
  background: #fff;
  color: #111;
  font-family: Roboto, system-ui, sans-serif;
}

.pb-page button {
  font-family: inherit;
  cursor: pointer;
}

.pb-breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #eee;
  padding-bottom: 18px;
  margin-bottom: 26px;
  font-size: 14px;
  text-transform: uppercase;
}

.pb-breadcrumb button {
  border: 0;
  background: none;
  font-weight: 800;
}

.pb-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 34px;
}

.pb-header h1 {
  margin: 0;
  font-size: clamp(2.8rem, 5vw, 4.4rem);
  line-height: .95;
  font-weight: 1000;
  letter-spacing: -0.055em;
  text-transform: uppercase;
}

.pb-header h1 button {
  margin-left: 14px;
  border: 0;
  background: transparent;
  font-size: 26px;
}

.pb-header p {
  margin: 12px 0 0;
  color: #555;
  font-size: 16px;
}

.pb-actions {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pb-actions button {
  height: 50px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 8px;
  padding: 0 22px;
  font-weight: 900;
}

.pb-actions .gold {
  background: linear-gradient(180deg, #c9952e, #ad7715);
  border-color: #ad7715;
  color: white;
}

.pb-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 34px;
}

.pb-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid #ddd;
  margin-bottom: 20px;
}

.pb-tabs button {
  height: 58px;
  border: 0;
  background: #fff;
  font-weight: 1000;
}

.pb-tabs button.on {
  background: linear-gradient(180deg, #7d1027, #4f0b18);
  color: white;
  border-radius: 6px 6px 0 0;
}

.pb-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 22px;
  align-items: start;
}

.pb-card {
  position: relative;
  border: 1px solid #e7e7e7;
  border-radius: 10px;
  overflow: hidden;
  background: white;
  box-shadow: 0 10px 24px rgba(0, 0, 0, .07);
  display: flex;
  flex-direction: column;
}

.pb-ribbon {
  position: absolute;
  top: 0;
  left: 0;
  width: 42px;
  height: 56px;
  background: #7d1027;
  color: #d4a24c;
  display: grid;
  place-items: center;
  font-size: 22px;
  z-index: 2;
}

.pb-ribbon::after {
  content: "";
  position: absolute;
  bottom: -14px;
  left: 0;
  border-left: 21px solid #7d1027;
  border-right: 21px solid #7d1027;
  border-bottom: 14px solid transparent;
}

.pb-cover {
  width: 100%;
  height: 380px;
  border: 0;
  background: #f6f2ea;
  display: grid;
  place-items: center;
  padding: 8px;
  flex: 0 0 auto;
}

.pb-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.pb-cover span {
  font-size: 44px;
}

.pb-card-content {
  padding: 16px 18px 18px;
  background: #fff;
  border-top: 1px solid #eee;
}

.pb-card-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.pb-card-title-row h3 {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 1000;
  color: #111;
  line-height: 1.15;
}

.pb-card-title-row p {
  margin: 0;
  color: #666;
  font-size: 14px;
  line-height: 1.35;
}

.dots {
  border: 0;
  background: #f5f5f5;
  font-size: 22px;
  border-radius: 999px;
  width: 34px;
  height: 34px;
  line-height: 1;
  flex: 0 0 auto;
}

.pb-card-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding-top: 14px;
  margin-top: 14px;
  border-top: 1px solid #eee;
  gap: 8px;
}

.pb-card-actions button {
  border: 1px solid #eee;
  background: #fafafa;
  font-size: 20px;
  min-height: 38px;
  border-radius: 8px;
}

.pb-card-actions button:hover {
  background: #f2f2f2;
}

.pb-card-actions button:first-child {
  color: #b88418;
}

.pb-add-wide {
  border: 1px dashed #ddd;
  background: #fff;
  border-radius: 8px;
  width: 100%;
  margin-top: 26px;
  min-height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  font-weight: 900;
  font-size: 16px;
}

.pb-add-wide span {
  width: 36px;
  height: 36px;
  border: 2px solid #b88418;
  color: #b88418;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 22px;
}

.pb-side {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pb-panel {
  border: 1px solid #e7e7e7;
  border-radius: 8px;
  padding: 22px;
  background: #fff;
}

.pb-panel h2 {
  margin: 0 0 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eee;
  font-size: 16px;
  text-transform: uppercase;
  font-weight: 1000;
}

.pb-kpi {
  margin-bottom: 16px;
}

.pb-kpi span {
  display: block;
  color: #555;
  margin-bottom: 6px;
}

.pb-kpi strong {
  font-size: 34px;
}

.pb-row,
.pb-fav {
  display: flex;
  justify-content: space-between;
  padding: 11px 0;
  border-top: 1px solid #eee;
}

.pb-fav span {
  color: #b88418;
  font-size: 24px;
}

.pb-panel textarea {
  width: 100%;
  min-height: 110px;
  border: 0;
  resize: vertical;
  font-family: inherit;
}

.pb-panel button {
  min-height: 40px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 6px;
  padding: 0 14px;
  font-weight: 800;
  margin-top: 12px;
  width: 100%;
  text-align: left;
}

.pb-panel button.danger {
  color: #c5283d;
  border-color: #f2c3c3;
}

.pb-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 9, 11, .55);
  backdrop-filter: blur(8px);
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
}

.pb-modal {
  position: relative;
  width: min(620px, 100%);
  background: #fff;
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 30px 80px rgba(0,0,0,.28);
}

.pb-modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: #f3ece3;
  font-size: 24px;
  cursor: pointer;
}

.pb-label {
  display: inline-flex;
  padding: 7px 12px;
  border-radius: 999px;
  background: #f4e7cf;
  color: #6b1a2c;
  font-size: 11px;
  font-weight: 1000;
  letter-spacing: .08em;
}

.pb-modal h2 {
  margin: 14px 0 8px;
  font-size: 32px;
  text-transform: uppercase;
  letter-spacing: -.04em;
}

.pb-modal p {
  margin: 0 0 18px;
  color: #555;
}

.pb-share-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.pb-share-grid button {
  border: 1px solid #eee2d4;
  border-radius: 16px;
  background: #fff;
  padding: 16px;
  cursor: pointer;
  text-align: left;
}

.pb-share-grid button:hover {
  background: #fff8ec;
}

.pb-share-grid strong,
.pb-share-grid span {
  display: block;
}

.pb-share-grid strong {
  font-size: 15px;
}

.pb-share-grid span {
  margin-top: 6px;
  color: #666;
  font-size: 12px;
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

.pb-empty {
  max-width: 560px;
  margin: 80px auto;
  border: 1px dashed #ddd;
  border-radius: 18px;
  padding: 38px;
  text-align: center;
}

.pb-empty button {
  border: 0;
  background: #6b1a2c;
  color: #fff;
  padding: 12px 18px;
  border-radius: 10px;
  font-weight: 900;
}

@media (max-width: 1100px) {
  .pb-layout {
    grid-template-columns: 1fr;
  }

  .pb-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 24px;
  }

  .pb-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .pb-page {
    padding: 22px 18px 70px;
  }

  .pb-header {
    flex-direction: column;
  }

  .pb-grid,
  .pb-side,
  .pb-share-grid {
    grid-template-columns: 1fr;
  }

  .pb-tabs {
    grid-template-columns: 1fr 1fr;
  }
}
`;