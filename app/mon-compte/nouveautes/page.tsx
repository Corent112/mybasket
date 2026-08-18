import Link from "next/link";

const sections = [
  {
    href: "/mon-compte/club/creation",
    title: "Espace Club — création",
    items: ["Identité", "Organisation", "Installations", "Saison", "Configuration des modules"],
  },
  {
    href: "/formation/gestion",
    title: "Formation — responsable / formateur",
    items: ["Programmes", "Promotions", "Candidats", "Documents", "Validation", "Messages & convocations"],
  },
  {
    href: "/formation/mes-formations",
    title: "Formation — candidat",
    items: ["Documents à déposer", "Versions", "Corrections", "Validation", "Messages"],
  },
  {
    href: "/mon-compte/ressources",
    title: "Centre de ressources",
    items: ["Fiches techniques", "Exercices de référence", "Ressources équipe"],
  },
];

export default function Page() {
  return (
    <main style={{ minHeight: "100vh", background: "#f6f2ee", padding: "28px 18px 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link href="/mon-compte" style={{ color: "#6b1a2c", fontWeight: 900, textDecoration: "none" }}>
          ← Mon compte
        </Link>

        <section style={{ marginTop: 16, background: "#6b1a2c", color: "white", borderRadius: 24, padding: 24 }}>
          <div style={{ color: "#d4a24c", fontWeight: 1000, letterSpacing: ".12em", fontSize: 12 }}>
            ÉTAPES 1 À 6
          </div>
          <h1 style={{ margin: "6px 0" }}>Nouveaux outils MyBasket</h1>
          <p style={{ margin: 0, opacity: .88 }}>
            Les outils équipe apparaissent directement dans chaque fiche équipe. Les espaces ci-dessous sont accessibles depuis ton compte.
          </p>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginTop: 14 }}>
          {sections.map((section) => (
            <Link key={section.href} href={section.href} style={{ textDecoration: "none", color: "inherit", background: "white", border: "1px solid #eadfd8", borderRadius: 16, padding: 16 }}>
              <h2 style={{ color: "#6b1a2c", marginTop: 0, fontSize: 20 }}>{section.title}</h2>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#6f625c" }}>
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </Link>
          ))}
        </section>

        <section style={{ marginTop: 14, background: "white", border: "1px solid #eadfd8", borderRadius: 16, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Dans la fiche équipe</h2>
          <p style={{ color: "#6f625c" }}>
            Tu dois voir les onglets <b>Grilles de tirs</b>, <b>Charge & disponibilité</b>, <b>Documents & ressources</b> et <b>Activité</b>, en plus des onglets déjà existants.
          </p>
        </section>
      </div>
    </main>
  );
}
