"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PlannerBlockType = {
  id: string;
  name: string;
  color: string;
  textColor?: string;
  custom?: boolean;
};

type PlannerBlock = {
  id: string;
  typeId: string;
  title: string;
  duration: number;
  note: string;
};

type DayPlan = {
  rpe: number | null;
  theme: string;
  timeRange: string;
  blocks: PlannerBlock[];
};

type WeekPlan = Record<string, DayPlan>;

type PlannerPayload = {
  weekKey: string;
  plan: WeekPlan;
  library: PlannerBlockType[];
};

const DAYS = [
  { key: "monday", label: "Lundi" },
  { key: "tuesday", label: "Mardi" },
  { key: "wednesday", label: "Mercredi" },
  { key: "thursday", label: "Jeudi" },
  { key: "friday", label: "Vendredi" },
];

const DEFAULT_LIBRARY: PlannerBlockType[] = [
  { id: "fio", name: "FIO", color: "#dcecff" },
  { id: "preco-off", name: "Pré-co offensif", color: "#ffe8d7" },
  { id: "preco-def", name: "Pré-co défensif", color: "#dff3df" },
  { id: "collectif", name: "Collectif / 4x4 et 5x5", color: "#d9f3f0" },
  { id: "pp", name: "PP", color: "#e9f3cc" },
  { id: "warmup", name: "Échauffement", color: "#fff0c9" },
  { id: "fid", name: "FID / Duel", color: "#f0dff3" },
];

const COLOR_CHOICES = [
  "#dcecff",
  "#ffe8d7",
  "#dff3df",
  "#d9f3f0",
  "#e9f3cc",
  "#fff0c9",
  "#f0dff3",
  "#f6e2e6",
  "#e7e7f8",
];

function uid(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mondayOf(date: Date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + delta);
  return d;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatWeekLabel(monday: Date) {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const month = new Intl.DateTimeFormat("fr-FR", { month: "short" });
  const first = `${monday.getDate()} ${sameMonth ? "" : month.format(monday)}`;
  const last = `${sunday.getDate()} ${month.format(sunday)} ${sunday.getFullYear()}`;
  return `${first} – ${last}`;
}

function emptyDay(): DayPlan {
  return { rpe: null, theme: "", timeRange: "", blocks: [] };
}

function normalizePlan(value: unknown): WeekPlan {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    DAYS.map(({ key }) => {
      const raw =
        source[key] && typeof source[key] === "object"
          ? (source[key] as Record<string, unknown>)
          : {};
      const blocks = Array.isArray(raw.blocks)
        ? raw.blocks
            .filter((block) => block && typeof block === "object")
            .map((block) => {
              const b = block as Record<string, unknown>;
              return {
                id: String(b.id || uid("block")),
                typeId: String(b.typeId || ""),
                title: String(b.title || ""),
                duration: Math.max(1, Math.round(Number(b.duration) || 15)),
                note: String(b.note || ""),
              } satisfies PlannerBlock;
            })
        : [];

      const numericRpe = Number(raw.rpe);

      return [
        key,
        {
          rpe:
            Number.isFinite(numericRpe) && numericRpe >= 1 && numericRpe <= 10
              ? numericRpe
              : null,
          theme: String(raw.theme || ""),
          timeRange: String(raw.timeRange || ""),
          blocks,
        } satisfies DayPlan,
      ];
    }),
  );
}

