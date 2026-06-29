"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Player } from "@/types/player";

type Props = {
  teamId: string;
  players: Player[];
};

type StatRow = {
  player_id: string | null;
  pts: number | null;
  p2m: number | null;
  p2a: number | null;
  p3m: number | null;
  p3a: number | null;
  ftm: number | null;
  fta: number | null;
  off_reb: number | null;
  def_reb: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  turnovers: number | null;
  pf: number | null;
  present: boolean | null;
};

type LeaderLine = {
  playerId: string;
  name: string;
  games: number;
  pts: number;
  ast: number;
  reb: number;
  stl: number;
  p3m: number;
  p3a: number;
};

type Category = {
  key: "pts" | "ast" | "reb" | "p3pct" | "stl";
  title: string;
  icon: string;
  suffix?: string;
  type: "average" | "percent";
};

const CATEGORIES: Category[] = [
  { key: "pts", title: "Points", icon: "🏀", type: "average" },
  { key: "ast", title: "Passes", icon: "🎯", type: "average" },
  { key: "reb", title: "Rebonds", icon: "💪", type: "average" },
  { key: "p3pct", title: "% 3PTS", icon: "🔥", type: "percent", suffix: "%" },
  { key: "stl", title: "Interceptions", icon: "🖐️", type: "average" },
];

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

function playerDisplayName(player: Player) {
  const num = player.num != null ? `#${player.num} ` : "";
  return `${num}${player.firstName || ""} ${player.lastName || ""}`.trim() || "Joueur";
}

function getSupabasePlayerName(player: any) {
  const num = player?.num ?? player?.numero ?? player?.number ?? "";
  const first = player?.first_name ?? player?.firstName ?? player?.prenom ?? "";
  const last = player?.last_name ?? player?.lastName ?? player?.nom ?? "";
  const full = player?.name ?? player?.full_name ?? player?.fullName ?? "";

  return `${num ? `#${num} ` : ""}${full || `${first} ${last}`.trim() || "Joueur"}`;
}

function fallbackFromTeamPlayers(players: Player[]): LeaderLine[] {
  return players.map((player) => ({
    playerId: String(player.id),
    name: playerDisplayName(player),
    games: 1,
    pts: n(player.stats?.pts),
    ast: n(player.stats?.ast),
    reb: n(player.stats?.reb),
    stl: n(player.stats?.stl),
    p3m: n(player.stats?.pct3pts),
    p3a: n(player.stats?.pct3pts) > 0 ? 100 : 0,
  }));
}

function aggregateRows(rows: StatRow[], names: Record<string, string>): LeaderLine[] {
  const map: Record<string, LeaderLine> = {};

  rows
    .filter((row) => row.present !== false)
    .forEach((row) => {
      const id = String(row.player_id || "");
      if (!id) return;

      if (!map[id]) {
        map[id] = {
          playerId: id,
          name: names[id] || `Joueur ${id.slice(0, 8)}`,
          games: 0,
          pts: 0,
          ast: 0,
          reb: 0,
          stl: 0,
          p3m: 0,
          p3a: 0,
        };
      }

      map[id].games += 1;
      map[id].pts += n(row.pts);
      map[id].ast += n(row.ast);
      map[id].reb += n(row.reb) || n(row.off_reb) + n(row.def_reb);
      map[id].stl += n(row.stl);
      map[id].p3m += n(row.p3m);
      map[id].p3a += n(row.p3a);
    });

  return Object.values(map);
}

function metric(line: LeaderLine, category: Category) {
  if (category.key === "p3pct") {
    return line.p3a > 0 ? (line.p3m / line.p3a) * 100 : 0;
  }

  const value = line[category.key];
  return line.games ? value / line.games : 0;
}

function minAttemptsOk(line: LeaderLine, category: Category) {
  if (category.key !== "p3pct") return true;

  // Évite qu'un joueur à 1/1 soit leader artificiel.
  // Tu peux changer ce seuil plus tard selon le niveau / nombre de matchs.
  return line.p3a >= 3;
}

function getTop3(lines: LeaderLine[], category: Category) {
  return [...lines]
    .filter((line) => minAttemptsOk(line, category))
    .sort((a, b) => metric(b, category) - metric(a, category))
    .slice(0, 3);
}

