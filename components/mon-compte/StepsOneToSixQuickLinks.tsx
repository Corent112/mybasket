"use client";

import Link from "next/link";

const links = [
  {
    href: "/mon-compte/club/creation",
    title: "Créer / configurer mon club",
    text: "Onboarding complet en 5 étapes : identité, organisation, gymnases, saison et modules.",
  },
  {
    href: "/mon-compte/ressources",
    title: "Centre de ressources",
    text: "Point d’entrée vers les fiches techniques et ressources liées aux équipes.",
  },
  {
    href: "/formation/gestion",
    title: "Gestion des formations",
    text: "Programmes, promotions, candidats, documents, validation et convocations.",
  },
  {
    href: "/formation/mes-formations",
    title: "Mes formations",
    text: "Espace candidat : documents à déposer, versions, retours et messages.",
  },
];

export default function StepsOneToSixQuickLinks() {
  return (
    <section className="steps-card">
      <div className="steps-head">
        <div>
          <p>OUTILS MYBASKET</p>
          <h2>Nouveaux espaces</h2>
        </div>
        <Link href="/mon-compte/nouveautes">Voir tout</Link>
      </div>

      <div className="steps-grid">
        {links.map((item) => (
          <Link href={item.href} key={item.href} className="step-link">
            <strong>{item.title}</strong>
            <span>{item.text}</span>
          </Link>
        ))}
      </div>

      <style jsx>{`
        .steps-card{
          margin:16px 0;
          padding:16px;
          border:1px solid #eadfd8;
          border-radius:18px;
          background:#fff;
        }
        .steps-head{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          margin-bottom:12px;
        }
        .steps-head p{
          margin:0 0 3px;
          color:#d4a24c;
          font-size:.7rem;
          font-weight:1000;
          letter-spacing:.12em;
        }
        .steps-head h2{margin:0;color:#2d211d}
        .steps-head a{color:#6b1a2c;font-weight:900;text-decoration:none}
        .steps-grid{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:9px;
        }
        .step-link{
          display:grid;
          gap:4px;
          padding:12px;
          border:1px solid #eee4df;
          border-radius:12px;
          background:#fffaf8;
          text-decoration:none;
        }
        .step-link strong{color:#6b1a2c}
        .step-link span{color:#7e7069;font-size:.78rem;line-height:1.35}
        @media(max-width:700px){.steps-grid{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
