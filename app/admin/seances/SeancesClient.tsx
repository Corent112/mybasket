import Link from "next/link";

export default function AdminSeancesPage() {
  return (
    <main className="adm">
      <div className="adm-container">
        <Link href="/admin" className="adm-back">
          ← Retour Dashboard Admin
        </Link>

        <div className="adm-band">
          Administration <span>MyBasket</span>
        </div>

        <div className="adm-head">
          <div>
            <h1>Séances</h1>
            <p>
              Gestion des séances d'entraînement, catégories et contenus.
            </p>
          </div>
        </div>

        <div className="adm-card">
          <h2>Gestion des séances</h2>
          <p>Module en cours de construction.</p>
        </div>
      </div>
    </main>
  );
}