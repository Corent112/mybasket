import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type SystemProposal = {
  id: string;
  user_id: string | null;
  title: string | null;
  objectif: string | null;
  organisation: string | null;
  deroulement: string | null;
  consignes: string | null;
  variantes: string | null;
  famille: string | null;
  categorie: string | null;
  type: string | null;
  temps_forts: string[] | null;
  tags: string[] | null;
  images: string[] | null;
  videos: string[] | null;
  schema_image: string | null;
  schema_images: string[] | null;
  schema_video: string | null;
  schema_data: unknown;
  schema_data_list: unknown;
  play_ids: string[] | null;
  status: string | null;
  review_status: string | null;
  visibility: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  original_system_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

function getStatus(row: SystemProposal) {
  return row.review_status || row.status || "submitted";
}

function statusLabel(status: string) {
  if (status === "approved" || status === "published") return "Validé";
  if (status === "rejected") return "Refusé";
  if (status === "draft") return "Brouillon";
  return "À valider";
}

function statusClass(status: string) {
  if (status === "approved" || status === "published") return styles.active;
  if (status === "rejected") return styles.danger;
  if (status === "draft") return styles.neutral;
  return styles.pending;
}

function revalidateSystemPages() {
  revalidatePath("/admin");
  revalidatePath("/admin/systemes");
  revalidatePath("/systemes");
}

async function approveSystemProposal(formData: FormData) {
  "use server";

  const { supabase, user } = await requireAdmin();
  const id = String(formData.get("id") || "");

  if (!id) return;

  const { data, error } = await supabase
    .from("systems")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    console.error("Proposition système introuvable", error);
    return;
  }

  const proposal = data as SystemProposal;

  if (proposal.review_status !== "submitted") {
    revalidateSystemPages();
    return;
  }

  const { data: officialExisting, error: officialLookupError } = await supabase
    .from("systems")
    .select("id")
    .eq("original_system_id", proposal.id)
    .eq("visibility", "public")
    .eq("review_status", "approved")
    .maybeSingle();

  if (officialLookupError) {
    console.error("Recherche copie officielle système impossible", officialLookupError);
    return;
  }

  const now = new Date().toISOString();

  if (!officialExisting) {
    const { error: insertError } = await supabase.from("systems").insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      title: proposal.title ?? "",
      objectif: proposal.objectif ?? "",
      organisation: proposal.organisation ?? "",
      deroulement: proposal.deroulement ?? "",
      consignes: proposal.consignes ?? "",
      variantes: proposal.variantes ?? "",
      famille: proposal.famille ?? "",
      categorie: proposal.categorie ?? "",
      type: proposal.type ?? "",
      temps_forts: proposal.temps_forts ?? [],
      tags: proposal.tags ?? [],
      images: proposal.images ?? [],
      videos: proposal.videos ?? [],
      schema_image: proposal.schema_image ?? "",
      schema_images: proposal.schema_images ?? [],
      schema_video: proposal.schema_video ?? "",
      schema_data: proposal.schema_data ?? null,
      schema_data_list: proposal.schema_data_list ?? [],
      play_ids: [],
      visibility: "public",
      status: "approved",
      review_status: "approved",
      original_system_id: proposal.id,
      submitted_at: null,
      reviewed_at: now,
      reviewed_by: user.id,
      rejection_reason: null,
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      console.error("Publication système MyBasket impossible", insertError);
      return;
    }
  }

  const { error: updateError } = await supabase
    .from("systems")
    .update({
      visibility: "private",
      status: "approved",
      review_status: "approved",
      reviewed_at: now,
      reviewed_by: user.id,
      rejection_reason: null,
      updated_at: now,
    })
    .eq("id", proposal.id);

  if (updateError) {
    console.error("Validation proposition système impossible", updateError);
    return;
  }

  revalidateSystemPages();
}

