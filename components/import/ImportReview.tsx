"use client";

/**
 * components/import/ImportReview.tsx
 * ---------------------------------------------------------------------------
 * APERÇU ET CORRECTION MANUELLE d'un import de schéma.
 *
 * Dernière étape avant la création de l'exercice :
 *
 *   import automatique → APERÇU → correction → validation → exercice
 *
 * Rien n'est jamais présenté comme certain. Chaque élément importé porte sa
 * confiance ; ceux qui sont douteux sont surlignés et listés, et l'utilisateur
 * tranche en un clic. Tant qu'il reste un élément à confirmer, le bouton de
 * validation le dit — sans l'interdire : c'est lui qui décide.
 *
 * Le composant est autonome : aucune dépendance hors React, le terrain est
 * tracé par `strokeCourtLines` (déjà utilisé pour le masque d'import, donc une
 * seule source de vérité géométrique), et l'image redressée peut être affichée
 * en calque sous le dessin pour comparer avec la photo d'origine.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AiDetectionType,
  AiDiagramAction,
  AiDiagramActionKind,
  AiDiagramObject,
  AiDiagramPlayer,
  AiExerciseDiagram,
  AiExerciseImport,
  AiPoint,
} from "@/lib/import/types";
import {
  HALF_COURT_BOTTOM,
  HALF_COURT_LEFT,
  HALF_COURT_RIGHT,
  HALF_COURT_TOP,
  FULL_COURT_BOTTOM,
  FULL_COURT_LEFT,
  FULL_COURT_RIGHT,
  FULL_COURT_TOP,
  strokeCourtLines,
} from "@/lib/import/court-geometry";

/* -------------------------------------------------------------------------- */
/* Réglages visuels                                                           */
/* -------------------------------------------------------------------------- */

const COLORS = {
  bord: "#6B1A2C",
  gold: "#D4A24C",
  ink: "#0F0F12",
  doubt: "#E8743C",
  selected: "#1D9BF0",
  surface: "#F6F3EE",
};

/** En dessous, un élément est présenté comme « à confirmer ». */
export const REVIEW_THRESHOLD = 0.5;

export type Selection =
  | { kind: "player"; index: number }
  | { kind: "object"; index: number }
  | { kind: "action"; index: number; end: "from" | "to" | "curve"; pointIndex?: number }
  | null;

type Props = {
  /** Résultat brut de `scanExerciseLocally`. */
  result: AiExerciseImport;
  /** Appelé avec le résultat CORRIGÉ quand l'utilisateur valide. */
  onValidate: (corrected: AiExerciseImport) => void;
  onCancel?: () => void;
  /** Index du schéma affiché au départ, si l'import en contient plusieurs. */
  initialDiagram?: number;
  batchMode?: boolean;
  /** Libellé du bouton de retrait (« Annuler » par défaut, « Retour » depuis l'écran de résumé). */
  cancelLabel?: string;
  /** Libellé du bouton de validation quand plus rien n'est à confirmer. */
  validateLabel?: string;
};

/** Un élément que l'utilisateur doit trancher avant de valider. */
export type ReviewItem = { label: string; selection: Selection; detail: string };

/* -------------------------------------------------------------------------- */
/* Utilitaires de coordonnées                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Canonique → pixels du canvas d'aperçu.
 * Le repère canonique est celui de la Plaquette : x ∈ [0,1] sur la largeur,
 * y ∈ [0,1] en plein terrain, un demi-terrain n'utilisant que y ∈ [0,0.5].
 */
function canonicalToPixel(point: AiPoint, width: number, height: number, courtType: "half" | "full") {
  const displayY = courtType === "full" ? point.y : point.y / 0.5;
  return { x: point.x * width, y: displayY * height };
}

function pixelToCanonical(x: number, y: number, width: number, height: number, courtType: "half" | "full"): AiPoint {
  const u = Math.min(1, Math.max(0, x / width));
  const v = Math.min(1, Math.max(0, y / height));
  return { x: u, y: courtType === "full" ? v : v * 0.5 };
}

/** Rectangle de l'aire de jeu dans le repère canonique, pour tracer les lignes. */
function playRect(courtType: "half" | "full") {
  return courtType === "full"
    ? { x0: FULL_COURT_LEFT, x1: FULL_COURT_RIGHT, y0: FULL_COURT_TOP, y1: FULL_COURT_BOTTOM }
    : { x0: HALF_COURT_LEFT, x1: HALF_COURT_RIGHT, y0: HALF_COURT_TOP, y1: HALF_COURT_BOTTOM };
}

function curveHandles(points: AiPoint[] | undefined) {
  if (!points || points.length < 3) return [];
  const count = Math.min(7, points.length - 2);
  return Array.from({ length: count }, (_, i) =>
    Math.round((i + 1) * (points.length - 1) / (count + 1)));
}

function distanceToSegment(point: AiPoint, start: AiPoint, end: AiPoint) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

const needsReview = (confidence: number | undefined, type?: AiDetectionType): boolean =>
  type === "unknown" || (confidence ?? 1) < REVIEW_THRESHOLD;

/* -------------------------------------------------------------------------- */
/* Éléments « à confirmer » — RÈGLE UNIQUE                                    */
/* -------------------------------------------------------------------------- */

/**
 * Liste les éléments douteux d'UN schéma.
 *
 * Cette fonction est la seule définition de « élément à vérifier ». L'écran de
 * résumé (ExercisePhotoImport) et l'écran de correction l'utilisent tous les
 * deux : le compteur annoncé avant correction ne peut donc pas diverger de la
 * liste affichée pendant la correction.
 */
