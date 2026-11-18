'use server';

import { revalidatePath } from 'next/cache';
import sharp from 'sharp';
import { requireAdmin } from '@/lib/admin/guard';
import { DEFAULT_SLIDES, SLIDER_SETTINGS_ID, encodeSlideImage, normalizeDesign, safeSlideUrl, type SaveSlideState } from '@/lib/home/slider';

async function ensureInitialized(supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase']) {
  const marker = await supabase.from('admin_slider').select('id').eq('id', SLIDER_SETTINGS_ID).maybeSingle();
  if (marker.error) throw new Error('Impossible de lire la configuration du slider.');
  if (marker.data) return;
  const existing = await supabase.from('admin_slider').select('id').in('placement', ['home', 'global']).neq('id', SLIDER_SETTINGS_ID).limit(1);
  if (existing.error) throw new Error('Impossible de lire les slides.');
  if (!existing.data?.length) {
    const seeded = await supabase.from('admin_slider').upsert(DEFAULT_SLIDES, { onConflict: 'id', ignoreDuplicates: true });
    if (seeded.error) throw new Error('Impossible d’enregistrer les slides par défaut.');
  }
  const initialized = await supabase.from('admin_slider').upsert({ id: SLIDER_SETTINGS_ID, title: 'Configuration du slider', placement: 'global', status: 'inactive', sort_order: 0 }, { onConflict: 'id', ignoreDuplicates: true });
  if (initialized.error) throw new Error('Impossible de finaliser la configuration du slider.');
}

export async function initializeDefaultSlides(): Promise<SaveSlideState> {
  const { supabase } = await requireAdmin();
  try { await ensureInitialized(supabase); revalidatePath('/admin/slider'); revalidatePath('/'); return { ok: true, message: 'Slides prêtes.' }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Initialisation impossible.' }; }
}

export async function saveSlide(_previous: SaveSlideState, form: FormData): Promise<SaveSlideState> {
  const { supabase } = await requireAdmin();
  let uploadedPath: string | null = null;
  try {
    const title = String(form.get('title') || '').trim().slice(0, 180);
    if (!title) throw new Error('Donne un titre à cette slide.');
    const mode = String(form.get('mode'));
    if (!['add', 'replace'].includes(mode)) throw new Error('Choisis Ajouter ou Remplacer.');
    const targetId = String(form.get('target_id') || '');
    if (targetId === SLIDER_SETTINGS_ID) throw new Error('Cette entrée ne peut pas être modifiée.');
    if (mode === 'replace' && !targetId) throw new Error('Choisis la slide à remplacer.');
    let source = safeSlideUrl(form.get('source_image'));
    if (String(form.get('source_image') || '').trim() && !source) throw new Error('L’adresse de l’image est invalide. Utilise une URL https ou importe ton image.');
    const hrefText = String(form.get('button_href') || '').trim();
    const href = safeSlideUrl(hrefText, true);
    if (hrefText && !href) throw new Error('Le lien du bouton est invalide.');
    const rawDesign = String(form.get('design') || '{}');
    if (rawDesign.length > 4000) throw new Error('Réglages de slide invalides.');
    let design;
    try { design = normalizeDesign(JSON.parse(rawDesign)); } catch { throw new Error('Réglages de slide invalides.'); }
    const order = Number(form.get('sort_order'));
    if (!Number.isInteger(order) || Math.abs(order) > 9999) throw new Error('L’ordre doit être un nombre entier entre −9999 et 9999.');
    const file = form.get('image_file');
    if (file instanceof File && file.size > 0) {
      if (file.size > 900_000 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Image trop lourde ou format non pris en charge. Choisis une image JPG, PNG ou WebP.');
      const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 });
      const bytes = await image.rotate().resize({ width: 2400, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
      uploadedPath = `home/${crypto.randomUUID()}.webp`;
      const upload = await supabase.storage.from('slider-images').upload(uploadedPath, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
      if (upload.error) throw new Error('L’image n’a pas pu être envoyée. Réessaie avant de quitter l’éditeur.');
      source = supabase.storage.from('slider-images').getPublicUrl(uploadedPath).data.publicUrl;
    }
    if (design.layout === 'image' && !source) throw new Error('Ajoute une image pour utiliser le mode Image seule.');
    await ensureInitialized(supabase);
    if (mode === 'replace') {
      const { data, error } = await supabase.from('admin_slider').select('id').eq('id', targetId).in('placement', ['home', 'global']).maybeSingle();
      if (error || !data) throw new Error('Cette slide n’existe plus. Recharge la liste avant de la remplacer.');
    }
    const payload = {
      title, subtitle: String(form.get('subtitle') || '').trim().slice(0, 1200) || null,
      image_url: encodeSlideImage(source, design), button_label: String(form.get('button_label') || '').trim().slice(0, 100) || null,
      button_href: href, status: form.get('published') === 'on' ? 'active' : 'inactive',
      placement: 'home', sort_order: order, updated_at: new Date().toISOString(),
    };
    const mutation = mode === 'replace'
      ? supabase.from('admin_slider').update(payload).eq('id', targetId).in('placement', ['home', 'global'])
      : supabase.from('admin_slider').insert(payload);
    const { data, error } = await mutation.select('id').single();
    if (error || !data) throw new Error('L’enregistrement n’a pas abouti. Tes réglages restent dans l’éditeur.');
    revalidatePath('/admin/slider'); revalidatePath('/');
    return { ok: true, id: data.id, image: source, message: payload.status === 'active' ? 'Slide enregistrée et publiée sur l’accueil.' : 'Brouillon enregistré. Il n’est pas affiché sur l’accueil.' };
  } catch (error) {
    if (uploadedPath) { try { await supabase.storage.from('slider-images').remove([uploadedPath]); } catch { /* Preserve the original save error. */ } }
    return { ok: false, message: error instanceof Error ? error.message : 'Enregistrement impossible. Réessaie.' };
  }
}

export async function setSlidePublication(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(form.get('id') || '');
  if (!id || id === SLIDER_SETTINGS_ID) return;
  const { error } = await supabase.from('admin_slider').update({ status: form.get('published') === 'on' ? 'active' : 'inactive', updated_at: new Date().toISOString() }).eq('id', id).in('placement', ['home', 'global']);
  if (error) throw new Error('Impossible de changer la publication.');
  revalidatePath('/admin/slider'); revalidatePath('/');
}

export async function deleteSlide(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(form.get('id') || '');
  if (!id || id === SLIDER_SETTINGS_ID) return;
  const { error } = await supabase.from('admin_slider').delete().eq('id', id).in('placement', ['home', 'global']);
  if (error) throw new Error('Suppression impossible. Recharge la liste et réessaie.');
  revalidatePath('/admin/slider'); revalidatePath('/');
}
