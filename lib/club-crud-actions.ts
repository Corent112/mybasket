// lib/club-crud-actions.ts
"use client";

import { createClient } from "@/lib/supabase/client";

type TableName =
  | "club_teams"
  | "club_players"
  | "club_coaches"
  | "club_documents"
  | "club_document_folders"
  | "club_communication_groups"
  | "club_communication_campaigns"
  | "club_communication_recipients"
  | "club_player_cotisations"
  | "club_cotisation_reminders"
  | "club_finance_entries"
  | "club_sponsors"
  | "club_tasks"
  | "club_notifications"
  | "club_audit_logs"
  | "club_events"
  | "club_training_slots"
  | "club_gymnases"
  | "club_gym_availabilities";

export type CrudResult = {
  ok: boolean;
  message?: string;
};

function sb() {
  return createClient();
}

function fail(context: string, error: any): never {
  console.error(context, error);
  throw new Error(error?.message || error?.details || error?.hint || error?.code || context);
}

async function deleteRows(table: TableName, filters: Record<string, string | number | boolean | null>) {
  let query = sb().from(table).delete();

  Object.entries(filters).forEach(([key, value]) => {
    query = value === null ? query.is(key, null) : query.eq(key, value);
  });

  const { error } = await query;
  if (error) fail(`DELETE_${table.toUpperCase()}_ERROR`, error);
}

async function updateRows(
  table: TableName,
  patch: Record<string, unknown>,
  filters: Record<string, string | number | boolean | null>
) {
  let query = sb().from(table).update(patch);

  Object.entries(filters).forEach(([key, value]) => {
    query = value === null ? query.is(key, null) : query.eq(key, value);
  });

  const { error } = await query;
  if (error) fail(`UPDATE_${table.toUpperCase()}_ERROR`, error);
}

async function deleteOne(table: TableName, id: string, clubId?: string) {
  let query = sb().from(table).delete().eq("id", id);

  if (clubId) query = query.eq("club_id", clubId);

  const { error } = await query;
  if (error) fail(`DELETE_${table.toUpperCase()}_ERROR`, error);
}

export async function deleteClubTeam(params: {
  clubId: string;
  teamId: string;
  hardDeletePlayers?: boolean;
}) {
  const { clubId, teamId, hardDeletePlayers } = params;

  if (hardDeletePlayers) {
    await deleteRows("club_players", { club_id: clubId, team_id: teamId });
  } else {
    await updateRows("club_players", { team_id: null }, { club_id: clubId, team_id: teamId });
  }

  await updateRows("club_coaches", { team_ids: [] }, { club_id: clubId });
  await updateRows("club_documents", { team_id: null }, { club_id: clubId, team_id: teamId });
  await updateRows("club_events", { team_id: null }, { club_id: clubId, team_id: teamId });
  await updateRows("club_training_slots", { team_id: null }, { club_id: clubId, team_id: teamId });
  await deleteOne("club_teams", teamId, clubId);

  return { ok: true, message: "Équipe supprimée." };
}

export async function deleteClubPlayer(params: {
  clubId: string;
  playerId: string;
}) {
  const { clubId, playerId } = params;

  await deleteRows("club_cotisation_reminders", { club_id: clubId, player_id: playerId });
  await deleteRows("club_player_cotisations", { club_id: clubId, player_id: playerId });
  await updateRows("club_documents", { player_id: null }, { club_id: clubId, player_id: playerId });
  await deleteOne("club_players", playerId, clubId);

  return { ok: true, message: "Joueur supprimé." };
}

export async function deleteClubCoach(params: {
  clubId: string;
  coachId: string;
}) {
  const { clubId, coachId } = params;

  await updateRows("club_events", { coach_id: null }, { club_id: clubId, coach_id: coachId });
  await updateRows("club_training_slots", { coach_id: null }, { club_id: clubId, coach_id: coachId });
  await updateRows("club_documents", { coach_id: null }, { club_id: clubId, coach_id: coachId });
  await deleteOne("club_coaches", coachId, clubId);

  return { ok: true, message: "Coach supprimé." };
}

export async function deactivateClubCoach(params: {
  clubId: string;
  coachId: string;
}) {
  await updateRows("club_coaches", { status: "disabled" }, { club_id: params.clubId, id: params.coachId });
  return { ok: true, message: "Coach désactivé." };
}

export async function deleteClubDocument(params: {
  clubId: string;
  documentId: string;
}) {
  const supabase = sb();

  const { data: doc, error: readError } = await supabase
    .from("club_documents")
    .select("id, club_id, storage_path")
    .eq("id", params.documentId)
    .eq("club_id", params.clubId)
    .maybeSingle();

  if (readError) fail("READ_DOCUMENT_BEFORE_DELETE_ERROR", readError);

  if (doc?.storage_path) {
    await supabase.storage.from("club-documents").remove([doc.storage_path]).catch(() => null);
  }

  await deleteOne("club_documents", params.documentId, params.clubId);
  return { ok: true, message: "Document supprimé." };
}

export async function deleteClubFolder(params: {
  clubId: string;
  folderId: string;
}) {
  await updateRows("club_documents", { folder_id: null }, { club_id: params.clubId, folder_id: params.folderId });
  await deleteOne("club_document_folders", params.folderId, params.clubId);
  return { ok: true, message: "Dossier supprimé." };
}

