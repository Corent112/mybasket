"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PlaybookPdfExport from "@/components/playbook/PlaybookPdfExport";
import { getTeams } from "@/lib/equipes-store";
import type { Team } from "@/types/player";
import PlaybookProfitability from "@/components/playbook/PlaybookProfitability";
import PlaybookSeriesManager from "@/components/playbook/PlaybookSeriesManager";
import PlaybookVideoExport from "@/components/playbook/PlaybookVideoExport";
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
  const [teams, setTeams] = useState<Team[]>([]);
  const [savingTeam, setSavingTeam] = useState(false);
  const [systems, setSystems] = useState<PlaybookSystem[]>([]);
  const [activeTab, setActiveTab] =
    useState<PlaybookCategory>("Système demi-terrain");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // §24 · vue courante : composition des systèmes ou rentabilité.
  const [view, setView] = useState<"systemes" | "rentabilite">("systemes");
  const [tagFilter, setTagFilter] = useState<string>("all");

  const availableTags = useMemo(
    () =>
      Array.from(
        new Set(
          systems
            .flatMap((item) => item.tags || [])
            .filter((tag) => tag && tag !== "favori")
        )
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [systems]
  );

  const activeSystems = useMemo(
    () =>
      systems.filter(
        (item) =>
          item.category === activeTab &&
          (tagFilter === "all" || item.tags?.includes(tagFilter))
      ),
    [systems, activeTab, tagFilter]
  );

  const counts = useMemo(
    () => ({
      total: systems.length,
      demi: systems.filter((item) => item.category === "Système demi-terrain")
        .length,
      slob: systems.filter((item) => item.category === "SLOB").length,
      blob: systems.filter((item) => item.category === "BLOB").length,
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
      const [pb, availableTeams] = await Promise.all([getPlaybook(id), getTeams()]);
      setPlaybook(pb);
      setTeams(
        availableTeams.filter(
          (team) =>
            !(team as any).scouted &&
            !(team as any).scout &&
            !(team as any).isScoutTeam &&
            String((team as any).teamType || "").toLowerCase() !== "scout"
        )
      );
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

  async function changeTeam(teamId: string) {
    if (!playbook || !teamId || teamId === playbook.team_id) return;
    try {
      setSavingTeam(true);
      const updated = await updatePlaybook(playbook.id, { team_id: teamId });
      setPlaybook(updated);
    } catch (error) {
      console.error("Erreur rattachement équipe du playbook:", error);
      alert("Impossible de rattacher le playbook à cette équipe.");
    } finally {
      setSavingTeam(false);
    }
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
    setAddSourceOpen(true);
  }

  function chooseSystemSource(source: "public" | "private") {
    if (!playbook) return;
    setAddSourceOpen(false);
    const base = source === "public" ? "/systemes" : "/mon-compte/systemes";
    router.push(`${base}?addToPlaybook=${playbook.id}&category=${encodeURIComponent(activeTab)}`);
  }

  function openSystem(system: PlaybookSystem) {
    if (system.system_id) {
      router.push(`/systemes/${system.system_id}`);
      return;
    }

    alert("Ce système n’est pas encore lié à une fiche système.");
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

          <div className="pb-team-link">
            <span>Équipe</span>
            <select
              value={playbook.team_id || ""}
              onChange={(event) => void changeTeam(event.target.value)}
              disabled={savingTeam}
              aria-label="Équipe rattachée au playbook"
            >
              <option value="" disabled>Choisir une équipe…</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="pb-actions">
          <PlaybookPdfExport playbook={playbook} systems={systems} counts={counts} />

          <PlaybookVideoExport playbook={playbook} systems={systems} />

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

      <PlaybookSeriesManager playbook={playbook} systems={systems} onChanged={load} />

      <div className="pb-layout">
        <section className="pb-main">
          <div className="pb-viewswitch">
            <button type="button" className={view === "systemes" ? "on" : ""} onClick={() => setView("systemes")}>Systèmes</button>
            <button type="button" className={view === "rentabilite" ? "on" : ""} onClick={() => setView("rentabilite")}>📊 Rentabilité</button>
          </div>

          {view === "rentabilite" ? (
            <PlaybookProfitability playbookId={id} systems={systems} />
          ) : (
          <>
          <div className="pb-workspace-head">
            <nav className="pb-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={activeTab === tab.key ? "on" : ""}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span>{tab.label}</span>
                  <b>
                    {systems.filter((item) => item.category === tab.key).length}
                  </b>
                </button>
              ))}
            </nav>

            <div className="pb-filterbar">
              <div className="pb-filter-copy">
                <strong>ORGANISATION DU PLAYBOOK</strong>
                <span>
                  Retrouve rapidement tes systèmes par catégorie et par tag.
                </span>
              </div>

              <div className="pb-tag-filters">
                <button
                  type="button"
                  className={tagFilter === "all" ? "on" : ""}
                  onClick={() => setTagFilter("all")}
                >
                  Tous
                </button>

                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={tagFilter === tag ? "on" : ""}
                    onClick={() => setTagFilter(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {activeSystems.length === 0 ? (
            <div className="pb-empty-state">
              <div className="pb-empty-icon">⌁</div>
              <h3>Aucun système dans cette vue</h3>
              <p>
                {tagFilter === "all"
                  ? "Ajoute un système pour commencer à construire cette partie du playbook."
                  : `Aucun système ne porte encore le tag « ${tagFilter} » dans cette catégorie.`}
              </p>
              {tagFilter !== "all" ? (
                <button type="button" onClick={() => setTagFilter("all")}>
                  Voir tous les systèmes
                </button>
              ) : (
                <button type="button" onClick={addSystem}>
                  ＋ Ajouter un système
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="pb-section-band">
                <div>
                  <span className="pb-section-kicker">SÉRIE ACTIVE</span>
                  <h2>{TABS.find((tab) => tab.key === activeTab)?.label}</h2>
                </div>
                <div className="pb-section-count">
                  <strong>{activeSystems.length}</strong>
                  <span>système{activeSystems.length > 1 ? "s" : ""}</span>
                </div>
              </div>

              <div className="pb-grid">
                {activeSystems.map((system, index) => {
                  const image = system.schema_images?.[0] || "";
                  const favorite = system.tags?.includes("favori");
                  const visibleTags = (system.tags || []).filter(
                    (tag) => tag !== "favori"
                  );

                  return (
                    <article key={system.id} className="pb-card">
                      <div className="pb-card-topline">
                        <span className="pb-card-index">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <button
                          type="button"
                          className={`pb-favorite ${favorite ? "on" : ""}`}
                          onClick={() => toggleFavorite(system)}
                          title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                        >
                          {favorite ? "★" : "☆"}
                        </button>
                      </div>

                      <button
                        type="button"
                        className="pb-cover"
                        onClick={() => openSystem(system)}
                      >
                        {image ? (
                          <img src={image} alt={system.title} />
                        ) : (
                          <span className="pb-cover-placeholder">🏀</span>
                        )}

                        <span className="pb-open-hint">Ouvrir le système →</span>
                      </button>

                      <div className="pb-card-content">
                        <div className="pb-card-title-row">
                          <div>
                            <span className="pb-card-type">{activeTab}</span>
                            <h3>{system.title}</h3>
                            <p>{system.description || "Système du playbook"}</p>
                          </div>
                        </div>

                        {visibleTags.length > 0 && (
                          <div className="pb-card-tags">
                            {visibleTags.map((tag) => (
                              <button
                                type="button"
                                key={tag}
                                onClick={() => setTagFilter(tag)}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="pb-card-actions">
                          <button
                            type="button"
                            onClick={() => renameSystem(system)}
                            title="Modifier le nom"
                          >
                            <span>✎</span> Modifier
                          </button>

                          <button
                            type="button"
                            onClick={() => duplicateSystem(system)}
                            title="Dupliquer"
                          >
                            <span>⧉</span> Dupliquer
                          </button>

                          <button
                            type="button"
                            className="danger"
                            onClick={() => removeSystem(system)}
                            title="Retirer du playbook"
                          >
                            <span>×</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <button type="button" className="pb-add-wide" onClick={addSystem}>
                <span>＋</span>
                <div>
                  <strong>Ajouter un système</strong>
                  <small>Bibliothèque publique ou Mes systèmes</small>
                </div>
              </button>
            </>
          )}
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

            <button type="button" onClick={() => {}}>
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

      {addSourceOpen && (
        <div className="pb-modal-backdrop" onClick={() => setAddSourceOpen(false)}>
          <div className="pb-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="pb-modal-close" onClick={() => setAddSourceOpen(false)}>×</button>
            <h2>Ajouter un système</h2>
            <p>Choisis la bibliothèque dans laquelle tu veux chercher.</p>
            <div className="pb-share-grid">
              <button type="button" onClick={() => chooseSystemSource("public")}>
                <strong>Bibliothèque publique</strong>
                <span>Systèmes MyBasket disponibles pour tous.</span>
              </button>
              <button type="button" onClick={() => chooseSystemSource("private")}>
                <strong>Mes systèmes</strong>
                <span>Ta bibliothèque privée et tous les systèmes que tu as créés.</span>
              </button>
            </div>
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

            <span className="pb-label">PARTAGE</span>

            <h2>Partager le playbook</h2>

            <p>
              Exporte ton playbook en PDF ou partage le lien par mail, WhatsApp
              ou copier-coller.
            </p>

            <div className="pb-share-grid">
              <button type="button" onClick={() => {}}>
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


.pb-team-link { display:flex; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap; }
.pb-team-link span { font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; opacity:.65; }
.pb-team-link select { min-width:200px; border:1px solid rgba(107,26,44,.22); border-radius:10px; background:#fff; padding:9px 34px 9px 11px; font:inherit; font-weight:800; color:#6B1A2C; }

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

.pb-viewswitch {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 18px;
  background: #f4eef0;
  border-radius: 12px;
  padding: 4px;
}
.pb-viewswitch button {
  border: none;
  background: transparent;
  color: #6b5f63;
  padding: 9px 17px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 900;
}
.pb-viewswitch button.on { background: #6B1A2C; color: #fff; }

.pb-workspace-head {
  border: 1px solid #eadfe2;
  border-radius: 18px;
  overflow: hidden;
  margin-bottom: 22px;
  background: #fff;
  box-shadow: 0 12px 34px rgba(60, 22, 32, .06);
}

.pb-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0;
  border: 0;
  background: #f7f3f4;
}

.pb-tabs button {
  min-height: 64px;
  border: 0;
  border-right: 1px solid #eadfe2;
  background: transparent;
  color: #6b5f63;
  font-weight: 1000;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.pb-tabs button:last-child { border-right: 0; }
.pb-tabs button b {
  min-width: 26px;
  height: 26px;
  padding: 0 7px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #e8dfe1;
  color: #6B1A2C;
  font-size: 12px;
}
.pb-tabs button.on {
  background: #6B1A2C;
  color: #fff;
}
.pb-tabs button.on b {
  background: rgba(255,255,255,.16);
  color: #fff;
}

.pb-filterbar {
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-top: 1px solid #eadfe2;
}
.pb-filter-copy strong,
.pb-filter-copy span { display: block; }
.pb-filter-copy strong {
  color: #24191c;
  font-size: 12px;
  letter-spacing: .07em;
}
.pb-filter-copy span {
  margin-top: 4px;
  color: #8b7e82;
  font-size: 12px;
}
.pb-tag-filters {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.pb-tag-filters button {
  border: 1px solid #e5dadd;
  background: #fff;
  color: #6b5f63;
  border-radius: 999px;
  padding: 7px 11px;
  font-size: 11px;
  font-weight: 900;
}
.pb-tag-filters button.on {
  background: #efe4e7;
  border-color: #6B1A2C;
  color: #6B1A2C;
}

.pb-section-band {
  min-height: 84px;
  margin: 0 0 18px;
  padding: 18px 22px;
  border-radius: 16px;
  background: linear-gradient(135deg, #6B1A2C, #48101c);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 16px 34px rgba(107, 26, 44, .18);
}
.pb-section-kicker {
  display: block;
  margin-bottom: 4px;
  color: #e8c68a;
  font-size: 10px;
  font-weight: 1000;
  letter-spacing: .13em;
}
.pb-section-band h2 {
  margin: 0;
  font-size: 22px;
  letter-spacing: -.02em;
}
.pb-section-count {
  display: flex;
  align-items: baseline;
  gap: 7px;
}
.pb-section-count strong {
  font-size: 34px;
  line-height: 1;
}
.pb-section-count span {
  color: rgba(255,255,255,.72);
  font-size: 12px;
  font-weight: 800;
}

.pb-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  align-items: stretch;
}

.pb-card {
  position: relative;
  border: 1px solid #e7dfe1;
  border-radius: 18px;
  overflow: hidden;
  background: white;
  box-shadow: 0 10px 28px rgba(33, 20, 24, .07);
  display: grid;
  grid-template-columns: minmax(210px, .9fr) minmax(240px, 1.1fr);
  min-height: 300px;
  transition: transform .18s ease, box-shadow .18s ease;
}
.pb-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 36px rgba(33, 20, 24, .11);
}

.pb-card-topline {
  position: absolute;
  z-index: 4;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}
.pb-card-index {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(24,18,20,.84);
  color: #fff;
  font-size: 11px;
  font-weight: 1000;
  backdrop-filter: blur(6px);
}
.pb-favorite {
  pointer-events: auto;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255,255,255,.65);
  border-radius: 50%;
  background: rgba(255,255,255,.9);
  color: #8f7b80;
  font-size: 21px;
  display: grid;
  place-items: center;
  box-shadow: 0 4px 14px rgba(0,0,0,.12);
}
.pb-favorite.on { color: #b88418; }

.pb-cover {
  position: relative;
  width: 100%;
  min-height: 300px;
  border: 0;
  border-right: 1px solid #eee6e8;
  background: #f6f2ea;
  display: grid;
  place-items: center;
  padding: 0;
  overflow: hidden;
}
.pb-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pb-cover-placeholder { font-size: 48px; }
.pb-open-hint {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 14px;
  padding: 9px 11px;
  border-radius: 10px;
  background: rgba(25, 16, 19, .82);
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  opacity: 0;
  transform: translateY(5px);
  transition: .18s ease;
}
.pb-cover:hover .pb-open-hint {
  opacity: 1;
  transform: translateY(0);
}

.pb-card-content {
  padding: 22px 20px 18px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pb-card-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.pb-card-type {
  display: block;
  margin-bottom: 7px;
  color: #9a7c84;
  font-size: 9px;
  font-weight: 1000;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.pb-card-title-row h3 {
  margin: 0 0 7px;
  font-size: 21px;
  font-weight: 1000;
  color: #21181b;
  line-height: 1.08;
}
.pb-card-title-row p {
  margin: 0;
  color: #766a6d;
  font-size: 13px;
  line-height: 1.4;
}

.pb-card-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 16px;
}
.pb-card-tags button {
  border: 1px solid #e9dfe2;
  background: #f8f3f4;
  color: #6B1A2C;
  border-radius: 999px;
  padding: 6px 9px;
  font-size: 10px;
  font-weight: 900;
}

.pb-card-actions {
  display: grid;
  grid-template-columns: 1fr 1fr 42px;
  gap: 7px;
  padding-top: 15px;
  margin-top: auto;
  border-top: 1px solid #eee6e8;
}
.pb-card-actions button {
  min-height: 40px;
  border: 1px solid #e9e1e3;
  background: #fff;
  color: #382b2f;
  font-size: 11px;
  font-weight: 900;
  border-radius: 10px;
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
}
.pb-card-actions button:hover { background: #faf6f7; }
.pb-card-actions button span { font-size: 16px; }
.pb-card-actions button.danger { color: #bd3a4d; }

.pb-add-wide {
  border: 1px dashed #cdbfc3;
  background: #fcfafb;
  color: #392b2f;
  border-radius: 16px;
  width: 100%;
  margin-top: 20px;
  min-height: 82px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 13px;
  font-weight: 900;
  font-size: 14px;
}
.pb-add-wide > span {
  width: 36px;
  height: 36px;
  border: 1px solid #b88418;
  color: #b88418;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 21px;
}
.pb-add-wide strong,
.pb-add-wide small { display: block; text-align: left; }
.pb-add-wide small {
  margin-top: 3px;
  color: #8b7e82;
  font-size: 10px;
  font-weight: 700;
}

.pb-empty-state {
  border: 1px dashed #d7c9cd;
  border-radius: 18px;
  padding: 46px 28px;
  text-align: center;
  background: #fcfafb;
}
.pb-empty-icon {
  width: 46px;
  height: 46px;
  margin: 0 auto 12px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: #efe4e7;
  color: #6B1A2C;
  font-size: 24px;
}
.pb-empty-state h3 { margin: 0 0 7px; }
.pb-empty-state p {
  max-width: 480px;
  margin: 0 auto 15px;
  color: #7b6f72;
  font-size: 13px;
}
.pb-empty-state button {
  border: 0;
  border-radius: 10px;
  padding: 10px 14px;
  background: #6B1A2C;
  color: #fff;
  font-weight: 900;
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
    grid-template-columns: 1fr;
  }

  .pb-card {
    grid-template-columns: minmax(240px, .8fr) minmax(280px, 1.2fr);
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

  .pb-card {
    grid-template-columns: 1fr;
  }

  .pb-cover {
    min-height: 260px;
    border-right: 0;
    border-bottom: 1px solid #eee6e8;
  }

  .pb-filterbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .pb-tag-filters {
    justify-content: flex-start;
  }

  .pb-tabs {
    grid-template-columns: 1fr;
  }

  .pb-tabs button {
    border-right: 0;
    border-bottom: 1px solid #eadfe2;
  }
}
`;