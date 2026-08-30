"use client";

/**
 * components/video/VideoLibraryButton.tsx
 * ---------------------------------------------------------------------------
 * Reconnexion en UN clic du dossier vidéos local.
 *
 * Ce bouton s'affiche là où une vidéo n'a pas pu être retrouvée. Il évite de
 * re-sélectionner le fichier match par match : on autorise UNE fois le dossier
 * qui contient les vidéos, et tous les projets présents et futurs y puisent.
 *
 * Le dossier est mémorisé par compte MyBasket (voir lib/video/video-library.ts),
 * donc sur un ordinateur partagé chaque coach ne voit que le sien.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getVideoRootFolder, readCachedVideoRootFolder } from "@/lib/video/video-root-folder";
import {
  addVideoFolder,
  grantVideoLibraryAccess,
  refreshVideoLibraryIndex,
  supportsVideoLibrary,
  videoLibraryStatus,
  type VideoLibraryStatus,
} from "@/lib/video/video-library";

type Props = {
  /** Appelé après une reconnexion réussie : relance la résolution de la vidéo. */
  onReconnected?: () => void;
  compact?: boolean;
};

export default function VideoLibraryButton({ onReconnected, compact }: Props) {
  const [status, setStatus] = useState<VideoLibraryStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [rootFolder, setRootFolder] = useState(readCachedVideoRootFolder());

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
      setStatus(await videoLibraryStatus(id));
      const folder = await getVideoRootFolder();
      if (active && folder) setRootFolder(folder);
    })();
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setStatus(await videoLibraryStatus(ownerId));
  }, [ownerId]);

  const onGrant = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await grantVideoLibraryAccess(ownerId);
      refreshVideoLibraryIndex();
      await refresh();
      if (ok) onReconnected?.();
    } finally {
      setBusy(false);
    }
  }, [ownerId, onReconnected, refresh]);

  const onAdd = useCallback(async () => {
    setBusy(true);
    try {
      const added = await addVideoFolder(ownerId);
      refreshVideoLibraryIndex();
      await refresh();
      if (added) onReconnected?.();
    } finally {
      setBusy(false);
    }
  }, [ownerId, onReconnected, refresh]);

  if (!status) return null;

  if (status.state === "unsupported") {
    if (compact) return null;
    return (
      <p className="mb-vlib-note">
        Ton navigateur ne sait pas mémoriser un dossier local. Pour que la vidéo
        se recharge toute seule d’un projet à l’autre, ouvre MyBasket dans
        Chrome ou Edge. {supportsVideoLibrary() ? "" : ""}
      </p>
    );
  }

  const label =
    status.state === "empty"
      ? "📁 Autoriser mon dossier vidéos"
      : status.state === "prompt"
      ? "🔓 Reconnecter mon dossier vidéos"
      : "📁 Ajouter un autre dossier";

  const action = status.state === "prompt" ? onGrant : onAdd;

  return (
    <div className="mb-vlib">
      {rootFolder && !compact && (
        <p className="mb-vlib-note">
          Dossier des matchs : <code>{rootFolder}</code>
        </p>
      )}

      <button type="button" className="mb-vlib-btn" onClick={action} disabled={busy}>
        {busy ? "…" : label}
      </button>

      {status.state === "empty" && !compact && (
        <p className="mb-vlib-note">
          Autorise une fois le dossier qui contient tes vidéos de match : tous
          tes projets, présents et futurs, la retrouveront ensuite tout seuls.
          Rien n’est copié ni envoyé sur Internet.
        </p>
      )}

      {status.state === "prompt" && !compact && (
        <p className="mb-vlib-note">
          {status.folders.map((f) => f.name).join(", ")} — le navigateur redemande
          l’autorisation à chaque redémarrage. Un clic suffit pour toute la session.
        </p>
      )}

      {status.state === "granted" && !compact && (
        <p className="mb-vlib-note ok">
          ✓ Dossier connecté : {status.folders.map((f) => f.name).join(", ")}
        </p>
      )}

      <style jsx>{`
        .mb-vlib {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          align-items: center;
        }
        .mb-vlib-btn {
          border: 2px solid #6b1a2c;
          background: #6b1a2c;
          color: #fff;
          border-radius: 999px;
          padding: 0.55rem 1.1rem;
          font-weight: 800;
          font-size: 0.9rem;
          cursor: pointer;
        }
        .mb-vlib-btn:hover:not(:disabled) {
          background: #4a0f1e;
        }
        .mb-vlib-btn:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .mb-vlib-note {
          margin: 0;
          max-width: 460px;
          text-align: center;
          font-size: 0.82rem;
          line-height: 1.45;
          color: #666;
        }
        .mb-vlib-note.ok {
          color: #2f7a3f;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
