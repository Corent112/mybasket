import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import styles from "./page.module.css";

type Club = {
  id: string;
  name: string | null;
  logo_url: string | null;
  banner_url: string | null;
  city: string | null;
  status: string | null;
  created_at: string | null;
};

type ClubMember = {
  id: string;
  club_id: string;
  user_id: string;
  role: string | null;
  status: string | null;
};

type Subscription = {
  user_id: string;
  plan_id: string | null;
  status: string | null;
};

type Plan = {
  id: string;
  name: string | null;
  target: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getStatusLabel(status: string | null) {
  if (status === "active") return "Actif";
  if (status === "suspended") return "Suspendu";
  return "Inactif";
}

function getStatusClass(status: string | null) {
  if (status === "active") return styles.active;
  if (status === "suspended") return styles.suspended;
  return styles.inactive;
}

function getInitial(name: string | null) {
  return (name || "C").charAt(0).toUpperCase();
}

async function createClubAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const name = String(formData.get("name") || "").trim();
  const city = String(formData.get("city") || "").trim();

  if (!name) redirect("/admin/clubs?create=1&error=missing-name");

  const { data: club, error } = await supabase
    .from("clubs")
    .insert({
      name,
      city: city || null,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !club) {
    console.error("Erreur création club :", error);
    redirect("/admin/clubs?create=1&error=create-club");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/clubs");

  redirect(`/admin/clubs/${club.id}`);
}

async function updateClubStatusAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "suspended");

  if (!id) return;

  const { error } = await supabase
    .from("clubs")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) console.error("Erreur changement statut club :", error);

  revalidatePath("/admin");
  revalidatePath("/admin/clubs");
}

async function deleteClubAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  await supabase.from("club_members").delete().eq("club_id", id);

  const { error } = await supabase.from("clubs").delete().eq("id", id);

  if (error) console.error("Erreur suppression club :", error);

  revalidatePath("/admin");
  revalidatePath("/admin/clubs");
}

