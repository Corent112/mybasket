"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadMatchAnalysis,
  loadOfficialTeamMatches,
} from "@/lib/analytics/load-matches";
import {
  boxOf,
  numeric,
  ratio,
  participation,
  sumKnown,
  type DataRow,
} from "@/lib/analytics/matches";
import { lnbFieldMap, fillLnbIdentity } from "@/lib/lnb-statistics-model";
import { useLnbTeamStatistics } from "@/lib/lnb-statistics-client";
import styles from "./GamePlanScoutingBoard.module.css";

type P = {
  id: string;
  firstName?: string;
  lastName?: string;
  num?: string | number;
  poste?: string;
  posteSecondaire?: string;
  photo?: string;
  taille?: string;
  mainDominante?: string;
  metadata?: Record<string, unknown>;
};
type T = {
  id: string;
  name?: string;
  logo?: string;
  players?: P[];
  competitionSource?: string;
};
export type ScoutCard = {
  playerId: string;
  profile: string;
  profile2?: string;
  notes: string;
  defend?: string;
  liveStats?: Record<string, number | null>;
};
export type ScoutStat = { id: string; metric: string; limit: number };
export type ScoutBoardValue = {
  scoutTeamId?: string;
  identity?: string;
  offense?: string;
  defense?: string;
  offensiveKeys?: string;
  defensiveKeys?: string;
  teamStats?: Record<string, number | null>;
  depthChart?: Record<string, string[]>;
  importantStats?: ScoutStat[];
  playerCards?: ScoutCard[];
};
const PROFILES = [
  "Shooteur",
  "Driver",
  "Créateur",
  "P&R Handler",
  "Physique",
  "Rebondeur",
  "Post-up",
  "Défenseur",
  "Slasher",
  "Scoreur",
];
const label = (p: P) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ") || "Joueur";
const fmt = (n: unknown) =>
  numeric(n) == null
    ? "—"
    : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
