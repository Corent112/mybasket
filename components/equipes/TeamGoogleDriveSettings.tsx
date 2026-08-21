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
}: {
  teamId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<GoogleDrivePickedVideo | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/google-drive/status?teamId=${encodeURIComponent(teamId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      setConnected(Boolean(payload.connected));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const connect = () => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href =
      `/api/google-drive/connect?teamId=${encodeURIComponent(teamId)}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;
  };

  const disconnect = async () => {
    if (
      !window.confirm(
        "Déconnecter Google Drive ? Les stats, tags et timecodes restent sauvegardés.",
      )
    ) {
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
          Ouvre les dossiers de l’équipe et retrouve toutes les vidéos. Le coach principal connecte Drive une seule fois ; le staff autorisé peut ensuite lire les vidéos dans MyBasket.
        </p>
      </div>

      <div className="drive-status">
        {loading ? (
          <span className="status neutral">Vérification…</span>
        ) : connected ? (
          <>
            <span className="status connected">
              <i />
              Google Drive équipe connecté
            </span>
            <GoogleDriveVideoPicker
              teamId={teamId}
              compact
              label={selectedVideo ? "Changer de vidéo" : "Parcourir les vidéos de l’équipe"}
              onPicked={(file) => {
                setSelectedVideo(file);
                setShowPlayer(true);
              }}
            />
            <button type="button" className="secondary" onClick={disconnect} disabled={busy}>
              {busy ? "Déconnexion…" : "Déconnecter"}
            </button>
          </>
        ) : (
          <>
            <span className="status neutral">Drive non connecté</span>
            <button type="button" className="primary" onClick={connect}>
              Connecter Google Drive
            </button>
          </>
        )}
      </div>

      {connected && selectedVideo ? (
        <div className="drive-video">
          <div className="drive-video-head">
            <div>
              <span className="eyebrow">Vidéo sélectionnée</span>
              <strong title={selectedVideo.name}>{selectedVideo.name}</strong>
            </div>
            <div className="drive-video-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowPlayer((value) => !value)}
              >
                {showPlayer ? "Masquer" : "▶ Regarder"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSelectedVideo(null);
                  setShowPlayer(false);
                }}
              >
                Retirer
              </button>
            </div>
          </div>
          {showPlayer ? (
            <video
              className="drive-player"
              src={googleDriveFileStreamUrl(teamId, selectedVideo.id)}
              controls
              playsInline
              preload="metadata"
            />
          ) : null}
        </div>
      ) : null}

      <div className="drive-security">
        <span>🔒 Accès réservé aux membres autorisés de l’équipe</span>
        <span>Les vidéos restent privées dans Google Drive</span>
      </div>

      <style jsx>{`
        .drive-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 18px 28px;
          margin-bottom: 20px;
          padding: 18px 20px 13px;
          border: 1px solid #eadfd5;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 10px 26px rgba(50, 31, 23, 0.04);
        }
        .drive-intro {
          min-width: 0;
        }
        .drive-title {
          display: flex;
          align-items: center;
          gap: 11px;
        }
        .drive-title > div {
          display: grid;
          gap: 2px;
        }
        .eyebrow {
          color: #d4a24c;
          font-size: 0.62rem;
          font-weight: 950;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }
        strong {
          color: #2c211d;
          font-size: 1rem;
        }
        p {
          max-width: 690px;
          margin: 7px 0 0 45px;
          color: #746761;
          font-size: 0.76rem;
          line-height: 1.5;
        }
        .drive-status {
          display: flex;
          align-items: center;
          gap: 9px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
        .status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 34px;
          padding: 0 11px;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 850;
        }
        .status.neutral {
          background: #f7f2ed;
          color: #81726b;
        }
        .status.connected {
          background: #eef7ef;
          color: #3d7048;
        }
        .status i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #4b9a5a;
        }
        button {
          min-height: 36px;
          border-radius: 999px;
          padding: 0 14px;
          font-weight: 900;
          cursor: pointer;
        }
        .primary {
          border: 1px solid #6b1a2c;
          background: #6b1a2c;
          color: #fff;
        }
        .secondary {
          border: 1px solid #dfd3cb;
          background: #fff;
          color: #6b1a2c;
        }
        button:disabled {
          opacity: 0.55;
          cursor: default;
        }
        .drive-video {
          grid-column: 1 / -1;
          min-width: 0;
          padding: 14px;
          border: 1px solid #f0e7e1;
          border-radius: 14px;
          background: #fffaf5;
        }
        .drive-video-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        .drive-video-head > div:first-child {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .drive-video-head strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .drive-video-actions {
          display: flex;
          gap: 8px;
          flex: 0 0 auto;
        }
        .drive-player {
          display: block;
          width: 100%;
          max-height: 560px;
          margin-top: 12px;
          border-radius: 12px;
          background: #111;
        }
        .drive-status :global(.gdrive-picker) {
          display: inline-flex;
        }
        .drive-status :global(.gdrive-picker button) {
          min-height: 36px;
          border: 1px solid #6b1a2c;
          border-radius: 999px;
          padding: 0 14px;
          background: #6b1a2c;
          color: #fff;
          font-weight: 900;
          cursor: pointer;
        }
        .drive-security {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px 24px;
          flex-wrap: wrap;
          margin: 0 -20px -13px;
          padding: 9px 20px;
          border-top: 1px solid #f0e7e1;
          border-radius: 0 0 18px 18px;
          background: #fffaf5;
          color: #806e65;
          font-size: 0.65rem;
        }
        @media (max-width: 760px) {
          .drive-card {
            grid-template-columns: 1fr;
          }
          p {
            margin-left: 0;
          }
          .drive-status {
            justify-content: flex-start;
          }
          .drive-video-head {
            align-items: flex-start;
            flex-direction: column;
          }
          .drive-video-actions {
            width: 100%;
            flex-wrap: wrap;
          }
          .drive-security {
            justify-content: flex-start;
          }
        }
      `}</style>
    </section>
  );
}
