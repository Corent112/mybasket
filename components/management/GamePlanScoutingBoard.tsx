"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadMatchAnalysis,
  loadOfficialTeamMatches,
} from "@/lib/analytics/load-matches";
import {
  numeric,
  type DataRow,
} from "@/lib/analytics/matches";
import { fillLnbIdentity } from "@/lib/lnb-statistics-model";
import { useLnbTeamStatistics } from "@/lib/lnb-statistics-client";
import { compactPlayerMetrics, shotSplit, codedPlayerStats, officialPlayerStats, scoutingTeamStats, scoutingTeamForm, teamMetrics } from "@/lib/scouting-report-stats";
import { scoutingColors } from "@/lib/scouting-colors";
import type { CSSProperties } from "react";
import { scoutingHighlights, highlightColors, type ScoutingSide } from "@/lib/scouting-highlights";
import { scoutingProfiles, scoutingProfileIcon, scoutingProfileLabel } from "@/lib/scouting-profiles";
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
  couleurs?: string[];
};
export type ScoutCard = {
  playerId: string;
  profile: string;
  profile2?: string;
  notes: string;
  defend?: string;
  photo?: string;
  taille?: string;
  mainDominante?: string;
  statColors?: Record<string, "green" | "red" | undefined>;
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
  teamStatColors?: ScoutCard["statColors"];
  depthChart?: Record<string, string[]>;
  importantStats?: ScoutStat[];
  playerCards?: ScoutCard[];
  printPlayerIds?: string[];
  playNotes?: Record<string, string>;
  highlightSide?: ScoutingSide;
  highlightMatchIds?: string[];
  highlightNotes?: string;
};
function ShotPie({ two, three }: { two: unknown; three: unknown }) {
  const split = shotSplit(two, three);
  if (!split) return null;
  return <div className={styles.shotPie}>
    <div aria-hidden="true" style={{ background: `conic-gradient(var(--scout-primary) ${split.share2 * 100}%, var(--scout-secondary) 0)` }} />
    <p><strong>Tirs tentés</strong><br />2 pts · {fmt(split.p2)} · {fmt(split.share2 * 100)} %<br />3 pts · {fmt(split.p3)} · {fmt((1 - split.share2) * 100)} %</p>
  </div>;
}

