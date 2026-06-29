// app/accompagnement/direction-technique/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Direction Technique — MyBasket",
  description:
    "MyBasket joue le rôle d'un directeur technique externe : projet sportif, philosophie de jeu, plannings et accompagnement des entraîneurs.",
};

const SERVICES = [
  { ico: "🎯", lbl: "Créer une véritable dynamique de formation" },
  { ico: "👨‍🏫", lbl: "Développer les jeunes entraîneurs" },
  { ico: "🏀", lbl: "Développer les opérations basket école" },
  { ico: "👩", lbl: "Développer le basket féminin" },
  { ico: "📋", lbl: "Accompagnement administratif" },
  { ico: "🏅", lbl: "Aide à l'obtention des labels" },
];

export default function DirectionTechniquePage() {
  return (
    <section className="acc-container acc-container--narrow acc-section">
      <div className="acc-back">
        <Link className="acc-btn-outline" href="/accompagnement">
          ← Retour
        </Link>
      </div>

      <div className="acc-hero">
        <h1>DIRECTION TECHNIQUE</h1>
        <div className="acc-hero-rule" />
      </div>

      <div className="acc-grid">
        {/* TEXTE */}
        <div className="acc-text">
          <p className="lead">
            <b>Vous souhaitez développer votre club ?</b>
          </p>
          <p>
            MyBasket vous propose de vous accompagner en jouant le rôle d'un{" "}
            <b>directeur technique</b>.
          </p>
          <p>
            Nous vous proposons de mettre en place ensemble un projet sportif. Nous définirons
            ensemble une philosophie de club et préparerons les contenus de formations pour
            emmener les jeunes sur cette fameuse philosophie.
          </p>
          <p>
            La <b>philosophie de jeu</b> d'un club c'est quand les équipes ont une façon de jouer
            identifiable sur le terrain, invariable selon les matchs. De par notre expérience, nous
            dirions qu'elle se transmet par les plus jeunes.
          </p>
          <p style={{ marginBottom: ".6rem" }}>
            Elle s'articule souvent de principes simples basés sur :
          </p>
          <ul>
            <li>
              le <b>jeu en mouvement</b>
            </li>
            <li>
              le <b>jeu sans ballon</b>
            </li>
            <li>
              les <b>choix défensifs</b>
            </li>
            <li>
              l'<b>identité de jeu</b> du club
            </li>
          </ul>
          <p className="italic">
            Très peu de clubs en France travaillent de cette manière. On pourrait citer Manchester
            City en football ou les Golden State Warriors en NBA comme exemples de clubs avec une
            forte identité de jeu.
          </p>
          <p style={{ marginBottom: 0 }}>
            Nous ferons également les <b>plannings</b> et accompagnerons les entraîneurs dans
            l'élaboration de leurs <b>séances</b>.
          </p>
        </div>

        {/* ILLUSTRATION */}
        <div className="acc-illus">
          <div className="acc-illus-box acc-illus-box--light">
            <div className="acc-blob acc-blob--orange" />
            <div className="acc-blob acc-blob--noir" />
            <div className="acc-illus-inner">
              <div className="acc-illus-emoji">🏛️</div>
              <div className="acc-illus-label">PROJET SPORTIF</div>
              <div className="acc-illus-sub">Club · Philosophie · Identité</div>
            </div>
          </div>
        </div>
      </div>

      {/* LISTE DES SERVICES */}
      <div className="acc-panel">
        <h2>Notre accompagnement complet</h2>
        <div className="acc-tile-grid">
          {SERVICES.map((s) => (
            <div className="acc-tile" key={s.lbl}>
              <div className="ico">{s.ico}</div>
              <div className="lbl">{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="acc-cta">
        <Link className="acc-cta-btn" href="/contact">
          📅 PRISE DE RENDEZ-VOUS
        </Link>
        <div className="acc-cta-note">Un échange gratuit pour comprendre votre projet</div>
      </div>
    </section>
  );
}
