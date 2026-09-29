/**
 * Vision 2 gratuit — joueurs + plots.
 *
 * Ce palier reste 100 % navigateur : aucun appel OpenAI.
 * Le moteur local MyBasket fait la géométrie, la segmentation et l'OCR.
 * Cette couche évite surtout les erreurs de l'ancienne version :
 * - un numéro illisible ne fait PLUS disparaître un joueur ;
 * - aucun numéro n'est inventé ;
 * - les plots/cones orange sont conservés ;
 * - un faux "joueur" posé sur un plot est rejeté ;
 * - attaquants et défenseurs gardent leur type natif.
 */

import type {
  AiDiagramObject,
  AiDiagramPlayer,
  AiExerciseDiagram,
  AiExerciseImport,
} from "./types";
import { scanExerciseLocally } from "./local-exercise-scanner";

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

function validNumber(label: string): string | null {
  const m = String(label || "").match(/\d{1,2}/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 && n <= 99 ? String(n) : null;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = (a.y - b.y) * 1.6;
  return Math.hypot(dx, dy);
}

function cleanCones(objects: AiDiagramObject[]): AiDiagramObject[] {
  const cones = objects
    .filter((o) => o.kind === "cone" || o.kind === "triangle")
    .map((o) => ({
      ...o,
      kind: "cone" as const,
      x: clamp(Number(o.x)),
      y: clamp(Number(o.y)),
      confidence: Math.max(0, Math.min(1, Number(o.confidence ?? 0.65))),
      source: "vision2-free-cone",
    }))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const kept: AiDiagramObject[] = [];
  for (const cone of cones) {
    if (!kept.some((q) => distance(q, cone) < 0.025)) kept.push(cone);
  }
  return kept.slice(0, 20);
}

function cleanPlayers(players: AiDiagramPlayer[], cones: AiDiagramObject[]): AiDiagramPlayer[] {
  const prepared = players
    .map((p, i) => {
      const number = validNumber(p.label);
      const team = p.type === "defender" || p.team === "def" ? "def" : "att";
      const type = team === "def" ? "defender" : "attacker";
      const confidence = Math.max(0, Math.min(1, Number(p.confidence ?? 0.55)));
      return {
        ...p,
        key: `v2-${team}-${number ?? "u"}-${i}`,
        // IMPORTANT : vide si OCR incertain. On ne remplace jamais par 1,2,3...
        label: number ?? "",
        labelConfident: Boolean(number) && p.labelConfident !== false,
        team,
        type,
        x: clamp(Number(p.x)),
        y: clamp(Number(p.y)),
        confidence,
        typeConfidence: Math.max(0, Math.min(1, Number(p.typeConfidence ?? 0.6))),
        source: "vision2-free-player",
      } satisfies AiDiagramPlayer;
    })
    // Un triangle orange reconnu comme plot ne doit jamais survivre comme joueur.
    .filter((p) => !cones.some((cone) => distance(p, cone) < 0.045))
    // On garde les joueurs sans numéro : l'OCR et la détection sont deux problèmes distincts.
    .filter((p) => (p.confidence ?? 0) >= 0.42)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const kept: AiDiagramPlayer[] = [];
  for (const p of prepared) {
    const same = kept.find((q) => distance(q, p) < 0.03);
    if (!same) {
      kept.push(p);
      continue;
    }
    // Si deux détections se superposent, priorité au défenseur quand le moteur
    // a réellement vu la signature rouge, sinon à la plus confiante.
    if (p.team === "def" && same.team !== "def" && (p.typeConfidence ?? 0) >= 0.62) {
      const index = kept.indexOf(same);
      kept[index] = p;
    }
  }

  return kept.slice(0, 10);
}

function visionDiagram(diagram: AiExerciseDiagram): AiExerciseDiagram {
  const cones = cleanCones(diagram.objects || []);
  const players = cleanPlayers(diagram.players || [], cones);
  const confidence = players.length
    ? players.reduce((sum, p) => sum + (p.confidence ?? 0.5), 0) / players.length
    : 0;

  return {
    ...diagram,
    detected: players.length > 0 || cones.length > 0,
    players,
    objects: cones,
    actions: [],
    notes: "Vision 2 gratuit · joueurs + plots",
    confidence,
  };
}

export async function scanPlayersFree(
  file: File,
  onStatus?: (message: string) => void
): Promise<AiExerciseImport> {
  onStatus?.("Vision 2 gratuit · repérage du terrain…");
  const scanned = await scanExerciseLocally(file, onStatus);

  onStatus?.("Vision 2 gratuit · joueurs, défenseurs, numéros et plots…");
  const source = scanned.diagrams?.length ? scanned.diagrams : [scanned.diagram];
  const diagrams = source.map(visionDiagram);
  const diagram = diagrams[0] ?? visionDiagram(scanned.diagram);

  const players = diagrams.flatMap((d) => d.players);
  const cones = diagrams.flatMap((d) => d.objects.filter((o) => o.kind === "cone"));
  const attackers = players.filter((p) => p.team === "att").length;
  const defenders = players.filter((p) => p.team === "def").length;
  const readable = players.filter((p) => Boolean(p.label)).length;

  return {
    ...scanned,
    title: "",
    organisation: "",
    deroulement: [],
    consignes: [],
    variantes: [],
    plots: cones.length || null,
    ballons: null,
    paniers: null,
    joueurs: players.length || null,
    categorie: "— Choisir —",
    temps: null,
    themes: [],
    diagram,
    diagrams,
    source: "local",
    importConfidence: diagram.confidence ?? 0,
    confidence: { text: 0, diagram: diagram.confidence ?? 0 },
    warnings: [
      `Vision 2 gratuit : ${players.length} joueurs (${attackers} attaquants, ${defenders} défenseurs), ${cones.length} plots.`,
      `Numéros lus avec certitude : ${readable}/${players.length}. Les autres restent vides plutôt que d'être inventés.`,
      "Trajectoires et ballon restent volontairement ignorés à ce palier.",
    ],
  };
}
