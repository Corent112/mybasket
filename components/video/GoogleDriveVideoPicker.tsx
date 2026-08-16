"use client";

import { useEffect, useRef, useState } from "react";
import type { GoogleDrivePickedVideo } from "@/lib/google-drive/client";

type Props = {
  teamId: string;
  disabled?: boolean;
  compact?: boolean;
  selectedName?: string | null;
  className?: string;
  label?: string;
  onPicked: (file: GoogleDrivePickedVideo) => void;
};

type DriveEntry = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string | null;
  size?: string | null;
  webViewLink?: string | null;
};

type FolderLevel = {
  id: string;
  name: string;
};

type CachedFolder = {
  files: DriveEntry[];
  cachedAt: number;
};

const DRIVE_FOLDER_CACHE = new Map<string, CachedFolder>();
const DRIVE_FOLDER_CACHE_TTL = 90_000;

function formatSize(raw?: string | null) {
  const bytes = Number(raw || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function isFolder(file: DriveEntry) {
  return file.mimeType === "application/vnd.google-apps.folder";
}

export default function GoogleDriveVideoPicker({
  teamId,
  disabled,
  compact,
  selectedName,
  className,
  label,
  onPicked,
}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [configIssue, setConfigIssue] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [files, setFiles] = useState<DriveEntry[]>([]);
  const [error, setError] = useState("");
  const [stack, setStack] = useState<FolderLevel[]>([{ id: "root", name: "Mon Drive" }]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    const load = async () => {
      if (!teamId) return;

      try {
        const response = await fetch(
          `/api/google-drive/status?teamId=${encodeURIComponent(teamId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json();

        if (!alive.current) return;

        setConnected(Boolean(payload.connected));
        setConfigIssue(
          payload.configured === false
            ? String(payload.reason || "Google Drive n'est pas configuré côté serveur.")
            : null,
        );
      } catch {
        if (alive.current) setConnected(false);
      }
    };

    void load();

    return () => {
      alive.current = false;
    };
  }, [teamId]);

  const connect = () => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href =
      `/api/google-drive/connect?teamId=${encodeURIComponent(teamId)}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;
  };

  const loadFolder = async (folderId: string, force = false) => {
    const cacheKey = `${teamId}:${folderId}`;
    const cached = DRIVE_FOLDER_CACHE.get(cacheKey);

    if (!force && cached && Date.now() - cached.cachedAt < DRIVE_FOLDER_CACHE_TTL) {
      setFiles(cached.files);
      setError("");
      setLoadingFiles(false);
      setBusy(false);
      return;
    }

    setLoadingFiles(true);
    setError("");

    try {
      const response = await fetch(
        `/api/google-drive/browse?teamId=${encodeURIComponent(teamId)}` +
          `&folderId=${encodeURIComponent(folderId)}`,
        { cache: "no-store" },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload?.code === "scope_upgrade_required") {
          setOpen(false);
          const shouldReconnect = window.confirm(
            "MyBasket a besoin d'une autorisation Google Drive mise à jour pour afficher tes dossiers et vidéos. Réautoriser Google Drive maintenant ?",
          );
          if (shouldReconnect) connect();
          return;
        }
        throw new Error(payload?.error || "Impossible de lire Google Drive.");
      }

      const nextFiles = Array.isArray(payload.files) ? payload.files : [];
      DRIVE_FOLDER_CACHE.set(cacheKey, { files: nextFiles, cachedAt: Date.now() });
      setFiles(nextFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de lire Google Drive.");
    } finally {
      setLoadingFiles(false);
      setBusy(false);
    }
  };

  const openDrive = async () => {
    if (!teamId || disabled || busy) return;

    if (configIssue) {
      window.alert(`Google Drive indisponible : ${configIssue}`);
      return;
    }

    if (!connected) {
      connect();
      return;
    }

    setBusy(true);
    setStack([{ id: "root", name: "Mon Drive" }]);
    setOpen(true);
    await loadFolder("root");
  };

  const enterFolder = async (file: DriveEntry) => {
    setStack((current) => [...current, { id: file.id, name: file.name }]);
    await loadFolder(file.id);
  };

  const goToLevel = async (index: number) => {
    const level = stack[index];
    if (!level) return;
    setStack((current) => current.slice(0, index + 1));
    await loadFolder(level.id);
  };

  const chooseVideo = (file: DriveEntry) => {
    onPicked({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      url: file.webViewLink || undefined,
    });
    setOpen(false);
    setFiles([]);
  };

  const text = busy
    ? "Ouverture…"
    : label
      ? label
      : connected
        ? "Choisir dans Google Drive"
        : "Connecter Google Drive";

  const button = (
    <button
      type="button"
      className={className}
      onClick={() => void openDrive()}
      disabled={disabled || busy}
      title={configIssue ?? undefined}
    >
      ☁️ {configIssue ? "Google Drive indisponible" : text}
    </button>
  );

  return (
    <>
      {className ? (
        button
      ) : (
        <div className={`gdrive-picker ${compact ? "compact" : ""}`}>
          {button}
          {!compact && selectedName && <span>✓ {selectedName}</span>}
        </div>
      )}

      {open ? (
        <div className="drive-browser-backdrop" role="presentation">
          <section
            className="drive-browser"
            role="dialog"
            aria-modal="true"
            aria-label="Choisir une vidéo dans Google Drive"
          >
            <header className="browser-head">
              <div>
                <span className="browser-kicker">Google Drive</span>
                <h2>Choisir une vidéo</h2>
                <p>La vidéo reste dans ton Drive. MyBasket ne la copie pas.</p>
              </div>
              <button
                type="button"
                className="close-browser"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            <nav className="breadcrumbs" aria-label="Dossier Google Drive">
              {stack.map((level, index) => (
                <span key={`${level.id}-${index}`}>
                  {index > 0 ? <b>›</b> : null}
                  <button type="button" onClick={() => void goToLevel(index)}>
                    {level.name}
                  </button>
                </span>
              ))}
            </nav>

            <div className="browser-body">
              {loadingFiles ? (
                <div className="browser-state">Chargement de Google Drive…</div>
              ) : error ? (
                <div className="browser-error">{error}</div>
              ) : files.length === 0 ? (
                <div className="browser-state">
                  Aucun dossier ou fichier vidéo dans ce dossier.
                </div>
              ) : (
                <div className="file-list">
                  {files.map((file) => {
                    const folder = isFolder(file);
                    return (
                      <button
                        type="button"
                        key={file.id}
                        className={`file-row ${folder ? "folder" : "video"}`}
                        onClick={() =>
                          folder ? void enterFolder(file) : chooseVideo(file)
                        }
                      >
                        <span className="file-icon" aria-hidden="true">
                          {folder ? "📁" : "🎬"}
                        </span>
                        <span className="file-main">
                          <strong>{file.name}</strong>
                          <small>
                            {folder
                              ? "Dossier"
                              : [formatSize(file.size), file.mimeType]
                                  .filter(Boolean)
                                  .join(" · ")}
                          </small>
                        </span>
                        <span className="file-action">
                          {folder ? "Ouvrir ›" : "Choisir"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="browser-footer">
              <span>🔒 Accès en lecture seule au Drive connecté à l’équipe</span>
              <div className="browser-footer-actions">
                <button
                  type="button"
                  onClick={() => void loadFolder(stack[stack.length - 1]?.id || "root", true)}
                >
                  ↻ Actualiser
                </button>
                <button type="button" onClick={() => setOpen(false)}>
                  Annuler
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .drive-browser-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          display: grid;
          place-items: center;
          padding: 24px;
          background: rgba(26, 20, 18, 0.58);
          backdrop-filter: blur(4px);
        }

        .drive-browser {
          width: min(980px, 94vw);
          height: min(720px, 88vh);
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr) auto;
          overflow: hidden;
          border: 1px solid #eadfd5;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.32);
          color: #2a211e;
        }

        .browser-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 20px 22px 16px;
          border-bottom: 1px solid #eee4dc;
        }

        .browser-kicker {
          color: #d4a24c;
          font-size: 0.7rem;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .browser-head h2 {
          margin: 4px 0 4px;
          color: #6b1a2c;
          font-size: 1.35rem;
        }

        .browser-head p {
          margin: 0;
          color: #7f716a;
          font-size: 0.78rem;
        }

        .close-browser {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          border: 1px solid #eadfd5;
          border-radius: 50%;
          background: #fff;
          color: #6b1a2c;
          font-size: 1.35rem;
          cursor: pointer;
        }

        .breadcrumbs {
          display: flex;
          align-items: center;
          gap: 7px;
          min-height: 48px;
          padding: 0 22px;
          overflow-x: auto;
          border-bottom: 1px solid #f1e8e1;
          background: #fffaf5;
          white-space: nowrap;
        }

        .breadcrumbs span {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }

        .breadcrumbs b {
          color: #b5a49a;
        }

        .breadcrumbs button {
          border: 0;
          background: transparent;
          color: #6b1a2c;
          font-weight: 850;
          cursor: pointer;
        }

        .browser-body {
          min-height: 0;
          overflow-y: auto;
          padding: 14px 18px;
        }

        .browser-state,
        .browser-error {
          display: grid;
          place-items: center;
          min-height: 260px;
          border: 1px dashed #e5d8cf;
          border-radius: 14px;
          color: #81726a;
          text-align: center;
        }

        .browser-error {
          color: #a72d3f;
          background: #fff7f7;
        }

        .file-list {
          display: grid;
          gap: 7px;
        }

        .file-row {
          width: 100%;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          align-items: center;
          gap: 11px;
          min-height: 64px;
          padding: 8px 12px;
          border: 1px solid #eee4dc;
          border-radius: 12px;
          background: #fff;
          text-align: left;
          cursor: pointer;
        }

        .file-row:hover {
          border-color: #d4a24c;
          background: #fffaf5;
        }

        .file-icon {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: #f8f3ee;
          font-size: 1.2rem;
        }

        .file-main {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .file-main strong {
          overflow: hidden;
          color: #2a211e;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-main small {
          color: #8a7b73;
          font-size: 0.7rem;
        }

        .file-action {
          color: #6b1a2c;
          font-size: 0.72rem;
          font-weight: 900;
        }

        .browser-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 13px 20px;
          border-top: 1px solid #eee4dc;
          background: #fffaf5;
          color: #7e7068;
          font-size: 0.7rem;
        }

        .browser-footer-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .browser-footer button {
          min-height: 34px;
          padding: 0 14px;
          border: 1px solid #dfd3cb;
          border-radius: 999px;
          background: #fff;
          color: #6b1a2c;
          font-weight: 900;
          cursor: pointer;
        }

        @media (max-width: 680px) {
          .drive-browser-backdrop {
            padding: 8px;
          }

          .drive-browser {
            width: 100%;
            height: 94vh;
          }

          .file-row {
            grid-template-columns: 38px minmax(0, 1fr);
          }

          .file-action {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
