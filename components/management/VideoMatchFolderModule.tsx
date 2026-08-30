"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getVideoRootFolder,
  readCachedVideoRootFolder,
  setVideoRootFolder,
} from "@/lib/video/video-root-folder";
import {
  addVideoFolder,
  forgetVideoFolder,
  grantVideoLibraryAccess,
  refreshVideoLibraryIndex,
  supportsVideoLibrary,
  videoLibraryStatus,
  type VideoLibraryStatus,
} from "@/lib/video/video-library";

const PLACEHOLDER = "~/Movies/MyBasket";

export default function VideoMatchFolderModule() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [rootFolder, setRootFolder] = useState(readCachedVideoRootFolder());
  const [status, setStatus] = useState<VideoLibraryStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "error">("idle");

  const connected = status?.state === "granted";
  const knownFolderName = useMemo(() => {
    if (!status || !("folders" in status) || !status.folders.length) return "";
    return status.folders[0]?.name || "";
  }, [status]);

  const refreshStatus = useCallback(async (id: string | null) => {
    setStatus(await videoLibraryStatus(id));
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      let id: string | null = null;
      try {
        const { data } = await createClient().auth.getUser();
        id = data?.user?.id ?? null;
      } catch {
        id = null;
      }

      if (!active) return;
      setOwnerId(id);

      const [folder, currentStatus] = await Promise.all([
        getVideoRootFolder(),
        videoLibraryStatus(id),
      ]);

      if (!active) return;
      if (folder) setRootFolder(folder);
      setStatus(currentStatus);
    })();

    return () => {
      active = false;
    };
  }, []);

  const saveReference = async () => {
    setSaving(true);
    setSaved("idle");
    const ok = await setVideoRootFolder(rootFolder);
    setSaving(false);
    setSaved(ok ? "ok" : "error");
    window.setTimeout(() => setSaved("idle"), 2200);
  };

  const chooseFolder = async () => {
    setBusy(true);
    try {
      const added = await addVideoFolder(ownerId);
      if (!added) return;

      // Le vrai nom du dossier choisi devient aussi la référence affichée si
      // l'utilisateur n'avait rien renseigné jusque-là.
      if (!rootFolder.trim()) {
        setRootFolder(added.name);
        await setVideoRootFolder(added.name);
      }

      refreshVideoLibraryIndex();
      await refreshStatus(ownerId);
    } finally {
      setBusy(false);
    }
  };

  const reconnectFolder = async () => {
    setBusy(true);
    try {
      const ok = await grantVideoLibraryAccess(ownerId);
      if (ok) refreshVideoLibraryIndex();
      await refreshStatus(ownerId);
    } finally {
      setBusy(false);
    }
  };

  const changeFolder = async () => {
    setBusy(true);
    try {
      if (status && "folders" in status) {
        await Promise.all(status.folders.map((folder) => forgetVideoFolder(folder.id)));
      }

      const added = await addVideoFolder(ownerId);
      if (added) {
        refreshVideoLibraryIndex();
        await refreshStatus(ownerId);
      } else {
        await refreshStatus(ownerId);
      }
    } finally {
      setBusy(false);
    }
  };

  const action = async () => {
    if (status?.state === "prompt") return reconnectFolder();
    if (status?.state === "granted") return changeFolder();
    return chooseFolder();
  };

  const buttonLabel =
    status?.state === "granted"
      ? "📁 Changer de dossier"
      : status?.state === "prompt"
        ? "🔓 Reconnecter le dossier"
        : "📁 Choisir mon dossier de matchs";

  return (
    <section className="vmf-card" aria-label="Dossier des vidéos de matchs">
      <div className="vmf-title-row">
        <div>
          <h3>📁 Dossier des vidéos de matchs</h3>
          <p>
            MyBasket utilise ce dossier pour retrouver automatiquement les vidéos
            lorsque tu ouvres un match ou un clip.
          </p>
        </div>

        {status?.state === "granted" && <span className="vmf-badge ok">Connecté</span>}
        {status?.state === "prompt" && <span className="vmf-badge warn">À reconnecter</span>}
        {status?.state === "empty" && <span className="vmf-badge">Non connecté</span>}
      </div>

      <div className="vmf-reference">
        <label htmlFor="vmf-root-folder">Dossier racine déclaré</label>
        <div className="vmf-reference-row">
          <span className="vmf-folder-icon" aria-hidden="true">📁</span>
          <input
            id="vmf-root-folder"
            value={rootFolder}
            placeholder={PLACEHOLDER}
            onChange={(event) => setRootFolder(event.target.value)}
            spellCheck={false}
          />
          <button type="button" onClick={saveReference} disabled={saving}>
            {saving ? "…" : "Enregistrer"}
          </button>
        </div>
        {saved === "ok" && <small className="vmf-save-state ok">✓ Enregistré sur ton compte MyBasket.</small>}
        {saved === "error" && <small className="vmf-save-state err">Enregistrement impossible.</small>}
      </div>

      <div className="vmf-bottom">
        <div className="vmf-status-line">
          <span className={connected ? "vmf-dot connected" : "vmf-dot"} />
          <div>
            <strong>
              {connected
                ? `Dossier autorisé${knownFolderName ? ` : ${knownFolderName}` : ""}`
                : status?.state === "prompt"
                  ? "Le dossier est mémorisé mais doit être reconnecté"
                  : status?.state === "unsupported"
                    ? "Accès automatique au dossier non disponible dans ce navigateur"
                    : "Aucun dossier local autorisé sur ce navigateur"}
            </strong>
            <span>
              Les vidéos restent sur ton ordinateur : aucun fichier vidéo n’est envoyé dans Supabase.
            </span>
          </div>
        </div>

        {supportsVideoLibrary() && status?.state !== "unsupported" && (
          <button type="button" className="vmf-action" onClick={action} disabled={busy}>
            {busy ? "…" : buttonLabel}
          </button>
        )}
      </div>

      {status?.state === "unsupported" && (
        <p className="vmf-browser-note">
          Le dossier déclaré reste enregistré sur ton compte. Sur ce navigateur,
          MyBasket utilisera la sélection manuelle du fichier lorsque nécessaire.
        </p>
      )}

      <style jsx>{`
        .vmf-card {
          width: min(100%, 760px);
          margin: 18px auto 0;
          padding: 22px 24px;
          background: #fff;
          border: 1px solid #eee3df;
          border-radius: 16px;
          box-shadow: 0 7px 22px rgba(72, 25, 31, 0.07);
          color: #231f20;
        }

        .vmf-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .vmf-title-row h3 {
          margin: 0;
          font-size: 20px;
          line-height: 1.25;
          font-weight: 900;
          color: #241f20;
        }

        .vmf-title-row p {
          margin: 7px 0 0;
          max-width: 580px;
          color: #6f6869;
          font-size: 13px;
          line-height: 1.55;
        }

        .vmf-badge {
          flex: 0 0 auto;
          padding: 5px 9px;
          border-radius: 999px;
          background: #f0f0f0;
          color: #6d6768;
          font-size: 11px;
          font-weight: 900;
        }

        .vmf-badge.ok {
          background: #ddf5e5;
          color: #1d7b42;
        }

        .vmf-badge.warn {
          background: #fff1cf;
          color: #8a6418;
        }

        .vmf-reference {
          margin-top: 17px;
        }

        .vmf-reference label {
          display: block;
          margin: 0 0 6px;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #6b1a2c;
        }

        .vmf-reference-row {
          display: flex;
          align-items: center;
          gap: 9px;
          min-height: 48px;
          padding: 7px 8px 7px 12px;
          border: 1px solid #ded9d8;
          border-radius: 11px;
          background: #fafafa;
        }

        .vmf-folder-icon {
          font-size: 18px;
        }

        .vmf-reference-row input {
          flex: 1;
          min-width: 120px;
          border: 0;
          outline: 0;
          background: transparent;
          color: #272223;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 13px;
          font-weight: 700;
        }

        .vmf-reference-row button,
        .vmf-action {
          border: 1px solid #6b1a2c;
          border-radius: 9px;
          background: #fff;
          color: #6b1a2c;
          padding: 9px 13px;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
        }

        .vmf-reference-row button:hover:not(:disabled),
        .vmf-action:hover:not(:disabled) {
          background: #6b1a2c;
          color: #fff;
        }

        button:disabled {
          opacity: 0.55;
          cursor: wait;
        }

        .vmf-save-state {
          display: block;
          margin-top: 6px;
          font-size: 11px;
          font-weight: 800;
        }

        .vmf-save-state.ok { color: #267946; }
        .vmf-save-state.err { color: #a12d35; }

        .vmf-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          margin-top: 16px;
          padding-top: 15px;
          border-top: 1px solid #eee8e6;
        }

        .vmf-status-line {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          min-width: 0;
        }

        .vmf-dot {
          flex: 0 0 auto;
          width: 9px;
          height: 9px;
          margin-top: 4px;
          border-radius: 50%;
          background: #b9b5b5;
        }

        .vmf-dot.connected {
          background: #32a45d;
          box-shadow: 0 0 0 3px #e1f4e7;
        }

        .vmf-status-line strong,
        .vmf-status-line span {
          display: block;
        }

        .vmf-status-line strong {
          color: #393334;
          font-size: 12px;
          line-height: 1.35;
        }

        .vmf-status-line span {
          margin-top: 3px;
          color: #777071;
          font-size: 11px;
          line-height: 1.45;
        }

        .vmf-browser-note {
          margin: 13px 0 0;
          padding: 10px 12px;
          border-radius: 9px;
          background: #f7f4f3;
          color: #686162;
          font-size: 11px;
          line-height: 1.5;
        }

        @media (max-width: 700px) {
          .vmf-card {
            padding: 18px;
          }

          .vmf-title-row,
          .vmf-bottom {
            flex-direction: column;
          }

          .vmf-reference-row {
            flex-wrap: wrap;
          }

          .vmf-reference-row input {
            flex-basis: calc(100% - 34px);
          }

          .vmf-reference-row button,
          .vmf-action {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
