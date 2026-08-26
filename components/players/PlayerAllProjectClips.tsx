"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ActionClipsModal, { type ClipAction } from "@/components/prise-stats-pro/ActionClipsModal";
import { NATIVE_SYNC, normalizeSync, type VideoSyncState } from "@/lib/video-sync";

type Props = {
  teamId: string;
  playerId: string;
  playerName: string;
};

type MatchSource = {
  matchId: string;
  label: string;
  date: string;
  opponent: string;
  filename: string;
  provider: string;
  sync: VideoSyncState;
};

type PlayerProjectAction = ClipAction & {
  id: string;
  matchId: string;
  matchLabel: string;
  date: string;
  opponent: string;
  assistPlayerId?: string | null;
  reboundPlayerId?: string | null;
  reboundType?: string | null;
  specialCase?: string | null;
  role?: "acteur" | "passeur" | "rebondeur";
};

type LocalHandle = {
  name?: string;
  getFile: () => Promise<File>;
  queryPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<string>;
  requestPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<string>;
};

const LOCAL_VIDEO_DB = "mybasket-local-video-handles";
const LOCAL_VIDEO_STORE = "handles";

const teamFilenameKey = (teamId: string, filename: string) =>
  `team:${String(teamId || "unknown")}::${String(filename || "").trim().toLowerCase()}`;

const matchHandleKey = (matchId: string) => `match:${matchId}`;

function openHandleDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const req = indexedDB.open(LOCAL_VIDEO_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOCAL_VIDEO_STORE)) {
        db.createObjectStore(LOCAL_VIDEO_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function saveHandle(key: string, handle: LocalHandle) {
  const db = await openHandleDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(LOCAL_VIDEO_STORE, "readwrite");
      tx.objectStore(LOCAL_VIDEO_STORE).put(handle, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function readHandle(key: string): Promise<LocalHandle | null> {
  const db = await openHandleDb();
  if (!db) return null;

  const value = await new Promise<LocalHandle | null>((resolve) => {
    try {
      const tx = db.transaction(LOCAL_VIDEO_STORE, "readonly");
      const req = tx.objectStore(LOCAL_VIDEO_STORE).get(key);
      req.onsuccess = () => resolve((req.result as LocalHandle | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  db.close();
  return value;
}

function useful(value: unknown) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function actionId(a: any): string {
  return String(a?.id ?? a?.client_action_id ?? a?.clientActionId ?? "").trim();
}

function involved(a: any, playerId: string) {
  const actor = String(a?.playerId ?? a?.player_id ?? "");
  const assist = String(a?.assistPlayerId ?? a?.assist_player_id ?? "");
  const rebound = String(a?.reboundPlayerId ?? a?.rebound_player_id ?? "");
  return actor === playerId || assist === playerId || rebound === playerId;
}

function roleOf(a: any, playerId: string): PlayerProjectAction["role"] {
  if (String(a?.assistPlayerId ?? a?.assist_player_id ?? "") === playerId) return "passeur";
  if (String(a?.reboundPlayerId ?? a?.rebound_player_id ?? "") === playerId) return "rebondeur";
  return "acteur";
}

function canonicalAction(raw: any, source: MatchSource, playerId: string): PlayerProjectAction {
  return {
    id: actionId(raw) || `${source.matchId}:${raw?.q ?? raw?.quarter ?? 0}:${raw?.clock ?? ""}:${Math.random()}`,
    matchId: source.matchId,
    matchLabel: source.label,
    date: source.date,
    opponent: source.opponent,

    q: Number(raw?.q ?? raw?.quarter ?? 0) || undefined,
    clock: raw?.clock ?? "",
    context: raw?.context ?? "",
    playbookId: raw?.playbookId ?? raw?.playbook_id ?? null,
    systemeSlot: raw?.systemeSlot ?? raw?.systeme_slot ?? raw?.systemeJeu ?? null,
    systemeId: raw?.systemeId ?? raw?.systeme_id ?? null,
    systemeName: raw?.systemeName ?? raw?.systeme_name ?? null,
    systemeJeu: raw?.systemeJeu ?? raw?.systeme_slot ?? null,
    tempsFort: raw?.tempsFort ?? raw?.temps_fort ?? null,
    playerId: raw?.playerId ?? raw?.player_id ?? null,
    opponentPlayerId: raw?.opponentPlayerId ?? raw?.opponent_player_id ?? null,
    opponentPlayerName: raw?.opponentPlayerName ?? raw?.opponent_player_name ?? null,
    opponentPlayerNumber: raw?.opponentPlayerNumber ?? raw?.opponent_player_number ?? null,
    actionType: raw?.actionType ?? raw?.action_type ?? null,
    shotType: raw?.shotType ?? raw?.shot_type ?? null,
    shotResult: raw?.shotResult ?? raw?.shot_result ?? null,
    zone: raw?.zone ?? raw?.shot_zone_id ?? null,
    courtX: raw?.courtX ?? raw?.court_x ?? null,
    courtY: raw?.courtY ?? raw?.court_y ?? null,
    clipStart: raw?.clipStart ?? raw?.clip_start ?? null,
    clipEnd: raw?.clipEnd ?? raw?.clip_end ?? null,
    videoTime: raw?.videoTime ?? raw?.video_time ?? null,
    possessionStart: raw?.possessionStart ?? raw?.possession_start ?? null,
    possessionEnd: raw?.possessionEnd ?? raw?.possession_end ?? null,

    assistPlayerId: raw?.assistPlayerId ?? raw?.assist_player_id ?? null,
    reboundPlayerId: raw?.reboundPlayerId ?? raw?.rebound_player_id ?? null,
    reboundType: raw?.reboundType ?? raw?.rebound_type ?? null,
    specialCase: raw?.specialCase ?? raw?.special_case ?? null,
    role: roleOf(raw, playerId),
  };
}

function mergeCanonical(projectAction: PlayerProjectAction | undefined, sqlAction: PlayerProjectAction) {
  if (!projectAction) return sqlAction;
  const merged: any = { ...projectAction };
  Object.entries(sqlAction).forEach(([key, value]) => {
    if (useful(value) || !(key in merged)) merged[key] = value;
  });
  return merged as PlayerProjectAction;
}

function fmtDate(value: string) {
  if (!value) return "Date inconnue";
  const d = new Date(value);
  if (Number.isNaN(+d)) return value;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function clipReady(a: PlayerProjectAction) {
  return a.clipStart != null || a.videoTime != null || a.possessionStart != null;
}

function actionLabel(a: PlayerProjectAction) {
  const result =
    a.shotResult === "made" ? "marqué" :
    a.shotResult === "missed" ? "raté" :
    a.shotResult || "";

  return [
    a.systemeName || a.systemeSlot || a.systemeJeu,
    a.tempsFort,
    a.shotType || a.actionType,
    result,
  ].filter(Boolean).join(" · ") || "Action codée";
}

export default function PlayerAllProjectClips({ teamId, playerId, playerName }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [actions, setActions] = useState<PlayerProjectAction[]>([]);
  const [sources, setSources] = useState<Record<string, MatchSource>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const objectUrlsRef = useRef<string[]>([]);

  const [search, setSearch] = useState("");
  const [fMatch, setFMatch] = useState("all");
  const [fSystem, setFSystem] = useState("all");
  const [fTf, setFTf] = useState("all");
  const [fAction, setFAction] = useState("all");
  const [fResult, setFResult] = useState("all");
  const [fZone, setFZone] = useState("all");

  const [modal, setModal] = useState<{ items: PlayerProjectAction[]; index: number; title: string } | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);

  const attachFile = (matchId: string, file: File) => {
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    setUrls((current) => ({ ...current, [matchId]: url }));
  };

  const tryRestoreSource = async (source: MatchSource, askPermission = false) => {
    let handle = await readHandle(matchHandleKey(source.matchId));
    if (!handle && source.filename) {
      handle = await readHandle(teamFilenameKey(teamId, source.filename));
    }
    if (!handle) return false;

    try {
      let permission = handle.queryPermission
        ? await handle.queryPermission({ mode: "read" })
        : "granted";

      if (permission !== "granted" && askPermission && handle.requestPermission) {
        permission = await handle.requestPermission({ mode: "read" });
      }
      if (permission !== "granted") return false;

      const file = await handle.getFile();
      attachFile(source.matchId, file);
      await saveHandle(matchHandleKey(source.matchId), handle);
      if (source.filename) await saveHandle(teamFilenameKey(teamId, source.filename), handle);
      return true;
    } catch {
      return false;
    }
  };

  const reconnectSource = async (matchId: string) => {
    const source = sources[matchId];
    if (!source) return;
    setReconnecting(matchId);

    try {
      if (await tryRestoreSource(source, true)) return;

      const picker = (window as any).showOpenFilePicker as
        | ((options?: any) => Promise<LocalHandle[]>)
        | undefined;

      if (picker) {
        try {
          const [handle] = await picker({
            multiple: false,
            types: [{
              description: "Vidéo du match",
              accept: { "video/*": [".mp4", ".mov", ".m4v", ".webm"] },
            }],
          });
          if (!handle) return;
          const file = await handle.getFile();
          attachFile(matchId, file);
          await saveHandle(matchHandleKey(matchId), handle);
          await saveHandle(teamFilenameKey(teamId, file.name), handle);
          if (source.filename) await saveHandle(teamFilenameKey(teamId, source.filename), handle);
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") return;
        }
      }

      // Safari / navigateur sans File System Access API.
      await new Promise<void>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "video/*";
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) attachFile(matchId, file);
          resolve();
        };
        input.oncancel = () => resolve();
        input.click();
      });
    } finally {
      setReconnecting(null);
    }
  };

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [matchesRes, actionsRes] = await Promise.all([
          supabase
            .from("match_stats")
            .select("*")
            .eq("team_id", teamId)
            .order("match_date", { ascending: false }),
          supabase
            .from("match_actions")
            .select("*")
            .eq("team_id", teamId)
            .or(`player_id.eq.${playerId},assist_player_id.eq.${playerId},rebound_player_id.eq.${playerId}`),
        ]);

        if (matchesRes.error) throw matchesRes.error;
        if (actionsRes.error) throw actionsRes.error;
        if (!active) return;

        const matchRows = (matchesRes.data ?? []) as any[];
        const sqlRows = (actionsRes.data ?? []) as any[];

        const sourceMap: Record<string, MatchSource> = {};

        matchRows.forEach((row) => {
          const state = (row.project_state ?? {}) as any;
          const matchId = String(row.id);
          const date = String(row.match_date ?? state.date ?? "");
          const opponent = String(row.opponent ?? state.opponent ?? "Adversaire");
          const filename = String(
            state.videoFilename ??
            state.video_filename ??
            row.video_filename ??
            ""
          );
          const provider = String(
            state.videoProvider ??
            state.video_provider ??
            row.video_provider ??
            ""
          );

          sourceMap[matchId] = {
            matchId,
            date,
            opponent,
            filename,
            provider,
            label: `${fmtDate(date)} · ${opponent}`,
            sync: normalizeSync(state.videoSync ?? state.video_sync ?? state ?? NATIVE_SYNC),
          };
        });

        const projectById = new Map<string, PlayerProjectAction>();
        const projectOnlyWithoutId: PlayerProjectAction[] = [];

        matchRows.forEach((row) => {
          const matchId = String(row.id);
          const source = sourceMap[matchId];
          if (!source) return;

          const state = (row.project_state ?? {}) as any;
          const projectActions = Array.isArray(state.actions) ? state.actions : [];

          projectActions
            .filter((a: any) => involved(a, playerId))
            .forEach((raw: any) => {
              const a = canonicalAction(raw, source, playerId);
              const id = actionId(raw);
              if (id) projectById.set(id, a);
              else projectOnlyWithoutId.push(a);
            });
        });

        const consumed = new Set<string>();
        const merged: PlayerProjectAction[] = [];

        sqlRows.forEach((raw) => {
          const matchId = String(raw.match_id ?? "");
          const source =
            sourceMap[matchId] ??
            {
              matchId,
              label: "Match",
              date: "",
              opponent: "Adversaire",
              filename: "",
              provider: "",
              sync: NATIVE_SYNC,
            };

          const sqlAction = canonicalAction(raw, source, playerId);
          const id = actionId(raw);
          const projectAction = id ? projectById.get(id) : undefined;
          if (id && projectAction) consumed.add(id);
          merged.push(mergeCanonical(projectAction, sqlAction));
        });

        projectById.forEach((a, id) => {
          if (!consumed.has(id)) merged.push(a);
        });
        merged.push(...projectOnlyWithoutId);

        // Déduplication finale : une action codée = une entrée.
        const unique = new Map<string, PlayerProjectAction>();
        merged.forEach((a) => {
          const key = a.id || `${a.matchId}|${a.q}|${a.clock}|${a.actionType}|${a.playerId}`;
          if (!unique.has(key)) unique.set(key, a);
          else unique.set(key, mergeCanonical(unique.get(key), a));
        });

        const finalActions = Array.from(unique.values()).sort((a, b) => {
          const da = sourceMap[a.matchId]?.date || a.date || "";
          const db = sourceMap[b.matchId]?.date || b.date || "";
          return db.localeCompare(da);
        });

        if (!active) return;
        setSources(sourceMap);
        setActions(finalActions);

        // Tentative silencieuse : reconnecte automatiquement toutes les sources
        // pour lesquelles le navigateur possède encore un handle autorisé.
        Object.values(sourceMap).forEach((source) => {
          void tryRestoreSource(source, false);
        });
      } catch (e: any) {
        console.error("PlayerAllProjectClips:", e);
        if (active) {
          setActions([]);
          setSources({});
          setError(e?.message || "Impossible de charger les projets du joueur.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
    // teamId / playerId suffisent : le composant agrège toute la base à chaque changement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, playerId]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch { /* noop */ }
      });
    };
  }, []);

  const matches = useMemo(
    () => Array.from(new Set(actions.map((a) => a.matchId))).map((id) => sources[id]).filter(Boolean),
    [actions, sources]
  );
  const systems = useMemo(
    () => Array.from(new Set(actions.map((a) => a.systemeName || a.systemeSlot || a.systemeJeu).filter(Boolean) as string[])).sort(),
    [actions]
  );
  const tempsForts = useMemo(
    () => Array.from(new Set(actions.map((a) => a.tempsFort).filter(Boolean) as string[])).sort(),
    [actions]
  );
  const actionTypes = useMemo(
    () => Array.from(new Set(actions.map((a) => a.actionType).filter(Boolean) as string[])).sort(),
    [actions]
  );
  const results = useMemo(
    () => Array.from(new Set(actions.map((a) => a.shotResult).filter(Boolean) as string[])).sort(),
    [actions]
  );
  const zones = useMemo(
    () => Array.from(new Set(actions.map((a) => a.zone).filter(Boolean) as string[])).sort(),
    [actions]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return actions.filter((a) => {
      const system = String(a.systemeName || a.systemeSlot || a.systemeJeu || "");
      const haystack = [
        a.matchLabel,
        a.opponent,
        a.date,
        system,
        a.tempsFort,
        a.actionType,
        a.shotType,
        a.shotResult,
        a.zone,
        a.role,
      ].filter(Boolean).join(" ").toLowerCase();

      return (!q || haystack.includes(q))
        && (fMatch === "all" || a.matchId === fMatch)
        && (fSystem === "all" || system === fSystem)
        && (fTf === "all" || a.tempsFort === fTf)
        && (fAction === "all" || a.actionType === fAction)
        && (fResult === "all" || a.shotResult === fResult)
        && (fZone === "all" || a.zone === fZone);
    });
  }, [actions, search, fMatch, fSystem, fTf, fAction, fResult, fZone]);

  const codedClips = actions.filter(clipReady).length;
  const filteredClips = filtered.filter(clipReady).length;
  const connectedMatches = Object.keys(urls).filter((id) => urls[id]).length;

  const openAt = (action: PlayerProjectAction) => {
    const pool = filtered.filter(clipReady);
    const index = Math.max(0, pool.findIndex((a) => a.id === action.id));
    setModal({
      items: pool.length ? pool : [action],
      index,
      title: `${playerName} · toutes les séquences codées`,
    });
  };

  if (loading) {
    return <div className="papc-shell papc-loading">Chargement de tous les projets codés du joueur…</div>;
  }

  return (
    <section className="papc-shell">
      <header className="papc-head">
        <div>
          <span className="papc-eyebrow">VIDÉOTHÈQUE JOUEUR</span>
          <h3>Toutes les séquences codées</h3>
          <p>
            {codedClips} séquence{codedClips > 1 ? "s" : ""} · {matches.length} match{matches.length > 1 ? "s" : ""}
            {" · "}
            {connectedMatches}/{matches.length} vidéo{matches.length > 1 ? "s" : ""} locale{matches.length > 1 ? "s" : ""} connectée{connectedMatches > 1 ? "s" : ""}
          </p>
        </div>
        <div className="papc-summary">
          <b>{filteredClips}</b>
          <span>affichées</span>
        </div>
      </header>

      {error && <div className="papc-error">{error}</div>}

      <div className="papc-filters">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 Rechercher dans tous les projets…"
        />

        <select value={fMatch} onChange={(e) => setFMatch(e.target.value)}>
          <option value="all">Tous les matchs</option>
          {matches.map((m) => <option key={m.matchId} value={m.matchId}>{m.label}</option>)}
        </select>

        <select value={fSystem} onChange={(e) => setFSystem(e.target.value)}>
          <option value="all">Tous les systèmes</option>
          {systems.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={fTf} onChange={(e) => setFTf(e.target.value)}>
          <option value="all">Tous les temps forts</option>
          {tempsForts.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={fAction} onChange={(e) => setFAction(e.target.value)}>
          <option value="all">Toutes les actions</option>
          {actionTypes.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={fResult} onChange={(e) => setFResult(e.target.value)}>
          <option value="all">Tous les résultats</option>
          {results.map((v) => <option key={v} value={v}>{v === "made" ? "Marqué" : v === "missed" ? "Raté" : v}</option>)}
        </select>

        <select value={fZone} onChange={(e) => setFZone(e.target.value)}>
          <option value="all">Toutes les zones</option>
          {zones.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <button onClick={() => {
          setSearch(""); setFMatch("all"); setFSystem("all"); setFTf("all");
          setFAction("all"); setFResult("all"); setFZone("all");
        }}>Réinitialiser</button>
      </div>

      <div className="papc-matches">
        {matches.map((m) => {
          const count = actions.filter((a) => a.matchId === m.matchId && clipReady(a)).length;
          if (!count) return null;
          const connected = Boolean(urls[m.matchId]);

          return (
            <div className={`papc-source ${connected ? "connected" : ""}`} key={m.matchId}>
              <div>
                <b>{m.label}</b>
                <small>{count} séquence{count > 1 ? "s" : ""}{m.filename ? ` · ${m.filename}` : ""}</small>
              </div>
              {connected ? (
                <span className="papc-ok">● Vidéo prête</span>
              ) : (
                <button
                  disabled={reconnecting === m.matchId}
                  onClick={() => void reconnectSource(m.matchId)}
                >
                  {reconnecting === m.matchId ? "Recherche…" : "📁 Retrouver la vidéo"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="papc-list">
        {filtered.filter(clipReady).length === 0 ? (
          <div className="papc-empty">Aucune séquence avec ces filtres.</div>
        ) : filtered.filter(clipReady).map((a) => {
          const source = sources[a.matchId];
          const connected = Boolean(urls[a.matchId]);

          return (
            <article className="papc-card" key={`${a.matchId}:${a.id}`}>
              <div className="papc-card-top">
                <span>{a.matchLabel}</span>
                <em>{a.role === "passeur" ? "PD" : a.role === "rebondeur" ? "REB" : "ACTION"}</em>
              </div>
              <b>{actionLabel(a)}</b>
              <small>
                {[
                  a.q ? `Q${a.q}` : null,
                  a.clock,
                  a.context === "defense" ? "Défense" : a.context === "attaque" ? "Attaque" : null,
                  a.zone,
                ].filter(Boolean).join(" · ")}
              </small>
              <div className="papc-card-actions">
                {!connected ? (
                  <button onClick={() => void reconnectSource(a.matchId)}>
                    📁 Retrouver la vidéo du match
                  </button>
                ) : (
                  <button className="primary" onClick={() => openAt(a)}>
                    ▶ Revoir la séquence
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {modal && (
        <ActionClipsModal
          open
          actions={modal.items}
          title={modal.title}
          startIndex={modal.index}
          onClose={() => setModal(null)}
          videoUrlForAction={(a) => urls[String(a.matchId ?? "")] ?? null}
          syncForAction={(a) => sources[String(a.matchId ?? "")]?.sync ?? NATIVE_SYNC}
          playerName={(id) => String(id ?? "") === playerId ? playerName : undefined}
          describe={(a) => actionLabel(a as PlayerProjectAction)}
        />
      )}

      <style jsx>{`
        .papc-shell{margin:0 0 18px;border:1px solid #e7d8c2;border-radius:16px;background:#fff;padding:16px;box-shadow:0 10px 28px rgba(54,30,12,.05)}
        .papc-loading{color:#7f6a5d;font-weight:700}
        .papc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
        .papc-eyebrow{font-size:10px;font-weight:900;letter-spacing:.08em;color:#d4a24c}
        .papc-head h3{margin:3px 0 3px;color:#6b1a2c;font-size:19px}
        .papc-head p{margin:0;color:#7d6c62;font-size:12px}
        .papc-summary{min-width:70px;text-align:center;border:1px solid #eadfce;border-radius:12px;padding:7px 10px;background:#fffaf3}
        .papc-summary b{display:block;color:#6b1a2c;font-size:20px}.papc-summary span{font-size:9px;color:#8e7d72;text-transform:uppercase;font-weight:900}
        .papc-error{margin-bottom:10px;border:1px solid #f2c8c8;background:#fff5f5;color:#9d2d2d;padding:8px 10px;border-radius:8px;font-size:11px}
        .papc-filters{display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(3,minmax(125px,1fr));gap:7px;margin-bottom:10px}
        .papc-filters input,.papc-filters select{min-width:0;border:1px solid #ded4c8;background:#fff;color:#35281f;border-radius:8px;padding:8px 9px;font-size:11px}
        .papc-filters button{border:1px solid #d4a24c;background:#fff9ee;color:#6b1a2c;border-radius:8px;padding:7px 9px;font-size:10px;font-weight:800;cursor:pointer}
        .papc-matches{display:flex;gap:7px;overflow-x:auto;padding:2px 0 10px}
        .papc-source{flex:0 0 250px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #e2d8cd;border-radius:9px;padding:8px;background:#faf7f3}
        .papc-source.connected{border-color:#b9d7be;background:#f6fff7}.papc-source>div{min-width:0;display:grid}.papc-source b{font-size:10.5px;color:#46372e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.papc-source small{font-size:9px;color:#87766a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .papc-source button{white-space:nowrap;border:1px solid #d4a24c;background:#fff;color:#6b1a2c;border-radius:7px;padding:5px 7px;font-size:9px;font-weight:800;cursor:pointer}.papc-ok{font-size:9px;color:#2d7d3c;font-weight:900;white-space:nowrap}
        .papc-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:8px;max-height:440px;overflow:auto;padding:2px}
        .papc-card{border:1px solid #e2d8cd;border-radius:11px;padding:9px;background:#fff;display:grid;gap:5px;transition:.15s}.papc-card:hover{border-color:#d4a24c;box-shadow:0 6px 14px rgba(74,43,18,.07)}
        .papc-card-top{display:flex;justify-content:space-between;gap:6px;color:#927e70;font-size:9px}.papc-card-top span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.papc-card-top em{font-style:normal;background:#f5ead8;color:#6b1a2c;border-radius:5px;padding:2px 5px;font-size:8px;font-weight:900}
        .papc-card>b{color:#35271f;font-size:11.5px}.papc-card>small{color:#847368;font-size:9.5px}
        .papc-card-actions{margin-top:3px}.papc-card-actions button{width:100%;border:1px solid #d4a24c;background:#fff9ef;color:#6b1a2c;border-radius:7px;padding:6px 8px;font-size:9.5px;font-weight:900;cursor:pointer}.papc-card-actions button.primary{background:#6b1a2c;border-color:#6b1a2c;color:#fff}
        .papc-empty{grid-column:1/-1;padding:24px;text-align:center;color:#8d7c70;border:1px dashed #dacdbf;border-radius:10px}
        @media(max-width:900px){.papc-filters{grid-template-columns:1fr 1fr}.papc-list{grid-template-columns:1fr}.papc-head{align-items:center}}
      `}</style>
    </section>
  );
}
