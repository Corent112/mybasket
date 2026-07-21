import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

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
  return status === "inactive" ? "Brouillon" : "Publié";
}

function statusClass(status: string | null) {
  return status === "inactive" ? styles.inactive : styles.active;
}

async function uploadSliderImage(supabase: any, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return null;

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `home/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("slider-images")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });

  if (error) throw new Error(error.message);
  return supabase.storage.from("slider-images").getPublicUrl(path).data.publicUrl;
}

async function createSlideAction(formData: FormData) {
  "use server";
  const { supabase } = await requireAdmin();

  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const uploadedUrl = await uploadSliderImage(supabase, formData.get("image_file"));
  const imageUrl = uploadedUrl || String(formData.get("image_url") || "").trim() || null;

  const { error } = await supabase.from("admin_slider").insert({
    title,
    subtitle: String(formData.get("subtitle") || "").trim() || null,
    image_url: imageUrl,
    button_label: String(formData.get("button_label") || "").trim() || null,
    button_href: String(formData.get("button_href") || "").trim() || null,
    placement: "home",
    status: formData.get("publish_now") === "on" ? "active" : "inactive",
    sort_order: Number(formData.get("sort_order") || 0),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Création slide impossible : ${error.message}`);
  revalidatePath("/admin/slider");
  revalidatePath("/");
}

async function updateSlideAction(formData: FormData) {
  "use server";
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const uploadedUrl = await uploadSliderImage(supabase, formData.get("image_file"));
  const existingUrl = String(formData.get("existing_image_url") || "").trim() || null;
  const typedUrl = String(formData.get("image_url") || "").trim() || null;

  const { error } = await supabase
    .from("admin_slider")
    .update({
      title: String(formData.get("title") || "").trim(),
      subtitle: String(formData.get("subtitle") || "").trim() || null,
      image_url: uploadedUrl || typedUrl || existingUrl,
      button_label: String(formData.get("button_label") || "").trim() || null,
      button_href: String(formData.get("button_href") || "").trim() || null,
      sort_order: Number(formData.get("sort_order") || 0),
      status: formData.get("published") === "on" ? "active" : "inactive",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`Modification slide impossible : ${error.message}`);
  revalidatePath("/admin/slider");
  revalidatePath("/");
}

async function deleteSlideAction(formData: FormData) {
  "use server";
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const { error } = await supabase.from("admin_slider").delete().eq("id", id);
  if (error) throw new Error(`Suppression slide impossible : ${error.message}`);
  revalidatePath("/admin/slider");
  revalidatePath("/");
}

export default async function AdminSliderPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("admin_slider")
    .select("*")
    .eq("placement", "home")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const slides = error ? [] : ((data || []) as SliderItem[]);
  const active = slides.filter((slide) => slide.status !== "inactive").length;

  return (
    <main className={styles.adminSlider}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>← Retour Dashboard CEO</Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Slider accueil</h1>
            <span>Choisis l’image, le texte, le lien, l’ordre et le statut de publication de chaque slide.</span>
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
          <form action={createSlideAction} className={styles.form} encType="multipart/form-data">
            <input name="title" placeholder="Titre" required />
            <input name="subtitle" placeholder="Texte / sous-titre" />
            <input name="image_url" placeholder="URL de l’image (facultatif)" />
            <input name="image_file" type="file" accept="image/png,image/jpeg,image/webp" />
            <input name="button_label" placeholder="Texte du bouton" />
            <input name="button_href" placeholder="Lien : /abonnements" />
            <input name="sort_order" type="number" defaultValue={0} placeholder="Ordre" />
            <label><input name="publish_now" type="checkbox" defaultChecked /> Publier immédiatement</label>
            <button type="submit">Créer la slide</button>
          </form>
        </section>

        <section className={styles.slidesGrid}>
          {slides.map((slide) => (
            <article key={slide.id} className={styles.slideCard}>
              <div className={styles.preview}>
                {slide.image_url ? <img src={slide.image_url} alt="" /> : <div className={styles.noImage}>Image</div>}
                <span className={`${styles.statusBadge} ${statusClass(slide.status)}`}>{statusLabel(slide.status)}</span>
              </div>
              <div className={styles.slideBody}>
                <form action={updateSlideAction} className={styles.form} encType="multipart/form-data">
                  <input type="hidden" name="id" value={slide.id} />
                  <input type="hidden" name="existing_image_url" value={slide.image_url || ""} />
                  <input name="title" defaultValue={slide.title || ""} placeholder="Titre" required />
                  <input name="subtitle" defaultValue={slide.subtitle || ""} placeholder="Texte" />
                  <input name="image_url" placeholder="Nouvelle URL image" />
                  <input name="image_file" type="file" accept="image/png,image/jpeg,image/webp" />
                  <input name="button_label" defaultValue={slide.button_label || ""} placeholder="Texte bouton" />
                  <input name="button_href" defaultValue={slide.button_href || ""} placeholder="Lien" />
                  <input name="sort_order" type="number" defaultValue={slide.sort_order ?? 0} />
                  <label><input name="published" type="checkbox" defaultChecked={slide.status !== "inactive"} /> Publiée</label>
                  <button type="submit">Enregistrer</button>
                </form>
                <form action={deleteSlideAction} className={styles.actions}>
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
