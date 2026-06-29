import Link from "next/link";
import styles from "./page.module.css";

import { requireAdmin } from "@/lib/admin/guard";
type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  platform_role: string | null;
  status: string | null;
  club: string | null;
  avatar_url: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type Subscription = {
  user_id: string;
  plan_id: string | null;
  status: string | null;
};

type Plan = {
  id: string;
  name: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Jamais";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getInitial(name: string | null, email: string | null) {
  return (name || email || "U").charAt(0).toUpperCase();
}

function getRoleLabel(role: string | null) {
  if (role === "ceo") return "CEO";
  if (role === "superadmin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "coach") return "Coach";
  if (role === "club") return "Club";
  return "Utilisateur";
}

function getStatusLabel(status: string | null) {
  if (status === "active") return "Actif";
  if (status === "inactive") return "Inactif";
  if (status === "suspended") return "Suspendu";
  return "Inactif";
}

function getStatusClass(status: string | null) {
  if (status === "active") return styles.active;
  if (status === "suspended") return styles.suspended;
  return styles.inactive;
}

export default async function AdminUtilisateursPage() {
  const { supabase } = await requireAdmin();

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: subscriptionsData } = await supabase
    .from("subscriptions")
    .select("*");

  const { data: plansData } = await supabase
    .from("subscription_plans")
    .select("id,name");

  const profiles = (profilesData || []) as Profile[];
  const subscriptions = (subscriptionsData || []) as Subscription[];
  const plans = (plansData || []) as Plan[];

  const subscriptionsByUser = new Map(
    subscriptions.map((subscription) => [subscription.user_id, subscription])
  );

  const plansById = new Map(plans.map((plan) => [plan.id, plan]));

  const totalUsers = profiles.length;
  const coaches = profiles.filter((user) =>
    ["coach", "ceo", "superadmin", "admin"].includes(user.platform_role || "")
  ).length;
  const activeUsers = profiles.filter((user) => user.status === "active").length;
  const inactiveUsers = profiles.filter(
    (user) => !user.status || user.status === "inactive"
  ).length;
  const suspendedUsers = profiles.filter(
    (user) => user.status === "suspended"
  ).length;
  const subscribedUsers = subscriptions.filter(
    (subscription) => subscription.status === "active"
  ).length;
  const neverConnected = profiles.filter((user) => !user.last_sign_in_at).length;

  return (
    <main className={styles.adminUsers}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard Admin
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Utilisateurs</h1>
            <span>Gérer les comptes, rôles, statuts et abonnements.</span>
          </div>

          <div className={styles.heroActions}>
            <button type="button">+ Créer un utilisateur</button>
            <button type="button">Exporter</button>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{totalUsers}</strong>
            <span>Utilisateurs inscrits</span>
          </div>
          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{coaches}</strong>
            <span>Entraîneurs</span>
          </div>
          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{activeUsers}</strong>
            <span>Actifs</span>
          </div>
          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{inactiveUsers}</strong>
            <span>Inactifs</span>
          </div>
          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{suspendedUsers}</strong>
            <span>Suspendus</span>
          </div>
          <div className={`${styles.statCard} ${styles.purple}`}>
            <strong>{subscribedUsers}</strong>
            <span>Abonnés</span>
          </div>
          <div className={`${styles.statCard} ${styles.dark}`}>
            <strong>{neverConnected}</strong>
            <span>Jamais connectés</span>
          </div>
        </section>

        <section className={styles.filters}>
          <input placeholder="Rechercher un utilisateur, email..." />
          <select defaultValue="all">
            <option value="all">Tous les rôles</option>
            <option value="user">Utilisateur</option>
            <option value="coach">Coach</option>
            <option value="club">Club</option>
            <option value="admin">Admin</option>
            <option value="superadmin">Super Admin</option>
            <option value="ceo">CEO</option>
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
            <h2>Liste des utilisateurs</h2>
            <span>{totalUsers} comptes</span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Abonnement</th>
                  <th>Inscription</th>
                  <th>Dernière connexion</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {profiles.map((user) => {
                  const subscription = subscriptionsByUser.get(user.id);
                  const plan = subscription?.plan_id
                    ? plansById.get(subscription.plan_id)
                    : null;

                  return (
                    <tr key={user.id}>
                      <td>
                        <div className={styles.userCell}>
                          {user.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={user.avatar_url} alt="" />
                          ) : (
                            <div className={styles.avatar}>
                              {getInitial(user.display_name, user.email)}
                            </div>
                          )}

                          <div>
                            <strong>{user.display_name || "Sans nom"}</strong>
                            <span>{user.club || "Compte individuel"}</span>
                          </div>
                        </div>
                      </td>

                      <td>{user.email || "—"}</td>

                      <td>
                        <span className={styles.roleBadge}>
                          {getRoleLabel(user.platform_role)}
                        </span>
                      </td>

                      <td>
                        <span className={styles.planBadge}>
                          {plan?.name || "Sans abonnement"}
                        </span>
                      </td>

                      <td>{formatDate(user.created_at)}</td>
                      <td>{formatDate(user.last_sign_in_at)}</td>

                      <td>
                        <span
                          className={`${styles.statusBadge} ${getStatusClass(
                            user.status
                          )}`}
                        >
                          {getStatusLabel(user.status)}
                        </span>
                      </td>

                      <td>
                        <div className={styles.actions}>
                          <Link href={`/admin/utilisateurs/${user.id}`}>
                            Voir
                          </Link>
                          <button type="button">Modifier</button>
                          <button type="button">Suspendre</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {profiles.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.emptyState}>
                        Aucun utilisateur trouvé.
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