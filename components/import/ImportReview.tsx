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

import { Undo2, Redo2, ArrowLeftRight, Spline, Link2, UserRound, Check, Trash2 } from "lucide-react";
import { useReviewHistory } from "./useReviewHistory";
import { changeImportedActionKind } from "@/lib/import/action-kind";
import { hasImportedTurnback, importedCurveHandle, sampleImportedArc } from "@/lib/import/curve-handle";
import { resolveImportPassChoices } from "@/lib/import/import-refiner";
import { reconcileDiagramRosters } from "@/lib/import/diagram-roster";
import { ActionKindDialog } from "./ActionKindDialog";
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

function requiresStartingPlayer(action: AiDiagramAction) {
  return action.action !== "freedraw" && !action.fromPlayer;
}

function curveHandles(action: AiDiagramAction | undefined) {
  const handle = importedCurveHandle(action?.points, action?.action === "dribble");
  return handle ? [handle.index] : [];
}

function reviewPath(action: AiDiagramAction): AiPoint[] {
  const from = action.from ?? action.to;
  if (action.action === "dribble" && action.from && (!action.points || action.points.length < 3)) return changeImportedActionKind({ ...action, action:"cut" }, "dribble").points ?? [from, action.to];
  if (action.action === "dribble" || action.action === "freedraw" || hasImportedTurnback(action.points)) {
    return [from, ...(action.points?.slice(1, -1) ?? []), action.to];
  }
  return sampleImportedArc(from, action.to, importedCurveHandle(action.points)?.point);
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
      label: `Joueur ${player.label || "?"}`,
      selection: { kind: "player", index },
      detail:
        player.labelConfident === false
          ? "numéro à confirmer"
          : type === "unknown"
          ? "attaquant ou défenseur ?"
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
    if (!needsReview(action.confidence) && !requiresStartingPlayer(action)) return;
    list.push({
      label: `Action ${index + 1}`,
      selection: { kind: "action", index, end: "to" },
      detail: !action.fromPlayer && action.action !== "freedraw" ? "Joueur au départ à choisir" : "À confirmer",
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
    return reconcileDiagramRosters(source).map((diagram) => ({
      ...diagram,
      players: diagram.players.map((player) => ({ ...player })),
      objects: diagram.objects.map((object) => ({ ...object })),
      actions: diagram.actions.map((action) => ({
        ...action,
        points: action.points ? action.points.map((point) => ({ ...point })) : undefined,
      })),
    }));
  }, [result]);

  const { diagrams,current,setDiagrams,setCurrent,canUndo,canRedo,undo,redo,beginGesture,endGesture } = useReviewHistory(initial,initialDiagram);
  const [selection, setSelection] = useState<Selection>(null);
  const [stage, setStage] = useState<"players" | "actions">("players");
  const [showUncertain, setShowUncertain] = useState(Boolean(result.referenceFallback));
  const checkStage = (next: "players" | "actions") => {
    setStage(next); setSelection(null); setLinkStart(false); setTraceMode(false); setDragging(false);
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
  const [linkStart, setLinkStart] = useState(false);
  const [actionTypeIndex, setActionTypeIndex] = useState<number | null>(null);
  useEffect(() => { setLinkStart(false); }, [current, selection]);

  const travelHistory = (direction: "undo" | "redo") => {
    endGesture(); traceRef.current=null; setTracePreview([]); setDragging(false); setSelection(null); setLinkStart(false); setActionTypeIndex(null); setAddMode(null); setTraceMode(false); setAnnotationMode(false); setShowUncertain(true);
    if(direction==="undo")undo();else redo();
  };
  const historyShortcuts=useRef({canUndo,canRedo,travelHistory});historyShortcuts.current={canUndo,canRedo,travelHistory};
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null;
      if(!(event.ctrlKey||event.metaKey)||event.altKey||target?.closest('input,textarea,select,[contenteditable="true"],dialog'))return;
      const redoKey=event.key.toLowerCase()==='y'||(event.key.toLowerCase()==='z'&&event.shiftKey),undoKey=event.key.toLowerCase()==='z'&&!event.shiftKey;
      const state=historyShortcuts.current;
      if((redoKey&&state.canRedo)||(undoKey&&state.canUndo)){event.preventDefault();state.travelHistory(redoKey?'redo':'undo')}
    };
    window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
  },[]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [canvasDisplay, setCanvasDisplay] = useState<{width:number;height:number}|null>(null);
  const overlayImage = useRef<HTMLImageElement | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const nativeCourtImage = useRef<HTMLImageElement | null>(null);
  const [nativeCourtReady, setNativeCourtReady] = useState(false);

  const diagram = diagrams[current];
  const courtType: "half" | "full" = diagram?.courtType ?? "half";
  const size = courtType === "full" ? { w: 560, h: 880 } : { w: 720, h: 564 };

  useEffect(() => {
    const viewport=viewportRef.current;
    if(!viewport || typeof ResizeObserver==='undefined')return;
    const resize=()=>{
      const {width,height}=viewport.getBoundingClientRect();
      if(width<1||height<1)return;
      const scale=Math.min(width/size.w,height/size.h,1);
      const next={width:Math.floor(size.w*scale),height:Math.floor(size.h*scale)};
      setCanvasDisplay(previous=>previous?.width===next.width && previous?.height===next.height?previous:next);
    };
    const observer=new ResizeObserver(resize);observer.observe(viewport);resize();
    return()=>observer.disconnect();
  },[size.w,size.h]);

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
      const path = reviewPath(action).map(toPixel);
      path.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      // The last segment gives the direction of curved paths.
      const tip = to;
      const start = path.findLast(point => Math.hypot(point.x - tip.x, point.y - tip.y) >= 3) ?? from;
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
      const middle = path.length === 2
        ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
        : path[Math.floor(path.length / 2)];
      ctx.beginPath();
      ctx.arc(middle.x, middle.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#D4A24C";
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), middle.x, middle.y);

      // poignées d'extrémité
      if (isSelected) for (const [end, point] of [["from", from], ["to", to]] as Array<["from" | "to", { x: number; y: number }]>) {
        const handleSelected = isSelected && selection?.kind === "action" && selection.end === end;
        ctx.beginPath();
        ctx.arc(point.x, point.y, handleSelected ? 7 : 5, 0, Math.PI * 2);
        ctx.strokeStyle = handleSelected ? COLORS.selected : "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (isSelected) for (const pointIndex of curveHandles(action)) {
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
      ctx.fillText(String(player.label || (doubt ? "?" : "")), 0, 1);
      ctx.restore();
    });
  }, [diagram, courtType, overlay, overlayReady, selection, nativeCourtReady, tracePreview, inkColor, stage, showUncertain]);

  useEffect(() => {
    draw();
  }, [draw]);

  /* ------------------------------------------------------- interactions */

  const pointerPosition = (event: React.MouseEvent<HTMLCanvasElement>) => {
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
      const pointIndex = curveHandles(selected).find(index => {
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
      const path = reviewPath(action).map(toPixel);
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

    if (linkStart && selection?.kind === "action") {
      const hit = hitTest(x, y);
      if (hit?.kind === "player") {
        const key = diagram.players[hit.index].key;
        if (key === diagram.actions[selection.index]?.toPlayer) return;
        setActionPlayer(selection.index, "from", key);
        setLinkStart(false);
      }
      return;
    }

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
    if(hit)beginGesture();
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
    if(selection.kind==="action"&&selection.end==="curve"&&selection.pointIndex===undefined)return;
    updateDiagram((item) => {
      if (selection.kind === "player") {
        const players = item.players.map((player, index) =>
          index === selection.index
            ? { ...player, x: point.x, y: point.y, source: "position corrigée à la main" }
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
          const handles = [0, pointIndex, path.length - 1];
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
    endGesture();
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
      action: traceKind, from: source ?? from, to, points,
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
          ? changeImportedActionKind(line, action)
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
        const previousActions = item.actions.slice(0, index);
        const primary = line.action === "pass" && line.continuationChoice?.alternate
          ? previousActions.findIndex(action => action.continuationChoice?.group === line.continuationChoice?.group
            && !action.continuationChoice?.alternate) : -1;
        const lastMove = previousActions.slice(0, primary >= 0 ? primary : index).findLast(action =>
          action.fromPlayer === key && !needsReview(action.confidence) && ["cut", "screen", "dribble"].includes(action.action));
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
    if (selection.kind === "action" && diagram.actions[selection.index] && requiresStartingPlayer(diagram.actions[selection.index])) {
      setLinkStart(true);
      return;
    }
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
  const doubtful = stage === "players"
    ? reviewItems.filter(item => item.selection?.kind !== "action")
    : reviewItems;
  const omittedCount = diagrams.reduce((n,item) => n+resolveImportPassChoices(item.actions).filter(action => needsReview(action.confidence) || requiresStartingPlayer(action)).length,0);
  const cleanDiagrams = diagrams.map(item => {
    return { ...item, actions: resolveImportPassChoices(item.actions) };
  });
  const passGroups = new Map<string, { action: AiDiagramAction; index: number }[]>();
  diagram?.actions.forEach((action, index) => {
    if (action.action !== "pass" || !action.continuationChoice) return;
    const group = action.continuationChoice.group;
    const options = passGroups.get(group) ?? [];
    options.push({ action, index });
    passGroups.set(group, options);
  });
  const choosePass = (group: string, index: number) => {
    updateDiagram(item => ({
      ...item,
      actions: item.actions.map((action, i) => {
        if (action.action !== "pass" || action.continuationChoice?.group !== group) return action;
        return {
          ...action,
          ...(i === index ? { confidence: 1 } : {}),
          continuationChoice: { ...action.continuationChoice, selected: i === index },
        };
      }),
    }));
    setShowUncertain(true);
    setSelection({ kind: "action", index, end: "to" });
  };
  const kept = cleanDiagrams.filter(
    (item) => item.players.length > 0 || item.actions.length > 0 || item.objects.length > 0
  );
  const totalDoubtful = cleanDiagrams.reduce((sum, item) => sum + reviewItemsOfDiagram(item).length, 0);
  const validate = () => {
    if (omittedCount || ((result.referenceFallback || batchMode) && !kept.length)) return;
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
    <div className="import-review" style={styles.wrapper}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Vérifie ton schéma</h2>
          <p style={styles.subtitle}>{diagram.players.length} joueurs · {diagram.actions.length} actions</p>
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
                Phase {index + 1}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="import-top-tools"><div className="import-history" role="group" aria-label="Historique des modifications">
        <button type="button" disabled={!canUndo} aria-label="Annuler la dernière modification" title="Annuler · Ctrl/Cmd + Z" onClick={()=>travelHistory('undo')}><Undo2 size={17}/><span>Annuler</span></button>
        <button type="button" disabled={!canRedo} aria-label="Rétablir la modification" title="Rétablir · Ctrl/Cmd + Maj + Z" onClick={()=>travelHistory('redo')}><Redo2 size={17}/><span>Rétablir</span></button>
      </div>
      <div style={styles.row} aria-label="Étapes de vérification">
        <button type="button" style={stage === "players" ? styles.tabActive : styles.tab} onClick={() => checkStage("players")}>1. Joueurs</button>
        <button type="button" style={stage === "actions" ? styles.tabActive : styles.tab} onClick={() => checkStage("actions")}>2. Actions</button>
      </div>
      </div>
      <p style={styles.hint}>{stage === "players"
        ? "Place les joueurs, puis passe aux actions."
        : "Sélectionne un trait pour modifier son action."}</p>

      {stage === "actions" && [...passGroups].filter(([, options]) => options.length > 1).map(([group, options]) => (
        <div key={group} style={styles.row} role="group" aria-label="Choix de passe">
          <strong>Choix de passe</strong>
          {options.map(({ action, index }, optionIndex) => {
            const receiver = diagram?.players.find(player => player.key === action.toPlayer)?.label;
            const active = cleanDiagrams[current]?.actions.includes(action) ?? false;
            return (
              <button key={index} type="button" aria-pressed={active}
                style={active ? styles.tabActive : styles.tab}
                onClick={() => choosePass(group, index)}>
                {receiver ? `Passe vers le n°${receiver}` : `Passe ${optionIndex + 1} · destinataire à vérifier`}
              </button>
            );
          })}
        </div>
      ))}

      {result.warnings?.length ? <details className="import-details"><summary>Détails de l’analyse</summary><ul style={styles.warnings}>{result.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details> : null}

      <div className="import-workspace" style={styles.main}>
        <div className="import-court">
          <div className="import-court-viewport" ref={viewportRef}>
          <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            style={{...styles.canvas,...canvasDisplay}}
            onPointerDown={handlePointerDown}
            onDoubleClick={event => {
              if (stage !== "actions" || traceMode || addMode || annotationMode || linkStart) return;
              const { x, y } = pointerPosition(event);
              const hit = hitTest(x, y);
              if (hit?.kind !== "action" || (hit.end === "curve" && hit.pointIndex !== undefined) ||
                  selection?.kind !== "action" || selection.index !== hit.index) return;
              setActionTypeIndex(hit.index);
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { endGesture(); traceRef.current = null; setTracePreview([]); setDragging(false); }}
          />
          </div>
          {diagram.courtReference ? (
            <label style={styles.slider}>
              Photo d’origine
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

        <div className="import-inspector" style={styles.panel}>
          <section>
            <h3 style={styles.sectionTitle}>{selectedAction ? `Action ${selection!.index + 1}` : selectedPlayer ? `Joueur ${selectedPlayer.label}` : "Sélection"}</h3>
            {selection ? (
              <>
                {selectedPlayer ? (
                  <>
                    <p style={styles.hint}>
                      Ajuste le numéro et le rôle.
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
                    <div className="import-player-numbers" role="group" aria-label="Numéro du joueur">
                      {[1,2,3,4,5].map(number=><button type="button" key={number}
                        aria-pressed={selectedPlayer.label===String(number)}
                        disabled={diagram.players.some((p,i)=>i!==selection.index && p.team===selectedPlayer.team && p.label===String(number))}
                        onClick={()=>setPlayerLabel(selection.index,String(number))}>{number}</button>)}
                    </div>
                    <div style={styles.fieldRow}>
                      <label style={styles.fieldLabel}>
                        Numéro
                        <input
                          value={selectedPlayer.label}
                          maxLength={4}
                          onFocus={beginGesture} onBlur={endGesture}
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
                    <label className="import-control" style={styles.fieldLabel}><span>Nature de l’action</span>
                      <select aria-label="Nature de l’action" value={selectedAction.action} style={{...styles.input,width:'100%'}} onChange={event=>setActionKind(selection.index,event.target.value as AiDiagramActionKind)}>{actionChoices.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
                    </label>
                    {requiresStartingPlayer(selectedAction) && <p style={styles.hint}>Choisis le joueur au départ.</p>}
                    <div className="import-edit-tools">
                    {selectedAction.from && !curveHandles(selectedAction).length && (
                      <button type="button" className="import-tool-tile" onClick={() => {
                        const { from, to } = selectedAction;
                        if (!from) return;
                        const middle = { x: (from.x + to.x) / 2 - (to.y - from.y) * .16, y: (from.y + to.y) / 2 + (to.x - from.x) * .16 };
                        updateDiagram(item => ({ ...item, actions: item.actions.map((action, index) =>
                          index === selection.index ? { ...action, points: [from, middle, to] } : action) }));
                      }}>
                        <Spline size={20}/><span>Courber le trait</span>
                      </button>
                    )}
                    {selectedAction.from && selectedAction.action !== "freedraw" && (
                      <button type="button" className="import-tool-tile" onClick={() => reverseAction(selection.index)}>
                        <ArrowLeftRight size={20}/><span>Inverser le sens</span>
                      </button>
                    )}
                    </div>
                    {selectedAction.action !== "freedraw" && (
                      <div className="import-owner-fields">
                        <label className="import-control" style={styles.fieldLabel}>
                          <span><UserRound size={15}/> Joueur au départ</span>
                          <select aria-label="Joueur au départ" value={selectedAction.fromPlayer ?? ""} style={styles.input}
                            onChange={event => setActionPlayer(selection.index, "from", event.target.value)}>
                            <option value="">Point libre</option>
                            {diagram.players.filter(player => player.key !== selectedAction.toPlayer).map(player => (
                              <option key={player.key} value={player.key}>{player.label || "Sans numéro"}</option>
                            ))}
                          </select>
                        </label>
                        <button type="button" className="import-tool-tile link-player" aria-pressed={linkStart}
                          onClick={() => {
                            setTraceMode(false); setAddMode(null); setAnnotationMode(false);
                            setLinkStart(active => !active);
                          }}>
                          <Link2 size={20}/><span>{linkStart ? "Clique sur le joueur" : "Choisir sur le terrain"}</span>
                        </button>
                        {selectedAction.action === "pass" && (
                          <label className="import-control" style={styles.fieldLabel}>
                            <span><UserRound size={15}/> Récepteur</span>
                            <select aria-label="Récepteur de la passe" value={selectedAction.toPlayer ?? ""} style={styles.input}
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
                  </>
                ) : (
                  <p style={styles.hint}>Objet — glisse pour déplacer.</p>
                )}
                <div className="import-selection-actions">
                  <button type="button" className="import-confirm" onClick={confirmSelected}><Check size={16}/>
                    {selectedAction && requiresStartingPlayer(selectedAction) ? "Choisir le joueur de départ" : "Confirmer"}
                  </button>
                  <button type="button" className="import-delete" onClick={removeSelected}><Trash2 size={16}/>
                    Supprimer
                  </button>
                </div>
              </>
            ) : (
              <p style={styles.hint}>Choisis un joueur ou un trait sur le terrain.</p>
            )}
          </section>

          {stage === "actions" && <section className="import-action-list"><h3 style={styles.sectionTitle}>Actions détectées</h3>{diagram.actions.map((action,index)=><button key={index} type="button" aria-pressed={selection?.kind==='action'&&selection.index===index} onClick={()=>{setShowUncertain(true);setSelection({kind:'action',index,end:'to'})}}><b>{index+1}</b><span>{actionChoices.find(choice=>choice.value===action.action)?.label||'Tracé'}</span><small>{diagram.players.find(player=>player.key===action.fromPlayer)?.label||'?'}</small></button>)}</section>}
          <details className="import-tools"><summary>Ajouter un élément</summary>
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
          </details>

          <section>
            <h3 style={styles.sectionTitle}>
              À confirmer {doubtful.length ? `(${doubtful.length})` : ""}
            </h3>
            {doubtful.length ? (
              <ul style={styles.doubtList}>
                {doubtful.map((item, index) => (
                  <li key={index}>
                    <button type="button" style={styles.doubtButton} onClick={() => { if (item.selection?.kind === "action") setShowUncertain(true); setSelection(item.selection); }}>
                      <strong>{item.label}</strong> — {item.detail}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{...styles.hint,color:"#258149"}}>✓ Tout est vérifié.</p>
            )}
          </section>
        </div>
      </div>

      {actionTypeIndex !== null && diagram.actions[actionTypeIndex] && (
        <ActionKindDialog
          current={diagram.actions[actionTypeIndex].action}
          choices={actionChoices}
          receiver={diagram.actions[actionTypeIndex].toPlayer}
          receivers={diagram.players.filter(player => player.key !== diagram.actions[actionTypeIndex].fromPlayer)
            .map(player => ({ value: player.key, label: player.label || "Sans numéro" }))}
          onClose={() => setActionTypeIndex(null)}
          onChange={(value, receiver) => {
            beginGesture();
            const line = diagram.actions[actionTypeIndex];
            if (value !== line.action) setActionKind(actionTypeIndex, value as AiDiagramActionKind);
            if (value === "pass" && receiver !== (line.toPlayer ?? "")) setActionPlayer(actionTypeIndex, "to", receiver);
            endGesture();
            setActionTypeIndex(null);
            if (value !== "freedraw" && !line.fromPlayer) setLinkStart(true);
          }}
        />
      )}
      <div className="import-validation" style={styles.footer}>
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
        {omittedCount > 0 && <span style={styles.hint}>{omittedCount} action{omittedCount > 1 ? "s" : ""} à vérifier</span>}
        <button type="button" style={styles.buttonPrimary} disabled={Boolean(omittedCount || ((result.referenceFallback || batchMode) && !kept.length))} onClick={validate}>
          {omittedCount ? "Vérifie les actions" : totalDoubtful
            ? `Importer · ${totalDoubtful} élément${totalDoubtful > 1 ? "s" : ""} à vérifier`
            : validateLabel}
        </button>
        </>}
      </div>
      <style>{`.ce-ai-import-review{min-height:0}.import-review{max-height:calc(94dvh - 92px);min-height:0;gap:10px!important}.import-review>div:not(.import-workspace){flex-shrink:0}.import-review .import-workspace{flex:1;min-height:140px;overflow:hidden;align-items:stretch!important}.import-review .import-court{display:flex;flex-direction:column;align-items:center;min-height:0}.import-court-viewport{flex:1;min-height:120px;width:100%;display:grid;place-items:center;overflow:hidden}.import-review .import-court canvas{max-width:100%;display:block}.import-review .import-court>label{flex-shrink:0;align-self:stretch}.import-inspector{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding-right:4px}.import-review .import-inspector select{box-sizing:border-box;appearance:none;-webkit-appearance:none;display:block;padding:10px 32px 10px 12px!important;min-height:42px;height:auto!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='m1 1 5 5 5-5' fill='none' stroke='%236b1a2c' stroke-width='2'/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:right 12px center!important}.import-player-numbers{display:flex;gap:7px;margin:12px 0}.import-player-numbers button{border-radius:10px;border:1px solid #dfcbd6;background:white;color:#6b1a2c;min-width:36px;min-height:36px;font-weight:800;cursor:pointer}.import-player-numbers button[aria-pressed=true]{background:#6b1a2c;color:white}.import-player-numbers button:disabled{opacity:.25;cursor:default}.import-top-tools{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}.import-history{display:flex;gap:6px;padding:5px;border-radius:13px;background:#f6f2f5;border:1px solid #eee5eb}.import-history button{display:flex;align-items:center;gap:6px;padding:9px 12px;border:0;border-radius:9px;background:white;color:#6b1a2c;font-size:12px;font-weight:750;cursor:pointer}.import-history button:disabled{opacity:.35;cursor:default}.import-control{padding:12px;background:#faf7f9;border:1px solid #ece3e9;border-radius:12px;margin:0!important;min-width:0}.import-control>span{display:flex;gap:6px;align-items:center;font-size:11px;color:#866e7c}.import-control select{width:100%!important;min-height:42px;background:white!important;border:1px solid #e2d4dd!important;color:#4b283a!important;font-weight:750;font-size:14px!important;border-radius:10px!important}.import-edit-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0}.import-tool-tile{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:9px;min-height:82px;padding:12px 8px;border:1px solid #e3d3dc;border-radius:13px;background:linear-gradient(145deg,#fff,#fbf5f8);color:#6b1a2c;cursor:pointer;font-size:12px;font-weight:750;text-align:center;line-height:1.4}.import-tool-tile:hover{background:#f3e7ee;border-color:#b78c9e}.import-tool-tile[aria-pressed=true]{background:#6b1a2c;color:white;border-color:#6b1a2c}.import-owner-fields{display:grid;gap:10px}.import-owner-fields .link-player{min-height:52px;flex-direction:row}.import-selection-actions{display:flex;gap:8px;margin-top:14px}.import-selection-actions button{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;min-height:42px;border:0;border-radius:10px;font-size:12px;font-weight:750;cursor:pointer}.import-confirm{background:#6b1a2c;color:white}.import-delete{background:#fff0f0;color:#a13747}.import-review{color:#302631}.import-review .import-workspace{display:grid!important;grid-template-columns:minmax(0,1fr) 280px;gap:20px}.import-court{min-width:0;background:#f7f4f6;border-radius:16px;padding:10px}.import-court canvas{width:100%;height:auto;display:block}.import-review section,.import-tools{padding:16px;background:#fff;border:1px solid #e9e0e5;border-radius:14px}.import-tools summary,.import-details summary{font-size:13px;font-weight:700;color:#6b1a2c;cursor:pointer}.import-tools[open] summary{margin-bottom:14px}.import-details{padding:10px 14px;border-radius:10px;background:#f8f5f7}.import-action-list{display:grid;gap:7px}.import-action-list button{display:flex;align-items:center;gap:9px;background:#faf7f9;border:1px solid #eee5eb;border-radius:10px;text-align:left;padding:9px;color:#352b35;cursor:pointer}.import-action-list button[aria-pressed=true]{border-color:#6b1a2c;background:#f5eaf0}.import-action-list b{display:grid;place-items:center;background:#6b1a2c;color:white;border-radius:50%;width:24px;height:24px;font-size:12px}.import-action-list small{margin-left:auto;color:#6b1a2c;font-weight:800}.import-validation{position:sticky;bottom:-1px;background:#fff;z-index:3;padding:16px!important;box-shadow:0 -8px 25px #37202d08;align-items:center;flex-wrap:wrap;border-radius:12px}.import-validation button{min-height:42px}.import-validation button:disabled{opacity:.45;cursor:not-allowed}.import-review button:focus-visible,.import-review select:focus-visible{outline:3px solid #d4a24c;outline-offset:2px}@media(max-width:850px){.import-review{max-height:none}.import-review .import-workspace{grid-template-columns:1fr;overflow:visible}.import-inspector{overflow:visible}.import-court-viewport{height:48dvh;flex:auto}.import-review .import-workspace{flex:none}.import-review .import-court{padding:6px}.import-validation{bottom:0}}`}</style>
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
  tab: {padding:"10px 16px",border:"1px solid #e4dce1",background:"#fff",color:COLORS.bord,borderRadius:10,cursor:"pointer",fontWeight:700},
  tabActive: {padding:"10px 16px",border:"1px solid "+COLORS.bord,background:COLORS.bord,color:"#fff",borderRadius:10,cursor:"pointer",fontWeight:700},
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
