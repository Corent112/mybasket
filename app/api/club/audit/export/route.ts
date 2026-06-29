// app/api/club/audit/export/route.ts
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

  const { data: logs, error } = await supabase
    .from("club_audit_logs")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = [
    ["date", "action", "type", "id", "titre", "description"],
    ...(logs ?? []).map((log: any) => [
      log.created_at,
      log.action,
      log.entity_type,
      log.entity_id,
      log.title,
      log.description,
    ]),
  ];

  const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="journal-activite-club.csv"`,
    },
  });
}
