
import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase à privilèges élevés, réservé à la table
 * `team_drive_connections` (refresh tokens chiffrés) et aux écritures média.
 * Il ne doit jamais être utilisé par /api/google-drive/connect, qui n'a besoin
 * que du client utilisateur.
 */
export function createGoogleDriveAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // On nomme précisément la variable absente : un message générique rendait le
  // diagnostic impossible en production.
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRole) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRole) {
    throw new Error(
      `Configuration Supabase serveur incomplète : ${missing.join(", ")}`,
    );
  }

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