async function rejectSystemProposal(formData: FormData) {
  "use server";

  const { supabase, user } = await requireAdmin();
  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "").trim();

  if (!id) return;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("systems")
    .update({
      visibility: "private",
      status: "rejected",
      review_status: "rejected",
      reviewed_at: now,
      reviewed_by: user.id,
      rejection_reason: reason || null,
      updated_at: now,
    })
    .eq("id", id);

  if (error) {
    console.error("Refus proposition système impossible", error);
    return;
  }

  revalidateSystemPages();
}

async function deleteSystemProposal(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");

  if (!id) return;

  const { error } = await supabase.from("systems").delete().eq("id", id);

  if (error) {
    console.error("Suppression proposition système impossible", error);
    return;
  }

  revalidateSystemPages();
}

export default async function AdminSystemesPage() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("systems")
    .select("*")
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Chargement propositions systèmes impossible", error);
  }

  const systems = (data || []) as SystemProposal[];

  const total = systems.length;
  const pending = systems.filter((s) => getStatus(s) === "submitted").length;
  const approved = systems.filter((s) =>
    ["approved", "published"].includes(getStatus(s))
  ).length;
  const rejected = systems.filter((s) => getStatus(s) === "rejected").length;

  return (
    <main className={styles.adminModeration}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Modération bibliothèque</p>
            <h1>Systèmes</h1>
            <span>
              Revois les systèmes proposés par les utilisateurs, corrige-les si
              besoin puis valide leur publication dans la bibliothèque MyBasket.
            </span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{total}</strong>
            <span>Propositions</span>
          </div>
          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{pending}</strong>
            <span>À valider</span>
          </div>
          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{approved}</strong>
            <span>Validées</span>
          </div>
          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{rejected}</strong>
            <span>Refusées</span>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Systèmes proposés</h2>
            <span>{total} proposition{total > 1 ? "s" : ""}</span>
          </div>

          <div className={styles.grid}>
            {systems.map((system) => {
              const status = getStatus(system);

              return (
                <article key={system.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span
                      className={`${styles.statusBadge} ${statusClass(status)}`}
                    >
                      {statusLabel(status)}
                    </span>
                    <span className={styles.date}>
                      {formatDate(system.submitted_at || system.created_at)}
                    </span>
                  </div>

                  <h2>{system.title || "Système sans titre"}</h2>

                  <div className={styles.meta}>
                    <span>{system.type || "Type —"}</span>
                    <span>{system.categorie || "Catégorie —"}</span>
                    <span>{system.objectif || "Objectif —"}</span>
                  </div>

                  {system.organisation && (
                    <p className={styles.desc}>
                      {system.organisation.slice(0, 220)}
                    </p>
                  )}

                  {system.rejection_reason && status === "rejected" && (
                    <p className={styles.desc}>
                      Motif du refus : {system.rejection_reason}
                    </p>
                  )}

                  <div className={styles.actions}>
                    <Link href={`/systemes/${system.id}`}>Voir</Link>

                    {status === "submitted" && (
                      <Link href={`/systemes/creer?id=${system.id}`}>
                        Revoir / modifier
                      </Link>
                    )}

                    {status === "submitted" && (
                      <form action={approveSystemProposal}>
                        <input type="hidden" name="id" value={system.id} />
                        <button type="submit">Valider / Publier</button>
                      </form>
                    )}

                    {status === "submitted" && (
                      <form action={rejectSystemProposal}>
                        <input type="hidden" name="id" value={system.id} />
                        <input
                          type="text"
                          name="reason"
                          placeholder="Motif du refus (facultatif)"
                        />
                        <button type="submit">Refuser</button>
                      </form>
                    )}

                    <form action={deleteSystemProposal}>
                      <input type="hidden" name="id" value={system.id} />
                      <button type="submit" className={styles.dangerBtn}>
                        Supprimer
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}

            {systems.length === 0 && (
              <div className={styles.emptyState}>
                Aucune proposition de système pour le moment.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
