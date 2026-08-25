"use client";

import ClubCoachesSection from "@/components/club/ClubCoachesSection";

/**
 * Point d'entrée Coachs utilisé par l'Espace Club.
 *
 * On réutilise volontairement le gestionnaire complet existant :
 * - ajout / invitation d'un coach par e-mail ;
 * - rattachement à son compte MyBasket lors de l'acceptation ;
 * - choix du rôle ;
 * - affectation d'une ou plusieurs équipes ;
 * - modification / suppression ;
 * - ouverture de la fiche coach.
 *
 * Cela évite d'entretenir deux logiques Club parallèles.
 */
export default function ClubCoachesActiveSection({
  clubId,
  clubName,
}: {
  clubId: string;
  clubName?: string;
}) {
  return (
    <ClubCoachesSection
      clubId={clubId}
      clubName={clubName || "Mon club"}
    />
  );
}
