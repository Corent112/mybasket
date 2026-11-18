'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import HomeSlideVisual from '@/components/home/HomeSlideVisual';
import { DEFAULT_DESIGN, decodeSlideImage, encodeSlideImage, type SlideDesign, type SliderRow, type SaveSlideState } from '@/lib/home/slider';
import { saveSlide, setSlidePublication, deleteSlide } from './actions';
import styles from './page.module.css';

type Draft = { title: string; subtitle: string; button_label: string; button_href: string; image: string; design: SlideDesign; published: boolean; order: number };
function fromSlide(slide?: SliderRow, order = 0): Draft {
  const image = decodeSlideImage(slide?.image_url || null);
  return { title: slide?.title || 'Le basket, au cœur de ton projet', subtitle: slide?.subtitle || '', button_label: slide?.button_label || '', button_href: slide?.button_href || '', image: image.source || '', design: slide ? image.design : { ...DEFAULT_DESIGN }, published: slide ? slide.status === 'active' : false, order: slide?.sort_order ?? order };
}
async function prepareImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 25 * 1024 * 1024) throw new Error('Choisis une image JPG, PNG ou WebP de moins de 25 Mo.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 2200 / image.naturalWidth, 1600 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Préparation de l’image indisponible.');
    for (let attempt = 0; attempt < 8; attempt++) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', Math.max(.45, .88 - attempt * .06)));
      if (blob && blob.size <= 800_000) return new File([blob], 'slide.webp', { type: 'image/webp' });
      canvas.width = Math.max(1, Math.round(canvas.width * .8));
      canvas.height = Math.max(1, Math.round(canvas.height * .8));
    }
    throw new Error('Cette image reste trop lourde. Choisis une image moins grande.');
  } finally { URL.revokeObjectURL(objectUrl); }
}

