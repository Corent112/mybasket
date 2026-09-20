import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const raw = request.nextUrl.searchParams.get("teamIds") || "";
    const teamIds = Array.from(
      new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))
    ).slice(0, 50);

    if (!teamIds.length) {
      return NextResponse.json({ connections: [] });
    }

    const { data, error } = await supabase
      .from("ffbb_team_connections")
      .select("*")
      .in("team_id", teamIds);

    if (error) {
      console.error("partner-team-ffbb:", error);
      return NextResponse.json({ connections: [] });
    }

    return NextResponse.json({ connections: data || [] });
  } catch (error) {
    console.error("partner-team-ffbb route:", error);
    return NextResponse.json({ connections: [] });
  }
}
