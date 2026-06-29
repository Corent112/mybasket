"use client";

const CARDS = [
  {
    icon: "🎯",
    title: "Notre mission",
    text: "Centraliser tous les outils utiles aux entraîneurs — exercices, systèmes, séances, plaquette — pour leur faire gagner du temps et les aider à structurer leur travail au quotidien.",
  },
  {
    icon: "🚀",
    title: "Notre vision",
    text: "Devenir la référence pour créer, organiser, partager et faire progresser le basket, du club amateur aux structures les plus exigeantes.",
  },
  {
    icon: "🤝",
    title: "Notre communauté",
    text: "Rassembler coachs, clubs, joueurs et passionnés autour d'une même plateforme, où chacun partage son savoir et fait grandir le jeu.",
  },
];

export default function QuiSommesNousPage() {
  return (
    <>
      <main className="mb-page">
        <div className="container">
          <header className="ptitle">
            <span className="rule" />
            <h1>Qui sommes-nous ?</h1>
            <span className="rule" />
          </header>

          <p className="lead">
            MyBasket est une plateforme pensée pour les <b>entraîneurs</b>, les{" "}
            <b>clubs</b>, les <b>joueurs</b> et tous les{" "}
            <b>passionnés de basket</b>. Notre objectif est simple : réunir au
            même endroit les outils qui comptent vraiment pour préparer, animer
            et faire progresser une équipe.
          </p>

          <section className="prose">
            <p>
              Coacher, organiser une saison ou faire grandir un club demande du
              temps et des ressources éparpillées un peu partout. MyBasket
              centralise tout cela dans un espace clair, moderne et accessible —
              pour que l'énergie aille à l'essentiel : le terrain.
            </p>
          </section>

          <section className="cards">
            {CARDS.map((c) => (
              <article key={c.title} className="card">
                <div className="card-icon">{c.icon}</div>
                <h2>{c.title}</h2>
                <p>{c.text}</p>
              </article>
            ))}
          </section>

          <section className="band">
            <h2>Une plateforme faite pour le basket</h2>
            <p>
              Des outils pensés par et pour des gens de terrain, au service de
              la progression collective.
            </p>
          </section>
        </div>
      </main>

      <style jsx>{`
        .mb-page {
          --bordeaux: #6b1a2c;
          --or: #d4a24c;
          --noir: #0f0f12;
          --gris-text: #6b6b6b;
          --varsity: "Alfa Slab One", serif;
        }

        .mb-page .container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 1.5rem 1.25rem 1rem;
        }

        .ptitle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin: 2rem 0 0.5rem;
        }

        .ptitle h1 {
          font-family: var(--varsity);
          letter-spacing: 0.05em;
          font-size: clamp(1.7rem, 4.5vw, 2.6rem);
          margin: 0;
          color: var(--noir);
          text-align: center;
        }

        .rule {
          flex: 0 0 60px;
          height: 2px;
          background: var(--noir);
        }

        .lead {
          max-width: 760px;
          margin: 1.5rem auto 0;
          text-align: center;
          font-size: 1.05rem;
          line-height: 1.6;
          color: #333;
        }

        .lead b {
          color: var(--bordeaux);
          font-weight: 700;
        }

        .prose {
          max-width: 720px;
          margin: 1.5rem auto 0;
        }

        .prose p {
          font-size: 0.98rem;
          line-height: 1.7;
          color: #444;
        }

        .cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.25rem;
          margin: 2.5rem 0;
        }

        .card {
          background: #fff;
          border: 1px solid #ececec;
          border-radius: 16px;
          padding: 1.6rem;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.04);
          transition: 0.18s;
        }

        .card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
        }

        .card-icon {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: var(--noir);
          color: var(--or);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          margin-bottom: 1rem;
        }

        .card h2 {
          font-family: var(--varsity);
          letter-spacing: 0.03em;
          font-size: 1.05rem;
          color: var(--bordeaux);
          margin: 0 0 0.5rem;
          text-transform: uppercase;
        }

        .card p {
          font-size: 0.9rem;
          line-height: 1.6;
          color: #444;
          margin: 0;
        }

        .band {
          text-align: center;
          background: var(--noir);
          color: #fff;
          border-radius: 18px;
          padding: 2.5rem 1.5rem;
          margin: 1rem 0 2.5rem;
        }

        .band h2 {
          font-family: var(--varsity);
          letter-spacing: 0.04em;
          color: var(--or);
          font-size: 1.2rem;
          margin: 0 0 0.5rem;
          text-transform: uppercase;
        }

        .band p {
          color: rgba(255, 255, 255, 0.82);
          margin: 0;
          font-size: 0.95rem;
        }

        @media (max-width: 820px) {
          .cards {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}