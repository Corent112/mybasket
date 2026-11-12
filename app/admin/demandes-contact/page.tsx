import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin-server";
import styles from "../slider/page.module.css";

async function handleRequest(formData: FormData) {
  "use server";
  await requireAdmin();
  const db = createAdminClient();
  if (!db) throw new Error("Administration indisponible.");
  const id = String(formData.get("id") || "");
  if (!/^[a-f\d-]{36}$/i.test(id)) return;
  const { error } = await db.from("contact_requests").update({
    handled_at: formData.get("reopen") ? null : new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error("Impossible de modifier le statut.");
  revalidatePath("/admin/demandes-contact");
}

export default async function ContactRequestsPage({ searchParams }: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const db = createAdminClient();
  const value = Number((await searchParams).page);
  const page = Number.isSafeInteger(value) && value > 0 && value <= 10000 ? value : 1;
  const offset = (page - 1) * 30;
  const result = await db?.from("contact_requests").select("*", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + 29);
  const requests = result?.data ?? [];

  return (
    <main className={styles.adminSlider}><div className={styles.container}>
      <Link href="/admin" className={styles.backLink}>← Administration</Link>
      <section className={styles.hero}><div><h1>Demandes de contact</h1></div></section>
      {(!result || result.error) && <p role="alert">Les demandes ne sont pas accessibles actuellement.</p>}
      {result && !result.error && !requests.length && <p>Aucune demande sur cette page.</p>}
      <section className={styles.slidesGrid}>
        {requests.map((request) => (
          <article key={request.id} className={styles.card}>
            <h2>{request.subject}</h2>
            <p><strong>{request.first_name} {request.last_name}</strong>{request.organization && ` · ${request.organization}`}</p>
            <p><a href={`mailto:${encodeURIComponent(request.email)}`}>{request.email}</a>{request.phone && ` · ${request.phone}`}</p>
            <p>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(request.created_at))}</p>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{request.message}</p>
            <p>{request.handled_at ? "Traitée" : "À traiter"} · {request.notified_at ? "Notification acceptée par le service d’envoi" : "Envoi de la notification non confirmé"}</p>
            <form action={handleRequest} className={styles.form}>
              <input type="hidden" name="id" value={request.id} />
              {request.handled_at && <input type="hidden" name="reopen" value="1" />}
              <button type="submit">{request.handled_at ? "Rouvrir" : "Marquer comme traitée"}</button>
            </form>
          </article>
        ))}
      </section>
      <nav aria-label="Pages des demandes">
        {page > 1 && <Link href={`?page=${page - 1}`}>← Précédente</Link>}
        {(result?.count ?? 0) > offset + 30 && <Link href={`?page=${page + 1}`}> Suivante →</Link>}
      </nav>
    </div></main>
  );
}
