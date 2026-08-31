"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setVideoRootFolder } from "@/lib/video/video-root-folder";
import {
  addVideoFolder,
  forgetVideoFolder,
  grantVideoLibraryAccess,
  refreshVideoLibraryIndex,
  supportsVideoLibrary,
  videoLibraryStatus,
  type VideoLibraryStatus,
} from "@/lib/video/video-library";

export default function VideoMatchFolderModule() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoLibraryStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const connected = status?.state === "granted";
  const folderName = useMemo(() => {
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
      await refreshStatus(id);
    })();

    return () => {
      active = false;
    };
  }, [refreshStatus]);

  const chooseRootFolder = async () => {
    setBusy(true);

    try {
      // Un seul dossier racine par utilisateur/navigateur.
      if (status && "folders" in status) {
        await Promise.all(status.folders.map((folder) => forgetVideoFolder(folder.id)));
      }

      const added = await addVideoFolder(ownerId);

      if (added) {
        // Le nom du vrai dossier choisi devient aussi la référence du compte.
        await setVideoRootFolder(added.name);
        refreshVideoLibraryIndex();
      }

      await refreshStatus(ownerId);
    } finally {
      setBusy(false);
    }
  };

  const reconnectRootFolder = async () => {
    setBusy(true);

    try {
      const ok = await grantVideoLibraryAccess(ownerId);
      if (ok) refreshVideoLibraryIndex();
      await refreshStatus(ownerId);
    } finally {
      setBusy(false);
    }
  };

  const mainAction = async () => {
    if (status?.state === "prompt") {
      await reconnectRootFolder();
      return;
    }

    await chooseRootFolder();
  };

  const actionLabel =
    status?.state === "prompt"
      ? "🔓 Reconnecter le dossier"
      : connected
        ? "📁 Changer le dossier racine"
        : "📁 Choisir le dossier racine";

  return (
    <section className="vmf-card" aria-label="Dossier racine des matchs">
      <div className="vmf-head">
        <div>
          <h3>📁 Dossier des vidéos de matchs</h3>
          <p>
            Choisis une seule fois le dossier principal dans lequel tu ranges tes vidéos de matchs.
          </p>
        </div>

        {connected && <span className="vmf-badge ok">Connecté</span>}
        {status?.state === "prompt" && <span className="vmf-badge warn">À reconnecter</span>}
      </div>

      <div className={`vmf-root ${connected ? "connected" : ""}`}>
        <div className="vmf-root-left">
          <span className="vmf-folder">📁</span>
          <div>
            <span>Dossier racine</span>
            <strong>
              {folderName ||
                (status?.state === "prompt"
                  ? "Dossier mémorisé"
                  : "Aucun dossier choisi")}
            </strong>
          </div>
        </div>

        {connected && <span className="vmf-check">✓</span>}
      </div>

      <div className="vmf-bottom">
        <div className="vmf-info">
          {connected ? (
            <>
              <strong>✓ MyBasket cherchera automatiquement les vidéos ici.</strong>
              <span>Tu peux créer autant de sous-dossiers que tu veux à l’intérieur.</span>
            </>
          ) : status?.state === "prompt" ? (
            <>
              <strong>Le dossier est mémorisé.</strong>
              <span>Un clic suffit pour redonner l’accès à MyBasket.</span>
            </>
          ) : status?.state === "unsupported" ? (
            <>
              <strong>Accès automatique non disponible dans ce navigateur.</strong>
              <span>La vidéo pourra toujours être sélectionnée manuellement.</span>
            </>
          ) : (
            <>
              <strong>Aucun dossier racine défini.</strong>
              <span>Choisis le dossier qui contient tes matchs.</span>
            </>
          )}
        </div>

        {supportsVideoLibrary() && status?.state !== "unsupported" && (
          <button
            type="button"
            className="vmf-action"
            onClick={mainAction}
            disabled={busy}
          >
            {busy ? "…" : actionLabel}
          </button>
        )}
      </div>

      <small className="vmf-privacy">
        Les vidéos restent sur ton ordinateur. Elles ne sont pas envoyées dans Supabase.
      </small>

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

        .vmf-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .vmf-head h3 {
          margin: 0;
          font-size: 20px;
          line-height: 1.25;
          font-weight: 900;
          color: #241f20;
        }

        .vmf-head p {
          margin: 7px 0 0;
          max-width: 590px;
          color: #6f6869;
          font-size: 13px;
          line-height: 1.5;
        }

        .vmf-badge {
          flex: 0 0 auto;
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 900;
        }

        .vmf-badge.ok {
          background: #ddf5e5;
          color: #1d7b42;
        }

        .vmf-badge.warn {
          background: #fff2d7;
          color: #9a6612;
        }

        .vmf-root {
          margin-top: 18px;
          min-height: 64px;
          padding: 12px 15px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          border: 1px solid #e8e3e1;
          border-radius: 11px;
          background: #fafafa;
        }

        .vmf-root.connected {
          background: #fbfdfb;
        }

        .vmf-root-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .vmf-folder {
          font-size: 20px;
        }

        .vmf-root-left div {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .vmf-root-left span:not(.vmf-folder) {
          color: #817a7b;
          font-size: 11px;
          font-weight: 700;
        }

        .vmf-root-left strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #2e292a;
          font-size: 14px;
          font-weight: 900;
        }

        .vmf-check {
          flex: 0 0 auto;
          width: 25px;
          height: 25px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #dff4e6;
          color: #188246;
          font-size: 14px;
          font-weight: 1000;
        }

        .vmf-bottom {
          margin-top: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .vmf-info {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .vmf-info strong {
          color: #423b3d;
          font-size: 12px;
          font-weight: 850;
        }

        .vmf-info span {
          color: #827a7b;
          font-size: 11px;
        }

        .vmf-action {
          flex: 0 0 auto;
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid #cdb8b9;
          border-radius: 9px;
          background: #fff;
          color: #7d1428;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .vmf-action:hover {
          background: #fff7f8;
        }

        .vmf-action:disabled {
          opacity: 0.55;
          cursor: wait;
        }

        .vmf-privacy {
          display: block;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid #f0ecea;
          color: #8c8586;
          font-size: 10px;
        }

        @media (max-width: 720px) {
          .vmf-card {
            padding: 18px;
          }

          .vmf-bottom {
            align-items: stretch;
            flex-direction: column;
          }

          .vmf-action {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
