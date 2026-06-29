// app/club/page.tsx
// Espace Mon Club — page de l'admin du club.
// (Route assumée : /club. Si ton espace vit sous /mon-compte/club,
//  déplace simplement ce fichier — le composant ne change pas.)
import ClubSpace from "../../components/club/ClubSpace";

export const metadata = {
  title: "Espace Mon Club · MyBasket",
};

export default function ClubPage() {
  return <ClubSpace />;
}