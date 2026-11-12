export function safeSliderUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || /[\\\u0000-\u001f\u007f]/.test(url)) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const absolute = new URL(url);
    return absolute.protocol === "https:" && !absolute.username && !absolute.password ? absolute.href : null;
  } catch {
    return null;
  }
}
