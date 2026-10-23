"use client";

import {usePathname} from "next/navigation";

/**
 * Correctif strictement limite au chrome public :
 * - le panier reste aligne completement a droite de la barre noire ;
 * - les espaces équipe / institution ne répètent pas la barre du panier ;
 * - le chrome public conserve son panier en haut de page.
 *
 * Aucune mise en page du dashboard Administration n'est modifiee ici.
 */
export default function PublicChromeRouteGuard() {
  const pathname=usePathname()||"";
  const businessPage=pathname.startsWith("/institutionnel/")||pathname.startsWith("/equipes/")||pathname.startsWith("/formation/gestion")||pathname==="/presences-selection";
  return (
    <style jsx global>{`
      body .blackbar {
        ${businessPage?"display: none !important;":""}
        justify-content: flex-end !important;
        position: static !important;
        top: auto !important;
      }

      .blackbar > .icons,
      .blackbar .icons {
        margin-left: auto !important;
        justify-content: flex-end !important;
      }
    `}</style>
  );
}
