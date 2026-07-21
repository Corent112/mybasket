// lib/club-drive.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubDocument, ClubTeam, ClubPlayer, ClubCoach } from "@/lib/club-core";
import {
  listClubDocuments,
  listClubTeams,
  listClubPlayers,
  listClubCoaches,
  uploadClubDocument,
} from "@/lib/club-core";

export type ClubDocumentFolder = {
  id: string;
  clubId: string;
  parentId: string | null;
  name: string;
  section: string;
  teamId: string | null;
  playerId: string | null;
  coachId: string | null;
  visibility: string;
  createdAt: string | null;
};

export type DriveDocument = ClubDocument & {
  folderId?: string | null;
  coachId?: string | null;
  visibility?: string | null;
  version?: number | null;
  description?: string | null;
};

function sb() {
  return createClient();
}

function fail(error: any) {
  console.error("CLUB_DRIVE_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function rowToFolder(row: any): ClubDocumentFolder {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    parentId: row.parent_id ?? null,
    name: row.name ?? "",
    section: row.section ?? "Club",
    teamId: row.team_id ?? null,
    playerId: row.player_id ?? null,
    coachId: row.coach_id ?? null,
    visibility: row.visibility ?? "staff",
    createdAt: row.created_at ?? null,
  };
}

function docPlus(doc: ClubDocument, raw?: any): DriveDocument {
  return {
    ...doc,
    folderId: raw?.folder_id ?? null,
    coachId: raw?.coach_id ?? null,
    visibility: raw?.visibility ?? "staff",
    version: raw?.version ?? 1,
    description: raw?.description ?? "",
  };
}

export async function listDriveFolders(clubId: string): Promise<ClubDocumentFolder[]> {
  const { data, error } = await sb()
    .from("club_document_folders")
    .select("*")
    .eq("club_id", clubId)
    .order("section", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw fail(error);
  return (data ?? []).map(rowToFolder);
}

export async function createDriveFolder(input: {
  clubId: string;
  name: string;
  section?: string;
  parentId?: string | null;
  teamId?: string | null;
  playerId?: string | null;
  coachId?: string | null;
  visibility?: string;
}): Promise<ClubDocumentFolder> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_document_folders")
    .insert({
      club_id: input.clubId,
      name: input.name,
      section: input.section || "Club",
      parent_id: input.parentId || null,
      team_id: input.teamId || null,
      player_id: input.playerId || null,
      coach_id: input.coachId || null,
      visibility: input.visibility || "staff",
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToFolder(data);
}

export async function updateDriveFolder(
  folderId: string,
  patch: Partial<Pick<ClubDocumentFolder, "name" | "section" | "visibility">>
): Promise<ClubDocumentFolder> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.section !== undefined) payload.section = patch.section;
  if (patch.visibility !== undefined) payload.visibility = patch.visibility;

  const { data, error } = await sb()
    .from("club_document_folders")
    .update(payload)
    .eq("id", folderId)
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToFolder(data);
}

export async function moveDocumentToFolder(input: {
  documentId: string;
  folderId: string | null;
}): Promise<void> {
  const { error } = await sb()
    .from("club_documents")
    .update({ folder_id: input.folderId })
    .eq("id", input.documentId);

  if (error) throw fail(error);
}

export async function renameDocument(input: {
  documentId: string;
  title: string;
  description?: string;
}): Promise<void> {
  const payload: Record<string, unknown> = { title: input.title, name: input.title };
  if (input.description !== undefined) payload.description = input.description;

  const { error } = await sb()
    .from("club_documents")
    .update(payload)
    .eq("id", input.documentId);

  if (error) throw fail(error);
}

export async function uploadDriveDocument(input: {
  clubId: string;
  file: File;
  title?: string;
  folderId?: string | null;
  section?: string;
  category?: string;
  teamId?: string | null;
  playerId?: string | null;
  coachId?: string | null;
  visibility?: string;
}): Promise<DriveDocument> {
  const doc = await uploadClubDocument({
    clubId: input.clubId,
    file: input.file,
    title: input.title || input.file.name,
    category: input.category || "Document",
    teamId: input.teamId || null,
    playerId: input.playerId || null,
    section: input.section || "Club",
  });

  const payload: Record<string, unknown> = {
    folder_id: input.folderId || null,
    visibility: input.visibility || "staff",
  };
  if (input.coachId) payload.coach_id = input.coachId;

  const { data, error } = await sb()
    .from("club_documents")
    .update(payload)
    .eq("id", doc.id)
    .select("*")
    .single();

  if (error) throw fail(error);

  return docPlus(doc, data);
}

export async function getDriveWorkspace(clubId: string): Promise<{
  folders: ClubDocumentFolder[];
  documents: DriveDocument[];
  teams: ClubTeam[];
  players: ClubPlayer[];
  coaches: ClubCoach[];
}> {
  const supabase = sb();

  const [folders, teams, players, coaches] = await Promise.all([
    listDriveFolders(clubId),
    listClubTeams(clubId),
    listClubPlayers(clubId),
    listClubCoaches(clubId),
  ]);

  const { data, error } = await supabase
    .from("club_documents")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) throw fail(error);

  const basicDocs = await listClubDocuments(clubId);
  const documents = basicDocs.map((doc) => {
    const raw = (data ?? []).find((row: any) => String(row.id) === doc.id);
    return docPlus(doc, raw);
  });

  return { folders, documents, teams, players, coaches };
}
