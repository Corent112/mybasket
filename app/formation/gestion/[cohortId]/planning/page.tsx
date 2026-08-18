import TrainingPlanningBoard from "@/components/formation/TrainingPlanningBoard";
import PedagogicalScenarioEditor from "@/components/formation/PedagogicalScenarioEditor";

export default async function Page({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;

  return (
    <main style={{ minHeight: "100vh", background: "#f6f2ee", padding: "28px 18px 60px" }}>
      <div style={{ maxWidth: 1450, margin: "0 auto", display: "grid", gap: 18 }}>
        <TrainingPlanningBoard cohortId={cohortId} />
        <PedagogicalScenarioEditor cohortId={cohortId} />
      </div>
    </main>
  );
}
