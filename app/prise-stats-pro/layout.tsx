import type { ReactNode } from 'react';

// Layout volontairement minimal : l'outil s'ouvre en plein écran dans un
// nouvel onglet, sans le chrome MyBasket (header / bandeau noir). Tout le
// style est porté par la page elle-même (styled-jsx), aucune dépendance CSS.
export const metadata = {
  title: 'Prise de stats — MyBasket',
};

export default function PriseStatsProLayout({ children }: { children: ReactNode }) {
  return children;
}