"use client";

// components/club/ClubStatsLiveBridgeSection.tsx
import { useEffect, useState } from "react";
import { listClubMatches, type ClubMatch } from "@/lib/club-performance-links";
import {
  listLinkedLiveMatches,
  syncLiveStatsToClubMatch,
  type LiveBridgeMatch,
} from "@/lib/club-stats-live-bridge";

export default function ClubStatsLiveBridgeSection({ clubId }: { clubId: string }) {
  const [matches, setMatches] = useState<ClubMatch[]>([]);
  const [liveMatches, setLiveMatches] = useState<LiveBridgeMatch[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function load() {
    setError("");
    try {
      const [matchRows, liveRows] = await Promise.all([
        listClubMatches(clubId),
        listLinkedLiveMatches(clubId),
      ]);
      setMatches(matchRows);
      setLiveMatches(liveRows);
    } catch (e: any) {
      setError(e?.message || "Pont Stats Live impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  async function sync(matchId: string) {
    setSyncingId(matchId);
    setError("");
    setMessage("");

    try {
      await syncLiveStatsToClubMatch(matchId);
      setMessage("Stats Live synchronisées dans Performance Club.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Synchronisation impossible.");
    } finally {
      setSyncingId(null);
    }
  }

  function hasLive(match: ClubMatch) {
    return liveMatches.some((live) => live.clubMatchId === match.id);
  }

  return (
    <section className="bridge">
      <div className="top">
        <div>
          <p>STATS LIVE</p>
          <h2>Pont vers Performance Club</h2>
          <span>Les matchs live reliés au club peuvent alimenter les stats saison.</span>
        </div>
        <button onClick={load}>Actualiser</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="panel">
        <h3>Matchs club</h3>
        <div className="table">
          <div className="row head">
            <span>Match</span>
            <span>Date</span>
            <span>Live lié</span>
            <span>Action</span>
          </div>

          {matches.map((match) => (
            <div className="row" key={match.id}>
              <span>{match.opponent}</span>
              <span>{match.matchDate}</span>
              <span>{hasLive(match) ? "Oui" : "Non / manuel"}</span>
              <span>
                <button disabled={syncingId === match.id || !hasLive(match)} onClick={() => sync(match.id)}>
                  {syncingId === match.id ? "Sync..." : "Synchroniser"}
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .bridge{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}
        .top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}
        .top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}
        .top span{color:#6b7280;font-weight:700}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}
        .alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer}
        button:disabled{opacity:.55;cursor:not-allowed}
        .panel{margin:18px;border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}
        .panel h3{margin:0 0 14px;color:#6b1a2c}
        .table{border:1px solid #eef2f7;border-radius:18px;overflow:hidden}
        .row{display:grid;grid-template-columns:1.2fr .8fr .8fr .8fr;border-bottom:1px solid #eef2f7}
        .row span{padding:12px;font-weight:800}
        .row.head{background:#f8fafc;color:#6b7280}
        @media(max-width:900px){.row{grid-template-columns:1fr}.row.head{display:none}.top{display:grid}}
      `}</style>
    </section>
  );
}
