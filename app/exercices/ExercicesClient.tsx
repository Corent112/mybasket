"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listExercises } from "@/lib/exercises";
import type { Exercise } from "@/types/exercise";

type SortKey = "recent" | "alpha";

const CATEGORY_OPTIONS = ["U9", "U11", "U13", "U15", "U18", "U21", "Senior"];

const FILTERS = [
  { key: "theme", label: "THÈMES" },
  { key: "category", label: "CATÉGORIE" },
  { key: "level", label: "NIVEAU" },
] as const;

function getField(item: Exercise, key: string): string {
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

function ExerciseCard({
  item,
  isConnected,
}: {
  item: Exercise;
  isConnected: boolean;
}) {
  const thumbnail =
    item.diagrams?.[0]?.imageUrl ||
    item.schemaImages?.[0] ||
    item.images?.[0] ||
    "";

  const detailHref = isConnected ? `/exercices/${item.id}` : "/abonnements";

  return (
    <article className="mb-exercise-card">
      <Link href={detailHref} className="mb-exercise-cover">
        {thumbnail ? (
          <img src={thumbnail} alt={item.title || "Exercice"} />
        ) : (
          <div className="mb-exercise-placeholder">🏀</div>
        )}
      </Link>

      <div className="mb-exercise-body">
        <h3 className="mb-exercise-title">
          <Link href={detailHref}>{item.title || "Exercice sans titre"}</Link>
        </h3>

        <div className="mb-exercise-details">
          <div>{item.type || "Type non défini"}</div>
          <div>{item.theme || "Thème non défini"}</div>
          <div>{item.category || "Sans catégorie"}</div>
          <div>{item.level || "Niveau non défini"}</div>
        </div>

        <div className="mb-exercise-foot">
          <span>{formatDate(item.createdAt)}</span>

          {isConnected ? (
            <Link href={`/exercices/creer?id=${item.id}`}>Modifier</Link>
          ) : (
            <Link href="/abonnements">Débloquer</Link>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ExercicesClient() {
  const [items, setItems] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await listExercises();
        setItems(data);

        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        setIsConnected(Boolean(user));
      } catch (error) {
        console.error("Erreur chargement exercices :", error);
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
        f.key === "category"
          ? CATEGORY_OPTIONS
          : Array.from(sets[f.key]).sort((a, b) => a.localeCompare(b, "fr")),
      ])
    ) as Record<string, string[]>;
  }, [items]);

  function toggleFilter(key: string, value: string) {
    setSelected((prev) => {
      const current = prev[key] ?? [];

      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];

      return {
        ...prev,
        [key]: next,
      };
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return [...items]
      .filter((item) => {
        for (const f of FILTERS) {
          const sel = selected[f.key] ?? [];

          if (sel.length && !sel.includes(getField(item, f.key))) {
            return false;
          }
        }

        if (!q) return true;

        return [
          item.title,
          item.description,
          item.category,
          item.level ?? "",
          item.theme ?? "",
          item.type ?? "",
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

        const dateA = Number(a.createdAt ?? 0);
        const dateB = Number(b.createdAt ?? 0);

        return dateB - dateA;
      });
  }, [items, search, sort, selected]);

  return (
    <main>
      <div className="page-banner">
        <img src="/images/bandeau-exercices.png" alt="MyBasket Exercices" />
      </div>

      <div className="container">
        <div className="section-title-bar">
          <h2>EXERCICES</h2>
        </div>

        <p className="section-subtitle">
          Recherche, filtre et découvre les exercices MyBasket.
        </p>

        <div className="list-layout">
          <aside className="filters">
            <input
              className="filter-search"
              placeholder="Rechercher un exercice..."
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
                  : `${filtered.length} exercice${
                      filtered.length > 1 ? "s" : ""
                    }`}
              </div>

              <div className="list-actions">
                <Link
                  href={isConnected ? "/exercices/creer" : "/abonnements"}
                  className="btn btn-black"
                >
                  {isConnected ? "+ Créer un exercice" : "Débloquer les exercices"}
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
              <p className="empty-state">Chargement des exercices...</p>
            ) : filtered.length === 0 ? (
              <p className="empty-state">Aucun exercice trouvé.</p>
            ) : (
              <div className="mb-exercises-grid">
                {filtered.map((item) => (
                  <ExerciseCard
                    key={item.id}
                    item={item}
                    isConnected={isConnected}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <style jsx global>{`
        .mb-exercises-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 270px));
          gap: 1.4rem;
          align-items: start;
        }

        .mb-exercise-card {
          width: 100%;
          background: #fff;
          border: 1.5px solid #cfcfcf;
          border-radius: 14px;
          overflow: hidden;
          padding: 12px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
        }

        .mb-exercise-cover {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 190px;
          background: #fff;
          overflow: hidden;
          text-decoration: none;
        }

        .mb-exercise-cover img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }

        .mb-exercise-placeholder {
          width: 100%;
          height: 100%;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.4rem;
        }

        .mb-exercise-body {
          padding-top: 4px;
        }

        .mb-exercise-title {
          width: 100%;
          margin: 0 0 12px;
          text-align: center !important;
          font-size: 1.55rem;
          line-height: 1;
          font-weight: 1000;
          text-transform: uppercase;
        }

        .mb-exercise-title a {
          display: block;
          width: 100%;
          color: #111;
          text-align: center !important;
          text-decoration: none;
        }

        .mb-exercise-details {
          display: flex;
          flex-direction: column;
          gap: 3px;
          margin-top: 4px;
        }

        .mb-exercise-details div {
          font-size: 0.92rem;
          line-height: 1.15;
          font-weight: 500;
          color: #111;
        }

        .mb-exercise-details div:first-child {
          color: #6b1a2c;
          font-weight: 700;
        }

        .mb-exercise-details div:last-child {
          color: #666;
        }

        .mb-exercise-foot {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          font-size: 0.82rem;
          color: #777;
          font-weight: 600;
        }

        .mb-exercise-foot a {
          color: #666;
          font-weight: 800;
          text-decoration: none;
        }

        .mb-exercise-foot a:hover {
          color: #6b1a2c;
          text-decoration: underline;
        }
      `}</style>
    </main>
  );
}