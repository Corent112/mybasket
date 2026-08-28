"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildLocalVideoDescriptor,
  descriptorMatches,
  type LocalVideoDescriptor,
} from "@/lib/video/local-project-video";
import {
  clearLocalVideoHandle,
  getLocalVideoHandle,
  openAndRememberLocalVideo,
  rememberLocalVideoHandle,
  type StoredLocalVideoHandle,
} from "@/lib/video/local-video-handle";

export type LocalProjectVideoValue = {
  file: File;
  objectUrl: string;
  descriptor: LocalVideoDescriptor;
};

type Props = {
  projectId: string;
  expected?: LocalVideoDescriptor | null;
  onLinked: (v: LocalProjectVideoValue) => void;
  onUnlinked?: () => void;
};

type PermissionStateLike = "granted" | "denied" | "prompt" | "unsupported";

async function handlePermission(
  handle: StoredLocalVideoHandle,
  request = false,
): Promise<PermissionStateLike> {
  try {
    if (typeof handle?.queryPermission !== "function") return "unsupported";

    let state = await handle.queryPermission({ mode: "read" });
    if (state === "granted") return "granted";

    if (request && typeof handle.requestPermission === "function") {
      state = await handle.requestPermission({ mode: "read" });
      if (state === "granted") return "granted";
    }

    return state === "denied" ? "denied" : "prompt";
  } catch {
    return "denied";
  }
}

