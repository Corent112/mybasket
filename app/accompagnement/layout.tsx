// app/accompagnement/layout.tsx
import type { ReactNode } from "react";
import "./accompagnement.css";

export default function AccompagnementLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main className="acc-scope">{children}</main>
    </>
  );
}

/*
 * NOTE :
 * - Adapte les chemins d'import "@/components/Header" et "@/components/Footer"
 *   à l'emplacement réel de tes composants.
 * - Si ton app/layout.tsx (racine) affiche DÉJÀ le Header et le Footer,
 *   supprime-les ici pour éviter les doublons et garde uniquement :
 *
 *     import "./accompagnement.css";
 *     export default function AccompagnementLayout({ children }) {
 *       return <main className="acc-scope">{children}</main>;
 *     }
 */