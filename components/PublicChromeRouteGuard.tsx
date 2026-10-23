"use client";

/**
 * Correctif strictement limite au chrome public :
 * - le panier reste aligne completement a droite de la barre noire ;
 * - le Header, la barre noire et le Footer restent visibles sur TOUTES les pages,
 *   y compris les espaces Institution.
 *
 * Aucune mise en page du dashboard Administration n'est modifiee ici.
 */
export default function PublicChromeRouteGuard() {
  return (
    <style jsx global>{`
      .blackbar {
        justify-content: flex-end !important;
      }

      .blackbar > .icons,
      .blackbar .icons {
        margin-left: auto !important;
        justify-content: flex-end !important;
      }
    `}</style>
  );
}