export default function LocalProjectVideoPicker({
  projectId,
  expected,
  onLinked,
  onUnlinked,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const [linked, setLinked] = useState<LocalProjectVideoValue | null>(null);
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const [rememberedHandle, setRememberedHandle] =
    useState<StoredLocalVideoHandle | null>(null);
  const [permissionNeeded, setPermissionNeeded] = useState(false);

  function revokeCurrentUrl() {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }

  async function linkFile(
    file: File,
    options?: { persistDescriptor?: boolean },
  ) {
    setBusy(true);
    setWarning("");

    try {
      const descriptor = await buildLocalVideoDescriptor(file);

      if (expected && !descriptorMatches(expected, descriptor)) {
        setWarning(
          "Cette vidéo semble différente de celle utilisée pour coder le projet.",
        );
      }

      revokeCurrentUrl();

      const objectUrl = URL.createObjectURL(file);
      urlRef.current = objectUrl;

      const value: LocalProjectVideoValue = {
        file,
        objectUrl,
        descriptor,
      };

      if (!mountedRef.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      setLinked(value);
      setPermissionNeeded(false);
      onLinked(value);

      if (options?.persistDescriptor !== false) {
        try {
          localStorage.setItem(
            `mybasket_local_video_descriptor_${projectId}`,
            JSON.stringify(descriptor),
          );
        } catch {}
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  async function restoreRememberedVideo(handle: StoredLocalVideoHandle) {
    const permission = await handlePermission(handle, false);

    if (permission !== "granted") {
      if (mountedRef.current) {
        setRememberedHandle(handle);
        setPermissionNeeded(permission === "prompt");
      }
      return;
    }

    try {
      const file = await handle.getFile();
      await linkFile(file, { persistDescriptor: false });
    } catch {
      if (mountedRef.current) {
        setWarning(
          "La vidéo mémorisée n'est plus accessible. Relie-la de nouveau si elle a été déplacée ou renommée.",
        );
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      const handle = await getLocalVideoHandle(projectId);
      if (cancelled || !handle) return;

      setRememberedHandle(handle);
      await restoreRememberedVideo(handle);
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      revokeCurrentUrl();
    };
    // Le projectId identifie le projet vidéo à restaurer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function chooseWithPersistentPicker() {
    setBusy(true);
    setWarning("");

    try {
      const result = await openAndRememberLocalVideo(projectId);

      if (!result) {
        // File System Access API non disponible : fallback input classique.
        inputRef.current?.click();
        return;
      }

      setRememberedHandle(result.handle);
      await linkFile(result.file);
    } catch (error: any) {
      // Annulation utilisateur : aucun message d'erreur nécessaire.
      if (error?.name !== "AbortError") {
        setWarning(
          "Impossible d'ouvrir cette vidéo. Tu peux réessayer ou utiliser le sélecteur de fichier.",
        );
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  async function chooseFallback(file: File | null) {
    if (!file) return;

    // Un <input type=file> ne fournit pas de FileSystemFileHandle.
    // On garde donc le fonctionnement historique sur les navigateurs
    // ne supportant pas le sélecteur persistant.
    await linkFile(file);

    if (inputRef.current) inputRef.current.value = "";
  }

  async function authorizeRememberedVideo() {
    if (!rememberedHandle) return;

    setBusy(true);
    setWarning("");

    try {
      const permission = await handlePermission(rememberedHandle, true);

      if (permission !== "granted") {
        setWarning(
          "L'accès à cette vidéo n'a pas été autorisé. Clique sur « Relier la vidéo » pour la sélectionner de nouveau.",
        );
        return;
      }

      await rememberLocalVideoHandle(projectId, rememberedHandle);
      const file = await rememberedHandle.getFile();
      await linkFile(file, { persistDescriptor: false });
    } catch {
      setWarning(
        "La vidéo mémorisée n'est plus accessible. Relie-la de nouveau.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  async function unlink() {
    revokeCurrentUrl();
    setLinked(null);
    setWarning("");
    setPermissionNeeded(false);
    setRememberedHandle(null);

    await clearLocalVideoHandle(projectId);

    try {
      localStorage.removeItem(`mybasket_local_video_descriptor_${projectId}`);
    } catch {}

    onUnlinked?.();
  }

  return (
    <section className="lpv">
      <div className="head">
        <div>
          <b>🎬 Vidéo locale du match</b>
          <span>Aucun upload · lecture directe depuis cet ordinateur</span>
        </div>
        <i>0 Go MyBasket</i>
      </div>

      {linked ? (
        <div className="row ok">
          <strong>✓</strong>
          <div>
            <b>{linked.descriptor.name}</b>
            <span>
              ⚡ Vidéo reconnectée · lecture locale optimisée pour le codage et
              les clips
            </span>
          </div>
          <button onClick={() => void chooseWithPersistentPicker()}>
            Changer
          </button>
          <button className="danger" onClick={() => void unlink()}>
            Retirer
          </button>
        </div>
      ) : permissionNeeded && rememberedHandle ? (
        <div className="row remembered">
          <strong>↻</strong>
          <div>
            <b>Vidéo du match mémorisée</b>
            <span>
              Le navigateur demande ton autorisation pour rouvrir le fichier
              local.
            </span>
          </div>
          <button onClick={() => void authorizeRememberedVideo()}>
            {busy ? "Ouverture…" : "Autoriser"}
          </button>
          <button
            className="secondary"
            onClick={() => void chooseWithPersistentPicker()}
          >
            Relier une autre
          </button>
        </div>
      ) : (
        <div className="row">
          <div>
            <b>Relie ta copie du match</b>
            <span>
              La vidéo reste sur ton Mac/PC. MyBasket mémorise l'accès local
              lorsque le navigateur le permet.
            </span>
          </div>
          <button onClick={() => void chooseWithPersistentPicker()}>
            {busy ? "Analyse…" : "📁 Relier la vidéo locale"}
          </button>
        </div>
      )}

      {warning && <p>⚠️ {warning}</p>}

      <input
        ref={inputRef}
        hidden
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm"
        onChange={(event) =>
          void chooseFallback(event.target.files?.[0] || null)
        }
      />

      <style jsx>{`
        .lpv {
          border: 1px solid #2b3950;
          border-radius: 14px;
          background: #0d1727;
          color: #f3f6fb;
          overflow: hidden;
        }
        .head {
          padding: 11px 13px;
          border-bottom: 1px solid #27354a;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .head > div,
        .row > div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .head b,
        .row b {
          font-size: 11px;
        }
        .head span,
        .row span {
          font-size: 9px;
          color: #94a2b7;
        }
        .head i {
          font-style: normal;
          font-size: 9px;
          font-weight: 900;
          border: 1px solid #2d6844;
          border-radius: 999px;
          padding: 5px 8px;
          color: #75d795;
          background: #102319;
          white-space: nowrap;
        }
        .row {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 11px 13px;
        }
        .row > div {
          flex: 1;
        }
        .row.ok {
          background: #0d1d16;
        }
        .row.remembered {
          background: #171a10;
        }
        .row > strong {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #246b40;
        }
        .row.remembered > strong {
          background: #6f541d;
        }
        .row button {
          border: 1px solid #d4a24c;
          border-radius: 8px;
          background: rgba(212, 162, 76, 0.1);
          color: #efc45d;
          padding: 7px 9px;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
        }
        .row button.secondary {
          border-color: #46566d;
          color: #b6c0cf;
          background: #111b2a;
        }
        .row button.danger {
          border-color: #613641;
          color: #ee8f9d;
          background: #1c1218;
        }
        p {
          margin: 0 13px 11px;
          padding: 8px 9px;
          border: 1px solid #725a25;
          border-radius: 8px;
          background: #251d0d;
          color: #f0c35f;
          font-size: 9px;
        }
      `}</style>
    </section>
  );
}
