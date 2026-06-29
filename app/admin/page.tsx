import Link from "next/link";
import { getAdminDashboardData } from "@/lib/admin/dashboard";
import { requireAdmin } from "@/lib/admin/guard";
const menu = [
  ["Dashboard", "/admin", "📊"],
  ["Utilisateurs", "/admin/utilisateurs", "👥"],
  ["Clubs", "/admin/clubs", "🏛️"],
  ["Coachs", "/admin/coachs", "🧑‍🏫"],
  ["Annonces", "/admin/annonces", "📣"],
  ["Abonnements", "/admin/abonnements", "💳"],
  ["Paiements", "/admin/paiements", "💰"],
  ["Exercices", "/admin/exercices", "🏀"],
  ["Systèmes", "/admin/systemes", "📋"],
  ["Séances", "/admin/seances", "🗓️"],
  ["Formation", "/admin/formation", "🎓"],
  ["Accompagnement", "/admin/accompagnement", "🤝"],
  ["LiveStat", "/admin/livestat", "📈"],
  ["Tags", "/admin/tags", "🏷️"],
  ["Filtres", "/admin/filtres", "🔎"],
  ["Slider", "/admin/slider", "🖼️"],
  ["Statistiques", "/admin/statistiques", "📊"],
  ["Paramètres", "/admin/settings", "⚙️"],
] as const;

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default async function AdminDashboardPage() {
  await requireAdmin();

  const data = await getAdminDashboardData();

  const pendingTotal =
    data.coachsPending +
    data.annoncesPending +
    data.exercicesPending +
    data.systemesPending +
    data.seancesPending +
    data.formationPending +
    data.accompagnementPending;

  const kpis = [
    ["👥", "Utilisateurs", data.users, "/admin/utilisateurs"],
    ["🏛️", "Clubs", data.clubs, "/admin/clubs"],
    ["🧑‍🏫", "Coachs", data.coachs, "/admin/coachs"],
    ["🏀", "Exercices", data.exercices, "/admin/exercices"],
    ["📋", "Systèmes", data.systemes, "/admin/systemes"],
    ["💰", "CA mensuel", money(data.revenue), "/admin/paiements"],
    ["💳", "Abonnements actifs", data.abonnements, "/admin/abonnements"],
    ["🚨", "Tâches à faire", pendingTotal, "#tasks"],
  ] as const;

  const tasks = [
    ["🧑‍🏫", "Coachs à valider", data.coachsPending, "/admin/coachs"],
    ["📣", "Annonces à modérer", data.annoncesPending, "/admin/annonces"],
    ["🏀", "Exercices proposés", data.exercicesPending, "/admin/exercices"],
    ["📋", "Systèmes proposés", data.systemesPending, "/admin/systemes"],
    ["🗓️", "Séances proposées", data.seancesPending, "/admin/seances"],
    ["🎓", "Demandes formation", data.formationPending, "/admin/formation"],
    [
      "🤝",
      "Demandes accompagnement",
      data.accompagnementPending,
      "/admin/accompagnement",
    ],
  ] as const;

  const quick = [
    ["Modérer les coachs", "/admin/coachs", "🧑‍🏫"],
    ["Modérer les annonces", "/admin/annonces", "📣"],
    ["Valider les exercices", "/admin/exercices", "🏀"],
    ["Valider les systèmes", "/admin/systemes", "📋"],
    ["Valider les séances", "/admin/seances", "🗓️"],
    ["Gérer les abonnements", "/admin/abonnements", "💳"],
    ["Voir les clubs", "/admin/clubs", "🏛️"],
    ["Voir les revenus", "/admin/paiements", "💰"],
  ] as const;

  const stats = [
    ["👥", data.users, "Utilisateurs"],
    ["🏛️", data.clubs, "Clubs"],
    ["🧑‍🏫", data.coachs, "Coachs"],
    ["🏀", data.exercices, "Exercices"],
    ["📋", data.systemes, "Systèmes"],
    ["🗓️", data.seances, "Séances"],
    ["📣", data.annonces, "Annonces"],
    ["📈", data.livestatMatches, "Matchs LiveStat"],
  ] as const;

  return (
    <main className="adminPage">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">🏀</div>
          <div className="brandTitle">MYBASKET</div>
          <div className="brandSub">CEO</div>
        </div>

        <nav className="nav">
          {menu.map(([label, href, icon]) => (
            <Link
              key={href}
              href={href}
              className={href === "/admin" ? "navItem active" : "navItem"}
            >
              <span>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        <div className="adminUser">
          <div className="avatar">MB</div>
          <div>
            <strong>CEO Admin</strong>
            <p>Pilotage & modération</p>
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">BACK-OFFICE MYBASKET</p>
            <h1>Dashboard CEO 👑</h1>
            <p>
              Pilote la plateforme, suis les revenus, gère les accès et traite
              les éléments à valider.
            </p>
          </div>

          <div className="topActions">
            <Link href="#tasks" className="bell" aria-label="Tâches à traiter">
              🔔<span>{pendingTotal}</span>
            </Link>
            <div className="profile">MB</div>
          </div>
        </header>

        <section className="kpiGrid">
          {kpis.map(([icon, label, value, href]) => (
            <Link href={href} key={label} className="kpiCard">
              <div className="kpiIcon">{icon}</div>
              <div>
                <p>{label}</p>
                <strong>{value}</strong>
                <small>Voir le détail →</small>
              </div>
            </Link>
          ))}
        </section>

        <section className="mainGrid">
          <article className="panel urgent" id="tasks">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">À TRAITER</p>
                <h2>Tâches de modération</h2>
              </div>
              <strong>{pendingTotal}</strong>
            </div>

            <div className="taskList">
              {tasks.map(([icon, label, value, href]) => (
                <Link href={href} key={label} className="task">
                  <span>{icon}</span>
                  <div>
                    <strong>{label}</strong>
                    <p>{value} élément(s) en attente</p>
                  </div>
                  <b>{value}</b>
                </Link>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">REVENUS</p>
                <h2>Argent généré</h2>
              </div>
            </div>

            <div className="moneyBox">
              <span>CA du mois</span>
              <strong>{money(data.revenue)}</strong>
              <p>
                Somme des paiements du mois. Clique pour ouvrir le suivi
                complet.
              </p>
              <Link href="/admin/paiements">Voir les paiements →</Link>
            </div>
          </article>

          <article className="panel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">ACCÈS RAPIDES</p>
                <h2>Modération</h2>
              </div>
            </div>

            <div className="quickGrid">
              {quick.map(([label, href, icon]) => (
                <Link href={href} key={label}>
                  <span>{icon}</span>
                  {label}
                  <b>→</b>
                </Link>
              ))}
            </div>
          </article>
        </section>

        <section className="platformPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">PLATEFORME</p>
              <h2>Aperçu global</h2>
            </div>
          </div>

          <div className="platformStats">
            {stats.map(([icon, value, label]) => (
              <div key={label}>
                <span>{icon}</span>
                <strong>{value}</strong>
                <p>{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="moduleGrid">
          {menu.slice(1).map(([label, href, icon]) => (
            <Link href={href} key={href} className="moduleCard">
              <div className="moduleIcon">{icon}</div>
              <div>
                <h3>{label}</h3>
                <p>Ouvrir la gestion {label.toLowerCase()}.</p>
              </div>
              <b>→</b>
            </Link>
          ))}
        </section>
      </section>
    </main>
  );
}