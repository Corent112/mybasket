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
  | { kind: "action"; index: number; end: "from" | "to" }
  | null;

type Props = {
  /** Résultat brut de `scanExerciseLocally`. */
  result: AiExerciseImport;
  /** Appelé avec le résultat CORRIGÉ quand l'utilisateur valide. */
  onValidate: (corrected: AiExerciseImport) => void;
  onCancel?: () => void;
  /** Index du schéma affiché au départ, si l'import en contient plusieurs. */
  initialDiagram?: number;
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
  return diagramsOf(result).reduce((total, diagram) => total + reviewItemsOfDiagram(diagram).length, 0);
}

/* -------------------------------------------------------------------------- */
/* Composant                                                                  */
/* -------------------------------------------------------------------------- */

export default function ImportReview({
  result,
  onValidate,
  onCancel,
  initialDiagram = 0,
  cancelLabel = "Annuler",
  validateLabel = "Valider l'import",
}: Props) {
  const initial = useMemo<AiExerciseDiagram[]>(() => {
    const source = diagramsOf(result);
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
  const [overlay, setOverlay] = useState(result.rectifiedImage ? 0.35 : 0);
  const [addMode, setAddMode] = useState<AiDetectionType | null>(null);
  const [dragging, setDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayImage = useRef<HTMLImageElement | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);

  const diagram = diagrams[current];
  const courtType: "half" | "full" = diagram?.courtType ?? "half";
  const size = courtType === "full" ? { w: 560, h: 880 } : { w: 720, h: 564 };

  useEffect(() => {
    if (!result.rectifiedImage) return;
    const image = new Image();
    image.onload = () => {
      overlayImage.current = image;
      setOverlayReady(true);
    };
    image.src = result.rectifiedImage;
  }, [result.rectifiedImage]);

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

    // Calque : la photo redressée, sous le dessin, pour comparer d'un coup d'œil.
    if (overlay > 0 && overlayReady && overlayImage.current) {
      ctx.save();
      ctx.globalAlpha = overlay;
      ctx.drawImage(overlayImage.current, 0, 0, width, height);
      ctx.restore();
    }

    // Terrain
    const rect = playRect(courtType);
    const px0 = rect.x0 * width;
    const py0 = (courtType === "full" ? rect.y0 : rect.y0) * height;
    const pw = (rect.x1 - rect.x0) * width;
    const ph = (rect.y1 - rect.y0) * height;
    ctx.save();
    ctx.globalAlpha = overlay > 0 ? 0.55 : 1;
    ctx.translate(px0, py0);
    ctx.strokeStyle = COLORS.bord;
    strokeCourtLines(ctx, pw, ph, courtType, Math.max(1.5, pw * 0.004));
    ctx.restore();

    const toPixel = (point: AiPoint) => canonicalToPixel(point, width, height, courtType);

    // Trajectoires
    diagram.actions.forEach((action, index) => {
      const from = toPixel(action.from ?? action.to);
      const to = toPixel(action.to);
      const doubt = needsReview(action.confidence);
      const isSelected = selection?.kind === "action" && selection.index === index;
      ctx.save();
      ctx.strokeStyle = isSelected ? COLORS.selected : doubt ? COLORS.doubt : COLORS.ink;
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
      // pointe
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - 13 * Math.cos(angle - 0.4), to.y - 13 * Math.sin(angle - 0.4));
      ctx.lineTo(to.x - 13 * Math.cos(angle + 0.4), to.y - 13 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = isSelected ? COLORS.selected : doubt ? COLORS.doubt : COLORS.ink;
      ctx.fill();
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
        ctx.fillStyle = doubt ? COLORS.doubt : COLORS.ink;
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
      ctx.fillText(type === "unknown" ? "?" : String(player.label ?? ""), 0, 1);
      ctx.restore();
    });
  }, [diagram, courtType, overlay, overlayReady, selection]);

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

    for (let i = diagram.players.length - 1; i >= 0; i -= 1) {
      const p = toPixel(diagram.players[i]);
      if (Math.hypot(p.x - x, p.y - y) <= 20) return { kind: "player", index: i };
    }
    for (let i = diagram.objects.length - 1; i >= 0; i -= 1) {
      const p = toPixel(diagram.objects[i]);
      if (Math.hypot(p.x - x, p.y - y) <= 16) return { kind: "object", index: i };
    }
    for (let i = diagram.actions.length - 1; i >= 0; i -= 1) {
      const action = diagram.actions[i];
      const to = toPixel(action.to);
      if (Math.hypot(to.x - x, to.y - y) <= 12) return { kind: "action", index: i, end: "to" };
      const from = toPixel(action.from ?? action.to);
      if (Math.hypot(from.x - x, from.y - y) <= 12) return { kind: "action", index: i, end: "from" };
    }
    return null;
  };

  const updateDiagram = (change: (current: AiExerciseDiagram) => AiExerciseDiagram) => {
    setDiagrams((previous) => previous.map((item, index) => (index === current ? change(item) : item)));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!diagram) return;
    const { x, y } = pointerPosition(event);
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (addMode) {
      const point = pixelToCanonical(x, y, canvas.width, canvas.height, courtType);
      const label = String(
        diagram.players.filter((player) => (player.type ?? "attacker") !== "defender").length + 1
      );
      const added: AiDiagramPlayer = {
        key: `manual-${Date.now()}`,
        label: addMode === "defender" ? `X${label}` : label,
        team: addMode === "defender" ? "def" : "att",
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
    if (!dragging || !selection || !diagram) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = pointerPosition(event);
    const point = pixelToCanonical(x, y, canvas.width, canvas.height, courtType);

    updateDiagram((item) => {
      if (selection.kind === "player") {
        const players = item.players.map((player, index) =>
          index === selection.index
            ? { ...player, x: point.x, y: point.y, source: `${player.source ?? ""} · déplacé`.trim() }
            : player
        );
        return { ...item, players };
      }
      if (selection.kind === "object") {
        const objects = item.objects.map((object, index) =>
          index === selection.index ? { ...object, x: point.x, y: point.y } : object
        );
        return { ...item, objects };
      }
      const actions = item.actions.map((action, index) => {
        if (index !== selection.index) return action;
        return selection.end === "to"
          ? { ...action, to: point, points: undefined, confidence: 1, source: "corrigé à la main" }
          : { ...action, from: point, points: undefined, confidence: 1, source: "corrigé à la main" };
      });
      return { ...item, actions };
    });
  };

  const handlePointerUp = () => setDragging(false);

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

  const doubtful = useMemo(() => reviewItemsOfDiagram(diagram), [diagram]);

  const validate = () => {
    const kept = diagrams.filter(
      (item) => item.players.length > 0 || item.actions.length > 0 || item.objects.length > 0
    );
    onValidate({
      ...result,
      diagram: kept[0] ?? result.diagram,
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

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Vérifie le schéma importé</h2>
          <p style={styles.subtitle}>
            {diagram.rectified
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
            onPointerCancel={handlePointerUp}
          />
          {result.rectifiedImage ? (
            <label style={styles.slider}>
              Calque photo redressée
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
                onClick={() => setAddMode(addMode === "attacker" ? null : "attacker")}
              >
                + Attaquant
              </button>
              <button
                type="button"
                style={addMode === "defender" ? styles.buttonPrimary : styles.button}
                onClick={() => setAddMode(addMode === "defender" ? null : "defender")}
              >
                + Défenseur
              </button>
            </div>
            {addMode ? <p style={styles.hint}>Clique sur le terrain pour le placer.</p> : null}
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
                  </>
                ) : (
                  <p style={styles.hint}>
                    {selection.kind === "object" ? "Objet" : "Trajectoire"} — glisse pour déplacer.
                  </p>
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
        {onCancel ? (
          <button type="button" style={styles.buttonGhost} onClick={onCancel}>
            {cancelLabel}
          </button>
        ) : null}
        <button type="button" style={styles.buttonPrimary} onClick={validate}>
          {doubtful.length
            ? `Valider malgré ${doubtful.length} élément${doubtful.length > 1 ? "s" : ""} à confirmer`
            : validateLabel}
        </button>
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
