// lib/club-settings-pro.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
  type MessageTemplate,
} from "@/lib/club-mailing-lists";

export type ClubSettingsPro = {
  id: string;
  clubId: string;
  emailFromName: string;
  emailFromAddress: string;
  replyToEmail: string;
  signatureText: string;
  signatureImageUrl: string;
  primaryColor: string;
  secondaryColor: string;
  seasonLabel: string;
  defaultCategories: string[];
};

function sb() {
  return createClient();
}

function fail(context: string, error: any): never {
  console.error(context, error);
  throw new Error(error?.message || error?.details || error?.hint || error?.code || context);
}

function rowToSettings(row: any): ClubSettingsPro {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    emailFromName: row.email_from_name ?? "MyBasket Club",
    emailFromAddress: row.email_from_address ?? "",
    replyToEmail: row.reply_to_email ?? "",
    signatureText: row.signature_text ?? "",
    signatureImageUrl: row.signature_image_url ?? "",
    primaryColor: row.primary_color ?? "#6B1A2C",
    secondaryColor: row.secondary_color ?? "#D4A24C",
    seasonLabel: row.season_label ?? "2026-2027",
    defaultCategories: Array.isArray(row.default_categories) ? row.default_categories : [],
  };
}

export async function getClubSettingsPro(clubId: string): Promise<ClubSettingsPro> {
  const supabase = sb();

  const { data, error } = await supabase
    .from("club_settings")
    .select("*")
    .eq("club_id", clubId)
    .maybeSingle();

  if (error) fail("GET_CLUB_SETTINGS_ERROR", error);
  if (data) return rowToSettings(data);

  const { data: userData } = await supabase.auth.getUser();

  const { data: created, error: createError } = await supabase
    .from("club_settings")
    .insert({ club_id: clubId, created_by: userData.user?.id ?? null })
    .select("*")
    .single();

  if (createError) fail("CREATE_CLUB_SETTINGS_ERROR", createError);
  return rowToSettings(created);
}

export async function updateClubSettingsPro(
  clubId: string,
  patch: Partial<Omit<ClubSettingsPro, "id" | "clubId">>
): Promise<ClubSettingsPro> {
  const payload: Record<string, unknown> = {};

  if (patch.emailFromName !== undefined) payload.email_from_name = patch.emailFromName;
  if (patch.emailFromAddress !== undefined) payload.email_from_address = patch.emailFromAddress;
  if (patch.replyToEmail !== undefined) payload.reply_to_email = patch.replyToEmail;
  if (patch.signatureText !== undefined) payload.signature_text = patch.signatureText;
  if (patch.signatureImageUrl !== undefined) payload.signature_image_url = patch.signatureImageUrl;
  if (patch.primaryColor !== undefined) payload.primary_color = patch.primaryColor;
  if (patch.secondaryColor !== undefined) payload.secondary_color = patch.secondaryColor;
  if (patch.seasonLabel !== undefined) payload.season_label = patch.seasonLabel;
  if (patch.defaultCategories !== undefined) payload.default_categories = patch.defaultCategories;

  const { data, error } = await sb()
    .from("club_settings")
    .update(payload)
    .eq("club_id", clubId)
    .select("*")
    .single();

  if (error) fail("UPDATE_CLUB_SETTINGS_ERROR", error);
  return rowToSettings(data);
}

export async function uploadSignatureImage(input: { clubId: string; file: File }): Promise<string> {
  const formData = new FormData();
  formData.append("clubId", input.clubId);
  formData.append("file", input.file);

  const response = await fetch("/api/club/settings/signature-image", { method: "POST", body: formData });
  const result = await response.json().catch(() => null);

  if (!response.ok) throw new Error(result?.error || "Upload signature impossible.");
  return result.url as string;
}

export async function getSettingsWorkspace(clubId: string): Promise<{ settings: ClubSettingsPro; templates: MessageTemplate[] }> {
  const [settings, templates] = await Promise.all([getClubSettingsPro(clubId), listMessageTemplates(clubId)]);
  return { settings, templates };
}

export { createMessageTemplate, updateMessageTemplate, deleteMessageTemplate, listMessageTemplates };
