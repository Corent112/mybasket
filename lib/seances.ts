import type { SeanceItem } from "@/types/seance";

const STORAGE_KEY = "mybasket_seances";

export function newSeanceId() {
  return `seance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listSeances(): SeanceItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function getSeance(id: string): SeanceItem | null {
  return listSeances().find((s) => s.id === id) ?? null;
}

export function saveSeance(seance: SeanceItem) {
  const items = listSeances();
  const index = items.findIndex((s) => s.id === seance.id);

  const next =
    index >= 0
      ? items.map((s) => (s.id === seance.id ? seance : s))
      : [seance, ...items];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return seance;
}

export function deleteSeance(id: string) {
  const next = listSeances().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}