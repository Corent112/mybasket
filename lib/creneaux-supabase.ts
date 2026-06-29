// lib/creneaux-supabase.ts
import { createClient } from "@/lib/supabase/client";

export type Gymnase = {
  id: string;
  clubId: string;
  name: string;
  position: number;
};

export type GymAvailability = {
  id: string;
  clubId: string;
  gymnaseId: string;
  day: number;
  openMin: number;
  closeMin: number;
};

export type Slot = {
  id: string;
  clubId: string;
  gymnaseId: string;
  day: number;
  category: string;
  gender: string;
  team: string;
  startMin: number;
  durationMin: number;
  color?: string | null;
  slotType?: string | null;
  coachName?: string | null;
  notes?: string | null;
};

export type NewSlot = Omit<Slot, "id" | "clubId">;

function sb() {
  return createClient();
}

const WRITE_ROLE_ORDER = ["owner", "admin", "direction_technique", "secretariat", "coach"];
const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const SLOT_SELECT = "id, club_id, gymnase_id, day, category, gender, team, start_min, duration_min, color, slot_type, coach_name, notes";

function toSqlTime(min: number) {
  const safe = Number.isFinite(min) ? Math.max(0, Math.min(24 * 60 - 1, Math.round(min))) : 0;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function throwError(context: string, error: any): never {
  console.error(context);
  console.error("FULL ERROR =", error);
  console.error("JSON =", JSON.stringify(error, null, 2));
  throw new Error(error?.message || error?.details || error?.hint || error?.code || context);
}

function rowToGym(row: any): Gymnase {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    name: row.name ?? "",
    position: Number(row.position ?? row.gym_position) || 0,
  };
}

function rowToAvailability(row: any): GymAvailability {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    gymnaseId: String(row.gymnase_id),
    day: Number(row.day) || 0,
    openMin: Number(row.open_min) || 0,
    closeMin: Number(row.close_min) || 0,
  };
}

function rowToSlot(row: any): Slot {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    gymnaseId: String(row.gymnase_id),
    day: Number(row.day) || 0,
    category: row.category ?? "",
    gender: row.gender ?? "Mixte",
    team: row.team ?? "",
    startMin: Number(row.start_min) || 0,
    durationMin: Number(row.duration_min) || 90,
    color: row.color ?? null,
    slotType: row.slot_type ?? null,
    coachName: row.coach_name ?? null,
    notes: row.notes ?? null,
  };
}

export async function getCurrentClubId(): Promise<string | null> {
  const supabase = sb();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase
    .from("club_members")
    .select("club_id, role")
    .eq("user_id", userData.user.id)
    .eq("status", "active");

  if (error || !data?.length) return null;

  const ranked = [...data].sort((a: any, b: any) => {
    const ra = WRITE_ROLE_ORDER.indexOf(a.role);
    const rb = WRITE_ROLE_ORDER.indexOf(b.role);
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
  });

  return String(ranked[0].club_id);
}

export async function loadGymnases(clubId: string): Promise<Gymnase[]> {
  const supabase = sb();

  const { data, error } = await supabase
    .from("club_gymnases")
    .select("id, club_id, name, position")
    .eq("club_id", clubId)
    .order("position", { ascending: true });

  if (error) throwError("LOAD_GYMNASES_ERROR", error);
  return (data ?? []).map(rowToGym);
}

export async function addGymnase(clubId: string, name: string, position: number): Promise<Gymnase> {
  const supabase = sb();

  const { data, error } = await supabase.rpc("create_club_gymnase", {
    p_club_id: clubId,
    p_name: name.trim(),
    p_position: position,
  });

  if (error) throwError("CREATE_GYMNASE_RPC_ERROR", error);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("La salle n’a pas été créée.");

  return rowToGym(row);
}

export async function renameGymnase(id: string, name: string): Promise<void> {
  const supabase = sb();
  const { error } = await supabase.from("club_gymnases").update({ name: name.trim() }).eq("id", id);
  if (error) throwError("RENAME_GYMNASE_ERROR", error);
}