export function reviewItemsOfDiagram(diagram: AiExerciseDiagram | undefined): ReviewItem[] {
  const list: ReviewItem[] = [];
  if (!diagram) return list;

  diagram.players.forEach((player, index) => {
    const type: AiDetectionType = player.type ?? (player.team === "def" ? "defender" : "attacker");
    if (!needsReview(player.typeConfidence, type) && player.labelConfident !== false) return;
    list.push({
      label: `Joueur ${player.label}`,
      selection: { kind: "player", index },
      detail:
        type === "unknown"
          ? "attaquant ou défenseur ?"
          : player.labelConfident === false
          ? "numéro illisible"
          : `type peu sûr (${Math.round((player.typeConfidence ?? 0) * 100)} %)`,
    });
  });

  diagram.objects.forEach((object, index) => {
    if (!needsReview(object.confidence)) return;
    list.push({
      label: object.kind === "text" ? `Texte « ${object.text ?? ""} »` : `Objet ${object.kind}`,
      selection: { kind: "object", index },
      detail: `confiance ${Math.round((object.confidence ?? 0) * 100)} %`,
    });
  });

  diagram.actions.forEach((action, index) => {
    if (!needsReview(action.confidence)) return;
    list.push({
      label: `Tracé ${action.action}`,
      selection: { kind: "action", index, end: "to" },
      detail: `confiance ${Math.round((action.confidence ?? 0) * 100)} %`,
    });
  });

  return list;
}

/** Les schémas exploitables d'un import, dans l'ordre d'affichage. */
export function diagramsOf(result: AiExerciseImport): AiExerciseDiagram[] {
  if (result.diagrams?.length) return result.diagrams;
  return result.diagram?.detected ? [result.diagram] : [];
}

/** Nombre total d'éléments à vérifier, tous schémas confondus. */
export function countReviewItems(result: AiExerciseImport): number {
  const diagrams = diagramsOf(result);
  if (!diagrams.length) return reviewItemsOfDiagram(result.referenceFallback).length;
  return diagrams.reduce((total, diagram) => total + reviewItemsOfDiagram(diagram).length, 0);
}

/* -------------------------------------------------------------------------- */
/* Composant                                                                  */
/* -------------------------------------------------------------------------- */

