import { NextResponse } from "next/server";
import { getTeamLimitForCurrentUser } from "@/lib/access";

export async function GET() {
  const access = await getTeamLimitForCurrentUser();

  return NextResponse.json(access);
}