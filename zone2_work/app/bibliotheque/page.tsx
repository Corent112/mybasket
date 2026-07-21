import Link from "next/link";

export default function BibliothequePage() {
  return (
    <main>
      <section className="library-hero">
        <p className="library-hero-kicker">📚 NEVER STOP LEARNING 📚</p>
      </section>

      <div className="container">
        <div className="section-title-bar">
          <h2>BIBLIOTHÈQUE</h2>
        </div>

        <div className="library-intro">
          <p>
            Bienvenue dans les bibliothèques MyBasket, votre espace dédié au
            développement du basketball.
          </p>
          <p>
            Retrouvez une immense base de données d&apos;exercices, de systèmes
            tactiques et de séances d&apos;entraînement déjà conçues pour vous
            accompagner au quotidien.
          </p>
          <p>
            Que vous soyez joueur, coach ou passionné, accédez à des contenus
            complets, organisés et pensés pour gagner du temps, progresser et
            enrichir vos entraînements avec des ressources adaptées à tous les
            niveaux.
          </p>
        </div>

        <div className="library-tiles-row">
          <Link href="/exercices" className="library-card">
            <img
              src="/images/bibliotheque-exercices.jpg"
              alt="Bibliothèque MyBasket Exercices"
            />
          </Link>

          <Link href="/systemes" className="library-card">
            <img
              src="/images/bibliotheque-systemes.jpg"
              alt="Bibliothèque MyBasket Systèmes"
            />
          </Link>
        </div>

        <div className="library-tiles-bottom">
          <Link href="/abonnements" className="library-card">
            <img
              src="/images/bibliotheque-seances.jpg"
              alt="Bibliothèque MyBasket Séances"
            />
          </Link>
        </div>
      </div>
    </main>
  );
}