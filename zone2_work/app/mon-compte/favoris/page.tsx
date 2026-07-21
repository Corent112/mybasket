"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Favorite = {
  id: string;
  item_type: "exercise" | "system" | "session";
  item_id: string;
  title: string | null;
  image_url: string | null;
};

const TABS = [
  { key: "exercise", label: "Exercices" },
  { key: "system", label: "Systèmes" },
  { key: "session", label: "Séances" },
] as const;

export default function FavorisPage() {
  const supabase = createClient();

  const [items, setItems] = useState<Favorite[]>([]);
  const [active, setActive] = useState<Favorite["item_type"]>("exercise");

  useEffect(() => {
    loadFavorites();
  }, []);

  async function loadFavorites() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("favorites")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setItems((data ?? []) as Favorite[]);
  }

  async function removeFavorite(id: string) {
    await supabase.from("favorites").delete().eq("id", id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function getHref(item: Favorite) {
    if (item.item_type === "exercise") return `/exercices/${item.item_id}`;
    if (item.item_type === "system") return `/systemes/${item.item_id}`;
    return `/seances/${item.item_id}`;
  }

  const filtered = items.filter((item) => item.item_type === active);

  return (
    <main className="page">
      <section className="hero">
        <h1>MES FAVORIS</h1>
        <p>Retrouve tes exercices, systèmes et séances préférés.</p>
      </section>

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={active === tab.key ? "active" : ""}
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">Aucun favori dans cette rubrique.</div>
      ) : (
        <section className="grid">
          {filtered.map((item) => (
            <article key={item.id} className="card">
              <Link href={getHref(item)} className="cover">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title ?? "Favori"} />
                ) : (
                  <span>⭐</span>
                )}
              </Link>

              <div className="body">
                <h2>{item.title || "Sans titre"}</h2>

                <div className="actions">
                  <Link href={getHref(item)}>Ouvrir</Link>

                  <button onClick={() => removeFavorite(item.id)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      <style jsx>{`
        .page {
          background: #fff;
          min-height: 100vh;
          padding: 44px 56px 80px;
          color: #111;
        }

        .hero {
          text-align: center;
          margin-bottom: 32px;
        }

        .hero h1 {
          margin: 0;
          color: #7a0d24;
          font-size: 46px;
          font-family: Oswald, Roboto, sans-serif;
        }

        .hero p {
          color: #666;
        }

        .tabs {
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 32px;
        }

        .tabs button {
          border: 1px solid #d4a24c;
          background: white;
          color: #7a0d24;
          border-radius: 999px;
          padding: 12px 22px;
          font-weight: 900;
          cursor: pointer;
        }

        .tabs button.active {
          background: #7a0d24;
          color: white;
          border-color: #7a0d24;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
        }

        .card {
          border: 1px solid #eee;
          border-radius: 16px;
          background: white;
          overflow: hidden;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.07);
        }

        .cover {
          height: 190px;
          display: grid;
          place-items: center;
          background: #f6f6f6;
          text-decoration: none;
          color: #d4a24c;
          font-size: 42px;
        }

        .cover img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .body {
          padding: 18px;
        }

        .body h2 {
          margin: 0 0 16px;
          font-family: Oswald, Roboto, sans-serif;
          color: #111;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .actions a,
        .actions button {
          height: 42px;
          border: none;
          border-radius: 8px;
          font-weight: 900;
          cursor: pointer;
          text-decoration: none;
          display: grid;
          place-items: center;
        }

        .actions a {
          background: #7a0d24;
          color: white;
        }

        .actions button {
          background: #f6eadc;
          color: #7a0d24;
        }

        .empty {
          border: 1px dashed #ddd;
          border-radius: 14px;
          padding: 50px;
          text-align: center;
          color: #777;
        }

        @media (max-width: 1000px) {
          .page {
            padding: 28px 20px 80px;
          }

          .grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}