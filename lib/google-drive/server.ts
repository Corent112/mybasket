
import { createClient } from "@/lib/supabase/server";
import { createGoogleDriveAdminClient } from "./admin";
import { decryptGoogleDriveToken } from "./crypto";

export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

type TeamDriveConnection = {
  team_id: string;
  provider: "google_drive";
  connected_by: string;
  refresh_token_encrypted: string;
  scope: string | null;
  connected_at: string;
  revoked_at: string | null;
};

/* ------------------------------------------------------------------ */
/* Diagnostic                                                          */
/* ------------------------------------------------------------------ */

export type GoogleDriveStep =
  | "auth"
  | "params"
  | "team-access"
  | "config"
  | "oauth-url"
  | "connection"
  | "token"
  | "storage";

/**
 * Erreur portant l'étape exacte du flux Google Drive qui a échoué, plus le
 * code d'erreur Supabase quand il y en a un. Aucun secret n'y transite : on
 * n'y met jamais de client secret, de service role, de clé de chiffrement ni
 * de jeton.
 */
export class GoogleDriveStepError extends Error {
  step: GoogleDriveStep;
  supabaseCode?: string;
  supabaseDetails?: string;
  /** Champs d'environnement absents — noms uniquement, jamais de valeur. */
  missing?: string[];
  /** Message affichable à l'utilisateur final. */
  publicMessage: string;
  status: number;

  constructor(args: {
    step: GoogleDriveStep;
    message: string;
    publicMessage?: string;
    status?: number;
    supabaseCode?: string;
    supabaseDetails?: string;
    missing?: string[];
  }) {
    super(args.message);
    this.name = "GoogleDriveStepError";
    this.step = args.step;
    this.publicMessage = args.publicMessage || args.message;
    this.status = args.status ?? 500;
    this.supabaseCode = args.supabaseCode;
    this.supabaseDetails = args.supabaseDetails;
    this.missing = args.missing;
  }
}

/** Journalisation serveur : étape, type, message, code. Jamais de secret. */
export function logGoogleDriveError(route: string, error: unknown) {
  if (error instanceof GoogleDriveStepError) {
    console.error(
      `[${route}] step=${error.step} name=${error.name} message=${error.message}` +
        (error.supabaseCode ? ` supabaseCode=${error.supabaseCode}` : "") +
        (error.supabaseDetails ? ` supabaseDetails=${error.supabaseDetails}` : "") +
        (error.missing?.length ? ` missing=${error.missing.join(",")}` : ""),
    );
    return;
  }

  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${route}] step=unknown name=${name} message=${message}`);
}

export function logGoogleDriveStep(route: string, step: GoogleDriveStep) {
  console.log(`[${route}] step=${step}`);
}

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/**
 * État de configuration du flux OAuth. Retourne uniquement des NOMS de
 * variables, jamais leurs valeurs.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` n'est PAS requise par /connect : cette route
 * n'utilise que le client utilisateur. Elle l'est en revanche pour lire et
 * écrire `team_drive_connections` (status, callback, disconnect, picker-token),
 * car cette table contient les refresh tokens chiffrés et ne doit jamais être
 * exposée au navigateur.
 */
