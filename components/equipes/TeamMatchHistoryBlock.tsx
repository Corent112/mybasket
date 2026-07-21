"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

type PlayerStatRow = {
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

type PlayerNameRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  prenom?: string | null;
  nom?: string | null;
  name?: string | null;
  full_name?: string | null;
  num?: number | string | null;
  numero?: number | string | null;
};

type ActionRow = {
  context: string | null;
  temps_fort: string | null;
  action_type: string | null;
  shot_type: string | null;
  shot_result: string | null;
  ft_made?: number | null;
  ft_attempts?: number | null;
};

type ModalTab = "resume" | "individual" | "collective" | "moments";

type MatchDetails = {
  loading: boolean;
  playerRows: PlayerStatRow[];
  playerNames: Record<string, string>;
  actionRows: ActionRow[];
};

type CollectiveStats = {
  pts: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  off: number;
  def: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnovers: number;
  pf: number;
};

type MomentRow = {
  key: string;
  label: string;
  possessions: number;
  points: number;
  made: number;
  missed: number;
  turnovers: number;
  ppp: number;
};

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pct = (made: number, attempted: number) =>
  attempted ? `${Math.round((made / attempted) * 1000) / 10}%` : "0%";

const fmt = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function normalizeMoment(value: string | null) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Non renseigné";
}

function playerName(row: PlayerNameRow) {
  const number = row.num ?? row.numero;
  const base =
    row.name ||
    row.full_name ||
    `${row.first_name ?? row.firstName ?? row.prenom ?? ""} ${
      row.last_name ?? row.lastName ?? row.nom ?? ""
    }`.trim() ||
    "Joueur";

  return `${number !== null && number !== undefined && number !== "" ? `#${number} ` : ""}${base}`;
}

function addPlayerRows(rows: PlayerStatRow[]): CollectiveStats {
  return rows.reduce<CollectiveStats>(
    (total, row) => ({
      pts: total.pts + n(row.pts),
      p2m: total.p2m + n(row.p2m),
      p2a: total.p2a + n(row.p2a),
      p3m: total.p3m + n(row.p3m),
      p3a: total.p3a + n(row.p3a),
      ftm: total.ftm + n(row.ftm),
      fta: total.fta + n(row.fta),
      off: total.off + n(row.off_reb),
      def: total.def + n(row.def_reb),
      reb:
        total.reb +
        (n(row.reb) || n(row.off_reb) + n(row.def_reb)),
      ast: total.ast + n(row.ast),
      stl: total.stl + n(row.stl),
      blk: total.blk + n(row.blk),
      turnovers: total.turnovers + n(row.turnovers),
      pf: total.pf + n(row.pf),
    }),
    {
      pts: 0,
      p2m: 0,
      p2a: 0,
      p3m: 0,
      p3a: 0,
      ftm: 0,
      fta: 0,
      off: 0,
      def: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      turnovers: 0,
      pf: 0,
    },
  );
}

function playerEvaluation(row: PlayerStatRow) {
  const rebounds = n(row.reb) || n(row.off_reb) + n(row.def_reb);
  const missed2 = Math.max(0, n(row.p2a) - n(row.p2m));
  const missed3 = Math.max(0, n(row.p3a) - n(row.p3m));
  const missedFt = Math.max(0, n(row.fta) - n(row.ftm));

  return (
    n(row.pts) +
    rebounds +
    n(row.ast) +
    n(row.stl) +
    n(row.blk) -
    missed2 -
    missed3 -
    missedFt -
    n(row.turnovers)
  );
}

function totalEvaluation(rows: PlayerStatRow[]) {
  return rows.reduce((sum, row) => sum + playerEvaluation(row), 0);
}

function pointsFromAction(action: ActionRow) {
  if (action.shot_type === "LF") return n(action.ft_made);

  if (
    action.action_type === "tir" &&
    action.shot_result === "made"
  ) {
    return action.shot_type === "3PTS" ? 3 : 2;
  }

  return 0;
}

