'use client';
import { persistLiveAction, type LiveMatchAction } from '@/lib/stats-supabase';
type PendingMarker = { matchId: string; teamId: string; action: LiveMatchAction };
const prefix = 'mybasket:shared-marker:';
const active = new Set<string>();
export function queueSharedMarker(item: PendingMarker): void {
  if (!item.action.id || !item.action.liveSessionId) throw new Error('Marqueur sans identité');
  // Une clé par marqueur : deux onglets ne remplacent pas une liste partagée.
  window.localStorage.setItem(`${prefix}${item.action.liveSessionId}:${item.action.id}`, JSON.stringify(item));
}
export async function flushSharedMarkers(sessionId: string): Promise<void> {
  if (!window.navigator.onLine || active.has(sessionId)) return;
  active.add(sessionId);
  try {
    const keys = Object.keys(window.localStorage).filter(key => key.startsWith(`${prefix}${sessionId}:`));
    for (const key of keys) {
      const send = async () => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return true;
        const item: PendingMarker = JSON.parse(raw);
        const result = await persistLiveAction(item);
        if (!result.ok) return false;
        if (window.localStorage.getItem(key) === raw) window.localStorage.removeItem(key);
        return true;
      };
      const ok = window.navigator.locks
        ? await window.navigator.locks.request(key, send)
        : await send();
      if (!ok) break; // Conserver l'original jusqu'à confirmation de Supabase.
    }
  } catch { /* Conserver la file pour la prochaine tentative. */ }
  finally { active.delete(sessionId); }
}
