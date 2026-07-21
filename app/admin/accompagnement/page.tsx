import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type AccompagnementRequest = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  club: string | null;
  service_type: string | null;
  message: string | null;
  status: string | null;
  internal_note: string | null;
  created_at: string | null;
};

type SearchParams = Promise<{
  q?: string;
  status?: string;
  sort?: string;
}>;

function formatDate(value: string | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
        }
      : {}),
  }).format(date);
}

function getName(row: AccompagnementRequest) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || "Sans nom";
}

function initials(row: AccompagnementRequest) {
  return getName(row)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";
}

function statusLabel(status: string | null) {
  if (status === "in_progress") return "En cours";
  if (status === "done") return "Traité";
  if (status === "archived") return "Archivé";
  return "Nouveau";
}

function statusClass(status: string | null) {
  if (status === "in_progress") return styles.progressStatus;
  if (status === "done") return styles.doneStatus;
  if (status === "archived") return styles.archivedStatus;
  return styles.newStatus;
}

async function updateAccompagnementStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "in_progress");
  if (!id) return;

  const { error } = await supabase
    .from("accompagnement_requests")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) console.error("ADMIN_REQUEST_STATUS_ERROR", error);
  revalidatePath("/admin");
  revalidatePath("/admin/accompagnement");
  revalidatePath("/admin/scouting-video");
}

