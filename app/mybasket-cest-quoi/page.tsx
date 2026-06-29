"use client";

const FEATURES = [
  {
    icon: "📚",
    title: "Bibliothèque d'exercices",
    text: "Une base d'exercices à filtrer, créer et réutiliser pour tes séances.",
  },
  {
    icon: "✏️",
    title: "Outil de plaquette",
    text: "Dessine et anime tes situations de jeu, phase par phase.",
  },
  {
    icon: "🧩",
    title: "Systèmes de jeu",
    text: "Construis et conserve tes systèmes offensifs et défensifs.",
  },
  {
    icon: "🗂️",
    title: "Séances",
    text: "Assemble tes exercices en séances structurées, prêtes à l'emploi.",
  },
  {
    icon: "📣",
    title: "Annonces",
    text: "Stages, camps, entraînements individuels — trouve ou propose.",
  },
  {
    icon: "🎓",
    title: "Accompagnement",
    text: "Des ressources et un suivi pour progresser dans ta pratique.",
  },
  {
    icon: "🛍️",
    title: "Boutique",
    text: "Le matériel et les supports utiles, au même endroit.",
  },
];

const PUBLICS = [
  {
    title: "Pour les coachs",
    text: "Gagne du temps dans ta préparation : retrouve tes exercices, monte tes séances, dessine tes systèmes et anime tes plaquettes, le tout centralisé.",
  },
  {
    title: "Pour les clubs",
    text: "Structure le travail de tes équipes, partage une méthode commune et transmets une vraie philosophie de jeu, des plus jeunes aux seniors.",
  },
  {
    title: "Pour les joueurs",
    text: "Accède à des contenus clairs, suis ta progression et trouve des accompagnements individuels pour franchir un cap.",
  },
];

export default function MyBasketCestQuoiPage() {
  return (
    <main className="mb-page">
      <div className="container">
        <header className="ptitle">
          <span className="rule" />
          <h1>MyBasket, c&apos;est quoi ?</h1>
          <span className="rule" />
        </header>

        <p className="lead">
          MyBasket est une <b>plateforme basket tout-en-un</b> qui réunit les
          outils essentiels pour préparer, organiser, partager et faire
          progresser le jeu — au même endroit.
        </p>

        <section className="features">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <div className="f-icon">{f.icon}</div>
              <div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="publics">
          {PUBLICS.map((p, i) => (
            <article key={p.title} className={"pub" + (i === 1 ? " dark" : "")}>
              <h2>{p.title}</h2>
              <p>{p.text}</p>
            </article>
          ))}
        </section>
      </div>

      <style jsx>{`
        .mb-page {
          --bordeaux: #6b1a2c;
          --or: #d4a24c;
          --noir: #0f0f12;
          --gris-text: #6b6b6b;
          --varsity: "Alfa Slab One", serif;
          background: #fff;
          min-height: 100vh;
        }

        .container {
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
          margin: 1.5rem auto 2.5rem;
          text-align: center;
          font-size: 1.05rem;
          line-height: 1.6;
          color: #333;
        }

        .lead b {
          color: var(--bordeaux);
          font-weight: 700;
        }

        .features {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          margin-bottom: 2.5rem;
        }

        .feature {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
          background: #fff;
          border: 1px solid #ececec;
          border-radius: 14px;
          padding: 1.1rem 1.25rem;
          transition: 0.15s;
        }

        .feature:hover {
          border-color: var(--or);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.05);
        }

        .f-icon {
          flex: 0 0 44px;
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.3rem;
        }

        .feature h3 {
          font-size: 0.98rem;
          margin: 0 0 0.25rem;
          color: var(--noir);
        }

        .feature p {
          font-size: 0.86rem;
          line-height: 1.5;
          color: var(--gris-text);
          margin: 0;
        }

        .publics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.25rem;
          margin-bottom: 2.5rem;
        }

        .pub {
          border: 1px solid #ececec;
          border-radius: 16px;
          padding: 1.6rem;
          background: #fff;
        }

        .pub h2 {
          font-family: var(--varsity);
          letter-spacing: 0.03em;
          font-size: 1.05rem;
          color: var(--bordeaux);
          text-transform: uppercase;
          margin: 0 0 0.6rem;
        }

        .pub p {
          font-size: 0.9rem;
          line-height: 1.6;
          color: #444;
          margin: 0;
        }

        .pub.dark {
          background: var(--noir);
          border-color: var(--noir);
        }

        .pub.dark h2 {
          color: var(--or);
        }

        .pub.dark p {
          color: rgba(255, 255, 255, 0.82);
        }

        @media (max-width: 820px) {
          .features,
          .publics {
            grid-template-columns: 1fr;
          }

          .rule {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}