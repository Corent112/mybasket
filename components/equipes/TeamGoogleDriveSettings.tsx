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

function shortName(name: string) {
  const clean = name.replace(/\.[^/.]+$/, "");
  return clean.length > 38 ? `${clean.slice(0, 38)}…` : clean;
}

export default function TeamGoogleDriveSettings({
  teamId,
  isOwner = false,
}: {
  teamId: string;
  isOwner?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  // Plusieurs vidéos peuvent maintenant être ajoutées.
  const [videos, setVideos] = useState<GoogleDrivePickedVideo[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);

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
      if (!response.ok) throw new Error(payload.error || "Déconnexion impossible.");

      setVideos([]);
      setPlayingId(null);
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  };

  const addVideo = (file: GoogleDrivePickedVideo) => {
    setVideos((current) => {
      if (current.some((video) => video.id === file.id)) return current;
      return [...current, file];
    });
  };

  const removeVideo = (id: string) => {
    setVideos((current) => current.filter((video) => video.id !== id));
    setPlayingId((current) => (current === id ? null : current));
  };

  const playingVideo = videos.find((video) => video.id === playingId) ?? null;

  return (
    <section className="drive-card">
      <div className="drive-top">
        <div className="drive-intro">
          <div className="drive-title">
            <DriveMark />
            <div>
              <span className="eyebrow">Médias équipe</span>
              <strong>Vidéos Google Drive</strong>
            </div>
          </div>
          <p>
            Le coach principal connecte le Drive une seule fois. Le staff autorisé
            retrouve ensuite les vidéos de l’équipe directement dans MyBasket.
          </p>
          {connected ? <b className="connected-copy">Google Drive connecté à l’équipe.</b> : null}
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
                label={videos.length ? "Ajouter une vidéo" : "Choisir une vidéo"}
                onPicked={addVideo}
              />
              {isOwner ? (
                <button type="button" className="secondary danger" onClick={disconnect} disabled={busy}>
                  {busy ? "Déconnexion…" : "Déconnecter"}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <span className="status neutral">Drive non connecté</span>
              {isOwner ? (
                <button type="button" className="primary" onClick={connect}>
                  Connecter Google Drive
                </button>
              ) : (
                <span className="status neutral">Le coach principal doit connecter le Drive</span>
              )}
            </>
          )}
        </div>
      </div>

      {connected && videos.length > 0 ? (
        <div className="video-strip">
          {videos.map((video) => {
            const stream = googleDriveFileStreamUrl(teamId, video.id);
            const active = playingId === video.id;

            return (
              <article className={`video-tile ${active ? "active" : ""}`} key={video.id}>
                <button
                  type="button"
                  className="thumb-button"
                  onClick={() => setPlayingId(active ? null : video.id)}
                  aria-label={`Lire ${video.name}`}
                >
                  <video
                    className="video-thumb"
                    src={stream}
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <span className="play-badge">▶</span>
                </button>

                <div className="tile-info">
                  <strong title={video.name}>{shortName(video.name)}</strong>
                  <div className="tile-bottom">
                    <span>Google Drive</span>
                    <button
                      type="button"
                      className="more"
                      onClick={() => removeVideo(video.id)}
                      title="Retirer la vidéo"
                      aria-label={`Retirer ${video.name}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {playingVideo ? (
        <div className="player-wrap">
          <div className="player-head">
            <strong>{playingVideo.name}</strong>
            <button type="button" className="secondary" onClick={() => setPlayingId(null)}>
              Fermer
            </button>
          </div>
          <video
            className="drive-player"
            src={googleDriveFileStreamUrl(teamId, playingVideo.id)}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        </div>
      ) : null}

      <div className="drive-security">
        <span>🔒 Un seul Drive est connecté à l’équipe</span>
        <span>Le staff autorisé voit les vidéos sans accéder au compte Google ni au token du coach</span>
      </div>

      <style jsx>{`
        .drive-card{margin-bottom:20px;border:1px solid #eadfd5;border-radius:18px;background:#fff;box-shadow:0 10px 26px rgba(50,31,23,.04);overflow:hidden}
        .drive-top{display:flex;align-items:center;justify-content:space-between;gap:22px;padding:18px 20px 14px}
        .drive-intro{min-width:0}.drive-title{display:flex;align-items:center;gap:11px}.drive-title>div{display:grid;gap:2px}
        .eyebrow{color:#d4a24c;font-size:.62rem;font-weight:950;letter-spacing:.11em;text-transform:uppercase}
        strong{color:#2c211d;font-size:.9rem}.drive-intro p{max-width:660px;margin:7px 0 0 45px;color:#746761;font-size:.72rem;line-height:1.5}
        .connected-copy{display:block;margin:6px 0 0 45px;color:#6b1a2c;font-size:.68rem}
        .drive-status{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap}
        .status{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 11px;border-radius:999px;font-size:.68rem;font-weight:850}
        .status.neutral{background:#f7f2ed;color:#81726b}.status.connected{background:#eef7ef;color:#3d7048}.status i{width:7px;height:7px;border-radius:50%;background:#4b9a5a}
        button{font-family:inherit;cursor:pointer}.primary,.secondary{min-height:36px;border-radius:999px;padding:0 14px;font-weight:900}
        .primary{border:1px solid #6b1a2c;background:#6b1a2c;color:#fff}.secondary{border:1px solid #dfd3cb;background:#fff;color:#6b1a2c}.danger{color:#a21f32}
        button:disabled{opacity:.55;cursor:default}
        .drive-status :global(.gdrive-picker){display:inline-flex}.drive-status :global(.gdrive-picker button){min-height:36px;border:1px solid #dfd3cb;border-radius:999px;padding:0 14px;background:#fff;color:#2c211d;font-weight:900}
        .video-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:4px 20px 18px}
        .video-tile{min-width:0;border:1px solid #eee3dc;border-radius:12px;background:#fff;overflow:hidden;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
        .video-tile:hover{transform:translateY(-2px);box-shadow:0 9px 22px rgba(44,33,29,.09)}.video-tile.active{border-color:#6b1a2c}
        .thumb-button{position:relative;display:block;width:100%;aspect-ratio:16/9;padding:0;border:0;background:#161616;overflow:hidden}
        .video-thumb{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;background:linear-gradient(135deg,#1b1b1b,#3a2529)}
        .play-badge{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,.68);color:#fff;font-size:13px;padding-left:2px;opacity:.9}
        .tile-info{padding:9px 10px 8px}.tile-info>strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem}
        .tile-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:5px;color:#8b7c74;font-size:.62rem}
        .more{display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:50%;background:transparent;color:#6b1a2c;font-size:18px;line-height:1}.more:hover{background:#f7edef}
        .player-wrap{margin:0 20px 18px;padding:12px;border:1px solid #eee3dc;border-radius:14px;background:#fffaf5}
        .player-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.player-head strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .drive-player{display:block;width:100%;max-height:560px;border-radius:11px;background:#111}
        .drive-security{display:flex;align-items:center;justify-content:center;gap:12px 24px;flex-wrap:wrap;padding:9px 20px;border-top:1px solid #f0e7e1;background:#fffaf5;color:#806e65;font-size:.63rem}
        @media(max-width:1050px){.video-strip{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:760px){.drive-top{align-items:flex-start;flex-direction:column}.drive-intro p,.connected-copy{margin-left:0}.drive-status{justify-content:flex-start}.video-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:480px){.video-strip{grid-template-columns:1fr}.player-head{align-items:flex-start;flex-direction:column}}
      `}</style>
    </section>
  );
}