async function scoutingPhoto(file: File) {
  if (file.size > 15 * 1024 * 1024) throw new Error("Image trop volumineuse");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 360 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image inaccessible");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  const [profilePicker, setProfilePicker] = useState<{ id: string; slot: "profile" | "profile2" } | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [tab, setTab] = useState<"team" | "players" | "plays">("team");
  const [data, setData] = useState<{ matches: DataRow[]; rows: DataRow[]; actions: DataRow[] }>({
    matches: [],
    rows: [],
    actions: [],
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
  const { officialRows, autoStats, uniqueMatches } = scoutingTeamStats(data, fixtures, official);
  const { splits, recent } = scoutingTeamForm(uniqueMatches);
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
  const teamStat = (key: string) => Object.prototype.hasOwnProperty.call(value.teamStats || {}, key)
    ? value.teamStats?.[key] : autoStats[key];
  const statField = (key: string, title: string) => (
    <div className={styles.teamStatField} key={key}>
      <label htmlFor={`scout-stat-${key}`}>{title}</label>
      <span className={styles.teamStatControl}>
      <input
        id={`scout-stat-${key}`}
        data-color={value.teamStatColors?.[key]}
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
      <button type="button" className={styles.statMark} data-color={value.teamStatColors?.[key]}
        title="Passer de neutre à vert, puis rouge"
        aria-label={`Couleur · ${title} · ${value.teamStatColors?.[key] === "green" ? "verte" : value.teamStatColors?.[key] === "red" ? "rouge" : "neutre"}`}
        onClick={() => onChange({ teamStatColors: { ...value.teamStatColors,
          [key]: !value.teamStatColors?.[key] ? "green" : value.teamStatColors[key] === "green" ? "red" : undefined,
        } })}>◉</button>
      </span>
    </div>
  );
  const palette = scoutingColors(myTeam?.couleurs);
  const highlightSide = value.highlightSide ?? "attaque";
  const codedMatchIds = new Set(data.actions.map(action => String(action.match_id)));
  const highlightMatches = data.matches.filter(match => codedMatchIds.has(String(match.id)));
  const highlights = scoutingHighlights(data.actions, highlightSide, value.highlightMatchIds);
  const colors = [palette.primary, palette.secondary, ...highlightColors.slice(2)];
  let offset = 0;
  const slices = highlights.map((row, index) => {
    const start = offset;
    offset += row.share * 100;
    return `${colors[index % colors.length]} ${start}% ${Math.min(100, offset)}%`;
  });
  return (
    <div className={styles.root} style={{
      "--scout-primary": palette.primary, "--scout-secondary": palette.secondary,
      "--scout-on-primary": palette.onPrimary, "--scout-ink": palette.ink,
    } as CSSProperties}>
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
              playNotes: {},
              highlightSide: undefined,
              highlightMatchIds: undefined,
              highlightNotes: "",
              teamStats: {},
              teamStatColors: {},
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
              <div>
                <section className={styles.card}>
                  <h3>Statistiques de l’équipe</h3>
                  {official?.ranking && <p><strong>{official.ranking}e</strong> · {official.competition}</p>}
                  <ShotPie two={teamStat("p2a")} three={teamStat("p3a")} />
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
              <div className={styles.grid}>
                <section className={styles.card}>
                  <h3>Points par match</h3>
                  <div className={styles.scroll}><table>
                    <thead><tr><th>Situation</th><th>MJ</th><th>Marqués</th><th>Encaissés</th></tr></thead>
                    <tbody>{splits.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.games}</td><td>{fmt(row.forPoints)}</td><td>{fmt(row.against)}</td></tr>)}</tbody>
                  </table></div>
                </section>
                <section className={styles.card}>
                  <h3>Forme du moment</h3>
                  {recent.length ? <div className={styles.scroll}><table>
                    <thead><tr><th>Date</th><th>Adversaire</th><th>Lieu</th><th>Score</th><th>Résultat</th></tr></thead>
                    <tbody>{recent.map((match, index) => <tr key={`${match.id}-${index}`}>
                      <td>{match.date.split("-").reverse().join("/")}</td><th>{match.opponent}</th><td>{match.venue}</td>
                      <td>{match.forPoints}–{match.against}</td>
                      <td><span className={styles.matchOutcome} data-result={match.outcome}>{match.outcome === "V" ? "Victoire" : match.outcome === "D" ? "Défaite" : "Nul"}</span></td>
                    </tr>)}</tbody>
                  </table></div> : <p>Aucun résultat daté disponible.</p>}
                </section>
              </div>
              <section className={styles.card}>
                <h3>Temps forts des matchs scoutés</h3>
                <div className={styles.tabs}>
                  <button type="button" aria-pressed={highlightSide === "attaque"} onClick={() => onChange({ highlightSide: "attaque" })}>Attaque</button>
                  <button type="button" aria-pressed={highlightSide === "defense"} onClick={() => onChange({ highlightSide: "defense" })}>Défense</button>
                </div>
                {!!highlightMatches.length && <details>
                  <summary>Matchs à analyser</summary>
                  <button type="button" onClick={() => onChange({ highlightMatchIds: undefined })}>Tous les matchs</button>
                  {highlightMatches.map(match => {
                    const id = String(match.id);
                    const ids = value.highlightMatchIds ?? highlightMatches.map(item => String(item.id));
                    return <label key={id}><span>
                      <input type="checkbox" checked={ids.includes(id)} onChange={event => onChange({
                        highlightMatchIds: event.target.checked ? [...ids, id] : ids.filter(item => item !== id),
                      })} /> {match.match_date} · {match.opponent || match.opponent_name || "Match scouté"}
                    </span></label>;
                  })}
                </details>}
                {highlights.length ? <>
                  <div className={styles.shotPie}>
                    <div role="img" aria-label="Répartition des possessions par temps fort" style={{ background: `conic-gradient(${slices.length === 1 ? `${colors[0]} 0% 100%` : slices.join(",")})` }} />
                    <p>Part des possessions codées avec un temps fort.</p>
                  </div>
                  <div className={styles.scroll}><table>
                    <thead><tr><th>Temps fort</th><th>Poss.</th><th>Part</th><th>{highlightSide === "attaque" ? "Pts" : "Pts encaissés"}</th><th>Pts / poss.</th></tr></thead>
                    <tbody>{highlights.map((row, index) => <tr key={row.label}>
                      <th><span aria-hidden="true" style={{ color: colors[index % colors.length] }}>● </span>{row.label}</th>
                      <td>{row.possessions}</td><td>{fmt(row.share * 100)} %</td><td>{row.points}</td>
                      <td>{row.ppp.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
                    </tr>)}</tbody>
                  </table></div>
                </> : <p>Aucune possession avec un temps fort pour cette sélection.</p>}
                <label>Ce qu’on retient
                  <textarea value={value.highlightNotes || ""} onChange={event => onChange({ highlightNotes: event.target.value })} />
                </label>
              </section>
              <section className={styles.card}>
                <h3>Répartition par poste</h3>
                <div className={styles.stats}>
                  {["1", "2", "3", "4", "5"].map((pos) => (
                    <label key={pos}>
                      Poste {pos}
                      {[...new Set(value.depthChart?.[pos] || [])].map((id) => (
                        <button className={styles.depthPlayer}
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
                          {(() => {
                            const photo = cards.find(card => card.playerId === id)?.photo || players.find(player => player.id === id)?.photo;
                            return photo ? <img src={photo} alt="" /> : null;
                          })()}
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
              <details className={styles.card}>
                <summary>Bibliothèque d’icônes de profil</summary>
                <div className={styles.iconGrid}>{scoutingProfiles.map(profile => <figure key={profile}>
                  <img src={scoutingProfileIcon(profile)!} alt="" loading="lazy" /><figcaption>{profile}</figcaption>
                </figure>)}</div>
              </details>
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
                const activeSlot = profilePicker && profilePicker.id === p.id ? profilePicker.slot : null;
                const columns = compactPlayerMetrics.map(title => [title, stats?.[title] ?? null] as const);
                return (
                  <article className={`${styles.card} ${styles.playerCard}`} key={p.id}>
                    <header className={styles.playerHeader}>
                    <div className={styles.identity}>
                      {(card?.photo || p.photo) ? (
                        <img src={card?.photo || p.photo} alt="" />
                      ) : (
                        <span>#{p.num || "—"}</span>
                      )}
                      <div>
                        <h3>
                          #{p.num || "—"} {label(p)}
                        </h3>
                        <p>
                          {(card?.taille || p.taille) ? `${card?.taille || p.taille} cm · ` : ""}
                          {p.poste ||
                            p.postePrincipal ||
                            "Poste à renseigner"}{" "}
                          · {card?.mainDominante || p.mainDominante || "Main forte à renseigner"}
                        </p>
                      </div>
                    </div>
                    <label className={styles.pdfToggle}>
                      <input type="checkbox" aria-label={`Inclure ${label(p)} dans le PDF`} style={{ width: 16, height: 16 }} checked={printIds.includes(p.id)} onChange={event => onChange({
                        printPlayerIds: event.target.checked ? [...printIds, p.id] : printIds.filter(id => id !== p.id),
                      })} /> <span>Inclure dans le PDF</span>
                    </label>
                    </header>
                    <div className={styles.playerFields}>
                      <div className={styles.photoField}><label className={styles.photoButton}>Modifier la photo
                        <input type="file" accept="image/*" onChange={async event => {
                          const input = event.currentTarget;
                          const file = input.files?.[0];
                          input.value = "";
                          if (!file) return;
                          try {
                            const photo = await scoutingPhoto(file);
                            patchCard(p.id, { photo });
                          } catch {
                            setPhotoError(p.id);
                          }
                        }} />
                      </label>
                        {photoError === p.id && <small role="alert">Impossible de lire cette image.</small>}
                        {card?.photo && <button type="button" onClick={() => patchCard(p.id, { photo: undefined })}>Retirer la photo ajoutée</button>}
                      </div>
                      <label>Taille (cm)
                        <input type="number" min={90} max={260} value={card?.taille ?? p.taille ?? ""} onChange={event => patchCard(p.id, { taille: event.target.value })} />
                      </label>
                      <label>Main forte
                        <select value={card?.mainDominante ?? p.mainDominante ?? ""} onChange={event => patchCard(p.id, { mainDominante: event.target.value })}>
                          <option value="">À renseigner</option><option>Droite</option><option>Gauche</option><option>Ambidextre</option>
                        </select>
                      </label>
                    </div>
                    <ShotPie two={stats?.["2T"]} three={stats?.["3T"]} />
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
                              <td key={title}>
                                <button type="button" className={styles.statMark} data-color={card?.statColors?.[title]}
                                  aria-label={`${title} ${fmt(n)} · couleur ${card?.statColors?.[title] === "green" ? "verte" : card?.statColors?.[title] === "red" ? "rouge" : "neutre"}`}
                                  title="Cliquer pour passer de neutre à vert, puis rouge"
                                  onClick={() => patchCard(p.id, { statColors: { ...card?.statColors,
                                    [title]: !card?.statColors?.[title] ? "green" : card.statColors[title] === "green" ? "red" : undefined,
                                  } })}>{fmt(n)}</button>
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.grid}>
                      <div className={styles.profilePanel}>
                        <strong>Profils du joueur</strong>
                        <div className={styles.profileSlots}>
                          {(["profile", "profile2"] as const).map((slot, index) => {
                            const profile = scoutingProfileLabel(card?.[slot]);
                            const icon = scoutingProfileIcon(profile);
                            const opened = activeSlot === slot;
                            return <button key={slot} type="button" aria-expanded={opened}
                              onClick={() => setProfilePicker(opened ? null : { id: p.id, slot })}>
                              {icon && <img src={icon} alt="" />}
                              {profile || (index === 0 ? "Choisir le profil" : "Ajouter un second profil")}
                            </button>;
                          })}
                        </div>
                        {activeSlot && <fieldset className={styles.profileLibrary}>
                          <legend>{activeSlot === "profile" ? "Icônes · profil principal" : "Icônes · second profil"}</legend>
                          <div className={styles.iconGrid}>
                            {scoutingProfiles.map(profile => <button key={profile} type="button"
                              aria-pressed={scoutingProfileLabel(card?.[activeSlot]) === profile}
                              disabled={scoutingProfileLabel(card?.[activeSlot === "profile" ? "profile2" : "profile"]) === profile}
                              onClick={() => { patchCard(p.id, { [activeSlot]: profile }); setProfilePicker(null); }}>
                              <img src={scoutingProfileIcon(profile)!} alt="" loading="lazy" /><span>{profile}</span>
                            </button>)}
                          </div>
                          <button type="button" onClick={() => { patchCard(p.id, { [activeSlot]: "" }); setProfilePicker(null); }}>Retirer ce profil</button>
                        </fieldset>}
                        <label>Observations
                        <textarea
                          value={card?.notes || ""}
                          onChange={(e) =>
                            patchCard(p.id, { notes: e.target.value })
                          }
                          placeholder="Qualités, habitudes et tendances…"
                        />
                        </label>
                      </div>
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
                    <label>Notre réponse à ce système
                      <textarea value={value.playNotes?.[s.id] || ""} onChange={event => onChange({
                        playNotes: { ...value.playNotes, [s.id]: event.target.value },
                      })} />
                    </label>
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
