import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { safeSliderUrl } from "@/lib/home-slider-url";
import styles from "../page.module.css";
import { SliderForm } from "../SliderForm";

export default async function EditSlidePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{error?:string;saved?:string}>;
}) {
  await requireAdmin();
  const [{ id }, status] = await Promise.all([params, searchParams]);
  const db = createAdminClient();
  const result = await db?.from("admin_slider").select("*").eq("id", id).maybeSingle();
  if (!result || result.error) return <p role="alert">Le slider est indisponible.</p>;
  if (!result.data) notFound();
  const slide = result.data;
  const image = safeSliderUrl(slide.image_url);

  return <main className={styles.adminSlider}><div className={styles.container}>
    <Link href="/admin/slider" className={styles.backLink}>← Retour au slider</Link>
    <section className={styles.hero}><div><h1>Modifier la slide</h1></div></section>
    <section className={styles.card}>
      {status.saved && <p role="status">Modifications enregistrées.</p>}
      {status.error && <p role="alert">Impossible d’enregistrer. Vérifie les champs, le lien HTTPS et le format de l’image.</p>}
      {image && <img src={image} alt="Image actuelle" style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain" }} />}
      <SliderForm key={slide.updated_at} slide={slide} />
    </section>
  </div></main>;
}
