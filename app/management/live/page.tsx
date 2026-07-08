"use client";

import PriseStatsPro from "@/components/prise-stats-pro/PriseStatsPro";

export default function PriseStatsLivePage() {
  return (
    <main className="liveFull">
      <PriseStatsPro />

      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #0a0e1a;
          overflow-x: hidden;
        }

        .liveFull {
          min-height: 100vh;
          width: 100vw;
          background: #0a0e1a;
        }

        .liveFull .ps-root {
          min-height: 100vh;
          width: 100vw;
        }
      `}</style>
    </main>
  );
}