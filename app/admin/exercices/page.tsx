import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";

type ProposalStatus = "submitted" | "approved" | "rejected";

type ProposalRow = {
  id: string;
  title: string | null;
  theme?: string | null;
  themes?: string[] | null;
  type?: string | null;
  category?: string | null;
  categorie?: string | null;
  level?: string | null;
  niveau?: string | null;
  user_id: string | null;
  visibility: string | null;
  review_status: string | null;
  status?: string | null;
  submitted_at: string | null;
  reviewed_at?: string | null;
  original_exercise_id: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type PublishedRow = {
  id: string;
  original_exercise_id: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function normalizeStatus(row: ProposalRow): ProposalStatus {
  const status = String(row.review_status || row.status || "submitted");
  if (status === "approved" || status === "published") return "approved";
  if (status === "rejected") return "rejected";
  return "submitted";
}

async function publishProposal(formData: FormData) {
  "use server";

  const { supabase, user } = await requireAdmin();
  const proposalId = String(formData.get("id") || "");
  if (!proposalId) return;

  const { data: source, error: sourceError } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();

  if (sourceError || !source) {
    throw new Error(sourceError?.message || "Proposition introuvable.");
  }

  const now = new Date().toISOString();

  const { data: existingPublished, error: publishedLookupError } = await supabase
    .from("exercises")
    .select("id")
    .eq("original_exercise_id", proposalId)
    .eq("visibility", "public")
    .eq("review_status", "approved")
    .maybeSingle();

  if (publishedLookupError) throw new Error(publishedLookupError.message);

  if (!existingPublished?.id) {
    const {
      id: _id,
      created_at: _createdAt,
      updated_at: _updatedAt,
      ...sourceFields
    } = source as Record<string, unknown>;

    const officialCopy: Record<string, unknown> = {
      ...sourceFields,
      user_id: user.id,
      visibility: "public",
      review_status: "approved",
      original_exercise_id: proposalId,
      contributor_user_id: source.user_id ?? null,
      published_at: now,
      reviewed_at: now,
      reviewed_by: user.id,
      rejection_reason: null,
      created_at: now,
      updated_at: now,
    };

    if (Object.prototype.hasOwnProperty.call(source, "status")) {
      officialCopy.status = "approved";
    }

    const { error: insertError } = await supabase
      .from("exercises")
      .insert(officialCopy);

    if (insertError) throw new Error(insertError.message);
  }

  const sourceUpdate: Record<string, unknown> = {
    visibility: "private",
    review_status: "approved",
    reviewed_at: now,
    reviewed_by: user.id,
    rejection_reason: null,
    updated_at: now,
  };

  if (Object.prototype.hasOwnProperty.call(source, "status")) {
    sourceUpdate.status = "approved";
  }

  const { error: updateError } = await supabase
    .from("exercises")
    .update(sourceUpdate)
    .eq("id", proposalId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/admin");
  revalidatePath("/admin/exercices");
  revalidatePath("/exercices");
}

async function rejectProposal(formData: FormData) {
  "use server";

  const { supabase, user } = await requireAdmin();
  const proposalId = String(formData.get("id") || "");
  if (!proposalId) return;

  const now = new Date().toISOString();
  const { data: source } = await supabase
    .from("exercises")
    .select("status")
    .eq("id", proposalId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    visibility: "private",
    review_status: "rejected",
    reviewed_at: now,
    reviewed_by: user.id,
    updated_at: now,
  };

  if (source && Object.prototype.hasOwnProperty.call(source, "status")) {
    patch.status = "rejected";
  }

  const { error } = await supabase.from("exercises").update(patch).eq("id", proposalId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  revalidatePath("/admin/exercices");
}

async function repairAndOpen(formData: FormData) {
  "use server";

  const { supabase, user } = await requireAdmin();
  const proposalId = String(formData.get("id") || "");
  if (!proposalId) return;

  const { data: source, error: sourceError } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();

  if (sourceError || !source) throw new Error(sourceError?.message || "Proposition introuvable.");

  // Ancien workflow : la proposition elle-même était rendue publique.
  if (source.visibility === "public" && source.review_status === "approved") {
    redirect(`/exercices/${proposalId}/modifier?plaquette=1`);
  }

  const { data: existingPublished, error: lookupError } = await supabase
    .from("exercises")
    .select("id")
    .eq("original_exercise_id", proposalId)
    .eq("visibility", "public")
    .eq("review_status", "approved")
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (existingPublished?.id) {
    redirect(`/exercices/${existingPublished.id}/modifier?plaquette=1`);
  }

  const now = new Date().toISOString();
  const {
    id: _id,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...sourceFields
  } = source as Record<string, unknown>;

  const officialCopy: Record<string, unknown> = {
    ...sourceFields,
    user_id: user.id,
    visibility: "public",
    review_status: "approved",
    original_exercise_id: proposalId,
    contributor_user_id: source.user_id ?? null,
    published_at: now,
    reviewed_at: source.reviewed_at ?? now,
    reviewed_by: source.reviewed_by ?? user.id,
    rejection_reason: null,
    created_at: now,
    updated_at: now,
  };

  if (Object.prototype.hasOwnProperty.call(source, "status")) {
    officialCopy.status = "approved";
  }

  const { data: created, error: insertError } = await supabase
    .from("exercises")
    .insert(officialCopy)
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);

  revalidatePath("/exercices");
  redirect(`/exercices/${created.id}/modifier?plaquette=1`);
}

export default async function AdminExercicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const requestedStatus = params?.status || "all";
  const activeStatus = ["all", "submitted", "approved", "rejected"].includes(requestedStatus)
    ? requestedStatus
    : "all";

  const { data: rawRows, error } = await supabase
    .from("exercises")
    .select("*")
    .not("submitted_at", "is", null)
    .in("review_status", ["submitted", "approved", "rejected"])
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Une copie publique peut hériter de submitted_at. Elle ne doit jamais créer
  // une deuxième ligne : on conserve uniquement la proposition source.
  const proposals = ((rawRows || []) as ProposalRow[]).filter(
    (row) => !(row.visibility === "public" && row.original_exercise_id)
  );

  const proposerIds = Array.from(
    new Set(proposals.map((row) => row.user_id).filter((id): id is string => Boolean(id)))
  );
  const proposalIds = proposals.map((row) => row.id);

  const [{ data: profiles }, { data: publishedRows }] = await Promise.all([
    proposerIds.length
      ? supabase.from("profiles").select("id,display_name,avatar_url").in("id", proposerIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    proposalIds.length
      ? supabase
          .from("exercises")
          .select("id,original_exercise_id")
          .in("original_exercise_id", proposalIds)
          .eq("visibility", "public")
          .eq("review_status", "approved")
      : Promise.resolve({ data: [] as PublishedRow[] }),
  ]);

  const profileById = new Map<string, ProfileRow>(
    ((profiles || []) as ProfileRow[]).map((profile) => [profile.id, profile])
  );
  const publishedBySource = new Map<string, string>();
  for (const row of (publishedRows || []) as PublishedRow[]) {
    if (row.original_exercise_id) publishedBySource.set(row.original_exercise_id, row.id);
  }

  const enriched = proposals.map((proposal) => {
    const status = normalizeStatus(proposal);
    const profile = proposal.user_id ? profileById.get(proposal.user_id) : undefined;
    const publishedId =
      publishedBySource.get(proposal.id) ||
      (proposal.visibility === "public" && status === "approved" ? proposal.id : null);

    return {
      ...proposal,
      normalizedStatus: status,
      proposerName: profile?.display_name || "Utilisateur MyBasket",
      proposerAvatar: profile?.avatar_url || null,
      publishedId,
    };
  });

  const counts = {
    all: enriched.length,
    submitted: enriched.filter((row) => row.normalizedStatus === "submitted").length,
    approved: enriched.filter((row) => row.normalizedStatus === "approved").length,
    rejected: enriched.filter((row) => row.normalizedStatus === "rejected").length,
  };

  const visible = activeStatus === "all"
    ? enriched
    : enriched.filter((row) => row.normalizedStatus === activeStatus);

  return (
    <main className="proposalPage">
      <Link href="/admin" className="back">← Retour Dashboard CEO</Link>

      <div className="heading">
        <div>
          <div className="eyebrow">MODÉRATION BIBLIOTHÈQUE</div>
          <h1>Exercices proposés</h1>
          <p>Toutes les propositions restent visibles ici, même après validation ou refus.</p>
        </div>
        <div className="summary"><strong>{counts.submitted}</strong><span>à valider</span></div>
      </div>

      <nav className="filters" aria-label="Filtrer les propositions">
        <Link className={activeStatus === "all" ? "active" : ""} href="/admin/exercices">Tous <b>{counts.all}</b></Link>
        <Link className={activeStatus === "submitted" ? "active" : ""} href="/admin/exercices?status=submitted">À valider <b>{counts.submitted}</b></Link>
        <Link className={activeStatus === "approved" ? "active" : ""} href="/admin/exercices?status=approved">Validés <b>{counts.approved}</b></Link>
        <Link className={activeStatus === "rejected" ? "active" : ""} href="/admin/exercices?status=rejected">Refusés <b>{counts.rejected}</b></Link>
      </nav>

      <section className="tableBox">
        <div className="tableScroll">
          <table>
            <thead>
              <tr>
                <th>Exercice proposé</th>
                <th>Proposé par</th>
                <th>Date</th>
                <th>Statut</th>
                <th>Bibliothèque</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const theme = row.theme || row.themes?.[0] || "";
                const category = row.category || row.categorie || "";
                const level = row.level || row.niveau || "";
                return (
                  <tr key={row.id}>
                    <td>
                      <strong className="exerciseName">{row.title || "Exercice sans titre"}</strong>
                      <span className="exerciseMeta">{[theme, row.type, category, level].filter(Boolean).join(" · ") || "—"}</span>
                    </td>
                    <td>
                      <div className="author">
                        {row.proposerAvatar ? <img src={row.proposerAvatar} alt="" /> : <span className="avatar">{initials(row.proposerName)}</span>}
                        <strong>{row.proposerName}</strong>
                      </div>
                    </td>
                    <td className="date">{formatDate(row.submitted_at)}</td>
                    <td>
                      {row.normalizedStatus === "submitted" && <span className="badge pending">À valider</span>}
                      {row.normalizedStatus === "approved" && <span className="badge approved">Validé</span>}
                      {row.normalizedStatus === "rejected" && <span className="badge rejected">Refusé</span>}
                    </td>
                    <td>
                      {row.normalizedStatus === "approved" ? (
                        row.publishedId ? <span className="libraryOk">● Publié</span> : <span className="libraryRepair">● À réparer</span>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td>
                      <div className="actions">
                        {row.normalizedStatus === "submitted" && (
                          <>
                            <Link className="secondary" href={`/exercices/${row.id}/modifier?plaquette=1`}>✏️ Modifier dans Plaquette</Link>
                            <form action={publishProposal}>
                              <input type="hidden" name="id" value={row.id} />
                              <button className="primary" type="submit">✓ Valider & publier</button>
                            </form>
                            <form action={rejectProposal}>
                              <input type="hidden" name="id" value={row.id} />
                              <button className="reject" type="submit">Refuser</button>
                            </form>
                          </>
                        )}

                        {row.normalizedStatus === "approved" && (
                          <>
                            {row.publishedId ? (
                              <Link className="primary" href={`/exercices/${row.publishedId}/modifier?plaquette=1`}>✏️ Modifier dans Plaquette</Link>
                            ) : (
                              <form action={repairAndOpen}>
                                <input type="hidden" name="id" value={row.id} />
                                <button className="primary" type="submit">Réparer + ouvrir Plaquette</button>
                              </form>
                            )}
                            {row.publishedId && row.publishedId !== row.id && (
                              <Link className="secondary" href={`/exercices/${row.id}`}>Voir proposition originale</Link>
                            )}
                          </>
                        )}

                        {row.normalizedStatus === "rejected" && (
                          <Link className="secondary" href={`/exercices/${row.id}/modifier?plaquette=1`}>Ouvrir dans Plaquette</Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={6} className="empty">Aucune proposition dans cette catégorie.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style>{`
        .proposalPage{min-height:100vh;background:#f7f7f8;color:#171717;padding:34px;font-family:Roboto,Arial,sans-serif}.back{color:#6B1A2C;text-decoration:none;font-weight:800}.heading{display:flex;justify-content:space-between;align-items:end;gap:24px;margin:26px 0 18px}.eyebrow{font-size:12px;font-weight:900;letter-spacing:.13em;color:#D4A24C}.heading h1{margin:4px 0 6px;font-family:"Alfa Slab One",Georgia,serif;font-size:34px;color:#6B1A2C;font-weight:400}.heading p{margin:0;color:#6b7280;font-weight:600}.summary{display:flex;align-items:baseline;gap:8px;background:#fff;border:1px solid #e6e6e6;border-radius:12px;padding:12px 16px}.summary strong{font-size:26px;color:#6B1A2C}.summary span{font-size:13px;color:#666;font-weight:800}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.filters a{display:inline-flex;gap:7px;align-items:center;min-height:40px;padding:0 13px;border:1px solid #ddd;border-radius:9px;background:#fff;color:#555;text-decoration:none;font-size:13px;font-weight:850}.filters a.active{background:#6B1A2C;border-color:#6B1A2C;color:#fff}.filters b{font-size:11px;padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.07)}.filters a.active b{background:rgba(255,255,255,.18)}.tableBox{background:#fff;border:1px solid #e4e4e4;border-radius:14px;overflow:hidden}.tableScroll{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:1120px}th{text-align:left;background:#fafafa;padding:13px 15px;border-bottom:1px solid #e6e6e6;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.05em}td{padding:14px 15px;border-bottom:1px solid #eee;vertical-align:middle;font-size:13px}.exerciseName{display:block;font-size:14px}.exerciseMeta{display:block;color:#888;margin-top:4px;font-size:11px}.author{display:flex;align-items:center;gap:9px;min-width:180px}.author img,.avatar{width:31px;height:31px;border-radius:50%;object-fit:cover;flex:0 0 31px}.avatar{display:grid;place-items:center;background:#f1e8da;color:#6B1A2C;font-size:10px;font-weight:900}.date{white-space:nowrap;color:#555}.badge{display:inline-flex;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:900;white-space:nowrap}.pending{background:#fff3d8;color:#8a6100}.approved{background:#e8f7ee;color:#14723b}.rejected{background:#fdebed;color:#b42335}.libraryOk{color:#14723b;font-weight:900;font-size:12px}.libraryRepair{color:#9b6500;font-weight:900;font-size:12px}.muted{color:#aaa}.actions{display:flex;flex-wrap:wrap;gap:6px;min-width:310px}.actions form{margin:0}.actions a,.actions button{min-height:36px;padding:0 10px;border:0;border-radius:8px;font:inherit;font-size:11px;font-weight:900;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.primary{background:#6B1A2C;color:#fff}.secondary{background:#efeff0;color:#222}.reject{background:#fdebed;color:#b42335}.empty{text-align:center;padding:38px;color:#777;font-weight:700}@media(max-width:760px){.proposalPage{padding:20px 12px}.heading{align-items:flex-start;flex-direction:column}.heading h1{font-size:28px}.summary{align-self:stretch}}
      `}</style>
    </main>
  );
}
