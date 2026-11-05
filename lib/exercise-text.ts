/** Unwrap legacy lists that were serialized again during exercise edits. */
export function exerciseText(value: unknown, depth = 0): string {
  if (depth >= 20) return typeof value === "string" ? value : "";
  if (Array.isArray(value)) {
    return value.map(entry => exerciseText(entry, depth + 1)).filter(line => line.trim()).join("\n");
  }
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (candidate.startsWith("[") && candidate.endsWith("]")) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.every(entry => entry == null || typeof entry === "string" || Array.isArray(entry))) {
        return exerciseText(parsed, depth + 1);
      }
    } catch {
      // Ordinary text can also start with a bracket.
    }
  }
  if (candidate.startsWith('"') && candidate.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (typeof parsed === "string" && parsed.trim().startsWith("[")) {
        const decoded = exerciseText(parsed, depth + 1);
        if (decoded !== parsed) return decoded;
      }
    } catch {
      // Keep deliberately typed punctuation.
    }
  }
  return value;
}