export default async function AdminClubsPage({
  searchParams,
}: {
  searchParams?: Promise<{ create?: string; error?: string }>;
}) {
  const { supabase } = await requireAdmin();

  const params = await searchParams;
  const showCreateForm = params?.create === "1";
  const error = params?.error;

  const { data: clubsData } = await supabase
    .from("clubs")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: clubMembersData } = await supabase
    .from("club_members")
    .select("*");

  const { data: subscriptionsData } = await supabase
    .from("subscriptions")
    .select("*");

  const { data: plansData } = await supabase
    .from("subscription_plans")
    .select("id,name,target");

  const clubs = (clubsData || []) as Club[];
  const clubMembers = (clubMembersData || []) as ClubMember[];
  const subscriptions = (subscriptionsData || []) as Subscription[];
  const plans = (plansData || []) as Plan[];

  const membersByClub = new Map<string, ClubMember[]>();

  for (const member of clubMembers) {
    const list = membersByClub.get(member.club_id) || [];
    list.push(member);
    membersByClub.set(member.club_id, list);
  }

  const subscriptionsByUser = new Map(
    subscriptions.map((subscription) => [subscription.user_id, subscription])
  );

  const plansById = new Map(plans.map((plan) => [plan.id, plan]));

  function getClubPlan(clubId: string) {
    const members = membersByClub.get(clubId) || [];

    const owner =
      members.find((member) => member.role === "owner") ||
      members.find((member) => member.role === "manager") ||
      members[0];

    if (!owner) return null;

    const subscription = subscriptionsByUser.get(owner.user_id);
    if (!subscription?.plan_id || subscription.status !== "active") return null;

    const plan = plansById.get(subscription.plan_id);
    if (plan?.target !== "club") return null;

    return plan;
  }

  const totalClubs = clubs.length;

  const activeClubs = clubs.filter((club) => club.status === "active").length;

  const inactiveClubs = clubs.filter(
    (club) => !club.status || club.status === "inactive"
  ).length;

  const suspendedClubs = clubs.filter(
    (club) => club.status === "suspended"
  ).length;

  const totalCoaches = clubMembers.filter(
    (member) =>
      member.status !== "suspended" &&
      ["coach", "assistant", "manager", "owner"].includes(member.role || "")
  ).length;

  const bronzeClubs = clubs.filter((club) =>
    String(getClubPlan(club.id)?.name || "")
      .toLowerCase()
      .includes("bronze")
  ).length;

  const silverClubs = clubs.filter((club) =>
    String(getClubPlan(club.id)?.name || "")
      .toLowerCase()
      .includes("silver")
  ).length;

  const goldClubs = clubs.filter((club) =>
    String(getClubPlan(club.id)?.name || "")
      .toLowerCase()
      .includes("gold")
  ).length;

  return (
    <main className={styles.adminClubs}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Clubs</h1>
            <span>
              Suivre les clubs inscrits, leurs abonnements, leurs coachs et
              leurs accès.
            </span>
          </div>

          <div className={styles.heroActions}>
            <Link href="/admin/clubs?create=1">+ Créer un club</Link>
            <Link href="/admin/clubs/export">Exporter</Link>
          </div>
        </section>

        {error && (
          <section className={styles.alertCard}>
            Erreur : le club n’a pas pu être créé. Vérifie les tables{" "}
            <strong>clubs</strong>, <strong>club_members</strong> et{" "}
            <strong>profiles</strong>.
          </section>
        )}

        {showCreateForm && (
          <section className={styles.tableCard}>
            <div className={styles.tableHead}>
              <h2>Créer un club</h2>
              <Link href="/admin/clubs">Fermer</Link>
            </div>

            <form action={createClubAction} className={styles.createForm}>
              <input name="name" placeholder="Nom du club" required />
              <input name="city" placeholder="Ville" />
              <button type="submit">Créer le club</button>
            </form>
          </section>
        )}

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{totalClubs}</strong>
            <span>Clubs inscrits</span>
          </div>

          <div className={`${styles.statCard} ${styles.bronze}`}>
            <strong>{bronzeClubs}</strong>
            <span>Bronze</span>
          </div>

          <div className={`${styles.statCard} ${styles.silver}`}>
            <strong>{silverClubs}</strong>
            <span>Silver</span>
          </div>

          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{goldClubs}</strong>
            <span>Gold</span>
          </div>

          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{activeClubs}</strong>
            <span>Actifs</span>
          </div>

          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{inactiveClubs}</strong>
            <span>Inactifs</span>
          </div>

          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{suspendedClubs}</strong>
            <span>Suspendus</span>
          </div>

          <div className={`${styles.statCard} ${styles.dark}`}>
            <strong>{totalCoaches}</strong>
            <span>Coachs rattachés</span>
          </div>
        </section>

        <section className={styles.filters}>
          <input placeholder="Rechercher un club, ville..." />

          <select defaultValue="all">
            <option value="all">Tous les abonnements</option>
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
          </select>

          <select defaultValue="all">
            <option value="all">Tous les statuts</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
            <option value="suspended">Suspendu</option>
          </select>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Liste des clubs</h2>
            <span>{totalClubs} clubs</span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Ville</th>
                  <th>Abonnement</th>
                  <th>Coachs</th>
                  <th>Inscription</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {clubs.map((club) => {
                  const members = membersByClub.get(club.id) || [];
                  const plan = getClubPlan(club.id);

                  const coachesCount = members.filter((member) =>
                    ["coach", "assistant", "manager", "owner"].includes(
                      member.role || ""
                    )
                  ).length;

                  const nextStatus =
                    club.status === "suspended" ? "active" : "suspended";

                  return (
                    <tr key={club.id}>
                      <td>
                        <div className={styles.clubCell}>
                          {club.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={club.logo_url} alt="" />
                          ) : (
                            <div className={styles.logoFallback}>
                              {getInitial(club.name)}
                            </div>
                          )}

                          <div>
                            <strong>{club.name || "Club sans nom"}</strong>
                            <span>ID : {club.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </td>

                      <td>{club.city || "—"}</td>

                      <td>
                        <span className={styles.planBadge}>
                          {plan?.name || "Sans abonnement"}
                        </span>
                      </td>

                      <td>
                        <span className={styles.coachBadge}>
                          {coachesCount} coach{coachesCount > 1 ? "s" : ""}
                        </span>
                      </td>

                      <td>{formatDate(club.created_at)}</td>

                      <td>
                        <span
                          className={`${styles.statusBadge} ${getStatusClass(
                            club.status
                          )}`}
                        >
                          {getStatusLabel(club.status)}
                        </span>
                      </td>

                      <td>
                        <div className={styles.actions}>
                          <Link href={`/admin/clubs/${club.id}`}>Voir</Link>

                          <Link href={`/admin/clubs/${club.id}/modifier`}>
                            Modifier
                          </Link>

                          <form action={updateClubStatusAction}>
                            <input type="hidden" name="id" value={club.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={nextStatus}
                            />
                            <button type="submit">
                              {club.status === "suspended"
                                ? "Réactiver"
                                : "Suspendre"}
                            </button>
                          </form>

                          <form action={deleteClubAction}>
                            <input type="hidden" name="id" value={club.id} />
                            <button type="submit" className={styles.dangerBtn}>
                              Supprimer
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {clubs.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className={styles.emptyState}>
                        Aucun club trouvé.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}