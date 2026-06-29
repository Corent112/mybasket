// app/equipes/layout.tsx
// Layout pass-through : importe les deux thèmes (sombre pour la fiche joueur,
// clair pour la liste et la fiche équipe). Chaque page fournit son propre
// habillage (sidebar sombre côté joueur, header clair côté équipe).
import "./equipes.css";
import "./equipe-light.css";

export default function EquipesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
