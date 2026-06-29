import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type FormationRequest = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  club: string | null;
  request_type: string | null;
  message: string | null;
  status: string | null;
  internal_note: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

function getName(row: FormationRequest) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || "Sans nom";
}

function statusLabel(status: string | null) {
  if (status === "new") return "Nouveau";
  if (status === "pending") return "À traiter";
  if (status === "in_progress") return "En cours";
  if (status === "done") return "Traité";
  if (status === "archived") return "Archivé";
  return "Nouveau";
}

function statusClass(status: string | null) {
  if (status === "done") return styles.green;
  if (status === "in_progress") return styles.orange;
  if (status === "archived") return styles.dark;
  return styles.red;
}

async function updateFormationStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "in_progress");

  if (!id) return;

  await supabase
    .from("formation_requests")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/admin/formation");
}

async function updateFormationNote(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const internalNote = String(formData.get("internal_note") || "");

  if (!id) return;

  await supabase
    .from("formation_requests")
    .update({
      internal_note: internalNote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/formation");
}

async function deleteFormationRequest(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");

  if (!id) return;

  await supabase.from("formation_requests").delete().eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/admin/formation");
}

export default async function AdminFormationPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("formation_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const requests = (data || []) as FormationRequest[];

  const total = requests.length;
  const newCount = requests.filter((r) =>
    ["new", "pending", null].includes(r.status)
  ).length;
  const inProgress = requests.filter((r) => r.status === "in_progress").length;
  const done = requests.filter((r) => r.status === "done").length;
  const archived = requests.filter((r) => r.status === "archived").length;

  return (
    <main className={styles.adminFormation}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Formation</h1>
            <span>
              Centralise les demandes de mentorat, tutorat, formation coach et
              accompagnement pédagogique.
            </span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{total}</strong>
            <span>Demandes</span>
          </div>

          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{newCount}</strong>
            <span>À traiter</span>
          </div>

          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{inProgress}</strong>
            <span>En cours</span>
          </div>

          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{done}</strong>
            <span>Traitées</span>
          </div>

          <div className={`${styles.statCard} ${styles.dark}`}>
            <strong>{archived}</strong>
            <span>Archivées</span>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Demandes de formation</h2>
            <span>{total} demandes</span>
          </div>

          <div className={styles.grid}>
            {requests.map((request) => (
              <article key={request.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span
                    className={`${styles.statusBadge} ${statusClass(
                      request.status
                    )}`}
                  >
                    {statusLabel(request.status)}
                  </span>

                  <span className={styles.date}>
                    {formatDate(request.created_at)}
                  </span>
                </div>

                <h2>{getName(request)}</h2>

                <div className={styles.meta}>
                  <span>{request.email || "Email non renseigné"}</span>
                  <span>{request.phone || "Téléphone non renseigné"}</span>
                  <span>{request.club || "Club non renseigné"}</span>
                  <span>{request.request_type || "Demande générale"}</span>
                </div>

                {request.message && <p className={styles.message}>{request.message}</p>}

                <form action={updateFormationNote} className={styles.noteForm}>
                  <input type="hidden" name="id" value={request.id} />
                  <textarea
                    name="internal_note"
                    defaultValue={request.internal_note || ""}
                    placeholder="Note interne CEO..."
                    rows={3}
                  />
                  <button type="submit">Enregistrer la note</button>
                </form>

                <div className={styles.actions}>
                  <form action={updateFormationStatus}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="status" value="in_progress" />
                    <button type="submit">Prendre en charge</button>
                  </form>

                  <form action={updateFormationStatus}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="status" value="done" />
                    <button type="submit">Marquer traité</button>
                  </form>

                  <form action={updateFormationStatus}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="status" value="archived" />
                    <button type="submit">Archiver</button>
                  </form>

                  <form action={deleteFormationRequest}>
                    <input type="hidden" name="id" value={request.id} />
                    <button type="submit" className={styles.dangerBtn}>
                      Supprimer
                    </button>
                  </form>
                </div>
              </article>
            ))}

            {requests.length === 0 && (
              <div className={styles.emptyState}>
                Aucune demande de formation pour le moment.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}