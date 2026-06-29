"use client";

import { createClient } from "@/lib/supabase/client";

export const DOC_BUCKET = "club-documents";

let _sb: ReturnType<typeof createClient> | null = null;

function sb() {
  if (_sb) return _sb;

  try {
    _sb = createClient();
    return _sb;
  } catch {
    return null;
  }
}

export function supabaseReady(): boolean {
  return !!sb();
}

async function currentUserId(): Promise<string | null> {
  const client = sb();
  if (!client) return null;

  try {
    const { data } = await client.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-120);
}

/* --------------------------------------------------------------- Documents */

export type RemoteDoc = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  path: string;
};

export async function uploadDocToStorage(
  section: string,
  file: File
): Promise<RemoteDoc> {
  const client = sb();
  if (!client) throw new Error("Supabase indisponible");

  const userId = (await currentUserId()) || "club";

  const uidPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Date.now().toString(36);

  const path = `${userId}/${section}/${uidPart}-${safeName(file.name)}`;

  const { error } = await client.storage.from(DOC_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });

  if (error) throw error;

  const { data } = client.storage.from(DOC_BUCKET).getPublicUrl(path);

  return {
    id: path,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    url: data.publicUrl,
    path,
  };
}

export async function deleteDocFromStorage(path: string): Promise<void> {
  const client = sb();
  if (!client) return;

  try {
    await client.storage.from(DOC_BUCKET).remove([path]);
  } catch {
    // best-effort
  }
}

/* ------------------------------------------------------------- Invitations */

export type InvitePayload = {
  name: string;
  email: string;
};

export async function createCoachInvitation(
  payload: InvitePayload
): Promise<boolean> {
  const client = sb();
  if (!client) return false;

  try {
    const userId = await currentUserId();

    const { error } = await client.from("club_invitations").insert({
      club_owner: userId,
      coach_name: payload.name,
      coach_email: payload.email,
      status: "invited",
    });

    return !error;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------- Communications */

export async function logCommunication(input: {
  kind: string;
  title: string;
  message?: string;
  recipients: string[];
}): Promise<boolean> {
  const client = sb();
  if (!client) return false;

  try {
    const userId = await currentUserId();

    const { error } = await client.from("club_communications").insert({
      club_owner: userId,
      kind: input.kind,
      title: input.title,
      message: input.message ?? "",
      recipients: input.recipients,
      status: "queued",
    });

    return !error;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- E-mails */

export async function sendClubEmail(input: {
  subject: string;
  message?: string;
  recipients: string[];
  kind?: string;
}): Promise<{ ok: boolean; sent: number; error?: string }> {
  const recipients = input.recipients.filter(Boolean);

  if (!recipients.length) {
    return {
      ok: false,
      sent: 0,
      error: "Aucun destinataire avec e-mail.",
    };
  }

  try {
    const res = await fetch("/api/club/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        recipients,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        sent: 0,
        error: data?.error || `HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      sent: data?.sent ?? recipients.length,
    };
  } catch (error: any) {
    return {
      ok: false,
      sent: 0,
      error: error?.message || "Réseau indisponible",
    };
  }
}