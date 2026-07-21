"use client";

// components/club/CreneauxPlanner.tsx
//
// Planning MyBasket — version stable.
// Objectif :
// - créer des salles avec disponibilités par jour/plage horaire
// - afficher les zones disponibles
// - créer/modifier/supprimer des créneaux
// - empêcher les créneaux hors disponibilité
// - empêcher les chevauchements
// - glisser/déposer
// - copier/coller
// - dupliquer au clic droit
//
// Dépendances attendues dans lib/creneaux-supabase.ts :
// addGymnaseWithAvailabilities, replaceGymnaseAvailabilities,
// loadGymnaseAvailabilities, loadGymnases, loadSlots,
// addSlot, updateSlot, moveSlot, deleteSlot, etc.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type GymAvailability,
  type Gymnase,
  type NewSlot,
  type Slot,
  addGymnaseWithAvailabilities,
  addSlot,
  deleteGymnase,
  deleteSlot,
  getCurrentClubId,
  loadGymnaseAvailabilities,
  loadGymnases,
  loadSlots,
  moveSlot,
  renameGymnase,
  replaceGymnaseAvailabilities,
  updateSlot,
} from "../../lib/creneaux-supabase";
import { listClubCoaches } from "@/lib/club-core";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const START_MIN = 8 * 60;
const END_MIN = 23 * 60;
const SLOT_MIN = 30;
const SNAP_MIN = 15;
const PX_PER_MIN = 1.05;
const HOUR_RAIL_W = 72;
const GYM_COL_W = 200;
const DAY_HEAD_H = 84;
const DRAG_THRESHOLD = 5;

