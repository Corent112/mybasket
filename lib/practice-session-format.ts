export function cleanPracticeText(value: unknown): string {
  if (value === null || value === undefined) return "";

  const flatten = (input: unknown): string[] => {
    if (Array.isArray(input)) return input.flatMap(flatten);
    if (input === null || input === undefined) return [];
    if (typeof input === "object") {
      return Object.values(input as Record<string, unknown>).flatMap(flatten);
    }
    const text = String(input).trim();
    return text ? [text] : [];
  };

  if (Array.isArray(value) || typeof value === "object") {
    return flatten(value).join("\n");
  }

  const source = String(value).trim();
  if (!source) return "";

  try {
    return flatten(JSON.parse(source)).join("\n");
  } catch {
    return source
      .replace(/^\s*[\[({]+\s*/, "")
      .replace(/\s*[\])}]+\s*$/, "")
      .replace(/^[\"']+|[\"']+$/g, "")
      .replace(/\\[nr]/g, "\n")
      .replace(/\\\"/g, '"')
      .replace(/\s*[\"']?\s*,\s*[\"']?\s*/g, "\n")
      .trim();
  }
}

export function practiceTextLines(value: unknown): string[] {
  return cleanPracticeText(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parsePracticeDuration(value: unknown, fallback = 10): number {
  const normalizeCompactTime = (input: number): number => {
    const rounded = Math.max(0, Math.round(input));
    const compact = String(rounded);

    // Certains anciens exercices ont enregistré 8'15" sous la forme 815
    // ou 10'15" sous la forme 1015. Une durée d'atelier supérieure à
    // 180 minutes étant incohérente, on récupère la partie "minutes".
    if (rounded > 180 && compact.length >= 3 && compact.length <= 4) {
      const seconds = Number(compact.slice(-2));
      const minutes = Number(compact.slice(0, -2));
      if (minutes >= 1 && minutes <= 180 && seconds >= 0 && seconds <= 59) {
        return minutes;
      }
    }

    return Math.max(1, rounded);
  };

  if (typeof value === "number" && Number.isFinite(value)) {
    return normalizeCompactTime(value);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  const hourMatch = raw.match(/^(\d+)\s*h(?:\s*(\d+))?/i);
  if (hourMatch) {
    return Math.max(1, Number(hourMatch[1]) * 60 + Number(hourMatch[2] || 0));
  }

  const minuteMatch = raw.match(/(\d+)\s*(?:min|mn|'|’)/i);
  if (minuteMatch) return Math.max(1, Number(minuteMatch[1]));

  const firstNumber = raw.match(/\d+/)?.[0];
  return firstNumber ? normalizeCompactTime(Number(firstNumber)) : fallback;
}

export function shortCoachCode(value: unknown): string {
  const raw = String(value ?? "").trim();
  const upper = raw.toUpperCase();
  if (["CP", "AC1", "AC2", "PP", "RV"].includes(upper)) return upper;

  const normalized = raw.toLowerCase();
  if (normalized.includes("assistant coach 1")) return "AC1";
  if (normalized.includes("assistant coach 2")) return "AC2";
  if (normalized.includes("préparateur") || normalized.includes("preparateur")) return "PP";
  if (normalized.includes("vidéo") || normalized.includes("video")) return "RV";
  return "CP";
}
