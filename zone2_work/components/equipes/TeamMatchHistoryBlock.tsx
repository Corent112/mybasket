"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MatchRow = {
  id: string;
  opponent: string | null;
  match_date: string | null;
  us_score: number | null;
  them_score: number | null;
  result: string | null;
  home: boolean | null;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function TeamMatchHistoryBlock({ teamId }: { teamId: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("match_stats")
        .select("id, opponent, match_date, us_score, them_score, result, home")
        .eq("team_id", teamId)
        .order("match_date", { ascending: false });

      if (!active) return;

      if (error) {
        console.error("Erreur historique fiche équipe :", error);
        setMatches([]);
      } else {
        setMatches((data ?? []) as MatchRow[]);
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [supabase, teamId]);

  const lastMatches = useMemo(() => matches.slice(0, 8), [matches]);

  return (
    <section className="tl-card history-card">
      <div className="block-head">
        <div>
          <p className="eyebrow">Calendrier</p>
          <h2>Historique des matchs</h2>
          <p className="muted">Derniers matchs liés à cette équipe.</p>
        </div>

        <span className="count">{matches.length} match{matches.length > 1 ? "s" : ""}</span>
      </div>

      {loading && <div className="empty">Chargement...</div>}

      {!loading && matches.length === 0 && (
        <div className="empty">Aucun match enregistré pour cette équipe.</div>
      )}

      {!loading && lastMatches.length > 0 && (
        <div className="match-grid">
          {lastMatches.map((match) => {
            const us = n(match.us_score);
            const them = n(match.them_score);
            const win = us > them;
            const loss = us < them;

            return (
              <article key={match.id} className={`match-card ${win ? "win" : loss ? "loss" : "draw"}`}>
                <div>
                  <p className="date">{formatDate(match.match_date)}</p>
                  <h3>{match.home === false ? "@" : "vs"} {match.opponent || "Adversaire"}</h3>
                  <span className="place">{match.home === false ? "Extérieur" : "Domicile"}</span>
                </div>

                <div className="score">
                  <strong>{us} - {them}</strong>
                  <span>{win ? "Victoire" : loss ? "Défaite" : "Nul"}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .history-card {
          margin-top: 1.2rem;
        }

        .block-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .eyebrow {
          margin: 0;
          color: #d4a24c;
          font-size: 0.78rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        h2 {
          margin: 0.2rem 0 0;
          color: #6b1a2c;
          font-size: 1.45rem;
          font-weight: 900;
        }

        .muted {
          margin: 0.25rem 0 0;
          color: #9a8a82;
          font-size: 0.92rem;
        }

        .count {
          display: inline-flex;
          border-radius: 999px;
          background: #fff8ef;
          color: #6b1a2c;
          border: 1px solid #eadccc;
          padding: 0.45rem 0.75rem;
          font-weight: 900;
          font-size: 0.8rem;
        }

        .empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 14px;
          padding: 1rem;
          color: #6b1a2c;
          font-weight: 900;
        }

        .match-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.8rem;
        }

        .match-card {
          border: 1px solid #efe6db;
          border-radius: 18px;
          background: #fffdf9;
          padding: 0.95rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          min-height: 145px;
        }

        .match-card.win {
          background: linear-gradient(180deg, #fbfefc, #fff);
        }

        .match-card.loss {
          background: linear-gradient(180deg, #fffdfd, #fff);
        }

        .date {
          margin: 0;
          color: #d4a24c;
          font-size: 0.75rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        h3 {
          margin: 0.25rem 0;
          color: #6b1a2c;
          font-size: 1rem;
          font-weight: 900;
        }

        .place {
          color: #9a8a82;
          font-size: 0.8rem;
          font-weight: 900;
        }

        .score strong {
          display: block;
          color: #1f171a;
          font-size: 1.55rem;
          font-weight: 900;
        }

        .score span {
          display: inline-flex;
          margin-top: 0.25rem;
          border-radius: 999px;
          background: #f5efe6;
          color: #6b1a2c;
          padding: 0.2rem 0.55rem;
          font-size: 0.75rem;
          font-weight: 900;
        }

        @media (max-width: 1100px) {
          .match-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 700px) {
          .block-head {
            flex-direction: column;
          }

          .match-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
