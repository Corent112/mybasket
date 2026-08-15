
"use client";

import { useEffect, useRef, useState } from "react";
import type { GoogleDrivePickedVideo } from "@/lib/google-drive/client";

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

type Props = {
  teamId: string;
  disabled?: boolean;
  compact?: boolean;
  selectedName?: string | null;
  /** Permet de réutiliser le style des boutons de l'écran appelant. */
  className?: string;
  label?: string;
  onPicked: (file: GoogleDrivePickedVideo) => void;
};

let pickerLoader: Promise<void> | null = null;

function loadGooglePicker() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Navigateur requis."));
  }

  if (window.google?.picker) return Promise.resolve();

  if (!pickerLoader) {
    pickerLoader = new Promise<void>((resolve, reject) => {
      const boot = () => {
        if (!window.gapi) {
          reject(new Error("Google API indisponible."));
          return;
        }

        window.gapi.load("picker", {
          callback: () => resolve(),
          onerror: () =>
            reject(new Error("Google Picker indisponible.")),
        });
      };

      const existing =
        document.querySelector<HTMLScriptElement>(
          'script[data-mybasket-google-api="1"]',
        );

      if (existing) {
        if (window.gapi) boot();
        else existing.addEventListener("load", boot, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.defer = true;
      script.dataset.mybasketGoogleApi = "1";
      script.onload = boot;
      script.onerror = () =>
        reject(new Error("Impossible de charger Google Picker."));
      document.head.appendChild(script);
    });
  }

  return pickerLoader;
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
  // Diagnostic renvoyé par /api/google-drive/status : permet d'afficher la
  // vraie raison au lieu de proposer une connexion qui échouera.
  const [configIssue, setConfigIssue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    const returnTo =
      window.location.pathname + window.location.search;

    window.location.href =
      `/api/google-drive/connect?teamId=${encodeURIComponent(teamId)}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;
  };

  const openPicker = async () => {
    if (!teamId || disabled) return;

    if (configIssue) {
      window.alert(`Google Drive indisponible : ${configIssue}`);
      return;
    }

    if (!connected) {
      connect();
      return;
    }

    setBusy(true);

    try {
      const tokenResponse = await fetch(
        `/api/google-drive/picker-token?teamId=${encodeURIComponent(teamId)}`,
        { cache: "no-store" },
      );
      const token = await tokenResponse.json();

      if (!tokenResponse.ok) {
        throw new Error(token.error || "Google Drive indisponible.");
      }

      await loadGooglePicker();

      const google = window.google;
      if (!google?.picker) {
        throw new Error("Google Picker indisponible.");
      }

      const view = new google.picker.DocsView(
        google.picker.ViewId.DOCS,
      );
      view.setMimeTypes(
        [
          "video/mp4",
          "video/quicktime",
          "video/x-m4v",
          "video/webm",
          "video/x-msvideo",
          "video/mpeg",
        ].join(","),
      );
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(false);

      const builder = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token.accessToken)
        .setDeveloperKey(token.developerKey)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs?.[0];
            if (doc?.id) {
              onPicked({
                id: String(doc.id),
                name: String(doc.name || doc.id),
                mimeType: doc.mimeType
                  ? String(doc.mimeType)
                  : undefined,
                url: doc.url ? String(doc.url) : undefined,
              });
            }
          }

          if (
            data.action === google.picker.Action.PICKED ||
            data.action === google.picker.Action.CANCEL
          ) {
            setBusy(false);
          }
        });

      if (token.appId) builder.setAppId(token.appId);

      builder.build().setVisible(true);
    } catch (error) {
      setBusy(false);
      window.alert(
        error instanceof Error
          ? error.message
          : "Impossible d'ouvrir Google Drive.",
      );
    }
  };

  const text = busy
    ? "Ouverture…"
    : label
      ? label
      : connected
        ? "Choisir dans Google Drive"
        : "Connecter Google Drive";

  // `className` permet au parent d'imposer son propre style de bouton
  // (ex. `.vbtn` dans LiveStats) sans changer l'apparence existante ailleurs.
  const button = (
    <button
      type="button"
      className={className}
      onClick={openPicker}
      disabled={disabled || busy}
      title={configIssue ?? undefined}
    >
      ☁️ {configIssue ? "Google Drive indisponible" : text}
    </button>
  );

  if (className) return button;

  return (
    <div className={`gdrive-picker ${compact ? "compact" : ""}`}>
      {button}
      {!compact && selectedName && <span>✓ {selectedName}</span>}
    </div>
  );
}
