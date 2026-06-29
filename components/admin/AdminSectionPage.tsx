import Link from "next/link";

type AdminSectionPageProps = {
  title: string;
  description: string;
  icon: string;
  children?: React.ReactNode;
};

export default function AdminSectionPage({
  title,
  description,
  icon,
  children,
}: AdminSectionPageProps) {
  return (
    <main className="adm-section-page">
      <div className="adm-section-container">
        <Link href="/admin" className="adm-section-back">
          ← Retour Dashboard CEO
        </Link>

        <section className="adm-section-hero">
          <div className="adm-section-icon">{icon}</div>

          <div>
            <p>BACK-OFFICE MYBASKET</p>
            <h1>{title}</h1>
            <span>{description}</span>
          </div>
        </section>

        <section className="adm-section-card">
          {children ?? (
            <div className="adm-section-empty">
              <h2>Module prêt</h2>
              <p>
                Cette page est créée. On peut maintenant brancher les données
                Supabase et les actions CEO.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}