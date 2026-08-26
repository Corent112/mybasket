import type { AiExerciseDiagram, AiExerciseImport, AiPoint, PlaquetteSchemaData } from "./types";

const clamp = (value: unknown, min = 0.02, max = 0.98) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(max, Math.max(min, n));
};

const point = (p: AiPoint | undefined, half: boolean): AiPoint => ({
  x: clamp(p?.x),
  y: clamp(p?.y, 0.02, half ? 0.49 : 0.98),
});

function oneDiagramToPlaquette(result: AiExerciseImport, diagram: AiExerciseDiagram, diagramIndex = 0): PlaquetteSchemaData | null {
  if (!diagram?.detected) return null;

  const half = diagram.courtType !== "full";
  const groupId = crypto.randomUUID();
  const playerIds = new Map<string, string>();

  const players = (diagram.players || []).map((p, index) => {
    const id = crypto.randomUUID();
    playerIds.set(p.key, id);
    return {
      id, x: clamp(p.x), y: clamp(p.y, 0.02, half ? 0.49 : 0.98),
      label: String(p.label || index + 1), team: p.team === "def" ? "def" : "att",
      shape: "circle", rotation: 0, color: p.color,
      hasBall: Boolean(p.hasBall), ballCount: p.hasBall ? 1 : 0,
    };
  });
  const findPlayer = (key?: string) => key ? players.find((p) => p.id === playerIds.get(key)) : undefined;
  const objects = (diagram.objects || []).map((o) => ({
    id: crypto.randomUUID(), x: clamp(o.x), y: clamp(o.y, 0.02, half ? 0.49 : 0.98),
    kind: o.kind, text: o.text, rotation: 0, size: 1, color: "#0F0F12",
  }));
  const lines = (diagram.actions || []).map((a, index) => {
    const source = findPlayer(a.fromPlayer);
    const target = findPlayer(a.toPlayer);
    const from = source ? { x: source.x, y: source.y } : point(a.from, half);
    const to = target ? { x: target.x, y: target.y } : point(a.to, half);
    return {
      id: crypto.randomUUID(), action: a.action, from, to, rotation: 0,
      points: a.action === "freedraw" && a.points ? a.points.map((p) => point(p, half)) : undefined,
      sourcePlayerId: source?.id, targetPlayerId: target?.id,
      order: Number.isFinite(Number(a.order)) ? Number(a.order) : index + 1,
      startMode: index === 0 ? "withPrevious" : "afterPrevious", duration: 1.2,
      target: a.action === "shoot" ? "basket" : undefined,
    };
  });

  return {
    title: (result.title ? `${result.title}${(result.diagrams?.length || 0) > 1 ? ` — Schéma ${diagramIndex + 1}` : ""}` : `Schéma ${diagramIndex + 1}`),
    schemaGroupId: groupId, phaseIndex: 0, courtType: half ? "half" : "full",
    phases: [{ players, objects, lines, notes: diagram.notes || "", duration: 1.5, startMode: "afterPrevious" }],
    sheet: null, current: 0, imageData: "", phaseImages: [], editable: true,
  };
}

export function aiDiagramsToPlaquette(result: AiExerciseImport): PlaquetteSchemaData[] {
  const diagrams = result.diagrams?.length ? result.diagrams : [result.diagram];
  return diagrams.map((diagram, index) => oneDiagramToPlaquette(result, diagram, index)).filter(Boolean) as PlaquetteSchemaData[];
}

export function aiDiagramToPlaquette(result: AiExerciseImport): PlaquetteSchemaData | null {
  return aiDiagramsToPlaquette(result)[0] || null;
}

function drawArrow(ctx: CanvasRenderingContext2D, from: AiPoint, to: AiPoint, action: string) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  if (action === "pass") ctx.setLineDash([8, 7]);
  else if (action === "dribble") ctx.setLineDash([3, 5]);
  else ctx.setLineDash([]);
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const size = 11;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

export function renderPlaquettePreview(schema: PlaquetteSchemaData): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = schema.courtType === "half" ? 620 : 980;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#6B1A2C";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, 110, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2 - 90, 18);
  ctx.lineTo(W / 2 - 90, 190);
  ctx.lineTo(W / 2 + 90, 190);
  ctx.lineTo(W / 2 + 90, 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, 68, 28, 0, Math.PI * 2);
  ctx.stroke();
  if (schema.courtType === "full") {
    ctx.beginPath();
    ctx.moveTo(18, H / 2);
    ctx.lineTo(W - 18, H / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 70, 0, Math.PI * 2);
    ctx.stroke();
  }

  const phase = schema.phases[0];
  const sx = (x: number) => 18 + x * (W - 36);
  const sy = (y: number) => {
    const normalized = schema.courtType === "half" ? y / 0.5 : y;
    return 18 + normalized * (H - 36);
  };

  ctx.strokeStyle = "#0F0F12";
  ctx.fillStyle = "#0F0F12";
  ctx.lineWidth = 4;
  for (const line of phase.lines || []) {
    if (line.action === "freedraw" && Array.isArray(line.points) && line.points.length > 1) {
      ctx.beginPath();
      line.points.forEach((p: AiPoint, index: number) => {
        const x = sx(p.x), y = sy(p.y);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else {
      drawArrow(
        ctx,
        { x: sx(line.from.x), y: sy(line.from.y) },
        { x: sx(line.to.x), y: sy(line.to.y) },
        line.action
      );
    }
  }

  for (const obj of phase.objects || []) {
    const x = sx(obj.x);
    const y = sy(obj.y);
    if (obj.kind === "cone") {
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x - 10, y + 10);
      ctx.lineTo(x + 10, y + 10);
      ctx.closePath();
      ctx.fill();
    } else if (obj.kind === "text" && obj.text) {
      ctx.font = "bold 18px Arial";
      ctx.fillText(obj.text, x, y);
    }
  }

  for (const player of phase.players || []) {
    const x = sx(player.x);
    const y = sy(player.y);
    ctx.beginPath();
    if (player.team === "def") ctx.rect(x - 20, y - 20, 40, 40);
    else ctx.arc(x, y, 21, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = player.team === "def" ? "#D4A24C" : "#6B1A2C";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "#0F0F12";
    ctx.font = "bold 17px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(player.label), x, y);
    if (player.hasBall) {
      ctx.beginPath();
      ctx.arc(x + 28, y - 22, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#0F0F12";
      ctx.fill();
    }
  }

  return canvas.toDataURL("image/png", 0.9);
}
