"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { listSystems, type SystemItem } from "@/lib/systems";
import {
  listPlaybooks,
  createPlaybook,
  addSystemToPlaybook,
  type Playbook,
  type PlaybookCategory,
} from "@/lib/playbook";

type SortKey = "recent" | "alpha";

const FILTERS = [
  { key: "type", label: "TYPE" },
  { key: "categorie", label: "CATÉGORIE" },
] as const;

const PLAYBOOK_CATEGORIES = ["U11", "U13", "U15", "U18", "U21", "Seniors"];
const PLAYBOOK_LEVELS = ["Départemental", "Régional", "National"];
const PLAYBOOK_SEASONS = ["2025-2026", "2026-2027", "2027-2028"];

function getField(item: SystemItem, key: string): string {
  const value = (item as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function formatDate(date: string | number | undefined) {
  if (!date) return "—";

  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function systemCategoryToPlaybookCategory(
  value?: string | null
): PlaybookCategory {
  const v = (value || "").toUpperCase();

  if (v.includes("SLOB")) return "SLOB";
  if (v.includes("BLOB")) return "BLOB";
  if (v.includes("ATO")) return "ATO";

  return "Système demi-terrain";
}

function SystemCard({
  item,
  isConnected,
  onAddToPlaybook,
}: {
  item: SystemItem;
  isConnected: boolean;
  onAddToPlaybook: (item: SystemItem) => void;
}) {
  const thumbnail =
    item.schemaImages?.[0] || item.images?.[0] || item.schemaImage || "";

  const firstTempsFort = item.tempsForts?.[0];
  const detailHref = isConnected ? `/systemes/${item.id}` : "/abonnements";
  const editHref = isConnected
    ? `/systemes/creer?id=${item.id}`
    : "/abonnements";

  return (
    <article className="mb-system-card">
      <Link href={detailHref} className="mb-system-cover">
        {thumbnail ? (
          <img src={thumbnail} alt={item.title || "Système"} />
        ) : (
          <div className="mb-system-placeholder">🏀</div>
        )}
      </Link>

      <div className="mb-system-body">
        <h3 className="mb-system-title">
          <Link href={detailHref}>{item.title || "Système sans titre"}</Link>
        </h3>

        <div className="mb-system-details">
          <div>{item.type || "Type non défini"}</div>
          {firstTempsFort && <div>{firstTempsFort}</div>}
          <div>{item.categorie || "Toutes catégories"}</div>
        </div>

        <div className="mb-system-foot">
          <span>{formatDate(item.createdAt)}</span>

          <button
            type="button"
            className="mb-system-add"
            onClick={() => onAddToPlaybook(item)}
          >
            {isConnected ? "+ Playbook" : "Débloquer"}
          </button>

          <Link href={editHref}>Modifier</Link>
        </div>
      </div>
    </article>
  );
}

export default function SystemesClient() {
  const searchParams = useSearchParams();
  const forcedPlaybookId = searchParams.get("addToPlaybook");

  const [items, setItems] = useState<SystemItem[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<SystemItem | null>(null);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState("");

  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const [creatingPlaybook, setCreatingPlaybook] = useState(false);
  const [newPlaybookTitle, setNewPlaybookTitle] = useState("");
  const [newPlaybookCategory, setNewPlaybookCategory] = useState("U18");
  const [newPlaybookLevel, setNewPlaybookLevel] = useState("National");
  const [newPlaybookSeason, setNewPlaybookSeason] = useState("2025-2026");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const data = await listSystems();
        setItems(data);

        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        setIsConnected(Boolean(user));
      } catch (error) {
        console.error("Erreur chargement systèmes :", error);
        setItems([]);
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const options = useMemo(() => {
    const sets: Record<string, Set<string>> = {};

    for (const f of FILTERS) {
      sets[f.key] = new Set();
    }

    for (const item of items) {
      for (const f of FILTERS) {
        const value = getField(item, f.key);
        if (value) sets[f.key].add(value);
      }
    }

    return Object.fromEntries(
      FILTERS.map((f) => [
        f.key,
        Array.from(sets[f.key]).sort((a, b) => a.localeCompare(b, "fr")),
      ])
    ) as Record<string, string[]>;
  }, [items]);

  function toggleFilter(key: string, value: string) {
    setSelected((prev) => {
      const current = prev[key] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];

      return { ...prev, [key]: next };
    });
  }

  async function openAddToPlaybook(system: SystemItem) {
    if (!isConnected) {
      window.location.href = "/abonnements";
      return;
    }

    if (forcedPlaybookId) {
      await addSystem(system, forcedPlaybookId);
      return;
    }

    const data = await listPlaybooks();

    setPlaybooks(data);
    setSelectedSystem(system);

    if (data.length === 0) {
      setCreatingPlaybook(true);
      setSelectedPlaybookId("");
    } else {
      setCreatingPlaybook(false);
      setSelectedPlaybookId(data[0].id);
    }
  }

  async function createAndAddPlaybook() {
    if (!selectedSystem) return;

    if (!newPlaybookTitle.trim()) {
      alert("Nom du playbook obligatoire");
      return;
    }

    try {
      setAdding(true);

      const created = await createPlaybook({
        title: newPlaybookTitle.trim(),
        category: newPlaybookCategory,
        level: newPlaybookLevel,
        season: newPlaybookSeason,
        description: `${newPlaybookCategory} · ${newPlaybookLevel} · ${newPlaybookSeason}`,
      });

      await addSystem(selectedSystem, created.id);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Erreur création playbook");
    } finally {
      setAdding(false);
    }
  }

  async function addSystem(system: SystemItem, playbookId: string) {
    if (!isConnected) {
      window.location.href = "/abonnements";
      return;
    }

    try {
      setAdding(true);

      await addSystemToPlaybook({
        playbook_id: playbookId,
        system_id: system.id,
        title: system.title || "Système sans titre",
        category: systemCategoryToPlaybookCategory(
          `${system.type || ""} ${system.categorie || ""}`
        ),
        description: system.objectif || system.organisation || "",
        schema_images: system.schemaImages ?? [],
        schema_data_list: system.schemaDataList ?? [],
        tags: system.tags ?? [],
      });

      window.location.href = `/mon-compte/playbooks/${playbookId}`;
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Erreur ajout playbook");
    } finally {
      setAdding(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return [...items]
      .filter((item) => {
        for (const f of FILTERS) {
          const sel = selected[f.key] ?? [];
          if (sel.length && !sel.includes(getField(item, f.key))) return false;
        }

        if (!q) return true;

        return [
          item.title,
          item.objectif ?? "",
          item.organisation ?? "",
          item.categorie ?? "",
          item.type ?? "",
          ...(item.tempsForts ?? []),
          ...(item.tags ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (sort === "alpha") {
          return (a.title || "").localeCompare(b.title || "", "fr");
        }

        return (
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
        );
      });
  }, [items, search, sort, selected]);

  return (
    <main>
      <div className="page-banner">
        <img src="/images/bandeau-systemes.png" alt="MyBasket Systèmes" />
      </div>

      <div className="container">
        <div className="section-title-bar">
          <h2>SYSTÈMES</h2>
        </div>

        <p className="section-subtitle">
          Recherche, filtre et découvre les systèmes MyBasket.
        </p>

        <div className="list-layout">
          <aside className="filters">
            <input
              className="filter-search"
              placeholder="Rechercher un système..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {FILTERS.map((f) => (
              <div className="filter-group" key={f.key}>
                <div className="filter-title">{f.label}</div>

                <div className="filter-options">
                  {options[f.key].length === 0 ? (
                    <span className="filter-empty">—</span>
                  ) : (
                    options[f.key].map((opt) => (
                      <label key={opt}>
                        <input
                          type="checkbox"
                          checked={(selected[f.key] ?? []).includes(opt)}
                          onChange={() => toggleFilter(f.key, opt)}
                        />
                        {opt}
                      </label>
                    ))
                  )}
                </div>
              </div>
            ))}
          </aside>

          <section>
            <div className="list-header">
              <div className="list-count">
                {loading
                  ? "Chargement..."
                  : `${filtered.length} système${
                      filtered.length > 1 ? "s" : ""
                    }`}
              </div>

              <div className="list-actions">
                <Link
                  href={isConnected ? "/systemes/creer?new=1" : "/abonnements"}
                  className="btn btn-black"
                >
                  {isConnected ? "+ Créer un système" : "Débloquer les systèmes"}
                </Link>

                <select
                  className="sort-select"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                >
                  <option value="recent">Plus récents</option>
                  <option value="alpha">A-Z</option>
                </select>
              </div>
            </div>

            {loading ? (
              <p className="empty-state">Chargement des systèmes...</p>
            ) : filtered.length === 0 ? (
              <p className="empty-state">Aucun système trouvé.</p>
            ) : (
              <div className="mb-systems-grid">
                {filtered.map((item) => (
                  <SystemCard
                    key={item.id}
                    item={item}
                    isConnected={isConnected}
                    onAddToPlaybook={openAddToPlaybook}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {selectedSystem && !forcedPlaybookId && isConnected && (
        <div className="pb-modal-bg" onClick={() => setSelectedSystem(null)}>
          <div className="pb-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Ajouter au playbook</h3>

            {!creatingPlaybook ? (
              <>
                <label>Choisir un playbook</label>

                <select
                  value={selectedPlaybookId}
                  onChange={(e) => setSelectedPlaybookId(e.target.value)}
                >
                  {playbooks.map((playbook) => (
                    <option key={playbook.id} value={playbook.id}>
                      {playbook.title}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="pb-new"
                  onClick={() => setCreatingPlaybook(true)}
                >
                  + Nouveau playbook
                </button>

                <div className="pb-modal-actions">
                  <button type="button" onClick={() => setSelectedSystem(null)}>
                    Annuler
                  </button>

                  <button
                    type="button"
                    className="main"
                    disabled={!selectedPlaybookId || adding}
                    onClick={() => addSystem(selectedSystem, selectedPlaybookId)}
                  >
                    {adding ? "Ajout..." : "Ajouter"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label>Nom du playbook</label>

                <input
                  value={newPlaybookTitle}
                  onChange={(e) => setNewPlaybookTitle(e.target.value)}
                  placeholder="Ex : Paris Basketball"
                />

                <label>Catégorie</label>

                <select
                  value={newPlaybookCategory}
                  onChange={(e) => setNewPlaybookCategory(e.target.value)}
                >
                  {PLAYBOOK_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <label>Niveau</label>

                <select
                  value={newPlaybookLevel}
                  onChange={(e) => setNewPlaybookLevel(e.target.value)}
                >
                  {PLAYBOOK_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>

                <label>Saison</label>

                <select
                  value={newPlaybookSeason}
                  onChange={(e) => setNewPlaybookSeason(e.target.value)}
                >
                  {PLAYBOOK_SEASONS.map((season) => (
                    <option key={season} value={season}>
                      {season}
                    </option>
                  ))}
                </select>

                <div className="pb-modal-actions">
                  <button
                    type="button"
                    onClick={() => setCreatingPlaybook(false)}
                  >
                    Retour
                  </button>

                  <button
                    type="button"
                    className="main"
                    disabled={adding}
                    onClick={createAndAddPlaybook}
                  >
                    {adding ? "Création..." : "Créer et ajouter"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .mb-systems-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 270px));
          gap: 1.4rem;
          align-items: start;
        }

        .mb-system-card {
          width: 100%;
          background: #fff;
          border: 1.5px solid #cfcfcf;
          border-radius: 14px;
          overflow: hidden;
          padding: 12px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
        }

        .mb-system-cover {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 190px;
          background: #fff;
          overflow: hidden;
          text-decoration: none;
        }

        .mb-system-cover img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }

        .mb-system-placeholder {
          width: 100%;
          height: 100%;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.4rem;
        }

        .mb-system-body {
          padding-top: 4px;
        }

        .mb-system-title {
          width: 100%;
          margin: 0 0 12px;
          text-align: center !important;
          font-size: 1.55rem;
          line-height: 1;
          font-weight: 1000;
          text-transform: uppercase;
        }

        .mb-system-title a {
          display: block;
          width: 100%;
          color: #111;
          text-align: center !important;
          text-decoration: none;
        }

        .mb-system-details {
          display: flex;
          flex-direction: column;
          gap: 3px;
          margin-top: 4px;
        }

        .mb-system-details div {
          font-size: 0.92rem;
          line-height: 1.15;
          font-weight: 500;
          color: #111;
        }

        .mb-system-details div:first-child {
          color: #6b1a2c;
          font-weight: 700;
        }

        .mb-system-details div:last-child {
          color: #666;
        }

        .mb-system-foot {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          font-size: 0.82rem;
          color: #777;
          font-weight: 600;
        }

        .mb-system-foot a {
          color: #666;
          font-weight: 800;
          text-decoration: none;
        }

        .mb-system-foot a:hover {
          color: #6b1a2c;
          text-decoration: underline;
        }

        .mb-system-add {
          border: 0;
          background: #6b1a2c;
          color: #fff;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 0.75rem;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
        }

        .pb-modal-bg {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .pb-modal {
          width: 100%;
          max-width: 430px;
          background: #fff;
          border-radius: 18px;
          padding: 24px;
        }

        .pb-modal h3 {
          margin: 0 0 18px;
          color: #6b1a2c;
          font-size: 1.4rem;
          font-weight: 1000;
        }

        .pb-modal label {
          display: block;
          margin: 12px 0 6px;
          font-size: 0.8rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .pb-modal select,
        .pb-modal input {
          width: 100%;
          height: 44px;
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 0 12px;
          margin-bottom: 8px;
        }

        .pb-new {
          margin-top: 12px;
          border: 1px dashed #6b1a2c;
          background: #fff;
          color: #6b1a2c;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 900;
          cursor: pointer;
        }

        .pb-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }

        .pb-modal-actions button {
          border: 1px solid #ddd;
          background: #fff;
          border-radius: 999px;
          padding: 10px 16px;
          font-weight: 900;
          cursor: pointer;
        }

        .pb-modal-actions .main {
          background: #6b1a2c;
          color: #fff;
          border-color: #6b1a2c;
        }

        .pb-modal-actions button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>
    </main>
  );
}