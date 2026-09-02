"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentUserRole,
  listMySystems,
  submitSystemForReview,
  type SystemItem,
} from "@/lib/systems";
import SystemesClient from "./SystemesClient";

type ViewMode = "library" | "mine";

function statusLabel(status?: SystemItem["review_status"]) {
  if (status === "submitted") return "En attente CEO";
  if (status === "approved") return "Validé";
  if (status === "rejected") return "Refusé";
  return "Brouillon";
}

function statusClass(status?: SystemItem["review_status"]) {
  if (status === "submitted") return "pending";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return "draft";
}

function formatDate(value?: string | number) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

export default function SystemesWorkspace() {
  const [view, setView] = useState<ViewMode>("library");
  const [userId, setUserId] = useState<string | null>(null);
  const [isCeo, setIsCeo] = useState(false);
  const [mySystems, setMySystems] = useState<SystemItem[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  async function reloadMine() {
    setLoadingMine(true);
    try {
      setMySystems(await listMySystems());
    } finally {
      setLoadingMine(false);
    }
  }

  useEffect(() => {
    async function loadIdentity() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id ?? null);

      if (!user) return;

      const role = await getCurrentUserRole();
      setIsCeo(role === "ceo" || role === "superadmin");
      await reloadMine();
    }

    void loadIdentity();
  }, []);

  const sortedMine = useMemo(
    () =>
      [...mySystems].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
      ),
    [mySystems]
  );

  async function propose(system: SystemItem) {
    if (!userId || system.user_id !== userId) return;

    const ok = window.confirm(
      `Proposer « ${system.title || "ce système"} » à MyBasket ?\n\nTu ne pourras plus le modifier pendant la validation.`
    );

    if (!ok) return;

    try {
      setSubmittingId(system.id);
      const submitted = await submitSystemForReview(system.id);

      if (!submitted) {
        alert("La proposition n’a pas pu être envoyée.");
        return;
      }

      await reloadMine();
      alert("Système proposé au CEO ✅");
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <>
      {userId && (
        <div className="sw-switch-wrap">
          <div className="sw-switch">
            <button
              type="button"
              className={view === "library" ? "active" : ""}
              onClick={() => setView("library")}
            >
              Bibliothèque MyBasket
            </button>
            <button
              type="button"
              className={view === "mine" ? "active" : ""}
              onClick={() => setView("mine")}
            >
              Mes systèmes
            </button>
          </div>
        </div>
      )}

      {view === "library" ? (
        <div className={isCeo ? "" : "sw-library-readonly"}>
          <SystemesClient />
        </div>
      ) : (
        <main className="sw-mine">
          <div className="page-banner">
            <img src="/images/bandeau-systemes.png" alt="MyBasket Systèmes" />
          </div>

          <div className="container">
            <div className="section-title-bar">
              <h2>MES SYSTÈMES</h2>
            </div>

            <div className="sw-head">
              <p>
                Crée tes systèmes, garde-les privés ou propose-les au CEO pour
                intégration dans la bibliothèque MyBasket.
              </p>
              <Link href="/systemes/creer?new=1" className="btn btn-black">
                + Créer un système
              </Link>
            </div>

            {loadingMine ? (
              <p className="empty-state">Chargement de tes systèmes...</p>
            ) : sortedMine.length === 0 ? (
              <div className="sw-empty">
                <strong>Tu n’as pas encore créé de système.</strong>
                <Link href="/systemes/creer?new=1">Créer mon premier système</Link>
              </div>
            ) : (
              <div className="sw-grid">
                {sortedMine.map((system) => {
                  const thumbnail =
                    system.schemaImages?.[0] ||
                    system.images?.[0] ||
                    system.schemaImage ||
                    "";
                  const submitted = system.review_status === "submitted";
                  const canPropose =
                    !isCeo &&
                    system.user_id === userId &&
                    (system.review_status === "draft" ||
                      system.review_status === "rejected" ||
                      !system.review_status);

                  return (
                    <article key={system.id} className="sw-card">
                      <Link href={`/systemes/${system.id}`} className="sw-cover">
                        {thumbnail ? (
                          <img src={thumbnail} alt={system.title || "Système"} />
                        ) : (
                          <span>🏀</span>
                        )}
                      </Link>

                      <div className="sw-body">
                        <div className={`sw-status ${statusClass(system.review_status)}`}>
                          {statusLabel(system.review_status)}
                        </div>
                        <h3>{system.title || "Système sans titre"}</h3>
                        <p>
                          {system.type || "Type non défini"} · {system.categorie || "Toutes catégories"}
                        </p>
                        <small>Mis à jour le {formatDate(system.updatedAt || system.createdAt)}</small>

                        {system.review_status === "rejected" && system.rejection_reason && (
                          <div className="sw-reason">
                            Motif : {system.rejection_reason}
                          </div>
                        )}

                        <div className="sw-actions">
                          <Link href={`/systemes/${system.id}`}>Ouvrir / Playbook</Link>

                          {!submitted && (
                            <Link href={`/systemes/creer?id=${system.id}`}>
                              Modifier
                            </Link>
                          )}

                          {canPropose && (
                            <button
                              type="button"
                              onClick={() => propose(system)}
                              disabled={submittingId === system.id}
                            >
                              {submittingId === system.id
                                ? "Envoi..."
                                : "Proposer au CEO"}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      )}

      <style jsx global>{`
        .sw-switch-wrap {
          display: none !important;
        }
        .sw-switch {
          display: inline-flex;
          gap: 6px;
          background: #f2f2f2;
          border-radius: 999px;
          padding: 5px;
        }
        .sw-switch button {
          border: 0;
          border-radius: 999px;
          padding: 10px 18px;
          background: transparent;
          color: #555;
          font-weight: 900;
          cursor: pointer;
        }
        .sw-switch button.active {
          background: #6b1a2c;
          color: #fff;
        }
        .sw-library-readonly .mb-system-foot a[href^="/systemes/creer"] {
          display: none !important;
        }
        .sw-mine { min-height: 70vh; }
        .sw-head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: center;
          margin-bottom: 24px;
        }
        .sw-head p { margin: 0; color: #666; max-width: 720px; }
        .sw-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 18px;
          padding-bottom: 40px;
        }
        .sw-card {
          border: 1px solid #ddd;
          border-radius: 16px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 6px 18px rgba(0,0,0,.04);
        }
        .sw-cover {
          height: 190px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fafafa;
        }
        .sw-cover img { width: 100%; height: 100%; object-fit: contain; }
        .sw-cover span { font-size: 2.5rem; }
        .sw-body { padding: 16px; }
        .sw-body h3 { margin: 10px 0 6px; text-transform: uppercase; }
        .sw-body p { margin: 0 0 8px; color: #555; }
        .sw-body small { color: #888; }
        .sw-status {
          display: inline-flex;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: .75rem;
          font-weight: 900;
        }
        .sw-status.draft { background:#eee; color:#555; }
        .sw-status.pending { background:#fff2d8; color:#8a5a00; }
        .sw-status.approved { background:#e1f5e8; color:#176b3a; }
        .sw-status.rejected { background:#fde7e7; color:#a52323; }
        .sw-reason {
          margin-top: 12px;
          padding: 10px;
          background: #fff4f4;
          border-radius: 10px;
          color: #8b2020;
          font-size: .86rem;
        }
        .sw-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid #eee;
        }
        .sw-actions a,
        .sw-actions button {
          border: 0;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: .78rem;
          font-weight: 900;
          text-decoration: none;
          cursor: pointer;
          background: #f1f1f1;
          color: #222;
        }
        .sw-actions button {
          background: #6b1a2c;
          color: #fff;
        }
        .sw-actions button:disabled { opacity: .55; cursor: default; }
        .sw-empty {
          padding: 32px;
          border: 1px dashed #ccc;
          border-radius: 16px;
          display: flex;
          gap: 14px;
          align-items: center;
          justify-content: center;
          flex-direction: column;
        }
        .sw-empty a { color:#6b1a2c; font-weight:900; }
        @media (max-width: 760px) {
          .sw-head { align-items: flex-start; flex-direction: column; }
          .sw-switch-wrap { padding: 0 14px; }
          .sw-switch { width: 100%; }
          .sw-switch button { flex: 1; padding-inline: 10px; }
        }
      `}</style>
    </>
  );
}
