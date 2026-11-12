import Link from "next/link";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { deleteSlide } from "./actions";
import { SliderForm } from "./SliderForm";

type SliderItem = {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  button_label: string | null;
  button_href: string | null;
  placement: string | null;
  status: string | null;
  sort_order: number | null;
  created_at: string | null;
};

function statusLabel(status: string | null) {
  return status === "active" ? "Publié" : "Brouillon";
}

function statusClass(status: string | null) {
  return status === "active" ? styles.active : styles.inactive;
}

export default async function AdminSliderPage({ searchParams }: { searchParams: Promise<{error?:string;saved?:string}> }) {
  await requireAdmin();
  const status = await searchParams;
  const db = createAdminClient();
  const { data, error } = await db?.from("admin_slider").select("*")
    .in("placement", ["home", "global"]).order("sort_order").order("created_at") ?? {};

  const slides = error ? [] : ((data || []) as SliderItem[]);
  const active = slides.filter((slide) => slide.status === "active").length;

  return (
    <main className={styles.adminSlider}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>← Retour Dashboard CEO</Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Slider accueil</h1>
            <span>Gère ici le slider affiché sur la page d’accueil, directement sous le bandeau noir : image, texte, lien, ordre et publication.</span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}><strong>{slides.length}</strong><span>Total</span></div>
          <div className={`${styles.statCard} ${styles.green}`}><strong>{active}</strong><span>Publiées</span></div>
          <div className={`${styles.statCard} ${styles.red}`}><strong>{slides.length - active}</strong><span>Brouillons</span></div>
          <div className={`${styles.statCard} ${styles.gold}`}><strong>{slides.length ? Math.max(...slides.map(s => s.sort_order ?? 0)) : 0}</strong><span>Dernier ordre</span></div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Créer une slide</h2>
            <span>L’image peut être téléversée ou fournie par URL.</span>
          </div>
          {status.saved && <p role="status">Slide enregistrée.</p>}
          {(!db || error || status.error) && <p role="alert">Impossible de lire ou d’enregistrer la slide. Vérifie les champs, le lien HTTPS et le format de l’image.</p>}
          <SliderForm />
        </section>

        <section className={styles.slidesGrid}>
          {slides.map((slide) => (
            <article key={slide.id} className={styles.slideCard}>
              <div className={styles.preview}>
                {slide.image_url ? <img src={slide.image_url} alt="" /> : <div className={styles.noImage}>Image</div>}
                <span className={`${styles.statusBadge} ${statusClass(slide.status)}`}>{statusLabel(slide.status)}</span>
              </div>
              <div className={styles.slideBody}>
                <h3>{slide.title}</h3>
                <Link href={`/admin/slider/${slide.id}`}>Modifier l’image, le texte ou le bouton</Link>
                <form action={deleteSlide} className={styles.actions}>
                  <input type="hidden" name="id" value={slide.id} />
                  <button type="submit" className={styles.dangerBtn}>Supprimer</button>
                </form>
              </div>
            </article>
          ))}
          {!slides.length && <div className={styles.emptyState}>Aucune slide créée.</div>}
        </section>
      </div>
    </main>
  );
}
