import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import styles from "../page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

async function updateSlideAction(formData: FormData) {
  "use server";
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  let imageUrl = String(formData.get("current_image_url") || "").trim() || null;
  const file = formData.get("image_file") as File | null;
  if (file && file.size > 0) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `home/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("slider-images").upload(path, await file.arrayBuffer(), { contentType: file.type });
    if (error) throw new Error(error.message);
    imageUrl = supabase.storage.from("slider-images").getPublicUrl(path).data.publicUrl;
  } else {
    imageUrl = String(formData.get("image_url") || "").trim() || imageUrl;
  }
  const { error } = await supabase.from("admin_slider").update({
    title: String(formData.get("title") || "").trim(),
    subtitle: String(formData.get("subtitle") || "").trim() || null,
    image_url: imageUrl,
    button_label: String(formData.get("button_label") || "").trim() || null,
    button_href: String(formData.get("button_href") || "").trim() || null,
    placement: String(formData.get("placement") || "home"),
    sort_order: Number(formData.get("sort_order") || 0),
    status: formData.get("published") === "on" ? "active" : "inactive",
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/slider");
  revalidatePath(`/admin/slider/${id}`);
  revalidatePath("/");
}

export default async function EditSlidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("admin_slider").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <main className={styles.adminSlider}><div className={styles.container}>
    <Link href="/admin/slider" className={styles.backLink}>← Retour au slider</Link>
    <section className={styles.hero}><div><p>Administration MyBasket</p><h1>Modifier la slide</h1><span>Les changements publiés sont répercutés sur l’accueil.</span></div></section>
    <section className={styles.card}><form action={updateSlideAction} className={styles.form} encType="multipart/form-data">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="current_image_url" value={data.image_url || ""} />
      <input name="title" defaultValue={data.title || ""} required />
      <input name="subtitle" defaultValue={data.subtitle || ""} />
      <input name="image_file" type="file" accept="image/png,image/jpeg,image/webp" />
      <input name="image_url" defaultValue={data.image_url || ""} />
      <input name="button_label" defaultValue={data.button_label || ""} />
      <input name="button_href" defaultValue={data.button_href || ""} />
      <select name="placement" defaultValue={data.placement || "home"}><option value="home">Accueil</option><option value="global">Global</option></select>
      <input name="sort_order" type="number" defaultValue={data.sort_order || 0} />
      <label><input name="published" type="checkbox" defaultChecked={data.status === "active"} /> Publiée</label>
      <button type="submit">Enregistrer les modifications</button>
    </form></section>
  </div></main>;
}
