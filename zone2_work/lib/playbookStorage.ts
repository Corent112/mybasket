// ============================================================
// MyBasket — Stockage Plaquette (Étape 4)
// localStorage maintenant, Supabase plus tard.
// ============================================================

import type { Play, EditorState } from "@/types/playbook";

const PLAYS_KEY = "mybasket_plays_v1";
const DRAFT_KEY = "mybasket_play_draft_v1";

const isBrowser = () => typeof window !== "undefined";

const uid = () =>
  `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ---------- Liste de plays ----------

export function loadPlays(): Play[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(PLAYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Play[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlays(list: Play[]) {
  if (!isBrowser()) return;
  try { localStorage.setItem(PLAYS_KEY, JSON.stringify(list)); } catch {}
}

/** Sauvegarde un play à partir de l'état de l'éditeur */
export function savePlayFromEditor(editor: EditorState): Play {
  const play: Play = {
    id: uid(),
    title: editor.title || "Sans titre",
    courtType: editor.courtType,
    phases: editor.phases,
    currentPhase: editor.currentPhase,
    updatedAt: new Date().toISOString(),
  };
  const next = [play, ...loadPlays()];
  savePlays(next);
  return play;
}

export function deletePlay(id: string) {
  savePlays(loadPlays().filter((p) => p.id !== id));
}

// ---------- Brouillon de l'éditeur (auto-save) ----------

export function loadDraft(): EditorState | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EditorState;
  } catch {
    return null;
  }
}

export function saveDraft(editor: EditorState) {
  if (!isBrowser()) return;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(editor)); } catch {}
}

export function clearDraft() {
  if (!isBrowser()) return;
  localStorage.removeItem(DRAFT_KEY);
}