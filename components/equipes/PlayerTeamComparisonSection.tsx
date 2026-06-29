"use client";

type RawPlayerStat = {
  id?: string;
  player_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  turnovers?: number | null;
  plus_minus?: number | null;
};

type RankingStat = {
  key: string;
  label: string;
  value: number;
  average: number;
  rank: number;
  total: number;
  percentile: number;
  lowerIsBetter?: boolean;
};

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatStat(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}

function getPlayerId(player: RawPlayerStat) {
  return String(player.player_id ?? player.id ?? "");
}

function buildRankings(currentPlayerId: string, playersStats: RawPlayerStat[]): RankingStat[] {
  const config: Array<{ key: keyof RawPlayerStat; label: string; lowerIsBetter?: boolean }> = [
    { key: "pts", label: "Points" },
    { key: "reb", label: "Rebonds" },
    { key: "ast", label: "Passes" },
    { key: "stl", label: "Interceptions" },
    { key: "blk", label: "Contres" },
    { key: "turnovers", label: "Balles perdues", lowerIsBetter: true },
    { key: "plus_minus", label: "+/-" },
  ];

  return config.map((stat) => {
    const values = playersStats.map((player) => ({
      playerId: getPlayerId(player),
      value: safeNumber(player[stat.key]),
    }));

    const sorted = [...values].sort((a, b) =>
      stat.lowerIsBetter ? a.value - b.value : b.value - a.value
    );

    const currentValue =
      values.find((item) => item.playerId === currentPlayerId)?.value ?? 0;

    const rankIndex = sorted.findIndex((item) => item.playerId === currentPlayerId);
    const rank = rankIndex >= 0 ? rankIndex + 1 : values.length || 1;

    const percentile =
      values.length <= 1
        ? 100
        : Math.round(((values.length - rank) / (values.length - 1)) * 100);

    return {
      key: stat.key,
      label: stat.label,
      value: currentValue,
      average: average(values.map((item) => item.value)),
      rank,
      total: values.length,
      percentile: Math.max(0, Math.min(100, percentile)),
      lowerIsBetter: stat.lowerIsBetter,
    };
  });
}

export default function PlayerTeamComparisonSection({
  playerName,
  currentPlayerId,
  playersStats,
}: {
  playerName: string;
  currentPlayerId: string;
  playersStats: RawPlayerStat[];
}) {
  const usefulStats = playersStats.filter((player) => getPlayerId(player));
  const rankings = buildRankings(currentPlayerId, usefulStats);
  const leaders = rankings.filter((item) => item.rank <= 3);

  if (!usefulStats.length) {
    return (
      <section className="comparison emptyState">
        <div>
          <p>Analyse équipe</p>
          <h2>Classement & comparaison</h2>
          <span>
            Aucune statistique d'équipe disponible pour le moment. Dès que des matchs LiveStats
            seront enregistrés, ce bloc calculera automatiquement les rangs du joueur.
          </span>
        </div>

        <style jsx>{styles}</style>
      </section>
    );
  }

  return (
    <section className="comparison">
      <div className="head">
        <div>
          <p>Analyse équipe</p>
          <h2>Classement & comparaison</h2>
        </div>
        <span>{playerName || "Joueur"}</span>
      </div>

      <div className="grid">
        <article className="card">
          <h3>Classement dans l’équipe</h3>

          {rankings.map((stat) => (
            <div key={stat.key} className="row">
              <div>
                <strong>{stat.label}</strong>
                <small>
                  {formatStat(stat.value)} / moyenne équipe {formatStat(stat.average)}
                </small>
              </div>

              <b className={stat.rank <= 3 ? "top" : ""}>
                {medal(stat.rank)} {stat.rank}/{stat.total}
              </b>
            </div>
          ))}
        </article>

        <article className="card">
          <h3>Comparaison avec la moyenne</h3>

          {rankings.slice(0, 5).map((stat) => {
            const max = Math.max(stat.value, stat.average, 1);
            const playerWidth = Math.min(100, (stat.value / max) * 100);
            const teamWidth = Math.min(100, (stat.average / max) * 100);
            const diff = stat.value - stat.average;
            const isPositive = stat.lowerIsBetter ? diff <= 0 : diff >= 0;

            return (
              <div key={stat.key} className="compare">
                <div className="compareTitle">
                  <strong>{stat.label}</strong>
                  <span className={isPositive ? "positive" : "negative"}>
                    {diff >= 0 ? "+" : ""}
                    {formatStat(diff)}
                  </span>
                </div>

                <div className="barRow">
                  <small>Joueur</small>
                  <div className="bar">
                    <i className="playerBar" style={{ width: `${playerWidth}%` }} />
                  </div>
                  <b>{formatStat(stat.value)}</b>
                </div>

                <div className="barRow">
                  <small>Équipe</small>
                  <div className="bar">
                    <i className="teamBar" style={{ width: `${teamWidth}%` }} />
                  </div>
                  <b>{formatStat(stat.average)}</b>
                </div>
              </div>
            );
          })}
        </article>

        <article className="card">
          <h3>Forces principales</h3>

          {leaders.length ? (
            leaders.map((stat) => (
              <div key={stat.key} className="leader">
                <span>{medal(stat.rank)}</span>
                <div>
                  <strong>
                    {stat.rank === 1
                      ? `Leader ${stat.label.toLowerCase()}`
                      : `${stat.rank}e ${stat.label.toLowerCase()}`}
                  </strong>
                  <small>
                    {formatStat(stat.value)} — percentile {stat.percentile}%
                  </small>
                </div>
              </div>
            ))
          ) : (
            <p className="empty">Pas encore de force dominante détectée.</p>
          )}
        </article>

        <article className="card">
          <h3>Percentiles équipe</h3>

          {rankings.map((stat) => (
            <div key={stat.key} className="percentile">
              <div>
                <strong>{stat.label}</strong>
                <span>{stat.percentile}%</span>
              </div>
              <div className="bar">
                <i className="playerBar" style={{ width: `${stat.percentile}%` }} />
              </div>
            </div>
          ))}
        </article>
      </div>

      <style jsx>{styles}</style>
    </section>
  );
}

