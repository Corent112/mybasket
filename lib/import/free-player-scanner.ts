import type { AiDiagramPlayer, AiExerciseDiagram, AiExerciseImport } from "./types";
import { scanExerciseLocally } from "./local-exercise-scanner";

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, (a.y - b.y) * 1.6);

/**
 * Vision 2 papier — doctrine stricte.
 *
 * Le terrain est d'abord redressé par le moteur d'homographie. Les coordonnées
 * qui arrivent ici sont donc déjà des coordonnées Plaquette issues du terrain,
 * et non de la feuille/photo. Ce fichier ne doit PLUS déplacer les joueurs pour
 * « améliorer » visuellement le résultat : il ne fait que décider si un symbole
 * détecté a le droit d'être créé.
 *
 * Vocabulaire validé sur le terrain papier de calibration (repères verts) :
 *   - numéro seul                    => attaquant
 *   - numéro dans un rond            => attaquant
 *   - rond numéroté + bras/parenthèses => défenseur
 *
 * Règle absolue : aucun numéro inventé, aucun joueur sans preuve, aucun objet
 * ajouté pour remplir le dessin.
 */
const numberOf = (value: string): string => {
  const match = String(value || "").match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
  return match?.[1] ?? "";
};

const hasDefenseSignal = (player: AiDiagramPlayer): boolean => {
  /*
   * Le moteur bas niveau fournit désormais le verdict de forme. Ne surtout pas
   * retransformer un attaquant en défenseur à partir de l'ancien team='def' :
   * ce champ est précisément celui qui contenait le mauvais verdict des
   * versions précédentes et annulait la correction de diagram-vision.
   */
  if (player.type === "attacker") return false;
  if (player.type === "defender") return true;

  // Compatibilité uniquement pour une détection ancienne qui n'aurait pas de
  // type explicite : il faut alors une source qui mentionne réellement les bras.
  return /bras|parenth/i.test(String(player.source ?? ""));
};

function playersOf(players: AiDiagramPlayer[]): AiDiagramPlayer[] {
  const out: AiDiagramPlayer[] = [];

  // On traite d'abord les détections les plus sûres. Si deux moteurs voient le
  // même symbole, la meilleure détection gagne au lieu de créer deux joueurs.
  const ordered = [...players].sort(
    (a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5)
  );

  for (const [index, raw] of ordered.entries()) {
    const label = numberOf(raw.label);
    const defender = hasDefenseSignal(raw);
    const confidence = raw.confidence ?? 0.5;
    const source = String(raw.source ?? "");
    const ocrOnly = /numéro seul OCR/i.test(source);
    const geometricToken =
      /jeton numéroté|mybasket-template/i.test(source) && !ocrOnly;

    /*
     * Vision 2 papier — étape suivante : ne plus perdre un joueur parce que
     * Tesseract n'a pas réussi à lire son numéro.
     *
     * Le moteur amont a déjà fait le travail difficile : cercle + glyphe dans
     * l'aire de jeu. Cette preuve GÉOMÉTRIQUE suffit à conserver le joueur,
     * quitte à laisser son label vide. L'OCR n'a plus le droit de décider de
     * l'existence d'un joueur.
     *
     * À l'inverse, un joueur créé UNIQUEMENT par l'OCR global reste soumis à un
     * seuil plus fort : c'est lui qui produisait les « 4 » fantômes visibles
     * près du bas du terrain sur le test réel.
     */
    const provenPlayer = defender || geometricToken;
    if (!label && !provenPlayer) continue;
    if (ocrOnly && confidence < 0.62) continue;
    if (!ocrOnly && confidence < (defender ? 0.4 : geometricToken ? 0.34 : 0.5)) continue;

    const p: AiDiagramPlayer = {
      ...raw,
      key: `v2-paper-${defender ? "def" : "att"}-${index}`,
      label,
      team: defender ? "def" : "att",
      type: defender ? "defender" : "attacker",
      // IMPORTANT : on conserve la position calculée sur le terrain redressé.
      // Aucun snap, aucun décalage esthétique, aucune position inventée.
      x: clamp(raw.x),
      y: clamp(raw.y),
      /*
       * Orientation : les défenseurs doivent regarder le panier / l'attaque,
       * et non être dessinés à l'envers après import. Le terrain canonique a
       * son panier en haut : 0° = bras vers le haut dans la Plaquette.
       * On ne modifie pas l'orientation des attaquants.
       */
      ...(defender ? ({ rotation: 0 } as Partial<AiDiagramPlayer>) : {}),
      source: defender
        ? "vision2-paper-defender-exact"
        : "vision2-paper-attacker-exact",
    };

    const duplicateIndex = out.findIndex((q) => dist(q, p) < 0.032);
    if (duplicateIndex < 0) {
      out.push(p);
      continue;
    }

    const previous = out[duplicateIndex];
    const previousConfidence = previous.confidence ?? 0.5;
    // À position identique : défense reconnue > attaque, puis numéro lu > vide,
    // puis meilleure confiance. On ne crée jamais un second joueur.
    const replace =
      (p.type === "defender" && previous.type !== "defender") ||
      (!previous.label && !!p.label) ||
      (p.type === previous.type && !!p.label === !!previous.label && confidence > previousConfidence);
    if (replace) out[duplicateIndex] = p;
  }

  return out.slice(0, 10);
}

function clean(diagram: AiExerciseDiagram): AiExerciseDiagram {
  const players = playersOf(diagram.players || []);

  return {
    ...diagram,
    detected: players.length > 0,
    players,
    // Palier volontairement strict : cette passe reconstruit les JOUEURS.
    // Les traits/plots/ballons ne doivent plus générer de faux joueurs ou de
    // parasites dans la Plaquette. Ils seront réactivés séparément après
    // validation de la géométrie et des joueurs.
    objects: [],
    actions: [],
    notes:
      "Vision 2 papier strict · terrain redressé · numéro/rond = attaquant · rond avec bras = défenseur · aucune création automatique",
  };
}

export async function scanPlayersFree(
  file: File,
  onStatus?: (message: string) => void
): Promise<AiExerciseImport> {
  onStatus?.("Vision 2 papier · redressement du terrain puis lecture stricte des joueurs…");

  const scanned = await scanExerciseLocally(file, onStatus);
  const diagrams = (scanned.diagrams?.length ? scanned.diagrams : [scanned.diagram]).map(clean);
  const diagram = diagrams[0] ?? clean(scanned.diagram);
  const players = diagrams.flatMap((d) => d.players);
  const attackers = players.filter((p) => p.team === "att").length;
  const defenders = players.filter((p) => p.team === "def").length;
  const numbered = players.filter((p) => !!p.label).length;

  return {
    ...scanned,
    title: "",
    organisation: "",
    deroulement: [],
    consignes: [],
    variantes: [],
    plots: null,
    ballons: null,
    paniers: null,
    joueurs: players.length || null,
    categorie: "— Choisir —",
    temps: null,
    themes: [],
    diagram,
    diagrams,
    source: "local",
    warnings: [
      `Vision 2 papier : ${players.length} joueurs conservés (${attackers} attaquants, ${defenders} défenseurs).`,
      `Numéros réellement lus : ${numbered}/${players.length}. Aucun numéro inventé.`,
      "Placement : coordonnées du terrain redressé conservées telles quelles ; aucun joueur ni objet ajouté automatiquement.",
    ],
  };
}
