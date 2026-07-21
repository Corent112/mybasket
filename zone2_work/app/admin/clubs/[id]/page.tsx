import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  created_at: string | null;
};

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  platform_role: string | null;
  status: string | null;
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
  target: string | null;
};

type ContentItem = {
  id: string;
  title: string | null;
  user_id: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getInitial(value: string | null) {
  return (value || "C").charAt(0).toUpperCase();
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

export default async function AdminClubDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: clubData } = await supabase
    .from("clubs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!clubData) notFound();

  const club = clubData as Club;

  const { data: membersData } = await supabase
    .from("club_members")
    .select("*")
    .eq("club_id", id);

  const members = (membersData || []) as ClubMember[];
  const memberUserIds = members.map((member) => member.user_id);

  const { data: profilesData } =
    memberUserIds.length > 0
      ? await supabase
          .from("profiles")
          .select(
            "id,email,display_name,avatar_url,platform_role,status,last_sign_in_at"
          )
          .in("id", memberUserIds)
      : { data: [] };

  const profiles = (profilesData || []) as Profile[];

  const { data: subscriptionsData } =
    memberUserIds.length > 0
      ? await supabase
          .from("subscriptions")
          .select("user_id,plan_id,status")
          .in("user_id", memberUserIds)
      : { data: [] };

  const { data: plansData } = await supabase
    .from("subscription_plans")
    .select("id,name,target");

  const subscriptions = (subscriptionsData || []) as Subscription[];
  const plans = (plansData || []) as Plan[];

  const { data: exercisesData } =
    memberUserIds.length > 0
      ? await supabase
          .from("exercises")
          .select("id,title,user_id,created_at")
          .in("user_id", memberUserIds)
      : { data: [] };

  const { data: systemsData } =
    memberUserIds.length > 0
      ? await supabase
          .from("systems")
          .select("id,title,user_id,created_at")
          .in("user_id", memberUserIds)
      : { data: [] };

  const { data: sessionsData } =
    memberUserIds.length > 0
      ? await supabase
          .from("practice_sessions")
          .select("id,title,user_id,created_at")
          .in("user_id", memberUserIds)
      : { data: [] };

  const exercises = (exercisesData || []) as ContentItem[];
  const systems = (systemsData || []) as ContentItem[];
  const sessions = (sessionsData || []) as ContentItem[];

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const subscriptionsByUser = new Map(
    subscriptions.map((subscription) => [subscription.user_id, subscription])
  );
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));

  const owner =
    members.find((member) => member.role === "owner") ||
    members.find((member) => member.role === "manager") ||
    members[0];

  const ownerSubscription = owner
    ? subscriptionsByUser.get(owner.user_id)
    : null;

  const currentPlan =
    ownerSubscription?.plan_id && ownerSubscription.status === "active"
      ? plansById.get(ownerSubscription.plan_id)
      : null;

  const allActivities = [...exercises, ...systems, ...sessions]
    .filter((item) => item.created_at)
    .sort(
      (a, b) =>
        new Date(b.created_at || "").getTime() -
        new Date(a.created_at || "").getTime()
    );

  const lastActivity = allActivities[0]?.created_at || null;

  return (
    <main className={styles.clubPage}>
      <div className={styles.container}>
        <Link href="/admin/clubs" className={styles.backLink}>
          ← Retour Clubs
        </Link>

        <section className={styles.hero}>
          {club.banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club.banner_url} alt="" className={styles.banner} />
          ) : (
            <div className={styles.bannerFallback} />
          )}

          <div className={styles.heroContent}>
            {club.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={club.logo_url} alt="" className={styles.logo} />
            ) : (
              <div className={styles.logoFallback}>{getInitial(club.name)}</div>
            )}

            <div>
              <p>Fiche analytique club</p>
              <h1>{club.name || "Club sans nom"}</h1>
              <span>{club.city || "Ville non renseignée"}</span>
            </div>

            <div className={styles.heroBadges}>
              <span className={styles.planBadge}>
                {currentPlan?.name || "Sans abonnement"}
              </span>
              <span
                className={`${styles.statusBadge} ${getStatusClass(
                  club.status
                )}`}
              >
                {getStatusLabel(club.status)}
              </span>
            </div>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{members.length}</strong>
            <span>Membres rattachés</span>
          </div>

          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{exercises.length}</strong>
            <span>Exercices créés</span>
          </div>

          <div className={`${styles.statCard} ${styles.purple}`}>
            <strong>{systems.length}</strong>
            <span>Systèmes créés</span>
          </div>

          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{sessions.length}</strong>
            <span>Séances créées</span>
          </div>

          <div className={`${styles.statCard} ${styles.dark}`}>
            <strong>{formatDate(club.created_at)}</strong>
            <span>Inscription</span>
          </div>

          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{formatDate(lastActivity)}</strong>
            <span>Dernière activité</span>
          </div>
        </section>

        <section className={styles.gridTwo}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Coachs et membres</h2>
              <span>{members.length} comptes</span>
            </div>

            <div className={styles.memberList}>
              {members.map((member) => {
                const profile = profilesById.get(member.user_id);

                return (
                  <div key={member.id} className={styles.memberRow}>
                    {profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt="" />
                    ) : (
                      <div className={styles.avatar}>
                        {getInitial(profile?.display_name || profile?.email || "")}
                      </div>
                    )}

                    <div>
                      <strong>{profile?.display_name || "Sans nom"}</strong>
                      <span>{profile?.email || "Email non renseigné"}</span>
                    </div>

                    <em>{member.role || "coach"}</em>
                  </div>
                );
              })}

              {members.length === 0 && (
                <div className={styles.empty}>Aucun membre rattaché.</div>
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Abonnement</h2>
              <span>Compte responsable</span>
            </div>

            <div className={styles.subscriptionBox}>
              <strong>{currentPlan?.name || "Sans abonnement actif"}</strong>
              <p>
                L’abonnement du club est porté par le compte responsable du
                club.
              </p>

              <div>
                <span>Responsable</span>
                <b>
                  {owner
                    ? profilesById.get(owner.user_id)?.display_name ||
                      profilesById.get(owner.user_id)?.email ||
                      "Non renseigné"
                    : "Aucun responsable"}
                </b>
              </div>

              <div>
                <span>Statut abonnement</span>
                <b>{ownerSubscription?.status || "—"}</b>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Activité du club</h2>
            <span>Contenus créés par les membres</span>
          </div>

          <div className={styles.activityGrid}>
            <div>
              <h3>Derniers exercices</h3>
              {exercises.slice(0, 5).map((item) => (
                <p key={item.id}>{item.title || "Exercice sans titre"}</p>
              ))}
              {exercises.length === 0 && <em>Aucun exercice.</em>}
            </div>

            <div>
              <h3>Derniers systèmes</h3>
              {systems.slice(0, 5).map((item) => (
                <p key={item.id}>{item.title || "Système sans titre"}</p>
              ))}
              {systems.length === 0 && <em>Aucun système.</em>}
            </div>

            <div>
              <h3>Dernières séances</h3>
              {sessions.slice(0, 5).map((item) => (
                <p key={item.id}>{item.title || "Séance sans titre"}</p>
              ))}
              {sessions.length === 0 && <em>Aucune séance.</em>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}