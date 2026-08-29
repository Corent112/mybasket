import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { buildPlayerNotebookSnapshot } from "@/lib/institutionnel/player-notebook-data";
import { PoleExitPdf, type PoleExitSection } from "@/lib/institutionnel/pole-exit-pdf";

export const runtime = "nodejs";

const esc = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export async function POST(req: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const structureId = String(body.structureId ?? "");
  const seasonId = body.seasonId ? String(body.seasonId) : null;

  const rawPlayerIds = Array.isArray(body.playerIds) ? body.playerIds : [];
  const playerIds: string[] = uniqueStrings(rawPlayerIds);

  const rawRecipients = Array.isArray(body.to)
    ? body.to
    : String(body.to ?? "").split(/[;,\s]+/);
  const to: string[] = uniqueStrings(rawRecipients).filter((email) => email.includes("@"));

  const sections = (Array.isArray(body.sections) ? body.sections : []) as PoleExitSection[];

  if (!playerIds.length || !to.length) {
    return NextResponse.json(
      { error: "Sélectionne au moins un joueur et un destinataire." },
      { status: 400 },
    );
  }

  if (playerIds.length > 15) {
    return NextResponse.json(
      { error: "Maximum 15 dossiers par envoi pour éviter des pièces jointes trop lourdes." },
      { status: 400 },
    );
  }

  const db = createAdminClient() || sb;
  const [{ data: structure }, { data: membership }] = await Promise.all([
    db
      .from("institutional_structures")
      .select("id,name,structure_type")
      .eq("id", structureId)
      .maybeSingle(),
    db
      .from("institutional_members")
      .select("id")
      .eq("structure_id", structureId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (!membership || structure?.structure_type !== "pole") {
    return NextResponse.json({ error: "Cette action est réservée au Pôle." }, { status: 403 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    return NextResponse.json({ error: "Configuration email Resend absente." }, { status: 400 });
  }

  try {
    const attachments: Array<{ filename: string; content: string }> = [];
    const names: string[] = [];

    for (const playerId of playerIds) {
      const snapshot = await buildPlayerNotebookSnapshot({
        structureId,
        playerId,
        seasonId,
      });

      const buffer = await renderToBuffer(
        React.createElement(PoleExitPdf, {
          snapshot,
          sections: sections.length ? sections : undefined,
        }) as React.ReactElement<any>,
      );

      const player = snapshot.player as any;
      names.push(`${player.first_name ?? ""} ${player.last_name ?? ""}`.trim());
      attachments.push({
        filename: `Dossier_sortie_${String(player.first_name ?? "").replace(/\s+/g, "-")}_${String(player.last_name ?? "").replace(/\s+/g, "-")}.pdf`,
        content: Buffer.from(buffer).toString("base64"),
      });
    }

    const subject =
      String(body.subject ?? "").trim() || `Dossiers joueurs · ${structure.name}`;
    const intro = String(body.message ?? "").trim();
    const html = `<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto"><div style="background:#6B1A2C;color:#fff;padding:20px"><b>${esc(structure.name)}</b></div><div style="padding:22px"><p>Bonjour,</p>${intro ? `<p>${esc(intro)}</p>` : ""}<p>Vous trouverez en pièce jointe ${playerIds.length > 1 ? `les ${playerIds.length} dossiers de joueurs sélectionnés` : "le dossier du joueur sélectionné"}.</p><p><b>${names.map(esc).join(" · ")}</b></p><p>Bien cordialement,<br>${esc(structure.name)}</p></div></div>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, attachments }),
    });

    const result: { id?: string; message?: string } = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Resend a refusé l'envoi.");
    }

    await db.from("institutional_player_exit_exports").insert(
      playerIds.map((playerId) => ({
        structure_id: structureId,
        player_id: playerId,
        season_id: seasonId,
        sections: sections.length ? sections : null,
        recipient_emails: to,
        export_type: "email_pdf",
        provider_id: result.id || null,
        sent_at: new Date().toISOString(),
        created_by: user.id,
      })),
    );

    return NextResponse.json({
      ok: true,
      providerId: result.id || null,
      count: playerIds.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Envoi impossible" },
      { status: 400 },
    );
  }
}
