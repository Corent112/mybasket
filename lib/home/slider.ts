export type SliderRow = {
  id: string; title: string | null; subtitle: string | null; image_url: string | null;
  button_label: string | null; button_href: string | null;
  sort_order: number | null; status?: string | null; placement?: string | null;
};
export type SlideDesign = {
  version: 1; layout: 'overlay' | 'split' | 'image'; background: string; color: string;
  accent: string; overlay: number; textX: number; textY: number; textWidth: number;
  titleSize: number; align: 'left' | 'center' | 'right'; imageX: number; imageY: number;
  imageFit: 'cover' | 'contain'; zoom: number;
};
export const DEFAULT_DESIGN: SlideDesign = {
  version: 1, layout: 'overlay', background: '#350d1b', color: '#ffffff', accent: '#d4a24c',
  overlay: 55, textX: 12, textY: 50, textWidth: 65, titleSize: 5, align: 'left',
  imageX: 50, imageY: 50, imageFit: 'cover', zoom: 1,
};
export const DEFAULT_SLIDES: SliderRow[] = [
  { id: 'c6496902-ec1a-4c7e-8eba-f048a6400001', title: 'LA RÉFÉRENCE DES COACHS', subtitle: "Exercices, systèmes et séances prêts à l'emploi.", image_url: null, button_label: null, button_href: null, sort_order: 0, status: 'active', placement: 'home' },
  { id: 'c6496902-ec1a-4c7e-8eba-f048a6400002', title: 'CRÉE TES SYSTÈMES', subtitle: 'Un éditeur de schémas pensé pour le terrain.', image_url: null, button_label: null, button_href: null, sort_order: 1, status: 'active', placement: 'home' },
  { id: 'c6496902-ec1a-4c7e-8eba-f048a6400003', title: 'PARTAGE TON DESSIN', subtitle: 'Conçois et diffuse tes dessins en quelques clics.', image_url: null, button_label: null, button_href: null, sort_order: 2, status: 'active', placement: 'home' },
];
const MARKER = '#mybasket-slide=';
const bounded = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const color = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
export function normalizeDesign(value: unknown): SlideDesign {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<SlideDesign>;
  const d = DEFAULT_DESIGN;
  return {
    version: 1, layout: v.layout === 'split' || v.layout === 'image' ? v.layout : 'overlay',
    background: color(v.background, d.background), color: color(v.color, d.color), accent: color(v.accent, d.accent),
    overlay: bounded(v.overlay, d.overlay, 0, 90), textX: bounded(v.textX, d.textX, 0, 100), textY: bounded(v.textY, d.textY, 0, 100),
    textWidth: bounded(v.textWidth, d.textWidth, 30, 90), titleSize: bounded(v.titleSize, d.titleSize, 2, 8),
    align: v.align === 'center' || v.align === 'right' ? v.align : 'left',
    imageX: bounded(v.imageX, 50, 0, 100), imageY: bounded(v.imageY, 50, 0, 100),
    imageFit: v.imageFit === 'contain' ? 'contain' : 'cover', zoom: bounded(v.zoom, 1, 1, 2),
  };
}
export function safeSlideUrl(value: unknown, allowAnchor = false): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!input || input.length > 3000 || /[\u0000-\u0020\\]/.test(input)) return null;
  if (input.startsWith('/') && !input.startsWith('//')) return input;
  if (allowAnchor && input.startsWith('#')) return input;
  try { const url = new URL(input); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? input : null; }
  catch { return null; }
}
export function decodeSlideImage(value: string | null) {
  const offset = value?.indexOf(MARKER) ?? -1;
  if (offset < 0) return { source: safeSlideUrl(value), design: { ...DEFAULT_DESIGN, textX: 50, align: 'center' as const }, designed: false };
  let design: unknown = {};
  try { design = JSON.parse(decodeURIComponent(value!.slice(offset + MARKER.length, offset + MARKER.length + 4000))); } catch { /* Invalid settings use the safe defaults. */ }
  return { source: safeSlideUrl(value!.slice(0, offset)), design: normalizeDesign(design), designed: true };
}
// Settings live in the image fragment: the actual storage URL stays unchanged, and no DB migration is needed.
export function encodeSlideImage(source: string | null, design: SlideDesign) {
  const clean = safeSlideUrl(source)?.split('#')[0] || '';
  return `${clean}${MARKER}${encodeURIComponent(JSON.stringify(normalizeDesign(design)))}`;
}
export function orderSlides(slides: SliderRow[]) {
  return [...slides].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id.localeCompare(b.id));
}
export type SaveSlideState = { ok: boolean; message: string; id?: string; image?: string | null };
// Kept outside the visible list so deleting every slide never restores defaults.
export const SLIDER_SETTINGS_ID = 'c6496902-ec1a-4c7e-8eba-f048a6400000';