function minutesLabel(total: number) {
  const minutes = Math.max(0, Math.round(total));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}`;
}

function safeColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#ece8e3";
}

export default function WeeklyTrainingPlanner({ teamId }: { teamId: string }) {
  const [weekMonday, setWeekMonday] = useState(() => mondayOf(new Date()));
  const [plan, setPlan] = useState<WeekPlan>(() => normalizePlan({}));
  const [library, setLibrary] = useState<PlannerBlockType[]>(DEFAULT_LIBRARY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [newBlockOpen, setNewBlockOpen] = useState(false);
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockColor, setNewBlockColor] = useState(COLOR_CHOICES[0]);
  const [dragging, setDragging] = useState<
    | { source: "library"; typeId: string }
    | { source: "day"; dayKey: string; blockId: string }
    | null
  >(null);

  const weekKey = useMemo(() => isoDate(weekMonday), [weekMonday]);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/teams/${encodeURIComponent(teamId)}/weekly-plan?weekKey=${encodeURIComponent(weekKey)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as Partial<PlannerPayload> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Impossible de charger le plan de semaine.");
      }

      setPlan(normalizePlan(payload.plan || {}));
      const remoteLibrary = Array.isArray(payload.library)
        ? payload.library
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
              id: String(item.id || uid("type")),
              name: String(item.name || "Bloc"),
              color: safeColor(String(item.color || "#ece8e3")),
              custom: Boolean(item.custom),
            }))
        : [];

      const merged = [...DEFAULT_LIBRARY];
      for (const item of remoteLibrary) {
        if (!merged.some((existing) => existing.id === item.id)) merged.push(item);
      }
      setLibrary(merged);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, [teamId, weekKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalsByType = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const { key } of DAYS) {
      for (const block of plan[key]?.blocks || []) {
        totals[block.typeId] = (totals[block.typeId] || 0) + block.duration;
      }
    }
    return totals;
  }, [plan]);

  const totalMinutes = useMemo(
    () => Object.values(totalsByType).reduce((sum, value) => sum + value, 0),
    [totalsByType],
  );

  const dayTotal = (dayKey: string) =>
    (plan[dayKey]?.blocks || []).reduce((sum, block) => sum + block.duration, 0);

  const updateDay = (dayKey: string, patch: Partial<DayPlan>) => {
    setPlan((current) => ({
      ...current,
      [dayKey]: { ...(current[dayKey] || emptyDay()), ...patch },
    }));
  };

  const updateBlock = (
    dayKey: string,
    blockId: string,
    patch: Partial<PlannerBlock>,
  ) => {
    const day = plan[dayKey] || emptyDay();
    updateDay(dayKey, {
      blocks: day.blocks.map((block) =>
        block.id === blockId ? { ...block, ...patch } : block,
      ),
    });
  };

  const removeBlock = (dayKey: string, blockId: string) => {
    const day = plan[dayKey] || emptyDay();
    updateDay(dayKey, { blocks: day.blocks.filter((block) => block.id !== blockId) });
  };

  const dropOnDay = (dayKey: string) => {
    if (!dragging) return;

    if (dragging.source === "library") {
      const type = library.find((item) => item.id === dragging.typeId);
      if (!type) return;
      const day = plan[dayKey] || emptyDay();
      updateDay(dayKey, {
        blocks: [
          ...day.blocks,
          {
            id: uid("block"),
            typeId: type.id,
            title: type.name,
            duration: 15,
            note: "",
          },
        ],
      });
    } else {
      const sourceDay = plan[dragging.dayKey] || emptyDay();
      const moved = sourceDay.blocks.find((block) => block.id === dragging.blockId);
      if (!moved) return;

      if (dragging.dayKey === dayKey) return;

      setPlan((current) => ({
        ...current,
        [dragging.dayKey]: {
          ...(current[dragging.dayKey] || emptyDay()),
          blocks: (current[dragging.dayKey]?.blocks || []).filter(
            (block) => block.id !== dragging.blockId,
          ),
        },
        [dayKey]: {
          ...(current[dayKey] || emptyDay()),
          blocks: [...(current[dayKey]?.blocks || []), moved],
        },
      }));
    }

    setDragging(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage("");

    try {
      const customLibrary = library.filter((item) => item.custom);
      const response = await fetch(
        `/api/teams/${encodeURIComponent(teamId)}/weekly-plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekKey, plan, library: customLibrary }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Impossible d’enregistrer.");
      }

      setMessage("Plan de semaine enregistré.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur d’enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const addCustomBlock = () => {
    const name = newBlockName.trim();
    if (!name) return;

    const item: PlannerBlockType = {
      id: uid("custom"),
      name,
      color: safeColor(newBlockColor),
      custom: true,
    };
    setLibrary((current) => [...current, item]);
    setNewBlockName("");
    setNewBlockColor(COLOR_CHOICES[0]);
    setNewBlockOpen(false);
  };

  const deleteCustomType = (typeId: string) => {
    if (!window.confirm("Supprimer ce type de bloc de la bibliothèque ?")) return;
    setLibrary((current) => current.filter((item) => item.id !== typeId));
  };

  return (
    <section className="week-planner">
      <header className="planner-head">
        <div>
          <span className="eyebrow">Plan de semaine</span>
          <h2>Organise ta semaine d’entraînement</h2>
          <p>
            Glisse les blocs dans les journées, puis ajuste manuellement leur durée,
            le RPE de la journée, le thème et tes notes.
          </p>
        </div>

        <div className="planner-actions">
          <button
            type="button"
            className="nav-btn"
            onClick={() => setWeekMonday((current) => addDays(current, -7))}
            aria-label="Semaine précédente"
          >
            ‹
          </button>
          <strong>{formatWeekLabel(weekMonday)}</strong>
          <button
            type="button"
            className="nav-btn"
            onClick={() => setWeekMonday((current) => addDays(current, 7))}
            aria-label="Semaine suivante"
          >
            ›
          </button>
          <button type="button" className="save-btn" disabled={saving} onClick={save}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </header>

      {message && <div className="planner-message">{message}</div>}

      <div className="planner-layout">
        <aside className="library">
          <h3>Blocs disponibles</h3>
          <p>Glisse un bloc pour l’ajouter.</p>

          <div className="library-list">
            {library.map((item) => (
              <div
                key={item.id}
                className="library-item"
                draggable
                onDragStart={() => setDragging({ source: "library", typeId: item.id })}
                onDragEnd={() => setDragging(null)}
                style={{ background: safeColor(item.color) }}
              >
                <span className="color-dot" style={{ background: safeColor(item.color) }} />
                <strong>{item.name}</strong>
                {item.custom ? (
                  <button
                    type="button"
                    className="tiny-delete"
                    onClick={() => deleteCustomType(item.id)}
                    aria-label={`Supprimer ${item.name}`}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {!newBlockOpen ? (
            <button
              type="button"
              className="new-block-btn"
              onClick={() => setNewBlockOpen(true)}
            >
              + Nouveau bloc
            </button>
          ) : (
            <div className="new-block-form">
              <input
                value={newBlockName}
                onChange={(event) => setNewBlockName(event.target.value)}
                placeholder="Nom du bloc"
              />
              <div className="color-row">
                {COLOR_CHOICES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={newBlockColor === color ? "selected" : ""}
                    style={{ background: color }}
                    onClick={() => setNewBlockColor(color)}
                    aria-label={`Couleur ${color}`}
                  />
                ))}
              </div>
              <div className="new-block-actions">
                <button type="button" onClick={() => setNewBlockOpen(false)}>
                  Annuler
                </button>
                <button type="button" className="confirm" onClick={addCustomBlock}>
                  Ajouter
                </button>
              </div>
            </div>
          )}
        </aside>

        <div className="days-scroll">
          <div className="days-grid">
            {DAYS.map(({ key, label }) => {
              const day = plan[key] || emptyDay();
              return (
                <div
                  key={key}
                  className="day-column"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropOnDay(key)}
                >
                  <div className="day-head">
                    <div className="day-title-row">
                      <strong>{label}</strong>
                      <span>{minutesLabel(dayTotal(key))}</span>
                    </div>

                    <label>
                      <span>RPE journée</span>
                      <select
                        value={day.rpe ?? ""}
                        onChange={(event) =>
                          updateDay(key, {
                            rpe: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      >
                        <option value="">—</option>
                        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>

                    <input
                      className="day-theme"
                      value={day.theme}
                      onChange={(event) => updateDay(key, { theme: event.target.value })}
                      placeholder="Thème de la journée"
                    />
                    <input
                      className="day-time"
                      value={day.timeRange}
                      onChange={(event) => updateDay(key, { timeRange: event.target.value })}
                      placeholder="Ex. 18h30 / 20h"
                    />
                  </div>

                  <div className="day-blocks">
                    {day.blocks.map((block) => {
                      const type = library.find((item) => item.id === block.typeId);
                      const color = safeColor(type?.color || "#ece8e3");
                      return (
                        <article
                          key={block.id}
                          className="planned-block"
                          draggable
                          onDragStart={() =>
                            setDragging({
                              source: "day",
                              dayKey: key,
                              blockId: block.id,
                            })
                          }
                          onDragEnd={() => setDragging(null)}
                          style={{ background: color }}
                        >
                          <div className="block-top">
                            <span className="drag-handle" aria-hidden="true">⠿</span>
                            <input
                              className="block-title"
                              value={block.title}
                              onChange={(event) =>
                                updateBlock(key, block.id, { title: event.target.value })
                              }
                              aria-label="Nom du bloc"
                            />
                            <div className="duration-field">
                              <input
                                type="number"
                                min={1}
                                max={240}
                                step={1}
                                value={block.duration}
                                onChange={(event) =>
                                  updateBlock(key, block.id, {
                                    duration: Math.max(
                                      1,
                                      Math.min(240, Number(event.target.value) || 1),
                                    ),
                                  })
                                }
                                aria-label="Durée en minutes"
                              />
                              <span>′</span>
                            </div>
                            <button
                              type="button"
                              className="remove-block"
                              onClick={() => removeBlock(key, block.id)}
                              aria-label="Supprimer le bloc"
                            >
                              ×
                            </button>
                          </div>

                          <input
                            className="block-note"
                            value={block.note}
                            onChange={(event) =>
                              updateBlock(key, block.id, { note: event.target.value })
                            }
                            placeholder="Petite note…"
                            aria-label="Note du bloc"
                          />
                        </article>
                      );
                    })}

                    <div className="drop-zone">Glisser un bloc ici</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="recap">
          <span className="eyebrow">Récapitulatif</span>
          <h3>Temps par type de bloc</h3>

          <div className="recap-list">
            {library
              .filter((item) => (totalsByType[item.id] || 0) > 0)
              .sort((a, b) => (totalsByType[b.id] || 0) - (totalsByType[a.id] || 0))
              .map((item) => {
                const minutes = totalsByType[item.id] || 0;
                const pct = totalMinutes ? Math.round((minutes / totalMinutes) * 100) : 0;
                return (
                  <div className="recap-row" key={item.id}>
                    <span className="recap-dot" style={{ background: safeColor(item.color) }} />
                    <strong>{item.name}</strong>
                    <b>{minutesLabel(minutes)}</b>
                    <em>{pct}%</em>
                  </div>
                );
              })}
          </div>

          {totalMinutes === 0 ? (
            <div className="recap-empty">Ajoute des blocs pour voir la répartition.</div>
          ) : null}

          <div className="total-card">
            <span>Temps total planifié</span>
            <strong>{minutesLabel(totalMinutes)}</strong>
          </div>

          <div className="rpe-card">
            <span>RPE journée</span>
            <div>
              {DAYS.map(({ key, label }) => (
                <span key={key}>
                  <small>{label.slice(0, 3)}</small>
                  <b>{plan[key]?.rpe ?? "—"}</b>
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {loading && <div className="loading-overlay">Chargement du plan…</div>}

      <style jsx>{`
        .week-planner {
          position: relative;
          margin-bottom: 24px;
          padding: 20px;
          border: 1px solid #eadfd5;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 12px 32px rgba(60, 38, 28, 0.05);
          color: #2a211e;
        }
        .planner-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 22px;
          margin-bottom: 18px;
        }
        .eyebrow {
          display: inline-block;
          color: #7b1730;
          font-size: 0.72rem;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .planner-head h2 {
          margin: 5px 0 5px;
          font-size: 1.25rem;
        }
        .planner-head p,
        .library > p {
          margin: 0;
          color: #897b74;
          font-size: 0.78rem;
        }
        .planner-actions {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .planner-actions strong {
          min-width: 180px;
          text-align: center;
          font-size: 0.86rem;
        }
        .nav-btn,
        .save-btn,
        .new-block-btn {
          border: 1px solid #eadfd5;
          border-radius: 10px;
          background: #fff;
          color: #6b1a2c;
          font-weight: 900;
          cursor: pointer;
        }
        .nav-btn {
          width: 34px;
          height: 34px;
          font-size: 1.1rem;
        }
        .save-btn {
          min-height: 38px;
          padding: 0 17px;
          border-color: #6b1a2c;
          background: #6b1a2c;
          color: #fff;
        }
        .save-btn:disabled {
          opacity: 0.55;
          cursor: default;
        }
        .planner-message {
          margin-bottom: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fbf5ef;
          color: #6b1a2c;
          font-size: 0.78rem;
          font-weight: 750;
        }
        .planner-layout {
          display: grid;
          grid-template-columns: 170px minmax(0, 1fr) 220px;
          gap: 12px;
          align-items: stretch;
        }
        .library,
        .recap {
          border: 1px solid #eee4dc;
          border-radius: 15px;
          padding: 13px;
          background: #fffdfa;
        }
        .library h3,
        .recap h3 {
          margin: 0 0 4px;
          font-size: 0.86rem;
        }
        .library-list {
          display: grid;
          gap: 7px;
          margin-top: 12px;
        }
        .library-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 42px;
          padding: 8px 10px;
          border: 1px solid rgba(80, 60, 50, 0.08);
          border-radius: 9px;
          cursor: grab;
          font-size: 0.72rem;
        }
        .library-item strong {
          flex: 1;
          min-width: 0;
        }
        .color-dot,
        .recap-dot {
          width: 9px;
          height: 9px;
          flex: 0 0 9px;
          border-radius: 50%;
          border: 1px solid rgba(0, 0, 0, 0.07);
        }
        .tiny-delete {
          border: 0;
          background: transparent;
          color: #8b7770;
          cursor: pointer;
          font-size: 1rem;
        }
        .new-block-btn {
          width: 100%;
          margin-top: 9px;
          min-height: 38px;
        }
        .new-block-form {
          display: grid;
          gap: 8px;
          margin-top: 10px;
          padding: 10px;
          border: 1px solid #eee4dc;
          border-radius: 10px;
        }
        .new-block-form input {
          width: 100%;
          min-height: 34px;
          box-sizing: border-box;
          border: 1px solid #dfd4cc;
          border-radius: 8px;
          padding: 0 9px;
        }
        .color-row {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }
        .color-row button {
          width: 22px;
          height: 22px;
          border: 1px solid rgba(0, 0, 0, 0.09);
          border-radius: 50%;
          cursor: pointer;
        }
        .color-row button.selected {
          outline: 2px solid #6b1a2c;
          outline-offset: 2px;
        }
        .new-block-actions {
          display: flex;
          gap: 6px;
        }
        .new-block-actions button {
          flex: 1;
          border: 1px solid #e2d7cf;
          border-radius: 8px;
          background: #fff;
          padding: 7px;
          font-weight: 800;
          cursor: pointer;
        }
        .new-block-actions .confirm {
          border-color: #6b1a2c;
          background: #6b1a2c;
          color: #fff;
        }
        .days-scroll {
          min-width: 0;
          overflow-x: auto;
          padding-bottom: 3px;
        }
        .days-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(220px, 1fr));
          min-width: 1110px;
          min-height: 610px;
          border: 1px solid #eee4dc;
          border-radius: 15px;
          overflow: hidden;
          background: #fff;
        }
        .day-column {
          min-width: 0;
          border-right: 1px solid #eee4dc;
          background: #fff;
        }
        .day-column:last-child {
          border-right: 0;
        }
        .day-head {
          display: grid;
          gap: 7px;
          padding: 10px;
          border-bottom: 1px solid #eee4dc;
          background: #fffdfa;
        }
        .day-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .day-title-row strong {
          font-size: 0.78rem;
          text-transform: uppercase;
        }
        .day-title-row span {
          color: #8b7770;
          font-size: 0.66rem;
          font-weight: 800;
        }
        .day-head label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 7px;
          color: #8a7c74;
          font-size: 0.62rem;
          font-weight: 850;
        }
        .day-head select {
          width: 56px;
          min-height: 29px;
          border: 1px solid #e1d6ce;
          border-radius: 7px;
          background: #fff;
          padding: 0 6px;
          font-weight: 850;
        }
        .day-theme,
        .day-time {
          width: 100%;
          min-height: 31px;
          box-sizing: border-box;
          border: 1px solid #e6ddd6;
          border-radius: 7px;
          background: #fff;
          padding: 0 8px;
          color: #3b302b;
          font-size: 0.68rem;
        }
        .day-blocks {
          display: grid;
          align-content: start;
          gap: 7px;
          min-height: 505px;
          padding: 8px;
        }
        .planned-block {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          padding: 8px;
          border: 1px solid rgba(60, 45, 35, 0.07);
          border-radius: 9px;
          cursor: grab;
        }
        .block-top {
          display: grid;
          grid-template-columns: 16px minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 5px;
          min-width: 0;
        }
        .drag-handle {
          color: #756961;
          font-size: 0.8rem;
        }
        .block-title {
          min-width: 0;
          flex: 1;
          border: 0;
          background: transparent;
          color: #2a211e;
          font-size: 0.56rem;
          font-weight: 900;
          letter-spacing: -0.01em;
          outline: none;
        }
        .duration-field {
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          gap: 1px;
          border: 1px solid rgba(90, 65, 50, 0.12);
          border-radius: 6px;
          background: rgba(255,255,255,.82);
          padding: 0 5px;
        }
        .duration-field input {
          width: 33px;
          min-height: 28px;
          border: 0;
          background: transparent;
          text-align: right;
          font-size: 0.68rem;
          font-weight: 950;
          outline: none;
          appearance: textfield;
          -moz-appearance: textfield;
        }
        .duration-field input::-webkit-inner-spin-button,
        .duration-field input::-webkit-outer-spin-button {
          margin: 0;
          -webkit-appearance: none;
        }
        .duration-field span {
          font-size: 0.72rem;
          font-weight: 950;
        }
        .remove-block {
          width: 23px;
          height: 23px;
          flex: 0 0 23px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(107, 26, 44, 0.16);
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.88);
          color: #6b1a2c;
          cursor: pointer;
          font-size: 0.88rem;
          font-weight: 950;
          line-height: 1;
          box-shadow: 0 1px 4px rgba(55, 35, 27, 0.06);
        }
        .remove-block:hover {
          background: #6b1a2c;
          color: #fff;
          border-color: #6b1a2c;
        }
        .block-note {
          width: 100%;
          min-height: 29px;
          box-sizing: border-box;
          margin-top: 7px;
          border: 1px solid rgba(90, 65, 50, 0.08);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.68);
          padding: 0 7px;
          color: #564a45;
          font-size: 0.64rem;
          outline: none;
        }
        .drop-zone {
          display: grid;
          place-items: center;
          min-height: 38px;
          margin-top: auto;
          border: 1px dashed #dfcfc3;
          border-radius: 8px;
          color: #a2938b;
          font-size: 0.64rem;
        }
        .recap {
          align-self: stretch;
        }
        .recap h3 {
          margin-top: 6px;
        }
        .recap-list {
          display: grid;
          gap: 0;
          margin-top: 10px;
        }
        .recap-row {
          display: grid;
          grid-template-columns: 10px minmax(0,1fr) auto auto;
          align-items: center;
          gap: 7px;
          padding: 9px 0;
          border-bottom: 1px solid #f0e8e2;
          font-size: 0.67rem;
        }
        .recap-row strong {
          min-width: 0;
        }
        .recap-row b {
          white-space: nowrap;
        }
        .recap-row em {
          color: #9a8b83;
          font-style: normal;
        }
        .recap-empty {
          margin-top: 12px;
          color: #9a8b83;
          font-size: 0.7rem;
        }
        .total-card {
          display: grid;
          gap: 5px;
          margin-top: 18px;
          padding-top: 15px;
          border-top: 1px solid #eadfd5;
        }
        .total-card span,
        .rpe-card > span {
          color: #7b1730;
          font-size: 0.67rem;
          font-weight: 950;
          text-transform: uppercase;
        }
        .total-card strong {
          font-size: 1.55rem;
          color: #251d1a;
        }
        .rpe-card {
          display: grid;
          gap: 8px;
          margin-top: 18px;
          padding-top: 15px;
          border-top: 1px solid #eadfd5;
        }
        .rpe-card > div {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
        }
        .rpe-card > div > span {
          display: grid;
          place-items: center;
          gap: 2px;
          padding: 6px 2px;
          border: 1px solid #eee4dc;
          border-radius: 7px;
        }
        .rpe-card small {
          color: #8a7c74;
          font-size: 0.56rem;
        }
        .rpe-card b {
          font-size: 0.72rem;
        }
        .loading-overlay {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          border-radius: 20px;
          background: rgba(255,255,255,.76);
          color: #6b1a2c;
          font-weight: 900;
          backdrop-filter: blur(2px);
        }
        @media (max-width: 1200px) {
          .planner-layout {
            grid-template-columns: 150px minmax(0, 1fr);
          }
          .recap {
            grid-column: 1 / -1;
          }
          .recap-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            column-gap: 18px;
          }
        }
        @media (max-width: 760px) {
          .week-planner {
            padding: 14px;
          }
          .planner-head {
            flex-direction: column;
          }
          .planner-actions {
            width: 100%;
            justify-content: flex-start;
          }
          .planner-layout {
            grid-template-columns: 1fr;
          }
          .library {
            overflow-x: auto;
          }
          .library-list {
            display: flex;
            min-width: max-content;
          }
          .library-item {
            width: 150px;
          }
          .days-scroll {
            grid-column: 1;
          }
          .recap {
            grid-column: 1;
          }
          .recap-list {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