function draftUid() {
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const GENDERS = ["Mixte", "M", "F"];

const CATEGORY_OPTIONS = [
  "U7",
  "U9",
  "U11",
  "U13",
  "U15",
  "U18",
  "U21",
  "Seniors",
  "Anciens",
  "Basket École",
  "Autre",
];

const TEAM_OPTIONS = [
  "Équipe 1",
  "Équipe 2",
  "Équipe 3",
  "Équipe 4",
  "Loisirs",
  "3x3",
  "Entreprise",
  "Basket École",
  "Baby Basket",
  "Mini Basket",
  "National",
  "Régional",
  "Départemental",
  "Autre",
];

const SLOT_TYPE_OPTIONS = [
  "Entraînement",
  "Match",
  "Musculation",
  "Vidéo",
  "Réunion",
  "Stage",
  "Tournoi",
  "Basket École",
  "Entreprise",
  "Autre",
];

const COACH_OPTIONS = [
  "Corentin Sauzeau",
  "Coach principal",
  "Assistant coach",
  "Préparateur physique",
  "Intervenant extérieur",
];

const PALETTE = [
  { name: "Bordeaux", value: "#6B1A2C" },
  { name: "Or", value: "#D4A24C" },
  { name: "Bleu", value: "#2F6F8F" },
  { name: "Vert", value: "#3E7C4F" },
  { name: "Violet", value: "#5B3E8F" },
  { name: "Orange", value: "#B5532A" },
  { name: "Rose", value: "#C65A8A" },
  { name: "Bleu vif", value: "#2563EB" },
  { name: "Noir", value: "#111827" },
  { name: "Gris", value: "#6B7280" },
];

const TIME_OPTIONS = Array.from(
  { length: Math.floor((END_MIN - START_MIN) / SNAP_MIN) + 1 },
  (_, index) => START_MIN + index * SNAP_MIN
);

type SlotForm = {
  day: number;
  gymnaseId: string;
  category: string;
  gender: string;
  team: string;
  slotType: string;
  coachName: string;
  notes: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string | null;
};

type ExtendedNewSlot = NewSlot & {
  slotType?: string;
  coachName?: string;
  notes?: string;
};

type AvailabilityDraft = {
  uid: string;
  day: number;
  open: string;
  close: string;
};

type SelectedCell = {
  day: number;
  gymnaseId: string;
  startMin: number;
};

type DragState = {
  id: string;
  pointerId: number;
  originX: number;
  originY: number;
  grabOffsetMin: number;
  dragging: boolean;
  preview?: {
    day: number;
    gymnaseId: string;
    startMin: number;
  };
};

type ResizeState = {
  id: string;
  pointerId: number;
  originY: number;
  originalDuration: number;
  resizing: boolean;
};

function scheduleHeight() {
  return (END_MIN - START_MIN) * PX_PER_MIN;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toTime(min: number) {
  const safe = Number.isFinite(min) ? min : START_MIN;
  const clamped = clamp(Math.round(safe), 0, 24 * 60 - 1);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fromTime(value: string) {
  const raw = String(value || "").trim().toLowerCase();

  if (!raw) return START_MIN;

  // Accepte 17:00, 17h00, 17h, 17, 17.30
  const normalized = raw
    .replace("h", ":")
    .replace(".", ":")
    .replace(/\s+/g, "");

  const [hRaw, mRaw = "0"] = normalized.split(":");
  const h = Number.parseInt(hRaw, 10);
  const m = Number.parseInt(mRaw, 10);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return START_MIN;

  return clamp(h * 60 + m, 0, 24 * 60 - 1);
}

function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function nowInMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function snap(min: number) {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

function errorMessage(e: any, fallback: string) {
  return e?.message || e?.details || e?.hint || e?.code || fallback;
}

function colorFor(slot: Pick<Slot, "color">) {
  return slot.color || "#6B1A2C";
}



function getSlotType(slot: Slot) {
  return String((slot as any).slotType ?? (slot as any).slot_type ?? "Entraînement");
}

function getSlotCoach(slot: Slot) {
  return String((slot as any).coachName ?? (slot as any).coach_name ?? "");
}

function getSlotNotes(slot: Slot) {
  return String((slot as any).notes ?? "");
}

function slotTypeIcon(type: string) {
  switch (type) {
    case "Match":
      return "🏆";
    case "Musculation":
      return "💪";
    case "Vidéo":
      return "🎥";
    case "Réunion":
      return "🧠";
    case "Stage":
      return "🏕️";
    case "Tournoi":
      return "🏀";
    case "Basket École":
      return "📚";
    case "Entreprise":
      return "🏢";
    default:
      return "🏀";
  }
}

function genderLabel(gender: string) {
  if (gender === "M") return "Masculin";
  if (gender === "F") return "Féminin";
  return "Mixte";
}

function teamLabel(team: string) {
  const clean = String(team || "").trim();
  if (!clean) return "";

  const numeric = clean.match(/^Équipe\s*(\d+)$/i) || clean.match(/^Equipe\s*(\d+)$/i) || clean.match(/^(\d+)$/);
  if (numeric) return numeric[1];

  return clean;
}

function slotTitle(slot: Pick<Slot, "category" | "team">) {
  const category = String(slot.category || "Créneau").trim();
  const team = teamLabel(slot.team);

  if (!team) return category;
  return `${category} - ${team}`;
}

function formFromSlot(slot: Slot): SlotForm {
  return {
    day: slot.day,
    gymnaseId: slot.gymnaseId,
    category: slot.category,
    gender: slot.gender || "Mixte",
    team: slot.team || "",
    slotType: getSlotType(slot),
    coachName: getSlotCoach(slot),
    notes: getSlotNotes(slot),
    start: toTime(slot.startMin),
    end: toTime(slot.startMin + slot.durationMin),
    allDay: slot.startMin <= START_MIN && slot.startMin + slot.durationMin >= END_MIN,
    color: slot.color ?? null,
  };
}

function formToPayload(form: SlotForm): ExtendedNewSlot {
  if (form.allDay) {
    return {
      day: form.day,
      gymnaseId: form.gymnaseId,
      category: form.category.trim(),
      gender: form.gender,
      team: form.team,
      slotType: form.slotType,
      coachName: form.coachName,
      notes: form.notes,
      startMin: START_MIN,
      durationMin: END_MIN - START_MIN,
      color: form.color,
    };
  }

  const rawStart = fromTime(form.start);
  const rawEnd = fromTime(form.end);

  const startMin = clamp(rawStart, START_MIN, END_MIN - SLOT_MIN);
  const safeEnd = Math.max(rawEnd, startMin + SLOT_MIN);
  const endMin = clamp(safeEnd, startMin + SLOT_MIN, END_MIN);

  return {
    day: form.day,
    gymnaseId: form.gymnaseId,
    category: form.category.trim(),
    gender: form.gender,
    team: form.team,
    slotType: form.slotType,
    coachName: form.coachName,
    notes: form.notes,
    startMin,
    durationMin: Math.max(SLOT_MIN, endMin - startMin),
    color: form.color,
  };
}


function payloadFromFormWithAvailability(form: SlotForm, availabilities: GymAvailability[]): ExtendedNewSlot {
  if (!form.allDay) return formToPayload(form);

  const ranges = availabilitiesFor(availabilities, form.day, form.gymnaseId);
  const openMin = ranges.length ? Math.min(...ranges.map((range) => range.openMin)) : START_MIN;
  const closeMin = ranges.length ? Math.max(...ranges.map((range) => range.closeMin)) : END_MIN;

  return {
    day: form.day,
    gymnaseId: form.gymnaseId,
    category: form.category.trim(),
    gender: form.gender,
    team: form.team,
    slotType: form.slotType,
    coachName: form.coachName,
    notes: form.notes,
    startMin: openMin,
    durationMin: Math.max(SLOT_MIN, closeMin - openMin),
    color: form.color,
  };
}

function hasConflict(
  currentSlots: Slot[],
  candidate: {
    id?: string;
    day: number;
    gymnaseId: string;
    startMin: number;
    durationMin: number;
  }
) {
  const candidateEnd = candidate.startMin + candidate.durationMin;

  return currentSlots.some((slot) => {
    if (candidate.id && slot.id === candidate.id) return false;
    if (slot.day !== candidate.day) return false;
    if (slot.gymnaseId !== candidate.gymnaseId) return false;

    const slotStart = slot.startMin;
    const slotEnd = slot.startMin + slot.durationMin;

    return candidate.startMin < slotEnd && candidateEnd > slotStart;
  });
}

function availabilitiesFor(
  availabilities: GymAvailability[],
  day: number,
  gymnaseId: string
) {
  return availabilities
    .filter((a) => a.day === day && a.gymnaseId === gymnaseId)
    .sort((a, b) => a.openMin - b.openMin);
}

function isInsideAvailability(
  availabilities: GymAvailability[],
  candidate: {
    day: number;
    gymnaseId: string;
    startMin: number;
    durationMin: number;
  }
) {
  const endMin = candidate.startMin + candidate.durationMin;
  const ranges = availabilitiesFor(availabilities, candidate.day, candidate.gymnaseId);

  return ranges.some((range) => candidate.startMin >= range.openMin && endMin <= range.closeMin);
}

function defaultAvailabilityDrafts(): AvailabilityDraft[] {
  return [
    { uid: draftUid(), day: 0, open: "17:00", close: "22:00" },
    { uid: draftUid(), day: 1, open: "17:00", close: "22:00" },
    { uid: draftUid(), day: 2, open: "17:00", close: "22:00" },
    { uid: draftUid(), day: 3, open: "17:00", close: "22:00" },
    { uid: draftUid(), day: 4, open: "17:00", close: "22:00" },
  ];
}

function normalizeDrafts(drafts: AvailabilityDraft[]) {
  return drafts
    .map((draft) => {
      const openMin = fromTime(draft.open);
      const closeMin = fromTime(draft.close);

      return {
        day: clamp(Number(draft.day), 0, 6),
        openMin,
        closeMin,
      };
    })
    .filter((row) => row.closeMin > row.openMin)
    .sort((a, b) => a.day - b.day || a.openMin - b.openMin);
}

function hasInvalidDraft(drafts: AvailabilityDraft[]) {
  return drafts.some((draft) => fromTime(draft.close) <= fromTime(draft.open));
}

export default function CreneauxPlanner({ clubId: forcedClubId }: { clubId?: string }) {
  const colRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  const [clubId, setClubId] = useState<string | null>(null);
  const [gyms, setGyms] = useState<Gymnase[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [availabilities, setAvailabilities] = useState<GymAvailability[]>([]);
  const [coachOptions, setCoachOptions] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [, forceRender] = useState(0);
  const [gymModalOpen, setGymModalOpen] = useState(false);
  const [availabilityGym, setAvailabilityGym] = useState<Gymnase | null>(null);
  const [slotForm, setSlotForm] = useState<SlotForm | null>(null);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [copiedSlot, setCopiedSlot] = useState<Slot | null>(null);

  const height = scheduleHeight();
  const today = todayIndex();
  const now = nowInMinutes();
  const showNow = now >= START_MIN && now <= END_MIN;

  const hourMarks: number[] = [];
  for (let min = START_MIN; min <= END_MIN; min += 60) hourMarks.push(min);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const id = forcedClubId ?? (await getCurrentClubId());

      if (!id) {
        setClubId(null);
        setGyms([]);
        setSlots([]);
        setAvailabilities([]);
        setError("Aucun club actif trouvé pour ton compte.");
        return;
      }

      setClubId(id);

      const [gymRows, slotRows, availabilityRows, coachRows] = await Promise.all([
        loadGymnases(id),
        loadSlots(id),
        loadGymnaseAvailabilities(id),
        listClubCoaches(id).catch(() => []),
      ]);

      setGyms(gymRows);
      setSlots(slotRows);
      setAvailabilities(availabilityRows);
      setCoachOptions(coachRows.map((coach) => coach.name).filter(Boolean));
    } catch (e: any) {
      console.error("Erreur chargement planning :", e);
      setError(errorMessage(e, "Chargement du planning impossible."));
    } finally {
      setLoading(false);
    }
  }, [forcedClubId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => forceRender((x) => x + 1), 30000);
    return () => window.clearInterval(interval);
  }, []);

  async function pasteCopiedSlot() {
    if (!clubId || !copiedSlot || !selectedCell) {
      setError("Sélectionne une cellule puis colle le créneau.");
      return;
    }

    const candidate: ExtendedNewSlot = {
      day: selectedCell.day,
      gymnaseId: selectedCell.gymnaseId,
      category: copiedSlot.category,
      gender: copiedSlot.gender,
      team: copiedSlot.team,
      slotType: getSlotType(copiedSlot),
      coachName: getSlotCoach(copiedSlot),
      notes: getSlotNotes(copiedSlot),
      startMin: selectedCell.startMin,
      durationMin: copiedSlot.durationMin,
      color: copiedSlot.color ?? null,
    };

    if (!isInsideAvailability(availabilities, candidate)) {
      setError("Collage impossible : cette zone est hors disponibilité.");
      return;
    }

    if (hasConflict(slots, candidate)) {
      setError("Collage impossible : chevauchement détecté.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const created = await addSlot(clubId, candidate);
      setSlots((prev) => [...prev, created]);
      setSelectedSlotId(created.id);
      setSelectedCell(null);
    } catch (e: any) {
      console.error("Erreur collage créneau :", e);
      setError(errorMessage(e, "Collage impossible."));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA";

      if (isTyping) return;

      const isCopy = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c";
      const isPaste = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v";
      const isDelete = event.key === "Backspace" || event.key === "Delete";

      if (isCopy && selectedSlotId) {
        const slot = slots.find((s) => s.id === selectedSlotId);
        if (slot) {
          setCopiedSlot(slot);
          setError(`Créneau "${slot.category || "Créneau"}" copié.`);
        }
      }

      if (isPaste) {
        event.preventDefault();
        pasteCopiedSlot();
      }

      if (isDelete && selectedSlotId) {
        const slot = slots.find((s) => s.id === selectedSlotId);
        if (slot) openEditSlot(slot);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlotId, selectedCell, copiedSlot, slots, clubId, availabilities]);

  const slotsByColumn = useMemo(() => {
    const map = new Map<string, Slot[]>();

    for (const slot of slots) {
      const drag = dragRef.current;
      const visual =
        drag?.id === slot.id && drag.dragging && drag.preview
          ? drag.preview
          : { day: slot.day, gymnaseId: slot.gymnaseId, startMin: slot.startMin };

      const key = `${visual.day}:${visual.gymnaseId}`;
      const arr = map.get(key) ?? [];
      arr.push(slot);
      map.set(key, arr);
    }

    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const da =
          dragRef.current?.id === a.id && dragRef.current.dragging && dragRef.current.preview
            ? dragRef.current.preview.startMin
            : a.startMin;

        const db =
          dragRef.current?.id === b.id && dragRef.current.dragging && dragRef.current.preview
            ? dragRef.current.preview.startMin
            : b.startMin;

        return da - db;
      });
    }

    return map;
  }, [slots]);

  const columnKey = (day: number, gymId: string) => `${day}:${gymId}`;

  const visualOf = (slot: Slot) => {
    const drag = dragRef.current;
    if (drag?.id === slot.id && drag.dragging && drag.preview) return drag.preview;
    return { day: slot.day, gymnaseId: slot.gymnaseId, startMin: slot.startMin };
  };

  const visualDurationOf = (slot: Slot) => {
    const resize = resizeRef.current;
    if (resize?.id === slot.id && resize.resizing) {
      return resize.originalDuration;
    }
    return slot.durationMin;
  };

  const openCreateSlot = (
    day = today,
    gymnaseId = gyms[0]?.id || "",
    startMin = 18 * 60
  ) => {
    if (!gyms.length) {
      setError("Crée d'abord une salle avant d'ajouter un créneau.");
      return;
    }

    const candidate = {
      day,
      gymnaseId: gymnaseId || gyms[0].id,
      startMin: clamp(startMin, START_MIN, END_MIN - SLOT_MIN),
      durationMin: 90,
    };

    if (!isInsideAvailability(availabilities, candidate)) {
      setError("Impossible : ce créneau est hors des disponibilités du gymnase.");
      return;
    }

    setEditingSlotId(null);
    setSlotForm({
      day,
      gymnaseId: candidate.gymnaseId,
      category: "",
      gender: "Mixte",
      team: "",
      slotType: "Entraînement",
      coachName: "",
      notes: "",
      start: toTime(candidate.startMin),
      end: toTime(clamp(candidate.startMin + 90, START_MIN + SLOT_MIN, END_MIN)),
      allDay: false,
      color: null,
    });
  };

  const openEditSlot = (slot: Slot) => {
    setEditingSlotId(slot.id);
    setSelectedSlotId(slot.id);
    setSlotForm(formFromSlot(slot));
  };

  const saveSlot = async () => {
    if (!slotForm || !clubId) return;

    const payload = payloadFromFormWithAvailability(slotForm, availabilities);

    if (!payload.category.trim()) {
      setError("Ajoute une catégorie ou un nom d’équipe pour créer le créneau.");
      return;
    }

    if (!isInsideAvailability(availabilities, payload)) {
      setError("Impossible : ce créneau est hors des disponibilités du gymnase.");
      return;
    }

    if (hasConflict(slots, { id: editingSlotId ?? undefined, ...payload })) {
      setError("Impossible : ce créneau chevauche déjà un autre créneau sur cette salle.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editingSlotId) {
        const updated = await updateSlot(editingSlotId, payload);
        setSlots((prev) => prev.map((s) => (s.id === editingSlotId ? updated : s)));
      } else {
        const created = await addSlot(clubId, payload);
        setSlots((prev) => [...prev, created]);
        setSelectedSlotId(created.id);
      }

      setSlotForm(null);
      setEditingSlotId(null);
      setSelectedCell(null);
    } catch (e: any) {
      console.error("Erreur sauvegarde créneau :", e);
      setError(errorMessage(e, "Créneau non enregistré."));
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = async () => {
    if (!editingSlotId) return;

    const id = editingSlotId;
    if (!confirm("Supprimer ce créneau ?")) return;

    setSlotForm(null);
    setEditingSlotId(null);
    setSelectedSlotId(null);
    setSlots((prev) => prev.filter((s) => s.id !== id));

    try {
      await deleteSlot(id);
    } catch (e: any) {
      console.error("Erreur suppression créneau :", e);
      setError(errorMessage(e, "Suppression non enregistrée."));
      await load();
    }
  };

  const createGym = async (payload: { name: string; availabilities: AvailabilityDraft[] }) => {
    if (!clubId) {
      setError("Aucun club actif trouvé.");
      return;
    }

    const clean = payload.name.trim();
    const validAvailabilities = normalizeDrafts(payload.availabilities);

    if (!clean) {
      setError("Le nom de la salle est obligatoire.");
      return;
    }

    if (!validAvailabilities.length) {
      setError("Ajoute au moins un jour et une plage horaire pour cette salle.");
      return;
    }

    if (hasInvalidDraft(payload.availabilities)) {
      setError("Corrige les horaires : l'heure de fin doit être après l'heure de début.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const result = await addGymnaseWithAvailabilities({
        clubId,
        name: clean,
        position: gyms.length,
        availabilities: validAvailabilities,
      });

      setGyms((prev) => [...prev, result.gymnase]);
      setAvailabilities((prev) => [...prev, ...result.availabilities]);
      setGymModalOpen(false);
    } catch (e: any) {
      console.error("Erreur création salle complète :", e);
      setError(errorMessage(e, "Salle non créée."));
    } finally {
      setSaving(false);
    }
  };

  const saveGymAvailabilities = async (gym: Gymnase, drafts: AvailabilityDraft[]) => {
    if (!clubId) return;

    const rows = normalizeDrafts(drafts);

    if (!rows.length) {
      setError("Ajoute au moins une plage horaire valide.");
      return;
    }

    if (hasInvalidDraft(drafts)) {
      setError("Corrige les horaires : l'heure de fin doit être après l'heure de début.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const updated = await replaceGymnaseAvailabilities({
        clubId,
        gymnaseId: gym.id,
        availabilities: rows,
      });

      setAvailabilities((prev) => [...prev.filter((a) => a.gymnaseId !== gym.id), ...updated]);
      setAvailabilityGym(null);
    } catch (e: any) {
      console.error("Erreur sauvegarde disponibilités :", e);
      setError(errorMessage(e, "Disponibilités non enregistrées."));
    } finally {
      setSaving(false);
    }
  };

  const renameGym = async (gym: Gymnase) => {
    const name = prompt("Renommer la salle :", gym.name);
    if (!name || name.trim() === gym.name) return;

    const clean = name.trim();
    setGyms((prev) => prev.map((g) => (g.id === gym.id ? { ...g, name: clean } : g)));

    try {
      await renameGymnase(gym.id, clean);
    } catch (e: any) {
      console.error("Erreur renommage salle :", e);
      setError(errorMessage(e, "Renommage non enregistré."));
      await load();
    }
  };

  const removeGym = async (gym: Gymnase) => {
    if (!confirm(`Supprimer la salle "${gym.name}" et tous ses créneaux ?`)) return;

    setGyms((prev) => prev.filter((g) => g.id !== gym.id));
    setSlots((prev) => prev.filter((s) => s.gymnaseId !== gym.id));
    setAvailabilities((prev) => prev.filter((a) => a.gymnaseId !== gym.id));

    try {
      await deleteGymnase(gym.id);
    } catch (e: any) {
      console.error("Erreur suppression salle :", e);
      setError(errorMessage(e, "Suppression non enregistrée."));
      await load();
    }
  };

  const duplicateSlot = async (slot: Slot) => {
    if (!clubId) return;

    const candidate: ExtendedNewSlot = {
      day: slot.day,
      gymnaseId: slot.gymnaseId,
      category: `${slot.category} copie`,
      gender: slot.gender,
      team: slot.team,
      slotType: getSlotType(slot),
      coachName: getSlotCoach(slot),
      notes: getSlotNotes(slot),
      startMin: clamp(slot.startMin + slot.durationMin, START_MIN, END_MIN - slot.durationMin),
      durationMin: slot.durationMin,
      color: slot.color ?? null,
    };

    if (!isInsideAvailability(availabilities, candidate)) {
      setError("Duplication impossible : le créneau sort des disponibilités.");
      return;
    }

    if (hasConflict(slots, candidate)) {
      setError("Duplication impossible : le créneau suivant est déjà occupé.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const created = await addSlot(clubId, candidate);
      setSlots((prev) => [...prev, created]);
      setSelectedSlotId(created.id);
    } catch (e: any) {
      console.error("Erreur duplication créneau :", e);
      setError(errorMessage(e, "Duplication impossible."));
    } finally {
      setSaving(false);
    }
  };

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>, slot: Slot) => {
    if (event.button !== undefined && event.button !== 0) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();

    dragRef.current = {
      id: slot.id,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      grabOffsetMin: (event.clientY - rect.top) / PX_PER_MIN,
      dragging: false,
    };
  };

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>, slot: Slot) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== slot.id || drag.pointerId !== event.pointerId) return;

    if (!drag.dragging) {
      const moved = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
      if (moved < DRAG_THRESHOLD) return;
      drag.dragging = true;
    }

    let foundDay = slot.day;
    let foundGym = slot.gymnaseId;
    let colTop = 0;

    for (const [key, el] of colRefs.current.entries()) {
      const rect = el.getBoundingClientRect();

      if (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        const [dayRaw, gymId] = key.split(":");
        foundDay = Number(dayRaw);
        foundGym = gymId;
        colTop = rect.top;
        break;
      }
    }

    if (!colTop) {
      const fallback = colRefs.current.get(columnKey(slot.day, slot.gymnaseId));
      if (fallback) colTop = fallback.getBoundingClientRect().top;
    }

    const proposed = (event.clientY - colTop) / PX_PER_MIN - drag.grabOffsetMin + START_MIN;
    const startMin = clamp(snap(proposed), START_MIN, END_MIN - slot.durationMin);

    drag.preview = { day: foundDay, gymnaseId: foundGym, startMin };
    forceRender((x) => x + 1);
  };

  const pointerUp = async (event: React.PointerEvent<HTMLDivElement>, slot: Slot) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== slot.id || drag.pointerId !== event.pointerId) return;

    const preview = drag.preview;
    const wasDragging = drag.dragging;
    dragRef.current = null;

    if (!wasDragging) {
      setSelectedSlotId(slot.id);
      setSelectedCell(null);
      return;
    }

    if (!preview) {
      forceRender((x) => x + 1);
      return;
    }

    const candidate = {
      id: slot.id,
      day: preview.day,
      gymnaseId: preview.gymnaseId,
      startMin: preview.startMin,
      durationMin: slot.durationMin,
    };

    if (!isInsideAvailability(availabilities, candidate)) {
      setError("Déplacement impossible : hors disponibilité.");
      forceRender((x) => x + 1);
      return;
    }

    if (hasConflict(slots, candidate)) {
      setError("Déplacement impossible : chevauchement détecté.");
      forceRender((x) => x + 1);
      return;
    }

    setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, ...preview } : s)));

    try {
      const updated = await moveSlot(slot.id, preview);
      setSlots((prev) => prev.map((s) => (s.id === slot.id ? updated : s)));
    } catch (e: any) {
      console.error("Erreur déplacement créneau :", e);
      setError(errorMessage(e, "Déplacement non enregistré."));
      await load();
    }
  };

  const resizeStart = (event: React.PointerEvent<HTMLDivElement>, slot: Slot) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    resizeRef.current = {
      id: slot.id,
      pointerId: event.pointerId,
      originY: event.clientY,
      originalDuration: slot.durationMin,
      resizing: true,
    };
  };

  const resizeMove = (event: React.PointerEvent<HTMLDivElement>, slot: Slot) => {
    const resize = resizeRef.current;
    if (!resize || resize.id !== slot.id || resize.pointerId !== event.pointerId) return;

    const deltaMin = snap((event.clientY - resize.originY) / PX_PER_MIN);
    const durationMin = clamp(resize.originalDuration + deltaMin, SLOT_MIN, END_MIN - slot.startMin);

    resize.originalDuration = durationMin;
    forceRender((x) => x + 1);
  };

  const resizeEnd = async (event: React.PointerEvent<HTMLDivElement>, slot: Slot) => {
    const resize = resizeRef.current;
    if (!resize || resize.id !== slot.id || resize.pointerId !== event.pointerId) return;

    const durationMin = resize.originalDuration;
    resizeRef.current = null;

    const candidate = {
      id: slot.id,
      day: slot.day,
      gymnaseId: slot.gymnaseId,
      startMin: slot.startMin,
      durationMin,
    };

    if (!isInsideAvailability(availabilities, candidate)) {
      setError("Redimensionnement impossible : hors disponibilité.");
      forceRender((x) => x + 1);
      return;
    }

    if (hasConflict(slots, candidate)) {
      setError("Redimensionnement impossible : chevauchement détecté.");
      forceRender((x) => x + 1);
      return;
    }

    setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, durationMin } : s)));

    try {
      const updated = await updateSlot(slot.id, { durationMin });
      setSlots((prev) => prev.map((s) => (s.id === slot.id ? updated : s)));
    } catch (e: any) {
      console.error("Erreur redimensionnement créneau :", e);
      setError(errorMessage(e, "Redimensionnement non enregistré."));
      await load();
    }
  };

  const selectedSlot = selectedSlotId ? slots.find((s) => s.id === selectedSlotId) ?? null : null;

  return (
    <div className="club-planner">
      <header className="planner-top">
        <div>
          <p className="planner-kicker">Planning club</p>
          <h3>Créneaux & disponibilités</h3>
          <p>Déclare tes jours/heures de gymnase, puis remplis avec tes créneaux.</p>
        </div>

        <div className="planner-actions">
          <button type="button" className="planner-btn ghost" onClick={load}>Actualiser</button>
          <button type="button" className="planner-btn ghost" onClick={() => setGymModalOpen(true)}>+ Salle</button>
          <button type="button" className="planner-btn ghost" disabled={!selectedSlot} onClick={() => selectedSlot && setCopiedSlot(selectedSlot)}>Copier</button>
          <button type="button" className="planner-btn ghost" disabled={!copiedSlot || !selectedCell} onClick={pasteCopiedSlot}>Coller</button>
          <button
            type="button"
            className="planner-btn primary"
            onClick={() =>
              selectedCell
                ? openCreateSlot(selectedCell.day, selectedCell.gymnaseId, selectedCell.startMin)
                : openCreateSlot(today, gyms[0]?.id || "")
            }
            disabled={!gyms.length}
          >
            + Créneau
          </button>
        </div>
      </header>

      {error && <div className="planner-alert">{error}</div>}

      <section className="excel-toolbar">
        <div className="toolbar-card"><strong>{gyms.length}</strong><span>Salles</span></div>
        <div className="toolbar-card"><strong>{slots.length}</strong><span>Créneaux</span></div>
        <div className="toolbar-help">
          <kbd>Double-clic cellule</kbd> créer · <kbd>Double-clic créneau</kbd> modifier · <kbd>Clic droit</kbd> dupliquer · <kbd>Poignée</kbd> étirer
        </div>
      </section>

      <section className="rooms-strip">
        <div className="rooms-head"><span>Salles</span><strong>{gyms.length}</strong></div>

        {loading ? (
          <div className="rooms-loading">Chargement…</div>
        ) : gyms.length === 0 ? (
          <button type="button" className="empty-room" onClick={() => setGymModalOpen(true)}>
            <span>🏟️</span>
            <strong>Créer la première salle</strong>
            <small>Déclare les jours et horaires disponibles.</small>
          </button>
        ) : (
          <div className="room-chips">
            {gyms.map((gym) => (
              <div className="room-chip" key={gym.id}>
                <button type="button" className="room-name" onDoubleClick={() => renameGym(gym)}>{gym.name}</button>
                <button type="button" className="room-edit" onClick={() => setAvailabilityGym(gym)}>Dispos</button>
                <button type="button" className="room-delete" onClick={() => removeGym(gym)}>×</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <main className="calendar-shell">
        {loading ? (
          <div className="planner-loading">Chargement du planning…</div>
        ) : gyms.length === 0 ? (
          <div className="planner-zero">
            <span>🏀</span>
            <strong>Ton planning est prêt.</strong>
            <p>Commence par créer une salle et ses disponibilités.</p>
            <button type="button" className="planner-btn primary" onClick={() => setGymModalOpen(true)}>+ Créer une salle</button>
          </div>
        ) : (
          <div className="calendar-scroll">
            <div className="calendar-grid" style={{ height: DAY_HEAD_H + height }}>
              <aside className="hours-rail" style={{ width: HOUR_RAIL_W }}>
                <div className="hours-head" style={{ height: DAY_HEAD_H }}>Heure</div>
                <div className="hours-body" style={{ height }}>
                  {hourMarks.map((min) => (
                    <div key={min} className="hour-mark" style={{ top: (min - START_MIN) * PX_PER_MIN }}>{toTime(min)}</div>
                  ))}
                </div>
              </aside>

              <section className="days-grid">
                {showNow && <div className="now-line" style={{ top: DAY_HEAD_H + (now - START_MIN) * PX_PER_MIN }}><span /></div>}

                {DAYS.map((dayName, day) => (
                  <div key={dayName} className={`day-block ${day === today ? "is-today" : ""}`} style={{ width: gyms.length * GYM_COL_W }}>
                    <div className="day-head" style={{ height: DAY_HEAD_H }}>
                      <div className="day-title">
                        <strong>{dayName}</strong>
                        <span>{day === today ? "Aujourd’hui" : ""}</span>
                      </div>

                      <div className="gym-head-row">
                        {gyms.map((gym) => <div className="gym-head" key={gym.id} style={{ width: GYM_COL_W }}>{gym.name}</div>)}
                      </div>
                    </div>

                    <div className="day-columns" style={{ height }}>
                      {gyms.map((gym) => {
                        const key = columnKey(day, gym.id);
                        const columnSlots = slotsByColumn.get(key) ?? [];
                        const selected = selectedCell?.day === day && selectedCell?.gymnaseId === gym.id ? selectedCell : null;
                        const ranges = availabilitiesFor(availabilities, day, gym.id);

                        return (
                          <div
                            key={gym.id}
                            className="calendar-col"
                            style={{ width: GYM_COL_W }}
                            ref={(el) => {
                              if (el) colRefs.current.set(key, el);
                              else colRefs.current.delete(key);
                            }}
                            onClick={(event) => {
                              if (event.target !== event.currentTarget) return;
                              const rect = event.currentTarget.getBoundingClientRect();
                              const minute = clamp(snap((event.clientY - rect.top) / PX_PER_MIN + START_MIN), START_MIN, END_MIN - SLOT_MIN);
                              setSelectedCell({ day, gymnaseId: gym.id, startMin: minute });
                              setSelectedSlotId(null);
                            }}
                            onDoubleClick={(event) => {
                              if (event.target !== event.currentTarget) return;
                              const rect = event.currentTarget.getBoundingClientRect();
                              const minute = clamp(snap((event.clientY - rect.top) / PX_PER_MIN + START_MIN), START_MIN, END_MIN - SLOT_MIN);
                              openCreateSlot(day, gym.id, minute);
                            }}
                          >
                            {ranges.map((range) => (
                              <div
                                key={range.id}
                                className="availability-band"
                                style={{
                                  top: (range.openMin - START_MIN) * PX_PER_MIN,
                                  height: Math.max((range.closeMin - range.openMin) * PX_PER_MIN, 0),
                                }}
                              >
                                <span>{toTime(range.openMin)} - {toTime(range.closeMin)}</span>
                              </div>
                            ))}

                            {hourMarks.map((min) => <div key={min} className="hour-line" style={{ top: (min - START_MIN) * PX_PER_MIN }} />)}

                            {selected && (
                              <div
                                className="selected-cell"
                                style={{
                                  top: (selected.startMin - START_MIN) * PX_PER_MIN,
                                  height: SNAP_MIN * 2 * PX_PER_MIN,
                                }}
                              >
                                +
                              </div>
                            )}

                            {columnSlots.map((slot) => {
                              const visual = visualOf(slot);
                              const duration = visualDurationOf(slot);
                              const color = colorFor(slot);
                              const top = (visual.startMin - START_MIN) * PX_PER_MIN;
                              const slotHeight = Math.max(duration * PX_PER_MIN, 34);
                              const dragging = dragRef.current?.id === slot.id && dragRef.current.dragging;
                              const selectedSlotClass = selectedSlotId === slot.id ? "is-selected" : "";

                              return (
                                <div
                                  key={slot.id}
                                  className={`slot-card ${dragging ? "is-dragging" : ""} ${selectedSlotClass}`}
                                  style={{ top, height: slotHeight, borderLeftColor: color, background: `${color}20` }}
                                  onPointerDown={(event) => pointerDown(event, slot)}
                                  onPointerMove={(event) => pointerMove(event, slot)}
                                  onPointerUp={(event) => pointerUp(event, slot)}
                                  onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    openEditSlot(slot);
                                  }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    duplicateSlot(slot);
                                  }}
                                  onPointerCancel={() => {
                                    dragRef.current = null;
                                    resizeRef.current = null;
                                    forceRender((x) => x + 1);
                                  }}
                                >
                                  <strong style={{ color }}>
                                    {slotTypeIcon(getSlotType(slot))} {slotTitle(slot)}
                                  </strong>
                                  <small className="slot-meta">{genderLabel(slot.gender)}</small>
                                  {getSlotCoach(slot) && <small className="slot-coach">👤 {getSlotCoach(slot)}</small>}
                                  <span>{toTime(visual.startMin)} — {toTime(visual.startMin + duration)}</span>

                                  <div
                                    className="resize-handle"
                                    title="Étirer / réduire"
                                    onPointerDown={(event) => resizeStart(event, slot)}
                                    onPointerMove={(event) => resizeMove(event, slot)}
                                    onPointerUp={(event) => resizeEnd(event, slot)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          </div>
        )}
      </main>

      {gymModalOpen && <GymModal saving={saving} onClose={() => setGymModalOpen(false)} onCreate={createGym} />}

      {availabilityGym && (
        <AvailabilityModal
          gym={availabilityGym}
          saving={saving}
          current={availabilities.filter((a) => a.gymnaseId === availabilityGym.id)}
          onClose={() => setAvailabilityGym(null)}
          onSave={(drafts) => saveGymAvailabilities(availabilityGym, drafts)}
        />
      )}

      {slotForm && (
        <SlotModal
          title={editingSlotId ? "Modifier le créneau" : "Créer un créneau"}
          form={slotForm}
          gyms={gyms}
          coachOptions={coachOptions}
          saving={saving}
          onChange={setSlotForm}
          onSave={saveSlot}
          onCancel={() => {
            setSlotForm(null);
            setEditingSlotId(null);
          }}
          onDelete={editingSlotId ? removeSlot : undefined}
        />
      )}

      <PlannerStyles />
    </div>
  );
}

function GymModal({
  saving,
  onClose,
  onCreate,
}: {
  saving: boolean;
  onClose: () => void;
  onCreate: (payload: { name: string; availabilities: AvailabilityDraft[] }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [availabilities, setAvailabilities] = useState<AvailabilityDraft[]>(defaultAvailabilityDrafts());

  return (
    <div className="modal-layer" onClick={onClose}>
      <div className="room-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <span>🏟️</span>
          <div>
            <h4>Créer une salle</h4>
            <p>Déclare les jours et horaires où tu as le gymnase.</p>
          </div>
        </div>

        <label className="field full">
          Nom de la salle
          <input autoFocus value={name} placeholder="Gymnase du Pré Saint-Jean" onChange={(e) => setName(e.target.value)} />
        </label>

        <AvailabilityEditor value={availabilities} onChange={setAvailabilities} />

        <div className="modal-actions">
          <button type="button" className="planner-btn ghost" onClick={onClose}>Annuler</button>
          <button type="button" className="planner-btn primary" disabled={saving || !name.trim()} onClick={() => onCreate({ name, availabilities })}>
            {saving ? "Création…" : "Créer la salle"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AvailabilityModal({
  gym,
  current,
  saving,
  onClose,
  onSave,
}: {
  gym: Gymnase;
  current: GymAvailability[];
  saving: boolean;
  onClose: () => void;
  onSave: (drafts: AvailabilityDraft[]) => void | Promise<void>;
}) {
  const [drafts, setDrafts] = useState<AvailabilityDraft[]>(
    current.length
      ? current.map((a) => ({ uid: a.id || draftUid(), day: a.day, open: toTime(a.openMin), close: toTime(a.closeMin) }))
      : defaultAvailabilityDrafts()
  );

  return (
    <div className="modal-layer" onClick={onClose}>
      <div className="room-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <span>🕒</span>
          <div>
            <h4>Disponibilités — {gym.name}</h4>
            <p>Ces plages déterminent où tu peux placer des créneaux.</p>
          </div>
        </div>

        <AvailabilityEditor value={drafts} onChange={setDrafts} />

        <div className="modal-actions">
          <button type="button" className="planner-btn ghost" onClick={onClose}>Annuler</button>
          <button type="button" className="planner-btn primary" disabled={saving} onClick={() => onSave(drafts)}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AvailabilityEditor({
  value,
  onChange,
}: {
  value: AvailabilityDraft[];
  onChange: (value: AvailabilityDraft[]) => void;
}) {
  const addRow = () => onChange([...value, { uid: draftUid(), day: 0, open: "17:00", close: "22:00" }]);
  const updateRow = (index: number, patch: Partial<AvailabilityDraft>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className="availability-editor">
      <div className="availability-head">
        <strong>Jours et horaires</strong>
        <button type="button" className="planner-btn mini" onClick={addRow}>+ Plage</button>
      </div>

      <div className="availability-list">
        {value.map((row, index) => (
          <div className="availability-row" key={row.uid || `availability-${index}`}>
            <select value={row.day} onChange={(e) => updateRow(index, { day: Number(e.target.value) })}>
              {DAYS.map((day, i) => <option key={day} value={i}>{DAY_SHORT[i]}</option>)}
            </select>
            <input type="time" step={900} value={row.open} onChange={(e) => updateRow(index, { open: e.target.value })} />
            <span>→</span>
            <input type="time" step={900} value={row.close} onChange={(e) => updateRow(index, { close: e.target.value })} />
            <button type="button" className="remove-row" onClick={() => removeRow(index)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotModal({
  title,
  form,
  gyms,
  coachOptions,
  saving,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  title: string;
  form: SlotForm;
  gyms: Gymnase[];
  coachOptions: string[];
  saving: boolean;
  onChange: (form: SlotForm) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const set = (patch: Partial<SlotForm>) => onChange({ ...form, ...patch });

  return (
    <div className="modal-layer" onClick={onCancel}>
      <div className="slot-modal" onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>

        <div className="modal-grid">
          <label className="field">
            Jour
            <select value={form.day} onChange={(e) => set({ day: Number(e.target.value) })}>
              {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>

          <label className="field">
            Salle
            <select value={form.gymnaseId} onChange={(e) => set({ gymnaseId: e.target.value })}>
              {gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
            </select>
          </label>

          <label className="field full">
            Catégorie
            <input
              list="planner-categories"
              value={form.category}
              placeholder="U15, Seniors, Basket École..."
              onChange={(e) => set({ category: e.target.value })}
            />
            <datalist id="planner-categories">
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>

          <label className="field">
            Sexe
            <select value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
              {GENDERS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
            </select>
          </label>

          <label className="field">
            Équipe
            <input
              list="planner-teams"
              value={form.team}
              placeholder="Équipe 1, Loisirs, 3x3..."
              onChange={(e) => set({ team: e.target.value })}
            />
            <datalist id="planner-teams">
              {TEAM_OPTIONS.map((team) => (
                <option key={team} value={team} />
              ))}
            </datalist>
          </label>

          <label className="field">
            Type de créneau
            <select value={form.slotType} onChange={(e) => set({ slotType: e.target.value })}>
              {SLOT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>

          <label className="field">
            Entraîneur
            <select value={form.coachName} onChange={(e) => set({ coachName: e.target.value })}>
              <option value="">Non affecté</option>
              {(coachOptions.length ? coachOptions : COACH_OPTIONS).map((coach) => (
                <option key={coach} value={coach}>{coach}</option>
              ))}
            </select>
          </label>

          <label className="field full">
            Notes
            <textarea
              value={form.notes}
              placeholder="Infos utiles : terrain 1, matériel, opposition, consignes..."
              onChange={(e) => set({ notes: e.target.value })}
            />
          </label>

          <label className="field full">
            Journée entière
            <button
              type="button"
              className={`toggle-line ${form.allDay ? "active" : ""}`}
              onClick={() => set({ allDay: !form.allDay })}
            >
              <span>{form.allDay ? "ON" : "OFF"}</span>
              {form.allDay
                ? "Créneau sur toute la plage disponible du gymnase"
                : "Créneau avec horaires précis"}
            </button>
          </label>

          {!form.allDay && (
            <>
              <label className="field">
                Début
                <select
                  value={form.start}
                  onChange={(e) => {
                    const start = e.target.value;
                    const startMin = fromTime(start);
                    const endMin = fromTime(form.end);

                    set({
                      start,
                      end: endMin <= startMin ? toTime(startMin + SLOT_MIN) : form.end,
                    });
                  }}
                >
                  {TIME_OPTIONS.slice(0, -1).map((min) => (
                    <option key={`start-${min}`} value={toTime(min)}>
                      {toTime(min)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Fin
                <select
                  value={form.end}
                  onChange={(e) => {
                    const end = e.target.value;
                    const startMin = fromTime(form.start);
                    const endMin = fromTime(end);

                    set({
                      end: endMin <= startMin ? toTime(startMin + SLOT_MIN) : end,
                    });
                  }}
                >
                  {TIME_OPTIONS.filter((min) => min >= fromTime(form.start) + SLOT_MIN).map((min) => (
                    <option key={`end-${min}`} value={toTime(min)}>
                      {toTime(min)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="field full">
            Couleur
            <div className="color-picker">
              {PALETTE.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`color-dot ${form.color === color.value ? "active" : ""}`}
                  style={{ background: color.value }}
                  onClick={() => set({ color: color.value })}
                  title={color.name}
                />
              ))}
            </div>
          </label>
        </div>

        <div className="modal-actions">
          {onDelete && <button type="button" className="planner-btn danger" onClick={onDelete}>Supprimer</button>}
          <span className="modal-spacer" />
          <button type="button" className="planner-btn ghost" onClick={onCancel}>Annuler</button>
          <button type="button" className="planner-btn primary" disabled={saving || !form.gymnaseId} onClick={onSave}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlannerStyles() {
  return (
    <style jsx global>{`
      .club-planner {
        --bordeaux: #6b1a2c;
        --or: #d4a24c;
        --paper: #fffdf9;
        --line: #e8ded4;
        --grid: #e6eaf0;
        --text: #111827;
        --muted: #6b7280;
        position: relative;
        width: 100%;
        min-height: 82vh;
        background: #fff;
        border: 1px solid rgba(107, 26, 44, 0.12);
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.06);
        font-family: Roboto, system-ui, sans-serif;
        color: var(--text);
      }

      .club-planner * { box-sizing: border-box; }

      .planner-top {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
        padding: 20px 22px;
        background: linear-gradient(135deg, #fff, #fff8ee);
        border-bottom: 1px solid var(--line);
      }
.color-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fffdf9;
}

.color-dot {
  width: 34px;
  height: 34px;
  border: 2px solid white;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 0 0 1px rgba(17, 24, 39, 0.12);
  transition: 0.16s ease;
}

.color-dot:hover {
  transform: scale(1.08);
}

.color-dot.active {
  outline: 3px solid var(--bordeaux);
  outline-offset: 3px;
}

      .planner-kicker {
        margin: 0 0 5px;
        color: var(--or);
        font-size: 0.74rem;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .planner-top h3 {
        margin: 0;
        color: var(--bordeaux);
        font-family: "Alfa Slab One", serif;
        font-size: clamp(1.35rem, 2vw, 2rem);
        font-weight: 400;
      }

      .planner-top p:last-child {
        margin: 7px 0 0;
        color: var(--muted);
        font-size: 0.92rem;
        line-height: 1.45;
      }

      .planner-actions, .modal-actions, .rooms-strip, .excel-toolbar, .room-chip, .rooms-head, .toolbar-card {
        display: flex;
        align-items: center;
      }

      .planner-actions {
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 9px;
      }

      .planner-btn {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 10px 15px;
        font-family: inherit;
        font-size: 0.86rem;
        font-weight: 900;
        cursor: pointer;
        background: #fff;
        color: var(--text);
        transition: 0.16s ease;
      }

      .planner-btn.mini { padding: 7px 10px; font-size: .75rem; }
      .planner-btn:hover:not(:disabled) { transform: translateY(-1px); border-color: var(--or); box-shadow: 0 10px 22px rgba(107, 26, 44, 0.1); }
      .planner-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .planner-btn.primary { background: var(--bordeaux); border-color: var(--bordeaux); color: white; }
      .planner-btn.ghost { background: #fffaf2; color: var(--bordeaux); }
      .planner-btn.danger { background: #fff0f0; border-color: #f3c5c5; color: #b92525; }

      .planner-alert {
        margin: 14px 18px 0;
        padding: 12px 14px;
        border-radius: 14px;
        background: #fff0f0;
        color: #b92525;
        font-weight: 800;
        font-size: 0.9rem;
      }

      .excel-toolbar {
        gap: 10px;
        padding: 12px 18px;
        border-bottom: 1px solid var(--line);
        background: #fcfcfd;
        flex-wrap: wrap;
      }

      .toolbar-card {
        align-items: baseline;
        gap: 7px;
        border: 1px solid var(--grid);
        background: white;
        border-radius: 12px;
        padding: 8px 12px;
      }

      .toolbar-card strong { color: var(--bordeaux); font-size: 1.1rem; }
      .toolbar-card span, .toolbar-help { color: var(--muted); font-size: 0.82rem; font-weight: 800; }
      .toolbar-help { margin-left: auto; }

      kbd {
        border: 1px solid var(--grid);
        border-bottom-width: 2px;
        border-radius: 7px;
        background: white;
        padding: 2px 6px;
        color: var(--text);
        font-size: 0.75rem;
      }

      .rooms-strip {
        gap: 12px;
        padding: 12px 18px;
        background: var(--paper);
        border-bottom: 1px solid var(--line);
        flex-wrap: wrap;
      }

      .rooms-head {
        gap: 8px;
        color: var(--muted);
        font-size: 0.76rem;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .rooms-head strong {
        min-width: 24px;
        height: 24px;
        border-radius: 999px;
        background: var(--bordeaux);
        color: white;
        display: inline-grid;
        place-items: center;
        font-size: 0.74rem;
      }

      .rooms-loading { color: var(--muted); font-size: 0.86rem; font-weight: 800; }

      .empty-room {
        border: 1px dashed rgba(107, 26, 44, 0.35);
        background: #fff;
        color: var(--bordeaux);
        border-radius: 16px;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        font-family: inherit;
      }

      .room-chips { display: flex; flex-wrap: wrap; gap: 8px; }

      .room-chip {
        gap: 6px;
        border: 1px solid var(--line);
        background: #fff;
        border-radius: 999px;
        padding: 5px 6px 5px 12px;
        color: var(--bordeaux);
        font-weight: 900;
      }

      .room-name {
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: text;
        padding: 0;
      }

      .room-edit {
        border: 0;
        border-radius: 999px;
        padding: 5px 9px;
        background: #fff4df;
        color: var(--bordeaux);
        font-weight: 900;
        cursor: pointer;
      }

      .room-delete {
        border: 0;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: transparent;
        color: #c9b8b8;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }

      .room-delete:hover { background: #e23; color: white; }

      .calendar-shell { position: relative; min-height: 68vh; }

      .planner-loading, .planner-zero {
        min-height: 62vh;
        display: grid;
        place-items: center;
        text-align: center;
        padding: 40px;
        color: var(--muted);
      }

      .planner-zero { align-content: center; gap: 10px; }
      .planner-zero span { font-size: 3rem; }
      .planner-zero strong { color: var(--bordeaux); font-size: 1.25rem; }

      .calendar-scroll { overflow: auto; max-height: 78vh; }
      .calendar-grid { display: flex; min-width: max-content; position: relative; background: #fff; }

      .hours-rail {
        position: sticky;
        left: 0;
        z-index: 8;
        flex: none;
        background: #fff;
        border-right: 1px solid var(--grid);
      }

      .hours-head {
        position: sticky;
        top: 0;
        z-index: 9;
        background: #f8fafc;
        border-bottom: 1px solid var(--grid);
        display: grid;
        place-items: center;
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 900;
      }

      .hours-body { position: relative; }

      .hour-mark {
        position: absolute;
        left: 0;
        right: 0;
        transform: translateY(-50%);
        padding-right: 9px;
        text-align: right;
        color: var(--muted);
        font-size: 0.72rem;
        font-weight: 800;
        background: #fff;
      }

      .days-grid { display: flex; position: relative; }

      .now-line {
        position: absolute;
        left: 0;
        right: 0;
        height: 0;
        border-top: 2px solid #e72d42;
        z-index: 8;
        pointer-events: none;
      }

      .now-line span {
        position: absolute;
        left: -5px;
        top: -5px;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #e72d42;
      }

      .day-block { flex: none; border-right: 1px solid var(--grid); }
      .day-block.is-today { background: #fffaf1; }

      .day-head {
        position: sticky;
        top: 0;
        z-index: 7;
        background: #f8fafc;
        border-bottom: 1px solid var(--grid);
      }

      .day-block.is-today .day-head { background: #fff4df; }

      .day-title {
        height: 36px;
        display: grid;
        place-items: center;
        color: var(--bordeaux);
        font-size: 0.88rem;
      }

      .day-title span {
        display: block;
        color: var(--or);
        font-size: 0.66rem;
        font-weight: 900;
        min-height: 12px;
      }

      .gym-head-row { height: 46px; display: flex; }

      .gym-head {
        flex: none;
        display: grid;
        place-items: center;
        padding: 0 8px;
        border-left: 1px solid var(--grid);
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 900;
        text-align: center;
        background: rgba(255, 255, 255, 0.42);
      }

      .day-columns { display: flex; position: relative; }

      .calendar-col {
        position: relative;
        flex: none;
        border-left: 1px solid var(--grid);
        background: repeating-linear-gradient(
          to bottom,
          rgba(17, 24, 39, 0.055),
          rgba(17, 24, 39, 0.055) 1px,
          #f4f5f7 1px,
          #f4f5f7 31.5px
        );
      }

      .calendar-col:hover { background-color: rgba(212, 162, 76, 0.08); }

      .availability-band {
        position: absolute;
        left: 0;
        right: 0;
        background: #fff;
        border-top: 1px solid rgba(22, 163, 74, .18);
        border-bottom: 1px solid rgba(22, 163, 74, .18);
        pointer-events: none;
      }

      .availability-band span {
        position: sticky;
        top: 0;
        left: 4px;
        display: inline-block;
        margin: 4px;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(22, 163, 74, .09);
        color: #14803b;
        font-size: .62rem;
        font-weight: 900;
      }

      .hour-line {
        position: absolute;
        left: 0;
        right: 0;
        border-top: 1px solid rgba(230, 234, 240, 0.95);
        pointer-events: none;
      }

      .selected-cell {
        position: absolute;
        left: 6px;
        right: 6px;
        border: 2px solid #16a34a;
        background: rgba(22, 163, 74, 0.06);
        display: grid;
        place-items: center;
        color: #16a34a;
        font-size: 1.2rem;
        font-weight: 900;
        z-index: 2;
        pointer-events: none;
      }

      .slot-card {
        position: absolute;
        left: 7px;
        right: 7px;
        border-radius: 9px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-left: 5px solid var(--bordeaux);
        padding: 10px 12px 16px;
        overflow: visible;
        min-height: 54px;
        cursor: grab;
        touch-action: none;
        user-select: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        transition: box-shadow 0.15s ease, transform 0.15s ease;
        z-index: 3;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-start;
        text-align: left;
      }

      .slot-card:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.13);
      }

      .slot-card.is-selected {
        outline: 2px solid var(--or);
        outline-offset: 1px;
      }

      .slot-card.is-dragging {
        z-index: 10;
        opacity: 0.95;
        cursor: grabbing;
        box-shadow: 0 16px 32px rgba(0, 0, 0, 0.24);
      }

      .slot-card strong, .slot-card span, .slot-card small {
        line-height: 1.35;
        display: block;
        width: 100%;
        min-width: 0;
        overflow-wrap: anywhere;
        white-space: normal;
      }
      .slot-card strong {
        line-height: 1.2;
        width: 100%;
        font-size: 0.82rem;
        line-height: 1.15;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
      }
      .slot-meta { margin-top: 4px; color: var(--muted); font-size: 0.7rem; font-weight: 900; text-align: left; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
      .slot-coach { margin-top: 3px; color: var(--muted); font-size: 0.68rem; font-weight: 800; text-align: left; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
      .slot-card span {
        line-height: 1.25;
        margin-top: 4px;
        font-size: 0.72rem;
        color: var(--text);
        font-weight: 900;
        white-space: nowrap;
      }
      .slot-card small {
        line-height: 1.25;
        margin-top: 3px;
        font-size: 0.68rem;
        color: var(--muted);
        font-weight: 800;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .resize-handle {
        position: absolute;
        left: 30%;
        right: 30%;
        bottom: 3px;
        height: 8px;
        border-radius: 999px;
        background: rgba(17, 24, 39, .22);
        cursor: ns-resize;
      }

      .resize-handle:hover {
        background: rgba(17, 24, 39, .42);
      }

      .modal-layer {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(15, 15, 18, 0.45);
      }

      .room-modal, .slot-modal {
        width: min(680px, 100%);
        max-height: 92vh;
        overflow: auto;
        background: white;
        border-radius: 24px;
        padding: 24px;
        border: 1px solid rgba(255, 255, 255, 0.6);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.35);
      }

      .slot-modal { width: min(620px, 100%); }

      .modal-title-row {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        margin-bottom: 18px;
      }

      .modal-title-row > span {
        width: 46px;
        height: 46px;
        border-radius: 16px;
        display: grid;
        place-items: center;
        background: #fff4df;
        font-size: 1.6rem;
      }

      .room-modal h4, .slot-modal h4 {
        margin: 0 0 18px;
        color: var(--bordeaux);
        font-family: "Alfa Slab One", serif;
        font-weight: 400;
        font-size: 1.3rem;
      }

      .modal-title-row h4 { margin-bottom: 0; }
      .modal-title-row p { margin: 4px 0 0; color: var(--muted); line-height: 1.45; font-size: 0.9rem; }

      .modal-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 7px;
        color: var(--muted);
        font-size: 0.8rem;
        font-weight: 900;
      }

      .field.full { grid-column: 1 / -1; }

      .toggle-line {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px 14px;
        background: #fffdf9;
        color: var(--muted);
        font-family: inherit;
        font-size: .9rem;
        font-weight: 900;
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .toggle-line span {
        display: inline-grid;
        place-items: center;
        min-width: 44px;
        height: 24px;
        border-radius: 999px;
        background: #e5e7eb;
        color: #374151;
        font-size: .72rem;
        font-weight: 900;
      }

      .toggle-line.active {
        border-color: rgba(107, 26, 44, .35);
        background: #fff4df;
        color: var(--bordeaux);
      }

      .toggle-line.active span {
        background: var(--bordeaux);
        color: white;
      }

      .field input, .field select, .field textarea, .availability-row input, .availability-row select {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px 13px;
        font-family: inherit;
        font-size: 0.95rem;
        color: var(--text);
        background: #fff;
      }

      .field input:focus, .field select:focus, .field textarea:focus, .availability-row input:focus, .availability-row select:focus {
        outline: none;
        border-color: var(--or);
        box-shadow: 0 0 0 3px rgba(212, 162, 76, 0.22);
      }

      .modal-actions {
        gap: 10px;
        margin-top: 20px;
      }

      .modal-spacer { flex: 1; }

      .availability-editor {
        margin-top: 16px;
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 14px;
        background: #fffdf9;
      }

      .availability-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .availability-head strong { color: var(--bordeaux); }
      .availability-list { display: grid; gap: 8px; }

      .availability-row {
        display: grid;
        grid-template-columns: 110px 1fr 24px 1fr 34px;
        gap: 8px;
        align-items: center;
      }

      .availability-row span {
        text-align: center;
        color: var(--muted);
        font-weight: 900;
      }

      .remove-row {
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 999px;
        background: #fff0f0;
        color: #b92525;
        font-weight: 900;
        cursor: pointer;
      }

      @media (max-width: 900px) {
        .planner-top { flex-direction: column; }
        .planner-actions { justify-content: flex-start; }
        .toolbar-help { width: 100%; margin-left: 0; }
      }

      @media (max-width: 560px) {
        .modal-grid { grid-template-columns: 1fr; }
        .availability-row { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