export async function deleteGymnase(id: string): Promise<void> {
  const supabase = sb();

  const { error: slotsError } = await supabase
    .from("club_training_slots")
    .delete()
    .eq("gymnase_id", id);

  if (slotsError) throwError("DELETE_GYMNASE_SLOTS_ERROR", slotsError);

  const { error: availabilityError } = await supabase
    .from("club_gym_availabilities")
    .delete()
    .eq("gymnase_id", id);

  if (availabilityError) throwError("DELETE_GYMNASE_AVAILABILITIES_ERROR", availabilityError);

  const { error } = await supabase.from("club_gymnases").delete().eq("id", id);
  if (error) throwError("DELETE_GYMNASE_ERROR", error);
}

export async function loadGymnaseAvailabilities(clubId: string): Promise<GymAvailability[]> {
  const supabase = sb();

  const { data, error } = await supabase
    .from("club_gym_availabilities")
    .select("id, club_id, gymnase_id, day, open_min, close_min")
    .eq("club_id", clubId)
    .order("day", { ascending: true })
    .order("open_min", { ascending: true });

  if (error) throwError("LOAD_GYM_AVAILABILITIES_ERROR", error);
  return (data ?? []).map(rowToAvailability);
}

export async function replaceGymnaseAvailabilities(params: {
  clubId: string;
  gymnaseId: string;
  availabilities: { day: number; openMin: number; closeMin: number }[];
}): Promise<GymAvailability[]> {
  const supabase = sb();
  const { clubId, gymnaseId, availabilities } = params;

  const cleanAvailabilities = availabilities
    .map((availability) => ({
      day: Number(availability.day),
      openMin: Number(availability.openMin),
      closeMin: Number(availability.closeMin),
    }))
    .filter((availability) => (
      Number.isFinite(availability.day) &&
      Number.isFinite(availability.openMin) &&
      Number.isFinite(availability.closeMin) &&
      availability.day >= 0 &&
      availability.day <= 6 &&
      availability.closeMin > availability.openMin
    ));

  if (!cleanAvailabilities.length) {
    throw new Error("Aucune disponibilité valide à enregistrer.");
  }

  const { error: deleteError } = await supabase
    .from("club_gym_availabilities")
    .delete()
    .eq("club_id", clubId)
    .eq("gymnase_id", gymnaseId);

  if (deleteError) throwError("DELETE_GYM_AVAILABILITIES_ERROR", deleteError);

  const rows = cleanAvailabilities.map((availability) => ({
    club_id: clubId,
    gymnase_id: gymnaseId,
    day: availability.day,
    open_min: availability.openMin,
    close_min: availability.closeMin,
  }));

  const { data, error } = await supabase
    .from("club_gym_availabilities")
    .insert(rows)
    .select("id, club_id, gymnase_id, day, open_min, close_min");

  if (error) throwError("INSERT_GYM_AVAILABILITIES_ERROR", error);
  return (data ?? []).map(rowToAvailability);
}

export async function addGymnaseWithAvailabilities(params: {
  clubId: string;
  name: string;
  position: number;
  availabilities: { day: number; openMin: number; closeMin: number }[];
}): Promise<{ gymnase: Gymnase; availabilities: GymAvailability[] }> {
  const cleanAvailabilities = params.availabilities.filter((availability) => (
    Number.isFinite(Number(availability.day)) &&
    Number.isFinite(Number(availability.openMin)) &&
    Number.isFinite(Number(availability.closeMin)) &&
    Number(availability.closeMin) > Number(availability.openMin)
  ));

  if (!cleanAvailabilities.length) {
    throw new Error("Ajoute au moins une disponibilité valide avant de créer la salle.");
  }

  const gymnase = await addGymnase(params.clubId, params.name, params.position);

  try {
    const availabilities = await replaceGymnaseAvailabilities({
      clubId: params.clubId,
      gymnaseId: gymnase.id,
      availabilities: cleanAvailabilities,
    });

    return { gymnase, availabilities };
  } catch (error) {
    await deleteGymnase(gymnase.id).catch(() => null);
    throw error;
  }
}

