import Link from "next/link";
import TrainingAttendance from "@/components/management/TrainingAttendance";

export default async function AttendancePage({ searchParams }: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { eventId } = await searchParams;
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px" }}>
      <Link href="/mon-compte?tab=calendrier">← Mon Calendrier</Link>
      <TrainingAttendance key={eventId || "today"} eventId={eventId} />
    </main>
  );
}