function score(row: DataRow, side: "us" | "them") {
  const keys =
    side === "us"
      ? ["our_score", "us_score", "team_score", "score_for", "points_for"]
      : [
          "opponent_score",
          "them_score",
          "opponent_points",
          "score_against",
          "points_against",
        ];
  for (const key of keys) {
    const v = numeric(row[key]);
    if (v != null) return v;
  }
  return null;
}
function officialPlayer(row: DataRow) {
  return Object.fromEntries(
    Object.entries(lnbFieldMap).map(([key, field]) => [
      (
        { offReb: "off_reb", defReb: "def_reb", to: "turnovers" } as Record<
          string,
          string
        >
      )[key] || key,
      numeric(row[field]),
    ]),
  );
}
type ScoutingProps = {
  value: ScoutBoardValue;
  onChange: (v: Partial<ScoutBoardValue>) => void;
  scoutTeams: T[];
  myTeam?: T;
  date?: string;
  systems: DataRow[];
  onAddSystem: () => void;
};
export default function ScoutingBoard(props: ScoutingProps) {
  return <ScoutingContent key={props.value.scoutTeamId || "none"} {...props} />;
}
function ScoutingContent({
  value,
  onChange,
  scoutTeams,
  myTeam,
  date,
  systems,
  onAddSystem,
}: ScoutingProps) {
  const team = scoutTeams.find((t) => t.id === value.scoutTeamId);
  const [importedCount, setImportedCount] = useState(0);
  const [tab, setTab] = useState<"team" | "players" | "plays">("team");
  const [data, setData] = useState<{ matches: DataRow[]; rows: DataRow[] }>({
    matches: [],
    rows: [],
  });
  const { data: official, loading: officialLoading, error: officialError } =
    useLnbTeamStatistics(team?.id || "", team?.competitionSource === "lnb");
  const [fixtures, setFixtures] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(Boolean(team));
  const [errors, setErrors] = useState<string[]>([]);
  const players = team?.players || [];
  const cards = value.playerCards || [];
  useEffect(() => {
    let live = true;
    if (!team) return;
    const db = createClient();
    const coded = loadMatchAnalysis(db, team.id)
      .then((r) => {
        if (live) setData(r);
      })
      .catch(() => {
        if (live)
          setErrors((e) => [
            ...e,
            "Les statistiques codées ne sont pas disponibles.",
          ]);
      });
    const synced = loadOfficialTeamMatches(db, team.id)
      .then((rows) => {
        if (live) setFixtures(rows);
      })
      .catch(() => {
        if (live)
          setErrors((e) => [
            ...e,
            "Les résultats officiels ne sont pas disponibles.",
          ]);
      });
    Promise.allSettled([coded, synced]).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [team]);
  const recordSource: DataRow[] = fixtures.length
    ? fixtures
    : Array.isArray(official?.matches) && official.matches.length
      ? official.matches
      : data.matches;
  const recordMatches = recordSource.filter(
    (m) => score(m, "us") != null && score(m, "them") != null,
  );
  const uniqueMatches = [
    ...new Map<string, DataRow>(
      recordMatches.map((m) => [String(m.external_id || m.id), m]),
    ).values(),
  ];
  const codedGames = new Set(data.rows.map((r) => r.match_id)).size;
  const officialRows = (official?.players || []).filter(
    (r: DataRow) => r.seasonTotals,
  );
  const sourceRows = officialRows.length
    ? officialRows.map((r: DataRow) => ({
        ...officialPlayer(r.seasonTotals),
        fpf: numeric(r.seasonTotals.s_fouls_on_average),
      }))
    : data.rows;
  const sourceBox = boxOf(sourceRows);
  const maxPlayerGames = Math.max(
    0,
    ...officialRows.map((r: DataRow) => numeric(r.s_games) || 0),
  );
  const teamGames = officialRows.length
    ? uniqueMatches.length >= maxPlayerGames
      ? uniqueMatches.length
      : 0
    : codedGames;
  const autoStats: Record<string, number | null> = {
    reb: ratio(sumKnown(sourceRows, "reb"), teamGames),
    stl: ratio(sumKnown(sourceRows, "stl"), teamGames),
    blk: ratio(sumKnown(sourceRows, "blk"), teamGames),
    pf: ratio(sumKnown(sourceRows, "pf"), teamGames),
    fpf: ratio(sumKnown(sourceRows, "fpf"), teamGames),
    pointsFor: ratio(
      uniqueMatches.reduce((s, m) => s + score(m, "us")!, 0),
      uniqueMatches.length,
    ),
    pointsAgainst: ratio(
      uniqueMatches.reduce((s, m) => s + score(m, "them")!, 0),
      uniqueMatches.length,
    ),
    p2pct: ratio(sourceBox.p2m, sourceBox.p2a, 100),
    p3pct: ratio(sourceBox.p3m, sourceBox.p3a, 100),
    p3a: ratio(sourceBox.p3a, teamGames),
    ftpct: ratio(sourceBox.ftm, sourceBox.fta, 100),
    off: ratio(sourceBox.off_reb, teamGames),
    def: ratio(sourceBox.def_reb, teamGames),
    ast: ratio(sourceBox.ast, teamGames),
    to: ratio(sourceBox.turnovers, teamGames),
  };
  const liveStats = useMemo(() => {
    const matches = new Map(data.matches.map(match => [String(match.id), match]));
    const grouped = new Map<string, Map<string, DataRow>>();
    for (const row of data.rows) {
      const matchId = String(row.match_id);
      if (!matches.has(matchId) || !row.player_id || row.present === false) continue;
      const id = String(row.player_id);
      const rows = grouped.get(id) ?? new Map<string, DataRow>();
      rows.set(matchId, row);
      grouped.set(id, rows);
    }
    const stats = new Map<string, Record<string, number | null>>();
    for (const [id, playerRows] of grouped) {
      const rows = [...playerRows.values()];
      const played = participation(rows, matches)[id];
      const box = boxOf(rows);
      const avg = (key: string) => ratio(sumKnown(rows, key), played.games);
      const evaluation = rows.map(row => {
        const recorded = numeric(row.eval);
        if (recorded != null) return { value: recorded };
        const fields = ["pts", "reb", "ast", "stl", "blk", "p2a", "p2m", "p3a", "p3m", "fta", "ftm", "turnovers", "pf"];
        const values = fields.map(key => numeric(row[key]));
        if (!values.every((v): v is number => v != null)) return { value: null };
        const [pts, reb, ast, stl, blk, p2a, p2m, p3a, p3m, fta, ftm, turnovers, pf] = values;
        return { value: pts + reb + ast + stl + blk - Math.max(0, p2a - p2m)
          - Math.max(0, p3a - p3m) - Math.max(0, fta - ftm) - turnovers - pf };
      });
      stats.set(id, {
        MJ: played.games,
        MIN: ratio(played.seconds / 60, played.minutesKnown),
        PTS: avg("pts"), "2R": avg("p2m"), "2T": avg("p2a"), "2 %": ratio(box.p2m, box.p2a, 100),
        "3R": avg("p3m"), "3T": avg("p3a"), "3 %": ratio(box.p3m, box.p3a, 100),
        LFR: avg("ftm"), LFT: avg("fta"), "LF %": ratio(box.ftm, box.fta, 100),
        RO: avg("off_reb"), RD: avg("def_reb"), PD: avg("ast"), BP: avg("turnovers"),
        REB: avg("reb"), INT: avg("stl"), CTR: avg("blk"), F: avg("pf"), FP: avg("fpf"),
        "ÉVAL": ratio(sumKnown(evaluation, "value"), played.games),
      });
    }
    return stats;
  }, [data]);
  const importCount = players.filter(player => liveStats.has(player.id)).length;

  function importLiveStats() {
    const next = new Map(cards.map(card => [card.playerId, card]));
    for (const { id } of players) {
      const stats = liveStats.get(id);
      if (!stats) continue;
      next.set(id, { playerId: id, profile: "", notes: "", ...next.get(id), liveStats: stats });
    }
    onChange({ playerCards: [...next.values()] });
    setImportedCount(importCount);
  }

  function patchCard(id: string, patch: Partial<ScoutCard>) {
    const existing = cards.find((c) => c.playerId === id);
    onChange({
      playerCards: existing
        ? cards.map((c) => (c.playerId === id ? { ...c, ...patch } : c))
        : [...cards, { playerId: id, profile: "", notes: "", ...patch }],
    });
  }
  const statField = (key: string, title: string) => (
    <label key={key}>
      {title}
      <input
        type="number"
        min={0}
        step="0.1"
        placeholder="—"
        value={
          Object.prototype.hasOwnProperty.call(value.teamStats || {}, key)
            ? (value.teamStats?.[key] ?? "")
            : (autoStats[key] ?? "")
        }
        onChange={(e) =>
          onChange({
            teamStats: {
              ...value.teamStats,
              [key]: e.target.value === "" ? null : Number(e.target.value),
            },
          })
        }
      />
    </label>
  );
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          {team?.logo && <img src={team.logo} alt="" />}
          <h3>{team?.name || "Scouting adverse"}</h3>
        </div>
        <small>
          {myTeam?.name} · {date || "Prochain match"}
        </small>
      </header>
      <label className={styles.team}>
        Équipe scoutée
        <select
          value={value.scoutTeamId || ""}
          onChange={(e) =>
            onChange({
              scoutTeamId: e.target.value,
              depthChart: {},
              playerCards: [],
              teamStats: {},
            })
          }
        >
          <option value="">Choisir l’adversaire…</option>
          {scoutTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <nav className={styles.tabs} aria-label="Sections du scouting">
        {(
          [
            ["team", "1 · Équipe"],
            ["players", "2 · Joueurs"],
            ["plays", "3 · Formes de jeu adverses"],
          ] as const
        ).map(([id, title]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {title}
          </button>
        ))}
      </nav>
      {(loading || officialLoading) && <p role="status">Préremplissage depuis les données liées…</p>}
      {(errors.length > 0 || officialError) && (
        <p role="status" className={styles.note}>
          {[...errors, officialError].filter(Boolean).join(" ")}
        </p>
      )}
      {!team ? (
        <p>
          Choisis une équipe scoutée pour retrouver son effectif et ses données.
        </p>
      ) : (
        <>
          {tab === "team" && (
            <>
              <div className={styles.grid}>
                <section className={styles.card}>
                  <h3>Bilan de l’équipe</h3>
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th>V</th>
                        <th>D</th>
                        <th>% V</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        [
                          "Domicile",
                          uniqueMatches.filter(
                            (m) => m.home === true || m.is_home === true,
                          ),
                        ],
                        [
                          "Extérieur",
                          uniqueMatches.filter(
                            (m) => m.home === false || m.is_home === false,
                          ),
                        ],
                        ["Cumulé", uniqueMatches],
                      ].map(([name, matches]) => {
                        const rows = matches as DataRow[];
                        const wins = rows.filter(
                          (m) => score(m, "us")! > score(m, "them")!,
                        ).length;
                        const losses = rows.filter(
                          (m) => score(m, "us")! < score(m, "them")!,
                        ).length;
                        return (
                          <tr key={String(name)}>
                            <th>{String(name)}</th>
                            <td>{rows.length ? wins : "—"}</td>
                            <td>{rows.length ? losses : "—"}</td>
                            <td>{fmt(ratio(wins, rows.length, 100))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className={styles.note}>
                    Résultats officiels liés, sinon matchs codés. Les matchs non
                    joués sont exclus.
                  </p>
                </section>
                <section className={styles.card}>
                  <h3>Statistiques de l’équipe</h3>
                  <div className={styles.stats}>
                    {[
                      ["pointsFor", "Points marqués / match"],
                      ["pointsAgainst", "Points encaissés / match"],
                      ["p2pct", "2 PTS %"],
                      ["p3pct", "3 PTS %"],
                      ["p3a", "3 PTS tentés / match"],
                      ["ftpct", "LF %"],
                      ["off", "Rebonds offensifs"],
                      ["def", "Rebonds défensifs"],
                      ["ast", "Passes décisives"],
                      ["to", "Ballons perdus"],
                      ["reb", "Rebonds totaux"],
                      ["stl", "Interceptions"],
                      ["blk", "Contres"],
                      ["pf", "Fautes"],
                      ["fpf", "Fautes provoquées"],
                    ].map(([key, title]) => statField(key, title))}
                  </div>
                  <p className={styles.note}>
                    {officialRows.length
                      ? "Statistiques LNB liées"
                      : "Statistiques MyBasket"}{" "}
                    · moyennes par match. Les champs restent modifiables.
                  </p>
                </section>
              </div>
              <section className={styles.card}>
                <h3>Répartition par poste</h3>
                <div className={styles.stats}>
                  {["1", "2", "3", "4", "5"].map((pos) => (
                    <label key={pos}>
                      Poste {pos}
                      {(value.depthChart?.[pos] || []).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() =>
                            onChange({
                              depthChart: {
                                ...value.depthChart,
                                [pos]: (value.depthChart?.[pos] || []).filter(
                                  (p) => p !== id,
                                ),
                              },
                            })
                          }
                        >
                          {players.find((p) => p.id === id)
                            ? label(players.find((p) => p.id === id)!)
                            : "Joueur"}{" "}
                          ×
                        </button>
                      ))}
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value)
                            onChange({
                              depthChart: {
                                ...value.depthChart,
                                [pos]: [
                                  ...(value.depthChart?.[pos] || []),
                                  e.target.value,
                                ],
                              },
                            });
                        }}
                      >
                        <option value="">Ajouter un joueur</option>
                        {players
                          .filter(
                            (p) =>
                              !Object.values(value.depthChart || {})
                                .flat()
                                .includes(p.id),
                          )
                          .map((p) => (
                            <option value={p.id} key={p.id}>
                              {label(p)}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>
              <div className={styles.grid}>
                {[
                  [
                    "identity",
                    "Identité de jeu",
                    "Style, rythme, joueurs moteurs…",
                  ],
                  [
                    "offense",
                    "Tendances offensives",
                    "Transition, pick and roll, spacing…",
                  ],
                  [
                    "defense",
                    "Tendances défensives",
                    "Couvertures, aides, pression, zone…",
                  ],
                  [
                    "offensiveKeys",
                    "Nos clés offensives",
                    "Ce que nous voulons attaquer…",
                  ],
                  [
                    "defensiveKeys",
                    "Nos clés défensives",
                    "Ce que nous voulons empêcher…",
                  ],
                ].map(([key, title, placeholder]) => (
                  <label className={styles.card} key={key}>
                    <h3>{title}</h3>
                    <textarea
                      value={String(value[key as keyof ScoutBoardValue] || "")}
                      onChange={(e) => onChange({ [key]: e.target.value })}
                      placeholder={placeholder}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          {tab === "players" && (
            <div className={styles.players}>
              <section className={styles.card}>
                <button type="button" disabled={loading || !importCount} onClick={importLiveStats}>
                  Importer les stats LiveStats
                </button>
                <p role="status">{loading ? "Chargement des matchs scoutés…" : importCount
                  ? `${importCount} joueur(s) avec des statistiques sur les matchs scoutés terminés.`
                  : "Aucune statistique joueur à importer depuis les matchs scoutés."}</p>
                {importedCount > 0 && <p role="status">Statistiques importées pour {importedCount} joueur(s).</p>}
              </section>
              {players.map((player) => {
                const published = official?.players?.find(
                  (row: DataRow) => row.playerId === player.id,
                );
                const p = published
                  ? fillLnbIdentity(player, published)
                  : player;
                const card = cards.find((c) => c.playerId === p.id);
                const officialStats = published && numeric(published.s_games) != null ? {
                  MJ: numeric(published.s_games), MIN: numeric(published.s_minutes_average),
                  PTS: numeric(published[lnbFieldMap.pts]),
                  "2R": numeric(published[lnbFieldMap.p2m]), "2T": numeric(published[lnbFieldMap.p2a]), "2 %": numeric(published.s_two_pointers_percentage),
                  "3R": numeric(published[lnbFieldMap.p3m]), "3T": numeric(published[lnbFieldMap.p3a]), "3 %": numeric(published.s_three_pointers_percentage),
                  LFR: numeric(published[lnbFieldMap.ftm]), LFT: numeric(published[lnbFieldMap.fta]), "LF %": numeric(published.s_free_throws_percentage),
                  RO: numeric(published[lnbFieldMap.offReb]), RD: numeric(published[lnbFieldMap.defReb]), PD: numeric(published[lnbFieldMap.ast]), BP: numeric(published[lnbFieldMap.to]),
                  REB: numeric(published[lnbFieldMap.reb]), INT: numeric(published[lnbFieldMap.stl]), CTR: numeric(published[lnbFieldMap.blk]),
                  F: numeric(published[lnbFieldMap.pf]), FP: numeric(published.s_fouls_on_average), "ÉVAL": numeric(published.s_efficiency_average),
                } : null;
                const stats = card?.liveStats ?? officialStats ?? liveStats.get(p.id);
                const columns = ["MJ", "MIN", "PTS", "2R", "2T", "2 %", "3R", "3T", "3 %", "LFR", "LFT", "LF %", "RO", "RD", "PD", "BP", "REB", "INT", "CTR", "F", "FP", "ÉVAL"]
                  .map(title => [title, stats?.[title as keyof typeof stats] ?? null] as const);
                return (
                  <article className={styles.card} key={p.id}>
                    <div className={styles.identity}>
                      {p.photo ? (
                        <img src={p.photo} alt="" />
                      ) : (
                        <span>#{p.num || "—"}</span>
                      )}
                      <div>
                        <h3>
                          #{p.num || "—"} {label(p)}
                        </h3>
                        <p>
                          {p.taille ? `${p.taille} cm · ` : ""}
                          {p.poste ||
                            p.postePrincipal ||
                            "Poste à renseigner"}{" "}
                          · {p.mainDominante || "Main forte à renseigner"}
                        </p>
                      </div>
                    </div>
                    {stats && <p className={styles.note}>{card?.liveStats ? "LiveStats · stats importées" : officialStats ? "LNB · saison" : "LiveStats · matchs scoutés"}</p>}
                    <div className={styles.scroll}>
                      <table>
                        <thead>
                          <tr>
                            {columns.map(([title]) => (
                              <th key={String(title)}>{title}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {columns.map(([title, n]) => (
                              <td key={String(title)}>{fmt(n)}</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.grid}>
                      <label>
                        Profil
                        <select
                          value={card?.profile || ""}
                          onChange={(e) =>
                            patchCard(p.id, { profile: e.target.value })
                          }
                        >
                          <option value="">Choisir le profil</option>
                          {PROFILES.map((profile) => (
                            <option key={profile}>{profile}</option>
                          ))}
                        </select>
                        <select
                          aria-label="Second profil"
                          value={card?.profile2 || ""}
                          onChange={(e) =>
                            patchCard(p.id, { profile2: e.target.value })
                          }
                        >
                          <option value="">Second profil (facultatif)</option>
                          {PROFILES.map((profile) => (
                            <option key={profile}>{profile}</option>
                          ))}
                        </select>
                        <textarea
                          value={card?.notes || ""}
                          onChange={(e) =>
                            patchCard(p.id, { notes: e.target.value })
                          }
                          placeholder="Qualités, habitudes et tendances…"
                        />
                      </label>
                      <label>
                        Comment le défendre
                        <textarea
                          value={card?.defend || ""}
                          onChange={(e) =>
                            patchCard(p.id, { defend: e.target.value })
                          }
                          placeholder="Orientation, distance, écrans, aides…"
                        />
                      </label>
                    </div>
                  </article>
                );
              })}
              {!players.length && (
                <p>
                  L’effectif de cette équipe est vide. Ajoute ou importe ses
                  joueurs dans la fiche équipe.
                </p>
              )}
            </div>
          )}
          {tab === "plays" && (
            <section className={styles.card}>
              <div className={styles.header}>
                <h3>Formes de jeu adverses</h3>
                <button onClick={onAddSystem}>
                  ＋ Ajouter ou dessiner un système
                </button>
              </div>
              <div className={styles.plays}>
                {systems.map((s) => (
                  <article key={s.id}>
                    <h4>{s.title}</h4>
                    {(s.schemaImages?.length ? s.schemaImages : [s.schemaImage])
                      .filter(Boolean)
                      .map((src: string, i: number) => (
                        <img
                          key={i}
                          src={src}
                          alt={`${s.title} · schéma ${i + 1}`}
                        />
                      ))}
                  </article>
                ))}
              </div>
              {!systems.length && (
                <p>
                  Ajoute les systèmes depuis ton playbook, la bibliothèque ou
                  l’outil dessin.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
