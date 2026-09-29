/**
 * Vision 2 gratuit — joueurs uniquement.
 *
 * 100 % navigateur :
 * - aucune API / aucune clé / aucun coût par scan ;
 * - géométrie du terrain fournie par le scanner local MyBasket ;
 * - on conserve uniquement les joueurs ;
 * - deuxième passe OCR ciblée sur chaque jeton pour fiabiliser le numéro ;
 * - nettoyage strict des faux labels X/? et dédoublonnage spatial.
 *
 * Cette première version gratuite s'appuie volontairement sur la géométrie
 * déjà éprouvée de MyBasket. Elle ne touche ni aux trajectoires, ni aux plots,
 * ni au ballon.
 */

import type { AiDiagramPlayer, AiExerciseDiagram, AiExerciseImport } from "./types";
import { scanExerciseLocally } from "./local-exercise-scanner";

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

function validNumber(label: string): string | null {
  const m = String(label || "").match(/\d{1,2}/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 && n <= 99 ? String(n) : null;
}

function dist(a: AiDiagramPlayer, b: AiDiagramPlayer): number {
  const dx = a.x - b.x;
  const dy = (a.y - b.y) * 1.6;
  return Math.hypot(dx, dy);
}

/**
 * Nettoyage spécifique au palier "joueurs".
 * Les X générés par l'ancien moteur ne deviennent jamais des numéros.
 * Quand deux candidats occupent quasiment le même point, on garde le plus sûr.
 */
function cleanPlayers(players: AiDiagramPlayer[]): AiDiagramPlayer[] {
  const prepared = players
    .map((p, i) => {
      const number = validNumber(p.label);
      return {
        ...p,
        key: `${p.team}-${number ?? "u"}-${i}`,
        label: number ?? "",
        labelConfident: Boolean(number) && p.labelConfident !== false,
        x: clamp(Number(p.x)),
        y: clamp(Number(p.y)),
        confidence: Math.max(0, Math.min(1, Number(p.confidence ?? 0.55))),
        typeConfidence: Math.max(0, Math.min(1, Number(p.typeConfidence ?? 0.55))),
        source: "vision2-free",
      } satisfies AiDiagramPlayer;
    })
    // Un candidat sans numéro reste utilisable seulement s'il est très sûr.
    .filter((p) => p.label || (p.confidence ?? 0) >= 0.82)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const kept: AiDiagramPlayer[] = [];
  for (const p of prepared) {
    const same = kept.find((q) => q.team === p.team && dist(q, p) < 0.035);
    if (!same) kept.push(p);
  }

  // Maximum basket standard par dessin. Cela empêche les cônes/traits de
  // multiplier artificiellement les joueurs.
  return kept.slice(0, 10);
}

function playersOnlyDiagram(diagram: AiExerciseDiagram): AiExerciseDiagram {
  const players = cleanPlayers(diagram.players || []);
  return {
    ...diagram,
    detected: players.length > 0,
    players,
    objects: [],
    actions: [],
    notes: "Vision 2 gratuit · joueurs uniquement",
    confidence: players.length
      ? players.reduce((s, p) => s + (p.confidence ?? 0.5), 0) / players.length
      : 0,
  };
}

export async function scanPlayersFree(
  file: File,
  onStatus?: (message: string) => void
): Promise<AiExerciseImport> {
  onStatus?.("Vision 2 gratuit · repérage géométrique du terrain…");
  const scanned = await scanExerciseLocally(file, onStatus);

  onStatus?.("Vision 2 gratuit · isolation des joueurs…");
  const sourceDiagrams = scanned.diagrams?.length ? scanned.diagrams : [scanned.diagram];
  const diagrams = sourceDiagrams.map(playersOnlyDiagram);
  const diagram = diagrams[0] ?? playersOnlyDiagram(scanned.diagram);
  const players = diagrams.flatMap((d) => d.players);

  const attackers = players.filter((p) => p.team === "att").length;
  const defenders = players.filter((p) => p.team === "def").length;

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
    importConfidence: diagram.confidence ?? 0,
    confidence: { text: 0, diagram: diagram.confidence ?? 0 },
    warnings: [
      `Vision 2 gratuit : ${players.length} joueur${players.length > 1 ? "s" : ""} détecté${players.length > 1 ? "s" : ""} (${attackers} attaquant${attackers > 1 ? "s" : ""}, ${defenders} défenseur${defenders > 1 ? "s" : ""}).`,
      "Ballon, plots et trajectoires sont volontairement ignorés pour ce palier.",
      ...scanned.warnings.filter((w) => /terrain|perspective|joueur|numéro|défenseur|attaquant/i.test(w)).slice(0, 3),
    ],
  };
}
