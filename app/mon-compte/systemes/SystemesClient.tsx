"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { listMySystems, type SystemItem } from "@/lib/systems";
import {
  listPlaybooks,
  createPlaybook,
  addSystemToPlaybook,
  type Playbook,
  type PlaybookCategory,
} from "@/lib/playbook";

type SortKey = "recent" | "alpha";

const FILTERS = [
  { key: "type", label: "BASE" },
  { key: "categorie", label: "CATÉGORIE" },
  { key: "tempsForts", label: "TEMPS FORT" },
] as const;

const PLAYBOOK_CATEGORIES = ["U13", "U15", "U18", "U21", "Seniors"];
const PLAYBOOK_SEASONS = ["2025-2026", "2026-2027", "2027-2028"];

const SYSTEM_BASES = [
  "SLOB",
  "BLOB",
  "Homme à Homme demi terrain",
  "Attaque de Zone",
  "Transition",
];

const SYSTEM_CATEGORIES = ["U13", "U15", "U18", "U21", "Seniors"];

const SYSTEM_TEMPS_FORTS = [
  "Pick top",
  "Pick side",
  "Hand off",
  "Isolation",
  "Post-up",
  "Écran non porteur",
];

const FILTER_OPTIONS: Record<string, string[]> = {
  type: SYSTEM_BASES,
  categorie: SYSTEM_CATEGORIES,
  tempsForts: SYSTEM_TEMPS_FORTS,
};

