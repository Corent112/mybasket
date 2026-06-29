import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/access";

const SECTIONS = [
  "messagerie",
  "calendrier",
  "exercices",
  "playbooks",
  "annonces",
  "documents",
  "equipes",
  "management",
  "coach_space",
  "club_space",
];

export async function GET() {
  const result = await Promise.all(
    SECTIONS.map(async (key) => [
      key,
      await hasAccess(key),
    ])
  );

  return NextResponse.json(
    Object.fromEntries(result)
  );
}