"use client";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
// Share only in-flight requests: no private roster persists across sessions.
const pending = new Map<string, Promise<any>>();
export async function loadLnbTeamStatistics(teamId: string, refresh = false): Promise<any> {
  const { data: { session } } = await createClient().auth.getSession();
  const key = `${session?.user.id || "anonymous"}:${teamId}:${refresh}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetch(`/api/lnb/player-stats?teamId=${encodeURIComponent(teamId)}${refresh ? "&refresh=1" : ""}`, { cache: "no-store" }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Statistiques LNB indisponibles."); return result; });
  pending.set(key, request);
  request.finally(() => { if (pending.get(key) === request) pending.delete(key); }).catch(() => {});
  return request;
}
export function notifyLnbUpdated(teamId: string) { window.dispatchEvent(new CustomEvent("mybasket:lnb-updated", { detail: teamId })); }
export function useLnbTeamStatistics(teamId: string, enabled: boolean, revision = 0) {
  const [data, setData] = useState<any>(null), [loading, setLoading] = useState(false), [error, setError] = useState(""), [updates, setUpdates] = useState(0);
  useEffect(() => { const handler = (event: Event) => { if ((event as CustomEvent).detail === teamId) setUpdates(v => v + 1); }; window.addEventListener("mybasket:lnb-updated", handler); return () => window.removeEventListener("mybasket:lnb-updated", handler); }, [teamId]);
  useEffect(() => { let active = true; setData(null); setError(""); if (!enabled || !teamId) { setLoading(false); return; } setLoading(true); loadLnbTeamStatistics(teamId, updates > 0).then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [teamId, enabled, revision, updates]);
  return { data, loading, error };
}