export default function ImportReview({
  result,
  onValidate,
  onCancel,
  initialDiagram = 0,
  batchMode = false,
  cancelLabel = "Annuler",
  validateLabel = "Valider l'import",
}: Props) {
  const initial = useMemo<AiExerciseDiagram[]>(() => {
    const detected = diagramsOf(result);
    const source = !detected.length && result.referenceFallback ? [result.referenceFallback] : detected;
    // Copie profonde : on ne modifie jamais le résultat d'import reçu.
    return source.map((diagram) => ({
      ...diagram,
      players: diagram.players.map((player) => ({ ...player })),
      objects: diagram.objects.map((object) => ({ ...object })),
      actions: diagram.actions.map((action) => ({
        ...action,
        points: action.points ? action.points.map((point) => ({ ...point })) : undefined,
      })),
    }));
  }, [result]);

  const [diagrams, setDiagrams] = useState<AiExerciseDiagram[]>(initial);
  const [current, setCurrent] = useState(Math.min(initialDiagram, Math.max(0, initial.length - 1)));
  const [selection, setSelection] = useState<Selection>(null);
  const [stage, setStage] = useState<"players" | "actions">("players");
  const [showUncertain, setShowUncertain] = useState(Boolean(result.referenceFallback));
  const checkStage = (next: "players" | "actions") => {
    setStage(next); setSelection(null); setTraceMode(false); setDragging(false);
    setAddMode(null); setAnnotationMode(false); traceRef.current = null; setTracePreview([]);
  };
  const [overlay, setOverlay] = useState(0);
  const [traceMode, setTraceMode] = useState(false);
  const [traceKind, setTraceKind] = useState<AiDiagramActionKind>("freedraw");
  const traceRef = useRef<AiPoint[] | null>(null);
  const [tracePreview, setTracePreview] = useState<AiPoint[]>([]);
  const [addMode, setAddMode] = useState<AiDetectionType | "cone" | "ball" | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotation, setAnnotation] = useState("");
  const [inkColor, setInkColor] = useState("#0f0f12");
  const [dragging, setDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayImage = useRef<HTMLImageElement | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const nativeCourtImage = useRef<HTMLImageElement | null>(null);
  const [nativeCourtReady, setNativeCourtReady] = useState(false);

  const diagram = diagrams[current];
  const courtType: "half" | "full" = diagram?.courtType ?? "half";
  const size = courtType === "full" ? { w: 560, h: 880 } : { w: 720, h: 564 };

  useEffect(() => {
    const court = new Image();
    court.onload = () => { nativeCourtImage.current = court; setNativeCourtReady(true); };
    court.src = courtType === "full" ? "/plaquette/full-court.jpg" : "/plaquette/half-court.jpg";
    return () => { court.onload = null; };
  }, [courtType]);

  useEffect(() => {
    setOverlay(result.referenceFallback ? .65 : 0);
    setOverlayReady(false);
    overlayImage.current = null;
    if (!diagram?.courtReference?.url) return;
    const image = new Image();
    image.onload = () => {
      overlayImage.current = image;
      setOverlayReady(true);
    };
    image.src = diagram.courtReference.url;
    return () => { image.onload = null; };
  }, [diagram?.courtReference?.url, result.referenceFallback]);

  /* ------------------------------------------------------------- rendu */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !diagram) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.surface;
    ctx.fillRect(0, 0, width, height);

    // Toujours afficher le vrai terrain MyBasket comme base de travail.
    if (nativeCourtReady && nativeCourtImage.current) {
      ctx.drawImage(nativeCourtImage.current, 0, 0, width, height);
    }

    // Calque : la photo redressée, sous le dessin, pour comparer d'un coup d'œil.
    if (overlay > 0 && overlayReady && overlayImage.current && diagram.courtReference) {
      ctx.save();
      ctx.globalAlpha = overlay;
      const area = playRect(courtType);
      const { play } = diagram.courtReference;
      const w = (area.x1 - area.x0) * width / (play.x1 - play.x0);
      const h = (area.y1 - area.y0) * height / (play.y1 - play.y0);
      ctx.drawImage(overlayImage.current, area.x0 * width - play.x0 * w, area.y0 * height - play.y0 * h, w, h);
      ctx.restore();
    }

    // Terrain vectoriel uniquement en repli si l’image native n’est pas disponible.
    const rect = playRect(courtType);
    const px0 = rect.x0 * width;
    const py0 = (courtType === "full" ? rect.y0 : rect.y0) * height;
    const pw = (rect.x1 - rect.x0) * width;
    const ph = (rect.y1 - rect.y0) * height;
    if (!nativeCourtReady) {
      ctx.save();
      ctx.translate(px0, py0);
      ctx.strokeStyle = COLORS.bord;
      strokeCourtLines(ctx, pw, ph, courtType, Math.max(1.5, pw * 0.004));
      ctx.restore();
    }

    const toPixel = (point: AiPoint) => canonicalToPixel(point, width, height, courtType);

    if (tracePreview.length > 1) {
      ctx.save();
      ctx.strokeStyle = inkColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      tracePreview.forEach((point, index) => {
        const p = toPixel(point);
        if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // Trajectoires
    if (stage === "actions") diagram.actions.forEach((action, index) => {
      if (!showUncertain && needsReview(action.confidence)) return;
      const from = toPixel(action.from ?? action.to);
      const to = toPixel(action.to);
      const doubt = needsReview(action.confidence);
      const isSelected = selection?.kind === "action" && selection.index === index;
      ctx.save();
      ctx.strokeStyle = isSelected ? COLORS.selected : action.color || (doubt ? COLORS.doubt : COLORS.ink);
      ctx.lineWidth = isSelected ? 4 : 3;
      ctx.setLineDash(action.action === "pass" ? [9, 6] : []);
      ctx.beginPath();
      if (action.points && action.points.length > 1) {
        action.points.forEach((point, i) => {
          const p = toPixel(point);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
      } else {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // The last segment gives the direction of curved paths.
      const last = action.points?.at(-1);
      const previous = action.points?.at(-2);
      const tip = last ? toPixel(last) : to;
      const start = previous ? toPixel(previous) : from;
      const angle = Math.atan2(tip.y - start.y, tip.x - start.x);
      if (action.action !== "freedraw") {
        ctx.beginPath();
        if (action.action === "screen") {
          const dx = 8 * Math.sin(angle), dy = 8 * Math.cos(angle);
          ctx.moveTo(tip.x - dx, tip.y + dy);
          ctx.lineTo(tip.x + dx, tip.y - dy);
          ctx.stroke();
        } else {
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(tip.x - 13 * Math.cos(angle - 0.4), tip.y - 13 * Math.sin(angle - 0.4));
          ctx.lineTo(tip.x - 13 * Math.cos(angle + 0.4), tip.y - 13 * Math.sin(angle + 0.4));
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }
      }
      // poignées d'extrémité
      for (const [end, point] of [["from", from], ["to", to]] as Array<["from" | "to", { x: number; y: number }]>) {
        const handleSelected = isSelected && selection?.kind === "action" && selection.end === end;
        ctx.beginPath();
        ctx.arc(point.x, point.y, handleSelected ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = handleSelected ? COLORS.selected : "#ffffff";
        ctx.fill();
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (isSelected) for (const pointIndex of curveHandles(action.points)) {
        const p = toPixel(action.points![pointIndex]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.selected;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    });

    // Objets
    diagram.objects.forEach((object, index) => {
      const p = toPixel(object);
      const doubt = needsReview(object.confidence);
      const isSelected = selection?.kind === "object" && selection.index === index;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (object.kind === "cone") {
        ctx.fillStyle = doubt ? COLORS.doubt : "#E87722";
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(9, 8);
        ctx.lineTo(-9, 8);
        ctx.closePath();
        ctx.fill();
      } else if (object.kind === "ball") {
        ctx.fillStyle = doubt ? COLORS.doubt : "#E8743C";
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
      } else if (object.kind === "text") {
        ctx.fillStyle = doubt ? COLORS.doubt : object.color || COLORS.ink;
        ctx.font = "600 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(object.text ?? "", 0, 4);
      } else {
        ctx.strokeStyle = doubt ? COLORS.doubt : COLORS.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(-8, -8, 16, 16);
      }
      if (isSelected) {
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 17, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });

    // Joueurs
    diagram.players.forEach((player, index) => {
      const p = toPixel(player);
      const type: AiDetectionType = player.type ?? (player.team === "def" ? "defender" : "attacker");
      const doubt = needsReview(player.typeConfidence, type) || player.labelConfident === false;
      const isSelected = selection?.kind === "player" && selection.index === index;
      const radius = 17;

      ctx.save();
      ctx.translate(p.x, p.y);

      if (type === "defender") {
        ctx.strokeStyle = COLORS.bord;
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-radius * 0.45, 0);
        ctx.bezierCurveTo(-radius * 1.4, radius * 0.5, -radius * 2.3, 0, -radius * 2.4, -radius * 1.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(radius * 0.45, 0);
        ctx.bezierCurveTo(radius * 1.4, radius * 0.5, radius * 2.3, 0, radius * 2.4, -radius * 1.05);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = type === "unknown" ? "#8A8A8A" : COLORS.bord;
      ctx.fill();
      ctx.lineWidth = doubt ? 3.5 : 2;
      ctx.strokeStyle = isSelected ? COLORS.selected : doubt ? COLORS.doubt : COLORS.gold;
      ctx.stroke();

      ctx.fillStyle = type === "unknown" ? "#FFFFFF" : COLORS.gold;
      ctx.font = `700 ${String(player.label).length > 1 ? 14 : 16}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(player.label || (type === "unknown" ? "?" : "")), 0, 1);
      ctx.restore();
    });
  }, [diagram, courtType, overlay, overlayReady, selection, nativeCourtReady, tracePreview, inkColor, stage, showUncertain]);

  useEffect(() => {
    draw();
  }, [draw]);

  /* ------------------------------------------------------- interactions */

  const pointerPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const hitTest = (x: number, y: number): Selection => {
    if (!diagram || !canvasRef.current) return null;
    const { width, height } = canvasRef.current;
    const toPixel = (point: AiPoint) => canonicalToPixel(point, width, height, courtType);

    if (stage === "actions" && selection?.kind === "action") {
      const selected = diagram.actions[selection.index];
      const pointIndex = curveHandles(selected?.points).find(index => {
        const p = toPixel(selected.points![index]);
        return Math.hypot(p.x - x, p.y - y) <= 11;
      });
      if (pointIndex !== undefined) return { ...selection, end: "curve", pointIndex };
    }

    for (let i = diagram.players.length - 1; i >= 0; i -= 1) {
      const p = toPixel(diagram.players[i]);
      if (Math.hypot(p.x - x, p.y - y) <= 20) return { kind: "player", index: i };
    }
    for (let i = diagram.objects.length - 1; i >= 0; i -= 1) {
      const p = toPixel(diagram.objects[i]);
      if (Math.hypot(p.x - x, p.y - y) <= 16) return { kind: "object", index: i };
    }
    if (stage !== "actions") return null;
    for (let i = diagram.actions.length - 1; i >= 0; i -= 1) {
      const action = diagram.actions[i];
      if (!showUncertain && needsReview(action.confidence)) continue;
      const to = toPixel(action.to);
      if (Math.hypot(to.x - x, to.y - y) <= 12) return { kind: "action", index: i, end: "to" };
      const from = toPixel(action.from ?? action.to);
      if (Math.hypot(from.x - x, from.y - y) <= 12) return { kind: "action", index: i, end: "from" };
    }
    let nearest: Selection = null;
    let gap = 11;
    diagram.actions.forEach((action, index) => {
      if (!showUncertain && needsReview(action.confidence)) return;
      const path = (action.points?.length ? action.points : [action.from ?? action.to, action.to]).map(toPixel);
      for (let i = 1; i < path.length; i++) {
        const distance = distanceToSegment({ x, y }, path[i - 1], path[i]);
        if (distance >= gap) continue;
        gap = distance;
        nearest = { kind: "action", index, end: "curve" };
      }
    });
    return nearest;
  };

  const updateDiagram = (change: (current: AiExerciseDiagram) => AiExerciseDiagram) => {
    setDiagrams((previous) => previous.map((item, index) => (index === current ? change(item) : item)));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!diagram) return;
    const { x, y } = pointerPosition(event);
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (traceMode) {
      const point = pixelToCanonical(x, y, canvas.width, canvas.height, courtType);
      traceRef.current = [point];
      setTracePreview([point]);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (annotationMode) {
      const label = annotation.trim();
      if (!label) return;
      const point = pixelToCanonical(x, y, canvas.width, canvas.height, courtType);
      updateDiagram(item => ({ ...item, objects: [...item.objects, {
        ...point, kind: "text", text: label, color: inkColor, confidence: 1, source: "ajouté à la main",
      }] }));
      setAnnotationMode(false);
      setSelection({ kind: "object", index: diagram.objects.length });
      return;
    }

    if (addMode) {
      const point = pixelToCanonical(x, y, canvas.width, canvas.height, courtType);
      if (addMode === "cone" || addMode === "ball") {
        updateDiagram(item => ({ ...item, objects: [...item.objects, {
          ...point, kind: addMode, color: "#F05A16", confidence: 1, source: "ajouté à la main",
        }] }));
        setAddMode(null);
        setSelection({ kind: "object", index: diagram.objects.length });
        return;
      }
      const team = addMode === "defender" ? "def" : "att";
      const usedNumbers = new Set(diagram.players.filter(player => player.team === team)
        .map(player => player.label.trim().replace(/^x\s*/i, "")));
      let number = 1;
      while (usedNumbers.has(String(number))) number++;
      const added: AiDiagramPlayer = {
        key: `manual-${Date.now()}`,
        label: team === "def" ? `X${number}` : String(number),
        team,
        x: point.x,
        y: point.y,
        shape: "circle",
        type: addMode,
        confidence: 1,
        typeConfidence: 1,
        labelConfident: true,
        source: "ajouté à la main",
      };
      updateDiagram((item) => ({ ...item, players: [...item.players, added] }));
      setAddMode(null);
      setSelection({ kind: "player", index: diagram.players.length });
      return;
    }

    const hit = hitTest(x, y);
    setSelection(hit);
    setDragging(Boolean(hit));
    if (hit) event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if ((!traceRef.current && (!dragging || !selection)) || !diagram) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = pointerPosition(event);
    const point = pixelToCanonical(x, y, canvas.width, canvas.height, courtType);

    if (traceRef.current) {
      const last = traceRef.current.at(-1)!;
      if (Math.hypot(last.x - point.x, last.y - point.y) > 0.002 && traceRef.current.length < 800) {
        traceRef.current.push(point);
        setTracePreview([...traceRef.current]);
      }
      return;
    }
    if (!selection) return;
    updateDiagram((item) => {
      if (selection.kind === "player") {
        const players = item.players.map((player, index) =>
          index === selection.index
            ? { ...player, x: point.x, y: point.y, source: `${player.source ?? ""} · déplacé`.trim() }
            : player
        );
        const original = item.players[selection.index];
        const dx = point.x-original.x, dy = point.y-original.y;
        const actions = item.actions.map(line => {
          const from = line.fromPlayer === original.key, to = line.toPlayer === original.key;
          if (!from && !to) return line;
          return { ...line,
            from: from && line.from ? { x: line.from.x+dx, y: line.from.y+dy } : line.from,
            to: to ? { x: line.to.x+dx, y: line.to.y+dy } : line.to,
            points: line.points?.map((p,i,all) => {
              const t=i/Math.max(1,all.length-1), weight=(from ? 1-t : 0)+(to ? t : 0);
              return { x:p.x+dx*weight, y:p.y+dy*weight };
            }),
          };
        });
        return { ...item, players, actions };
      }
      if (selection.kind === "object") {
        const objects = item.objects.map((object, index) =>
          index === selection.index ? { ...object, x: point.x, y: point.y } : object
        );
        return { ...item, objects };
      }
      const actions = item.actions.map((action, index) => {
        if (index !== selection.index) return action;
        if (selection.end === "curve") {
          const pointIndex = selection.pointIndex;
          const path = action.points;
          if (!path || pointIndex === undefined) return action;
          const handles = [0, ...curveHandles(path), path.length - 1];
          const slot = handles.indexOf(pointIndex);
          if (slot < 1 || slot >= handles.length - 1) return action;
          const left = handles[slot - 1], right = handles[slot + 1], anchor = path[pointIndex];
          const points = path.map((p, i) => {
            if (i <= left || i >= right) return p;
            const weight = i <= pointIndex ? (i - left) / (pointIndex - left) : (right - i) / (right - pointIndex);
            return { x: p.x + (point.x - anchor.x) * weight, y: p.y + (point.y - anchor.y) * weight };
          });
          return { ...action, points, confidence: 1, source: "courbe corrigée à la main" };
        }
        const endpoint = selection.end === "to" ? action.to : action.from ?? action.to;
        const points = action.points?.map((p, i, arr) => {
          const t = i / Math.max(1, arr.length - 1);
          const weight = selection.end === "to" ? t : 1 - t;
          return { x: p.x + weight * (point.x - endpoint.x), y: p.y + weight * (point.y - endpoint.y) };
        });
        return selection.end === "to"
          ? { ...action, to: point, toPlayer: undefined, points, confidence: 1, source: "corrigé à la main" }
          : { ...action, from: point, fromPlayer: undefined, points, confidence: 1, source: "corrigé à la main" };
      });
      return { ...item, actions };
    });
  };

  const handlePointerUp = () => {
    setDragging(false);
    const points = traceRef.current;
    traceRef.current = null;
    setTracePreview([]);
    if (!points || points.length < 2) return;
    const from = points[0];
    const to = points[points.length - 1];
    const playerAt = (point: AiPoint) => diagram.players
      .map(player => ({ player, distance: Math.hypot(player.x - point.x, player.y - point.y) }))
      .filter(item => item.distance < .032)
      .sort((a, b) => a.distance - b.distance)[0]?.player;
    const source = traceKind === "freedraw" ? undefined : playerAt(from);
    const receiver = traceKind === "pass" ? playerAt(to) : undefined;
    updateDiagram(item => ({ ...item, actions: [...item.actions, {
      action: traceKind, from, to, points,
      fromPlayer: source?.key, toPlayer: receiver?.key === source?.key ? undefined : receiver?.key,
      color: inkColor, confidence: 1, source: "retracé à la main",
    }] }));
    setSelection({ kind: "action", index: diagram.actions.length, end: "to" });
  };

  const removeSelected = () => {
    if (!selection || !diagram) return;
    updateDiagram((item) => {
      if (selection.kind === "player") {
        const removedKey = item.players[selection.index]?.key;
        return {
          ...item,
          players: item.players.filter((_player, index) => index !== selection.index),
          // Une trajectoire ne peut pas rester accrochée à un joueur supprimé.
          actions: item.actions.map((action) => ({
            ...action,
            fromPlayer: action.fromPlayer === removedKey ? undefined : action.fromPlayer,
            toPlayer: action.toPlayer === removedKey ? undefined : action.toPlayer,
          })),
        };
      }
      if (selection.kind === "object") {
        return { ...item, objects: item.objects.filter((_object, index) => index !== selection.index) };
      }
      return { ...item, actions: item.actions.filter((_action, index) => index !== selection.index) };
    });
    setSelection(null);
  };

  const setPlayerType = (index: number, type: AiDetectionType) => {
    updateDiagram((item) => ({
      ...item,
      players: item.players.map((player, i) =>
        i === index
          ? {
              ...player,
              type,
              team: type === "defender" ? "def" : "att",
              typeConfidence: 1,
              source: `${player.source ?? ""} · confirmé à la main`.trim(),
            }
          : player
      ),
    }));
  };

  const setPlayerLabel = (index: number, label: string) => {
    updateDiagram((item) => ({
      ...item,
      players: item.players.map((player, i) =>
        i === index
          ? {
              ...player,
              label: label.slice(0, 4),
              labelConfident: true,
              source: `${player.source ?? ""} · numéro corrigé`.trim(),
            }
          : player
      ),
    }));
  };

  const togglePlayerBall = (index: number) => {
    updateDiagram((item) => ({
      ...item,
      players: item.players.map((player, i) =>
        i === index ? { ...player, hasBall: !player.hasBall, confidence: 1 } : player
      ),
    }));
  };

  const setActionKind = (index: number, action: AiDiagramActionKind) => {
    updateDiagram((item) => ({
      ...item,
      actions: item.actions.map((line, i) =>
        i === index
          ? {
              ...line,
              action,
              confidence: 1,
              source: `type corrigé à la main : ${action}`,
            }
          : line
      ),
    }));
  };

  const setActionPlayer = (index: number, end: "from" | "to", key: string) => {
    updateDiagram(item => ({
      ...item,
      actions: item.actions.map((line, i) => {
        if (i !== index) return line;
        const player = item.players.find(candidate => candidate.key === key);
        if (!player) return end === "from" ? { ...line, fromPlayer: undefined } : { ...line, toPlayer: undefined };
        const lastMove = item.actions.slice(0, index).findLast(action =>
          action.fromPlayer === key && ["cut", "screen", "dribble"].includes(action.action));
        const point = lastMove?.to ?? { x: player.x, y: player.y };
        const previous = end === "from" ? line.from ?? line.to : line.to;
        const points = line.points?.map((p, j, all) => {
          const t = j / Math.max(1, all.length - 1);
          const weight = end === "from" ? 1 - t : t;
          return { x: p.x + weight * (point.x - previous.x), y: p.y + weight * (point.y - previous.y) };
        });
        return end === "from"
          ? { ...line, from: point, fromPlayer: key, points, confidence: 1 }
          : { ...line, to: point, toPlayer: key, points, confidence: 1 };
      }),
    }));
  };

  const reverseAction = (index: number) => {
    updateDiagram(item => ({ ...item, actions: item.actions.map((action, i) => {
      if (i !== index || !action.from) return action;
      return {
        ...action, from: action.to, to: action.from,
        points: action.points ? [...action.points].reverse() : undefined,
        fromPlayer: action.action === "pass" ? action.toPlayer : undefined,
        toPlayer: action.action === "pass" ? action.fromPlayer : undefined,
      };
    }) }));
  };

  const confirmSelected = () => {
    if (!selection || !diagram) return;
    updateDiagram((item) => {
      if (selection.kind === "player") {
        return {
          ...item,
          players: item.players.map((player, index) =>
            index === selection.index
              ? {
                  ...player,
                  confidence: 1,
                  typeConfidence: 1,
                  labelConfident: true,
                  type: player.type === "unknown" ? "attacker" : player.type,
                  source: `${player.source ?? ""} · confirmé`.trim(),
                }
              : player
          ),
        };
      }
      if (selection.kind === "object") {
        return {
          ...item,
          objects: item.objects.map((object, index) =>
            index === selection.index ? { ...object, confidence: 1, source: "confirmé" } : object
          ),
        };
      }
      return {
        ...item,
        actions: item.actions.map((action, index) =>
          index === selection.index ? { ...action, confidence: 1, source: "confirmé" } : action
        ),
      };
    });
  };

  /* ------------------------------------------------------ éléments douteux */

  const reviewItems = useMemo(() => reviewItemsOfDiagram(diagram), [diagram]);
  const uncertain = reviewItems.filter(item => item.selection?.kind === "action");
  const doubtful = reviewItems.filter(item => stage === "players" ? item.selection?.kind !== "action"
    : showUncertain || item.selection?.kind !== "action");
  const omittedCount = diagrams.reduce((n,item) => n+item.actions.filter(action => needsReview(action.confidence)).length,0);
  const cleanDiagrams = diagrams.map(item => ({ ...item, actions: item.actions.filter(action => !needsReview(action.confidence)) }));
  const kept = cleanDiagrams.filter(
    (item) => item.players.length > 0 || item.actions.length > 0 || item.objects.length > 0
  );
  const totalDoubtful = cleanDiagrams.reduce((sum, item) => sum + reviewItemsOfDiagram(item).length, 0);
  const validate = () => {
    if ((result.referenceFallback || batchMode) && !kept.length) return;
    onValidate({
      ...result,
      referenceFallback: undefined,
      diagram: kept[0] ?? { ...result.diagram, detected: false },
      diagrams: kept,
      warnings: [
        ...(result.warnings ?? []),
        "Schéma vérifié et corrigé à la main avant création de l'exercice.",
      ],
    });
  };

  /* -------------------------------------------------------------- rendu */

  if (!diagram) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyTitle}>Aucun schéma n&apos;a pu être reconstruit.</p>
        {result.rectifiedImage ? (
          <>
            <p style={styles.emptyText}>
              Le terrain a toutefois été redressé : tu peux le garder comme calque et redessiner par-dessus
              dans Plaquette.
            </p>
            <img src={result.rectifiedImage} alt="Terrain redressé" style={styles.emptyImage} />
          </>
        ) : (
          <p style={styles.emptyText}>Tu peux dessiner le schéma directement dans Plaquette.</p>
        )}
        <div style={styles.row}>
          {onCancel ? (
            <button type="button" style={styles.buttonGhost} onClick={onCancel}>
              {cancelLabel}
            </button>
          ) : null}
          <button type="button" style={styles.buttonPrimary} onClick={() => onValidate(result)}>
            Continuer sans schéma
          </button>
        </div>
      </div>
    );
  }

  const selectedPlayer =
    selection?.kind === "player" ? diagram.players[selection.index] : undefined;
  const selectedAction =
    selection?.kind === "action" ? diagram.actions[selection.index] : undefined;

  const actionChoices: Array<{ value: AiDiagramActionKind; label: string; hint: string }> = [
    { value: "pass", label: "Passe", hint: "pointillés + flèche" },
    { value: "cut", label: "Déplacement", hint: "trait plein + flèche" },
    { value: "dribble", label: "Dribble", hint: "zigzag + flèche" },
    { value: "shoot", label: "Tir", hint: "flèche vers le panier" },
    { value: "screen", label: "Écran", hint: "symbole écran" },
    { value: "giveball", label: "Main à main", hint: "handoff" },
    { value: "freedraw", label: "Dessin libre", hint: "tracé non classé" },
  ];

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>{result.referenceFallback && !diagram.players.length && !diagram.actions.length && !diagram.objects.length ? "Reconstitue le schéma sur le calque" : "Vérifie le schéma importé"}</h2>
          {result.referenceFallback && <p style={styles.hint}>{diagram.landmarkMarkerCount && !diagram.players.length && !diagram.actions.length && !diagram.objects.length
            ? "Les points ont servi au calage. Ajoute un joueur ou une action si tu veux enregistrer un schéma."
            : "Le terrain est reconnu. Vérifie les tracés proposés et ajoute les joueurs et les mouvements manquants."}</p>}
          <p style={styles.subtitle}>
            {diagram.landmarkMarkerCount ? `Calage sur ${diagram.landmarkMarkerCount} points de repère`
              : diagram.landmarkAligned ? "Calage sur la raquette et la ligne à trois points" : diagram.rectified
              ? `Terrain redressé (fiabilité ${Math.round((diagram.rectifyScore ?? 0) * 100)} %)`
              : "Terrain détecté sans redressement"}
            {typeof result.importConfidence === "number"
              ? ` · confiance globale ${Math.round(result.importConfidence * 100)} %`
              : ""}
          </p>
        </div>
        {diagrams.length > 1 ? (
          <div style={styles.row}>
            {diagrams.map((_item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  setCurrent(index);
                  setSelection(null);
                }}
                style={index === current ? styles.tabActive : styles.tab}
              >
                Schéma {index + 1}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div style={styles.row} aria-label="Étapes de vérification">
        <button type="button" style={stage === "players" ? styles.tabActive : styles.tab} onClick={() => checkStage("players")}>1. Joueurs</button>
        <button type="button" style={stage === "actions" ? styles.tabActive : styles.tab} onClick={() => checkStage("actions")}>2. Actions</button>
      </div>
      <p style={styles.hint}>{stage === "players"
        ? "Vérifie la position et le rôle des joueurs. Les actions sont masquées à cette étape."
        : "Vérifie le sens et le départ des actions. Les tracés incertains restent à part tant que tu ne les confirmes pas."}</p>

      {result.warnings?.length ? (
        <ul style={styles.warnings}>
          {result.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div style={styles.main}>
        <div>
          <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            style={styles.canvas}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { traceRef.current = null; setTracePreview([]); setDragging(false); }}
          />
          {diagram.courtReference ? (
            <label style={styles.slider}>
              Photo alignée sur le terrain
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(overlay * 100)}
                onChange={(event) => setOverlay(Number(event.target.value) / 100)}
              />
              <span style={styles.sliderValue}>{Math.round(overlay * 100)} %</span>
            </label>
          ) : null}
        </div>

        <div style={styles.panel}>
          <section>
            <h3 style={styles.sectionTitle}>Ajouter</h3>
            <div style={styles.row}>
              <button
                type="button"
                style={addMode === "attacker" ? styles.buttonPrimary : styles.button}
                onClick={() => { setTraceMode(false); setAnnotationMode(false); setAddMode(addMode === "attacker" ? null : "attacker"); }}
              >
                + Attaquant
              </button>
              <button
                type="button"
                style={addMode === "defender" ? styles.buttonPrimary : styles.button}
                onClick={() => { setTraceMode(false); setAnnotationMode(false); setAddMode(addMode === "defender" ? null : "defender"); }}
              >
                + Défenseur
              </button>
              <button type="button" style={addMode === "cone" ? styles.buttonPrimary : styles.button}
                onClick={() => { setTraceMode(false); setAnnotationMode(false); setAddMode(addMode === "cone" ? null : "cone"); }}>
                + Plot
              </button>
              <button type="button" style={addMode === "ball" ? styles.buttonPrimary : styles.button}
                onClick={() => { setTraceMode(false); setAnnotationMode(false); setAddMode(addMode === "ball" ? null : "ball"); }}>
                + Ballon
              </button>
            </div>
            {stage === "actions" && <div style={styles.row}>
              <button type="button" style={traceMode ? styles.buttonPrimary : styles.button}
                aria-pressed={traceMode} onClick={() => { setTraceMode(!traceMode); setAddMode(null); setAnnotationMode(false); }}>
                Retracer un mouvement
              </button>
              {traceMode && <select aria-label="Type de mouvement à retracer" value={traceKind}
                onChange={event => setTraceKind(event.target.value as AiDiagramActionKind)}>
                <option value="freedraw">Dessin libre</option><option value="cut">Déplacement</option>
                <option value="pass">Passe</option><option value="dribble">Dribble</option>
                <option value="screen">Écran</option><option value="shoot">Tir</option>
              </select>}
              {uncertain.length > 0 && <button type="button" style={styles.button}
                aria-pressed={showUncertain} onClick={() => { setShowUncertain(!showUncertain); setSelection(null); }}>
                {showUncertain ? "Masquer les tracés incertains" : `Voir les tracés incertains (${uncertain.length})`}
              </button>}
            </div>}
            <div style={styles.row}>
              <button type="button" style={annotationMode ? styles.buttonPrimary : styles.button}
                aria-pressed={annotationMode} onClick={() => { setAnnotationMode(!annotationMode); setTraceMode(false); setAddMode(null); }}>
                + Texte ou numéro
              </button>
              {annotationMode && <input aria-label="Texte ou numéro à placer" maxLength={40} value={annotation}
                onChange={event => setAnnotation(event.target.value)} placeholder="Ex. 1" />}
              {(traceMode || annotationMode) && <label style={styles.slider}>Couleur
                <input type="color" value={inkColor} onChange={event => setInkColor(event.target.value)} />
              </label>}
            </div>
            {annotationMode && <p style={styles.hint}>Saisis le texte, puis clique sur le terrain pour le placer.</p>}
            {traceMode && <p style={styles.hint}>Suis le tracé de la photo du départ à l’arrivée.</p>}
            {addMode ? <p style={styles.hint}>Clique sur le terrain pour le placer.</p> : null}
          </section>

          <section>
            <h3 style={styles.sectionTitle}>Lecture MyBasket</h3>
            <div style={styles.legend}>
              <span><b>⋯→</b> Passe</span>
              <span><b>—→</b> Déplacement</span>
              <span><b>〰→</b> Dribble</span>
              <span><b>↗︎ panier</b> Tir</span>
            </div>
            <p style={styles.hint}>L’import traduit l’image en objets natifs : rien n’est figé dans une photo.</p>
          </section>

          <section>
            <h3 style={styles.sectionTitle}>Élément sélectionné</h3>
            {selection ? (
              <>
                {selectedPlayer ? (
                  <>
                    <p style={styles.hint}>
                      {selectedPlayer.label} — {selectedPlayer.source ?? "détecté"}
                    </p>
                    <div style={styles.row}>
                      {(["attacker", "defender", "unknown"] as AiDetectionType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          style={
                            (selectedPlayer.type ?? "attacker") === type ? styles.buttonPrimary : styles.button
                          }
                          onClick={() => setPlayerType(selection.index, type)}
                        >
                          {type === "attacker" ? "Attaquant" : type === "defender" ? "Défenseur" : "Incertain"}
                        </button>
                      ))}
                    </div>
                    <div style={styles.fieldRow}>
                      <label style={styles.fieldLabel}>
                        Numéro
                        <input
                          value={selectedPlayer.label}
                          maxLength={4}
                          onChange={(event) => setPlayerLabel(selection.index, event.target.value)}
                          style={styles.input}
                        />
                      </label>
                      <button
                        type="button"
                        style={selectedPlayer.hasBall ? styles.buttonPrimary : styles.button}
                        onClick={() => togglePlayerBall(selection.index)}
                      >
                        {selectedPlayer.hasBall ? "🏀 Porteur" : "+ Ballon"}
                      </button>
                    </div>
                  </>
                ) : selectedAction ? (
                  <>
                    <p style={styles.hint}>
                      Trajectoire détectée : <strong>{selectedAction.action}</strong>. Choisis sa signification MyBasket ;
                      la géométrie du tracé est conservée.
                    </p>
                    <p style={styles.hint}>Glisse les poignées bleues pour ajuster la courbe sur la photo.</p>
                    {selectedAction.from && !curveHandles(selectedAction.points).length && (
                      <button type="button" style={styles.button} onClick={() => {
                        const { from, to } = selectedAction;
                        if (!from) return;
                        const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
                        updateDiagram(item => ({ ...item, actions: item.actions.map((action, index) =>
                          index === selection.index ? { ...action, points: [from, middle, to] } : action) }));
                      }}>
                        Ajouter une poignée
                      </button>
                    )}
                    {selectedAction.from && selectedAction.action !== "freedraw" && (
                      <button type="button" style={styles.button} onClick={() => reverseAction(selection.index)}>
                        Inverser le sens
                      </button>
                    )}
                    {selectedAction.action !== "freedraw" && (
                      <div style={styles.fieldRow}>
                        <label style={styles.fieldLabel}>
                          Joueur au départ
                          <select value={selectedAction.fromPlayer ?? ""} style={styles.input}
                            onChange={event => setActionPlayer(selection.index, "from", event.target.value)}>
                            <option value="">Point libre</option>
                            {diagram.players.filter(player => player.key !== selectedAction.toPlayer).map(player => (
                              <option key={player.key} value={player.key}>{player.label || "Sans numéro"}</option>
                            ))}
                          </select>
                        </label>
                        {selectedAction.action === "pass" && (
                          <label style={styles.fieldLabel}>
                            Destinataire
                            <select value={selectedAction.toPlayer ?? ""} style={styles.input}
                              onChange={event => setActionPlayer(selection.index, "to", event.target.value)}>
                              <option value="">Point libre</option>
                              {diagram.players.filter(player => player.key !== selectedAction.fromPlayer).map(player => (
                                <option key={player.key} value={player.key}>{player.label || "Sans numéro"}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    )}
                    <div style={styles.actionGrid}>
                      {actionChoices.map((choice) => (
                        <button
                          key={choice.value}
                          type="button"
                          title={choice.hint}
                          style={selectedAction.action === choice.value ? styles.actionButtonActive : styles.actionButton}
                          onClick={() => setActionKind(selection.index, choice.value)}
                        >
                          <strong>{choice.label}</strong>
                          <span style={styles.actionHint}>{choice.hint}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p style={styles.hint}>Objet — glisse pour déplacer.</p>
                )}
                <div style={styles.row}>
                  <button type="button" style={styles.button} onClick={confirmSelected}>
                    Confirmer
                  </button>
                  <button type="button" style={styles.buttonDanger} onClick={removeSelected}>
                    Supprimer
                  </button>
                </div>
              </>
            ) : (
              <p style={styles.hint}>Clique sur un élément pour le déplacer, le corriger ou le supprimer.</p>
            )}
          </section>

          <section>
            <h3 style={styles.sectionTitle}>
              À confirmer {doubtful.length ? `(${doubtful.length})` : ""}
            </h3>
            {doubtful.length ? (
              <ul style={styles.doubtList}>
                {doubtful.map((item, index) => (
                  <li key={index}>
                    <button type="button" style={styles.doubtButton} onClick={() => setSelection(item.selection)}>
                      <strong>{item.label}</strong> — {item.detail}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={styles.hint}>Rien à confirmer sur ce schéma.</p>
            )}
          </section>
        </div>
      </div>

      <div style={styles.footer}>
        {batchMode && diagrams.length > 1 && (
          <button type="button" style={styles.buttonGhost} onClick={() => {
            setDiagrams(items => items.filter((_, i) => i !== current));
            setCurrent(Math.min(current, diagrams.length - 2));
            setSelection(null);
          }}>Retirer cette phase du lot</button>
        )}
        {onCancel ? (
          <button type="button" style={styles.buttonGhost} onClick={onCancel}>
            {cancelLabel}
          </button>
        ) : null}
        {stage === "players" ? <button type="button" style={styles.buttonPrimary} onClick={() => checkStage("actions")}>
          Vérifier les actions
        </button> : <>
        {omittedCount > 0 && <span style={styles.hint}>{omittedCount} tracé(s) à confirmer pour les importer.</span>}
        <button type="button" style={styles.buttonPrimary} disabled={Boolean((result.referenceFallback || batchMode) && !kept.length)} onClick={validate}>
          {totalDoubtful
            ? `Valider malgré ${totalDoubtful} élément${totalDoubtful > 1 ? "s" : ""} à confirmer`
            : validateLabel}
        </button>
        </>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles en ligne : aucune dépendance CSS, à adapter à ta charte             */
/* -------------------------------------------------------------------------- */

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: "flex", flexDirection: "column", gap: 16, fontFamily: "system-ui, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: COLORS.ink },
  subtitle: { margin: "4px 0 0", fontSize: 13, color: "#6B6B6B" },
  warnings: { margin: 0, padding: "10px 14px 10px 28px", background: "#FFF7E8", border: "1px solid #F0D9A8", borderRadius: 8, fontSize: 13, color: "#6B4E14" },
  main: { display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" },
  canvas: { border: "1px solid #DED8CE", borderRadius: 10, touchAction: "none", maxWidth: "100%", cursor: "crosshair" },
  slider: { display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 13, color: "#4A4A4A" },
  sliderValue: { minWidth: 44, textAlign: "right" },
  panel: { flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 18, minWidth: 240 },
  sectionTitle: { margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.6, color: "#6B6B6B" },
  row: { display: "flex", gap: 8, flexWrap: "wrap" },
  hint: { margin: "6px 0 0", fontSize: 13, color: "#6B6B6B" },
  fieldRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 },
  fieldLabel: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "#6B6B6B", fontWeight: 600 },
  input: { width: 82, padding: "7px 9px", borderRadius: 8, border: "1px solid #D8D2C8", fontSize: 13, background: "#fff", color: COLORS.ink },
  legend: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, fontSize: 12, color: COLORS.ink },
  actionGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, marginTop: 10 },
  actionButton: { display: "flex", flexDirection: "column", gap: 2, textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid #D8D2C8", background: "#fff", cursor: "pointer", color: COLORS.ink },
  actionButtonActive: { display: "flex", flexDirection: "column", gap: 2, textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid " + COLORS.bord, background: "#F7ECEF", cursor: "pointer", color: COLORS.bord },
  actionHint: { fontSize: 10, fontWeight: 400, opacity: 0.72 },
  button: { padding: "7px 12px", borderRadius: 8, border: "1px solid #D8D2C8", background: "#fff", cursor: "pointer", fontSize: 13 },
  buttonPrimary: { padding: "7px 12px", borderRadius: 8, border: "1px solid " + COLORS.bord, background: COLORS.bord, color: "#fff", cursor: "pointer", fontSize: 13 },
  buttonDanger: { padding: "7px 12px", borderRadius: 8, border: "1px solid #D9534F", background: "#fff", color: "#D9534F", cursor: "pointer", fontSize: 13 },
  buttonGhost: { padding: "7px 12px", borderRadius: 8, border: "1px solid transparent", background: "transparent", color: "#6B6B6B", cursor: "pointer", fontSize: 13 },
  doubtList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  doubtButton: { width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid " + COLORS.doubt, background: "#FFF3EC", cursor: "pointer", fontSize: 13, color: COLORS.ink },
  footer: { display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #E7E2D9", paddingTop: 14 },
  empty: { display: "flex", flexDirection: "column", gap: 12, fontFamily: "system-ui, sans-serif" },
  emptyTitle: { margin: 0, fontSize: 17, fontWeight: 700 },
  emptyText: { margin: 0, fontSize: 14, color: "#6B6B6B" },
  emptyImage: { maxWidth: 420, borderRadius: 10, border: "1px solid #DED8CE" },
};