function buildMoments(actions: ActionRow[]) {
  const grouped = new Map<string, MomentRow>();

  actions
    .filter((action) => action.context === "attaque")
    .forEach((action) => {
      const key = String(action.temps_fort || "non_renseigne");
      const current = grouped.get(key) || {
        key,
        label: normalizeMoment(action.temps_fort),
        possessions: 0,
        points: 0,
        made: 0,
        missed: 0,
        turnovers: 0,
        ppp: 0,
      };

      current.possessions += 1;
      current.points += pointsFromAction(action);

      if (action.action_type === "tir" && action.shot_result === "made") {
        current.made += 1;
      }

      if (action.action_type === "tir" && action.shot_result === "missed") {
        current.missed += 1;
      }

      if (action.action_type === "perte") {
        current.turnovers += 1;
      }

      grouped.set(key, current);
    });

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      ppp: row.possessions ? row.points / row.possessions : 0,
    }))
    .sort((a, b) => b.ppp - a.ppp);
}

export default function TeamMatchHistoryBlock({ teamId }: { teamId: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchRow | null>(null);
  const [activeTab, setActiveTab] = useState<ModalTab>("resume");
  const [details, setDetails] = useState<MatchDetails>({
    loading: false,
    playerRows: [],
    playerNames: {},
    actionRows: [],
  });
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedMatch) return;

    const matchId = selectedMatch.id;
    let active = true;

    async function loadDetails() {
      setDetails({
        loading: true,
        playerRows: [],
        playerNames: {},
        actionRows: [],
      });

      const [playerResponse, actionResponse] = await Promise.all([
        supabase
          .from("match_player_stats")
          .select(
            "player_id, pts, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, reb, ast, stl, blk, turnovers, pf, present",
          )
          .eq("match_id", matchId),
        supabase
          .from("match_actions")
          .select(
            "context, temps_fort, action_type, shot_type, shot_result, ft_made, ft_attempts",
          )
          .eq("match_id", matchId),
      ]);

      if (!active) return;

      const playerRows = playerResponse.error
        ? []
        : (((playerResponse.data ?? []) as PlayerStatRow[]).filter(
            (row) => row.present !== false,
          ));

      const playerIds = Array.from(
        new Set(
          playerRows
            .map((row) => String(row.player_id || ""))
            .filter(Boolean),
        ),
      );

      let names: Record<string, string> = {};

      if (playerIds.length > 0) {
        const { data: playersData } = await supabase
          .from("players")
          .select("*")
          .in("id", playerIds);

        names = ((playersData ?? []) as PlayerNameRow[]).reduce(
          (result, row) => {
            result[String(row.id)] = playerName(row);
            return result;
          },
          {} as Record<string, string>,
        );
      }

      setDetails({
        loading: false,
        playerRows,
        playerNames: names,
        actionRows: actionResponse.error
          ? []
          : ((actionResponse.data ?? []) as ActionRow[]),
      });
    }

    loadDetails();

    return () => {
      active = false;
    };
  }, [selectedMatch, supabase]);

  useEffect(() => {
    if (!selectedMatch) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedMatch(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [selectedMatch]);

  const lastMatches = useMemo(() => matches.slice(0, 12), [matches]);
  const collective = useMemo(
    () => addPlayerRows(details.playerRows),
    [details.playerRows],
  );
  const moments = useMemo(
    () => buildMoments(details.actionRows),
    [details.actionRows],
  );
  const evaluationTotal = useMemo(
    () => totalEvaluation(details.playerRows),
    [details.playerRows],
  );

  const selectedUs = selectedMatch ? n(selectedMatch.us_score) : 0;
  const selectedThem = selectedMatch ? n(selectedMatch.them_score) : 0;
  const selectedWin = selectedUs > selectedThem;
  const selectedLoss = selectedUs < selectedThem;

  function openSummary(match: MatchRow) {
    setActiveTab("resume");
    setSelectedMatch(match);
  }

  return (
    <>
      <section className="tl-card history-card">
        <div className="block-head">
          <div>
            <p className="eyebrow">Calendrier</p>
            <h2>Historique des matchs</h2>
            <p className="muted">
              Ouvre le résumé pour consulter toutes les feuilles LiveStats du match.
            </p>
          </div>

          <span className="count">
            {matches.length} match{matches.length > 1 ? "s" : ""}
          </span>
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
                <article
                  key={match.id}
                  className={`match-card ${win ? "win" : loss ? "loss" : "draw"}`}
                >
                  <div>
                    <p className="date">{formatDate(match.match_date)}</p>
                    <h3>
                      {match.home === false ? "@" : "vs"}{" "}
                      {match.opponent || "Adversaire"}
                    </h3>
                    <span className="place">
                      {match.home === false ? "Extérieur" : "Domicile"}
                    </span>
                  </div>

                  <div className="score">
                    <strong>
                      {us} - {them}
                    </strong>
                    <span>
                      {win ? "Victoire" : loss ? "Défaite" : "Nul"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="summary-button"
                    onClick={() => openSummary(match)}
                  >
                    Résumé
                    <span aria-hidden="true">→</span>
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {mounted &&
        selectedMatch &&
        createPortal(
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedMatch(null);
            }
          }}
        >
          <section
            className="match-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Résumé du match contre ${
              selectedMatch.opponent || "Adversaire"
            }`}
          >
            <header className="modal-header">
              <div>
                <p className="modal-eyebrow">LiveStats · Feuilles de match</p>
                <h2>
                  {selectedMatch.home === false ? "@" : "vs"}{" "}
                  {selectedMatch.opponent || "Adversaire"}
                </h2>
                <p>
                  {formatDate(selectedMatch.match_date)} ·{" "}
                  {selectedMatch.home === false ? "Extérieur" : "Domicile"}
                </p>
              </div>

              <div className="modal-score">
                <strong>
                  {selectedUs} - {selectedThem}
                </strong>
                <span
                  className={
                    selectedWin ? "win" : selectedLoss ? "loss" : "draw"
                  }
                >
                  {selectedWin
                    ? "Victoire"
                    : selectedLoss
                      ? "Défaite"
                      : "Nul"}
                </span>
              </div>

              <button
                type="button"
                className="close-button"
                aria-label="Fermer"
                onClick={() => {
                  document.body.style.overflow = "";
                  setSelectedMatch(null);
                }}
              >
                ×
              </button>
            </header>

            <nav className="modal-tabs" aria-label="Feuilles de statistiques">
              <button
                type="button"
                className={activeTab === "resume" ? "active" : ""}
                onClick={() => setActiveTab("resume")}
              >
                Résumé
              </button>
              <button
                type="button"
                className={activeTab === "individual" ? "active" : ""}
                onClick={() => setActiveTab("individual")}
              >
                Boxscore individuel
              </button>
              <button
                type="button"
                className={activeTab === "collective" ? "active" : ""}
                onClick={() => setActiveTab("collective")}
              >
                Boxscore collectif
              </button>
              <button
                type="button"
                className={activeTab === "moments" ? "active" : ""}
                onClick={() => setActiveTab("moments")}
              >
                Temps forts
              </button>
            </nav>

            <div className="modal-body">
              {details.loading && (
                <div className="modal-empty">Chargement des feuilles LiveStats…</div>
              )}

              {!details.loading && activeTab === "resume" && (
                <div className="resume-view">
                  <div className="resume-kpis">
                    <SummaryKpi label="Score" value={`${selectedUs} - ${selectedThem}`} />
                    <SummaryKpi label="Points boxscore" value={collective.pts} />
                    <SummaryKpi label="Rebonds" value={collective.reb} />
                    <SummaryKpi label="Passes" value={collective.ast} />
                    <SummaryKpi label="Interceptions" value={collective.stl} />
                    <SummaryKpi label="Balles perdues" value={collective.turnovers} />
                  </div>

                  <div className="resume-columns">
                    <article className="summary-panel">
                      <p className="panel-label">Adresse</p>
                      <h3>Tirs</h3>
                      <div className="summary-lines">
                        <SummaryLine
                          label="Total"
                          value={`${collective.p2m + collective.p3m}/${
                            collective.p2a + collective.p3a
                          }`}
                          detail={pct(
                            collective.p2m + collective.p3m,
                            collective.p2a + collective.p3a,
                          )}
                        />
                        <SummaryLine
                          label="2 points"
                          value={`${collective.p2m}/${collective.p2a}`}
                          detail={pct(collective.p2m, collective.p2a)}
                        />
                        <SummaryLine
                          label="3 points"
                          value={`${collective.p3m}/${collective.p3a}`}
                          detail={pct(collective.p3m, collective.p3a)}
                        />
                        <SummaryLine
                          label="Lancers francs"
                          value={`${collective.ftm}/${collective.fta}`}
                          detail={pct(collective.ftm, collective.fta)}
                        />
                      </div>
                    </article>

                    <article className="summary-panel">
                      <p className="panel-label">Impact collectif</p>
                      <h3>Activité</h3>
                      <div className="summary-lines">
                        <SummaryLine label="Rebonds offensifs" value={collective.off} />
                        <SummaryLine label="Rebonds défensifs" value={collective.def} />
                        <SummaryLine label="Contres" value={collective.blk} />
                        <SummaryLine label="Fautes" value={collective.pf} />
                      </div>
                    </article>

                    <article className="summary-panel">
                      <p className="panel-label">LiveStats</p>
                      <h3>Codification</h3>
                      <div className="summary-lines">
                        <SummaryLine
                          label="Actions codées"
                          value={details.actionRows.length}
                        />
                        <SummaryLine
                          label="Temps forts"
                          value={moments.length}
                        />
                        <SummaryLine
                          label="Joueurs utilisés"
                          value={details.playerRows.length}
                        />
                        <SummaryLine
                          label="PPP du meilleur temps fort"
                          value={moments[0] ? fmt(moments[0].ppp) : "0"}
                        />
                      </div>
                    </article>
                  </div>
                </div>
              )}

              {!details.loading && activeTab === "individual" && (
                <div className="table-shell">
                  {details.playerRows.length === 0 ? (
                    <div className="modal-empty">
                      Aucun boxscore individuel enregistré pour ce match.
                    </div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th className="left">Joueur</th>
                          <th>PTS</th>
                          <th>2PTS</th>
                          <th>3PTS</th>
                          <th>LF</th>
                          <th>RO</th>
                          <th>RD</th>
                          <th>REB</th>
                          <th>PD</th>
                          <th>INT</th>
                          <th>CTR</th>
                          <th>BP</th>
                          <th>F</th>
                          <th>ÉVAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.playerRows.map((row, index) => {
                          const playerId = String(row.player_id || "");
                          return (
                            <tr key={`${playerId}-${index}`}>
                              <td className="left player-cell">
                                {details.playerNames[playerId] ||
                                  `Joueur ${playerId.slice(0, 8)}`}
                              </td>
                              <td className="strong">{n(row.pts)}</td>
                              <td>
                                {n(row.p2m)}-{n(row.p2a)}
                              </td>
                              <td>
                                {n(row.p3m)}-{n(row.p3a)}
                              </td>
                              <td>
                                {n(row.ftm)}-{n(row.fta)}
                              </td>
                              <td>{n(row.off_reb)}</td>
                              <td>{n(row.def_reb)}</td>
                              <td>
                                {n(row.reb) ||
                                  n(row.off_reb) + n(row.def_reb)}
                              </td>
                              <td>{n(row.ast)}</td>
                              <td>{n(row.stl)}</td>
                              <td>{n(row.blk)}</td>
                              <td>{n(row.turnovers)}</td>
                              <td>{n(row.pf)}</td>
                              <td className="evaluation">
                                {playerEvaluation(row)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="left">TOTAL</td>
                          <td>{collective.pts}</td>
                          <td>
                            {collective.p2m}-{collective.p2a}
                          </td>
                          <td>
                            {collective.p3m}-{collective.p3a}
                          </td>
                          <td>
                            {collective.ftm}-{collective.fta}
                          </td>
                          <td>{collective.off}</td>
                          <td>{collective.def}</td>
                          <td>{collective.reb}</td>
                          <td>{collective.ast}</td>
                          <td>{collective.stl}</td>
                          <td>{collective.blk}</td>
                          <td>{collective.turnovers}</td>
                          <td>{collective.pf}</td>
                          <td className="evaluation">{evaluationTotal}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}

              {!details.loading && activeTab === "collective" && (
                <div className="collective-view">
                  <div className="collective-grid">
                    <CollectiveCard
                      title="Total tirs"
                      main={`${collective.p2m + collective.p3m}/${
                        collective.p2a + collective.p3a
                      }`}
                      detail={pct(
                        collective.p2m + collective.p3m,
                        collective.p2a + collective.p3a,
                      )}
                    />
                    <CollectiveCard
                      title="2 points"
                      main={`${collective.p2m}/${collective.p2a}`}
                      detail={pct(collective.p2m, collective.p2a)}
                    />
                    <CollectiveCard
                      title="3 points"
                      main={`${collective.p3m}/${collective.p3a}`}
                      detail={pct(collective.p3m, collective.p3a)}
                    />
                    <CollectiveCard
                      title="Lancers francs"
                      main={`${collective.ftm}/${collective.fta}`}
                      detail={pct(collective.ftm, collective.fta)}
                    />
                  </div>

                  <div className="table-shell compact">
                    <table>
                      <thead>
                        <tr>
                          <th>PTS</th>
                          <th>RO</th>
                          <th>RD</th>
                          <th>REB</th>
                          <th>PD</th>
                          <th>INT</th>
                          <th>CTR</th>
                          <th>BP</th>
                          <th>F</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="strong">{collective.pts}</td>
                          <td>{collective.off}</td>
                          <td>{collective.def}</td>
                          <td>{collective.reb}</td>
                          <td>{collective.ast}</td>
                          <td>{collective.stl}</td>
                          <td>{collective.blk}</td>
                          <td>{collective.turnovers}</td>
                          <td>{collective.pf}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!details.loading && activeTab === "moments" && (
                <div className="table-shell">
                  {moments.length === 0 ? (
                    <div className="modal-empty">
                      Aucun temps fort enregistré dans LiveStats pour ce match.
                    </div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th className="left">Temps fort</th>
                          <th>Poss.</th>
                          <th>Points</th>
                          <th>PPP</th>
                          <th>Réussis</th>
                          <th>Ratés</th>
                          <th>BP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {moments.map((row) => (
                          <tr key={row.key}>
                            <td className="left player-cell">{row.label}</td>
                            <td>{row.possessions}</td>
                            <td>{row.points}</td>
                            <td
                              className={
                                row.ppp >= 1
                                  ? "good"
                                  : row.ppp >= 0.8
                                    ? "medium"
                                    : "bad"
                              }
                            >
                              {fmt(row.ppp)}
                            </td>
                            <td>{row.made}</td>
                            <td>{row.missed}</td>
                            <td>{row.turnovers}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
,
          document.body,
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

        .eyebrow,
        .modal-eyebrow,
        .panel-label {
          margin: 0;
          color: #d4a24c;
          font-size: 0.76rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        h2 {
          margin: 0.2rem 0 0;
          color: #6b1a2c;
          font-size: 1.45rem;
          font-weight: 950;
        }

        .muted {
          margin: 0.3rem 0 0;
          color: #8e817b;
          font-size: 0.92rem;
        }

        .count {
          display: inline-flex;
          border-radius: 999px;
          background: #fff8ef;
          color: #6b1a2c;
          border: 1px solid #eadccc;
          padding: 0.45rem 0.75rem;
          font-weight: 950;
          font-size: 0.8rem;
        }

        .empty,
        .modal-empty {
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
          gap: 0.85rem;
        }

        .match-card {
          border: 1px solid #efe6db;
          border-radius: 18px;
          background: #fffdf9;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          min-height: 190px;
          box-shadow: 0 10px 24px rgba(60, 30, 20, 0.04);
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
          font-weight: 950;
          text-transform: uppercase;
        }

        .match-card h3 {
          margin: 0.25rem 0;
          color: #6b1a2c;
          font-size: 1rem;
          font-weight: 950;
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
          font-weight: 950;
        }

        .score span {
          display: inline-flex;
          margin-top: 0.25rem;
          border-radius: 999px;
          background: #f5efe6;
          color: #6b1a2c;
          padding: 0.2rem 0.55rem;
          font-size: 0.75rem;
          font-weight: 950;
        }

        .summary-button {
          width: 100%;
          min-height: 42px;
          margin-top: auto;
          border: 0;
          border-radius: 12px;
          background: #6b1a2c;
          color: #fff;
          padding: 0.7rem 0.9rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
          font-weight: 950;
          cursor: pointer;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          padding: 2rem;
          background: rgba(19, 12, 15, 0.72);
          backdrop-filter: blur(7px);
        }

        .match-modal {
          width: min(1380px, 96vw);
          max-height: 92vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #eadfd5;
          border-radius: 24px;
          background: #fff;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 1.5rem;
          padding: 1.3rem 4.2rem 1.3rem 1.5rem;
          background: linear-gradient(135deg, #6b1a2c, #3f0d19);
          color: #fff;
        }

        .modal-header h2 {
          margin: 0.25rem 0 0;
          color: #fff;
          font-size: 1.75rem;
        }

        .modal-header p:not(.modal-eyebrow) {
          margin: 0.35rem 0 0;
          color: rgba(255, 255, 255, 0.75);
          font-weight: 750;
        }

        .modal-score {
          text-align: right;
        }

        .modal-score strong {
          display: block;
          font-size: 2.1rem;
          font-weight: 950;
        }

        .modal-score span {
          display: inline-flex;
          margin-top: 0.25rem;
          border-radius: 999px;
          padding: 0.25rem 0.65rem;
          background: rgba(255, 255, 255, 0.15);
          font-weight: 950;
        }

        .close-button {
          position: absolute;
          top: 1rem;
          right: 1rem;
          width: 40px;
          height: 40px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          font-size: 1.6rem;
          line-height: 1;
          cursor: pointer;
        }

        .modal-tabs {
          display: flex;
          gap: 0.55rem;
          padding: 0.85rem 1.2rem;
          overflow-x: auto;
          border-bottom: 1px solid #eadfd5;
          background: #fff8ef;
        }

        .modal-tabs button {
          min-height: 42px;
          border: 1px solid #eadccc;
          border-radius: 999px;
          background: #fff;
          color: #6b1a2c;
          padding: 0.65rem 1rem;
          white-space: nowrap;
          font-weight: 950;
          cursor: pointer;
        }

        .modal-tabs button.active {
          border-color: #6b1a2c;
          background: #6b1a2c;
          color: #fff;
        }

        .modal-body {
          flex: 1;
          overflow: auto;
          padding: 1.25rem;
          background: #fbf8f4;
        }

        .resume-kpis {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.8rem;
          margin-bottom: 1rem;
        }

        .resume-kpis :global(.summary-kpi) {
          min-height: 100px;
          border: 1px solid #eadfd5;
          border-radius: 17px;
          background: #fff;
          padding: 1rem;
        }

        .resume-kpis :global(.summary-kpi span) {
          display: block;
          color: #8b7f79;
          font-size: 0.72rem;
          font-weight: 950;
          text-transform: uppercase;
        }

        .resume-kpis :global(.summary-kpi strong) {
          display: block;
          margin-top: 0.35rem;
          color: #6b1a2c;
          font-size: 1.5rem;
          font-weight: 950;
        }

        .resume-columns {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
        }

        .summary-panel {
          border: 1px solid #eadfd5;
          border-radius: 18px;
          background: #fff;
          padding: 1.1rem;
        }

        .summary-panel h3 {
          margin: 0.3rem 0 0.9rem;
          color: #6b1a2c;
          font-size: 1.15rem;
          font-weight: 950;
        }

        .summary-lines {
          display: grid;
          gap: 0;
        }

        .summary-lines :global(.summary-line) {
          min-height: 48px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 0.65rem;
          border-top: 1px solid #eee6df;
        }

        .summary-lines :global(.summary-line:first-child) {
          border-top: 0;
        }

        .summary-lines :global(.summary-line span) {
          color: #5e5653;
          font-weight: 750;
        }

        .summary-lines :global(.summary-line strong) {
          color: #211d1e;
          font-weight: 950;
        }

        .summary-lines :global(.summary-line small) {
          min-width: 54px;
          color: #6b1a2c;
          text-align: right;
          font-weight: 950;
        }

        .table-shell {
          width: 100%;
          overflow-x: auto;
          border: 1px solid #eadfd5;
          border-radius: 18px;
          background: #fff;
        }

        .table-shell.compact {
          margin-top: 1rem;
        }

        table {
          width: 100%;
          min-width: 1050px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.84rem;
        }

        th {
          background: linear-gradient(180deg, #7a1c32, #571123);
          color: #fff;
          padding: 0.85rem 0.65rem;
          text-align: center;
          vertical-align: middle;
          white-space: nowrap;
          font-weight: 950;
          border-right: 1px solid rgba(255, 255, 255, 0.14);
        }

        td {
          height: 54px;
          padding: 0.75rem 0.65rem;
          border-right: 1px solid #e7e1dc;
          border-bottom: 1px solid #e7e1dc;
          text-align: center;
          vertical-align: middle;
          white-space: nowrap;
          color: #211d1e;
          font-weight: 750;
        }

        tbody tr:nth-child(even) td {
          background: #fcfaf9;
        }

        tfoot td {
          background: #fff4e4;
          color: #6b1a2c;
          font-weight: 950;
        }

        .left {
          min-width: 210px;
          text-align: left;
          padding-left: 1rem;
        }

        .player-cell {
          color: #6b1a2c;
          font-weight: 950;
        }

        .strong {
          color: #6b1a2c;
          font-weight: 950;
        }

        .evaluation {
          color: #d4a24c;
          font-weight: 950;
          background: #fffaf0;
        }

        tfoot .evaluation {
          color: #6b1a2c;
          background: #f7e7ca;
        }

        .good {
          color: #177245;
          font-weight: 950;
        }

        .medium {
          color: #a9772a;
          font-weight: 950;
        }

        .bad {
          color: #b42318;
          font-weight: 950;
        }

        .collective-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.9rem;
        }

        .collective-grid :global(.collective-card) {
          min-height: 145px;
          border: 1px solid #eadfd5;
          border-radius: 18px;
          background: #fff;
          padding: 1.1rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          text-align: center;
        }

        .collective-grid :global(.collective-card span) {
          color: #8b7f79;
          font-size: 0.75rem;
          font-weight: 950;
          text-transform: uppercase;
        }

        .collective-grid :global(.collective-card strong) {
          display: block;
          margin-top: 0.45rem;
          color: #6b1a2c;
          font-size: 2rem;
          font-weight: 950;
        }

        .collective-grid :global(.collective-card small) {
          display: block;
          margin-top: 0.25rem;
          color: #177245;
          font-size: 1rem;
          font-weight: 950;
        }

        @media (max-width: 1100px) {
          .match-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .resume-kpis {
            grid-template-columns: repeat(3, 1fr);
          }

          .resume-columns,
          .collective-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .block-head,
          .modal-header {
            grid-template-columns: 1fr;
            flex-direction: column;
          }

          .match-grid,
          .resume-kpis,
          .resume-columns,
          .collective-grid {
            grid-template-columns: 1fr;
          }

          .modal-backdrop {
            padding: 0;
          }

          .match-modal {
            width: 100vw;
            max-height: 100vh;
            min-height: 100vh;
            border-radius: 0;
          }

          .modal-score {
            text-align: left;
          }
        }
      `}</style>
    </>
  );
}

function SummaryKpi({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <article className="summary-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function SummaryLine({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail || ""}</small>
    </div>
  );
}

function CollectiveCard({
  title,
  main,
  detail,
}: {
  title: string;
  main: string;
  detail: string;
}) {
  return (
    <article className="collective-card">
      <span>{title}</span>
      <strong>{main}</strong>
      <small>{detail}</small>
    </article>
  );
}
