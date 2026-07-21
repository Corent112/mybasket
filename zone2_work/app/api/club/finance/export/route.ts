// app/api/club/finance/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clubId = searchParams.get("clubId");

  if (!clubId) {
    return NextResponse.json({ error: "clubId manquant." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const { data: member } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const [{ data: entries }, { data: sponsors }, { data: cotisations }, { data: players }] =
    await Promise.all([
      supabase.from("club_finance_entries").select("*").eq("club_id", clubId),
      supabase.from("club_sponsors").select("*").eq("club_id", clubId),
      supabase.from("club_player_cotisations").select("*").eq("club_id", clubId),
      supabase.from("club_players").select("id, first_name, last_name").eq("club_id", clubId),
    ]);

  const playerName = (id: string) => {
    const player = (players ?? []).find((p: any) => String(p.id) === String(id));
    return player ? `${player.last_name} ${player.first_name}` : "";
  };

  const rows: string[][] = [["type", "date", "categorie", "titre", "joueur", "montant_euros", "statut"]];

  (entries ?? []).forEach((entry: any) => {
    rows.push([
      entry.entry_type,
      entry.entry_date,
      entry.category,
      entry.title,
      "",
      String((Number(entry.amount_cents) || 0) / 100).replace(".", ","),
      entry.status,
    ]);
  });

  (sponsors ?? []).forEach((sponsor: any) => {
    rows.push([
      "sponsor",
      "",
      "Sponsor",
      sponsor.name,
      "",
      String((Number(sponsor.amount_cents) || 0) / 100).replace(".", ","),
      sponsor.status,
    ]);
  });

  (cotisations ?? []).forEach((cotisation: any) => {
    rows.push([
      "cotisation",
      cotisation.due_date || "",
      "Cotisation",
      cotisation.season,
      playerName(cotisation.player_id),
      String((Number(cotisation.paid_cents) || 0) / 100).replace(".", ","),
      cotisation.status,
    ]);
  });

  const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-club.csv"`,
    },
  });
}
