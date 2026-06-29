"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Session = {
  id: string;
  title: string;
  theme: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  pdf_url: string | null;
};

export default function MesSeancesPage() {
  const supabase = createClient();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSessions([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("practice_sessions")
      .select("*")
      .eq("owner_id", user.id)
      .eq("visibility", "private")
      .order("session_date", { ascending: false });

    if (error) console.error(error);

    setSessions((data ?? []) as Session[]);
    setLoading(false);
  }

  async function deleteSession(id: string) {
    const ok = confirm("Supprimer cette séance ?");
    if (!ok) return;

    const { error } = await supabase
      .from("practice_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Erreur suppression séance.");
      return;
    }

    setSessions((prev) => prev.filter((session) => session.id !== id));
  }

  function formatDate(date: string | null) {
    if (!date) return "Date non définie";

    return new Date(date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  if (loading) {
    return <main className="page">Chargement...</main>;
  }

  return (
    <main className="page">
      <section className="hero">
        <h1>MES SÉANCES</h1>
        <p>Toutes tes séances privées, générées depuis ta fiche séance.</p>

        <Link href="/panier" className="createBtn">
          + Construire une séance
        </Link>
      </section>

      {sessions.length === 0 ? (
        <div className="empty">Aucune séance privée pour le moment.</div>
      ) : (
        <section className="grid">
          {sessions.map((session) => (
            <article key={session.id} className="card">
              <div className="content">
                <span className="date">{formatDate(session.session_date)}</span>

                <h2>{session.title}</h2>

                <p>
                  <strong>Thème :</strong> {session.theme || "—"}
                </p>

                <p>
                  <strong>Horaire :</strong>{" "}
                  {session.start_time?.slice(0, 5) || "—"} -{" "}
                  {session.end_time?.slice(0, 5) || "—"}
                </p>

                <p>
                  <strong>Lieu :</strong> {session.location || "—"}
                </p>

                <div className="actions">
                  <Link href={`/seances/${session.id}`}>Voir</Link>

                  {session.pdf_url ? (
                    <a href={session.pdf_url} target="_blank">
                      PDF
                    </a>
                  ) : (
                    <Link href={`/seances/${session.id}`}>PDF</Link>
                  )}

                  <button type="button" onClick={() => deleteSession(session.id)}>
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
          min-height: 100vh;
          background: #fff;
          padding: 44px 56px 80px;
          color: #111;
        }

        .hero {
          text-align: center;
          margin-bottom: 34px;
        }

        .hero h1 {
          margin: 0;
          color: #7a0d24;
          font-size: 46px;
          font-family: Oswald, Roboto, sans-serif;
        }

        .hero p {
          color: #666;
          margin-bottom: 22px;
        }

        .createBtn {
          display: inline-flex;
          height: 48px;
          padding: 0 24px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #7a0d24;
          color: white;
          text-decoration: none;
          font-weight: 900;
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
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.07);
          overflow: hidden;
        }

        .content {
          padding: 20px;
        }

        .date {
          display: inline-flex;
          background: #f6eadc;
          color: #7a0d24;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
          margin-bottom: 14px;
        }

        h2 {
          margin: 0 0 14px;
          font-family: Oswald, Roboto, sans-serif;
          color: #111;
        }

        p {
          color: #555;
          margin: 8px 0;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-top: 18px;
        }

        .actions a,
        .actions button {
          height: 40px;
          border: none;
          border-radius: 8px;
          font-weight: 900;
          cursor: pointer;
          text-decoration: none;
          display: grid;
          place-items: center;
          font-size: 13px;
        }

        .actions a:first-child {
          background: #7a0d24;
          color: white;
        }

        .actions a:nth-child(2) {
          background: #d4a24c;
          color: #111;
        }

        .actions button {
          background: #ffe8ec;
          color: #c5283d;
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