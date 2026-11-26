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
const AUTO_REFRESH_MS = 5 * 60 * 1000;

export function useLnbTeamStatistics(teamId: string, enabled: boolean, revision = 0) {
  const [result, setResult] = useState<{ teamId: string; data: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !teamId) {
      setResult(null);
      setLoading(false);
      setError("");
      return;
    }

    let active = true;
    let requestId = 0;
    let lastAttempt = 0;
    async function read(force = false, showLoading = false) {
      const id = ++requestId;
      lastAttempt = Date.now();
      if (showLoading) setLoading(true);
      try {
        const data = await loadLnbTeamStatistics(teamId, force);
        if (active && id === requestId) {
          setResult({ teamId, data });
          setError("");
        }
      } catch (failure) {
        if (active && id === requestId) {
          setError(failure instanceof Error ? failure.message : "Statistiques LNB indisponibles.");
        }
      } finally {
        if (active && id === requestId) setLoading(false);
      }
    }

    function refreshWhenVisible() {
      if (!document.hidden && Date.now() - lastAttempt >= AUTO_REFRESH_MS) void read();
    }

    function refreshOnRequest(event: Event) {
      if ((event as CustomEvent).detail === teamId) void read(true, true);
    }

    setError("");
    void read(false, true);
    const timer = window.setInterval(refreshWhenVisible, AUTO_REFRESH_MS);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("mybasket:lnb-updated", refreshOnRequest);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("mybasket:lnb-updated", refreshOnRequest);
    };
  }, [teamId, enabled, revision]);

  return { data: enabled && result?.teamId === teamId ? result.data : null, loading, error };
}