export default function SliderStudio({ slides, initialId }: { slides: SliderRow[]; initialId?: string }) {
  const initialSlide = slides.find(s => s.id === initialId);
  const nextOrder = Math.max(...slides.map(s => s.sort_order || 0), -1) + 1;
  const [draft, setDraft] = useState<Draft>(() => fromSlide(initialSlide, nextOrder));
  const [mode, setMode] = useState<'add' | 'replace'>(initialSlide ? 'replace' : 'add');
  const [targetId, setTargetId] = useState(initialSlide?.id || '');
  const [file, setFile] = useState<File | null>(null);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [imageError, setImageError] = useState('');
  const [mobile, setMobile] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [state, formAction, pending] = useActionState<SaveSlideState, FormData>(async (previous, data) => {
    if (file) data.set('image_file', file);
    const result = await saveSlide(previous, data);
    setShowFeedback(true);
    if (result.ok && result.id) {
      setMode('replace'); setTargetId(result.id); setDirty(false);
      setDraft(current => ({ ...current, image: result.image || '' }));
      setFile(null); setFilePreview(null);
      setImageInputKey(key => key + 1);
      try { localStorage.setItem('mybasket:slider-updated', String(Date.now())); } catch { /* Saving remains available if local storage is disabled. */ }
    }
    return result;
  }, { ok: false, message: '' });
  const editorRef = useRef<HTMLElement>(null);
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview); }, [filePreview]);
  const change = (patch: Partial<Draft>) => { setDraft(d => ({ ...d, ...patch })); setDirty(true); setShowFeedback(false); };
  const design = (patch: Partial<SlideDesign>) => { setDraft(d => ({ ...d, design: { ...d.design, ...patch } })); setDirty(true); setShowFeedback(false); };
  const load = (slide?: SliderRow, copy = false) => {
    if (dirty && !window.confirm('Changer de slide et abandonner les modifications non enregistrées ?')) return;
    const next = fromSlide(slide, nextOrder);
    if (copy) { next.order = nextOrder; next.published = false; next.title += ' — copie'; }
    setDraft(next); setMode(slide && !copy ? 'replace' : 'add'); setTargetId(slide && !copy ? slide.id : '');
    setFile(null); setFilePreview(null); setImageError(''); setDirty(false); setShowFeedback(false);
    setImageInputKey(key => key + 1);
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const preview: SliderRow = { id: 'preview', title: draft.title, subtitle: draft.subtitle, image_url: encodeSlideImage(draft.image, draft.design), button_label: draft.button_label, button_href: draft.button_href, sort_order: draft.order };
  const published = slides.filter(s => s.status === 'active').length;
  return <>
    <div className={styles.toolbar}><div><b>{slides.length} slides</b><span>{published} publiées · {slides.length - published} brouillons</span></div><button type="button" onClick={() => load()} disabled={pending || preparing}>+ Nouvelle slide</button></div>
    <section className={styles.studio} ref={editorRef}>
      <div className={styles.previewColumn}>
        <div className={styles.previewHeader}><div><span className={styles.kicker}>APERÇU EN DIRECT</span><h2>Ce que verront tes visiteurs</h2></div><div className={styles.deviceToggle}><button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>Ordinateur</button><button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>Téléphone</button></div></div>
        <div className={`${styles.previewSurface} ${mobile ? styles.mobileSurface : ''}`}><HomeSlideVisual slide={preview} preview sourceOverride={file ? filePreview : draft.image || null} /></div>
        <p className={styles.help}>Le même rendu est utilisé sur l’accueil. Le format s’adapte à l’écran ; « Image entière » conserve tout ton visuel.</p>
        <div className={styles.templateGrid}>
          {([{ layout: 'overlay', label: 'Image + texte', hint: 'Un titre sur ton image' }, { layout: 'split', label: 'Éditorial', hint: 'Texte à gauche, visuel à droite' }, { layout: 'image', label: 'Image seule', hint: 'Ton visuel déjà prêt' }] as const).map(item => <button key={item.layout} disabled={pending || preparing} type="button" aria-pressed={draft.design.layout === item.layout} onClick={() => design({ layout: item.layout, ...(item.layout === 'split' ? { textWidth: 50, textX: 5, align: 'left' } : {}) })}><strong>{item.label}</strong><span>{item.hint}</span></button>)}
        </div>
      </div>
      <form className={styles.editor} action={formAction}>
        <input type="hidden" name="design" value={JSON.stringify(draft.design)} />
        <input type="hidden" name="source_image" value={draft.image} />
        <fieldset disabled={pending || preparing}>
          <legend>1. Ton contenu</legend>
          <label>Nom / titre de la slide<input name="title" maxLength={180} value={draft.title} onChange={e => change({ title: e.target.value })} required /></label>
          <label className={styles.upload}>Ton image<input key={imageInputKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => {
            const selected = e.target.files?.[0]; if (!selected) return;
            setPreparing(true); setImageError('');
            try { const ready = await prepareImage(selected); setFile(ready); setFilePreview(URL.createObjectURL(ready)); setDirty(true); setShowFeedback(false); }
            catch (error) { setImageError(error instanceof Error ? error.message : 'Image illisible.'); }
            finally { setPreparing(false); }
          }} /><small>{preparing ? 'Préparation de ton image…' : file ? 'Image prête à enregistrer.' : 'JPG, PNG ou WebP · optimisée automatiquement.'}</small></label>
          <details><summary>Utiliser une adresse d’image</summary><label>URL de l’image<input type="text" inputMode="url" value={draft.image} placeholder="https://…" onChange={e => { change({ image: e.target.value }); setFile(null); setFilePreview(null); }} /></label></details>
          {(file || draft.image) && <button className={styles.secondaryButton} type="button" onClick={() => { setFile(null); setFilePreview(null); change({ image: '' }); setImageInputKey(key => key + 1); }}>Retirer l’image</button>}
          {imageError && <p role="alert" className={styles.alert}>{imageError}</p>}
          {draft.design.layout !== 'image' && <label>Sous-titre<textarea name="subtitle" rows={3} maxLength={1200} value={draft.subtitle} onChange={e => change({ subtitle: e.target.value })} placeholder="Le message que tu veux partager…" /></label>}
          {draft.design.layout === 'image' && <input type="hidden" name="subtitle" value={draft.subtitle} />}
          <div className={styles.twoColumns}><label>{draft.design.layout === 'image' ? 'Libellé du lien (accessibilité)' : 'Texte du bouton'}<input name="button_label" value={draft.button_label} maxLength={100} onChange={e => change({ button_label: e.target.value })} placeholder="Découvrir" /></label><label>{draft.design.layout === 'image' ? 'Lien au clic sur l’image' : 'Lien du bouton'}<input name="button_href" value={draft.button_href} onChange={e => change({ button_href: e.target.value })} placeholder="/abonnements ou https://…" /></label></div>
        </fieldset>
        <fieldset disabled={pending || preparing}>
          <legend>2. La mise en page</legend>
          <div className={styles.colors}><label>Fond<input aria-label="Couleur de fond" type="color" value={draft.design.background} onChange={e => design({ background: e.target.value })} /></label>{draft.design.layout !== 'image' && <><label>Texte<input aria-label="Couleur du texte" type="color" value={draft.design.color} onChange={e => design({ color: e.target.value })} /></label><label>Bouton<input aria-label="Couleur du bouton" type="color" value={draft.design.accent} onChange={e => design({ accent: e.target.value })} /></label></>}</div>
          {draft.design.layout !== 'image' && <>
            <label>Alignement<select value={draft.design.align} onChange={e => design({ align: e.target.value as SlideDesign['align'] })}><option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option></select></label>
            <label>Taille du titre<input aria-label="Taille du titre" type="range" min={2} max={8} step={.1} value={draft.design.titleSize} onChange={e => design({ titleSize: Number(e.target.value) })} /></label>
            <div className={styles.twoColumns}><label>Position horizontale du texte<input aria-label="Position horizontale du texte" type="range" min={0} max={100} value={draft.design.textX} onChange={e => design({ textX: Number(e.target.value) })} /></label><label>Position verticale du texte<input aria-label="Position verticale du texte" type="range" min={0} max={100} value={draft.design.textY} onChange={e => design({ textY: Number(e.target.value) })} /></label></div>
            <label>Largeur du bloc texte<input aria-label="Largeur du bloc texte" type="range" min={30} max={90} value={draft.design.textWidth} onChange={e => design({ textWidth: Number(e.target.value) })} /></label>
            {draft.design.layout === 'overlay' && <label>Voile pour la lisibilité · {draft.design.overlay}%<input aria-label="Intensité du voile" type="range" min={0} max={90} value={draft.design.overlay} onChange={e => design({ overlay: Number(e.target.value) })} /></label>}
          </>}
          <details><summary>Cadrage de l’image</summary><label>Affichage<select value={draft.design.imageFit} onChange={e => design({ imageFit: e.target.value as 'cover' | 'contain' })}><option value="cover">Remplir le cadre</option><option value="contain">Image entière</option></select></label><label>Zoom · {Math.round(draft.design.zoom * 100)}%<input type="range" min={1} max={2} step={.05} value={draft.design.zoom} onChange={e => design({ zoom: Number(e.target.value) })} /></label><div className={styles.twoColumns}><label>Cadrage horizontal<input type="range" min={0} max={100} value={draft.design.imageX} onChange={e => design({ imageX: Number(e.target.value) })} /></label><label>Cadrage vertical<input type="range" min={0} max={100} value={draft.design.imageY} onChange={e => design({ imageY: Number(e.target.value) })} /></label></div></details>
        </fieldset>
        <fieldset disabled={pending || preparing}>
          <legend>3. Où la publier ?</legend>
          <div className={styles.modeChoices}><label><input type="radio" name="mode" value="add" checked={mode === 'add'} onChange={() => { setMode('add'); setDirty(true); setShowFeedback(false); }} /> Ajouter une slide</label><label><input type="radio" name="mode" value="replace" checked={mode === 'replace'} onChange={() => { setMode('replace'); setDirty(true); setShowFeedback(false); }} /> Remplacer une slide</label></div>
          {mode === 'replace' && <label>Slide à remplacer<select name="target_id" required value={targetId} onChange={e => { setTargetId(e.target.value); setDirty(true); setShowFeedback(false); }}><option value="">Choisir une slide…</option>{slides.map(s => <option key={s.id} value={s.id}>{s.title}{s.status !== 'active' ? ' (brouillon)' : ''}</option>)}</select></label>}
          <div className={styles.twoColumns}><label>Ordre d’affichage<input type="number" name="sort_order" min={-9999} max={9999} step={1} required value={draft.order} onChange={e => change({ order: Number(e.target.value) })} /></label><label className={styles.checkbox}><input type="checkbox" name="published" checked={draft.published} onChange={e => change({ published: e.target.checked })} /> Publier sur l’accueil</label></div>
          <p className={styles.help}>{draft.published ? 'La modification sera visible sur l’accueil après enregistrement.' : 'La slide sera conservée en brouillon.'}</p>
          <button className={styles.saveButton} disabled={pending || preparing} type="submit">{pending ? 'Enregistrement…' : draft.published ? mode === 'replace' ? 'Remplacer et publier' : 'Ajouter et publier' : 'Enregistrer le brouillon'}</button>
        </fieldset>
        {state.message && showFeedback && <p role={state.ok ? 'status' : 'alert'} className={state.ok ? styles.success : styles.alert}>{state.message}</p>}
      </form>
    </section>
    <section className={styles.collection}><div className={styles.collectionHeader}><div><span className={styles.kicker}>LE SLIDER DE L’ACCUEIL</span><h2>Tes slides, dans l’ordre</h2></div><span>Choisis une slide pour la modifier ou en faire une copie.</span></div>
      <div className={styles.slideList}>{slides.map((slide, index) => <article key={slide.id} className={styles.slideCard}>
        <div className={styles.thumbnail}><HomeSlideVisual slide={slide} preview /><span className={`${styles.statusBadge} ${slide.status === 'active' ? styles.active : styles.inactive}`}>{slide.status === 'active' ? 'Publiée' : 'Brouillon'}</span></div>
        <div className={styles.slideBody}><small>POSITION {index + 1} · ORDRE {slide.sort_order || 0}</small><h3>{slide.title}</h3><div className={styles.actions}><button type="button" disabled={pending || preparing} onClick={() => load(slide)}>Modifier</button><button type="button" disabled={pending || preparing} onClick={() => load(slide, true)}>Dupliquer</button>{<form action={async data => { await setSlidePublication(data); try { localStorage.setItem('mybasket:slider-updated', String(Date.now())); } catch {} }}><input type="hidden" name="id" value={slide.id} />{slide.status !== 'active' && <input type="hidden" name="published" value="on" />}<button type="submit">{slide.status === 'active' ? 'Masquer' : 'Publier'}</button></form>}<form action={async data => { await deleteSlide(data); try { localStorage.setItem('mybasket:slider-updated', String(Date.now())); } catch {} }} onSubmit={event => { if (!window.confirm(`Supprimer définitivement « ${slide.title} » du slider ?`)) event.preventDefault(); }}><input type="hidden" name="id" value={slide.id} /><button className={styles.deleteButton} type="submit">Supprimer</button></form></div></div>
      </article>)}</div>
    </section>
  </>;
}
