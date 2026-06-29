// app/contact/layout.tsx
import type { ReactNode } from "react";
import "../accompagnement/accompagnement.css"; // réutilise les variables + classes de formulaire
import "./contact.css";

export default function ContactLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main className="acc-scope">{children}</main>
    </>
  );
}

/*
 * NOTES :
 * - Adapte les chemins "@/components/Header" et "@/components/Footer".
 * - Si ton app/layout.tsx racine affiche déjà Header/Footer, retire-les ici
 *   et conserve uniquement les deux imports CSS + <main className="acc-scope">.
 * - Le design vient de accompagnement.css (variables --bordeaux, --orange…,
 *   classes .acc-title-bar, .acc-form, .acc-grid--even, etc.). Si tu préfères,
 *   déplace ces styles partagés dans un fichier commun (ex: app/styles/mybasket.css)
 *   importé par le layout racine, et n'importe ici que contact.css.
 */