const styles = `
  .comparison {
    margin-top: 2rem;
    padding: 1.25rem;
    border-radius: 28px;
    background: linear-gradient(135deg, #fff8e9, #fff, #f8edf0);
    border: 1px solid rgba(107, 26, 44, 0.12);
    box-shadow: 0 18px 45px rgba(20, 15, 15, 0.08);
  }

  .emptyState div {
    display: grid;
    gap: 0.3rem;
  }

  .emptyState p,
  .head p {
    margin: 0 0 0.25rem;
    color: #d4a24c;
    font-size: 0.75rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .emptyState h2,
  .head h2 {
    margin: 0;
    color: #6b1a2c;
    font-size: clamp(1.35rem, 2vw, 2rem);
  }

  .emptyState span {
    color: #766b6f;
    line-height: 1.5;
  }

  .head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .head > span {
    align-self: flex-start;
    padding: 0.5rem 0.85rem;
    border-radius: 999px;
    background: #6b1a2c;
    color: white;
    font-size: 0.8rem;
    font-weight: 900;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .card {
    padding: 1rem;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(107, 26, 44, 0.1);
  }

  .card h3 {
    margin: 0 0 1rem;
    color: #211b1d;
  }

  .row,
  .leader,
  .compare,
  .percentile {
    padding: 0.75rem;
    border-radius: 16px;
    background: #faf7f2;
    margin-top: 0.65rem;
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  small {
    display: block;
    color: #766b6f;
    font-size: 0.78rem;
    margin-top: 0.15rem;
  }

  .top {
    color: #d4a24c;
  }

  .compareTitle,
  .percentile > div:first-child {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .positive {
    color: #15803d;
    font-weight: 900;
  }

  .negative {
    color: #b91c1c;
    font-weight: 900;
  }

  .barRow {
    display: grid;
    grid-template-columns: 52px 1fr 42px;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }

  .barRow b {
    text-align: right;
    font-size: 0.8rem;
  }

  .bar {
    height: 9px;
    border-radius: 999px;
    background: rgba(107, 26, 44, 0.1);
    overflow: hidden;
  }

  .bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
  }

  .playerBar {
    background: #6b1a2c;
  }

  .teamBar {
    background: #d4a24c;
  }

  .leader {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .leader span {
    font-size: 1.35rem;
  }

  .leader strong {
    color: #6b1a2c;
  }

  .empty {
    margin: 0;
    color: #766b6f;
  }

  @media (max-width: 900px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .head {
      flex-direction: column;
    }
  }
`;
