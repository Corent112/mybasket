import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getCoachCommissionRate } from "@/lib/coach-commission";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type CoachProfile = {
  id: string;
  user_id: string;
  city: string | null;
  speciality: string | null;
  status: string | null;
  created_at: string | null;
};

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
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

type Booking = {
  id: string;
  coach_id: string;
  price_cents: number | null;
  commission_amount_cents: number | null;
  coach_amount_cents: number | null;
  status: string | null;
  created_at: string | null;
};

type Announcement = {
  id: string;
  coach_id: string;
  status: string | null;
};

async function updateCoachStatus(formData: FormData) {
  "use server";

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");

  if (!id || !status) return;

  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("coach_profiles")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Erreur update statut coach :", error);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/coachs");
}

async function deleteCoachProfile(formData: FormData) {
  "use server";

  const id = String(formData.get("id") || "");
  if (!id) return;

  const { supabase } = await requireAdmin();

  const { error } = await supabase.from("coach_profiles").delete().eq("id", id);

  if (error) {
    console.error("Erreur suppression coach :", error);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/coachs");
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function getInitial(name: string | null, email: string | null) {
  return (name || email || "C").charAt(0).toUpperCase();
}

function getStatusLabel(status: string | null) {
  if (status === "active") return "Actif";
  if (status === "pending") return "En attente";
  if (status === "rejected") return "Refusé";
  if (status === "suspended") return "Suspendu";
  return "Inactif";
}

function getStatusClass(status: string | null) {
  if (status === "active") return styles.active;
  if (status === "pending") return styles.pending;
  if (status === "suspended" || status === "rejected") {
    return styles.suspended;
  }
  return styles.inactive;
}

export default async function AdminCoachsPage() {
  const { supabase } = await requireAdmin();

  const { data: coachProfilesData } = await supabase
    .from("coach_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const coachProfiles = (coachProfilesData || []) as CoachProfile[];

  const coachUserIds = coachProfiles.map((coach) => coach.user_id);
  const coachIds = coachProfiles.map((coach) => coach.id);

  const { data: profilesData } =
    coachUserIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id,email,display_name,avatar_url,status")
          .in("id", coachUserIds)
      : { data: [] };

  const { data: subscriptionsData } =
    coachUserIds.length > 0
      ? await supabase
          .from("subscriptions")
          .select("user_id,plan_id,status")
          .in("user_id", coachUserIds)
      : { data: [] };

  const { data: plansData } = await supabase
    .from("subscription_plans")
    .select("id,name,target");

  const { data: bookingsData } =
    coachIds.length > 0
      ? await supabase
          .from("coach_bookings")
          .select(
            "id,coach_id,price_cents,commission_amount_cents,coach_amount_cents,status,created_at"
          )
          .in("coach_id", coachIds)
      : { data: [] };

  const { data: announcementsData } =
    coachIds.length > 0
      ? await supabase
          .from("coach_announcements")
          .select("id,coach_id,status")
          .in("coach_id", coachIds)
      : { data: [] };

  const profiles = (profilesData || []) as Profile[];
  const subscriptions = (subscriptionsData || []) as Subscription[];
  const plans = (plansData || []) as Plan[];
  const bookings = (bookingsData || []) as Booking[];
  const announcements = (announcementsData || []) as Announcement[];

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  const subscriptionsByUser = new Map(
    subscriptions.map((subscription) => [subscription.user_id, subscription])
  );

  const plansById = new Map(plans.map((plan) => [plan.id, plan]));

  const bookingsByCoach = new Map<string, Booking[]>();
  for (const booking of bookings) {
    const list = bookingsByCoach.get(booking.coach_id) || [];
    list.push(booking);
    bookingsByCoach.set(booking.coach_id, list);
  }

  const announcementsByCoach = new Map<string, Announcement[]>();
  for (const announcement of announcements) {
    const list = announcementsByCoach.get(announcement.coach_id) || [];
    list.push(announcement);
    announcementsByCoach.set(announcement.coach_id, list);
  }

  const totalCoachs = coachProfiles.length;
  const pendingCoachs = coachProfiles.filter(
    (coach) => coach.status === "pending"
  ).length;
  const activeCoachs = coachProfiles.filter(
    (coach) => coach.status === "active"
  ).length;
  const suspendedCoachs = coachProfiles.filter(
    (coach) => coach.status === "suspended"
  ).length;
  const rejectedCoachs = coachProfiles.filter(
    (coach) => coach.status === "rejected"
  ).length;

  const pendingAnnouncements = announcements.filter(
    (announcement) => announcement.status === "pending"
  ).length;

  const approvedAnnouncements = announcements.filter(
    (announcement) =>
      announcement.status === "approved" || announcement.status === "published"
  ).length;

  const totalRevenueCents = bookings.reduce(
    (sum, booking) => sum + (booking.price_cents || 0),
    0
  );

  const totalCommissionCents = bookings.reduce(
    (sum, booking) => sum + (booking.commission_amount_cents || 0),
    0
  );

  const totalCoachAmountCents = bookings.reduce(
    (sum, booking) => sum + (booking.coach_amount_cents || 0),
    0
  );

  return (
    <main className={styles.adminCoachs}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Coachs individuels</h1>
            <span>
              Valider les profils, suivre les annonces, les réservations, les
              revenus et les commissions.
            </span>
          </div>

          <div className={styles.heroActions}>
            <Link href="/admin/coachs/export">Exporter</Link>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{totalCoachs}</strong>
            <span>Coachs inscrits</span>
          </div>

          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{pendingCoachs}</strong>
            <span>En attente</span>
          </div>

          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{activeCoachs}</strong>
            <span>Actifs</span>
          </div>

          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{suspendedCoachs}</strong>
            <span>Suspendus</span>
          </div>

          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{rejectedCoachs}</strong>
            <span>Refusés</span>
          </div>

          <div className={`${styles.statCard} ${styles.purple}`}>
            <strong>{pendingAnnouncements}</strong>
            <span>Annonces à valider</span>
          </div>

          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{approvedAnnouncements}</strong>
            <span>Annonces validées</span>
          </div>

          <div className={`${styles.statCard} ${styles.money}`}>
            <strong>{formatEuro(totalCommissionCents)}</strong>
            <span>Commission MB</span>
          </div>
        </section>

        <section className={styles.filters}>
          <input placeholder="Rechercher un coach, ville, spécialité..." />

          <select defaultValue="all">
            <option value="all">Tous les abonnements</option>
            <option value="free">Sans abonnement</option>
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="premium">Premium</option>
          </select>

          <select defaultValue="all">
            <option value="all">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="active">Actif</option>
            <option value="rejected">Refusé</option>
            <option value="suspended">Suspendu</option>
          </select>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Profils coachs individuels</h2>
            <span>
              {formatEuro(totalRevenueCents)} générés ·{" "}
              {formatEuro(totalCoachAmountCents)} reversés
            </span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Coach</th>
                  <th>Ville</th>
                  <th>Spécialité</th>
                  <th>Abonnement</th>
                  <th>Commission</th>
                  <th>Annonces</th>
                  <th>Réservations</th>
                  <th>CA généré</th>
                  <th>Net coach</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {coachProfiles.map((coach) => {
                  const profile = profilesById.get(coach.user_id);

                  const subscription = subscriptionsByUser.get(coach.user_id);
                  const plan =
                    subscription?.plan_id && subscription.status === "active"
                      ? plansById.get(subscription.plan_id)
                      : null;

                  const planName = plan?.name || "Sans abonnement";
                  const commissionRate = getCoachCommissionRate(plan?.name);

                  const coachBookings = bookingsByCoach.get(coach.id) || [];
                  const coachAnnouncements =
                    announcementsByCoach.get(coach.id) || [];

                  const revenueCents = coachBookings.reduce(
                    (sum, booking) => sum + (booking.price_cents || 0),
                    0
                  );

                  const coachNetCents = coachBookings.reduce(
                    (sum, booking) => sum + (booking.coach_amount_cents || 0),
                    0
                  );

                  return (
                    <tr key={coach.id}>
                      <td>
                        <div className={styles.coachCell}>
                          {profile?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.avatar_url} alt="" />
                          ) : (
                            <div className={styles.avatar}>
                              {getInitial(
                                profile?.display_name || null,
                                profile?.email || null
                              )}
                            </div>
                          )}

                          <div>
                            <strong>
                              {profile?.display_name || "Sans nom"}
                            </strong>
                            <span>{profile?.email || "Email non renseigné"}</span>
                          </div>
                        </div>
                      </td>

                      <td>{coach.city || "—"}</td>
                      <td>{coach.speciality || "Non renseignée"}</td>

                      <td>
                        <span className={styles.planBadge}>{planName}</span>
                      </td>

                      <td>
                        <span className={styles.commissionBadge}>
                          {commissionRate}%
                        </span>
                      </td>

                      <td>{coachAnnouncements.length}</td>
                      <td>{coachBookings.length}</td>
                      <td>{formatEuro(revenueCents)}</td>
                      <td>{formatEuro(coachNetCents)}</td>

                      <td>
                        <span
                          className={`${styles.statusBadge} ${getStatusClass(
                            coach.status
                          )}`}
                        >
                          {getStatusLabel(coach.status)}
                        </span>
                      </td>

                      <td>
                        <div className={styles.actions}>
                          <Link href={`/admin/coachs/${coach.id}`}>Voir</Link>

                          <Link href={`/admin/coachs/${coach.id}/modifier`}>
                            Modifier
                          </Link>

                          {coach.status !== "active" && (
                            <form action={updateCoachStatus}>
                              <input type="hidden" name="id" value={coach.id} />
                              <input
                                type="hidden"
                                name="status"
                                value="active"
                              />
                              <button type="submit">Valider</button>
                            </form>
                          )}

                          {coach.status !== "rejected" && (
                            <form action={updateCoachStatus}>
                              <input type="hidden" name="id" value={coach.id} />
                              <input
                                type="hidden"
                                name="status"
                                value="rejected"
                              />
                              <button type="submit">Refuser</button>
                            </form>
                          )}

                          {coach.status === "suspended" ? (
                            <form action={updateCoachStatus}>
                              <input type="hidden" name="id" value={coach.id} />
                              <input
                                type="hidden"
                                name="status"
                                value="active"
                              />
                              <button type="submit">Réactiver</button>
                            </form>
                          ) : (
                            <form action={updateCoachStatus}>
                              <input type="hidden" name="id" value={coach.id} />
                              <input
                                type="hidden"
                                name="status"
                                value="suspended"
                              />
                              <button type="submit">Suspendre</button>
                            </form>
                          )}

                          <form action={deleteCoachProfile}>
                            <input type="hidden" name="id" value={coach.id} />
                            <button type="submit" className={styles.dangerBtn}>
                              Supprimer
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {coachProfiles.length === 0 && (
                  <tr>
                    <td colSpan={11}>
                      <div className={styles.emptyState}>
                        Aucun coach individuel trouvé.
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