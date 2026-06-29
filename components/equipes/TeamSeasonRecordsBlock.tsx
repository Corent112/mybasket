"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MatchRow = {
  id: string;
  opponent: string | null;
  match_date: string | null;
  us_score: number | null;
  them_score: number | null;
  home: boolean | null;
};

type StatRow = {
  match_id: string | null;
  pts: number | null;
  p3m: number | null;
  off_reb: number | null;
  def_reb: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  present: boolean | null;
};

type RecordLine = {
  label: string;
  value: number;
  opponent: string;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function emptyRecord(label: string): RecordLine {
  return { label, value: 0, opponent: "—" };
}

export default function TeamSeasonRecordsBlock({ teamId }: { teamId: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [rows, setRows] = useState<StatRow[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const { data: matchData, error: matchError } = await supabase
        .from("match_stats")
        .select("id, opponent, match_date, us_score, them_score, home")
        .eq("team_id", teamId)
        .order("match_date", { ascending: false });

      if (!active) return;

      if (matchError) {
        console.error("Erreur records matchs :", matchError);
        setMatches([]);
        setRows([]);
        setLoading(false);
        return;
      }

      const matchRows = (matchData ?? []) as MatchRow[];
      setMatches(matchRows);

      const matchIds = matchRows.map((m) => m.id);

      if (matchIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: statData, error: statError } = await supabase
        .from("match_player_stats")
        .select("match_id, pts, p3m, off_reb, def_reb, reb, ast, stl, present")
        .in("match_id", matchIds);

      if (!active) return;

      if (statError) {
        console.error("Erreur records stats :", statError);
        setRows([]);
      } else {
        setRows(((statData ?? []) as StatRow[]).filter((r) => r.present !== false));
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [supabase, teamId]);

  const records = useMemo(() => {
    const byMatch = matches.reduce((acc, match) => {
      acc[match.id] = {
        match,
        pts: n(match.us_score),
        diff: n(match.us_score) - n(match.them_score),
        reb: 0,
        ast: 0,
        p3m: 0,
        stl: 0,
      };

      return acc;
    }, {} as Record<string, { match: MatchRow; pts: number; diff: number; reb: number; ast: number; p3m: number; stl: number }>);

    rows.forEach((row) => {
      const matchId = String(row.match_id || "");
      const box = byMatch[matchId];
      if (!box) return;

      box.reb += n(row.reb) || n(row.off_reb) + n(row.def_reb);
      box.ast += n(row.ast);
      box.p3m += n(row.p3m);
      box.stl += n(row.stl);
    });

    const list = Object.values(byMatch);

    const best = (
      label: string,
      getter: (row: (typeof list)[number]) => number
    ): RecordLine => {
      const sorted = [...list].sort((a, b) => getter(b) - getter(a));
      const top = sorted[0];

      if (!top) return emptyRecord(label);

      return {
        label,
        value: getter(top),
        opponent: top.match.opponent || "Adversaire",
      };
    };

    return [
      best("Meilleur score", (row) => row.pts),
      best("Plus gros écart", (row) => row.diff),
      best("Plus de rebonds", (row) => row.reb),
      best("Plus de passes", (row) => row.ast),
      best("Plus de 3PTS", (row) => row.p3m),
      best("Plus d'interceptions", (row) => row.stl),
    ];
  }, [matches, rows]);

  return (
    <section className="tl-card records-card">
      <div className="block-head">
        <div>
          <p className="eyebrow">Records</p>
          <h2>Records de la saison</h2>
          <p className="muted">Les meilleures performances collectives.</p>
        </div>
      </div>

      {loading && <div className="empty">Chargement...</div>}

      {!loading && matches.length === 0 && (
        <div className="empty">Aucun record disponible pour le moment.</div>
      )}

      {!loading && matches.length > 0 && (
        <div className="records-grid">
          {records.map((record) => (
            <article key={record.label} className="record-box">
              <span>{record.label}</span>
              <strong>{record.value}</strong>
              <small>vs {record.opponent}</small>
            </article>
          ))}
        </div>
      )}

      <style jsx>{`
        .records-card {
          margin-top: 1.2rem;
        }

        .block-head {
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

        .empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 14px;
          padding: 1rem;
          color: #6b1a2c;
          font-weight: 900;
        }

        .records-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .record-box {
          border: 1px solid #efe6db;
          border-radius: 16px;
          background: linear-gradient(180deg, #fffdf9, #fff);
          padding: 0.95rem;
          min-height: 118px;
        }

        .record-box span {
          display: block;
          color: #9a8a82;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .record-box strong {
          display: block;
          color: #6b1a2c;
          font-size: 1.7rem;
          font-weight: 900;
          margin-top: 0.35rem;
        }

        .record-box small {
          display: block;
          color: #d4a24c;
          font-weight: 900;
          margin-top: 0.25rem;
        }

        @media (max-width: 1200px) {
          .records-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 700px) {
          .records-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
