"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSystem,
  listMySystems,
  submitSystemForReview,
  type SystemItem,
} from "@/lib/systems";
import { addSystemToPlaybook, type PlaybookCategory } from "@/lib/playbook";

type SortKey = "recent" | "alpha";
type StatusKey = "all" | "draft" | "submitted" | "approved" | "rejected";

const FILTERS = [
  { key: "type", label: "BASE" },
  { key: "categorie", label: "CATÉGORIE" },
  { key: "tempsForts", label: "TEMPS FORT" },
] as const;

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

const STATUS_LABELS: Record<string, string> = {
  draft: "Privé",
  submitted: "En attente CEO",
  approved: "Validé bibliothèque",
  rejected: "Refusé",
};

function canonicalValue(key: string, value: string) {
  const clean = value.trim();
  const pool = FILTER_OPTIONS[key] ?? [];
  const match = pool.find(
    (option) =>
      option.localeCompare(clean, "fr", { sensitivity: "base" }) === 0
  );

  if (match) return match;
  if (key === "categorie" && clean.toLowerCase() === "senior") return "Seniors";
  return clean;
}

function fieldValues(item: SystemItem, key: string): string[] {
  const value = (item as unknown as Record<string, unknown>)[key];

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => canonicalValue(key, entry));
  }

  return typeof value === "string" && value
    ? [canonicalValue(key, value)]
    : [];
}

function getStatus(item: SystemItem): StatusKey {
  const status = item.review_status || "draft";
  return status as StatusKey;
}

function formatDate(value?: string | number) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getThumbnail(item: SystemItem) {
  return item.schemaImages?.[0] || item.images?.[0] || item.schemaImage || "";
}

function systemCategoryToPlaybookCategory(value?: string | null): PlaybookCategory {
  const v = (value || "").toUpperCase();
  if (v.includes("SLOB")) return "SLOB";
  if (v.includes("BLOB")) return "BLOB";
  return "Système demi-terrain";
}

