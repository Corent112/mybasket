"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { listExercises } from "@/lib/exercises";
import { createClient } from "@/lib/supabase/client";
import { addExerciseToCart } from "@/lib/session-quick-add";
import type { Exercise } from "@/types/exercise";

type SortKey = "recent" | "alpha";
type ToastState = { message: string; exerciseTitle?: string } | null;

const CATEGORY_OPTIONS = ["U9", "U11", "U13", "U15", "U18", "U21", "Senior"];

const THEME_OPTIONS = [
  "Fondamentaux individuel",
  "Fondamentaux pré collectif",
  "Collectif",
  "Défense",
  "Surnombre",
  "Jeu rapide",
  "Repli",
  "Rebond",
  "Physique",
  "Adresse",
];

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
  isAdding,
  isAdded,
  onAdd,
}: {
  item: Exercise;
  isConnected: boolean;
  isAdding: boolean;
  isAdded: boolean;
  onAdd: (exercise: Exercise) => void;
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

        {isConnected && (
          <button
            type="button"
            className={`mb-quick-add ${isAdded ? "is-added" : ""}`}
            disabled={isAdding || isAdded}
            onClick={() => onAdd(item)}
          >
            {isAdding ? "Ajout..." : isAdded ? "✓ Ajouté" : "+ Ajouter"}
          </button>
        )}

        {item.contributor_name && (
          <div className="mb-contributor" title={`Réalisé par ${item.contributor_name}`}>
            {item.contributor_avatar_url ? (
              <img src={item.contributor_avatar_url} alt="" />
            ) : (
              <span className="mb-contributor-fallback">{item.contributor_name.slice(0, 1).toUpperCase()}</span>
            )}
            <span>Réalisé par <strong>{item.contributor_name}</strong></span>
          </div>
        )}

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
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [addingExerciseId, setAddingExerciseId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await listExercises();
        setItems(data);

        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        setUser(currentUser);

        if (currentUser) {
          const { data: cartRows } = await supabase
            .from("cart_items")
            .select("item_id")
            .eq("user_id", currentUser.id)
            .eq("item_type", "exercise");
(cartRows ?? []).map((row: { item_id: string | null }) => String(row.item_id || ""))        }
      } catch (error) {
        console.error("Erreur chargement exercices :", error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [supabase]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const options = useMemo(() => {
    const sets: Record<string, Set<string>> = {};

    for (const f of FILTERS) sets[f.key] = new Set();

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
          : f.key === "theme"
            ? THEME_OPTIONS
            : Array.from(sets[f.key]).sort((a, b) => a.localeCompare(b, "fr")),
      ])
    ) as Record<string, string[]>;
  }, [items]);

  function toggleFilter(key: string, value: string) {
    setSelected((prev) => {
      const current = prev[key] ?? [];
      return {
        ...prev,
        [key]: current.includes(value)
          ? current.filter((entry) => entry !== value)
          : [...current, value],
      };
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return [...items]
      .filter((item) => {
        for (const f of FILTERS) {
          const values = selected[f.key] ?? [];
          if (values.length && !values.includes(getField(item, f.key))) return false;
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
        if (sort === "alpha") return (a.title || "").localeCompare(b.title || "", "fr");
        return Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0);
      });
  }, [items, search, sort, selected]);

  async function handleAdd(exercise: Exercise) {
    if (!user) return;

    setAddingExerciseId(exercise.id);
    try {
      const result = await addExerciseToCart(supabase, user, exercise);
      setAddedIds((current) => new Set(current).add(exercise.id));
      setToast({
        message: result.added ? "Exercice ajouté au panier" : "Cet exercice est déjà dans le panier",
        exerciseTitle: exercise.title,
      });
    } catch (error) {
      console.error("Erreur ajout panier :", error);
      alert(error instanceof Error ? error.message : "Impossible d’ajouter l’exercice au panier.");
    } finally {
      setAddingExerciseId(null);
    }
  }

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
                    options[f.key].map((option) => (
                      <label key={option}>
                        <input
                          type="checkbox"
                          checked={(selected[f.key] ?? []).includes(option)}
                          onChange={() => toggleFilter(f.key, option)}
                        />
                        {option}
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
                  : `${filtered.length} exercice${filtered.length > 1 ? "s" : ""}`}
              </div>

              <div className="list-actions">
                <Link
                  href={user ? "/exercices/creer" : "/abonnements"}
                  className="btn btn-black"
                >
                  {user ? "+ Créer un exercice" : "Débloquer les exercices"}
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
                    isConnected={Boolean(user)}
                    isAdding={addingExerciseId === item.id}
                    isAdded={addedIds.has(item.id)}
                    onAdd={handleAdd}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {toast && (
        <div className="mb-toast">
          <div>✓</div>
          <span>
            <strong>{toast.message}</strong>
            {toast.exerciseTitle && <small>{toast.exerciseTitle}</small>}
          </span>
          <Link href="/panier">Voir le panier</Link>
        </div>
      )}

      <style jsx global>{`
        .mb-exercises-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 270px));
          gap: 1.4rem;
          align-items: stretch;
          grid-auto-rows: 1fr;
        }
        .mb-exercise-card {
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          background: #fff;
          border: 1.5px solid #cfcfcf;
          border-radius: 14px;
          overflow: hidden;
          padding: 12px;
          box-shadow: 0 6px 18px rgba(0,0,0,.04);
        }
        .mb-exercise-cover { display:flex; align-items:center; justify-content:center; width:100%; height:190px; background:#fff; overflow:hidden; text-decoration:none; }
        .mb-exercise-cover img { width:100%; height:100%; object-fit:contain; display:block; }
        .mb-exercise-placeholder { width:100%; height:100%; background:#f5f5f5; display:flex; align-items:center; justify-content:center; font-size:2.4rem; }
        .mb-exercise-body { padding-top:4px; }
        .mb-exercise-title { width:100%; margin:0 0 12px; text-align:center!important; font-size:1.55rem; line-height:1; font-weight:1000; text-transform:uppercase; }
        .mb-exercise-title a { display:block; color:#111; text-align:center!important; text-decoration:none; }
        .mb-exercise-details { display:flex; flex-direction:column; gap:3px; margin-top:4px; }
        .mb-exercise-details div { font-size:.92rem; line-height:1.15; font-weight:500; color:#111; }
        .mb-exercise-details div:first-child { color:#6b1a2c; font-weight:700; }
        .mb-exercise-details div:last-child { color:#666; }
        .mb-quick-add { width:100%; min-height:40px; margin-top:14px; border:0; border-radius:9px; background:#6b1a2c; color:#fff; font-weight:900; cursor:pointer; transition:.18s ease; }
        .mb-quick-add:hover:not(:disabled) { transform:translateY(-1px); background:#4b101e; }
        .mb-quick-add.is-added { background:#17834a; }
        .mb-contributor { display:flex; align-items:center; gap:7px; margin-top:12px; padding-top:10px; border-top:1px solid #eee; min-width:0; color:#555; font-size:.74rem; line-height:1.15; }
        .mb-contributor img, .mb-contributor-fallback { width:24px; height:24px; border-radius:50%; flex:0 0 24px; object-fit:cover; border:1px solid rgba(107,26,44,.18); background:#f4ecef; color:#6b1a2c; display:flex; align-items:center; justify-content:center; font-weight:900; }
        .mb-contributor span:last-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .mb-contributor strong { color:#222; font-weight:850; }
        .mb-quick-add:disabled { cursor:default; opacity:.86; }
        .mb-exercise-foot { margin-top:12px; padding-top:10px; border-top:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:.82rem; color:#777; font-weight:600; }
        .mb-exercise-foot a { color:#666; font-weight:800; text-decoration:none; }
        .mb-modal-backdrop { position:fixed; inset:0; z-index:10000; display:grid; place-items:center; padding:20px; background:rgba(17,12,14,.62); backdrop-filter:blur(5px); }
        .mb-session-modal { position:relative; width:min(650px,100%); max-height:min(760px,90vh); overflow:auto; padding:28px; border-radius:20px; background:#fff; box-shadow:0 28px 80px rgba(0,0,0,.28); }
        .mb-modal-close { position:absolute; top:14px; right:14px; width:36px; height:36px; border:0; border-radius:50%; background:#f3eded; color:#6b1a2c; font-size:24px; cursor:pointer; }
        .mb-modal-kicker { color:#d4a24c; font-size:.72rem; font-weight:950; letter-spacing:.14em; }
        .mb-session-modal h2 { margin:6px 0 4px; color:#6b1a2c; font-size:1.75rem; }
        .mb-session-modal > p { margin:0 0 18px; color:#71666a; }
        .mb-session-list { display:grid; gap:9px; }
        .mb-session-choice { position:relative; display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:stretch; border:1px solid #e6dcda; border-radius:12px; background:#fff; overflow:hidden; }
        .mb-session-choice:hover { border-color:#d4a24c; background:#fffaf1; }
        .mb-session-add { min-width:0; display:flex; justify-content:space-between; align-items:center; gap:16px; padding:14px 16px; border:0; background:transparent; text-align:left; cursor:pointer; }
        .mb-session-add span { min-width:0; display:grid; gap:4px; }
        .mb-session-add strong { overflow:hidden; color:#231b1e; text-overflow:ellipsis; white-space:nowrap; }
        .mb-session-add small { color:#85797d; }
        .mb-session-add b { color:#6b1a2c; white-space:nowrap; }
        .mb-session-edit { display:flex; align-items:center; justify-content:center; padding:0 12px; border-left:1px solid #eee5e2; color:#6b1a2c; font-size:.76rem; font-weight:900; text-decoration:none; }
        .mb-session-edit:hover { background:#f8efef; }
        .mb-session-delete { width:42px; border:0; border-left:1px solid #eee5e2; background:#fff5f5; color:#c6283d; font-size:22px; font-weight:900; cursor:pointer; }
        .mb-session-delete:hover { background:#c6283d; color:#fff; }
        .mb-no-session { padding:18px; border:1px dashed #d7cbca; border-radius:12px; text-align:center; color:#85797d; }
        .mb-new-session { margin-top:20px; padding-top:18px; border-top:1px solid #eee5e2; }
        .mb-new-session label { display:block; margin-bottom:8px; font-size:.78rem; color:#675a5f; font-weight:900; text-transform:uppercase; }
        .mb-new-session > div { display:flex; gap:8px; }
        .mb-new-session input { flex:1; min-width:0; height:44px; padding:0 12px; border:1px solid #d9cfcc; border-radius:10px; font:inherit; }
        .mb-new-session button { min-height:44px; padding:0 16px; border:0; border-radius:10px; background:#111; color:#fff; font-weight:900; cursor:pointer; }
        .mb-session-dock { position:fixed; left:50%; bottom:18px; z-index:9000; transform:translateX(-50%); width:min(760px,calc(100% - 28px)); display:grid; grid-template-columns:auto 1fr auto auto auto auto; align-items:center; gap:14px; padding:13px 16px; border:1px solid rgba(212,162,76,.55); border-radius:16px; background:linear-gradient(110deg,#25161b,#6b1a2c); color:#fff; box-shadow:0 18px 50px rgba(38,10,19,.3); }
        .mb-dock-icon { width:42px; height:42px; display:grid; place-items:center; border-radius:12px; background:rgba(255,255,255,.11); }
        .mb-dock-copy { display:grid; min-width:0; }
        .mb-dock-copy span { color:#d4a24c; font-size:.62rem; font-weight:950; letter-spacing:.14em; }
        .mb-dock-copy strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .mb-dock-count { display:grid; place-items:center; min-width:72px; }
        .mb-dock-count b { font-size:1.15rem; }
        .mb-dock-count span { font-size:.68rem; opacity:.75; }
        .mb-session-dock a { min-height:38px; display:flex; align-items:center; padding:0 14px; border-radius:9px; background:#d4a24c; color:#1a1114; font-size:.78rem; font-weight:950; text-decoration:none; }
        .mb-session-dock > button { border:0; color:#fff; background:transparent; font-size:.74rem; font-weight:800; cursor:pointer; }

        .mb-dock-primary { background:#d4a24c!important; color:#211315!important; border-color:#d4a24c!important; }
        .mb-dock-reset { background:#fff!important; color:#a51d35!important; border:1px solid #d7b0b8!important; }
        .mb-dock-reset:hover { background:#fff0f2!important; }

        .mb-toast { position:fixed; right:22px; bottom:100px; z-index:10020; min-width:290px; display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; padding:13px 15px; border-radius:13px; background:#fff; box-shadow:0 15px 45px rgba(0,0,0,.19); border-left:5px solid #17834a; }
        .mb-toast > div { width:34px; height:34px; display:grid; place-items:center; border-radius:50%; background:#e3f6eb; color:#17834a; font-weight:950; }
        .mb-toast span { display:grid; }
        .mb-toast small { color:#817579; }
        .mb-toast a { color:#6b1a2c; font-weight:900; text-decoration:none; }
        .has-session-dock { padding-bottom:100px; }
        @media (max-width:700px) {
          .mb-session-dock { grid-template-columns:auto 1fr auto; }
          .mb-session-dock a { grid-column:1 / -1; justify-content:center; }
          .mb-session-dock > button { position:absolute; right:10px; top:8px; }
          .mb-dock-count { display:none; }
          .mb-new-session > div { flex-direction:column; }
  
        .mb-dock-primary { background:#d4a24c!important; color:#211315!important; border-color:#d4a24c!important; }
        .mb-dock-reset { background:#fff!important; color:#a51d35!important; border:1px solid #d7b0b8!important; }
        .mb-dock-reset:hover { background:#fff0f2!important; }

        .mb-toast { left:14px; right:14px; bottom:125px; min-width:0; }
        }
      `}</style>
    </main>
  );
}