export function getGoogleDriveConfig(options?: { requireServiceRole?: boolean }) {
  const missing: string[] = [];

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const encryptionKey = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY || "";

  if (!clientId) missing.push("GOOGLE_DRIVE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_DRIVE_CLIENT_SECRET");
  if (!redirectUri) missing.push("GOOGLE_DRIVE_REDIRECT_URI");
  if (!/^[0-9a-f]{64}$/i.test(encryptionKey)) {
    missing.push("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (options?.requireServiceRole && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  // Vérifie que l'URI de redirection pointe bien vers la route réellement
  // servie par le code. Une incohérence ici produit un échec au retour de
  // Google, pas au départ — d'où l'intérêt de le détecter tôt.
  let redirectUriValid = true;
  let redirectUriReason: string | undefined;

  if (redirectUri) {
    try {
      const parsed = new URL(redirectUri);
      if (parsed.pathname !== "/api/google-drive/callback") {
        redirectUriValid = false;
        redirectUriReason =
          "GOOGLE_DRIVE_REDIRECT_URI doit se terminer par /api/google-drive/callback.";
      } else if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
        redirectUriValid = false;
        redirectUriReason = "GOOGLE_DRIVE_REDIRECT_URI doit utiliser https.";
      }
    } catch {
      redirectUriValid = false;
      redirectUriReason = "GOOGLE_DRIVE_REDIRECT_URI n'est pas une URL valide.";
    }
  }

  return {
    ok: missing.length === 0 && redirectUriValid,
    missing,
    redirectUriValid,
    redirectUriReason,
    // Hôte seulement : sert à comparer avec le domaine réellement servi.
    redirectUriHost: (() => {
      if (!redirectUri) return null;
      try {
        return new URL(redirectUri).host;
      } catch {
        return null;
      }
    })(),
    clientId,
    clientSecret,
    redirectUri,
  };
}

/* ------------------------------------------------------------------ */
/* Authentification                                                    */
/* ------------------------------------------------------------------ */

export async function requireGoogleDriveUser() {
  // `createClient()` lève si NEXT_PUBLIC_SUPABASE_URL / ANON_KEY sont absentes
  // (assertions `!` côté TypeScript, mais erreur réelle à l'exécution).
  let supabase: Awaited<ReturnType<typeof createClient>>;

  try {
    supabase = await createClient();
  } catch (error) {
    throw new GoogleDriveStepError({
      step: "config",
      message:
        error instanceof Error
          ? `Client Supabase serveur indisponible : ${error.message}`
          : "Client Supabase serveur indisponible.",
      publicMessage: "Configuration serveur incomplète.",
      missing: getGoogleDriveConfig().missing,
      status: 500,
    });
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    throw new GoogleDriveStepError({
      step: "auth",
      message: error?.message || "Session absente ou expirée.",
      publicMessage: "Non authentifié.",
      status: 401,
    });
  }

  return { supabase, user: data.user };
}

/* ------------------------------------------------------------------ */
/* Droits d'accès à l'équipe                                           */
/* ------------------------------------------------------------------ */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTeamUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Appelle la fonction Postgres de contrôle d'accès. Aucune erreur n'est
 * masquée : si la fonction est absente, mal nommée ou reçoit un mauvais type,
 * l'erreur Supabase remonte telle quelle, avec son code, dans les logs.
 */
async function boolRpc(
  name: "can_access_team" | "can_manage_team_media",
  teamId: string,
) {
  const { supabase } = await requireGoogleDriveUser();

  // Une équipe locale (id non-uuid) ne peut pas être passée à une fonction
  // Postgres typée uuid : Postgres répondrait 22P02 et la route renverrait un
  // 500 trompeur. C'est une validation d'entrée, pas un masquage d'erreur.
  if (!isTeamUuid(teamId)) {
    throw new GoogleDriveStepError({
      step: "params",
      message: `teamId non-uuid transmis à ${name} : ${teamId}`,
      publicMessage:
        "Cette équipe n'est pas enregistrée en base : Google Drive n'est pas disponible pour une équipe locale.",
      status: 400,
    });
  }

  const { data, error } = await supabase.rpc(name, { p_team_id: teamId });

  if (error) {
    throw new GoogleDriveStepError({
      step: "team-access",
      message: `RPC ${name} en échec : ${error.message}`,
      publicMessage: "Vérification des droits impossible.",
      supabaseCode: error.code,
      supabaseDetails: error.hint || error.details || undefined,
      status: 500,
    });
  }

  return data === true;
}

export const canAccessTeam = (teamId: string) =>
  boolRpc("can_access_team", teamId);

export const canManageTeamMedia = (teamId: string) =>
  boolRpc("can_manage_team_media", teamId);

/* ------------------------------------------------------------------ */
/* Connexion Drive stockée                                             */
/* ------------------------------------------------------------------ */

export async function getTeamDriveConnection(
  teamId: string,
): Promise<TeamDriveConnection | null> {
  let admin: ReturnType<typeof createGoogleDriveAdminClient>;

  try {
    admin = createGoogleDriveAdminClient();
  } catch (error) {
    throw new GoogleDriveStepError({
      step: "config",
      message:
        error instanceof Error ? error.message : "Client admin Supabase indisponible.",
      publicMessage: "Configuration serveur incomplète.",
      missing: getGoogleDriveConfig({ requireServiceRole: true }).missing,
      status: 500,
    });
  }

  const { data, error } = await admin
    .from("team_drive_connections")
    .select(
      "team_id,provider,connected_by,refresh_token_encrypted,scope,connected_at,revoked_at",
    )
    .eq("team_id", teamId)
    .eq("provider", "google_drive")
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    throw new GoogleDriveStepError({
      step: "connection",
      message: `Lecture team_drive_connections en échec : ${error.message}`,
      publicMessage: "Connexion Google Drive illisible.",
      supabaseCode: error.code,
      supabaseDetails: error.hint || error.details || undefined,
      status: 500,
    });
  }

  return (data ?? null) as TeamDriveConnection | null;
}

