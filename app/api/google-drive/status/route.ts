
import { NextRequest, NextResponse } from "next/server";
import {
  GoogleDriveStepError,
  canAccessTeam,
  getGoogleDriveConfig,
  getTeamDriveConnection,
  logGoogleDriveError,
  logGoogleDriveStep,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "google-drive/status";

/**
 * Cette route ne doit JAMAIS renvoyer un 500 générique pour un problème de
 * configuration : l'interface a besoin d'une réponse exploitable pour afficher
 * l'état de la connexion. Elle renvoie donc un diagnostic structuré, sans
 * jamais exposer la moindre valeur secrète — uniquement des NOMS de variables.
 */
export async function GET(request: NextRequest) {
  const diagnostic = (payload: {
    connected: boolean;
    configured: boolean;
    reason?: string;
    missing?: string[];
    step?: string;
    supabaseCode?: string;
    connectedAt?: string | null;
  }) =>
    NextResponse.json({
      connected: payload.connected,
      configured: payload.configured,
      connectedAt: payload.connectedAt ?? null,
      ...(payload.reason ? { reason: payload.reason } : {}),
      ...(payload.missing?.length ? { missing: payload.missing } : {}),
      ...(payload.step ? { step: payload.step } : {}),
      ...(payload.supabaseCode ? { supabaseCode: payload.supabaseCode } : {}),
    });

  try {
    /* --- 1. Configuration (avant tout accès réseau) --------------- */
    logGoogleDriveStep(ROUTE, "config");
    const config = getGoogleDriveConfig({ requireServiceRole: true });

    if (!config.ok) {
      console.error(
        `[${ROUTE}] step=config missing=${config.missing.join(",") || "aucune"}` +
          (config.redirectUriReason ? ` redirectUri=${config.redirectUriReason}` : ""),
      );

      return diagnostic({
        connected: false,
        configured: false,
        step: "config",
        missing: config.missing,
        reason:
          config.redirectUriReason ||
          "Variables d'environnement Google Drive absentes ou invalides.",
      });
    }

    /* --- 2. Authentification -------------------------------------- */
    logGoogleDriveStep(ROUTE, "auth");
    await requireGoogleDriveUser();

    /* --- 3. Paramètres -------------------------------------------- */
    logGoogleDriveStep(ROUTE, "params");
    const teamId = request.nextUrl.searchParams.get("teamId") || "";
    if (!teamId) {
      return NextResponse.json({ error: "teamId manquant" }, { status: 400 });
    }

    /* --- 4. Droits sur l'équipe ----------------------------------- */
    logGoogleDriveStep(ROUTE, "team-access");
    if (!(await canAccessTeam(teamId))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    /* --- 5. Connexion enregistrée --------------------------------- */
    logGoogleDriveStep(ROUTE, "connection");
    const connection = await getTeamDriveConnection(teamId);

    return diagnostic({
      connected: Boolean(connection),
      configured: true,
      connectedAt: connection?.connected_at ?? null,
    });
  } catch (error) {
    logGoogleDriveError(ROUTE, error);

    if (error instanceof GoogleDriveStepError) {
      // 401 et 403 restent des statuts HTTP : l'interface doit pouvoir les
      // distinguer d'un défaut de configuration.
      if (error.status === 401 || error.status === 403 || error.status === 400) {
        return NextResponse.json(
          { error: error.publicMessage, step: error.step },
          { status: error.status },
        );
      }

      return diagnostic({
        connected: false,
        configured: false,
        step: error.step,
        reason: error.publicMessage,
        missing: error.missing,
        supabaseCode: error.supabaseCode,
      });
    }

    return diagnostic({
      connected: false,
      configured: false,
      step: "unknown",
      reason: "Google Drive indisponible.",
    });
  }
}
