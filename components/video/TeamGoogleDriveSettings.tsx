
"use client";

import { useEffect, useState } from "react";

export default function TeamGoogleDriveSettings({
  teamId,
}: {
  teamId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

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
    const returnTo =
      window.location.pathname + window.location.search;
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
      await load();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Erreur.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="team-google-drive-settings">
      <div>
        <strong>☁️ Vidéos Google Drive</strong>
        <p>
          La vidéo est choisie une fois. Ensuite les clips du match
          restent disponibles aux membres autorisés de l'équipe.
        </p>
      </div>

      {loading ? (
        <span>Vérification…</span>
      ) : connected ? (
        <div>
          <span>🟢 Drive connecté</span>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
          >
            Déconnecter
          </button>
        </div>
      ) : (
        <button type="button" onClick={connect}>
          Connecter Google Drive
        </button>
      )}
    </section>
  );
}
