import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/guard';
import { SLIDER_SETTINGS_ID, orderSlides, type SliderRow } from '@/lib/home/slider';
import SliderStudio from './SliderStudio';
import SliderInitializer from './SliderInitializer';
import styles from './page.module.css';

export default async function AdminSliderPage({ searchParams }: { searchParams: Promise<{ slide?: string }> }) {
  const { supabase } = await requireAdmin();
  const query = await searchParams;
  const [slidesResult, marker] = await Promise.all([
    supabase.from('admin_slider').select('id,title,subtitle,image_url,button_label,button_href,placement,status,sort_order').in('placement', ['home', 'global']).neq('id', SLIDER_SETTINGS_ID).order('sort_order', { ascending: true }),
    supabase.from('admin_slider').select('id').eq('id', SLIDER_SETTINGS_ID).maybeSingle(),
  ]);
  const { data, error } = slidesResult;

  return <main className={styles.adminSlider}><div className={styles.container}>
    <Link href="/admin" className={styles.backLink}>← Retour Dashboard CEO</Link>
    <section className={styles.hero}><div><p>Administration MyBasket</p><h1>Studio du slider</h1><span>Ton image, ton message, ton aperçu. Prépare une slide, puis ajoute-la ou remplace celle de ton choix sur l’accueil.</span></div><a href="/" target="_blank" rel="noreferrer" className={styles.homeLink}>Voir l’accueil ↗</a></section>
    {error || marker.error ? <p role="alert" className={styles.alert}>Impossible de charger les slides. Recharge la page avant de modifier le slider.</p> : !marker.data ? <SliderInitializer /> : <SliderStudio slides={orderSlides((data || []) as SliderRow[])} initialId={query.slide} />}
  </div></main>;
}
