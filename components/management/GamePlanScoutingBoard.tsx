"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadMatchAnalysis,
  loadOfficialTeamMatches,
} from "@/lib/analytics/load-matches";
import {
  numeric,
  ratio,
  type DataRow,
} from "@/lib/analytics/matches";
import { fillLnbIdentity } from "@/lib/lnb-statistics-model";
import { useLnbTeamStatistics } from "@/lib/lnb-statistics-client";
import { score, codedPlayerStats, officialPlayerStats, scoutingTeamStats, teamMetrics } from "@/lib/scouting-report-stats";
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
  printPlayerIds?: string[];
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
  const printIds = value.printPlayerIds ?? players.map(player => player.id);
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
  const { uniqueMatches, officialRows, autoStats } = scoutingTeamStats(data, fixtures, official);
  const liveStats = useMemo(() => codedPlayerStats(data), [data]);
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
            : (autoStats[key] == null ? "" : Number(autoStats[key].toFixed(1)))
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
              printPlayerIds: undefined,
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
                  {official?.ranking && <p><strong>{official.ranking}e</strong> · {official.competition}</p>}
                  <div className={styles.stats}>
                    {teamMetrics.map(([key, title]) => statField(key, title))}
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
                <p>{printIds.length} joueur(s) sélectionné(s) pour le PDF</p>
                <button type="button" onClick={() => onChange({ printPlayerIds: players.map(player => player.id) })}>Tout sélectionner</button>{" "}
                <button type="button" onClick={() => onChange({ printPlayerIds: [] })}>Tout désélectionner</button>{" "}
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
                const officialStats = officialPlayerStats(published);
                const stats = card?.liveStats ?? officialStats ?? liveStats.get(p.id);
                const columns = ["MJ", "5D", "MIN", "PTS", "2R", "2T", "2 %", "3R", "3T", "3 %", "LFR", "LFT", "LF %", "RO", "RD", "PD", "BP", "REB", "INT", "CTR", "F", "FP", "ÉVAL", "+/−"]
                  .map(title => [title, stats?.[title as keyof typeof stats] ?? null] as const);
                return (
                  <article className={styles.card} key={p.id}>
                    <label>
                      <input type="checkbox" style={{ width: 16, height: 16 }} checked={printIds.includes(p.id)} onChange={event => onChange({
                        printPlayerIds: event.target.checked ? [...printIds, p.id] : printIds.filter(id => id !== p.id),
                      })} /> Inclure {label(p)} dans le PDF
                    </label>
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
