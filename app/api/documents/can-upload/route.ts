import { NextResponse } from "next/server";
import { getDocumentLimitForCurrentUser } from "@/lib/access";

export async function GET() {
  const access = await getDocumentLimitForCurrentUser();

  return NextResponse.json(access);
}