export default function MesSystemesPage() {
  const router = useRouter();
  const [targetPlaybookId, setTargetPlaybookId] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [items, setItems] = useState<SystemItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [status, setStatus] = useState<StatusKey>("all");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);

    try {
      const data = await listMySystems();
      setItems(data ?? []);
    } catch (error) {
      console.error("Erreur chargement mes systèmes :", error);
      alert("Impossible de charger tes systèmes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    setTargetPlaybookId(params.get("addToPlaybook") || "");
  }, []);

  function toggleFilter(key: string, value: string) {
    setSelected((prev) => {
      const current = prev[key] ?? [];
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];

      return { ...prev, [key]: next };
    });
  }

  async function submit(item: SystemItem) {
    if (getStatus(item) === "submitted") return;

    const ok = window.confirm(
      `Proposer "${item.title || "ce système"}" au CEO pour la bibliothèque MyBasket ?`
    );

    if (!ok) return;

    try {
      setSubmittingId(item.id);
      const success = await submitSystemForReview(item.id);

      if (!success) {
        alert("Impossible d'envoyer ce système en validation.");
        return;
      }

      await load();
    } finally {
      setSubmittingId(null);
    }
  }

  async function remove(item: SystemItem) {
    const ok = window.confirm(
      `Supprimer définitivement "${item.title || "ce système"}" ?`
    );

    if (!ok) return;

    try {
      setDeletingId(item.id);
      await deleteSystem(item.id);
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    } catch (error) {
      console.error("Erreur suppression système :", error);
      alert("Impossible de supprimer ce système.");
    } finally {
      setDeletingId(null);
    }
  }

  async function addPrivateSystemToPlaybook(item: SystemItem) {
    if (!targetPlaybookId) return;
    try {
      setAddingId(item.id);
      await addSystemToPlaybook({
        playbook_id: targetPlaybookId,
        system_id: item.id,
        title: item.title || "Système sans titre",
        category: systemCategoryToPlaybookCategory(`${item.type || ""} ${item.categorie || ""}`),
        description: item.objectif || item.organisation || "",
        schema_images: item.schemaImages ?? [],
        schema_data_list: item.schemaDataList ?? [],
        tags: item.tags ?? [],
      });
      router.push(`/mon-compte/playbooks/${targetPlaybookId}`);
    } catch (error) {
      console.error("Erreur ajout système privé au playbook :", error);
      alert("Impossible d'ajouter ce système au playbook.");
    } finally {
      setAddingId(null);
    }
  }

  const counts = useMemo(() => {
    const base = {
      all: items.length,
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
    };

    for (const item of items) {
      const key = getStatus(item);
      if (key in base && key !== "all") base[key] += 1;
    }

    return base;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return [...items]
      .filter((item) => {
        if (status !== "all" && getStatus(item) !== status) return false;

        for (const filter of FILTERS) {
          const active = selected[filter.key] ?? [];

          if (
            active.length &&
            !fieldValues(item, filter.key).some((value) => active.includes(value))
          ) {
            return false;
          }
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
  }, [items, search, sort, status, selected]);

  return (
    <main className="page">
      <div className="topbar">
        <Link href="/mon-compte" className="back">
          ← Retour à mon compte
        </Link>

        <Link href="/systemes/creer?new=1" className="create">
          + Créer un système
        </Link>
      </div>

      <section className="hero">
        <p className="eyebrow">MYBASKET PERSONNEL</p>
        <h1>MES SYSTÈMES</h1>
        <p>
          {targetPlaybookId
            ? "Choisis un de tes systèmes pour l’ajouter à ce Playbook."
            : "Ta bibliothèque personnelle de systèmes. Tes créations restent privées tant que tu ne les proposes pas au CEO pour la bibliothèque MyBasket."}
        </p>
      </section>

      <section className="statusBar">
        {(
          [
            ["all", "Tous"],
            ["draft", "Privés"],
            ["submitted", "En attente CEO"],
            ["approved", "Validés"],
            ["rejected", "Refusés"],
          ] as Array<[StatusKey, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={status === key ? "status active" : "status"}
            onClick={() => setStatus(key)}
          >
            <span>{label}</span>
            <strong>{counts[key]}</strong>
          </button>
        ))}
      </section>

      <div className="layout">
        <aside className="filters">
          <input
            className="search"
            placeholder="Rechercher un système..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {FILTERS.map((filter) => (
            <div className="filterGroup" key={filter.key}>
              <div className="filterTitle">{filter.label}</div>

              {FILTER_OPTIONS[filter.key].map((option) => (
                <label key={option} className="filterOption">
                  <input
                    type="checkbox"
                    checked={(selected[filter.key] ?? []).includes(option)}
                    onChange={() => toggleFilter(filter.key, option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          ))}
        </aside>

        <section className="content">
          <div className="listHeader">
            <strong>
              {loading
                ? "Chargement..."
                : `${filtered.length} système${filtered.length > 1 ? "s" : ""}`}
            </strong>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
            >
              <option value="recent">Plus récents</option>
              <option value="alpha">A-Z</option>
            </select>
          </div>

          {loading ? (
            <div className="empty">Chargement de tes systèmes...</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <strong>Aucun système ici.</strong>
              <span>
                Crée ton premier système ou change les filtres sélectionnés.
              </span>
            </div>
          ) : (
            <div className="grid">
              {filtered.map((item) => {
                const thumbnail = getThumbnail(item);
                const itemStatus = getStatus(item);
                const canSubmit = itemStatus !== "submitted";
                const firstTempsFort = item.tempsForts?.[0];

                return (
                  <article className="card" key={item.id}>
                    <Link
                      href={`/systemes/${item.id}`}
                      className="cover"
                      aria-label={item.title || "Ouvrir le système"}
                    >
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={item.title || "Système"}
                          loading="lazy"
                        />
                      ) : (
                        <div className="placeholder">🏀</div>
                      )}

                      <span className={`badge ${itemStatus}`}>
                        {STATUS_LABELS[itemStatus] || "Privé"}
                      </span>
                    </Link>

                    <div className="body">
                      <h2 title={item.title || "Système sans titre"}>
                        {item.title || "Système sans titre"}
                      </h2>

                      <div className="meta">
                        <span>{item.type || "Type non défini"}</span>
                        <span>{item.categorie || "Toutes catégories"}</span>
                        <span>{firstTempsFort || "Temps fort non défini"}</span>
                      </div>

                      <div className="date">
                        Créé le {formatDate(item.createdAt)}
                      </div>

                      {itemStatus === "rejected" && item.rejection_reason && (
                        <div className="reason">
                          Motif : {item.rejection_reason}
                        </div>
                      )}

                      <div className="actions">
                        {targetPlaybookId && (
                          <button
                            type="button"
                            className="submit"
                            disabled={addingId === item.id}
                            onClick={() => addPrivateSystemToPlaybook(item)}
                          >
                            {addingId === item.id ? "Ajout..." : "+ Ajouter au Playbook"}
                          </button>
                        )}

                        <Link
                          href={`/systemes/creer?id=${item.id}`}
                          className="secondary"
                        >
                          Modifier
                        </Link>

                        <button
                          type="button"
                          className="submit"
                          disabled={!canSubmit || submittingId === item.id}
                          onClick={() => submit(item)}
                        >
                          {itemStatus === "submitted"
                            ? "En attente CEO"
                            : submittingId === item.id
                            ? "Envoi..."
                            : "Proposer à MyBasket"}
                        </button>

                        <button
                          type="button"
                          className="delete"
                          disabled={deletingId === item.id}
                          onClick={() => remove(item)}
                          aria-label="Supprimer le système"
                          title="Supprimer"
                        >
                          {deletingId === item.id ? "…" : "×"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #f7f7f8;
          color: #151515;
          padding: 32px 42px 72px;
          font-family: Roboto, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }

        .topbar {
          max-width: 1480px;
          margin: 0 auto 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .back {
          color: #6d0d23;
          font-size: 14px;
          font-weight: 800;
          text-decoration: none;
        }

        .create {
          border-radius: 10px;
          background: #111;
          color: white;
          padding: 12px 17px;
          text-decoration: none;
          font-size: 14px;
          font-weight: 900;
        }

        .hero {
          max-width: 1480px;
          margin: 0 auto;
          background: white;
          border: 1px solid #e8e8ea;
          border-radius: 18px;
          padding: 28px 30px;
        }

        .eyebrow {
          margin: 0 0 6px;
          color: #7a0d24;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.12em;
        }

        h1 {
          margin: 0;
          font-size: clamp(28px, 4vw, 44px);
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .hero > p:last-child {
          max-width: 780px;
          margin: 13px 0 0;
          color: #666;
          line-height: 1.55;
          font-size: 15px;
        }

        .statusBar {
          max-width: 1480px;
          margin: 18px auto;
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
        }

        .status {
          flex: 0 0 auto;
          min-width: 122px;
          border: 1px solid #dedee2;
          border-radius: 12px;
          background: white;
          padding: 11px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
          font-weight: 800;
          color: #444;
        }

        .status strong {
          display: grid;
          place-items: center;
          min-width: 26px;
          height: 26px;
          border-radius: 999px;
          background: #f0f0f2;
          font-size: 12px;
        }

        .status.active {
          background: #7a0d24;
          border-color: #7a0d24;
          color: white;
        }

        .status.active strong {
          background: rgba(255, 255, 255, 0.16);
        }

        .layout {
          max-width: 1480px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr);
          gap: 22px;
          align-items: start;
        }

        .filters {
          background: white;
          border: 1px solid #e5e5e7;
          border-radius: 16px;
          padding: 16px;
          position: sticky;
          top: 18px;
        }

        .search {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #dedee2;
          border-radius: 10px;
          padding: 11px 12px;
          font: inherit;
          outline: none;
        }

        .search:focus {
          border-color: #7a0d24;
          box-shadow: 0 0 0 3px rgba(122, 13, 36, 0.08);
        }

        .filterGroup {
          border-top: 1px solid #eeeeef;
          padding-top: 15px;
          margin-top: 15px;
        }

        .filterTitle {
          font-size: 11px;
          letter-spacing: 0.09em;
          font-weight: 950;
          margin-bottom: 10px;
          color: #555;
        }

        .filterOption {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 0;
          font-size: 13px;
          color: #444;
          cursor: pointer;
        }

        .content {
          min-width: 0;
        }

        .listHeader {
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 13px;
        }

        .listHeader strong {
          font-size: 14px;
        }

        .listHeader select {
          border: 1px solid #dedee2;
          border-radius: 9px;
          background: white;
          padding: 9px 11px;
          font: inherit;
          font-size: 13px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
          align-items: stretch;
        }

        .card {
          min-width: 0;
          height: 100%;
          background: white;
          border: 1px solid #e5e5e7;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 7px 22px rgba(0, 0, 0, 0.04);
        }

        .cover {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 16 / 10;
          background: #f0f0f1;
          overflow: hidden;
        }

        .cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .placeholder {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          font-size: 36px;
        }

        .badge {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 2;
          border-radius: 999px;
          padding: 6px 9px;
          background: rgba(17, 17, 17, 0.86);
          color: white;
          font-size: 10px;
          font-weight: 950;
          backdrop-filter: blur(7px);
        }

        .badge.submitted {
          background: rgba(180, 115, 0, 0.92);
        }

        .badge.approved {
          background: rgba(22, 121, 73, 0.94);
        }

        .badge.rejected {
          background: rgba(172, 37, 37, 0.94);
        }

        .body {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 15px;
          min-height: 230px;
        }

        h2 {
          margin: 0;
          min-height: 46px;
          font-size: 18px;
          line-height: 1.28;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .meta {
          margin-top: 11px;
          min-height: 65px;
          display: grid;
          gap: 4px;
          align-content: start;
          color: #65656a;
          font-size: 12px;
        }

        .date {
          margin-top: 10px;
          color: #999;
          font-size: 11px;
        }

        .reason {
          margin-top: 10px;
          border-radius: 9px;
          background: #fff2f2;
          color: #9e2f2f;
          padding: 8px 9px;
          font-size: 11px;
          line-height: 1.4;
        }

        .actions {
          margin-top: auto;
          padding-top: 15px;
          display: grid;
          grid-template-columns: auto 1fr 34px;
          gap: 7px;
          align-items: stretch;
        }

        .actions a,
        .actions button {
          min-height: 36px;
          border-radius: 9px;
          font: inherit;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }

        .secondary {
          display: grid;
          place-items: center;
          padding: 0 11px;
          border: 1px solid #dedee2;
          color: #222;
          text-decoration: none;
        }

        .submit {
          border: 0;
          background: #7a0d24;
          color: white;
          padding: 0 10px;
        }

        .submit:disabled {
          opacity: 0.48;
          cursor: default;
        }

        .delete {
          border: 1px solid #ebdadd;
          background: white;
          color: #9d1d36;
          font-size: 18px !important;
        }

        .empty {
          min-height: 210px;
          background: white;
          border: 1px dashed #d8d8dc;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #777;
          text-align: center;
          padding: 24px;
        }

        .empty strong {
          color: #333;
        }

        @media (max-width: 1180px) {
          .grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 820px) {
          .page {
            padding: 22px 16px 60px;
          }

          .layout {
            grid-template-columns: 1fr;
          }

          .filters {
            position: static;
          }

          .grid {
            grid-template-columns: 1fr;
          }

          .topbar {
            align-items: stretch;
          }

          .create {
            text-align: center;
          }
        }
      `}</style>
    </main>
  );
}
