"use client";

import PriseStatsPro from "@/components/prise-stats-pro/PriseStatsPro";

export default function LiveStatsModule() {
  return (
    <div className="liveStatsModule">
      <PriseStatsPro />

      <style jsx>{`
        .liveStatsModule {
          width: 100%;
          min-width: 0;
          overflow-x: auto;
          border-radius: 18px;
        }

        .liveStatsModule :global(.ps-root) {
          min-height: auto;
          border-radius: 18px;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}