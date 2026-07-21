'use client';

/**
 * app/annonces/page.tsx  (v2)
 * MyBasket — ANNONCES (marketplace). Header & Footer existent déjà : ne pas les recréer.
 *
 * v2 : chaque formulaire collecte tous les critères qui REMPLISSENT AUTOMATIQUEMENT
 * la page publique :
 *   - Dépôt d'annonce "Camp / Stage" → page maquette n°1 (Summer Hoops Camp).
 *   - Profil "Coach individuel" (wizard) → page maquette n°2 (Thomas Lemaire).
 *   - Les autres types réutilisent le même gabarit de page (sections masquées si vides).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  AD_TYPES, AdType, AdTypeKey, FORM_SCHEMAS, Field, LEVELS, CONTRACTS,
  Ad, CoachProfile, Booking,
  buildAd, adTypeByKey, keyInfoFields, uid, coachName, fmtDate, asList, asIncludes,
  loadFavs, saveFavs, loadBookings, saveBookings,
} from '../../lib/annonces';

// =====================================================================
// Génériques
// =====================================================================
function Modal({ size = 'md', onClose, children }: { size?: 'sm' | 'md' | 'lg' | 'full'; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return <div className="mba-overlay" onClick={onClose}><div className={`mba-modal ${size}`} onClick={(e) => e.stopPropagation()}>{children}</div></div>;
}
const Stars = ({ n }: { n: number }) => <span className="mba-stars">{'★★★★★'.slice(0, Math.round(n))}<span className="off">{'★★★★★'.slice(Math.round(n))}</span></span>;

// ---- éditeurs de champs riches ----
function ListEditor({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const rows = value.length ? value : [''];
  const upd = (i: number, v: string) => { const n = rows.slice(); n[i] = v; onChange(n); };
  return (
    <div className="mba-list-ed">
      {rows.map((r, i) => (
        <div key={i} className="mba-list-row">
          <input value={r} placeholder={placeholder || 'Élément…'} onChange={(e) => upd(i, e.target.value)} />
          <button type="button" onClick={() => onChange(rows.filter((_, x) => x !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="mba-add-mini" onClick={() => onChange([...rows, ''])}>+ Ajouter</button>
    </div>
  );
}
function IncludesEditor({ value, onChange }: { value: { label: string; sub: string }[]; onChange: (v: { label: string; sub: string }[]) => void }) {
  const rows = value.length ? value : [{ label: '', sub: '' }];
  const upd = (i: number, patch: Partial<{ label: string; sub: string }>) => { const n = rows.slice(); n[i] = { ...n[i], ...patch }; onChange(n); };
  return (
    <div className="mba-list-ed">
      {rows.map((r, i) => (
        <div key={i} className="mba-inc-row">
          <input value={r.label} placeholder="Intitulé (ex. Entraînements)" onChange={(e) => upd(i, { label: e.target.value })} />
          <input value={r.sub} placeholder="Détail (ex. 2x par jour)" onChange={(e) => upd(i, { sub: e.target.value })} />
          <button type="button" onClick={() => onChange(rows.filter((_, x) => x !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="mba-add-mini" onClick={() => onChange([...rows, { label: '', sub: '' }])}>+ Ajouter</button>
    </div>
  );
}
function ImagesEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const add = async (files: FileList | null) => {
    if (!files) return;
    const urls = await Promise.all(Array.from(files).map((f) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); })));
    onChange([...value, ...urls]);
  };
  return (
    <div>
      <label className="mba-btn ghost sm">📷 Ajouter des photos<input type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} /></label>
      {value.length > 0 && (
        <div className="mba-img-thumbs">
          {value.map((src, i) => (
            <div key={i} className="mba-img-thumb"><img src={src} alt="" />{i === 0 && <span className="badge">Principale</span>}<button type="button" onClick={() => onChange(value.filter((_, x) => x !== i))}>✕</button></div>
          ))}
        </div>
      )}
    </div>
  );
}
function VideoEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const readVideo = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result || ''));
    reader.readAsDataURL(file);
  };
  return (
    <div className="mba-video-editor">
      <input value={value || ''} placeholder="Lien YouTube ou Vimeo" onChange={(e) => onChange(e.target.value)} />
      <span>ou</span>
      <label className="mba-btn ghost sm">Téléverser une vidéo<input type="file" accept="video/*" hidden onChange={(e) => readVideo(e.target.files?.[0])} /></label>
      {value && <small>{value.startsWith('data:video') ? 'Vidéo téléversée prête à être publiée' : 'Lien vidéo renseigné'}</small>}
    </div>
  );
}
function FieldInput({ field, value, onChange }: { field: Field; value: any; onChange: (v: any) => void }) {
  if (field.type === 'images') return <ImagesEditor value={asList(value)} onChange={onChange} />;
  if (field.type === 'includes') return <IncludesEditor value={asIncludes(value)} onChange={onChange} />;
  if (field.type === 'list') return <ListEditor value={asList(value)} onChange={onChange} />;
  if (field.type === 'textarea') return <textarea rows={4} value={value || ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === 'select') return <select value={value || ''} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{field.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  if (field.type === 'video') return <VideoEditor value={value || ''} onChange={onChange} />;
  if (field.type === 'file') return <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple={field.multiple} onChange={async (e) => {
    const files = Array.from(e.target.files || []);
    const values = await Promise.all(files.map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
    onChange(values);
  }} />;
  const t = field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text';
  return <input type={t} value={value || ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
}
function sectionsOf(schema: Field[]) {
  const order: string[] = []; const map: Record<string, Field[]> = {};
  schema.forEach((f) => { const g = f.group || 'Détails'; if (!map[g]) { map[g] = []; order.push(g); } map[g].push(f); });
  return order.map((g) => ({ group: g, fields: map[g] }));
}

// =====================================================================
// VIDÉO 1 — sélection du type
// =====================================================================
function TypeSelectModal({ onClose, onContinue }: { onClose: () => void; onContinue: (t: AdTypeKey) => void }) {
  const [sel, setSel] = useState<AdTypeKey | null>(null);
  return (
    <Modal size="lg" onClose={onClose}>
      <div className="mba-mhead"><div><h2>Quel type d’annonce souhaitez-vous publier ?</h2><p>Choisissez la catégorie qui correspond le mieux à votre besoin.</p></div><button className="mba-x" onClick={onClose}>✕</button></div>
      <div className="mba-mbody">
        <div className="mba-type-grid">
          {AD_TYPES.map((t: AdType) => (
            <button key={t.key} className={`mba-type-card ${sel === t.key ? 'sel' : ''}`} onClick={() => setSel(t.key)}>
              <span className="ic">{t.icon}</span><span className="ti">{t.title}</span><span className="de">{t.desc}</span><span className="check">✓</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mba-mfoot"><button className="mba-btn ghost" onClick={onClose}>Annuler</button><button className="mba-btn gold" disabled={!sel} onClick={() => sel && onContinue(sel)}>Continuer →</button></div>
    </Modal>
  );
}

// =====================================================================
// VIDÉO 1 — formulaire dynamique (sections) → remplit la page publique
// =====================================================================
function AdFormModal({ type, onBack, onClose, onSubmit }: { type: AdTypeKey; onBack: () => void; onClose: () => void; onSubmit: (ad: Ad) => void }) {
  const meta = adTypeByKey(type)!;
  const schema = FORM_SCHEMAS[type];
  const [data, setData] = useState<Record<string, any>>({});
  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));
  const submit = () => {
    const missing = schema.filter((f) => f.required && !(typeof data[f.key] === 'string' && data[f.key].trim()));
    if (missing.length) { alert('Champs obligatoires : ' + missing.map((m) => m.label).join(', ')); return; }
    onSubmit(buildAd(type, data));
  };
  return (
    <Modal size="lg" onClose={onClose}>
      <div className="mba-mhead"><div><span className="mba-badge">{meta.icon} {meta.title}</span><h2 style={{ marginTop: 8 }}>Détails de l’annonce</h2><p>Tout ce que vous renseignez ici remplit automatiquement la page publique.</p></div><button className="mba-x" onClick={onClose}>✕</button></div>
      <div className="mba-mbody">
        {sectionsOf(schema).map((sec) => (
          <div key={sec.group} className="mba-form-sec">
            <h4 className="mba-sec-title">{sec.group}</h4>
            <div className="mba-form-grid">
              {sec.fields.map((f) => (
                <label key={f.key} className={`mba-field ${f.full || ['textarea', 'list', 'images', 'includes', 'video', 'file'].includes(f.type) ? 'full' : ''}`}>
                  <span>{f.label}{f.required ? ' *' : ''}</span>
                  <FieldInput field={f} value={data[f.key]} onChange={(v) => set(f.key, v)} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mba-mfoot"><button className="mba-btn ghost" onClick={onBack}>← Retour</button><button className="mba-btn gold" onClick={submit}>Publier l’annonce</button></div>
    </Modal>
  );
}

// =====================================================================
// PAGE PUBLIQUE ANNONCE (maquette n°1 — gabarit générique)
// =====================================================================
function Gallery({ images }: { images: string[] }) {
  const [active, setActive] = useState(0);
  const main = images[active];
  return (
    <div className="mba-gal">
      <div className="mba-gal-main">{main ? <img src={main} alt="" /> : <div className="mba-gal-ph">🏀</div>}</div>
      {images.length > 1 && (
        <div className="mba-gal-thumbs">
          {images.slice(0, 4).map((src, i) => <button key={i} className={i === active ? 'on' : ''} onClick={() => setActive(i)}><img src={src} alt="" /></button>)}
          {images.length > 4 && <div className="mba-gal-more">+{images.length - 4}</div>}
        </div>
      )}
    </div>
  );
}

function AdPublicPage({ ad, fav, onFav, onClose, onReserve }: { ad: Ad; fav: boolean; onClose: () => void; onFav: () => void; onReserve: () => void }) {
  const meta = adTypeByKey(ad.type)!;
  const d = ad.data;
  const toLines = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof value === 'string'
      ? value.split(/\n|\r|\|/).map((item) => item.trim()).filter(Boolean)
      : [];
  const pillars = toLines(d.pillars);
  const includes = asIncludes(d.includes);
  const program = toLines(d.program);
  const coachesPresent = toLines(d.coachesPresent);
  const aboutBullets = asList(d.aboutBullets);
  const descBullets = asList(d.descBullets);
  const highlights = asList(d.highlights);
  const keyInfo = keyInfoFields(ad.type).map((f) => ({ label: f.label, value: typeof d[f.key] === 'string' ? d[f.key] : '' })).filter((x) => x.value);
  return (
    <Modal size="full" onClose={onClose}>
      <div className="mba-public">
        {/* HERO sombre */}
        <div className="mba-pub-hero">
          <div className="mba-pub-topbar"><button className="mba-back light" onClick={onClose}>← Retour aux annonces</button><button className="mba-x light" onClick={onClose}>✕</button></div>
          <div className="mba-pub-hero-grid">
            <div className="mba-pub-media">
              <span className="mba-badge gold abs-tl">{meta.title.toUpperCase()}</span>
              {d.ageRange && <span className="mba-chip-dark abs-tl2">{d.ageRange}</span>}
              <button className={`mba-qa light abs-tr ${fav ? 'on' : ''}`} onClick={onFav}>{fav ? '♥' : '♡'}</button>
              <Gallery images={ad.images} />
            </div>
            <div className="mba-pub-main">
              <h1 className="mba-pub-title">{ad.title}{ad.titleAccent && <span className="accent"> {ad.titleAccent}</span>}</h1>
              <div className="mba-pub-meta">{ad.location && <span>📍 {ad.location}</span>}{d.dates && <span>🗓 {d.dates}</span>}</div>
              {d.intro && <p className="mba-pub-intro">{d.intro}</p>}
              {pillars.length > 0 && <div className="mba-pillars">{pillars.slice(0, 4).map((p, i) => <div key={i} className="mba-pillar"><span className="ic">{['🎯', '🤝', '💪', '🧠'][i % 4]}</span><span>{p}</span></div>)}</div>}
              {(d.about || aboutBullets.length > 0) && (
                <div className="mba-pub-about">
                  <h3>À propos {ad.type === 'camp-stage' ? 'du camp' : ''}</h3>
                  {d.about && <p>{d.about}</p>}
                  {aboutBullets.length > 0 && <ul className="mba-check">{aboutBullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                </div>
              )}
              <div className="mba-pub-cta"><button className="mba-btn gold" onClick={onReserve}>Réserver maintenant</button><button className="mba-btn outline-light" onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent(ad.title)}`; }}>Contacter l’organisateur</button></div>
            </div>
            <aside className="mba-pub-side">
              {keyInfo.length > 0 && (
                <div className="mba-side-card"><h4>Informations clés</h4><dl>{keyInfo.map((k) => <div key={k.label}><dt>{k.label}</dt><dd>{k.value}</dd></div>)}</dl></div>
              )}
              {(d.orgName || ad.author) && (
                <div className="mba-side-card"><h4 className="gold">Organisateur</h4>
                  <div className="mba-org"><div className="mba-org-logo">{(d.orgName || ad.author).slice(0, 2).toUpperCase()}</div>
                    <div><b>{d.orgName || ad.author}</b><div className="mba-muted sm">{d.orgLocation || ad.location}</div><div className="mba-rate sm"><b>4.8</b> <Stars n={5} /> <span>(36)</span></div></div></div>
                  <button className="mba-btn outline-light block sm" style={{ marginTop: 10 }}>Voir le profil</button>
                </div>
              )}
            </aside>
          </div>
        </div>

        {/* CORPS clair */}
        <div className="mba-pub-body">
          {(includes.length > 0 || program.length > 0) && (
            <div className="mba-pub-row3">
              {includes.length > 0 && (
                <div className="mba-panel"><h3>Ce qui est inclus</h3><div className="mba-inc-grid">{includes.map((it, i) => <div key={i} className="mba-inc"><span className="ic">✔</span><div><b>{it.label}</b><span>{it.sub}</span></div></div>)}</div></div>
              )}
              {program.length > 0 && (
                <div className="mba-panel"><h3>Programme type</h3><ul className="mba-prog">{program.map((p, i) => <li key={i}><span className="ic">⟐</span>{p}</li>)}</ul></div>
              )}
              {coachesPresent.length > 0 && (
                <div className="mba-panel"><h3>Coachs présents</h3><ul className="mba-prog">{coachesPresent.map((coach, i) => <li key={i}><span className="ic">🏀</span>{coach}</li>)}</ul></div>
              )}
              {d.quote && <div className="mba-quote-card"><span className="q">“</span><div className="qt">{d.quote.split(',').map((s: string, i: number) => <div key={i}>{s.trim().toUpperCase()}</div>)}</div></div>}
            </div>
          )}

          {(ad.description || descBullets.length > 0 || d.videoUrl) && (
            <div className="mba-pub-row2">
              <div className="mba-panel"><h3>Description détaillée</h3>{ad.description && <p className="mba-para">{ad.description}</p>}{descBullets.length > 0 && <ul className="mba-check">{descBullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}</div>
              {d.videoUrl && (
                <a className="mba-video-card" href={d.videoUrl} target="_blank" rel="noreferrer">
                  <div className="play">▶</div>
                  {highlights.length > 0 && <div className="mba-video-chips">{highlights.map((h, i) => <span key={i}>✓ {h}</span>)}</div>}
                </a>
              )}
            </div>
          )}
        </div>

        {/* barre CTA bas */}
        <div className="mba-pub-sticky">
          <div className="it"><b>Questions ?</b><span>Contacte l’organisateur</span></div>
          <div className="it"><b>🔒 Paiement sécurisé</b><span>100% sécurisé</span></div>
          <div className="it"><b>⏱ Annulation flexible</b><span>Jusqu’à 48h avant</span></div>
          <button className="mba-btn gold" onClick={onReserve}>Réserver maintenant →</button>
        </div>
      </div>
    </Modal>
  );
}

// =====================================================================
// Calendrier réutilisable
// =====================================================================
const SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
function Calendar({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const [view, setView] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = new Date(view.y, view.m, 1);
  const startDow = (first.getDay() + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const iso = (n: number) => `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
  const move = (delta: number) => setView((v) => { const dd = new Date(v.y, v.m + delta, 1); return { y: dd.getFullYear(), m: dd.getMonth() }; });
  return (
    <div className="mba-cal">
      <div className="mba-cal-head"><button onClick={() => move(-1)}>‹</button><b>{first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</b><button onClick={() => move(1)}>›</button></div>
      <div className="mba-cal-dow">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((dd, i) => <span key={i}>{dd}</span>)}</div>
      <div className="mba-cal-grid">{cells.map((n, i) => n === null ? <span key={i} /> : (() => { const past = new Date(view.y, view.m, n) < today; return <button key={i} disabled={past} className={value === iso(n) ? 'sel' : ''} onClick={() => onPick(iso(n))}>{n}</button>; })())}</div>
    </div>
  );
}

