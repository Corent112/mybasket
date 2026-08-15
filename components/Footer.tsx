import Link from "next/link";
import styles from "./Footer.module.css";

/**
 * Pied de page MyBasket.
 * Composant serveur (aucune interactivité) — styles scopés via Footer.module.css.
 *
 * À COMPLÉTER par Charlène :
 *  - Remplacer les href="#" des réseaux sociaux par tes vraies URL.
 *  - Créer les pages légales listées dans "Service client" et le bas de page
 *    (/faq, /cgv, /confidentialite, /mentions-legales) — ou adapter les liens.
 */

const SOCIALS = [
  {
    label: "Instagram",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "Facebook",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13.5 21v-8h2.6l.4-3h-3V8.1c0-.9.3-1.5 1.6-1.5H16.6V4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9V10H8v3h2.5v8h3z" />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2.5" y="6" width="19" height="12" rx="3.5" stroke="currentColor" strokeWidth="2" />
        <path d="M10.5 9.5l4.2 2.5-4.2 2.5v-5z" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "X",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.5 3h3l-6.6 7.6L21.8 21h-6l-4.2-5.5L6.6 21H3.5l7-8.1L2.6 3h6.1l3.8 5 4.9-5zm-1 16h1.7L7.6 4.8H5.8L16.5 19z" />
      </svg>
    ),
  },
  {
    label: "TikTok",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M14 3c.3 2 1.6 3.6 3.7 3.9v2.5c-1.3.1-2.6-.3-3.7-1v5.7c0 3-2.2 5-4.9 5A4.7 4.7 0 0 1 4.4 14c0-2.7 2.4-4.8 5.4-4.3v2.6c-.4-.1-.8-.2-1.2-.2-1.2 0-2 .8-2 1.9 0 1.1.9 1.9 2 1.9 1.2 0 2-.8 2-2.1V3H14z" />
      </svg>
    ),
  },
];

const ABOUT = [
  { label: "Qui sommes-nous ?", href: "/qui-sommes-nous" },
  { label: "MyBasket, c'est quoi ?", href: "/mybasket-cest-quoi" },
  { label: "Contact", href: "/contact" },
];

const APP_LINKS = [
  { label: "Bibliothèque", href: "/bibliotheque" },
  { label: "Plaquette", href: "/plaquette" },
  { label: "Annonces", href: "/annonces" },
  { label: "Abonnements", href: "/abonnements" },
  { label: "Boutique", href: "/boutique" },
];

const ACCOMPAGNEMENT = [
  { label: "Direction technique", href: "/accompagnement/direction-technique" },
  { label: "Formation", href: "/accompagnement/formation" },
  { label: "Scouting vidéo", href: "/accompagnement/scouting-video" },
];

const SERVICE = [
  { label: "Aide / FAQ", href: "/faq" },
  { label: "CGU / CGV", href: "/cgv" },
  { label: "Confidentialité", href: "/confidentialite" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        {/* Marque + réseaux sociaux */}
        <div className={styles.top}>
          <Link href="/" className={styles.brand}>
            <img
              src="/logo-mybasket02.png"
              alt="MyBasket"
              className={styles.logo}
            />
            <span className={styles.brandText}>
              <span className={styles.brandName}>
                MY<em>BASKET</em>
              </span>
              <span className={styles.tagline}>
                L&apos;application des coachs de basket
              </span>
            </span>
          </Link>

          <div className={styles.socials}>
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                className={styles.social}
                aria-label={s.label}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        {/* Colonnes de liens */}
        <div className={styles.cols}>
          <div className={styles.col}>
            <h4>À propos</h4>
            <ul>
              {ABOUT.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.col}>
            <h4>L&apos;application</h4>
            <ul>
              {APP_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.col}>
            <h4>Accompagnement</h4>
            <ul>
              {ACCOMPAGNEMENT.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.col}>
            <h4>Service client</h4>
            <ul>
              {SERVICE.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bas de page légal */}
        <div className={styles.bottom}>
          <p className={styles.copyright}>
            © {year} MyBasket — Tous droits réservés.
          </p>
          <nav className={styles.legal} aria-label="Liens légaux">
            <Link href="/mentions-legales">Mentions légales</Link>
            <Link href="/cgv">CGU</Link>
            <Link href="/confidentialite">Confidentialité</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