export default function TeamLeadersBlock({ teamId, players }: Props) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [leaders, setLeaders] = useState<LeaderLine[]>([]);

  useEffect(() => {
    let active = true;

    async function loadLeaders() {
      setLoading(true);

      const localNames = players.reduce((acc: Record<string, string>, player) => {
        acc[String(player.id)] = playerDisplayName(player);
        return acc;
      }, {});

      const { data, error } = await supabase
        .from("match_player_stats")
        .select(
          "player_id, pts, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, reb, ast, stl, blk, turnovers, pf, present"
        )
        .eq("team_id", teamId);

      if (!active) return;

      if (error || !data || data.length === 0) {
        setLeaders(fallbackFromTeamPlayers(players));
        setLoading(false);
        return;
      }

      const playerIds = Array.from(
        new Set((data as StatRow[]).map((row) => row.player_id).filter(Boolean).map(String))
      );

      let supabaseNames: Record<string, string> = {};

      if (playerIds.length > 0) {
        const { data: playersData } = await supabase
          .from("players")
          .select("*")
          .in("id", playerIds);

        supabaseNames = (playersData ?? []).reduce((acc: Record<string, string>, player: any) => {
          acc[String(player.id)] = getSupabasePlayerName(player);
          return acc;
        }, {});
      }

      const names = { ...localNames, ...supabaseNames };
      setLeaders(aggregateRows(data as StatRow[], names));
      setLoading(false);
    }

    loadLeaders();

    return () => {
      active = false;
    };
  }, [players, supabase, teamId]);

  const cards = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        rows: getTop3(leaders, category),
      })),
    [leaders]
  );

  return (
    <section className="tl-card leaders-card">
      <div className="leaders-head">
        <div>
          <p className="eyebrow">Performance</p>
          <h2>Leaders de l'équipe</h2>
          <p className="muted">
            Top 3 par catégorie, calculé sur les matchs enregistrés.
          </p>
        </div>

        {loading && <span className="loading-pill">Chargement...</span>}
      </div>

      <div className="leaders-grid">
        {cards.map(({ category, rows }) => (
          <article key={category.key} className="leader-box">
            <div className="leader-title">
              <span>{category.icon}</span>
              <strong>{category.title}</strong>
            </div>

            {rows.length === 0 && (
              <div className="leader-empty">Pas encore assez de données.</div>
            )}

            {rows.map((line, index) => {
              const value = metric(line, category);
              const displayed =
                category.type === "percent"
                  ? `${round1(value)}${category.suffix || ""}`
                  : round1(value);

              return (
                <div key={line.playerId} className="leader-row">
                  <span className={`rank rank-${index + 1}`}>{index + 1}</span>

                  <div className="identity">
                    <strong>{line.name}</strong>
                    <small>
                      {line.games} match{line.games > 1 ? "s" : ""}
                      {category.key === "p3pct" ? ` · ${line.p3m}/${line.p3a}` : ""}
                    </small>
                  </div>

                  <span className="value">{displayed}</span>
                </div>
              );
            })}
          </article>
        ))}
      </div>

      <style jsx>{`
        .leaders-card {
          margin-top: 1.2rem;
        }

        .leaders-head {
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

        .loading-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: #fff8ef;
          border: 1px solid #eadccc;
          color: #6b1a2c;
          padding: 0.45rem 0.75rem;
          font-weight: 900;
          font-size: 0.8rem;
        }

        .leaders-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 0.85rem;
        }

        .leader-box {
          border: 1px solid #efe6db;
          border-radius: 18px;
          background: linear-gradient(180deg, #fffdf9, #fff);
          padding: 0.9rem;
          min-height: 205px;
          box-shadow: 0 10px 24px rgba(60, 30, 20, 0.045);
        }

        .leader-title {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          color: #6b1a2c;
          margin-bottom: 0.8rem;
        }

        .leader-title span {
          font-size: 1.15rem;
        }

        .leader-title strong {
          font-weight: 900;
          font-size: 0.95rem;
        }

        .leader-row {
          display: grid;
          grid-template-columns: 28px 1fr auto;
          align-items: center;
          gap: 0.55rem;
          padding: 0.55rem 0;
          border-top: 1px solid #f0e7dc;
        }

        .leader-row:first-of-type {
          border-top: 0;
        }

        .rank {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #f5efe6;
          color: #6b1a2c;
          font-weight: 900;
          font-size: 0.82rem;
        }

        .rank-1 {
          background: #fff0c8;
          color: #7a4f00;
        }

        .rank-2 {
          background: #f1f2f5;
          color: #525866;
        }

        .rank-3 {
          background: #f5e7dc;
          color: #7a3e1d;
        }

        .identity {
          min-width: 0;
        }

        .identity strong {
          display: block;
          color: #1f171a;
          font-size: 0.88rem;
          font-weight: 900;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .identity small {
          display: block;
          margin-top: 0.12rem;
          color: #9a8a82;
          font-size: 0.72rem;
          font-weight: 800;
        }

        .value {
          color: #d4a24c;
          font-size: 1.05rem;
          font-weight: 900;
        }

        .leader-empty {
          border-top: 1px solid #f0e7dc;
          padding-top: 0.75rem;
          color: #9a8a82;
          font-weight: 800;
          font-size: 0.85rem;
        }

        @media (max-width: 1200px) {
          .leaders-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .leaders-head {
            flex-direction: column;
          }

          .leaders-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
