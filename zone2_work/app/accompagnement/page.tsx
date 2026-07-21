// app/accompagnement/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Accompagnement — MyBasket",
  description:
    "MyBasket accompagne les clubs, équipes et joueurs : direction technique, formation des coachs et scouting vidéo.",
};

const VALEURS = [
  { ico: "🎓", titre: "EXIGENCE", texte: "Tous nos coachs sont diplômés et expérimentés." },
  { ico: "🤝", titre: "ENGAGEMENT", texte: "Une implication totale dans chaque projet." },
  { ico: "🌐", titre: "RÉSEAUX", texte: "Un réseau national de coachs et de clubs." },
  { ico: "💡", titre: "INNOVATION", texte: "Une approche moderne, data & vidéo." },
];

const SERVICES = [
  {
    href: "/accompagnement/direction-technique",
    img: "/accompagnement/direction-technique1.png",
    titre: "Direction Technique",
    role: "DIRECTEUR TECHNIQUE EXTERNE",
    texte: "Mise en place d'une philosophie de jeu, plan de formation, accompagnement des coachs.",
  },
  {
    href: "/accompagnement/formation",
    img: "/accompagnement/formation.png",
    titre: "Formation",
    role: "COACHS & ENTRAÎNEURS",
    texte: "Formation des jeunes entraîneurs au sein du club. Stages, outils, suivi personnalisé.",
  },
  {
    href: "/accompagnement/scouting-video",
    img: "/accompagnement/scouting-video.png",
    titre: "Scouting Vidéo",
    role: "ANALYSE D'ÉQUIPE & ADVERSAIRE",
    texte: "Analyse vidéo des matchs adverses ou de vos prestations. Montage clé en main.",
  },
];

export default function AccompagnementPage() {
  return (
    <section className="acc-container acc-section">
      <div className="acc-title-bar">
        <h2>ACCOMPAGNEMENT</h2>
      </div>

      <p className="acc-intro">
        Nous accompagnons les clubs, équipes et joueurs au travers de trois services
        complémentaires.
      </p>

      <h3 className="acc-subtitle">Les valeurs clés de MyBasket</h3>

      <div className="values-grid">
        {VALEURS.map((v) => (
          <div className="value-card" key={v.titre}>
            <div className="ico">{v.ico}</div>
            <h3>{v.titre}</h3>
            <p>{v.texte}</p>
          </div>
        ))}
      </div>

      <div className="services-grid">
        {SERVICES.map((s) => (
          <Link className="acc-card" href={s.href} key={s.href}>
            <div className="acc-card-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.img} alt={s.titre} />
            </div>
            <h3>{s.titre}</h3>
            <p className="acc-card-role">{s.role}</p>
            <p>{s.texte}</p>
            <p className="acc-card-more">→ En savoir plus</p>
          </Link>
        ))}
      </div>
    </section>
  );
}