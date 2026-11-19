import { applyAdminUserPlan } from "@/lib/admin/apply-user-plan";
import Link from "next/link";
import styles from "./page.module.css";
import { revalidatePath } from "next/cache";
import DeleteUserButton from "./DeleteUserButton";
import DirectoryRefresh from "./DirectoryRefresh";
import { buildUserDirectory, formatLastConnection, matchesDirectoryFilters, type DirectorySource } from "@/lib/admin/user-directory";
import {readAllAuthUsers,readAdminRows,resolveAdminUserSubscription} from "@/lib/admin/user-subscriptions";

import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { getSiteUrl } from "@/lib/site-url";

type Plan = {
  id: string;
  name: string | null;
  slug?: string | null;
  target?: string | null;
  sort_order?: number | null;
  status?: string | null;
};

function formatDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";

  return new Date(value).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
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
  if (status === "contact") return "Sans compte";
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

async function createUserAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") || "").trim();
  const platformRole = String(formData.get("platform_role") || "user");

  if (!email) return;

  const allowedRoles = new Set(["user", "coach", "club", "admin"]);
  const role = allowedRoles.has(platformRole) ? platformRole : "user";

  const adminClient = createAdminClient();
  if (!adminClient) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquante : impossible de créer l’utilisateur.",
    );
  }

  const authUsers = await readAllAuthUsers(adminClient);
  let authUser = authUsers.find(
    (candidate) => candidate.email?.trim().toLowerCase() === email,
  );

  if (!authUser) {
    const siteUrl = getSiteUrl();

    const { data: invited, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(
          "/mon-compte",
        )}`,
        data: {
          display_name: displayName,
        },
      });

    if (inviteError) throw inviteError;
    authUser = invited.user;
  }

  if (!authUser) return;

  const { error: profileError } = await adminClient.from("profiles").upsert(
    {
      id: authUser.id,
      email,
      display_name: displayName || null,
      platform_role: role,
      status: "active",
    },
    { onConflict: "id" },
  );

  if (profileError) throw profileError;

  revalidatePath("/admin");
  revalidatePath("/admin/utilisateurs");
}


async function changeSubscriptionAction(formData: FormData) {
  "use server";

  await requireAdmin();
  const userId = String(formData.get("user_id") || "").trim();
  const planId = String(formData.get("plan_id") || "").trim();
  if (!userId || !planId) return;

  const adminClient = createAdminClient();
  if (!adminClient) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante : modification impossible.");
  }

  const { data: targetProfile } = await adminClient
    .from("profiles")
    .select("platform_role")
    .eq("id", userId)
    .maybeSingle();

  // Les accès CEO / superadmin restent indépendants des abonnements commerciaux.
  if (["ceo", "superadmin"].includes(String(targetProfile?.platform_role || ""))) return;

  const { data: plan, error: planError } = await adminClient
    .from("subscription_plans")
    .select("id,slug,name")
    .eq("id", planId)
    .eq("status", "active")
    .maybeSingle();
  if (planError) throw planError;
  if (!plan?.id) throw new Error("Abonnement introuvable ou inactif.");

  await applyAdminUserPlan(adminClient, userId, plan);

  revalidatePath("/admin/utilisateurs");
  revalidatePath("/admin/paiements");
  revalidatePath("/mon-compte");
  revalidatePath("/institutionnel");
}

async function deleteUserAction(formData: FormData) {
  "use server";

  const { user: currentUser } = await requireAdmin();
  const userId = String(formData.get("user_id") || "");
  if (!userId || userId === currentUser.id) return;

  const adminClient = createAdminClient();
  if (!adminClient) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante : suppression impossible.");
  }

  const { data: targetProfile } = await adminClient
    .from("profiles")
    .select("email,platform_role")
    .eq("id", userId)
    .maybeSingle();

  if (["ceo", "superadmin"].includes(String(targetProfile?.platform_role || ""))) {
    return;
  }

  const email = String(targetProfile?.email || "").trim().toLowerCase();

  // Nettoie uniquement les données d’accès administratives. Les contenus métier
  // restent gérés par les règles FK/cascade existantes du projet.
  await adminClient.from("subscriptions").delete().eq("user_id", userId);
  if (email) {
    await adminClient.from("free_access_grants").delete().eq("user_email", email);
  }

  const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
  if (authError) throw authError;

  // Selon le schéma, profiles peut déjà avoir été supprimé par cascade.
  await adminClient.from("profiles").delete().eq("id", userId);

  revalidatePath("/admin");
  revalidatePath("/admin/utilisateurs");
  revalidatePath("/admin/paiements");
}

export default async function AdminUtilisateursPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, user: currentUser } = await requireAdmin();
  const query = await searchParams;
  const param = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const filters = { q: param("q"), role: param("role") || "all", status: param("status") || "all", category: param("category") || "subscribers" };
  const adminClient = createAdminClient({ noStore: true });
  const readClient = adminClient || supabase;
  const warnings: string[] = [];
  const optionalRows = async (table: string, select: string, label: string) => {
    try { return await readAdminRows(readClient, table, select); }
    catch { warnings.push(`Lecture ${label} indisponible. La liste peut être incomplète.`); return []; }
  };
  const [profilesData, subscriptionsData, plansData, grantsResult, authUsers, candidates, cohorts, clubInvitations, teamInvitations] = await Promise.all([
    readAdminRows(readClient, "profiles"),
    readAdminRows(readClient, "subscriptions"),
    readAdminRows(readClient, "subscription_plans"),
    adminClient ? readAdminRows(adminClient, "free_access_grants").then(data => ({ data, error: "" })).catch(() => ({ data: [], error: "Lecture des accès offerts indisponible." })) : Promise.resolve({ data: [], error: "Lecture des accès offerts indisponible : configuration serveur manquante." }),
    adminClient ? readAllAuthUsers(adminClient).catch(() => { warnings.push("Lecture des connexions indisponible. Réessaie avec Actualiser."); return null; }) : Promise.resolve(null),
    optionalRows("training_candidates", "id,user_id,cohort_id,email,first_name,last_name,club_name,created_at", "des participants aux formations"),
    optionalRows("training_cohorts", "id,name,institution_id,training_programs(name)", "des formations institutionnelles"),
    optionalRows("club_member_invitations", "id,email,status,created_at,expires_at", "des invitations de club"),
    optionalRows("team_invitations", "id,email,status,created_at,expires_at", "des invitations d’équipe"),
  ]);
  if (!adminClient) warnings.push("Configuration serveur manquante : les dates de connexion ne peuvent pas être vérifiées.");
  const profiles = buildUserDirectory({ profiles: profilesData as DirectorySource[], authUsers: authUsers as DirectorySource[] | null, candidates: candidates as DirectorySource[], cohorts: cohorts as DirectorySource[], invitations: [...clubInvitations, ...teamInvitations] as DirectorySource[] });
  const plans = (plansData || []) as Plan[];
  const accessByUser = new Map(profiles.map(user => [user.id, resolveAdminUserSubscription({ id: user.account_id || user.id, email: user.email }, subscriptionsData, grantsResult.data, plansData)]));
  const visiblePeople = profiles.filter(person => matchesDirectoryFilters(person, accessByUser.get(person.id)!, filters));
  const selectablePlans = plans.filter(plan=>plan.status==="active").sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));

  const totalUsers = profiles.filter(user => user.account_id).length;
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
  const subscribedUsers = profiles.filter(user => { const access = accessByUser.get(user.id); return access?.active && access.source === "subscription"; }).length;
  const freeUsers = profiles.filter(user => { const access = accessByUser.get(user.id); return access?.active && access.source === "free"; }).length;
  const guests = profiles.filter(user => user.guest).length;
  const trainees = profiles.filter(user => user.trainings.length).length;
  const neverConnected = profiles.filter(user => user.account_id && user.connection_known && !user.last_sign_in_at).length;

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
            <span>Comptes, abonnements, invités et formations institutionnelles.</span>
          </div>

          <div className={styles.heroActions}>
            <details className={styles.createUserDetails}>
              <summary>+ Créer un utilisateur</summary>
              <div className={styles.createUserPopover}>
                <div className={styles.createUserHead}>
                  <strong>Nouvel utilisateur</strong>
                  <span>
                    Une invitation MyBasket est envoyée par e-mail. Aucun mot de passe
                    n’est créé manuellement.
                  </span>
                </div>

                <form action={createUserAction} className={styles.createUserForm}>
                  <label>
                    <span>Nom</span>
                    <input
                      name="display_name"
                      type="text"
                      placeholder="Nom de l’utilisateur"
                    />
                  </label>

                  <label>
                    <span>Email</span>
                    <input
                      name="email"
                      type="email"
                      placeholder="email@exemple.com"
                      required
                    />
                  </label>

                  <label>
                    <span>Rôle</span>
                    <select name="platform_role" defaultValue="user">
                      <option value="user">Utilisateur</option>
                      <option value="coach">Coach</option>
                      <option value="club">Club</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>

                  <button type="submit">Envoyer l’invitation</button>
                </form>
              </div>
            </details>

            <DirectoryRefresh />
          </div>
        </section>

        {grantsResult.error && <p role="alert">{grantsResult.error}</p>}
        {warnings.map(warning => <p key={warning} role="alert">{warning}</p>)}
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
          <div className={`${styles.statCard} ${styles.gold}`}><strong>{freeUsers}</strong><span>Accès offerts</span></div>
          <div className={styles.statCard}><strong>{guests}</strong><span>Invités</span></div>
          <div className={styles.statCard}><strong>{trainees}</strong><span>Formations institutionnelles</span></div>
        </section>

        <p className={styles.directoryNote}>Dernière connexion réelle, heure de Paris. Actualisation automatique chaque minute. Une personne peut être abonnée et inscrite à une formation. Les invités sont les comptes invités ou anonymes et les invitations en cours ; les visiteurs sans compte ni invitation ne sont pas identifiables.</p>
        <nav className={styles.directoryTabs} aria-label="Répertoires"><Link href="/admin/utilisateurs?category=subscribers" aria-current={filters.category==="subscribers"?"page":undefined}>Utilisateurs abonnés</Link><Link href="/admin/utilisateurs?category=all" aria-current={filters.category==="all"?"page":undefined}>Contacts et prospects</Link><Link href="/admin/utilisateurs?category=training" aria-current={filters.category==="training"?"page":undefined}>Participants aux formations</Link></nav>
        <form method="get" className={styles.filters}>
          <input name="q" defaultValue={filters.q} aria-label="Rechercher une personne" placeholder="Nom, email, club, formation…" />
          <select name="category" defaultValue={filters.category} aria-label="Type de personne">
            <option value="all">Contacts et prospects · toutes les personnes</option>
            <option value="subscribers">Abonnés</option>
            <option value="free">Accès offerts</option>
            <option value="guests">Invités</option>
            <option value="training">Formations institutionnelles</option>
            <option value="without-account">Sans compte</option>
            <option value="without-subscription">Sans abonnement actif</option>
            <option value="never-connected">Jamais connectés</option>
          </select>
          <select name="role" defaultValue={filters.role} aria-label="Rôle">
            <option value="all">Tous les rôles</option>
            <option value="user">Utilisateur</option>
            <option value="coach">Coach</option>
            <option value="club">Club</option>
            <option value="admin">Admin</option>
            <option value="superadmin">Super Admin</option>
            <option value="ceo">CEO</option>
          </select>

          <select name="status" defaultValue={filters.status} aria-label="Statut">
            <option value="all">Tous les statuts</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
            <option value="suspended">Suspendu</option>
            <option value="contact">Sans compte</option>
          </select>
          <button type="submit">Filtrer</button>
          <Link href="/admin/utilisateurs">Réinitialiser</Link>
        </form>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>{filters.category === "subscribers" ? "Utilisateurs abonnés" : "Contacts et prospects"}</h2>
            <span>{visiblePeople.length} / {profiles.length} personnes · {totalUsers} comptes</span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Email</th>
                  <th>Profil / origine</th>
                  <th>Abonnement</th>
                  <th>Ajout / inscription</th>
                  <th>Dernière connexion</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {visiblePeople.map((user) => {
                  const access = accessByUser.get(user.id)!;
                  const plan = access.active ? access.plan : null;
                  const startsAt = access.subscription?.starts_at || access.subscription?.current_period_start || null;
                  const endsAt = access.subscription?.ends_at || access.subscription?.current_period_end || null;

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
                            <span>{user.club || (user.account_id ? "Compte MyBasket" : "Contact sans compte")}</span>
                          </div>
                        </div>
                      </td>

                      <td>{user.email || "—"}</td>

                      <td>
                        <div className={styles.originBadges}>
                          {user.account_id && <span className={styles.roleBadge}>{access.active ? getRoleLabel(user.platform_role) : user.trainings.length ? "Participant" : "Contact"}</span>}
                          {access.active && <span className={styles.planBadge}>{access.source === "free" ? "Accès offert" : "Abonné"}</span>}
                          {user.guest && <span className={styles.originBadge}>Invité</span>}
                          {user.trainings.length > 0 && <span className={styles.originBadge}>Formation institutionnelle</span>}
                          {!user.account_id && <span className={styles.originBadge}>Sans compte</span>}
                        </div>
                        {user.trainings.map(training => <small key={training} className={styles.subscriptionSource}>{training}</small>)}
                      </td>

                      <td>
                        {!user.account_id ? (
                          <span>{access.active ? `Accès offert : ${access.plan?.name || "Offre attribuée"} · en attente de compte` : "Sans abonnement"}</span>
                        ) : ["ceo", "superadmin"].includes(user.platform_role || "") ? (
                          <span className={styles.planBadge}>Accès total CEO</span>
                        ) : (
                          <div>
                          <strong className={styles.subscriptionLabel}>{access.active ? access.plan?.name || "Abonnement" : "Sans abonnement actif"}</strong>
                          <small className={styles.subscriptionSource}>{access.source === "free" ? "Accès offert" : access.active ? "Abonnement attribué" : access.plan ? `Ancien abonnement : ${access.plan.name || "—"}` : "Aucun accès attribué"}</small>
                          {access.active && (startsAt || endsAt) && <small className={styles.subscriptionSource}>{startsAt ? `Du ${formatDate(startsAt)}` : ""}{endsAt ? ` au ${formatDate(endsAt)}` : " · Sans date de fin"}</small>}
                          <form key={`${user.id}-${plan?.id || "none"}-${access.source}`} action={changeSubscriptionAction} className={styles.subscriptionForm}>
                            <input type="hidden" name="user_id" value={user.account_id} />
                            <select name="plan_id" defaultValue={plan?.id || ""} aria-label={`Abonnement de ${user.email || user.display_name || "l’utilisateur"}`}>
                              {!plan?.id ? <option value="" disabled>Choisir une offre</option> : null}
                              {plan?.id && !selectablePlans.some(p=>p.id===plan.id) ? <option value={plan.id}>{plan.name} (offre inactive)</option> : null}
                              {selectablePlans.map((availablePlan) => (
                                <option key={availablePlan.id} value={availablePlan.id}>
                                  {availablePlan.name || "Abonnement"}
                                </option>
                              ))}
                            </select>
                            <button type="submit">Appliquer</button>
                          </form>
                          </div>
                        )}
                      </td>

                      <td>{formatDate(user.created_at)}</td>
                      <td><span className={styles.connectionDate}>{formatLastConnection(user)}</span></td>

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
                          {!user.account_id && <span>Contact uniquement</span>}
                          {user.account_id && user.account_id !== currentUser.id && !["ceo", "superadmin"].includes(user.platform_role || "") ? (
                            <DeleteUserButton
                              userId={user.account_id}
                              email={user.email || "ce compte"}
                              action={deleteUserAction}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {visiblePeople.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.emptyState}>
                        Aucune personne ne correspond aux filtres.
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