export async function deleteCommunicationGroup(params: {
  clubId: string;
  groupId: string;
}) {
  await updateRows("club_communication_campaigns", { group_id: null }, { club_id: params.clubId, group_id: params.groupId });
  await deleteOne("club_communication_groups", params.groupId, params.clubId);
  return { ok: true, message: "Groupe supprimé." };
}

export async function deleteCommunicationCampaign(params: {
  clubId: string;
  campaignId: string;
}) {
  await deleteRows("club_communication_recipients", { club_id: params.clubId, campaign_id: params.campaignId });
  await deleteOne("club_communication_campaigns", params.campaignId, params.clubId);
  return { ok: true, message: "Campagne supprimée." };
}

export async function deleteCotisation(params: {
  clubId: string;
  cotisationId: string;
}) {
  await deleteRows("club_cotisation_reminders", { club_id: params.clubId, cotisation_id: params.cotisationId });
  await deleteOne("club_player_cotisations", params.cotisationId, params.clubId);
  return { ok: true, message: "Cotisation supprimée." };
}

export async function deleteCotisationReminder(params: {
  clubId: string;
  reminderId: string;
}) {
  await deleteOne("club_cotisation_reminders", params.reminderId, params.clubId);
  return { ok: true, message: "Relance supprimée." };
}

export async function deleteFinanceEntry(params: {
  clubId: string;
  entryId: string;
}) {
  await deleteOne("club_finance_entries", params.entryId, params.clubId);
  return { ok: true, message: "Écriture supprimée." };
}

export async function deleteSponsor(params: {
  clubId: string;
  sponsorId: string;
}) {
  await deleteOne("club_sponsors", params.sponsorId, params.clubId);
  return { ok: true, message: "Sponsor supprimé." };
}

export async function deleteClubTask(params: {
  clubId: string;
  taskId: string;
}) {
  await deleteOne("club_tasks", params.taskId, params.clubId);
  return { ok: true, message: "Tâche supprimée." };
}

export async function deleteClubNotification(params: {
  clubId: string;
  notificationId: string;
}) {
  await deleteOne("club_notifications", params.notificationId, params.clubId);
  return { ok: true, message: "Notification supprimée." };
}

export async function deleteClubEvent(params: {
  clubId: string;
  eventId: string;
}) {
  await deleteOne("club_events", params.eventId, params.clubId);
  return { ok: true, message: "Événement supprimé." };
}

export async function deleteClubTrainingSlot(params: {
  clubId: string;
  slotId: string;
}) {
  await deleteOne("club_training_slots", params.slotId, params.clubId);
  return { ok: true, message: "Créneau supprimé." };
}

export async function deleteClubGymnase(params: {
  clubId: string;
  gymnaseId: string;
}) {
  await deleteRows("club_training_slots", { club_id: params.clubId, gymnase_id: params.gymnaseId });
  await deleteRows("club_gym_availabilities", { club_id: params.clubId, gymnase_id: params.gymnaseId });
  await deleteOne("club_gymnases", params.gymnaseId, params.clubId);
  return { ok: true, message: "Salle supprimée." };
}

export async function deleteEntity(params: {
  clubId: string;
  entityType:
    | "team"
    | "player"
    | "coach"
    | "document"
    | "folder"
    | "communication_group"
    | "communication_campaign"
    | "cotisation"
    | "cotisation_reminder"
    | "finance_entry"
    | "sponsor"
    | "task"
    | "notification"
    | "event"
    | "training_slot"
    | "gymnase";
  id: string;
}) {
  switch (params.entityType) {
    case "team":
      return deleteClubTeam({ clubId: params.clubId, teamId: params.id });
    case "player":
      return deleteClubPlayer({ clubId: params.clubId, playerId: params.id });
    case "coach":
      return deleteClubCoach({ clubId: params.clubId, coachId: params.id });
    case "document":
      return deleteClubDocument({ clubId: params.clubId, documentId: params.id });
    case "folder":
      return deleteClubFolder({ clubId: params.clubId, folderId: params.id });
    case "communication_group":
      return deleteCommunicationGroup({ clubId: params.clubId, groupId: params.id });
    case "communication_campaign":
      return deleteCommunicationCampaign({ clubId: params.clubId, campaignId: params.id });
    case "cotisation":
      return deleteCotisation({ clubId: params.clubId, cotisationId: params.id });
    case "cotisation_reminder":
      return deleteCotisationReminder({ clubId: params.clubId, reminderId: params.id });
    case "finance_entry":
      return deleteFinanceEntry({ clubId: params.clubId, entryId: params.id });
    case "sponsor":
      return deleteSponsor({ clubId: params.clubId, sponsorId: params.id });
    case "task":
      return deleteClubTask({ clubId: params.clubId, taskId: params.id });
    case "notification":
      return deleteClubNotification({ clubId: params.clubId, notificationId: params.id });
    case "event":
      return deleteClubEvent({ clubId: params.clubId, eventId: params.id });
    case "training_slot":
      return deleteClubTrainingSlot({ clubId: params.clubId, slotId: params.id });
    case "gymnase":
      return deleteClubGymnase({ clubId: params.clubId, gymnaseId: params.id });
    default:
      throw new Error("Type d'entité inconnu.");
  }
}
