"use client";

/**
 * components/management/VideoMatchFolderModule.tsx
 * ---------------------------------------------------------------------------
 * « Le dossier racine pour les matchs est ici. »
 *
 * Un seul module, la même logique sur tous les moteurs. Seul le SÉLECTEUR
 * change, parce que seuls les navigateurs diffèrent :
 *
 *   - Chrome / Edge  → 📁 Choisir le dossier racine (dossier entier, récursif,
 *     mémorisé : les matchs suivants se rechargent tout seuls) ;
 *   - navigateurs sans sélecteur de dossier mais avec handles de fichier
 *     → 🎬 Choisir mes vidéos de matchs (mémorisées durablement, une par une) ;
 *   - Safari / Firefox → 🎬 Choisir mes vidéos de matchs (sélection classique,
 *     mémorisée pour la session) + chemin du dossier racine saisi à la main,
 *     enregistré sur le compte, donc identique sur tous tes navigateurs.
 *
 * Aucune détection d'user-agent : on teste l'API disponible. Changer de moteur
 * ne change donc jamais la logique, seulement le confort.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getVideoRootFolder,
  readCachedVideoRootFolder,
  setVideoRootFolder,
} from "@/lib/video/video-root-folder";
import {
  addVideoFiles,
  addVideoFolder,
  forgetVideoFolder,
  grantVideoLibraryAccess,
  refreshVideoLibraryIndex,
  rememberSessionVideos,
  sessionDirectoryName,
  videoLibraryMode,
  videoLibraryStatus,
  type VideoLibraryMode,
  type VideoLibraryStatus,
} from "@/lib/video/video-library";

const PLACEHOLDER = "~/Movies/MyBasket";

export default function VideoMatchFolderModule() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoLibraryStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [declared, setDeclared] = useState(readCachedVideoRootFolder());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mode: VideoLibraryMode = status?.mode ?? videoLibraryMode();
  const connected = status?.state === "granted";

  const pickedNames = useMemo(() => {
    if (!status || !("folders" in status) || !status.folders.length) return [];
    return status.folders.map((folder) => folder.name).filter(Boolean);
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

      const folder = await getVideoRootFolder();
      if (active && folder) setDeclared(folder);
    })();

    return () => {
      active = false;
    };
  }, [refreshStatus]);

  /* ---------------------------------------------------------------- actions */

  const chooseRootFolder = async () => {
    setBusy(true);

    try {
      const previousIds = status && "folders" in status
        ? status.folders.map((folder) => folder.id)
        : [];

      // On ouvre d'abord le picker. Si l'utilisateur annule, l'ancien dossier
      // reste intact.
      const added = await addVideoFolder(ownerId);

      if (added) {
        await Promise.all(previousIds.filter((id) => id !== added.id).map(forgetVideoFolder));
        // Le nom du vrai dossier choisi devient aussi la référence du compte.
        await setVideoRootFolder(added.name);
        setDeclared(added.name);
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

  /** Navigateurs sans sélecteur de dossier : on mémorise des fichiers. */
  const chooseVideoFiles = async () => {
    if (mode === "manual") {
      // Repli universel : <input type="file"> classique, mémoire de session.
      fileInputRef.current?.click();
      return;
    }

    setBusy(true);
    try {
      const added = await addVideoFiles(ownerId);
      if (added.length) refreshVideoLibraryIndex();
      await refreshStatus(ownerId);
    } finally {
      setBusy(false);
    }
  };

  const onManualFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    const rootName = sessionDirectoryName(files);
    rememberSessionVideos(files);
    refreshVideoLibraryIndex();

    // En mode Safari/Firefox, webkitdirectory donne le nom du dossier racine
    // choisi sans exposer son chemin absolu. On le garde comme repère durable.
    if (rootName) {
      setDeclared(rootName);
      await setVideoRootFolder(rootName);
    }

    event.target.value = "";
    await refreshStatus(ownerId);
  };

  const mainAction = async () => {
    if (mode !== "directory") {
      await chooseVideoFiles();
      return;
    }
    if (status?.state === "prompt") {
      await reconnectRootFolder();
      return;
    }
    await chooseRootFolder();
  };

  const saveDeclared = async () => {
    setSaveState("saving");
    const ok = await setVideoRootFolder(declared);
    setSaveState(ok ? "ok" : "error");
    window.setTimeout(() => setSaveState("idle"), 2500);
  };

  /* ----------------------------------------------------------------- libellés */

  const actionLabel =
    mode !== "directory"
      ? connected
        ? mode === "manual" ? "📁 Rechoisir le dossier racine" : "🎬 Choisir d’autres vidéos"
        : mode === "manual" ? "📁 Choisir le dossier racine" : "🎬 Choisir mes vidéos de matchs"
      : status?.state === "prompt"
        ? "🔓 Reconnecter le dossier racine"
        : connected
          ? "📁 Changer le dossier racine"
          : "📁 Choisir le dossier racine";

  const rootLabel =
    mode === "directory"
      ? pickedNames[0] ||
        declared ||
        (status?.state === "prompt" ? "Dossier mémorisé" : "Aucun dossier choisi")
      : declared || "Aucun dossier indiqué";

  const subtitle =
    mode === "directory"
      ? "Choisis une seule fois le dossier principal dans lequel tu ranges tes vidéos de matchs."
      : "Indique où tu ranges tes vidéos de matchs, puis sélectionne-les une fois : tous tes projets, fiches équipe et fiches individuelles les retrouveront.";

  return (
    <section className="vmf-card" aria-label="Dossier racine des matchs">
      <div className="vmf-head">
        <div>
          <h3>📁 Dossier des vidéos de matchs</h3>
          <p>{subtitle}</p>
        </div>

        {connected && (
          <span className="vmf-badge ok">
            {mode === "directory" ? "Connecté" : "Vidéos chargées"}
          </span>
        )}
        {status?.state === "prompt" && <span className="vmf-badge warn">À reconnecter</span>}
      </div>

      <div className={`vmf-root ${connected ? "connected" : ""}`}>
        <div className="vmf-root-left">
          <span className="vmf-folder">📁</span>
          <div>
            <span>Dossier racine</span>
            <strong>{rootLabel}</strong>
          </div>
        </div>

        {connected && <span className="vmf-check">✓</span>}
      </div>

      {/* Le chemin déclaré est saisi à la main là où aucun sélecteur de dossier
          n'existe. Il est enregistré sur le COMPTE : même information sur
          Safari, Chrome ou un autre ordinateur. */}
      {mode !== "directory" && (
        <div className="vmf-declare">
          <label htmlFor="vmf-root-input">Le dossier racine des matchs est ici</label>
          <div className="vmf-declare-row">
            <input
              id="vmf-root-input"
              value={declared}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              onChange={(event) => setDeclared(event.target.value)}
            />
            <button type="button" onClick={saveDeclared} disabled={saveState === "saving"}>
              {saveState === "saving" ? "…" : "Enregistrer"}
            </button>
          </div>
          {saveState === "ok" && <small className="vmf-ok">✓ Enregistré sur ton compte.</small>}
          {saveState === "error" && (
            <small className="vmf-err">Enregistrement impossible : reconnecte-toi et réessaie.</small>
          )}
        </div>
      )}

      <div className="vmf-bottom">
        <div className="vmf-info">
          {connected ? (
            mode === "directory" ? (
              <>
                <strong>✓ MyBasket cherchera automatiquement les vidéos ici.</strong>
                <span>Tu peux créer autant de sous-dossiers que tu veux à l’intérieur.</span>
              </>
            ) : (
              <>
                <strong>
                  ✓ {pickedNames.length} vidéo{pickedNames.length > 1 ? "s" : ""} prête
                  {pickedNames.length > 1 ? "s" : ""}.
                </strong>
                <span>
                  {mode === "manual"
                    ? "Valable tant que cet onglet reste ouvert. Sur Chrome ou Edge, un dossier autorisé une fois suffit pour toujours."
                    : "Ces vidéos sont mémorisées : elles se rechargeront toutes seules."}
                </span>
              </>
            )
          ) : status?.state === "prompt" ? (
            <>
              <strong>Le dossier est mémorisé.</strong>
              <span>Un clic suffit pour redonner l’accès à MyBasket.</span>
            </>
          ) : mode === "manual" ? (
            <>
              <strong>Ce navigateur ne sait pas mémoriser un dossier.</strong>
              <span>
                Sélectionne tes vidéos de matchs : une seule fois par session, pour tous tes
                projets. Sur Chrome ou Edge, le dossier entier s’autorise en un clic définitif.
              </span>
            </>
          ) : mode === "files" ? (
            <>
              <strong>Ce navigateur mémorise les vidéos une par une.</strong>
              <span>Sélectionne tes vidéos de matchs : elles se rechargeront ensuite toutes seules.</span>
            </>
          ) : (
            <>
              <strong>Aucun dossier racine défini.</strong>
              <span>Choisis le dossier qui contient tes matchs.</span>
            </>
          )}
        </div>

        <button type="button" className="vmf-action" onClick={mainAction} disabled={busy}>
          {busy ? "…" : actionLabel}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi"
        multiple
        {...(mode === "manual" ? ({ webkitdirectory: "", directory: "" } as any) : {})}
        hidden
        onChange={onManualFiles}
      />

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

        .vmf-declare {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .vmf-declare label {
          color: #817a7b;
          font-size: 11px;
          font-weight: 700;
        }

        .vmf-declare-row {
          display: flex;
          gap: 9px;
        }

        .vmf-declare-row input {
          flex: 1 1 auto;
          min-width: 0;
          min-height: 38px;
          padding: 0 11px;
          border: 1px solid #e0d8d6;
          border-radius: 9px;
          background: #fff;
          color: #2e292a;
          font-size: 13px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }

        .vmf-declare-row button {
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

        .vmf-declare-row button:disabled {
          opacity: 0.55;
          cursor: wait;
        }

        .vmf-ok {
          color: #1d7b42;
          font-size: 11px;
          font-weight: 700;
        }

        .vmf-err {
          color: #a3252f;
          font-size: 11px;
          font-weight: 700;
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
