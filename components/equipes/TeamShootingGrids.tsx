"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Player } from "@/types/player";

type Grid = {
  id: string;
  team_id: string;
  owner_id: string;
  name: string;
  player_id: string | null;
  subject_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type GridRow = {
  id: string;
  grid_id: string;
  name: string;
  sort_order: number;
  target_attempts: number | null;
  target_percentage: number | null;
};

type GridSession = {
  id: string;
  grid_id: string;
  session_date: string;
  notes: string | null;
  created_at: string;
};

type GridResult = {
  session_id: string;
  row_id: string;
  made: number;
  attempted: number;
};

type ResultMap = Record<string, Record<string, GridResult>>;

const DEFAULT_ROWS = [
  "Corner gauche 3pts",
  "Aile gauche 3pts",
  "Axe 3pts",
  "Aile droite 3pts",
  "Corner droite 3pts",
  "Mid-range gauche",
  "Mid-range droite",
  "Finition main droite",
  "Finition main gauche",
  "Lancers francs",
];

function safeInt(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function percentage(made: number, attempted: number) {
  if (!attempted) return 0;
  return Math.round((made / attempted) * 1000) / 10;
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
}

export default function TeamShootingGrids({
  teamId,
  players,
  canEdit,
}: {
  teamId: string;
  players: Player[];
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [selectedGridId, setSelectedGridId] = useState("");
  const [rows, setRows] = useState<GridRow[]>([]);
  const [sessions, setSessions] = useState<GridSession[]>([]);
  const [results, setResults] = useState<ResultMap>({});
  const [newDate, setNewDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [message, setMessage] = useState("");

  const selectedGrid =
    grids.find((grid) => grid.id === selectedGridId) ?? null;

  const notify = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(""), 2200);
  };

  const loadGridData = useCallback(
    async (gridId: string) => {
      if (!gridId) {
        setRows([]);
        setSessions([]);
        setResults({});
        return;
      }

      const [{ data: rowData, error: rowError }, { data: sessionData, error: sessionError }] =
        await Promise.all([
          supabase
            .from("shooting_grid_rows")
            .select("*")
            .eq("grid_id", gridId)
            .order("sort_order"),
          supabase
            .from("shooting_grid_sessions")
            .select("*")
            .eq("grid_id", gridId)
            .order("session_date")
            .order("created_at"),
        ]);

      if (rowError) throw rowError;
      if (sessionError) throw sessionError;

      const nextRows = (rowData ?? []) as GridRow[];
      const nextSessions = (sessionData ?? []) as GridSession[];

      setRows(nextRows);
      setSessions(nextSessions);

      if (!nextSessions.length) {
        setResults({});
        return;
      }

      const { data: resultData, error: resultError } = await supabase
        .from("shooting_grid_results")
        .select("*")
        .in(
          "session_id",
          nextSessions.map((session) => session.id),
        );

      if (resultError) throw resultError;

      const map: ResultMap = {};

      for (const result of (resultData ?? []) as GridResult[]) {
        if (!map[result.session_id]) map[result.session_id] = {};
        map[result.session_id][result.row_id] = result;
      }

      setResults(map);
    },
    [supabase],
  );

  const loadGrids = useCallback(
    async (preferredId?: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from("shooting_grids")
        .select("*")
        .eq("team_id", teamId)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const next = (data ?? []) as Grid[];
      setGrids(next);

      const nextId =
        preferredId && next.some((grid) => grid.id === preferredId)
          ? preferredId
          : selectedGridId &&
              next.some((grid) => grid.id === selectedGridId)
            ? selectedGridId
            : next[0]?.id || "";

      setSelectedGridId(nextId);
      await loadGridData(nextId);
    },
    [loadGridData, selectedGridId, supabase, teamId],
  );

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        await loadGrids();
      } catch (error) {
        console.error("Erreur grilles de tirs équipe :", error);
        if (active) notify("Impossible de charger les grilles.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createGrid() {
    if (!canEdit || !userId) return;

    setSaving(true);

    try {
      const { data: grid, error } = await supabase
        .from("shooting_grids")
        .insert({
          team_id: teamId,
          owner_id: userId,
          name: "Nouvelle grille de tirs",
          subject_name: "Équipe / groupe",
          player_id: null,
          description: "",
        })
        .select("*")
        .single();

      if (error) throw error;

      const { error: rowError } = await supabase
        .from("shooting_grid_rows")
        .insert(
          DEFAULT_ROWS.map((name, index) => ({
            grid_id: grid.id,
            name,
            sort_order: index,
            target_attempts: 10,
            target_percentage: null,
          })),
        );

      if (rowError) throw rowError;

      await loadGrids(grid.id);
      notify("Grille créée.");
    } catch (error) {
      console.error(error);
      notify("Impossible de créer la grille.");
    } finally {
      setSaving(false);
    }
  }

  function patchGrid(patch: Partial<Grid>) {
    if (!selectedGrid) return;

    setGrids((current) =>
      current.map((grid) =>
        grid.id === selectedGrid.id ? { ...grid, ...patch } : grid,
      ),
    );
  }

  async function saveDefinition() {
    if (!selectedGrid || !canEdit) return;

    setSaving(true);

    try {
      const chosenPlayer = players.find(
        (player) => String(player.id) === selectedGrid.player_id,
      );

      const { error } = await supabase
        .from("shooting_grids")
        .update({
          name: selectedGrid.name.trim() || "Grille de tirs",
          player_id: selectedGrid.player_id || null,
          subject_name: selectedGrid.player_id
            ? `${chosenPlayer?.firstName ?? ""} ${chosenPlayer?.lastName ?? ""}`.trim()
            : selectedGrid.subject_name?.trim() || "Équipe / groupe",
          description: selectedGrid.description?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedGrid.id);

      if (error) throw error;

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];

        const { error: rowError } = await supabase
          .from("shooting_grid_rows")
          .update({
            name: row.name.trim() || `Position ${index + 1}`,
            sort_order: index,
            target_attempts:
              row.target_attempts === null
                ? null
                : safeInt(row.target_attempts),
            target_percentage:
              row.target_percentage === null
                ? null
                : Math.min(100, Math.max(0, Number(row.target_percentage))),
          })
          .eq("id", row.id);

        if (rowError) throw rowError;
      }

      await loadGrids(selectedGrid.id);
      notify("Fiche enregistrée.");
    } catch (error) {
      console.error(error);
      notify("Erreur pendant l’enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  async function addRow() {
    if (!selectedGrid || !canEdit) return;

    const { data, error } = await supabase
      .from("shooting_grid_rows")
      .insert({
        grid_id: selectedGrid.id,
        name: `Position ${rows.length + 1}`,
        sort_order: rows.length,
        target_attempts: 10,
      })
      .select("*")
      .single();

    if (error) {
      console.error(error);
      notify("Impossible d’ajouter une position.");
      return;
    }

    setRows((current) => [...current, data as GridRow]);
  }

  async function removeRow(rowId: string) {
    if (!canEdit) return;
    if (rows.length <= 1) {
      notify("La grille doit garder au moins une position.");
      return;
    }

    if (!window.confirm("Supprimer cette position et ses résultats ?")) return;

    const { error } = await supabase
      .from("shooting_grid_rows")
      .delete()
      .eq("id", rowId);

    if (error) {
      console.error(error);
      notify("Impossible de supprimer cette position.");
      return;
    }

    setRows((current) => current.filter((row) => row.id !== rowId));
  }

  function moveRow(rowId: string, direction: -1 | 1) {
    if (!canEdit) return;

    setRows((current) => {
      const index = current.findIndex((row) => row.id === rowId);
      const target = index + direction;

      if (index < 0 || target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];

      return next.map((row, sort_order) => ({ ...row, sort_order }));
    });
  }

  async function duplicateGrid() {
    if (!selectedGrid || !canEdit || !userId) return;

    setSaving(true);

    try {
      const { data: copy, error } = await supabase
        .from("shooting_grids")
        .insert({
          team_id: teamId,
          owner_id: userId,
          name: `${selectedGrid.name} - copie`,
          player_id: selectedGrid.player_id,
          subject_name: selectedGrid.subject_name,
          description: selectedGrid.description,
        })
        .select("*")
        .single();

      if (error) throw error;

      if (rows.length) {
        const { error: rowError } = await supabase
          .from("shooting_grid_rows")
          .insert(
            rows.map((row, index) => ({
              grid_id: copy.id,
              name: row.name,
              sort_order: index,
              target_attempts: row.target_attempts,
              target_percentage: row.target_percentage,
            })),
          );

        if (rowError) throw rowError;
      }

      await loadGrids(copy.id);
      notify("Grille dupliquée sans les anciens résultats.");
    } catch (error) {
      console.error(error);
      notify("Impossible de dupliquer la grille.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGrid() {
    if (!selectedGrid || !canEdit) return;

    if (!window.confirm(`Supprimer "${selectedGrid.name}" ?`)) return;

    const { error } = await supabase
      .from("shooting_grids")
      .delete()
      .eq("id", selectedGrid.id);

    if (error) {
      console.error(error);
      notify("Impossible de supprimer la grille.");
      return;
    }

    setSelectedGridId("");
    await loadGrids();
    notify("Grille supprimée.");
  }

  async function addSession() {
    if (!selectedGrid || !canEdit || !userId || !newDate) return;

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("shooting_grid_sessions")
        .insert({
          grid_id: selectedGrid.id,
          owner_id: userId,
          session_date: newDate,
        })
        .select("*")
        .single();

      if (error) throw error;

      const session = data as GridSession;

      setSessions((current) =>
        [...current, session].sort((a, b) =>
          a.session_date.localeCompare(b.session_date),
        ),
      );

      setResults((current) => ({
        ...current,
        [session.id]: {},
      }));

      notify("Nouvelle date ajoutée.");
    } catch (error) {
      console.error(error);
      notify("Impossible d’ajouter cette date.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSession(session: GridSession) {
    if (!canEdit) return;

    if (
      !window.confirm(
        `Supprimer les résultats du ${formatDate(session.session_date)} ?`,
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("shooting_grid_sessions")
      .delete()
      .eq("id", session.id);

    if (error) {
      console.error(error);
      notify("Impossible de supprimer cette date.");
      return;
    }

    setSessions((current) =>
      current.filter((item) => item.id !== session.id),
    );

    setResults((current) => {
      const next = { ...current };
      delete next[session.id];
      return next;
    });
  }

  function setResult(
    sessionId: string,
    rowId: string,
    key: "made" | "attempted",
    rawValue: string,
  ) {
    if (!canEdit) return;

    const value = safeInt(rawValue);

    setResults((current) => {
      const previous = current[sessionId]?.[rowId] ?? {
        session_id: sessionId,
        row_id: rowId,
        made: 0,
        attempted: 0,
      };

      let made = key === "made" ? value : previous.made;
      let attempted = key === "attempted" ? value : previous.attempted;

      if (key === "made" && attempted > 0 && made > attempted) {
        attempted = made;
      }

      if (key === "attempted" && made > attempted) {
        made = attempted;
      }

      return {
        ...current,
        [sessionId]: {
          ...(current[sessionId] ?? {}),
          [rowId]: {
            ...previous,
            made,
            attempted,
          },
        },
      };
    });
  }

  async function saveResults() {
    if (!selectedGrid || !canEdit) return;

    setSaving(true);

    try {
      const payload: GridResult[] = [];

      for (const session of sessions) {
        for (const row of rows) {
          const result = results[session.id]?.[row.id];
          if (!result) continue;

          const attempted = safeInt(result.attempted);
          const made = Math.min(safeInt(result.made), attempted);

          payload.push({
            session_id: session.id,
            row_id: row.id,
            made,
            attempted,
          });
        }
      }

      if (payload.length) {
        const { error } = await supabase
          .from("shooting_grid_results")
          .upsert(payload, {
            onConflict: "session_id,row_id",
          });

        if (error) throw error;
      }

      await supabase
        .from("shooting_grids")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", selectedGrid.id);

      await loadGridData(selectedGrid.id);
      notify("Résultats enregistrés.");
    } catch (error) {
      console.error(error);
      notify("Erreur pendant l’enregistrement des résultats.");
    } finally {
      setSaving(false);
    }
  }

  const rowStats = useMemo(() => {
    const map: Record<
      string,
      {
        made: number;
        attempted: number;
        pct: number;
        record: number;
        average: number;
      }
    > = {};

    for (const row of rows) {
      let made = 0;
      let attempted = 0;
      let record = 0;
      let madeSum = 0;
      let countedSessions = 0;

      for (const session of sessions) {
        const result = results[session.id]?.[row.id];

        if (!result || result.attempted <= 0) continue;

        const currentMade = safeInt(result.made);
        const currentAttempted = safeInt(result.attempted);

        made += currentMade;
        attempted += currentAttempted;
        record = Math.max(record, currentMade);
        madeSum += currentMade;
        countedSessions += 1;
      }

      map[row.id] = {
        made,
        attempted,
        pct: percentage(made, attempted),
        record,
        average:
          countedSessions > 0
            ? Math.round((madeSum / countedSessions) * 10) / 10
            : 0,
      };
    }

    return map;
  }, [results, rows, sessions]);

  const globalStats = useMemo(() => {
    let made = 0;
    let attempted = 0;

    Object.values(rowStats).forEach((stats) => {
      made += stats.made;
      attempted += stats.attempted;
    });

    return {
      made,
      attempted,
      pct: percentage(made, attempted),
    };
  }, [rowStats]);

  const sessionTotals = useMemo(() => {
    const map: Record<
      string,
      { made: number; attempted: number; pct: number }
    > = {};

    for (const session of sessions) {
      let made = 0;
      let attempted = 0;

      for (const row of rows) {
        const result = results[session.id]?.[row.id];
        if (!result) continue;
        made += safeInt(result.made);
        attempted += safeInt(result.attempted);
      }

      map[session.id] = {
        made,
        attempted,
        pct: percentage(made, attempted),
      };
    }

    return map;
  }, [results, rows, sessions]);

  if (loading) {
    return <div className="shoot-loading">Chargement des grilles de tirs…</div>;
  }

  return (
    <section className="team-shooting">
      <div className="shoot-head">
        <div>
          <p className="shoot-eyebrow">Performance</p>
          <h2>Grilles de tirs</h2>
          <p>
            Une même grille peut être utilisée autant de fois que nécessaire.
            Chaque date conserve ses résultats et alimente les statistiques
            cumulées.
          </p>
        </div>

        {canEdit && (
          <button className="primary" onClick={createGrid} disabled={saving}>
            + Nouvelle grille
          </button>
        )}
      </div>

      {message && <div className="shoot-toast">{message}</div>}

      {!grids.length ? (
        <div className="shoot-empty">
          <strong>Aucune grille pour cette équipe.</strong>
          <span>
            Crée une fiche pour un joueur ou pour le groupe, puis réutilise-la
            à chaque nouvelle date.
          </span>
        </div>
      ) : (
        <>
          <div className="shoot-selector">
            <label>
              <span>Grille</span>
              <select
                value={selectedGridId}
                onChange={async (event) => {
                  setSelectedGridId(event.target.value);
                  await loadGridData(event.target.value);
                }}
              >
                {grids.map((grid) => (
                  <option value={grid.id} key={grid.id}>
                    {grid.name}
                    {grid.subject_name ? ` · ${grid.subject_name}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {canEdit && selectedGrid && (
              <div className="shoot-actions">
                <button onClick={duplicateGrid}>Dupliquer</button>
                <button className="danger" onClick={deleteGrid}>
                  Supprimer
                </button>
              </div>
            )}
          </div>

          {selectedGrid && (
            <>
              <div className="shoot-card">
                <div className="card-title">
                  <div>
                    <p className="shoot-eyebrow">Configuration</p>
                    <h3>Construire la fiche</h3>
                  </div>

                  {canEdit && (
                    <button className="primary" onClick={saveDefinition}>
                      Enregistrer la fiche
                    </button>
                  )}
                </div>

                <div className="shoot-fields">
                  <label>
                    <span>Nom de la grille</span>
                    <input
                      disabled={!canEdit}
                      value={selectedGrid.name}
                      onChange={(event) =>
                        patchGrid({ name: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    <span>Joueur</span>
                    <select
                      disabled={!canEdit}
                      value={selectedGrid.player_id ?? ""}
                      onChange={(event) => {
                        const playerId = event.target.value || null;
                        const player = players.find(
                          (item) => String(item.id) === playerId,
                        );

                        patchGrid({
                          player_id: playerId,
                          subject_name: playerId
                            ? `${player?.firstName ?? ""} ${player?.lastName ?? ""}`.trim()
                            : "Équipe / groupe",
                        });
                      }}
                    >
                      <option value="">Équipe / groupe</option>
                      {players.map((player) => (
                        <option value={String(player.id)} key={String(player.id)}>
                          {player.firstName} {player.lastName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="wide">
                    <span>Description / objectif</span>
                    <input
                      disabled={!canEdit}
                      value={selectedGrid.description ?? ""}
                      onChange={(event) =>
                        patchGrid({ description: event.target.value })
                      }
                      placeholder="Ex. 100 tirs après entraînement"
                    />
                  </label>
                </div>

                <div className="row-editor">
                  {rows.map((row, index) => (
                    <div className="editor-row" key={row.id}>
                      {canEdit && (
                        <div className="move-buttons">
                          <button
                            onClick={() => moveRow(row.id, -1)}
                            disabled={index === 0}
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveRow(row.id, 1)}
                            disabled={index === rows.length - 1}
                          >
                            ↓
                          </button>
                        </div>
                      )}

                      <input
                        disabled={!canEdit}
                        value={row.name}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />

                      <label>
                        <span>Tirs prévus</span>
                        <input
                          disabled={!canEdit}
                          type="number"
                          min={0}
                          value={row.target_attempts ?? ""}
                          onChange={(event) =>
                            setRows((current) =>
                              current.map((item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      target_attempts:
                                        event.target.value === ""
                                          ? null
                                          : safeInt(event.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>

                      <label>
                        <span>Objectif %</span>
                        <input
                          disabled={!canEdit}
                          type="number"
                          min={0}
                          max={100}
                          value={row.target_percentage ?? ""}
                          onChange={(event) =>
                            setRows((current) =>
                              current.map((item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      target_percentage:
                                        event.target.value === ""
                                          ? null
                                          : Math.min(
                                              100,
                                              Math.max(
                                                0,
                                                Number(event.target.value),
                                              ),
                                            ),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>

                      {canEdit && (
                        <button
                          className="row-delete"
                          onClick={() => removeRow(row.id)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}

                  {canEdit && (
                    <button className="add-row" onClick={addRow}>
                      + Ajouter une position
                    </button>
                  )}
                </div>
              </div>

              <div className="shoot-kpis">
                <div>
                  <span>Utilisations</span>
                  <strong>{sessions.length}</strong>
                </div>
                <div>
                  <span>Marqués</span>
                  <strong>{globalStats.made}</strong>
                </div>
                <div>
                  <span>Tentés</span>
                  <strong>{globalStats.attempted}</strong>
                </div>
                <div>
                  <span>% cumulé</span>
                  <strong>{globalStats.pct}%</strong>
                </div>
              </div>

              <div className="shoot-card">
                <div className="card-title">
                  <div>
                    <p className="shoot-eyebrow">Historique</p>
                    <h3>Résultats</h3>
                  </div>

                  {canEdit && (
                    <div className="date-adder">
                      <input
                        type="date"
                        value={newDate}
                        onChange={(event) => setNewDate(event.target.value)}
                      />
                      <button className="primary" onClick={addSession}>
                        + Ajouter la date
                      </button>
                    </div>
                  )}
                </div>

                {!sessions.length ? (
                  <div className="shoot-empty">
                    Ajoute une première date pour commencer la saisie.
                  </div>
                ) : (
                  <>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th rowSpan={2} className="sticky-col">
                              Position
                            </th>

                            {sessions.map((session) => (
                              <th
                                colSpan={3}
                                className="date-head"
                                key={session.id}
                              >
                                <span>{formatDate(session.session_date)}</span>
                                {canEdit && (
                                  <button
                                    onClick={() => removeSession(session)}
                                    title="Supprimer cette date"
                                  >
                                    ×
                                  </button>
                                )}
                              </th>
                            ))}

                            <th rowSpan={2}>Marqué total</th>
                            <th rowSpan={2}>Tenté total</th>
                            <th rowSpan={2}>% global</th>
                            <th rowSpan={2}>Record</th>
                            <th rowSpan={2}>Moyenne</th>
                          </tr>

                          <tr>
                            {sessions.map((session) => (
                              <FragmentHeaders key={session.id} />
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {rows.map((row) => {
                            const stats = rowStats[row.id] ?? {
                              made: 0,
                              attempted: 0,
                              pct: 0,
                              record: 0,
                              average: 0,
                            };

                            return (
                              <tr key={row.id}>
                                <th className="sticky-col row-name">
                                  <strong>{row.name}</strong>
                                  <small>
                                    {row.target_attempts !== null
                                      ? `${row.target_attempts} tirs`
                                      : ""}
                                    {row.target_percentage !== null
                                      ? ` · Obj. ${row.target_percentage}%`
                                      : ""}
                                  </small>
                                </th>

                                {sessions.map((session) => {
                                  const result =
                                    results[session.id]?.[row.id] ?? {
                                      session_id: session.id,
                                      row_id: row.id,
                                      made: 0,
                                      attempted: 0,
                                    };

                                  return (
                                    <ResultCells
                                      key={`${session.id}-${row.id}`}
                                      canEdit={canEdit}
                                      made={result.made}
                                      attempted={result.attempted}
                                      onMade={(value) =>
                                        setResult(
                                          session.id,
                                          row.id,
                                          "made",
                                          value,
                                        )
                                      }
                                      onAttempted={(value) =>
                                        setResult(
                                          session.id,
                                          row.id,
                                          "attempted",
                                          value,
                                        )
                                      }
                                    />
                                  );
                                })}

                                <td className="summary-cell">{stats.made}</td>
                                <td className="summary-cell">
                                  {stats.attempted}
                                </td>
                                <td className="summary-cell accent">
                                  {stats.pct}%
                                </td>
                                <td className="summary-cell record">
                                  {stats.record}
                                </td>
                                <td className="summary-cell">
                                  {stats.average}
                                </td>
                              </tr>
                            );
                          })}

                          <tr className="total-row">
                            <th className="sticky-col">TOTAL</th>

                            {sessions.map((session) => {
                              const totals = sessionTotals[session.id] ?? {
                                made: 0,
                                attempted: 0,
                                pct: 0,
                              };

                              return (
                                <FragmentTotals
                                  key={session.id}
                                  made={totals.made}
                                  attempted={totals.attempted}
                                  pct={totals.pct}
                                />
                              );
                            })}

                            <td>{globalStats.made}</td>
                            <td>{globalStats.attempted}</td>
                            <td>{globalStats.pct}%</td>
                            <td>
                              {Object.values(rowStats).reduce(
                                (record, stats) =>
                                  Math.max(record, stats.record),
                                0,
                              )}
                            </td>
                            <td>
                              {sessions.length
                                ? Math.round(
                                    (globalStats.made / sessions.length) * 10,
                                  ) / 10
                                : 0}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {canEdit && (
                      <div className="save-results">
                        <button
                          className="primary"
                          onClick={saveResults}
                          disabled={saving}
                        >
                          {saving
                            ? "Enregistrement…"
                            : "Enregistrer les résultats"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      <style jsx>{`
        .team-shooting {
          display: grid;
          gap: 16px;
        }

        .shoot-head,
        .card-title,
        .shoot-selector {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .shoot-head h2,
        .card-title h3 {
          margin: 0;
          color: #2d211d;
        }

        .shoot-head p:not(.shoot-eyebrow) {
          max-width: 760px;
          margin: 6px 0 0;
          color: #83746c;
          line-height: 1.45;
        }

        .shoot-eyebrow {
          margin: 0 0 4px;
          color: #d4a24c;
          font-size: 0.7rem;
          font-weight: 1000;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        button,
        input,
        select {
          font: inherit;
        }

        .primary {
          min-height: 42px;
          border: 1px solid #6b1a2c;
          border-radius: 11px;
          padding: 0 15px;
          background: #6b1a2c;
          color: #fff;
          font-weight: 950;
          cursor: pointer;
        }

        .shoot-card,
        .shoot-selector,
        .shoot-kpis > div,
        .shoot-empty,
        .shoot-loading {
          border: 1px solid #eadfd8;
          border-radius: 16px;
          background: #fff;
        }

        .shoot-card {
          padding: 18px;
        }

        .shoot-selector {
          padding: 13px;
          align-items: end;
        }

        .shoot-selector label {
          width: min(560px, 100%);
        }

        label {
          display: grid;
          gap: 5px;
        }

        label > span {
          color: #81726a;
          font-size: 0.67rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        input,
        select {
          width: 100%;
          min-height: 40px;
          border: 1px solid #ded2cb;
          border-radius: 9px;
          background: #fff;
          padding: 7px 9px;
        }

        input:disabled,
        select:disabled {
          background: #f7f3f1;
          color: #5e514b;
        }

        .shoot-actions {
          display: flex;
          gap: 7px;
        }

        .shoot-actions button,
        .add-row,
        .move-buttons button,
        .row-delete {
          min-height: 38px;
          border: 1px solid #dfd3cc;
          border-radius: 9px;
          background: #fff;
          padding: 0 10px;
          font-weight: 850;
          cursor: pointer;
        }

        .shoot-actions .danger,
        .row-delete {
          color: #a52c2c;
        }

        .shoot-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 15px;
        }

        .shoot-fields .wide {
          grid-column: 1 / -1;
        }

        .row-editor {
          margin-top: 17px;
          padding-top: 13px;
          border-top: 1px solid #eee4de;
        }

        .editor-row {
          display: grid;
          grid-template-columns: auto minmax(220px, 1fr) 110px 110px 38px;
          align-items: end;
          gap: 7px;
          margin: 7px 0;
        }

        .move-buttons {
          display: flex;
          gap: 3px;
        }

        .move-buttons button,
        .row-delete {
          width: 36px;
          padding: 0;
        }

        .add-row {
          margin-top: 8px;
          color: #6b1a2c;
        }

        .shoot-kpis {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 9px;
        }

        .shoot-kpis > div {
          padding: 14px;
        }

        .shoot-kpis span {
          display: block;
          color: #897a72;
          font-size: 0.7rem;
          font-weight: 800;
        }

        .shoot-kpis strong {
          display: block;
          margin-top: 4px;
          color: #6b1a2c;
          font-size: 1.45rem;
        }

        .date-adder {
          display: flex;
          gap: 7px;
          align-items: center;
        }

        .date-adder input {
          width: 155px;
        }

        .table-scroll {
          overflow: auto;
          margin-top: 14px;
          border: 1px solid #e9dfd9;
          border-radius: 12px;
        }

        table {
          width: max-content;
          min-width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.75rem;
        }

        th,
        td {
          min-width: 76px;
          border-right: 1px solid #eee5df;
          border-bottom: 1px solid #eee5df;
          background: #fff;
          padding: 7px;
          text-align: center;
        }

        thead th {
          background: #f7f2ef;
          color: #5e4e46;
          font-weight: 950;
        }

        .sticky-col {
          position: sticky;
          left: 0;
          z-index: 4;
          min-width: 205px !important;
          text-align: left;
          box-shadow: 6px 0 10px rgba(0, 0, 0, 0.03);
        }

        thead .sticky-col {
          z-index: 7;
        }

        .date-head {
          min-width: 230px !important;
          background: #6b1a2c !important;
          color: #fff !important;
        }

        .date-head span {
          margin-right: 8px;
        }

        .date-head button {
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 50%;
          background: transparent;
          color: #fff;
          cursor: pointer;
        }

        .row-name strong,
        .row-name small {
          display: block;
        }

        .row-name small {
          margin-top: 2px;
          color: #94867e;
          font-size: 0.63rem;
        }

        .result-input {
          width: 58px;
          min-height: 33px;
          text-align: center;
          padding: 3px;
        }

        .pct-cell,
        .summary-cell {
          font-weight: 950;
        }

        .pct-cell,
        .summary-cell.accent {
          color: #6b1a2c;
        }

        .summary-cell {
          background: #fcf7ef;
        }

        .record {
          color: #9a6910;
        }

        .total-row th,
        .total-row td {
          background: #2d211d !important;
          color: #fff !important;
          font-weight: 1000;
        }

        .save-results {
          display: flex;
          justify-content: flex-end;
          margin-top: 12px;
        }

        .shoot-empty,
        .shoot-loading {
          display: grid;
          gap: 4px;
          padding: 24px;
          color: #82746c;
        }

        .shoot-toast {
          position: fixed;
          top: 16px;
          left: 50%;
          z-index: 100;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #241b18;
          color: #fff;
          padding: 10px 17px;
          font-size: 0.76rem;
          font-weight: 900;
        }

        @media (max-width: 900px) {
          .shoot-head,
          .card-title,
          .shoot-selector {
            display: grid;
          }

          .shoot-fields {
            grid-template-columns: 1fr;
          }

          .shoot-fields .wide {
            grid-column: auto;
          }

          .editor-row {
            grid-template-columns: minmax(180px, 1fr) 95px 95px 38px;
          }

          .move-buttons {
            display: none;
          }

          .shoot-kpis {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </section>
  );
}

function FragmentHeaders() {
  return (
    <>
      <th>Marqué</th>
      <th>Tenté</th>
      <th>%</th>
    </>
  );
}

function FragmentTotals({
  made,
  attempted,
  pct,
}: {
  made: number;
  attempted: number;
  pct: number;
}) {
  return (
    <>
      <td>{made}</td>
      <td>{attempted}</td>
      <td>{pct}%</td>
    </>
  );
}

function ResultCells({
  canEdit,
  made,
  attempted,
  onMade,
  onAttempted,
}: {
  canEdit: boolean;
  made: number;
  attempted: number;
  onMade: (value: string) => void;
  onAttempted: (value: string) => void;
}) {
  return (
    <>
      <td>
        <input
          className="result-input"
          disabled={!canEdit}
          type="number"
          min={0}
          value={made}
          onChange={(event) => onMade(event.target.value)}
        />
      </td>
      <td>
        <input
          className="result-input"
          disabled={!canEdit}
          type="number"
          min={0}
          value={attempted}
          onChange={(event) => onAttempted(event.target.value)}
        />
      </td>
      <td className="pct-cell">{percentage(made, attempted)}%</td>
    </>
  );
}
