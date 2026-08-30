import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "app", "mon-compte", "page.tsx");

if (!fs.existsSync(target)) {
  console.error("❌ app/mon-compte/page.tsx introuvable. Lance ce script depuis la racine de MyBasket.");
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8");
let changed = false;

const importLine = 'import VideoMatchFolderModule from "@/components/management/VideoMatchFolderModule";';

if (!source.includes(importLine)) {
  const anchors = [
    'import GestionAdminModule from "@/components/management/GestionAdminModule";',
    'import GamePlanModule from "@/components/management/GamePlanModule";',
  ];

  const anchor = anchors.find((candidate) => source.includes(candidate));
  if (!anchor) {
    console.error("❌ Point d’insertion des imports introuvable. Aucun fichier n’a été modifié.");
    process.exit(1);
  }

  source = source.replace(anchor, `${anchor}\n${importLine}`);
  changed = true;
}

const renderLine = '{managementView === "live" && <VideoMatchFolderModule />}';

if (!source.includes(renderLine)) {
  const historyAnchor = '{managementView === "historique" && <HistoriqueMatchsModule />}';
  if (!source.includes(historyAnchor)) {
    console.error("❌ Bloc Historique introuvable. Aucun rendu n’a été ajouté.");
    process.exit(1);
  }

  source = source.replace(historyAnchor, `${renderLine}\n${historyAnchor}`);
  changed = true;
}

if (changed) {
  fs.writeFileSync(target, source, "utf8");
  console.log("✅ Module dossier vidéos ajouté sous Prise de Stats Live.");
} else {
  console.log("✅ Module déjà présent : aucune modification nécessaire.");
}
