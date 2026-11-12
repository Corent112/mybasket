import type { SystemItem } from "@/lib/systems";

type DrawingPhase = {
  players?: unknown[];
  objects?: unknown[];
  lines?: unknown[];
  notes?: string;
  duration?: number;
};

type DrawingSchema = {
  title?: string;
  phases?: DrawingPhase[];
  current?: number;
  imageData?: string;
  phaseImages?: string[];
  [field: string]: unknown;
};

function readSchema(raw: unknown): DrawingSchema | null {
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as DrawingSchema : null;
}

export function resolveSystemDrawingPreview(
  system: Pick<SystemItem, "schemaData" | "schemaDataList" | "schemaImage" | "schemaImages" | "images">,
  index = 0,
) {
  const list = system.schemaDataList ?? [];
  const entries = [list[index], ...list, system.schemaData].map(readSchema);
  const schema = entries.find((entry) =>
    Array.isArray(entry?.phases) && entry.phases.some((phase) =>
      [phase?.players, phase?.objects, phase?.lines].some((items) => Array.isArray(items) && items.length > 0)
    )
  );
  const image = [
    system.schemaImages?.[index], system.schemaImage, ...(system.schemaImages ?? []),
    ...entries.flatMap((entry) => [entry?.imageData, ...(Array.isArray(entry?.phaseImages) ? entry.phaseImages : [])]),
    ...(system.images ?? []),
  ].find((value) => typeof value === "string" && value.trim());

  if (!schema || !Array.isArray(schema.phases)) return { schema: null, image };

  const phases = schema.phases.filter((phase) => phase && typeof phase === "object").map((phase) => ({
    ...phase,
    players: Array.isArray(phase.players) ? phase.players : [],
    objects: Array.isArray(phase.objects) ? phase.objects : [],
    lines: Array.isArray(phase.lines) ? phase.lines : [],
    notes: typeof phase.notes === "string" ? phase.notes : "",
    duration: Number.isFinite(phase.duration) ? phase.duration : 1.5,
  }));
  return { schema: { ...schema, phases }, image };
}
