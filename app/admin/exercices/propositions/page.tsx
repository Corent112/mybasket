"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  approveExerciseForLibrary,
  ensureApprovedProposalPublished,
  listExerciseProposalsForCeo,
  rejectExerciseForLibrary,
} from "@/lib/exercises";
import type { Exercise } from "@/types/exercise";

type Tab = "submitted" | "approved" | "rejected";

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function initials(name?: string | null) {
  return (name || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function PropositionsExercicesPage() {
  const router = useRouter();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("submitted");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const data = await listExerciseProposalsForCeo();
    setExercises(data);
    setLoading(false);
  }

  async function approve(id: string) {
    if (!confirm("Valider cet exercice et l’intégrer à la bibliothèque ?")) return;

    setActionId(id);
    const ok = await approveExerciseForLibrary(id);
    if (ok) {
      await load();
      setTab("approved");
    }
    setActionId(null);
  }

  async function reject(id: string) {
    const reason = prompt("Motif du refus ?") || "";
    setActionId(id);
    const ok = await rejectExerciseForLibrary(id, reason);
    if (ok) {
      await load();
      setTab("rejected");
    }
    setActionId(null);
  }

  async function openPublished(exercise: Exercise) {
    setActionId(exercise.id);
    const publishedId =
      exercise.published_exercise_id ||
      (await ensureApprovedProposalPublished(exercise.id));
    setActionId(null);

    if (!publishedId) {
      alert("Impossible de retrouver ou réparer la version publiée de cet exercice.");
      return;
    }

    router.push(`/exercices/creer?id=${publishedId}`);
  }

  const counts = useMemo(
    () => ({
      submitted: exercises.filter((item) => item.review_status === "submitted").length,
      approved: exercises.filter((item) => item.review_status === "approved").length,
      rejected: exercises.filter((item) => item.review_status === "rejected").length,
    }),
    [exercises]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((exercise) => {
      if (exercise.review_status !== tab) return false;
      if (!q) return true;
      return [exercise.title, exercise.proposer_name, exercise.theme, exercise.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [exercises, search, tab]);

  if (loading) return <main className="page">Chargement des propositions…</main>;

  return (
    <main className="page">
      <Link href="/admin" className="back">← Retour admin</Link>

      <section className="hero">
        <div>
          <p>VALIDATION CEO</p>
          <h1>Exercices proposés</h1>
          <span>
            Les propositions restent ici après validation ou refus. Elles ne disparaissent plus.
          </span>
        </div>
      </section>

      <section className="toolbar">
        <div className="tabs" role="tablist" aria-label="Statut des propositions">
          <button className={tab === "submitted" ? "active" : ""} onClick={() => setTab("submitted")}>
            À traiter <b>{counts.submitted}</b>
          </button>
          <button className={tab === "approved" ? "active" : ""} onClick={() => setTab("approved")}>
            Validés <b>{counts.approved}</b>
          </button>
          <button className={tab === "rejected" ? "active" : ""} onClick={() => setTab("rejected")}>
            Refusés <b>{counts.rejected}</b>
          </button>
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un exercice ou un utilisateur…"
          aria-label="Rechercher"
        />
      </section>

      <section className="tableCard">
        <div className="tableScroll">
          <table>
            <thead>
              <tr>
                <th>Exercice proposé</th>
                <th>Proposé par</th>
                <th>Date</th>
                <th>Statut</th>
                <th>Publication</th>
                <th className="actionsHead">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">Aucune proposition dans cette catégorie.</td>
                </tr>
              ) : (
                visible.map((exercise) => {
                  const busy = actionId === exercise.id;
                  const proposer = exercise.proposer_name || "Utilisateur MyBasket";
                  return (
                    <tr key={exercise.id}>
                      <td>
                        <div className="exerciseTitle">{exercise.title || "Exercice sans titre"}</div>
                        <div className="meta">
                          {[exercise.theme, exercise.type, exercise.category].filter(Boolean).join(" · ") || "Sans classification"}
                        </div>
                      </td>
                      <td>
                        <div className="author">
                          {exercise.proposer_avatar_url ? (
                            <img src={exercise.proposer_avatar_url} alt="" />
                          ) : (
                            <span className="avatarFallback">{initials(proposer)}</span>
                          )}
                          <strong>{proposer}</strong>
                        </div>
                      </td>
                      <td>{formatDate(exercise.submitted_at)}</td>
                      <td>
                        {exercise.review_status === "submitted" && <span className="badge pending">À traiter</span>}
                        {exercise.review_status === "approved" && <span className="badge approved">Validé</span>}
                        {exercise.review_status === "rejected" && <span className="badge rejected">Refusé</span>}
                      </td>
                      <td>
                        {exercise.review_status === "approved" ? (
                          exercise.published_exercise_id ? (
                            <span className="publication ok">● Dans la bibliothèque</span>
                          ) : (
                            <span className="publication warning">● À réparer</span>
                          )
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="rowActions">
                          {exercise.review_status === "submitted" && (
                            <>
                              <Link href={`/exercices/creer?id=${exercise.id}`} className="secondary">
                                ✏️ Ouvrir dans Plaquette
                              </Link>
                              <button disabled={busy} onClick={() => approve(exercise.id)} className="primary">
                                ✅ Valider & publier
                              </button>
                              <button disabled={busy} onClick={() => reject(exercise.id)} className="danger">
                                Refuser
                              </button>
                            </>
                          )}

                          {exercise.review_status === "approved" && (
                            <>
                              <button disabled={busy} onClick={() => openPublished(exercise)} className="primary">
                                ✏️ Modifier dans Plaquette
                              </button>
                              <Link href={`/exercices/creer?id=${exercise.id}`} className="secondary">
                                Voir proposition originale
                              </Link>
                            </>
                          )}

                          {exercise.review_status === "rejected" && (
                            <Link href={`/exercices/creer?id=${exercise.id}`} className="secondary">
                              Ouvrir la proposition
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .page { min-height:100vh; background:#f7f7f8; color:#171717; padding:36px; font-family:Roboto,system-ui,sans-serif; }
        .back { color:#6b1a2c; font-weight:900; text-decoration:none; }
        .hero { margin:26px 0 22px; display:flex; justify-content:space-between; gap:20px; align-items:end; }
        .hero p { color:#d4a24c; font-weight:900; letter-spacing:.14em; margin:0 0 7px; }
        .hero h1 { margin:0; color:#6b1a2c; font-family:"Alfa Slab One",Georgia,serif; font-size:34px; font-weight:400; }
        .hero span { display:block; margin-top:9px; color:#6b7280; font-weight:700; }
        .toolbar { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; }
        .tabs { display:flex; gap:8px; flex-wrap:wrap; }
        .tabs button { border:1px solid #e3e3e3; background:#fff; min-height:42px; padding:0 14px; border-radius:10px; font:inherit; font-weight:900; cursor:pointer; color:#555; }
        .tabs button.active { color:#fff; background:#6b1a2c; border-color:#6b1a2c; }
        .tabs b { margin-left:7px; font-size:12px; background:rgba(255,255,255,.18); padding:2px 7px; border-radius:999px; }
        .toolbar input { width:min(360px,100%); min-height:44px; border:1px solid #ddd; border-radius:10px; padding:0 13px; font:inherit; background:#fff; }
        .tableCard { background:#fff; border:1px solid #e7e7e7; border-radius:16px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,.04); }
        .tableScroll { overflow-x:auto; }
        table { width:100%; border-collapse:collapse; min-width:1050px; }
        th { text-align:left; padding:13px 16px; background:#fafafa; color:#666; font-size:12px; text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid #e9e9e9; }
        td { padding:15px 16px; border-bottom:1px solid #efefef; vertical-align:middle; }
        tr:last-child td { border-bottom:0; }
        .exerciseTitle { font-weight:950; color:#191919; }
        .meta { color:#858585; font-size:12px; margin-top:4px; }
        .author { display:flex; align-items:center; gap:9px; min-width:190px; }
        .author img,.avatarFallback { width:32px; height:32px; border-radius:50%; flex:0 0 32px; object-fit:cover; }
        .avatarFallback { display:grid; place-items:center; background:#f4ead4; color:#6b1a2c; font-size:11px; font-weight:950; }
        .badge { display:inline-flex; border-radius:999px; padding:6px 9px; font-size:12px; font-weight:900; white-space:nowrap; }
        .pending { background:#fff3d7; color:#855e00; }
        .approved { background:#e8f7ee; color:#14733b; }
        .rejected { background:#fdebed; color:#b42335; }
        .publication { font-size:12px; font-weight:900; white-space:nowrap; }
        .publication.ok { color:#14733b; }
        .publication.warning { color:#a56600; }
        .muted { color:#aaa; }
        .actionsHead { min-width:260px; }
        .rowActions { display:flex; gap:7px; flex-wrap:wrap; justify-content:flex-end; }
        .rowActions a,.rowActions button { min-height:38px; border-radius:9px; padding:0 11px; display:inline-flex; align-items:center; justify-content:center; border:0; text-decoration:none; font:inherit; font-size:12px; font-weight:900; cursor:pointer; white-space:nowrap; }
        .primary { background:#6b1a2c; color:#fff; }
        .secondary { background:#f0f0f1; color:#202020; }
        .danger { background:#fdebed; color:#b42335; }
        .rowActions button:disabled { opacity:.55; cursor:default; }
        .empty { text-align:center; padding:42px; color:#777; font-weight:800; }
        @media (max-width:760px) { .page{padding:20px 14px}.toolbar{align-items:stretch;flex-direction:column}.toolbar input{width:100%}.hero h1{font-size:28px} }
      `}</style>
    </main>
  );
}