export async function refreshTeamGoogleDriveAccessToken(teamId: string) {
  const connection = await getTeamDriveConnection(teamId);

  if (!connection) {
    throw new GoogleDriveStepError({
      step: "connection",
      message: "Aucune connexion Google Drive active pour cette équipe.",
      publicMessage: "Google Drive n'est pas connecté pour cette équipe.",
      status: 409,
    });
  }

  const config = getGoogleDriveConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new GoogleDriveStepError({
      step: "config",
      message: "Identifiants OAuth Google Drive absents.",
      publicMessage: "Configuration Google Drive incomplète.",
      missing: config.missing,
      status: 500,
    });
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: decryptGoogleDriveToken(
        connection.refresh_token_encrypted,
      ),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    if (payload?.error === "invalid_grant") {
      const admin = createGoogleDriveAdminClient();
      await admin
        .from("team_drive_connections")
        .update({ revoked_at: new Date().toISOString() })
        .eq("team_id", teamId)
        .eq("provider", "google_drive");
    }

    throw new GoogleDriveStepError({
      step: "token",
      message:
        payload?.error_description ||
        payload?.error ||
        "Renouvellement du jeton Google refusé.",
      publicMessage: "Impossible de renouveler l'accès Google Drive.",
      status: 502,
    });
  }

  return {
    accessToken: String(payload.access_token),
    expiresIn: Number(payload.expires_in || 3600),
  };
}

export async function getDriveFileMetadata(
  teamId: string,
  fileId: string,
) {
  const { accessToken } =
    await refreshTeamGoogleDriveAccessToken(teamId);

  const fields = [
    "id",
    "name",
    "mimeType",
    "size",
    "md5Checksum",
    "modifiedTime",
    "resourceKey",
    "webViewLink",
    "capabilities(canDownload)",
  ].join(",");

  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  );
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", fields);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || "Fichier Google Drive introuvable.",
    );
  }

  return payload as {
    id: string;
    name: string;
    mimeType?: string;
    size?: string;
    md5Checksum?: string;
    modifiedTime?: string;
    resourceKey?: string;
    webViewLink?: string;
    capabilities?: { canDownload?: boolean };
  };
}

export async function proxyDriveFile(args: {
  teamId: string;
  fileId: string;
  resourceKey?: string | null;
  range?: string | null;
}) {
  const { accessToken } =
    await refreshTeamGoogleDriveAccessToken(args.teamId);

  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.fileId)}`,
  );
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  if (args.resourceKey) {
    url.searchParams.set("resourceKey", args.resourceKey);
  }

  const headers = new Headers({
    Authorization: `Bearer ${accessToken}`,
  });
  if (args.range) headers.set("Range", args.range);

  return fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });
}
