"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AttendanceStatus = "present" | "absent" | "late" | "injured" | "excused";

type Attendance = {
  id: string;
  session_id: string;
  player_id: string | null;
  first_name: string | null;
  last_name: string | null;
  status: AttendanceStatus;
  comment: string | null;
};

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Présent" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Retard" },
  { value: "injured", label: "Blessé" },
  { value: "excused", label: "Excusé" },
];

export default function SessionPresencesPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;

  const [items, setItems] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  const totals = useMemo(() => {
    return {
      present: items.filter((item) => item.status === "present").length,
      absent: items.filter((item) => item.status === "absent").length,
      late: items.filter((item) => item.status === "late").length,
      injured: items.filter((item) => item.status === "injured").length,
      excused: items.filter((item) => item.status === "excused").length,
      total: items.length,
    };
  }, [items]);

  useEffect(() => {
    if (!sessionId) return;
    loadAttendance(sessionId);
  }, [sessionId]);

  async function loadAttendance(id: string) {
    setLoading(true);

    const { data, error } = await supabase
      .from("practice_session_attendance")
      .select("*")
      .eq("session_id", id)
      .order("last_name", { ascending: true });

    if (error) {
      console.error(error);
      setItems([]);
      setLoading(false);
      return;
    }

    setItems((data ?? []) as Attendance[]);
    setLoading(false);
  }

  async function updateStatus(id: string, status: AttendanceStatus) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );

    const { error } = await supabase
      .from("practice_session_attendance")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error(error);
      if (sessionId) loadAttendance(sessionId);
    }
  }

  async function updateComment(id: string, comment: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, comment } : item))
    );

    const { error } = await supabase
      .from("practice_session_attendance")
      .update({
        comment,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error(error);
      if (sessionId) loadAttendance(sessionId);
    }
  }

  function fullName(item: Attendance) {
    return `${item.first_name ?? ""} ${item.last_name ?? ""}`.trim();
  }

  if (loading) {
    return <main className="page">Chargement...</main>;
  }

  return (
    <main className="page">
      <div className="topbar">
        <button
          type="button"
          onClick={() => router.push(`/seances/${sessionId}`)}
        >
          ← Retour séance
        </button>
      </div>

      <section className="hero">
        <h1>PRÉSENCES</h1>
        <p>Valide les présences, absences, retards, blessures et commentaires.</p>
      </section>

      <section className="stats">
        <div>
          <strong>{totals.total}</strong>
          <span>Joueurs</span>
        </div>

        <div>
          <strong>{totals.present}</strong>
          <span>Présents</span>
        </div>

        <div>
          <strong>{totals.absent}</strong>
          <span>Absents</span>
        </div>

        <div>
          <strong>{totals.late}</strong>
          <span>Retards</span>
        </div>

        <div>
          <strong>{totals.injured}</strong>
          <span>Blessés</span>
        </div>

        <div>
          <strong>{totals.excused}</strong>
          <span>Excusés</span>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="empty">Aucun joueur associé à cette séance.</div>
      ) : (
        <section className="list">
          {items.map((item) => (
            <article key={item.id} className="row">
              <div>
                <h2>{fullName(item) || "Joueur"}</h2>
              </div>

              <select
                value={item.status}
                onChange={(event) =>
                  updateStatus(item.id, event.target.value as AttendanceStatus)
                }
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                value={item.comment ?? ""}
                placeholder="Commentaire..."
                onChange={(event) => updateComment(item.id, event.target.value)}
              />
            </article>
          ))}
        </section>
      )}

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #fff;
          color: #111;
          padding: 36px 56px 80px;
        }

        .topbar {
          margin-bottom: 22px;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 10px 16px;
          background: #f6eadc;
          color: #7a0d24;
          font-weight: 900;
          cursor: pointer;
        }

        .hero {
          text-align: center;
          margin-bottom: 30px;
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

        .stats {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 12px;
          margin-bottom: 28px;
        }

        .stats div {
          border: 1px solid #eee;
          border-radius: 14px;
          padding: 16px;
          text-align: center;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.05);
        }

        .stats strong {
          display: block;
          color: #7a0d24;
          font-size: 28px;
          font-family: Oswald, Roboto, sans-serif;
        }

        .stats span {
          color: #666;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .empty {
          border: 1px dashed #ddd;
          border-radius: 14px;
          padding: 48px;
          text-align: center;
          color: #777;
        }

        .list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .row {
          display: grid;
          grid-template-columns: 1fr 180px 1.5fr;
          gap: 14px;
          align-items: center;
          border: 1px solid #eee;
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
        }

        h2 {
          margin: 0;
          font-size: 20px;
          font-family: Oswald, Roboto, sans-serif;
        }

        select,
        input {
          height: 42px;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 0 12px;
          background: white;
        }

        @media (max-width: 1000px) {
          .page {
            padding: 28px 20px 80px;
          }

          .stats {
            grid-template-columns: repeat(2, 1fr);
          }

          .row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}