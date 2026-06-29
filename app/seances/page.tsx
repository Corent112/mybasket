"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  listPublicSessions,
  type PracticeSession,
} from "@/lib/seances-supabase";

type SortKey = "recent" | "alpha";

function formatDate(date: string | null) {
  if (!date) return "—";

  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(time: string | null) {
  if (!time) return "—";
  return time.slice(0, 5);
}

function SeanceCard({
  item,
  isConnected,
}: {
  item: PracticeSession;
  isConnected: boolean;
}) {
  const detailHref = isConnected ? `/seances/${item.id}` : "/abonnements";

  return (
    <article className="mb-seance-card">
      <Link href={detailHref} className="mb-seance-cover">
        <div className="mb-seance-placeholder">🏀</div>
      </Link>

      <div className="mb-seance-body">
        <h3 className="mb-seance-title">
          <Link href={detailHref}>{item.title || "Séance sans titre"}</Link>
        </h3>

        <div className="mb-seance-details">
          <div>{item.theme || "Thème non défini"}</div>
          <div>{formatDate(item.session_date)}</div>
          <div>
            {formatTime(item.start_time)} - {formatTime(item.end_time)}
          </div>
        </div>

        <div className="mb-seance-foot">
          <span>{item.location || "Lieu non défini"}</span>
          <Link href={detailHref}>{isConnected ? "Voir" : "Débloquer"}</Link>
        </div>
      </div>
    </article>
  );
}

export default function SeancesPage() {
  const [items, setItems] = useState<PracticeSession[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setLoading(true);

      const data = await listPublicSessions();
      setItems(data);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setIsConnected(Boolean(user));
    } catch (error) {
      console.error("Erreur chargement séances :", error);
      setItems([]);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return [...items]
      .filter((item) => {
        if (!q) return true;

        return [
          item.title,
          item.theme,
          item.location,
          item.session_date,
          item.start_time,
          item.end_time,
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
          new Date(b.session_date || 0).getTime() -
          new Date(a.session_date || 0).getTime()
        );
      });
  }, [items, search, sort]);

  return (
    <main>
      <div className="page-banner">
        <img src="/images/bandeau-seance.png" alt="MyBasket Séances" />
      </div>

      <div className="container">
        <div className="section-title-bar">
          <h2>SÉANCES</h2>
        </div>

        <p className="section-subtitle">
          Retrouve les séances publiques publiées par MyBasket.
        </p>

        <div className="list-layout">
          <aside className="filters">
            <input
              className="filter-search"
              placeholder="Rechercher une séance..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="filter-group">
              <div className="filter-title">INFO</div>

              <p className="filter-help">
                Les séances créées par les coachs sont privées et disponibles
                dans leur espace personnel.
              </p>
            </div>
          </aside>

          <section>
            <div className="list-header">
              <div className="list-count">
                {loading
                  ? "Chargement..."
                  : `${filtered.length} séance${
                      filtered.length > 1 ? "s" : ""
                    } publique${filtered.length > 1 ? "s" : ""}`}
              </div>

              <div className="list-actions">
                <Link
                  href={isConnected ? "/panier" : "/abonnements"}
                  className="btn btn-black"
                >
                  {isConnected ? "+ Construire ma séance" : "Débloquer les séances"}
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
              <p className="empty-state">Chargement des séances...</p>
            ) : filtered.length === 0 ? (
              <p className="empty-state">Aucune séance publique trouvée.</p>
            ) : (
              <div className="mb-seances-grid">
                {filtered.map((item) => (
                  <SeanceCard
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
        .filter-help {
          color: #666;
          font-size: 0.92rem;
          line-height: 1.45;
          margin: 0;
        }

        .mb-seances-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 270px));
          gap: 1.4rem;
          align-items: start;
        }

        .mb-seance-card {
          width: 100%;
          background: #fff;
          border: 1.5px solid #cfcfcf;
          border-radius: 14px;
          overflow: hidden;
          padding: 12px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
        }

        .mb-seance-cover {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 190px;
          background: #fff;
          overflow: hidden;
          text-decoration: none;
        }

        .mb-seance-placeholder {
          width: 100%;
          height: 100%;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.4rem;
        }

        .mb-seance-body {
          padding-top: 4px;
        }

        .mb-seance-title {
          width: 100%;
          margin: 0 0 12px;
          text-align: center !important;
          font-size: 1.55rem;
          line-height: 1;
          font-weight: 1000;
          text-transform: uppercase;
        }

        .mb-seance-title a {
          display: block;
          width: 100%;
          color: #111;
          text-align: center !important;
          text-decoration: none;
        }

        .mb-seance-details {
          display: flex;
          flex-direction: column;
          gap: 3px;
          margin-top: 4px;
        }

        .mb-seance-details div {
          font-size: 0.92rem;
          line-height: 1.15;
          font-weight: 500;
          color: #111;
        }

        .mb-seance-details div:first-child {
          color: #6b1a2c;
          font-weight: 700;
        }

        .mb-seance-details div:last-child {
          color: #666;
        }

        .mb-seance-foot {
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

        .mb-seance-foot a {
          color: #666;
          font-weight: 800;
          text-decoration: none;
        }

        .mb-seance-foot a:hover {
          color: #6b1a2c;
          text-decoration: underline;
        }
      `}</style>
    </main>
  );
}