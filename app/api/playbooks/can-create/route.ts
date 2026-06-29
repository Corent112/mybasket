import { NextResponse } from "next/server";
import { getPlaybookLimitForCurrentUser } from "@/lib/access";

export async function GET() {
  const access = await getPlaybookLimitForCurrentUser();

  return NextResponse.json(access);
}