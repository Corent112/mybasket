import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MobileTrainingAttendance } from "@/components/management/TrainingAttendance";

export default async function AttendancePage({ params, searchParams }: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ seance?: string | string[] }>;
}) {
  const { teamId } = await params;
  const { seance } = await searchParams;
  const eventId = typeof seance === "string" ? seance : "";
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    const next = `/equipes/${encodeURIComponent(teamId)}/appel?seance=${encodeURIComponent(eventId)}`;
    redirect(`/connexion?next=${encodeURIComponent(next)}`);
  }

  return <main style={{ maxWidth: 650, margin: "0 auto", padding: "24px 16px 60px" }}>
    <Link href={`/equipes/${encodeURIComponent(teamId)}`}>← Fiche équipe</Link>
    <MobileTrainingAttendance teamId={teamId} eventId={eventId} />
  </main>;
}
