"use client";

import { useEffect, useState } from "react";
import GoogleDriveVideoPicker from "@/components/video/GoogleDriveVideoPicker";
import {
  googleDriveFileStreamUrl,
  type GoogleDrivePickedVideo,
} from "@/lib/google-drive/client";

function DriveMark() {
  return (
    <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
      <path d="M11 2h8l7 12h-8z" fill="#f4b400" />
      <path d="M11 2 2 18l4 7 9-16z" fill="#0f9d58" />
      <path d="M6 25h18l4-7H10z" fill="#4285f4" />
    </svg>
  );
}

export default function TeamGoogleDriveSettings({
  teamId,
  isOwner = true,
}: {
  teamId: string;
  isOwner?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<GoogleDrivePickedVideo | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/google-drive/status?teamId=${encodeURIComponent(teamId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "État Google Drive indisponible.");
      }
      setConnected(Boolean(payload.connected));
    } catch (error) {
      setConnected(false);
      setStatusMessage(error instanceof Error ? error.message : "Google Drive indisponible.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const drive = params.get("drive");
    const message = params.get("message");

    if (drive === "connected") {
      setStatusMessage("Google Drive connecté à l'équipe.");
    } else if (drive === "error") {
      setStatusMessage(message || "Connexion Google Drive impossible.");
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const connect = () => {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("drive");
    cleanUrl.searchParams.delete("message");
    const returnTo = cleanUrl.pathname + cleanUrl.search;
    window.location.href =
      `/api/google-drive/connect?teamId=${encodeURIComponent(teamId)}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;
  };

  const disconnect = async () => {
    if (!window.confirm("Déconnecter Google Drive ? Les stats, tags et timecodes restent sauvegardés.")) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/google-drive/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Déconnexion impossible.");
      }
      setSelectedVideo(null);
      setShowPlayer(false);
      setPlayerExpanded(false);
      setStatusMessage("Google Drive déconnecté de l'équipe.");
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="drive-card">
      <div className="drive-intro">
        <div className="drive-title">
          <DriveMark />
          <div>
            <span className="eyebrow">Médias équipe</span>
            <strong>Vidéos Google Drive</strong>
          </div>
        </div>
        <p>
          Le coach principal connecte le Drive une seule fois. Les membres du staff autorisés
          peuvent ensuite parcourir et lire les vidéos de cette équipe dans MyBasket.
        </p>
        {statusMessage ? <div className="drive-message">{statusMessage}</div> : null}
      </div>

      <div className="drive-status">
        {loading ? (
          <span className="status neutral">Vérification…</span>
        ) : connected ? (
          <>
            <span className="status connected"><i />Google Drive équipe connecté</span>
            <GoogleDriveVideoPicker
              teamId={teamId}
              compact
              label={selectedVideo ? "Changer de vidéo" : "Choisir une vidéo"}
              onPicked={(file) => {
                setSelectedVideo(file);
                setShowPlayer(false);
                setPlayerExpanded(false);
              }}
            />
            {isOwner ? (
              <button type="button" className="secondary" onClick={disconnect} disabled={busy}>
                {busy ? "Déconnexion…" : "Déconnecter"}
              </button>
            ) : (
              <span className="team-drive-note">Accès staff autorisé</span>
            )}
          </>
        ) : isOwner ? (
          <>
            <span className="status neutral">Drive non connecté</span>
            <button type="button" className="primary" onClick={connect}>Connecter Google Drive</button>
          </>
        ) : (
          <span className="status neutral">Drive non connecté par le responsable</span>
        )}
      </div>

      {connected && selectedVideo ? (
        <div className={`drive-video ${showPlayer ? "open" : ""} ${playerExpanded ? "expanded" : "compact"}`}>
          <div className="drive-video-head">
            <button
              type="button"
              className="video-pill"
              onClick={() => {
                setShowPlayer((value) => !value);
                if (showPlayer) setPlayerExpanded(false);
              }}
              title={showPlayer ? "Masquer la vidéo" : "Afficher la vidéo"}
            >
              <span className="video-pill-icon">🎬</span>
              <span className="video-pill-copy">
                <small>Vidéo sélectionnée</small>
                <strong title={selectedVideo.name}>{selectedVideo.name}</strong>
              </span>
              <span className="video-pill-action">{showPlayer ? "Masquer" : "▶ Voir"}</span>
            </button>

            <div className="drive-video-actions">
              {showPlayer ? (
                <button type="button" className="secondary" onClick={() => setPlayerExpanded((value) => !value)}>
                  {playerExpanded ? "Réduire" : "Agrandir"}
                </button>
              ) : null}
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSelectedVideo(null);
                  setShowPlayer(false);
                  setPlayerExpanded(false);
                }}
              >
                Retirer
              </button>
            </div>
          </div>

          {showPlayer ? (
            <div className="drive-player-wrap">
              <video
                className="drive-player"
                src={googleDriveFileStreamUrl(teamId, selectedVideo.id)}
                controls
                playsInline
                preload="metadata"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="drive-security">
        <span>🔒 Un seul Drive est connecté à l’équipe</span>
        <span>Le staff autorisé voit les vidéos sans accéder au compte Google ni au token du coach</span>
      </div>

      <style jsx>{`
        .drive-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px 28px;margin-bottom:20px;padding:18px 20px 13px;border:1px solid #eadfd5;border-radius:18px;background:#fff;box-shadow:0 10px 26px rgba(50,31,23,.04)}
        .drive-intro{min-width:0}.drive-title{display:flex;align-items:center;gap:11px}.drive-title>div{display:grid;gap:2px}.eyebrow{color:#d4a24c;font-size:.62rem;font-weight:950;letter-spacing:.11em;text-transform:uppercase}strong{color:#2c211d;font-size:1rem}p{max-width:690px;margin:7px 0 0 45px;color:#746761;font-size:.76rem;line-height:1.5}.drive-message{margin:8px 0 0 45px;color:#6b1a2c;font-size:.7rem;font-weight:800}
        .drive-status{display:flex;align-items:center;gap:9px;justify-content:flex-end;flex-wrap:wrap}.status{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 11px;border-radius:999px;font-size:.7rem;font-weight:850}.status.neutral{background:#f7f2ed;color:#81726b}.status.connected{background:#eef7ef;color:#3d7048}.status i{width:7px;height:7px;border-radius:50%;background:#4b9a5a}button{min-height:36px;border-radius:999px;padding:0 14px;font-weight:900;cursor:pointer}.primary{border:1px solid #6b1a2c;background:#6b1a2c;color:#fff}.secondary{border:1px solid #dfd3cb;background:#fff;color:#6b1a2c}button:disabled{opacity:.55;cursor:default}
        .drive-video{grid-column:1/-1;min-width:0;padding:8px 10px;border:1px solid #f0e7e1;border-radius:12px;background:#fffaf5}.drive-video-head{display:flex;align-items:center;justify-content:space-between;gap:14px}.video-pill{min-width:0;max-width:520px;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:8px;padding:5px 9px;border:1px solid #eadfd5;border-radius:10px;background:#fff;color:#2c211d;text-align:left;cursor:pointer}.video-pill-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:#f8ecef;font-size:.9rem}.video-pill-copy{min-width:0;display:grid;gap:1px}.video-pill-copy small{color:#9a877c;font-size:.55rem;font-weight:900;text-transform:uppercase}.video-pill-copy strong{overflow:hidden;color:#2c211d;font-size:.72rem;text-overflow:ellipsis;white-space:nowrap}.video-pill-action{color:#6b1a2c;font-size:.65rem;font-weight:950;white-space:nowrap}.drive-video-actions{display:flex;gap:8px;flex:0 0 auto}.drive-player-wrap{width:min(420px,100%);margin-top:9px;transition:width .18s ease}.drive-video.expanded .drive-player-wrap{width:100%}.drive-player{display:block;width:100%;max-height:250px;border-radius:10px;background:#111}.drive-video.expanded .drive-player{max-height:650px}.team-drive-note{color:#6f625b;font-size:.68rem;font-weight:750}
        .drive-security{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:12px 24px;flex-wrap:wrap;margin:0 -20px -13px;padding:9px 20px;border-top:1px solid #f0e7e1;border-radius:0 0 18px 18px;background:#fffaf5;color:#806e65;font-size:.65rem}
        @media(max-width:760px){.drive-card{grid-template-columns:1fr}p,.drive-message{margin-left:0}.drive-status{justify-content:flex-start}.drive-video-head{align-items:flex-start;flex-direction:column}.drive-video-actions{width:100%;flex-wrap:wrap}.drive-security{justify-content:flex-start}}
      `}</style>
    </section>
  );
}