// =====================================================================
// Réservation Annonce (inscription camp/stage…)
// =====================================================================
function AdReserveModal({ ad, onClose, onConfirm }: { ad: Ad; onClose: () => void; onConfirm: (b: Booking) => void }) {
  const [date, setDate] = useState(''); const [slot, setSlot] = useState('');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const confirm = () => {
    if (!name.trim() || !email.trim()) { alert('Renseignez nom et email'); return; }
    onConfirm({ id: uid('bk_'), adId: ad.id, label: ad.title, date, slot, name, email, phone, createdAt: Date.now() });
  };
  return (
    <Modal size="md" onClose={onClose}>
      <div className="mba-mhead"><div><h2>Réserver / S’inscrire</h2><p>{ad.title}{ad.data.prix ? ` · ${ad.data.prix}` : ''}</p></div><button className="mba-x" onClick={onClose}>✕</button></div>
      <div className="mba-mbody">
        <h4 className="mba-h4">Date souhaitée</h4><Calendar value={date} onPick={setDate} />
        <h4 className="mba-h4">Créneau (si applicable)</h4><div className="mba-slots">{SLOTS.map((s) => <button key={s} className={slot === s ? 'sel' : ''} onClick={() => setSlot(s)}>{s}</button>)}</div>
        <h4 className="mba-h4">Vos coordonnées</h4>
        <div className="mba-form-grid">
          <label className="mba-field"><span>Nom complet *</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="mba-field"><span>Téléphone</span><input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <label className="mba-field full"><span>Email *</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        </div>
        <div className="mba-pay-note" style={{ marginTop: 12 }}>🔒 Paiement sécurisé via Stripe (à connecter). Aucune donnée bancaire n’est stockée par MyBasket.</div>
      </div>
      <div className="mba-mfoot"><button className="mba-btn ghost" onClick={onClose}>Retour</button><button className="mba-btn gold" onClick={confirm}>Confirmer la réservation</button></div>
    </Modal>
  );
}

// =====================================================================
// VIDÉO 2 — Wizard Coach (remplit la maquette n°2)
// =====================================================================
const C_STEPS = ['Infos', 'À propos', 'Séance', 'Tarifs', 'Médias', 'Aperçu'];
const emptyCoach = (): CoachProfile => ({
  id: uid('coach_'), firstName: '', lastName: '', jobTitle: 'Coach individuel de basketball', available: true,
  location: '', mobilityNote: 'Déplacements possibles', phone: '', email: '', bio: '', bioBullets: [], pillars: [], tags: [],
  sessionType: 'Individuelle', audience: '', level: '', locationLabel: '', availability: '', travel: 'Oui', materialProvided: 'Oui',
  durations: [{ id: uid(), label: '1h', price: '60 €' }], material: [], sessionFlow: [], offers: [],
  sessionsCount: 0, experienceYears: '', rating: 5, reviewsCount: 0, reviews: [], photos: [], createdAt: Date.now(),
});