function slotPayload(clubId: string, input: NewSlot) {
  return {
    club_id: clubId,
    gymnase_id: input.gymnaseId,
    day: input.day,
    category: input.category,
    gender: input.gender,
    team: input.team,
    start_min: input.startMin,
    duration_min: input.durationMin,
    color: input.color ?? null,
    slot_type: input.slotType ?? "Entraînement",
    coach_name: input.coachName ?? "",
    notes: input.notes ?? "",

    // Compatibilité avec l'ancien schéma encore présent dans ta table.
    day_of_week: DAY_NAMES[input.day] ?? "Lundi",
    start_time: toSqlTime(input.startMin),
    end_time: toSqlTime(input.startMin + input.durationMin),
  };
}

export async function loadSlots(clubId: string): Promise<Slot[]> {
  const supabase = sb();

  const { data, error } = await supabase
    .from("club_training_slots")
    .select(SLOT_SELECT)
    .eq("club_id", clubId)
    .order("day", { ascending: true })
    .order("start_min", { ascending: true });

  if (error) throwError("LOAD_SLOTS_ERROR", error);
  return (data ?? []).map(rowToSlot);
}

export async function addSlot(clubId: string, input: NewSlot): Promise<Slot> {
  const supabase = sb();

  const { data, error } = await supabase
    .from("club_training_slots")
    .insert(slotPayload(clubId, input))
    .select(SLOT_SELECT)
    .single();

  if (error) throwError("ADD_SLOT_ERROR", error);
  return rowToSlot(data);
}

export async function updateSlot(id: string, patch: Partial<NewSlot>): Promise<Slot> {
  const supabase = sb();
  const payload: Record<string, unknown> = {};

  if (patch.gymnaseId !== undefined) payload.gymnase_id = patch.gymnaseId;
  if (patch.day !== undefined) {
    payload.day = patch.day;
    payload.day_of_week = DAY_NAMES[patch.day] ?? "Lundi";
  }
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.gender !== undefined) payload.gender = patch.gender;
  if (patch.team !== undefined) payload.team = patch.team;
  if (patch.startMin !== undefined) {
    payload.start_min = patch.startMin;
    payload.start_time = toSqlTime(patch.startMin);
  }
  if (patch.durationMin !== undefined) payload.duration_min = patch.durationMin;
  if (patch.color !== undefined) payload.color = patch.color;
  if (patch.slotType !== undefined) payload.slot_type = patch.slotType;
  if (patch.coachName !== undefined) payload.coach_name = patch.coachName;
  if (patch.notes !== undefined) payload.notes = patch.notes;

  if (patch.startMin !== undefined || patch.durationMin !== undefined) {
    const { data: current, error: currentError } = await supabase
      .from("club_training_slots")
      .select("start_min, duration_min")
      .eq("id", id)
      .single();

    if (currentError) throwError("UPDATE_SLOT_READ_CURRENT_ERROR", currentError);

    const start = Number(patch.startMin ?? current.start_min) || 0;
    const duration = Number(patch.durationMin ?? current.duration_min) || 90;
    payload.end_time = toSqlTime(start + duration);
  }

  const { data, error } = await supabase
    .from("club_training_slots")
    .update(payload)
    .eq("id", id)
    .select(SLOT_SELECT)
    .single();

  if (error) throwError("UPDATE_SLOT_ERROR", error);
  return rowToSlot(data);
}

export async function moveSlot(
  id: string,
  to: { day: number; gymnaseId: string; startMin: number }
): Promise<Slot> {
  return updateSlot(id, { day: to.day, gymnaseId: to.gymnaseId, startMin: to.startMin });
}

export async function deleteSlot(id: string): Promise<void> {
  const supabase = sb();
  const { error } = await supabase.from("club_training_slots").delete().eq("id", id);
  if (error) throwError("DELETE_SLOT_ERROR", error);
}

export async function countSlots(): Promise<number> {
  const supabase = sb();

  const { count, error } = await supabase
    .from("club_training_slots")
    .select("id", { count: "exact", head: true });

  if (error) return 0;
  return count ?? 0;
}
