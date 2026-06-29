import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-logo-c">
        <img
          src="/logo-mybasket02.png"
          alt="MyBasket"
          className="footer-logo-img"
        />

        <div className="footer-socials">
          <a href="#">in</a>
          <a href="#">x</a>
          <a href="#">f</a>
          <a href="#">G</a>
          <a href="#">v</a>
        </div>
      </div>

      <div className="footer-cols">
        <div className="footer-col">
          <h4>À PROPOS</h4>
          <ul>
            <li><Link href="/qui-sommes-nous">Qui sommes-nous ?</Link></li>
            <li><Link href="/mybasket-cest-quoi">My Basket c’est quoi ?</Link></li>
            <li><Link href="/contact">Contact</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>SERVICE CLIENT</h4>
          <ul>
            <li><Link href="/faq">Aide / FAQ</Link></li>
            <li><Link href="/cgv">CGU</Link></li>
            <li><Link href="/confidentialite">Confidentialité</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>MYBASKET</h4>
          <ul>
            <li><Link href="/bibliotheque">Bibliothèque</Link></li>
            <li><Link href="/plaquette">Plaquette</Link></li>
            <li><Link href="/annonces">Annonces</Link></li>
            <li><Link href="/abonnements">Abonnements</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>NOUS SUIVRE</h4>
          <ul>
            <li><a href="#">Instagram</a></li>
            <li><a href="#">Facebook</a></li>
            <li><a href="#">YouTube</a></li>
            <li><a href="#">TikTok</a></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}