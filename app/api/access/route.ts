import { NextResponse } from "next/server";

const SECTIONS = [
  "messagerie",
  "calendrier",
  "exercices",
  "systemes",
  "seances",
  "plaquette",
  "playbooks",
  "annonces",
  "documents",
  "equipes",
  "management",
  "coach_space",
  "club_space",
];

export async function GET() {
  return NextResponse.json(
    Object.fromEntries(SECTIONS.map((key) => [key, true]))
  );
}