function CoachWizard({ onClose, onPublish }: { onClose: () => void; onPublish: (c: CoachProfile) => void }) {
  const [step, setStep] = useState(0);
  const [c, setC] = useState<CoachProfile>(emptyCoach());
  const set = (p: Partial<CoachProfile>) => setC((prev) => ({ ...prev, ...p }));
  const readImg = (f: File, cb: (u: string) => void) => { const r = new FileReader(); r.onload = () => cb(String(r.result)); r.readAsDataURL(f); };
  const updArr = <T extends { id: string }>(arr: T[], id: string, patch: Partial<T>) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x));
  const delArr = <T extends { id: string }>(arr: T[], id: string) => arr.filter((x) => x.id !== id);
  const next = () => { if (step === 0 && (!c.firstName.trim() || !c.lastName.trim())) { alert('Prénom et nom requis'); return; } setStep((s) => Math.min(C_STEPS.length - 1, s + 1)); };

  return (
    <Modal size="lg" onClose={onClose}>
      <div className="mba-mhead"><div><h2>Créer mon profil Coach Individuel</h2><p>Étape {step + 1} / {C_STEPS.length} — {C_STEPS[step]}</p></div><button className="mba-x" onClick={onClose}>✕</button></div>
      <div className="mba-stepper">{C_STEPS.map((s, i) => <div key={s} className={`mba-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} onClick={() => i < step && setStep(i)}><span className="dot">{i < step ? '✓' : i + 1}</span><span className="lab">{s}</span></div>)}</div>

      <div className="mba-mbody">
        {step === 0 && (
          <div className="mba-form-grid">
            <div className="mba-photo-row full">
              <div className="mba-coach-photo">{c.photo ? <img src={c.photo} alt="" /> : <span>📷</span>}</div>
              <label className="mba-btn ghost sm">{c.photo ? 'Changer la photo' : 'Photo de profil'}<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readImg(f, (u) => set({ photo: u })); }} /></label>
              <label className="mba-btn ghost sm">Image de fond (hero)<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readImg(f, (u) => set({ cover: u })); }} /></label>
            </div>
            <label className="mba-field"><span>Prénom *</span><input value={c.firstName} onChange={(e) => set({ firstName: e.target.value })} /></label>
            <label className="mba-field"><span>Nom *</span><input value={c.lastName} onChange={(e) => set({ lastName: e.target.value })} /></label>
            <label className="mba-field full"><span>Titre / sous-titre</span><input value={c.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} placeholder="Coach individuel de basketball" /></label>
            <label className="mba-field"><span>Localisation</span><input value={c.location} onChange={(e) => set({ location: e.target.value })} placeholder="Lyon, France" /></label>
            <label className="mba-field"><span>Note mobilité</span><input value={c.mobilityNote} onChange={(e) => set({ mobilityNote: e.target.value })} placeholder="Déplacements possibles" /></label>
            <label className="mba-field"><span>Téléphone</span><input value={c.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
            <label className="mba-field"><span>Email</span><input type="email" value={c.email} onChange={(e) => set({ email: e.target.value })} /></label>
            <label className="mba-field"><span>Disponible</span><select value={c.available ? 'Oui' : 'Non'} onChange={(e) => set({ available: e.target.value === 'Oui' })}><option>Oui</option><option>Non</option></select></label>
            <label className="mba-field"><span>Nb de séances réalisées</span><input type="number" value={c.sessionsCount || ''} onChange={(e) => set({ sessionsCount: Number(e.target.value) })} placeholder="156" /></label>
            <label className="mba-field"><span>Expérience</span><input value={c.experienceYears} onChange={(e) => set({ experienceYears: e.target.value })} placeholder="3 ans+" /></label>
            <label className="mba-field"><span>Note moyenne</span><input type="number" step="0.1" value={c.rating || ''} onChange={(e) => set({ rating: Number(e.target.value) })} placeholder="4.9" /></label>
            <label className="mba-field"><span>Nombre d’avis</span><input type="number" value={c.reviewsCount || ''} onChange={(e) => set({ reviewsCount: Number(e.target.value) })} placeholder="27" /></label>
          </div>
        )}
        {step === 1 && (
          <div className="mba-form-grid">
            <label className="mba-field full"><span>Bio (sous le titre)</span><textarea rows={3} value={c.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="Ancien joueur professionnel…" /></label>
            <label className="mba-field full"><span>À propos de moi — valeurs</span><textarea rows={5} value={c.bioBullets.join('\n')} onChange={(e) => set({ bioBullets: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })} placeholder="Décris tes valeurs, ton approche et ta façon de travailler." /></label>
            <div className="mba-field full"><span>4 piliers (icônes sous le titre)</span><ListEditor value={c.pillars} placeholder="Technique individuelle" onChange={(v) => set({ pillars: v })} /></div>
            <div className="mba-field full"><span>Tags / compétences</span><ListEditor value={c.tags} placeholder="Shooting" onChange={(v) => set({ tags: v })} /></div>
          </div>
        )}
        {step === 2 &&
  (() => {
    const publics = [
      "U7",
      "U9",
      "U11",
      "U13",
      "U15",
      "U18",
      "U21",
      "Seniors",
      "Pro",
    ];

    const jours = [
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      "Dimanche",
    ];

    const selectedPublics = c.audience
      ? c.audience.split(", ").filter(Boolean)
      : [];

    const selectedDays = c.availability
      ? c.availability.split(" | ").filter(Boolean)
      : [];

    const togglePublic = (publicName: string) => {
      const next = selectedPublics.includes(publicName)
        ? selectedPublics.filter((p) => p !== publicName)
        : [...selectedPublics, publicName];

      set({ audience: next.join(", ") });
    };

    const removeDay = (jour: string) => {
      const next = selectedDays.filter((d) => !d.startsWith(`${jour} `));
      set({ availability: next.join(" | ") });
    };

    const updateAvailability = (
      jour: string,
      debut: string,
      fin: string
    ) => {
      const others = selectedDays.filter((d) => !d.startsWith(`${jour} `));
      const next = [...others, `${jour} ${debut}-${fin}`];

      set({ availability: next.join(" | ") });
    };

    return (
      <div className="mba-form-grid">
        <label className="mba-field">
          <span>Type de séance</span>
          <select
            value={c.sessionType}
            onChange={(e) => set({ sessionType: e.target.value })}
          >
            <option value="">Choisir</option>
            <option value="Individuelle">Individuelle</option>
            <option value="Collective">Collective</option>
          </select>
        </label>

        <div className="mba-field full">
          <span>Public</span>
          <div className="mba-check-grid">
            {publics.map((publicName) => (
              <label key={publicName} className="mba-check-item">
                <input
                  type="checkbox"
                  checked={selectedPublics.includes(publicName)}
                  onChange={() => togglePublic(publicName)}
                />
                {publicName}
              </label>
            ))}
          </div>
        </div>

        <label className="mba-field">
          <span>Niveau</span>
          <select
            value={c.level}
            onChange={(e) => set({ level: e.target.value })}
          >
            <option value="">Choisir</option>
            <option value="Débutant">Débutant</option>
            <option value="Intermédiaire">Intermédiaire</option>
            <option value="Confirmé">Confirmé</option>
            <option value="Tous les niveaux">Tous les niveaux</option>
          </select>
        </label>

        <label className="mba-field">
          <span>Lieu</span>
          <input
            value={c.locationLabel}
            onChange={(e) => set({ locationLabel: e.target.value })}
            placeholder="Lyon et alentours"
          />
        </label>

        <div className="mba-field full">
          <span>Disponibilités</span>

          <div className="mba-availability">
            {jours.map((jour) => {
              const current = selectedDays.find((d) =>
                d.startsWith(`${jour} `)
              );

              const checked = Boolean(current);

              const hours = current
                ? current.replace(`${jour} `, "").split("-")
                : ["08:00", "21:00"];

              const debut = hours[0] || "08:00";
              const fin = hours[1] || "21:00";

              return (
                <div key={jour} className="mba-availability-row">
                  <label className="mba-day-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateAvailability(jour, debut, fin);
                        } else {
                          removeDay(jour);
                        }
                      }}
                    />
                    {jour}
                  </label>

                  <input
                    type="time"
                    value={debut}
                    disabled={!checked}
                    onChange={(e) =>
                      updateAvailability(jour, e.target.value, fin)
                    }
                  />

                  <input
                    type="time"
                    value={fin}
                    disabled={!checked}
                    onChange={(e) =>
                      updateAvailability(jour, debut, e.target.value)
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        <label className="mba-field">
          <span>Déplacements</span>
          <select
            value={c.travel}
            onChange={(e) => set({ travel: e.target.value })}
          >
            <option value="Oui">Oui</option>
            <option value="Non">Non</option>
          </select>
        </label>

        <label className="mba-field">
          <span>Matériel fourni</span>
          <select
            value={c.materialProvided}
            onChange={(e) => set({ materialProvided: e.target.value })}
          >
            <option value="Oui">Oui</option>
            <option value="Non">Non</option>
          </select>
        </label>
      </div>
    );
  })()}
        {step === 3 && (
          <div className="mba-repeat">
            {c.durations.map((dr) => (
              <div key={dr.id} className="mba-repeat-row"><div className="mba-form-grid">
                <label className="mba-field"><span>Durée</span><input value={dr.label} onChange={(e) => set({ durations: updArr(c.durations, dr.id, { label: e.target.value }) })} placeholder="1h" /></label>
                <label className="mba-field"><span>Tarif</span><input value={dr.price} onChange={(e) => set({ durations: updArr(c.durations, dr.id, { price: e.target.value }) })} placeholder="60 €" /></label>
              </div><button className="mba-del" onClick={() => set({ durations: delArr(c.durations, dr.id) })}>🗑</button></div>
            ))}
            <button className="mba-btn ghost" onClick={() => set({ durations: [...c.durations, { id: uid(), label: '', price: '' }] })}>+ Ajouter une durée / tarif</button>
          </div>
        )}
        {step === 4 && (
          <div className="mba-form-grid">
            <div className="mba-field full"><span>Vidéo de présentation</span><VideoEditor value={c.videoUrl || ''} onChange={(v) => set({ videoUrl: v })} /></div>
            <label className="mba-field full"><span>Lien Instagram</span><input type="url" value={c.instagramUrl || ''} onChange={(e) => set({ instagramUrl: e.target.value })} placeholder="https://instagram.com/monprofil" /></label>
            <div className="mba-field full"><span>Photos / vidéos</span><ImagesEditor value={c.photos} onChange={(v) => set({ photos: v })} /></div>
            <div className="mba-field full"><span>Avis (optionnel)</span>
              <div className="mba-repeat">
                {c.reviews.map((rv) => (
                  <div key={rv.id} className="mba-repeat-row"><div className="mba-form-grid">
                    <label className="mba-field"><span>Nom</span><input value={rv.name} onChange={(e) => set({ reviews: updArr(c.reviews, rv.id, { name: e.target.value }) })} /></label>
                    <label className="mba-field"><span>Détail</span><input value={rv.meta} onChange={(e) => set({ reviews: updArr(c.reviews, rv.id, { meta: e.target.value }) })} placeholder="16 ans / U17" /></label>
                    <label className="mba-field full"><span>Avis</span><input value={rv.text} onChange={(e) => set({ reviews: updArr(c.reviews, rv.id, { text: e.target.value }) })} /></label>
                  </div><button className="mba-del" onClick={() => set({ reviews: delArr(c.reviews, rv.id) })}>🗑</button></div>
                ))}
                <button className="mba-btn ghost" onClick={() => set({ reviews: [...c.reviews, { id: uid(), name: '', meta: '', stars: 5, text: '' }] })}>+ Ajouter un avis</button>
              </div>
            </div>
          </div>
        )}
        {step === 5 && <CoachPublicContent coach={c} preview />}
      </div>

      <div className="mba-mfoot">
        {step > 0 ? <button className="mba-btn ghost" onClick={() => setStep((s) => s - 1)}>← Retour</button> : <button className="mba-btn ghost" onClick={onClose}>Annuler</button>}
        <div style={{ flex: 1 }} />
        {step < C_STEPS.length - 1 ? <button className="mba-btn gold" onClick={next}>Continuer →</button> : <button className="mba-btn gold" onClick={() => onPublish(c)}>✓ Publier mon profil</button>}
      </div>
    </Modal>
  );
}

// =====================================================================
// PAGE PUBLIQUE COACH (maquette n°2)
// =====================================================================
function MapCard({ label, note }: { label: string; note: string }) {
  return (
    <div className="mba-map-card"><div className="mba-map"><div className="pin">📍</div></div><div className="mba-map-foot"><b>📍 {label || '—'}</b><span>{note}</span></div></div>
  );
}
function CoachPublicContent({ coach, preview, onReserve }: { coach: CoachProfile; preview?: boolean; onReserve?: (durationId?: string) => void }) {
  const [durId, setDurId] = useState(coach.durations[0]?.id || '');
  const dur = coach.durations.find((x) => x.id === durId) || coach.durations[0];
  const PILL = ['🎯', '🧠', '💪', '🎬'];
  return (
    <div className="mba-coach2">
      {/* HERO */}
      <div className="mba-c2-hero" style={coach.cover ? { backgroundImage: `linear-gradient(180deg,rgba(15,15,18,.6),rgba(15,15,18,.92)),url(${coach.cover})` } : undefined}>
        <div className="mba-c2-grid">
          <div className="mba-c2-photo">
            <span className="mba-badge gold abs-tl">COACH INDIVIDUEL</span>{coach.available && <span className="mba-chip-dark abs-tl2">Disponible</span>}
            {coach.photo ? <img src={coach.photo} alt="" /> : <div className="ph">{(coach.firstName[0] || '') + (coach.lastName[0] || '')}</div>}
            <div className="mba-c2-stats"><div><b>{coach.sessionsCount || '—'}</b><span>Séances</span></div><div><b>{(coach.rating || 5).toFixed(1)} ★</b><span>({coach.reviewsCount} avis)</span></div><div><b>{coach.experienceYears || '—'}</b><span>d’expérience</span></div></div>
          </div>
          <div className="mba-c2-main">
            <h1>{coachName(coach) || 'Coach'}</h1>
            <div className="mba-c2-sub">{coach.jobTitle}</div>
            <div className="mba-pub-meta light">{coach.location && <span>📍 {coach.location}</span>}{coach.mobilityNote && <span>🚗 {coach.mobilityNote}</span>}</div>
            {coach.bio && <p className="mba-pub-intro">{coach.bio}</p>}
            {coach.pillars.length > 0 && <div className="mba-pillars">{coach.pillars.slice(0, 4).map((p, i) => <div key={i} className="mba-pillar"><span className="ic">{PILL[i % 4]}</span><span>{p}</span></div>)}</div>}
            {coach.bioBullets.length > 0 && <div className="mba-pub-about"><h3>À propos de moi — valeurs</h3><div className="mba-values-text">{coach.bioBullets.map((b, i) => <p key={i}>{b}</p>)}</div></div>}
            <div className="mba-pub-cta"><button className="mba-btn gold" disabled={preview} onClick={() => onReserve?.(durId)}>Réserver une séance</button><button className="mba-btn outline-light" disabled={preview} onClick={() => { window.location.href = `mailto:${coach.email}`; }}>Me contacter</button></div>
            {coach.tags.length > 0 && <div className="mba-tags">{coach.tags.slice(0, 4).map((t, i) => <span key={i}>{t}</span>)}{coach.tags.length > 4 && <span className="more">+{coach.tags.length - 4}</span>}</div>}{coach.instagramUrl && <a className="mba-instagram-link" href={coach.instagramUrl} target="_blank" rel="noreferrer">Voir la page Instagram ↗</a>}
          </div>
          <aside className="mba-c2-side">
            <div className="mba-side-card"><h4>Informations</h4><dl>
              {coach.sessionType && <div><dt>Type de séance</dt><dd>{coach.sessionType}</dd></div>}
              {coach.audience && <div><dt>Public</dt><dd>{coach.audience}</dd></div>}
              {coach.level && <div><dt>Niveau</dt><dd>{coach.level}</dd></div>}
              {coach.locationLabel && <div><dt>Lieu</dt><dd>{coach.locationLabel}</dd></div>}
              {coach.durations.length > 0 && <div><dt>Durée</dt><dd>{coach.durations.map((d) => d.label).join(' / ')}</dd></div>}
              {coach.durations.length > 0 && <div><dt>Tarifs</dt><dd>{coach.durations.map((d) => `${d.label} : ${d.price}`).join(' · ')}</dd></div>}
              {coach.availability && <div><dt>Disponibilités</dt><dd>{coach.availability}</dd></div>}
              <div><dt>Déplacements</dt><dd>{coach.travel}</dd></div>
              <div><dt>Matériel fourni</dt><dd>{coach.materialProvided}</dd></div>
            </dl></div>
            <div className="mba-side-card"><h4 className="gold">Réserver rapidement</h4>
              <div className="mba-dur-pick">{coach.durations.map((d) => <button key={d.id} className={durId === d.id ? 'on' : ''} onClick={() => setDurId(d.id)}>{d.label}</button>)}</div>
              <div className="mba-dur-tarif"><span>Tarif</span><b>{dur?.price || '—'}</b></div>
              <button className="mba-btn gold block" disabled={preview} onClick={() => onReserve?.(durId)}>📅 Voir les créneaux</button>
            </div>
            <div className="mba-side-card"><h4>Localisation</h4><MapCard label={coach.locationLabel || coach.location} note={coach.mobilityNote} /></div>
            {coach.material.length > 0 && <div className="mba-side-card"><h4>Matériel utilisé</h4><ul className="mba-mat">{coach.material.map((m, i) => <li key={i}>🔸 {m}</li>)}</ul></div>}
          </aside>
        </div>
      </div>

      {/* CORPS */}
      <div className="mba-pub-body">
        <div className="mba-pub-row2">
        </div>
        {(coach.reviews.length > 0 || coach.photos.length > 0) && (
          <div className="mba-pub-row2">
            {coach.reviews.length > 0 && <div className="mba-panel"><h3>Avis des joueurs <span className="mba-rate sm" style={{ marginLeft: 8 }}><b>{(coach.rating || 5).toFixed(1)}</b> <Stars n={coach.rating || 5} /> <span>({coach.reviewsCount} avis)</span></span></h3><div className="mba-reviews">{coach.reviews.map((r) => <div key={r.id} className="mba-rev"><div className="h"><b>{r.name}</b><span>{r.meta}</span></div><Stars n={r.stars} /><p>“{r.text}”</p></div>)}</div></div>}
            {coach.photos.length > 0 && <div className="mba-panel"><h3>Photos / Vidéos</h3><div className="mba-ph-grid">{coach.photos.map((p, i) => <img key={i} src={p} alt="" />)}</div></div>}
          </div>
        )}
        <div className="mba-feature-strip">
          <div><b>👤 Approche personnalisée</b><span>Un suivi adapté à ton profil.</span></div>
          <div><b>🏀 Résultats concrets</b><span>Des méthodes efficaces pour progresser.</span></div>
          <div><b>🕐 Flexibilité</b><span>Horaires adaptés à ton emploi du temps.</span></div>
          <div><b>🔥 Passion & expérience</b><span>Plusieurs années de coaching individuel.</span></div>
        </div>
      </div>

      {!preview && (
        <div className="mba-pub-sticky">
          <div className="it"><b>Questions ?</b><span>Je suis là pour t’aider.</span></div>
          <div className="it"><b>⏱ Contact rapide</b><span>Réponse sous 24h</span></div>
          <div className="it"><b>🔒 Paiement sécurisé</b><span>100% sécurisé</span></div>
          <button className="mba-btn gold" onClick={() => onReserve?.(durId)}>Réserver maintenant →</button>
        </div>
      )}
    </div>
  );
}
function CoachPublicModal({ coach, onClose, onReserve }: { coach: CoachProfile; onClose: () => void; onReserve: (durationId?: string) => void }) {
  return (
    <Modal size="full" onClose={onClose}>
      <div className="mba-pub-topbar dark"><button className="mba-back light" onClick={onClose}>← Retour aux annonces</button><button className="mba-x light" onClick={onClose}>✕</button></div>
      <CoachPublicContent coach={coach} onReserve={onReserve} />
    </Modal>
  );
}

// =====================================================================
// Réservation Coach (durée → calendrier → créneau → coords → paiement)
// =====================================================================
function ReservationModal({ coach, initialDurationId, onClose, onConfirm }: { coach: CoachProfile; initialDurationId?: string; onClose: () => void; onConfirm: (b: Booking) => void }) {
  const [durId, setDurId] = useState(initialDurationId || coach.durations[0]?.id || '');
  const dur = coach.durations.find((x) => x.id === durId);
  const [date, setDate] = useState(''); const [slot, setSlot] = useState('');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const confirm = () => {
    if (!durId || !date || !slot) { alert('Choisissez une durée, une date et un créneau'); return; }
    if (!name.trim() || !email.trim()) { alert('Renseignez vos coordonnées'); return; }
    onConfirm({ id: uid('bk_'), coachId: coach.id, label: `${coachName(coach)} · ${dur?.label || ''}`, date, slot, name, email, phone, createdAt: Date.now() });
  };
  return (
    <Modal size="md" onClose={onClose}>
      <div className="mba-mhead"><div><h2>Réserver ma séance</h2><p>avec {coachName(coach)}</p></div><button className="mba-x" onClick={onClose}>✕</button></div>
      <div className="mba-mbody">
        <h4 className="mba-h4">1 · Durée</h4>
        <div className="mba-dur-pick wide">{coach.durations.map((d) => <button key={d.id} className={durId === d.id ? 'on' : ''} onClick={() => setDurId(d.id)}>{d.label} · {d.price}</button>)}</div>
        <h4 className="mba-h4">2 · Date</h4><Calendar value={date} onPick={setDate} />
        <h4 className="mba-h4">3 · Créneau horaire</h4><div className="mba-slots">{SLOTS.map((s) => <button key={s} className={slot === s ? 'sel' : ''} onClick={() => setSlot(s)}>{s}</button>)}</div>
        <h4 className="mba-h4">4 · Vos coordonnées</h4>
        <div className="mba-form-grid">
          <label className="mba-field"><span>Nom complet *</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="mba-field"><span>Téléphone</span><input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <label className="mba-field full"><span>Email *</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        </div>
        <h4 className="mba-h4">5 · Paiement</h4>
        <div className="mba-pay"><div className="mba-pay-sum"><span>Séance {dur?.label}</span><b>{dur?.price || '—'}</b></div><div className="mba-pay-note">🔒 Paiement sécurisé via Stripe (à connecter). Aucune donnée bancaire n’est stockée par MyBasket.</div></div>
      </div>
      <div className="mba-mfoot"><button className="mba-btn ghost" onClick={onClose}>Retour</button><button className="mba-btn gold" onClick={confirm}>Confirmer la réservation</button></div>
    </Modal>
  );
}

// =====================================================================
// Cartes feed
// =====================================================================
function AdCard({
  ad,
  fav,
  onFav,
  onShare,
  onView,
}: {
  ad: Ad;
  fav: boolean;
  onFav: () => void;
  onShare: () => void;
  onView: () => void;
}) {
  const meta = adTypeByKey(ad.type)!;
  const image = ad.images?.[0];

  return (
    <article className="mba-card annonce-card">
      <div className="annonce-visual">
        {image ? (
          <img src={image} alt={ad.title} />
        ) : (
          <div className="annonce-placeholder">
            <span>{meta.icon}</span>
          </div>
        )}

        <span className="mba-badge annonce-badge">
          {meta.icon} {meta.title}
        </span>

        <div className="mba-quick annonce-quick">
          <button className={`mba-qa ${fav ? "on" : ""}`} onClick={onFav}>
            {fav ? "♥" : "♡"}
          </button>

          <button className="mba-qa" onClick={onShare}>
            ↗
          </button>
        </div>
      </div>

      <div className="annonce-card-body">
        <h3 className="mba-card-title">
          {ad.title}
          {ad.titleAccent ? ` ${ad.titleAccent}` : ""}
        </h3>

        <div className="mba-card-meta">
          <span>👤 {ad.author}</span>
          {ad.location && <span>📍 {ad.location}</span>}
          {ad.level && <span>🏆 {ad.level}</span>}
          <span>🗓 {fmtDate(ad.createdAt)}</span>
        </div>

        <p className="mba-card-desc">
          {ad.description || ad.data.intro}
        </p>

        <button className="mba-btn gold block" onClick={onView}>
          Voir l’annonce
        </button>
      </div>
    </article>
  );
}
function CoachCard({
  coach,
  onView,
}: {
  coach: CoachProfile;
  onView: () => void;
}) {
  return (
    <article className="mba-card annonce-card coach-card">
      <div className="annonce-visual coach-visual">
        {coach.photo ? (
          <img src={coach.photo} alt={coachName(coach)} />
        ) : (
          <div className="annonce-placeholder coach-placeholder">
            <span>
              {(coach.firstName[0] || "") + (coach.lastName[0] || "")}
            </span>
          </div>
        )}

        <span className="mba-badge annonce-badge gold">
          🎯 Coach individuel
        </span>

        {coach.available && (
          <span className="coach-available">
            Disponible
          </span>
        )}
      </div>

      <div className="annonce-card-body">
        <h3 className="mba-card-title">{coachName(coach)}</h3>

        <div className="mba-card-meta">
          <span>📍 {coach.location || "—"}</span>
        </div>

        <div className="mba-rate sm">
          <Stars n={coach.rating || 5} />
          <b>{(coach.rating || 5).toFixed(1)}</b>
          <span>· {coach.reviewsCount} avis</span>
        </div>

        <p className="mba-card-desc">{coach.bio}</p>

        <div className="mba-card-meta">
          {coach.durations.slice(0, 3).map((d) => (
            <span key={d.id}>
              💶 {d.label} · {d.price}
            </span>
          ))}
        </div>

        <button className="mba-btn gold block" onClick={onView}>
          Voir le profil
        </button>
      </div>
    </article>
  );
}


// =====================================================================
// Supabase — annonces / coachs validés
// =====================================================================
type DbAnnouncement = {
  id: string;
  author_user_id: string | null;
  author_club_id: string | null;
  coach_profile_id: string | null;
  author_type: string | null;
  author_name: string | null;
  author_email: string | null;
  author_phone: string | null;
  category: string | null;
  title: string | null;
  description: string | null;
  city: string | null;
  price_cents: number | null;
  image_url: string | null;
  images: string[] | null;
  payload_data: Record<string, any> | null;
  video_url: string | null;
  status: string | null;
  views_count: number | null;
  contacts_count: number | null;
  created_at: string | null;
};

type DbCoachProfile = {
  id: string;
  user_id: string;
  slug: string | null;
  city: string | null;
  bio: string | null;
  speciality: string | null;
  price_from: number | null;
  rating: number | null;
  status: string | null;
  profile_data: CoachProfile | null;
  instagram_url: string | null;
  video_url: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type DbProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function centsToEuroLabel(cents?: number | null) {
  if (!cents) return '';
  return `${Math.round(cents / 100)} €`;
}

function priceToCents(value: unknown) {
  if (typeof value === 'number') return Math.round(value * 100);
  if (!value || typeof value !== 'string') return 0;

  const clean = value
    .replace('€', '')
    .replace(',', '.')
    .trim();

  const price = Number(clean);
  return Number.isFinite(price) ? Math.round(price * 100) : 0;
}

function categoryToAdType(category: string | null): AdTypeKey {
  if (category === 'club_recherche_joueur') return 'club-recherche-joueur';
  if (category === 'club_recherche_staff') return 'club-recherche-staff';
  if (category === 'staff_recherche_club') return 'staff-recherche-club';
  if (category === 'camp_stage') return 'camp-stage';
  return 'camp-stage';
}

function adTypeToCategory(type: AdTypeKey) {
  if (type === 'club-recherche-joueur') return 'club_recherche_joueur';
  if (type === 'club-recherche-staff') return 'club_recherche_staff';
  if (type === 'staff-recherche-club') return 'staff_recherche_club';
  return 'camp_stage';
}

async function uploadDataUrl(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  dataUrl: string,
  folder: string,
) {
  if (!dataUrl.startsWith('data:')) return dataUrl;

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from('annonces-media').upload(path, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from('annonces-media').getPublicUrl(path).data.publicUrl;
}

async function uploadManyDataUrls(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  values: string[],
  folder: string,
) {
  return Promise.all(values.map((value) => uploadDataUrl(supabase, userId, value, folder)));
}

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `coach-${Date.now()}`;
}

function dbAnnouncementToAd(row: DbAnnouncement): Ad {
  const type = categoryToAdType(row.category);
  const payload = row.payload_data || {};
  const images = row.images?.length ? row.images : row.image_url ? [row.image_url] : [];

  return {
    id: row.id,
    type,
    title: row.title || 'Annonce sans titre',
    titleAccent: typeof payload.titreAccent === 'string' ? payload.titreAccent : '',
    author: row.author_name || row.author_email || 'Auteur MyBasket',
    location: row.city || '',
    level: typeof payload.niveau === 'string' ? payload.niveau : '',
    contract: typeof payload.contrat === 'string' ? payload.contrat : '',
    description: row.description || '',
    images,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    status: row.status || 'approved',
    data: {
      ...payload,
      videoUrl: row.video_url || payload.videoUrl || '',
      intro: payload.intro || row.description || '',
      city: payload.city || row.city || '',
      location: payload.location || row.city || '',
      orgName: payload.orgName || row.author_name || '',
      email: payload.email || row.author_email || '',
      phone: payload.phone || row.author_phone || '',
      prix: payload.prix || centsToEuroLabel(row.price_cents),
      price: payload.price || centsToEuroLabel(row.price_cents),
    },
  } as Ad;
}

function dbCoachToCoachProfile(row: DbCoachProfile, profile?: DbProfile): CoachProfile {
  if (row.profile_data && typeof row.profile_data === 'object') {
    return {
      ...emptyCoach(),
      ...row.profile_data,
      id: row.id,
      instagramUrl: row.instagram_url || row.profile_data.instagramUrl || '',
      videoUrl: row.video_url || row.profile_data.videoUrl || '',
      createdAt: row.created_at ? new Date(row.created_at).getTime() : row.profile_data.createdAt || Date.now(),
    };
  }

  const displayName = profile?.display_name || 'Coach MyBasket';
  const parts = displayName.split(' ').filter(Boolean);
  const price = centsToEuroLabel(row.price_from) || '60 €';
  return {
    ...emptyCoach(),
    id: row.id,
    firstName: parts[0] || 'Coach',
    lastName: parts.slice(1).join(' '),
    jobTitle: row.speciality || 'Coach individuel de basketball',
    location: row.city || '',
    email: profile?.email || '',
    bio: row.bio || '',
    durations: [{ id: uid(), label: '1h', price }],
    rating: row.rating || 5,
    photos: profile?.avatar_url ? [profile.avatar_url] : [],
    photo: profile?.avatar_url || undefined,
    instagramUrl: row.instagram_url || '',
    videoUrl: row.video_url || '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

// =====================================================================
// PAGE
// =====================================================================
type Flow =
  | { kind: 'none' } | { kind: 'typeSelect' } | { kind: 'adForm'; type: AdTypeKey }
  | { kind: 'adPublic'; ad: Ad } | { kind: 'adReserve'; ad: Ad }
  | { kind: 'coachWizard' } | { kind: 'coachPublic'; coach: CoachProfile } | { kind: 'reservation'; coach: CoachProfile; durationId?: string };

export default function AnnoncesClient() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [coaches, setCoaches] = useState<CoachProfile[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [flow, setFlow] = useState<Flow>({ kind: 'none' });
  const [toast, setToast] = useState('');
  const toastT = useRef<number | null>(null);
  const [q, setQ] = useState(''); const [fType, setFType] = useState(''); const [fLevel, setFLevel] = useState(''); const [fLoc, setFLoc] = useState(''); const [fContract, setFContract] = useState('');
  const searchParams = useSearchParams();

  const flash = (m: string) => { setToast(m); if (toastT.current) clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(''), 2400); };

  useEffect(() => {
    if (searchParams.get('action') !== 'create') return;

    const requestedType = searchParams.get('type') as AdTypeKey | null;
    const validType = requestedType && AD_TYPES.some((type) => type.key === requestedType)
      ? requestedType
      : 'camp-stage';

    setFlow({ kind: 'adForm', type: validType });
  }, [searchParams]);
  useEffect(() => {
    const supabase = createClient();

    const loadPublicData = async () => {
      const [{ data: announcementsData, error: announcementsError }, { data: coachProfilesData, error: coachProfilesError }] = await Promise.all([
        supabase
          .from('announcements')
          .select('*')
          .eq('status', 'approved')
          .order('created_at', { ascending: false }),
        supabase
          .from('coach_profiles')
          .select('*')
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
      ]);

      if (announcementsError) {
        console.error('Erreur chargement annonces:', announcementsError);
      }

      if (coachProfilesError) {
        console.error('Erreur chargement coachs:', coachProfilesError);
      }

      const dbAnnouncements = (announcementsData || []) as DbAnnouncement[];
      const dbCoaches = (coachProfilesData || []) as DbCoachProfile[];
      const userIds = dbCoaches.map((coach) => coach.user_id).filter(Boolean);

      let profilesById = new Map<string, DbProfile>();

      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id,email,display_name,avatar_url')
          .in('id', userIds);

        if (profilesError) {
          console.error('Erreur chargement profils:', profilesError);
        }

        profilesById = new Map(((profilesData || []) as DbProfile[]).map((profile) => [profile.id, profile]));
      }

      setAds(dbAnnouncements.map(dbAnnouncementToAd));
      setCoaches(dbCoaches.map((coach) => dbCoachToCoachProfile(coach, profilesById.get(coach.user_id))));
    };

    loadPublicData();
    setFavs(loadFavs());
  }, []);

  const publishAd = async (ad: Ad) => {
    const supabase = createClient();
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData.user;
      if (!user) {
        alert('Vous devez être connecté pour publier une annonce.');
        return;
      }

      const uploadedImages = await uploadManyDataUrls(supabase, user.id, ad.images || [], 'announcements/images');
      const rawVideo = typeof ad.data?.videoUrl === 'string' ? ad.data.videoUrl : '';
      const uploadedVideo = rawVideo ? await uploadDataUrl(supabase, user.id, rawVideo, 'announcements/videos') : '';
      const rawDocuments = Array.isArray(ad.data?.documents) ? ad.data.documents.filter((value: unknown): value is string => typeof value === 'string') : [];
      const uploadedDocuments = await uploadManyDataUrls(supabase, user.id, rawDocuments, 'announcements/documents');
      const payloadData = { ...ad.data, images: uploadedImages, videoUrl: uploadedVideo, documents: uploadedDocuments };

      const { error } = await supabase.from('announcements').insert({
        author_user_id: user.id,
        author_type: 'user',
        author_name: ad.author || ad.data?.orgName || null,
        author_email: ad.data?.email || ad.data?.contactEmail || user.email || null,
        author_phone: ad.data?.phone || ad.data?.contactPhone || null,
        category: adTypeToCategory(ad.type),
        title: ad.title,
        description: ad.description || ad.data?.intro || null,
        city: ad.location || ad.data?.city || ad.data?.location || null,
        price_cents: priceToCents(ad.data?.prix || ad.data?.price || ad.data?.tarif),
        image_url: uploadedImages[0] || null,
        images: uploadedImages,
        video_url: uploadedVideo || null,
        payload_data: payloadData,
        status: 'pending',
        views_count: 0,
        contacts_count: 0,
      });
      if (error) throw error;

      setFlow({ kind: 'none' });
      flash('Annonce envoyée ✓ Elle sera publiée après validation.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Erreur création annonce:', message, error);
      alert(`Erreur lors de l'envoi de l'annonce : ${message}`);
    }
  };

  const publishCoach = async (c: CoachProfile) => {
    const supabase = createClient();
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData.user;
      if (!user) {
        alert('Vous devez être connecté pour créer un profil coach.');
        return;
      }

      const photo = c.photo ? await uploadDataUrl(supabase, user.id, c.photo, 'coach/photo') : '';
      const cover = c.cover ? await uploadDataUrl(supabase, user.id, c.cover, 'coach/cover') : '';
      const videoUrl = c.videoUrl ? await uploadDataUrl(supabase, user.id, c.videoUrl, 'coach/video') : '';
      const photos = await uploadManyDataUrls(supabase, user.id, c.photos || [], 'coach/gallery');
      const storedProfile: CoachProfile = { ...c, photo: photo || undefined, cover: cover || undefined, videoUrl: videoUrl || undefined, photos };
      const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim();
      const firstPrice = c.durations?.[0]?.price || '';

      const { error } = await supabase.from('coach_profiles').upsert({
        user_id: user.id,
        slug: safeSlug(fullName),
        city: c.location || c.locationLabel || null,
        bio: c.bio || null,
        speciality: c.jobTitle || 'Coach individuel',
        price_from: priceToCents(firstPrice),
        rating: c.rating || 0,
        status: 'pending',
        profile_data: storedProfile,
        instagram_url: c.instagramUrl || null,
        video_url: videoUrl || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;

      setFlow({ kind: 'none' });
      flash('Profil coach envoyé ✓ Il sera publié après validation.');
    } catch (error: any) {
      const message = error?.message || error?.details || error?.hint || String(error);
      console.error('Erreur création profil coach:', { message, code: error?.code, details: error?.details, hint: error?.hint });
      alert(`Erreur lors de l'envoi du profil coach : ${message}`);
    }
  };
  const confirmBooking = (b: Booking) => { saveBookings([...loadBookings(), b]); setFlow({ kind: 'none' }); flash('Réservation confirmée ✓'); };
  const toggleFav = (id: string) => { const n = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]; setFavs(n); saveFavs(n); };
  const share = (ad: Ad) => { const url = typeof window !== 'undefined' ? window.location.href : ''; if (navigator.share) navigator.share({ title: ad.title, url }).catch(() => {}); else { navigator.clipboard?.writeText(`${ad.title} — ${url}`); flash('Lien copié 📋'); } };
  const reset = () => { setQ(''); setFType(''); setFLevel(''); setFLoc(''); setFContract(''); };

  const fAds = useMemo(() => ads.filter((a) => {
  if ((a.status || "approved") !== "approved") return false;

  if (q && !((a.title + a.author + a.description + a.location).toLowerCase().includes(q.toLowerCase()))) return false;
  if (fType && a.type !== fType) return false;
  if (fLevel && a.level !== fLevel) return false;
  if (fLoc && !a.location.toLowerCase().includes(fLoc.toLowerCase())) return false;
  if (fContract && a.contract !== fContract) return false;

  return true;
}), [ads, q, fType, fLevel, fLoc, fContract]);

const fCoaches = useMemo(() => coaches.filter((c) => {
  if (fType && fType !== 'coach') return false;
  if (fContract) return false;
  if (q && !((coachName(c) + c.bio + c.location).toLowerCase().includes(q.toLowerCase()))) return false;
  if (fLoc && !c.location.toLowerCase().includes(fLoc.toLowerCase())) return false;

  return true;
}), [coaches, q, fType, fLoc, fContract]);

const total = fAds.length + fCoaches.length;

  return (
    <div className="mba-screen">
      <style>{ANNONCES_CSS}</style>

      <section className="annonces-classic-head">
  <div className="section-title-bar">
  <h2>ANNONCES</h2>
</div>

  <p className="annonces-subtitle">
    Consultez les dernières annonces de la communauté : recrutements, stages,
    événements et opportunités.
  </p>

  <div className="annonces-actions">
    <button
      className="mba-btn gold lg"
      onClick={() => setFlow({ kind: "typeSelect" })}
    >
      ＋ Déposer une annonce
    </button>

    <button
      className="mba-btn outline-gold lg"
      onClick={() => setFlow({ kind: "coachWizard" })}
    >
      🎯 Créer mon profil Coach Individuel
    </button>
  </div>
</section>

      <section className="mba-filters">
        <div className="mba-filters-inner">
          <div className="mba-search-wrap"><span>🔍</span><input placeholder="Rechercher (poste, club, ville…)" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select value={fType} onChange={(e) => setFType(e.target.value)}><option value="">Type d’annonce</option>{AD_TYPES.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}<option value="coach">Coach individuel</option></select>
          <select value={fLevel} onChange={(e) => setFLevel(e.target.value)}><option value="">Niveau</option>{LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</select>
          <input className="mba-floc" placeholder="Localisation" value={fLoc} onChange={(e) => setFLoc(e.target.value)} />
          <select value={fContract} onChange={(e) => setFContract(e.target.value)}><option value="">Contrat</option>{CONTRACTS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <button className="mba-btn ghost" onClick={reset}>↺ Réinitialiser</button>
        </div>
      </section>

      <section className="mba-list">
        <div className="mba-list-head"><b>{total}</b> résultat{total > 1 ? 's' : ''}</div>
        {total === 0 ? <div className="mba-empty">Aucune annonce ne correspond.<button className="mba-btn ghost" onClick={reset}>Réinitialiser</button></div> : (
          <div className="mba-grid">
            {fCoaches.map((c) => <CoachCard key={c.id} coach={c} onView={() => setFlow({ kind: 'coachPublic', coach: c })} />)}
            {fAds.map((a) => <AdCard key={a.id} ad={a} fav={favs.includes(a.id)} onFav={() => toggleFav(a.id)} onShare={() => share(a)} onView={() => setFlow({ kind: 'adPublic', ad: a })} />)}
          </div>
        )}
      </section>

      {flow.kind === 'typeSelect' && <TypeSelectModal onClose={() => setFlow({ kind: 'none' })} onContinue={(type) => setFlow({ kind: 'adForm', type })} />}
      {flow.kind === 'adForm' && <AdFormModal type={flow.type} onBack={() => setFlow({ kind: 'typeSelect' })} onClose={() => setFlow({ kind: 'none' })} onSubmit={publishAd} />}
      {flow.kind === 'adPublic' && <AdPublicPage ad={flow.ad} fav={favs.includes(flow.ad.id)} onFav={() => toggleFav(flow.ad.id)} onClose={() => setFlow({ kind: 'none' })} onReserve={() => setFlow({ kind: 'adReserve', ad: flow.ad })} />}
      {flow.kind === 'adReserve' && <AdReserveModal ad={flow.ad} onClose={() => setFlow({ kind: 'adPublic', ad: flow.ad })} onConfirm={confirmBooking} />}
      {flow.kind === 'coachWizard' && <CoachWizard onClose={() => setFlow({ kind: 'none' })} onPublish={publishCoach} />}
      {flow.kind === 'coachPublic' && <CoachPublicModal coach={flow.coach} onClose={() => setFlow({ kind: 'none' })} onReserve={(durationId) => setFlow({ kind: 'reservation', coach: flow.coach, durationId })} />}
      {flow.kind === 'reservation' && <ReservationModal coach={flow.coach} initialDurationId={flow.durationId} onClose={() => setFlow({ kind: 'coachPublic', coach: flow.coach })} onConfirm={confirmBooking} />}

      {toast && <div className="mba-toast">{toast}</div>}
    </div>
  );
}

const ANNONCES_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Roboto:wght@400;500;700;900&display=swap');
.mba-screen{--noir:#0F0F12;--noir-2:#16161b;--or:#E08A2B;--or-l:#F0A94E;--or-d:#B8842C;--blanc:#fff;--gris-bg:#F4F2EE;--gris:#E4DED4;--gris-2:#CFC8BC;--txt-3:#7A7468;--rouge:#E63946;--varsity:'Alfa Slab One',serif;--body:'Roboto',system-ui,sans-serif;font-family:var(--body);color:var(--noir);background:var(--gris-bg);min-height:100vh;-webkit-font-smoothing:antialiased}
.mba-screen *{box-sizing:border-box}.mba-screen img{display:block;max-width:100%}
.mba-btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;border:none;cursor:pointer;font-family:var(--body);font-weight:700;font-size:.88rem;padding:.6rem 1.2rem;border-radius:10px;transition:.16s;white-space:nowrap}
.mba-btn.lg{padding:.85rem 1.6rem}.mba-btn.sm{padding:.4rem .8rem;font-size:.78rem}.mba-btn.block{width:100%}
.mba-btn.gold{background:var(--or);color:#fff}.mba-btn.gold:hover{background:var(--or-l)}
.mba-btn.dark{background:var(--noir);color:#fff}.mba-btn.ghost{background:transparent;border:1.5px solid var(--gris-2);color:var(--noir)}.mba-btn.ghost:hover{border-color:var(--or);color:var(--or-d)}
.mba-btn.outline-gold{background:transparent;border:1.5px solid var(--or);color:var(--noir)}.mba-btn.outline-gold:hover{background:var(--or);color:#fff}
.mba-btn.outline-light{background:transparent;border:1.5px solid rgba(255,255,255,.5);color:#fff}.mba-btn.outline-light:hover{background:rgba(255,255,255,.12)}
.mba-btn:disabled{opacity:.5;cursor:not-allowed}
.mba-stars{color:var(--or);letter-spacing:1px}.mba-stars .off{color:var(--gris-2)}
.mba-rate{display:inline-flex;align-items:center;gap:.35rem;font-size:.85rem}.mba-rate.sm{font-size:.8rem}.mba-rate span{color:var(--txt-3)}

.mba-hero{background:radial-gradient(120% 140% at 80% -20%,rgba(224,138,43,.25),transparent 60%),linear-gradient(135deg,#0F0F12,#241620);color:#fff;border-bottom:3px solid var(--or)}
.mba-hero-inner{max-width:1180px;margin:0 auto;padding:2.6rem 1.2rem;display:flex;align-items:center;justify-content:space-between;gap:1.5rem;flex-wrap:wrap}
.mba-eyebrow{font-size:.72rem;letter-spacing:.22em;color:var(--or);font-weight:700}.mba-hero-text h1{font-family:var(--varsity);font-size:2.6rem;margin:.4rem 0;line-height:1}.mba-hero-text p{opacity:.85;max-width:520px}.mba-hero-cta{display:flex;gap:.7rem;flex-wrap:wrap}

.mba-filters{background:#fff;border-bottom:1px solid var(--gris);position:sticky;top:0;z-index:20}
.mba-filters-inner{max-width:1180px;margin:0 auto;padding:.8rem 1.2rem;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}
.mba-search-wrap{flex:1;min-width:200px;display:flex;align-items:center;gap:.5rem;background:var(--gris-bg);border:1px solid var(--gris);border-radius:10px;padding:.15rem .9rem}
.mba-search-wrap input{flex:1;border:none;background:none;padding:.5rem 0;font-size:.9rem;font-family:inherit;outline:none}
.mba-filters select,.mba-floc{border:1px solid var(--gris);border-radius:8px;padding:.55rem .7rem;font-size:.85rem;background:#fff;font-family:inherit;cursor:pointer}.mba-floc{cursor:text;min-width:130px}

.mba-list{max-width:1180px;margin:0 auto;padding:1.4rem 1.2rem 4rem}.mba-list-head{font-size:.9rem;color:var(--txt-3);margin-bottom:1rem}.mba-list-head b{color:var(--noir);font-size:1.05rem}
.mba-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.1rem}
.mba-empty{background:#fff;border:1px dashed var(--gris-2);border-radius:16px;padding:3rem 1rem;text-align:center;color:var(--txt-3);display:flex;flex-direction:column;align-items:center;gap:1rem}

.mba-card{background:#fff;border:1px solid var(--gris);border-radius:16px;padding:1.1rem;display:flex;flex-direction:column;gap:.6rem;transition:.16s;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.mba-card:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(15,15,18,.12);border-color:var(--or)}.mba-card.coach{background:linear-gradient(180deg,#fff,#fffaf3)}
.mba-card-img{height:150px;border-radius:12px;overflow:hidden;margin:-.2rem -.2rem .2rem}.mba-card-img img{width:100%;height:100%;object-fit:cover}
.mba-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;flex-wrap:wrap}
.mba-badge{display:inline-flex;align-items:center;gap:.35rem;background:var(--noir);color:#fff;font-size:.72rem;font-weight:700;padding:.3rem .7rem;border-radius:8px}.mba-badge.gold{background:var(--or);color:#fff}
.mba-chip-dark{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.3);font-size:.72rem;font-weight:700;padding:.25rem .6rem;border-radius:8px}
.mba-quick{display:flex;gap:.35rem}.mba-qa{width:34px;height:34px;border-radius:50%;border:1px solid var(--gris);background:#fff;cursor:pointer;font-size:1rem;color:var(--noir)}.mba-qa:hover{border-color:var(--or);color:var(--or-d)}.mba-qa.on{background:var(--rouge);color:#fff;border-color:var(--rouge)}.mba-qa.light{background:rgba(255,255,255,.92)}
.mba-card-title{font-size:1.12rem;font-weight:800;line-height:1.2}.mba-card-meta{display:flex;flex-wrap:wrap;gap:.4rem .9rem;font-size:.8rem;color:var(--txt-3)}
.mba-card-desc{font-size:.88rem;color:#3a3a3a;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1}
.mba-coachcard-head{display:flex;align-items:center;gap:.7rem}.mba-coach-photo{border-radius:50%;overflow:hidden;background:var(--noir);color:var(--or);display:flex;align-items:center;justify-content:center;font-family:var(--varsity);flex:0 0 auto;width:56px;height:56px}.mba-coach-photo img{width:100%;height:100%;object-fit:cover}.mba-coach-photo.sm{width:48px;height:48px;font-size:.9rem}

/* overlay/modale */
.mba-overlay{position:fixed;inset:0;background:rgba(8,8,10,.62);backdrop-filter:blur(3px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;animation:mbaIn .15s ease}@keyframes mbaIn{from{opacity:0}to{opacity:1}}
.mba-modal{background:#fff;border-radius:18px;width:560px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5);border-top:4px solid var(--or)}
.mba-modal.lg{width:880px}.mba-modal.full{width:1040px;max-height:96vh;border-top:none}
.mba-mhead{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:1.1rem 1.3rem;border-bottom:1px solid var(--gris)}
.mba-mhead h2{font-family:var(--varsity);font-size:1.25rem;line-height:1.1}.mba-mhead p{color:var(--txt-3);font-size:.85rem;margin-top:.25rem}
.mba-x{background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--txt-3);line-height:1}.mba-x:hover{color:var(--noir)}.mba-x.light{color:#fff}
.mba-back{background:none;border:none;color:var(--or-d);font-weight:700;cursor:pointer;font-size:.9rem;padding:0}.mba-back.light{color:#fff}
.mba-mbody{padding:1.2rem 1.3rem;overflow-y:auto}
.mba-mfoot{display:flex;align-items:center;gap:.6rem;padding:1rem 1.3rem;border-top:1px solid var(--gris);justify-content:flex-end;flex-wrap:wrap;background:#fcfbf9}
.mba-h4{font-family:var(--varsity);font-size:.95rem;margin:1.1rem 0 .5rem}

.mba-type-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.8rem}
.mba-type-card{position:relative;text-align:left;background:#fff;border:1.5px solid var(--gris);border-radius:14px;padding:1rem;cursor:pointer;display:flex;flex-direction:column;gap:.3rem;transition:.16s;font-family:inherit}
.mba-type-card:hover{border-color:var(--or);transform:translateY(-3px);box-shadow:0 12px 30px rgba(224,138,43,.18)}.mba-type-card.sel{border-color:var(--or);background:#fff8ef;box-shadow:0 0 0 3px rgba(224,138,43,.25)}
.mba-type-card .ic{font-size:1.6rem}.mba-type-card .ti{font-weight:800}.mba-type-card .de{font-size:.78rem;color:var(--txt-3);line-height:1.35}
.mba-type-card .check{position:absolute;top:10px;right:10px;width:22px;height:22px;border-radius:50%;background:var(--or);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.75rem;opacity:0;transform:scale(.6);transition:.16s}.mba-type-card.sel .check{opacity:1;transform:scale(1)}

.mba-form-sec{margin-bottom:1.2rem}.mba-sec-title{font-family:var(--varsity);color:var(--or-d);font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.6rem;padding-bottom:.3rem;border-bottom:1px solid var(--gris)}
.mba-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
.mba-field{display:flex;flex-direction:column;gap:.3rem;font-size:.78rem;font-weight:700;color:#444}.mba-field.full{grid-column:1/-1}.mba-field>span{font-size:.74rem;text-transform:uppercase;letter-spacing:.03em}
.mba-field input,.mba-field select,.mba-field textarea{padding:.55rem .7rem;border:1px solid var(--gris-2);border-radius:9px;font-size:.9rem;font-family:inherit;font-weight:400;background:#fff;color:var(--noir)}
.mba-field input:focus,.mba-field select:focus,.mba-field textarea:focus{outline:2px solid var(--or);border-color:transparent}.mba-field textarea{resize:vertical}
.mba-list-ed{display:flex;flex-direction:column;gap:.4rem}.mba-list-row{display:flex;gap:.4rem}.mba-list-row input{flex:1}.mba-inc-row{display:grid;grid-template-columns:1fr 1fr auto;gap:.4rem}
.mba-list-row button,.mba-inc-row button{width:34px;border:1px solid var(--gris-2);background:#fff;border-radius:8px;cursor:pointer}.mba-list-row button:hover,.mba-inc-row button:hover{border-color:var(--rouge);color:var(--rouge)}
.mba-add-mini{align-self:flex-start;background:none;border:1px dashed var(--or);color:var(--or-d);border-radius:8px;padding:.35rem .7rem;cursor:pointer;font-weight:700;font-size:.78rem}
.mba-img-thumbs{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.6rem}.mba-img-thumb{position:relative;width:84px;height:84px;border-radius:10px;overflow:hidden;border:1px solid var(--gris)}.mba-img-thumb img{width:100%;height:100%;object-fit:cover}
.mba-img-thumb .badge{position:absolute;bottom:0;left:0;right:0;background:var(--or);color:#fff;font-size:.6rem;text-align:center;font-weight:700;padding:1px}
.mba-img-thumb button{position:absolute;top:2px;right:2px;width:20px;height:20px;border:none;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;font-size:.7rem}
.mba-repeat{display:flex;flex-direction:column;gap:.8rem}.mba-repeat-row{position:relative;border:1px solid var(--gris);border-radius:12px;padding:.9rem;background:#fcfbf9}.mba-del{position:absolute;top:8px;right:8px;background:#fff;border:1px solid var(--gris);border-radius:7px;width:30px;height:30px;cursor:pointer}.mba-del:hover{border-color:var(--rouge);background:#fde8ea}
.mba-photo-row{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}

.mba-stepper{display:flex;gap:.3rem;padding:.8rem 1.3rem;border-bottom:1px solid var(--gris);overflow-x:auto;background:#fcfbf9}
.mba-step{display:flex;align-items:center;gap:.4rem;font-size:.75rem;color:var(--txt-3);white-space:nowrap;flex:0 0 auto}.mba-step .dot{width:24px;height:24px;border-radius:50%;background:var(--gris);color:#666;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.75rem}
.mba-step.on{color:var(--noir)}.mba-step.on .dot{background:var(--or);color:#fff}.mba-step.done{color:var(--or-d);cursor:pointer}.mba-step.done .dot{background:var(--noir);color:var(--or)}.mba-step:not(:last-child)::after{content:'›';margin-left:.3rem;color:var(--gris-2)}

/* ---- PAGES PUBLIQUES ---- */
.mba-public,.mba-coach2{background:var(--gris-bg)}
.mba-pub-topbar{display:flex;align-items:center;justify-content:space-between;padding:.9rem 1.4rem}.mba-pub-topbar.dark{background:var(--noir)}
.mba-pub-hero{background:var(--noir);color:#fff;padding:0 1.4rem 1.8rem}.mba-pub-hero .mba-pub-topbar{padding:.9rem 0}
.mba-pub-hero-grid,.mba-c2-grid{display:grid;grid-template-columns:1.05fr 1.25fr .9fr;gap:1.4rem}
.mba-pub-media,.mba-c2-photo{position:relative;border-radius:16px;overflow:hidden;background:#222}
.abs-tl{position:absolute;top:12px;left:12px;z-index:3}.abs-tl2{position:absolute;top:12px;left:120px;z-index:3}.abs-tr{position:absolute;top:12px;right:12px;z-index:3}
.mba-gal-main{aspect-ratio:4/3.4;background:#1a1a1f}.mba-gal-main img{width:100%;height:100%;object-fit:cover}.mba-gal-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:3rem;opacity:.4}
.mba-gal-thumbs{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:6px;background:#15151a}.mba-gal-thumbs button{border:2px solid transparent;border-radius:8px;overflow:hidden;cursor:pointer;aspect-ratio:1;padding:0;background:none}.mba-gal-thumbs button.on{border-color:var(--or)}.mba-gal-thumbs img{width:100%;height:100%;object-fit:cover}.mba-gal-more{display:flex;align-items:center;justify-content:center;background:#2a2a30;border-radius:8px;font-weight:800;font-size:.85rem}
.mba-pub-title{font-family:var(--varsity);font-size:2.2rem;line-height:1.05}.mba-pub-title .accent{color:var(--or)}
.mba-pub-meta{display:flex;gap:1.2rem;font-size:.9rem;color:#cbb89a;margin:.6rem 0}.mba-pub-meta.light{color:#cbb89a}
.mba-pub-intro{font-size:.95rem;opacity:.9;line-height:1.55}
.mba-pillars{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin:1.1rem 0;border-top:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12);padding:1rem 0}
.mba-pillar{display:flex;flex-direction:column;align-items:center;gap:.3rem;text-align:center;font-size:.72rem;font-weight:700}.mba-pillar .ic{font-size:1.3rem;color:var(--or)}
.mba-pub-about h3{font-family:var(--varsity);font-size:1.05rem;color:var(--or);margin:.6rem 0}.mba-pub-about p{font-size:.9rem;opacity:.9;line-height:1.5;margin-bottom:.5rem}
.mba-check{display:flex;flex-direction:column;gap:.4rem}.mba-check li{position:relative;padding-left:1.5rem;font-size:.9rem}.mba-check li::before{content:'✔';position:absolute;left:0;color:var(--or);font-weight:700}
.mba-pub-cta{display:flex;gap:.7rem;margin-top:1.1rem;flex-wrap:wrap}
.mba-side-card{background:#1b1b21;border:1px solid #2a2a32;border-radius:14px;padding:1.1rem;margin-bottom:1rem}.mba-side-card h4{font-family:var(--varsity);font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;color:#fff;margin-bottom:.7rem}.mba-side-card h4.gold{color:var(--or)}
.mba-side-card dl{display:flex;flex-direction:column}.mba-side-card dl>div{display:flex;justify-content:space-between;gap:1rem;padding:.5rem 0;border-bottom:1px solid #2a2a32;font-size:.82rem}.mba-side-card dl>div:last-child{border-bottom:none}
.mba-side-card dt{color:#9a9388;text-transform:uppercase;font-size:.68rem;letter-spacing:.03em;font-weight:700}.mba-side-card dd{color:#fff;text-align:right;font-weight:600}
.mba-org{display:flex;gap:.7rem;align-items:center;color:#fff}.mba-org-logo{width:46px;height:46px;border-radius:50%;background:var(--or);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--varsity);font-size:.8rem;flex:0 0 auto}.mba-muted.sm{color:#9a9388;font-size:.75rem}
.mba-dur-pick{display:flex;gap:.4rem}.mba-dur-pick.wide{flex-wrap:wrap}.mba-dur-pick button{flex:1;padding:.55rem;border:1px solid #2a2a32;background:#26262e;color:#fff;border-radius:8px;cursor:pointer;font-weight:700;font-size:.82rem}.mba-dur-pick button.on{background:var(--or);border-color:var(--or)}
.mba-dur-tarif{display:flex;justify-content:space-between;align-items:center;color:#fff;margin:.8rem 0}.mba-dur-tarif b{font-family:var(--varsity);font-size:1.3rem}
.mba-map-card{border-radius:12px;overflow:hidden;border:1px solid #2a2a32}.mba-map{height:120px;background:linear-gradient(135deg,#3a3a42,#26262e);position:relative}.mba-map .pin{position:absolute;top:50%;left:50%;transform:translate(-50%,-60%);font-size:1.6rem}
.mba-map-foot{padding:.7rem;color:#fff;font-size:.8rem;background:#1b1b21}.mba-map-foot span{display:block;color:#9a9388;font-size:.72rem}
.mba-mat{display:flex;flex-direction:column;gap:.4rem;color:#fff;font-size:.82rem}
.mba-c2-photo .ph{width:100%;aspect-ratio:4/4.3;display:flex;align-items:center;justify-content:center;font-family:var(--varsity);font-size:2.4rem;color:var(--or);background:#1a1a1f}.mba-c2-photo img{width:100%;aspect-ratio:4/4.3;object-fit:cover}
.mba-c2-stats{position:absolute;bottom:0;left:0;right:0;display:grid;grid-template-columns:repeat(3,1fr);background:rgba(15,15,18,.85);backdrop-filter:blur(4px)}.mba-c2-stats>div{padding:.7rem;text-align:center;color:#fff;border-right:1px solid rgba(255,255,255,.1)}.mba-c2-stats>div:last-child{border-right:none}.mba-c2-stats b{display:block;font-family:var(--varsity);font-size:1.1rem;color:var(--or)}.mba-c2-stats span{font-size:.68rem;opacity:.8}
.mba-c2-main h1{font-family:var(--varsity);font-size:2.1rem;line-height:1}.mba-c2-sub{color:#cbb89a;font-weight:600;margin:.2rem 0 .3rem}
.mba-tags{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:1rem}.mba-tags span{border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:.3rem .7rem;font-size:.75rem;font-weight:600}.mba-tags .more{background:var(--or);border-color:var(--or)}
.mba-c2-hero{background:var(--noir);color:#fff;padding:1.4rem;background-size:cover;background-position:center}

.mba-pub-body{padding:1.6rem 1.4rem;display:flex;flex-direction:column;gap:1.2rem}
.mba-pub-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.1rem}.mba-pub-row2{display:grid;grid-template-columns:1fr 1fr;gap:1.1rem}
.mba-panel{background:#fff;border:1px solid var(--gris);border-radius:14px;padding:1.2rem}.mba-panel h3{font-family:var(--varsity);font-size:1.05rem;margin-bottom:.8rem;display:flex;align-items:center}
.mba-inc-grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}.mba-inc{display:flex;gap:.6rem;align-items:flex-start}.mba-inc .ic{color:var(--or);font-weight:700}.mba-inc b{display:block;font-size:.9rem}.mba-inc span{font-size:.78rem;color:var(--txt-3)}
.mba-prog{display:flex;flex-direction:column;gap:.5rem}.mba-prog li{display:flex;gap:.5rem;align-items:center;font-size:.88rem}.mba-prog .ic{color:var(--or)}
.mba-quote-card{background:linear-gradient(135deg,#2a1a12,#0F0F12);border-radius:14px;padding:1.4rem;color:#fff;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}.mba-quote-card .q{font-family:var(--varsity);font-size:3rem;color:var(--or);line-height:.5}.mba-quote-card .qt{font-family:var(--varsity);font-size:1.2rem;margin-top:.6rem}.mba-quote-card .qt div{line-height:1.2}
.mba-para{font-size:.9rem;line-height:1.55;color:#333;margin-bottom:.6rem}
.mba-video-card{background:linear-gradient(135deg,#264,#0F0F12);border-radius:14px;min-height:220px;position:relative;display:flex;align-items:center;justify-content:center}.mba-video-card .play{width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;font-size:1.3rem;color:var(--noir)}
.mba-video-chips{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-around;gap:.5rem;background:rgba(15,15,18,.7);color:#fff;font-size:.72rem;padding:.6rem;flex-wrap:wrap}
.mba-flow{display:flex;gap:.8rem;padding:.6rem 0;border-bottom:1px dashed var(--gris)}.mba-flow:last-child{border-bottom:none}.mba-flow .n{width:28px;height:28px;border-radius:50%;background:var(--or);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;flex:0 0 auto}.mba-flow b{font-size:.9rem}.mba-flow p{font-size:.8rem;color:var(--txt-3);margin-top:.15rem}
.mba-offer{display:flex;gap:.7rem;padding:.55rem 0;border-bottom:1px dashed var(--gris)}.mba-offer:last-child{border-bottom:none}.mba-offer .ic{color:var(--or);font-size:1.1rem}.mba-offer b{font-size:.9rem}.mba-offer p{font-size:.8rem;color:var(--txt-3)}
.mba-reviews{display:flex;flex-direction:column;gap:.7rem}.mba-rev{border:1px solid var(--gris);border-radius:10px;padding:.7rem}.mba-rev .h{display:flex;justify-content:space-between;font-size:.85rem}.mba-rev .h span{color:var(--txt-3)}.mba-rev p{font-size:.82rem;color:#444;margin-top:.3rem;font-style:italic}
.mba-ph-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem}.mba-ph-grid img{aspect-ratio:1;object-fit:cover;border-radius:8px}
.mba-feature-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;background:var(--noir);color:#fff;border-radius:14px;padding:1.2rem}.mba-feature-strip b{display:block;color:var(--or);font-size:.85rem;margin-bottom:.2rem}.mba-feature-strip span{font-size:.78rem;opacity:.8}
.mba-pub-sticky{position:sticky;bottom:0;display:flex;align-items:center;gap:1.5rem;background:var(--noir);color:#fff;padding:.9rem 1.4rem;border-top:2px solid var(--or)}.mba-pub-sticky .it{display:flex;flex-direction:column}.mba-pub-sticky .it b{font-size:.85rem}.mba-pub-sticky .it span{font-size:.72rem;opacity:.75}.mba-pub-sticky .mba-btn{margin-left:auto}

.mba-cal{border:1px solid var(--gris);border-radius:12px;padding:.7rem;background:#fff;max-width:340px}.mba-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;font-weight:700;text-transform:capitalize}.mba-cal-head button{width:30px;height:30px;border:1px solid var(--gris);background:#fff;border-radius:8px;cursor:pointer}
.mba-cal-dow,.mba-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.mba-cal-dow span{text-align:center;font-size:.7rem;color:var(--txt-3);font-weight:700}.mba-cal-grid button{aspect-ratio:1;border:1px solid transparent;border-radius:8px;background:var(--gris-bg);cursor:pointer;font-size:.82rem;font-weight:600}.mba-cal-grid button:hover:not(:disabled){border-color:var(--or)}.mba-cal-grid button:disabled{opacity:.3;cursor:not-allowed}.mba-cal-grid button.sel{background:var(--or);color:#fff}
.mba-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:.4rem}.mba-slots button{border:1.5px solid var(--gris);border-radius:8px;padding:.4rem;background:#fff;cursor:pointer;font-weight:600;font-size:.82rem}.mba-slots button.sel{background:var(--noir);color:#fff;border-color:var(--noir)}
.mba-pay{border:1px solid var(--gris);border-radius:12px;overflow:hidden}.mba-pay-sum{display:flex;align-items:center;justify-content:space-between;padding:.8rem 1rem;background:#fff8ef}.mba-pay-sum b{font-family:var(--varsity);font-size:1.2rem}.mba-pay-note{padding:.7rem 1rem;font-size:.8rem;color:var(--txt-3);border-top:1px dashed var(--gris)}

.mba-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--noir);color:#fff;padding:.7rem 1.2rem;border-radius:999px;font-weight:600;font-size:.88rem;z-index:2000;box-shadow:0 10px 30px rgba(0,0,0,.35)}

@media (max-width:480px){
  .mba-grid{grid-template-columns:1fr}
  .mba-type-grid{grid-template-columns:1fr}
  .mba-pillars{grid-template-columns:1fr 1fr}
  .mba-inc-grid,.mba-ph-grid{grid-template-columns:1fr 1fr}
  .mba-hero-cta .mba-btn{flex:1}
}

.annonces-classic-head{
  background:#fff;
  padding:3rem 1.2rem 2rem;
  text-align:center;
}

.annonces-subtitle{
  margin:0 auto;
  max-width:760px;
  color:#555;
  font-size:1rem;
  line-height:1.5;
}

.annonces-actions{
  margin-top:1.6rem;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:.8rem;
  flex-wrap:wrap;
}

.annonce-card{
  overflow:hidden;
  padding:0;
}

.annonce-visual{
  position:relative;
  height:210px;
  background:#0F0F12;
  overflow:hidden;
}

.annonce-visual img{
  width:100%;
  height:100%;
  object-fit:cover;
}

.annonce-placeholder{
  width:100%;
  height:100%;
  display:flex;
  align-items:center;
  justify-content:center;
  background:linear-gradient(135deg,#0F0F12,#2b1820);
  color:#E08A2B;
  font-size:3rem;
}

.annonce-badge{
  position:absolute;
  top:12px;
  left:12px;
  z-index:2;
}

.annonce-quick{
  position:absolute;
  top:12px;
  right:12px;
  z-index:2;
}

.annonce-card-body{
  padding:1rem;
}

.coach-visual{
  height:230px;
}

.coach-visual img{
  object-position:top center;
}

.coach-available{
  position:absolute;
  bottom:12px;
  left:12px;
  background:#0F0F12;
  color:#fff;
  border-radius:999px;
  padding:.35rem .7rem;
  font-size:.75rem;
  font-weight:900;
}

  .annonce-visual,
  .coach-visual{
    height:190px;
  }
}
/* Bloc 6 — formulaires annonces / coach */
.mba-mhead h2{font-family:var(--font-roboto),Roboto,Arial,sans-serif!important;font-weight:900!important;letter-spacing:-.02em}.mba-type-card .ti{font-family:var(--font-roboto),Roboto,Arial,sans-serif!important;font-weight:900!important}.mba-form-grid textarea{resize:vertical;min-height:120px}.mba-form-grid textarea[name="program"]{min-height:220px}.mba-availability-row{grid-template-columns:minmax(150px,1fr) 150px 150px!important}.mba-day-check{display:flex;align-items:center;gap:10px;font-weight:800}.mba-field.full textarea{width:100%}

.mba-video-editor{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px}.mba-video-editor small{grid-column:1/-1;color:var(--txt-3)}.mba-values-text{display:grid;gap:8px}.mba-values-text p{margin:0;line-height:1.65}.mba-instagram-link{display:inline-flex;margin-top:14px;color:var(--or);font-weight:800;text-decoration:none}.mba-availability-row{display:grid!important;grid-template-columns:minmax(130px,1fr) minmax(120px,160px) minmax(120px,160px);gap:12px;align-items:center}.mba-availability-row input[type=time]{width:100%;min-width:0}@media(max-width:700px){.mba-video-editor{grid-template-columns:1fr}.mba-video-editor span{display:none}.mba-availability-row{grid-template-columns:1fr 1fr}.mba-day-check{grid-column:1/-1}}
`;
