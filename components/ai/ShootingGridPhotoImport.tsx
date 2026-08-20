"use client";

import { useMemo, useRef, useState } from "react";
import type { AiShootingGridImport } from "@/lib/import/shooting-grid-types";

type PlayerOption = { id: string; name: string };
type RowOption = { id: string; name: string };

type Props = {
  gridName: string;
  inputMode: "fixed_attempts" | "fixed_makes";
  fixedValue: number;
  players: PlayerOption[];
  rows: RowOption[];
  disabled?: boolean;
  onConfirm: (draft: AiShootingGridImport) => Promise<void> | void;
};

const BORDEAUX = "#6B1A2C";
const GOLD = "#D4A24C";
const BORDER = "#E8DDD7";
const MUTED = "#7C6F68";
const TEXT = "#221A18";

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Lecture impossible"));
    reader.readAsDataURL(file);
  });
}

function clampInt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export default function ShootingGridPhotoImport({
  gridName,
  inputMode,
  fixedValue,
  players,
  rows,
  disabled,
  onConfirm,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<AiShootingGridImport | null>(null);

  const usablePlayers = useMemo(() => new Set(players.map((p) => p.id)), [players]);
  const usableRows = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  async function analyze(file: File | undefined) {
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
        throw new Error("Utilise une photo JPG, PNG ou WebP.");
      }
      if (file.size > 8 * 1024 * 1024) throw new Error("La photo dépasse 8 Mo.");
      const image = await readImage(file);
      const response = await fetch("/api/ai/import/shooting-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, gridName, inputMode, fixedValue, players, rows }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Analyse impossible.");
      const data = payload?.data as AiShootingGridImport | undefined;
      if (!data) throw new Error("La grille n'a pas pu être interprétée.");
      setDraft({
        ...data,
        players: (data.players || []).map((p) => ({
          ...p,
          matchedPlayerId: p.matchedPlayerId && usablePlayers.has(p.matchedPlayerId) ? p.matchedPlayerId : null,
          results: (p.results || []).map((r) => ({
            ...r,
            matchedRowId: r.matchedRowId && usableRows.has(r.matchedRowId) ? r.matchedRowId : null,
          })),
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse impossible.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function patchPlayer(index: number, playerId: string) {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.players];
      next[index] = { ...next[index], matchedPlayerId: playerId || null };
      return { ...current, players: next };
    });
  }

  function patchResult(playerIndex: number, resultIndex: number, patch: Record<string, unknown>) {
    setDraft((current) => {
      if (!current) return current;
      const nextPlayers = [...current.players];
      const player = { ...nextPlayers[playerIndex] };
      const nextResults = [...player.results];
      nextResults[resultIndex] = { ...nextResults[resultIndex], ...patch } as typeof nextResults[number];
      player.results = nextResults;
      nextPlayers[playerIndex] = player;
      return { ...current, players: nextPlayers };
    });
  }

  async function confirm() {
    if (!draft || saving) return;
    const mappedPlayers = draft.players.filter((p) => p.matchedPlayerId);
    if (!mappedPlayers.length) {
      setError("Associe au moins un joueur de la feuille à un joueur de l'équipe.");
      return;
    }
    if (mappedPlayers.some((p) => !p.results.some((r) => r.matchedRowId))) {
      setError("Chaque joueur utilisé doit avoir au moins un spot associé.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onConfirm(draft);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de créer la session.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(e) => void analyze(e.target.files?.[0])}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          disabled={disabled || loading || saving}
          onClick={() => inputRef.current?.click()}
          style={{ border: `1px solid ${GOLD}`, borderRadius: 10, background: "#FFF8E9", color: BORDEAUX, padding: "9px 12px", fontWeight: 1000, cursor: "pointer" }}
        >
          {loading ? "Analyse de la photo…" : "📸 Importer une grille remplie"}
        </button>
        <span style={{ fontSize: 10, color: MUTED }}>
          Photo téléphone, JPG, PNG ou WebP. Rien n'est enregistré pendant l'analyse.
        </span>
      </div>

      {error && <div style={{ border: "1px solid #E7B8B4", background: "#FFF6F5", color: "#9F2922", borderRadius: 10, padding: 10, fontSize: 11, fontWeight: 800 }}>{error}</div>}

      {draft && (
        <div style={{ border: `1px solid ${GOLD}`, borderRadius: 14, background: "#FFFCF7", overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <strong style={{ color: BORDEAUX }}>Contrôle avant création</strong>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>Corrige les joueurs, spots ou chiffres si nécessaire.</div>
            </div>
            {draft.sessionDate && <span style={{ fontSize: 10, color: TEXT, fontWeight: 900 }}>Date détectée : {draft.sessionDate}</span>}
          </div>

          {!!draft.warnings.length && (
            <div style={{ padding: "9px 12px", borderBottom: `1px solid ${BORDER}`, color: "#8B5A00", background: "#FFF8E9", fontSize: 10 }}>
              {draft.warnings.join(" · ")}
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 10 }}>
              <thead>
                <tr>
                  <th style={th}>Lu sur la feuille</th>
                  <th style={th}>Joueur MyBasket</th>
                  <th style={th}>Spot lu</th>
                  <th style={th}>Spot MyBasket</th>
                  <th style={th}>TM</th>
                  <th style={th}>TT</th>
                </tr>
              </thead>
              <tbody>
                {draft.players.flatMap((p, pi) => {
                  const resultRows = p.results.length ? p.results : [{ sourceSpot: "—", matchedRowId: null, made: null, attempted: null, confidence: 0 }];
                  return resultRows.map((r, ri) => (
                    <tr key={`${pi}-${ri}`}>
                      {ri === 0 && <td rowSpan={resultRows.length} style={td}><b>{p.sourceName}</b></td>}
                      {ri === 0 && (
                        <td rowSpan={resultRows.length} style={td}>
                          <select value={p.matchedPlayerId || ""} onChange={(e) => patchPlayer(pi, e.target.value)} style={select}>
                            <option value="">— À associer —</option>
                            {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                          </select>
                        </td>
                      )}
                      <td style={td}>{r.sourceSpot}</td>
                      <td style={td}>
                        <select value={r.matchedRowId || ""} onChange={(e) => patchResult(pi, ri, { matchedRowId: e.target.value || null })} style={select}>
                          <option value="">— À associer —</option>
                          {rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                        </select>
                      </td>
                      <td style={td}>
                        <input type="number" min={0} value={r.made ?? ""} onChange={(e) => patchResult(pi, ri, { made: e.target.value === "" ? null : clampInt(e.target.value) })} style={numberInput}/>
                      </td>
                      <td style={td}>
                        <input type="number" min={0} value={r.attempted ?? ""} onChange={(e) => patchResult(pi, ri, { attempted: e.target.value === "" ? null : clampInt(e.target.value) })} style={numberInput}/>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: 12, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${BORDER}` }}>
            <button type="button" onClick={() => setDraft(null)} disabled={saving} style={{ border: `1px solid ${BORDER}`, borderRadius: 9, background: "#fff", padding: "8px 10px", cursor: "pointer", fontWeight: 900 }}>Annuler</button>
            <button type="button" onClick={() => void confirm()} disabled={saving} style={{ border: 0, borderRadius: 9, background: BORDEAUX, color: "#fff", padding: "9px 12px", cursor: "pointer", fontWeight: 1000 }}>
              {saving ? "Création…" : "Créer la session avec ces données"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "7px 8px", background: "#F7F2EE", color: "#594A45", borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, textAlign: "left", fontWeight: 1000 };
const td: React.CSSProperties = { padding: "7px 8px", borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, verticalAlign: "middle" };
const select: React.CSSProperties = { width: "100%", minWidth: 150, border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", color: TEXT, padding: "6px 7px", fontSize: 10 };
const numberInput: React.CSSProperties = { width: 62, border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", color: TEXT, padding: "6px 5px", textAlign: "center", fontWeight: 900 };