async function updateAccompagnementNote(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");
  const internalNote = String(formData.get("internal_note") || "");
  if (!id) return;

  const { error } = await supabase
    .from("accompagnement_requests")
    .update({
      internal_note: internalNote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) console.error("ADMIN_REQUEST_NOTE_ERROR", error);
  revalidatePath("/admin");
  revalidatePath("/admin/accompagnement");
  revalidatePath("/admin/scouting-video");
}

async function deleteAccompagnementRequest(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const { error } = await supabase.from("accompagnement_requests").delete().eq("id", id);
  if (error) console.error("ADMIN_REQUEST_DELETE_ERROR", error);
  revalidatePath("/admin");
  revalidatePath("/admin/accompagnement");
  revalidatePath("/admin/scouting-video");
}

export default async function AdminServiceRequestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = String(params.q || "").trim().toLowerCase();
  const statusFilter = String(params.status || "all");
  const sort = String(params.sort || "newest");

  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("accompagnement_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) console.error("ADMIN_REQUESTS_LOAD_ERROR", error);

  const rows = (data || []) as AccompagnementRequest[];

  const serviceRequests = rows.filter((request) => {
    const service = String(request.service_type || "").toLowerCase();

    if (service.startsWith("direction technique")) return true;

    const isScouting =
      service.includes("scouting") ||
      service.includes("vidéo") ||
      service.includes("video") ||
      service.includes("édition standard") ||
      service.includes("édition scouting") ||
      service.includes("édition luxe") ||
      service.includes("retour performance");

    const isFormation =
      service.includes("formation") ||
      service.includes("mentorat") ||
      service.includes("mentor") ||
      service.includes("tutorat") ||
      service.includes("suivi élite");

    return !isScouting && !isFormation;
  });

  const unfilteredRequests = serviceRequests;

  const total = unfilteredRequests.length;
  const newCount = unfilteredRequests.filter((request) =>
    ["new", "pending", null].includes(request.status)
  ).length;
  const inProgress = unfilteredRequests.filter(
    (request) => request.status === "in_progress"
  ).length;
  const done = unfilteredRequests.filter(
    (request) => request.status === "done"
  ).length;
  const archived = unfilteredRequests.filter(
    (request) => request.status === "archived"
  ).length;

  const requests = unfilteredRequests
    .filter((request) => {
      if (statusFilter !== "all") {
        const normalized =
          ["new", "pending", null].includes(request.status)
            ? "new"
            : request.status;
        if (normalized !== statusFilter) return false;
      }

      if (!q) return true;

      const haystack = [
        getName(request),
        request.email,
        request.phone,
        request.club,
        request.service_type,
        request.message,
        request.internal_note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    })
    .sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sort === "oldest" ? timeA - timeB : timeB - timeA;
    });

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour au dashboard CEO
        </Link>

        <header className={styles.header}>
          <div>
            <h1>Direction technique</h1>
            <p>Gestion des demandes de projet sportif, de structuration de club et d’accompagnement technique.</p>
          </div>

          <div className={styles.adminBadge}>
            <div className={styles.adminAvatar}>CEO</div>
            <div>
              <strong>Administration MyBasket</strong>
              <small>Gestion des demandes</small>
            </div>
          </div>
        </header>

        <section className={styles.stats}>
          <article className={styles.stat}>
            <div className={styles.statIcon}>✉</div>
            <div>
              <strong>{newCount}</strong>
              <span>Nouvelles demandes</span>
              <small>À traiter</small>
            </div>
          </article>

          <article className={styles.stat}>
            <div className={styles.statIcon}>◷</div>
            <div>
              <strong>{inProgress}</strong>
              <span>En cours</span>
              <small>Prises en charge</small>
            </div>
          </article>

          <article className={styles.stat}>
            <div className={styles.statIcon}>✓</div>
            <div>
              <strong>{done}</strong>
              <span>Traitées</span>
              <small>Dossiers terminés</small>
            </div>
          </article>

          <article className={styles.stat}>
            <div className={styles.statIcon}>▣</div>
            <div>
              <strong>{archived}</strong>
              <span>Archivées</span>
              <small>Historique</small>
            </div>
          </article>

          <article className={styles.stat}>
            <div className={styles.statIcon}>◎</div>
            <div>
              <strong>{total}</strong>
              <span>Total</span>
              <small>Toutes les demandes</small>
            </div>
          </article>
        </section>

        <section className={styles.workspace}>
          <div className={styles.toolbar}>
            <nav className={styles.tabs} aria-label="Types de demandes">
              <Link href="/admin/formation" className={`${styles.tab} `}>
                🎓 Formation
              </Link>
              <Link
                href="/admin/accompagnement"
                className={`${styles.tab} ${styles.activeTab}`}>
                🧭 Direction technique
              </Link>
              <Link
                href="/admin/scouting-video"
                className={`${styles.tab} `}>
                🎬 Scouting vidéo
              </Link>
            </nav>

            <form className={styles.filters} method="get">
              <div className={styles.searchWrap}>
                <input
                  type="search"
                  name="q"
                  defaultValue={params.q || ""}
                  className={styles.search}
                  placeholder="Rechercher une demande…"
                />
                <span>⌕</span>
              </div>

              <select
                name="status"
                defaultValue={statusFilter}
                className={styles.select}
                aria-label="Filtrer par statut"
              >
                <option value="all">Tous les statuts</option>
                <option value="new">Nouveau</option>
                <option value="in_progress">En cours</option>
                <option value="done">Traité</option>
                <option value="archived">Archivé</option>
              </select>

              <select
                name="sort"
                defaultValue={sort}
                className={styles.select}
                aria-label="Trier les demandes"
              >
                <option value="newest">Plus récentes</option>
                <option value="oldest">Plus anciennes</option>
              </select>

              <button type="submit" className={styles.filterButton}>
                Appliquer
              </button>

              <Link href="/admin/accompagnement" className={styles.resetButton}>
                Réinitialiser
              </Link>
            </form>
          </div>

          <div className={styles.listHeader}>
            <h2>Demandes de direction technique</h2>
            <span>
              {requests.length} affichée{requests.length > 1 ? "s" : ""} sur {total}
            </span>
          </div>

          <div className={styles.requests}>
            {requests.map((request) => (
              <article key={request.id} className={styles.card}>
                <div className={styles.cardMain}>
                  <aside className={styles.identityColumn}>
                    <div className={styles.person}>
                      <div className={styles.avatar}>{initials(request)}</div>
                      <div>
                        <h3>{getName(request)}</h3>
                        <span
                          className={`${styles.status} ${statusClass(
                            request.status
                          )}`}
                        >
                          {statusLabel(request.status)}
                        </span>
                      </div>
                    </div>

                    <div className={styles.meta}>
                      <div>▣ {formatDate(request.created_at, true)}</div>
                      <div>🏀 {request.club || "Club non renseigné"}</div>
                    </div>

                    <p className={styles.requestId}>
                      ID : #{request.id.slice(0, 8).toUpperCase()}
                    </p>
                  </aside>

                  <section className={styles.contentColumn}>
                    <div className={styles.contactRow}>
                      {request.email ? (
                        <a href={`mailto:${request.email}`}>
                          ✉ {request.email}
                        </a>
                      ) : (
                        <span>✉ E-mail non renseigné</span>
                      )}

                      {request.phone ? (
                        <a href={`tel:${request.phone.replace(/\s/g, "")}`}>
                          ☎ {request.phone}
                        </a>
                      ) : (
                        <span>☎ Téléphone non renseigné</span>
                      )}

                      <span>🏠 Club : {request.club || "Non renseigné"}</span>
                    </div>

                    <p className={styles.typeLabel}>Type de demande</p>
                    <div className={styles.badges}>
                      <span className={styles.badge}>
                        {request.service_type || "Demande générale"}
                      </span>
                    </div>

                    <p className={styles.messageTitle}>Message reçu</p>
                    <div className={styles.message}>
                      {request.message || "Aucun message renseigné."}
                    </div>
                  </section>

                  <aside className={styles.noteColumn}>
                    <form action={updateAccompagnementNote}>
                      <input type="hidden" name="id" value={request.id} />
                      <label htmlFor={`note-${request.id}`}>
                        Notes internes CEO
                      </label>
                      <small>Visible uniquement par l’administration</small>
                      <textarea
                        id={`note-${request.id}`}
                        name="internal_note"
                        defaultValue={request.internal_note || ""}
                        placeholder="Ajouter une note interne…"
                      />
                      <button type="submit" className={styles.saveNote}>
                        Enregistrer la note
                      </button>
                    </form>
                  </aside>
                </div>

                <footer className={styles.actions}>
                  {request.phone ? (
                    <a
                      className={styles.action}
                      href={`tel:${request.phone.replace(/\s/g, "")}`}
                    >
                      ☎ Appeler
                    </a>
                  ) : (
                    <span className={styles.action}>☎ Appeler</span>
                  )}

                  {request.email ? (
                    <a
                      className={styles.action}
                      href={`mailto:${request.email}`}
                    >
                      ✉ Répondre par e-mail
                    </a>
                  ) : (
                    <span className={styles.action}>✉ Répondre</span>
                  )}

                  <form action={updateAccompagnementStatus}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="status" value="in_progress" />
                    <button type="submit" className={styles.take}>
                      ◇ Prendre en charge
                    </button>
                  </form>

                  <form action={updateAccompagnementStatus}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="status" value="done" />
                    <button type="submit" className={styles.done}>
                      ✓ Marquer traité
                    </button>
                  </form>

                  <form action={updateAccompagnementStatus}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="status" value="archived" />
                    <button type="submit">▣ Archiver</button>
                  </form>

                  <form action={deleteAccompagnementRequest}>
                    <input type="hidden" name="id" value={request.id} />
                    <button type="submit" className={styles.danger}>
                      ♲ Supprimer
                    </button>
                  </form>
                </footer>
              </article>
            ))}

            {requests.length === 0 && (
              <div className={styles.empty}>
                Aucune demande ne correspond aux filtres sélectionnés.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
