import { NextResponse } from "next/server";
import { getTeamLimitForCurrentUser, hasAccess } from "@/lib/access";

export async function GET() {
  const [limit, allowedByMatrix] = await Promise.all([
    getTeamLimitForCurrentUser(),
    hasAccess("equipes"),
  ]);

  return NextResponse.json({
    ...limit,
    allowedByMatrix,
    canCreate: allowedByMatrix && limit.canCreate,
  });
}