function getField(item: SystemItem, key: string): string {
  const value = (item as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function canonicalSystemValue(key: string, value: string): string {
  const clean = value.trim();
  const pools = FILTER_OPTIONS[key] ?? [];
  const match = pools.find((option) =>
    option.localeCompare(clean, "fr", { sensitivity: "base" }) === 0
  );
  if (match) return match;
  if (key === "categorie" && clean.toLowerCase() === "senior") return "Seniors";
  return clean;
}

function getFieldValues(item: SystemItem, key: string): string[] {
  const value = (item as unknown as Record<string, unknown>)[key];
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => canonicalSystemValue(key, entry));
  }
  return typeof value === "string" && value
    ? [canonicalSystemValue(key, value)]
    : [];
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
  // Une seule prévisualisation par système :
  // priorité à l'animation générée dans Dessin, puis à la vidéo du système.
  // On ne charge plus toute la série de schémas dans la vignette.
  const previewVideo = item.schemaVideo || item.videos?.[0] || "";
  const poster =
    item.schemaImages?.[0] || item.schemaImage || item.images?.[0] || "";

  const firstTempsFort = item.tempsForts?.[0];
  const detailHref = `/systemes/${item.id}`;
  const editHref = `/systemes/creer?id=${item.id}`;

  return (
    <article className="mb-system-card">
      <Link href={detailHref} className="mb-system-cover">
        {previewVideo ? (
          <video
            className="mb-system-preview-video"
            src={previewVideo}
            poster={poster || undefined}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
          />
        ) : poster ? (
          <img
            src={poster}
            alt={item.title || "Système"}
            loading="lazy"
            decoding="async"
          />
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

        {item.contributor_name && (
          <div className="mb-system-contributor" title={`Réalisé par ${item.contributor_name}`}>
            <span>Réalisé par <strong>{item.contributor_name}</strong></span>
            {item.contributor_avatar_url ? (
              <img src={item.contributor_avatar_url} alt="" />
            ) : (
              <span className="mb-system-contributor-fallback">{item.contributor_name.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
        )}

        <div className="mb-system-date">Créé le {formatDate(item.createdAt)}</div>

        <div className="mb-system-actions">
          <button
            type="button"
            className="mb-system-add"
            onClick={() => onAddToPlaybook(item)}
          >
            {isConnected ? "+ Playbook" : "Débloquer"}
          </button>

          <Link href={editHref} className="mb-system-edit">Modifier</Link>
        </div>
      </div>
    </article>
  );
}

export default function SystemesClient() {
  const router = useRouter();
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
  const [newPlaybookSeason, setNewPlaybookSeason] = useState("2025-2026");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const supabase = createClient();

        const [data, sessionResult] = await Promise.all([
          listMySystems(),
          supabase.auth.getSession(),
        ]);

        setItems(data);
        setIsConnected(Boolean(sessionResult.data.session?.user));
        router.prefetch("/systemes/creer?new=1");
      } catch (error) {
        console.error("Erreur chargement systèmes :", error);
        setItems([]);
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  const options = FILTER_OPTIONS;

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
        season: newPlaybookSeason,
        description: `${newPlaybookCategory} · ${newPlaybookSeason}`,
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

      router.push(`/mon-compte/playbooks/${playbookId}`);
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
          if (sel.length && !getFieldValues(item, f.key).some((value) => sel.includes(value))) return false;
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
                  href="/systemes/creer?new=1"
                  className="btn btn-black"
                >
                  + Créer un système
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
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          align-items: stretch;
        }

        .mb-system-card {
          min-width: 0;
          width: 100%;
          background: #fff;
          border: 1px solid #eadfe2;
          border-radius: 18px;
          overflow: hidden;
          padding: 0;
          box-shadow: 0 8px 24px rgba(55, 14, 25, 0.06);
          display: flex;
          flex-direction: column;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }

        .mb-system-card:hover {
          transform: translateY(-3px);
          border-color: #d7bcc3;
          box-shadow: 0 14px 34px rgba(55, 14, 25, 0.11);
        }

        .mb-system-cover {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 16 / 10;
          background: #f6f1f2;
          overflow: hidden;
          text-decoration: none;
          border-bottom: 1px solid #eee5e7;
        }

        .mb-system-cover img,
        .mb-system-preview-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          transition: transform .25s ease;
        }

        .mb-system-preview-video {
          background: #2d0b14;
          pointer-events: none;
        }

        .mb-system-card:hover .mb-system-cover img,
        .mb-system-card:hover .mb-system-preview-video {
          transform: scale(1.015);
        }

        .mb-system-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #f7f1f3, #eee3e6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.4rem;
        }

        .mb-system-body {
          padding: 16px;
          display: flex;
          flex: 1;
          flex-direction: column;
          min-width: 0;
        }

        .mb-system-title {
          width: 100%;
          margin: 0 0 10px;
          text-align: left !important;
          font-size: 1.05rem;
          line-height: 1.18;
          font-weight: 950;
          text-transform: none;
          min-height: 2.5rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .mb-system-title a {
          display: block;
          width: 100%;
          color: #1c1517;
          text-align: left !important;
          text-decoration: none;
        }

        .mb-system-details {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 0 0 10px;
        }

        .mb-system-details div {
          width: auto !important;
          max-width: 100%;
          padding: 5px 8px;
          border-radius: 999px;
          background: #f7f3f4;
          color: #5f5155 !important;
          font-size: .72rem;
          line-height: 1;
          font-weight: 750 !important;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mb-system-details div:first-child {
          background: #f5e8eb;
          color: #74142b !important;
        }

        .mb-system-contributor {
          display:flex;
          align-items:center;
          gap:7px;
          margin-top:4px;
          min-width:0;
          color:#75686c;
          font-size:.72rem;
          line-height:1.15;
        }

        .mb-system-contributor img,
        .mb-system-contributor-fallback {
          width:24px;
          height:24px;
          border-radius:50%;
          flex:0 0 24px;
          object-fit:cover;
          border:1px solid rgba(107,26,44,.18);
          background:#f4ecef;
          color:#6b1a2c;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight:900;
        }

        .mb-system-contributor span:last-child {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .mb-system-contributor strong {
          color:#222;
          font-weight:850;
        }

        .mb-system-date {
          margin-top: auto;
          padding-top: 12px;
          color: #9b8e92;
          font-size: .7rem;
          font-weight: 650;
        }

        .mb-system-actions {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
          margin-top: 10px;
        }

        .mb-system-add,
        .mb-system-edit {
          box-sizing: border-box !important;
          width: auto !important;
          min-width: 0 !important;
          min-height: 38px !important;
          height: 38px !important;
          margin: 0 !important;
          padding: 0 13px !important;
          border-radius: 10px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: .74rem !important;
          line-height: 1 !important;
          font-weight: 900 !important;
          white-space: nowrap !important;
          text-decoration: none !important;
        }

        .mb-system-add {
          border: 1px solid #74142b !important;
          background: #74142b !important;
          color: #fff !important;
          cursor: pointer;
        }

        .mb-system-add:hover {
          background: #5f1023 !important;
          border-color: #5f1023 !important;
        }

        .mb-system-edit {
          border: 1px solid #e2d7da !important;
          background: #fff !important;
          color: #74142b !important;
        }

        .mb-system-edit:hover {
          background: #faf5f6 !important;
          border-color: #cdb8be !important;
        }

        @media (max-width: 1100px) {
          .mb-systems-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (max-width: 720px) {
          .mb-systems-grid { grid-template-columns: 1fr; }
          .mb-system-actions { grid-template-columns: 1fr; }
          .mb-system-edit { width: 100% !important; }
        }

        /* Actions de vignette : compactes, horizontales */
        .mb-system-actions {
          display:flex !important;
          align-items:center !important;
          gap:6px !important;
          margin-top:8px !important;
        }
        .mb-system-actions .mb-system-add,
        .mb-system-actions .mb-system-edit {
          width:auto !important;
          min-width:0 !important;
          height:30px !important;
          min-height:30px !important;
          margin:0 !important;
          padding:0 10px !important;
          border-radius:8px !important;
          font-size:.68rem !important;
          line-height:1 !important;
          white-space:nowrap !important;
        }
        .mb-system-card .mb-system-submit,
        .mb-system-card .mb-system-delete {
          width:auto !important;
          min-width:30px !important;
          height:30px !important;
          min-height:30px !important;
          padding:0 9px !important;
          margin-top:6px !important;
          border-radius:8px !important;
          font-size:.66rem !important;
          line-height:1 !important;
          writing-mode:horizontal-tb !important;
          word-break:normal !important;
          white-space:nowrap !important;
        }


        /* === VIGNETTE COMPACTE — dimensions validées === */
        .mb-system-body {
          padding: 12px 13px 11px !important;
        }

        .mb-system-title {
          margin: 0 0 7px !important;
          min-height: 0 !important;
          font-size: .98rem !important;
          line-height: 1.12 !important;
        }

        .mb-system-details {
          gap: 5px !important;
          margin: 0 0 6px !important;
        }

        .mb-system-details div {
          padding: 4px 7px !important;
          font-size: .66rem !important;
        }

        .mb-system-contributor {
          margin-top: 2px !important;
          font-size: .66rem !important;
        }

        .mb-system-date {
          margin-top: 5px !important;
          padding-top: 0 !important;
          font-size: .64rem !important;
        }

        .mb-system-actions {
          display: flex !important;
          align-items: center !important;
          flex-wrap: nowrap !important;
          gap: 6px !important;
          margin-top: 8px !important;
          min-height: 28px !important;
        }

        .mb-system-actions .mb-system-add,
        .mb-system-actions .mb-system-edit,
        .mb-system-card .mb-system-submit {
          box-sizing: border-box !important;
          width: auto !important;
          min-width: 0 !important;
          height: 28px !important;
          min-height: 28px !important;
          max-height: 28px !important;
          margin: 0 !important;
          padding: 0 9px !important;
          border-radius: 7px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: .64rem !important;
          line-height: 1 !important;
          font-weight: 850 !important;
          white-space: nowrap !important;
          writing-mode: horizontal-tb !important;
          word-break: normal !important;
        }

        .mb-system-card .mb-system-delete {
          box-sizing: border-box !important;
          width: 28px !important;
          min-width: 28px !important;
          max-width: 28px !important;
          height: 28px !important;
          min-height: 28px !important;
          max-height: 28px !important;
          margin: 6px 0 0 !important;
          padding: 0 !important;
          border-radius: 7px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: .78rem !important;
          line-height: 1 !important;
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
