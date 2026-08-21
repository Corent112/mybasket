"use client";

import { useEffect, useMemo, useState } from "react";
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
  isFolder?: boolean;
  size?: number | null;
  modifiedTime?: string | null;
  durationMs?: number | null;
};

type Status = {
  connected: boolean;
  canManage?: boolean;
  scopeReady?: boolean;
  reason?: string | null;
};

function fmtSize(value?: number | null) {
  if (!value) return "";
  if (value > 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} Go`;
  if (value > 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} Mo`;
  return `${Math.round(value / 1024)} Ko`;
}

function fmtDuration(ms?: number | null) {
  if (!ms) return "";
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
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
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<DriveEntry[]>([]);
  const [folderId, setFolderId] = useState("root");
  const [trail, setTrail] = useState<Array<{ id: string; name: string }>>([
    { id: "root", name: "Mon Drive" },
  ]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadStatus = async () => {
    if (!teamId) return;
    try {
      const response = await fetch(
        `/api/google-drive/status?teamId=${encodeURIComponent(teamId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Accès Drive impossible.");
      setStatus(payload);
    } catch (e) {
      setStatus({ connected: false });
      setError(e instanceof Error ? e.message : "Google Drive indisponible.");
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [teamId]);

  const browse = async (nextFolderId: string, nextTrail = trail) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/google-drive/browse?teamId=${encodeURIComponent(teamId)}&folderId=${encodeURIComponent(nextFolderId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Impossible d'ouvrir ce dossier.");
      }

      setFiles(Array.isArray(payload.files) ? payload.files : []);
      setFolderId(nextFolderId);
      setTrail(nextTrail);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google Drive indisponible.");
    } finally {
      setBusy(false);
    }
  };

  const connect = () => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href =
      `/api/google-drive/connect?teamId=${encodeURIComponent(teamId)}` +
      `&returnTo=${encodeURIComponent(returnTo)}`;
  };

  const handleOpen = async () => {
    if (disabled || busy || !teamId) return;

    if (!status?.connected) {
      if (status?.canManage) {
        connect();
      } else {
        setError("Le coach principal doit d'abord connecter Google Drive à cette équipe.");
        setOpen(true);
      }
      return;
    }

    await browse("root", [{ id: "root", name: "Mon Drive" }]);
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((file) => file.name.toLowerCase().includes(q));
  }, [files, search]);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        onClick={handleOpen}
      >
        ☁️ {busy ? "Chargement…" : label || (selectedName ? `✓ ${selectedName}` : "Choisir dans Google Drive")}
      </button>

      {!compact && selectedName && !className ? <span>✓ {selectedName}</span> : null}

      {open && (
        <div className="gdl-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="gdl-card">
            <header>
              <div>
                <b>☁️ Vidéos Google Drive · équipe</b>
                <span>Les fichiers sont lus via les droits MyBasket de l'équipe.</span>
              </div>
              <button type="button" onClick={() => setOpen(false)}>×</button>
            </header>

            {error ? <div className="gdl-error">{error}</div> : null}

            {status?.connected ? (
              <>
                <div className="gdl-toolbar">
                  <div className="gdl-trail">
                    {trail.map((item, index) => (
                      <button
                        type="button"
                        key={`${item.id}-${index}`}
                        onClick={() =>
                          void browse(item.id, trail.slice(0, index + 1))
                        }
                      >
                        {index ? "› " : ""}{item.name}
                      </button>
                    ))}
                  </div>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher une vidéo…"
                  />
                </div>

                <div className="gdl-list">
                  {busy ? <div className="gdl-empty">Chargement…</div> : null}

                  {!busy && visible.map((file) =>
                    file.isFolder ? (
                      <button
                        type="button"
                        className="gdl-row folder"
                        key={file.id}
                        onClick={() =>
                          void browse(file.id, [...trail, { id: file.id, name: file.name }])
                        }
                      >
                        <span className="ico">📁</span>
                        <span className="name">{file.name}</span>
                        <span className="meta">Ouvrir ›</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="gdl-row video"
                        key={file.id}
                        onClick={() => {
                          onPicked({
                            id: file.id,
                            name: file.name,
                            mimeType: file.mimeType,
                          });
                          setOpen(false);
                        }}
                      >
                        <span className="ico">🎥</span>
                        <span className="name">{file.name}</span>
                        <span className="meta">
                          {[fmtDuration(file.durationMs), fmtSize(file.size)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="pick">Utiliser</span>
                      </button>
                    ),
                  )}

                  {!busy && visible.length === 0 ? (
                    <div className="gdl-empty">
                      Aucune vidéo dans ce dossier.
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="gdl-empty connect">
                <b>Google Drive n'est pas encore connecté à cette équipe.</b>
                {status?.canManage ? (
                  <button type="button" onClick={connect}>Connecter Google Drive</button>
                ) : (
                  <span>Le coach principal doit effectuer la connexion une seule fois.</span>
                )}
              </div>
            )}

            <footer>
              <span>🔒 Staff MyBasket autorisé uniquement</span>
              <button type="button" onClick={() => setOpen(false)}>Fermer</button>
            </footer>
          </div>
        </div>
      )}

      <style jsx global>{`
        .gdl-backdrop{position:fixed;inset:0;z-index:2147483645;background:rgba(2,6,15,.76);display:grid;place-items:center;padding:18px;backdrop-filter:blur(6px)}
        .gdl-card{width:min(920px,96vw);max-height:90vh;overflow:hidden;display:flex;flex-direction:column;border:1px solid #29364d;border-radius:17px;background:#0c1423;color:#fff;box-shadow:0 25px 80px rgba(0,0,0,.55)}
        .gdl-card header{display:flex;align-items:center;justify-content:space-between;padding:15px 17px;border-bottom:1px solid #253149}.gdl-card header b{display:block}.gdl-card header span{display:block;margin-top:3px;font-size:10px;color:#8996aa}.gdl-card header>button{border:0;background:#172136;color:#fff;width:32px;height:32px;border-radius:8px;font-size:20px;cursor:pointer}
        .gdl-toolbar{display:flex;gap:10px;justify-content:space-between;align-items:center;padding:11px 14px;border-bottom:1px solid #202c41}.gdl-trail{display:flex;gap:3px;overflow:auto}.gdl-trail button{border:0;background:transparent;color:#d4a24c;font-size:10px;font-weight:850;cursor:pointer;white-space:nowrap}.gdl-toolbar input{min-width:220px;border:1px solid #33415a;background:#111b2c;color:#fff;border-radius:9px;padding:8px 10px}
        .gdl-list{padding:9px;overflow:auto;min-height:280px}.gdl-row{width:100%;display:grid;grid-template-columns:38px minmax(0,1fr) 150px 72px;align-items:center;gap:8px;border:1px solid transparent;border-radius:10px;background:transparent;color:#fff;padding:10px;text-align:left;cursor:pointer}.gdl-row:hover{background:#121d30;border-color:#2e3d57}.gdl-row.folder{grid-template-columns:38px minmax(0,1fr) 120px}.gdl-row .ico{font-size:19px}.gdl-row .name{font-size:11px;font-weight:850;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gdl-row .meta{font-size:9px;color:#8391a6;text-align:right}.gdl-row .pick{font-size:9px;color:#d4a24c;font-weight:950;text-align:right}
        .gdl-empty{padding:60px 18px;text-align:center;color:#8996aa}.gdl-empty.connect{display:grid;gap:13px;place-items:center}.gdl-empty.connect button{border:1px solid #d4a24c;background:#d4a24c;color:#111827;border-radius:9px;padding:9px 13px;font-weight:900;cursor:pointer}
        .gdl-error{margin:10px 14px 0;padding:10px;border:1px solid rgba(220,38,56,.45);background:rgba(220,38,56,.1);border-radius:9px;color:#ffc4cb;font-size:10px}
        .gdl-card footer{display:flex;justify-content:space-between;align-items:center;padding:12px 15px;border-top:1px solid #253149;color:#8593a8;font-size:9px}.gdl-card footer button{border:1px solid #33415a;background:#151f31;color:#fff;border-radius:8px;padding:7px 11px;cursor:pointer}
        @media(max-width:650px){.gdl-toolbar{align-items:stretch;flex-direction:column}.gdl-toolbar input{min-width:0;width:100%}.gdl-row{grid-template-columns:32px minmax(0,1fr) 60px}.gdl-row .meta{display:none}}
      `}</style>
    </>
  );
}
