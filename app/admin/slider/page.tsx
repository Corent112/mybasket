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
  return status === "inactive" ? "Inactif" : "Actif";
}

function statusClass(status: string | null) {
  return status === "inactive" ? styles.inactive : styles.active;
}

async function createSlideAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const title = String(formData.get("title") || "").trim();
  const subtitle = String(formData.get("subtitle") || "").trim();
  const imageUrl = String(formData.get("image_url") || "").trim();
  const buttonLabel = String(formData.get("button_label") || "").trim();
  const buttonHref = String(formData.get("button_href") || "").trim();
  const placement = String(formData.get("placement") || "home");
  const sortOrder = Number(formData.get("sort_order") || 0);

  if (!title) return;

  await supabase.from("admin_slider").insert({
    title,
    subtitle: subtitle || null,
    image_url: imageUrl || null,
    button_label: buttonLabel || null,
    button_href: buttonHref || null,
    placement,
    status: "active",
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/admin/slider");
  revalidatePath("/");
}

async function toggleSlideAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "inactive");

  if (!id) return;

  await supabase
    .from("admin_slider")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/slider");
  revalidatePath("/");
}

async function deleteSlideAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  await supabase.from("admin_slider").delete().eq("id", id);

  revalidatePath("/admin/slider");
  revalidatePath("/");
}

export default async function AdminSliderPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("admin_slider")
    .select("*")
    .order("placement", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const slides = (data || []) as SliderItem[];

  const active = slides.filter((slide) => slide.status !== "inactive").length;
  const home = slides.filter((slide) => slide.placement === "home").length;
  const inactive = slides.filter((slide) => slide.status === "inactive").length;

  return (
    <main className={styles.adminSlider}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Slider</h1>
            <span>
              Modifie les images, textes, boutons et slides visibles sur la page
              d’accueil.
            </span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{slides.length}</strong>
            <span>Total slides</span>
          </div>

          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{active}</strong>
            <span>Actifs</span>
          </div>

          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{home}</strong>
            <span>Accueil</span>
          </div>

          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{inactive}</strong>
            <span>Inactifs</span>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Créer une slide</h2>
            <span>
              Pour l’instant, colle une URL d’image. Ensuite on pourra brancher
              l’upload Supabase Storage.
            </span>
          </div>

          <form action={createSlideAction} className={styles.form}>
            <input name="title" placeholder="Titre de la slide" required />
            <input name="subtitle" placeholder="Sous-titre" />
            <input name="image_url" placeholder="URL de l’image" />
            <input name="button_label" placeholder="Texte du bouton" />
            <input name="button_href" placeholder="/abonnements" />

            <select name="placement" defaultValue="home">
              <option value="home">Accueil</option>
              <option value="abonnements">Abonnements</option>
              <option value="bibliotheque">Bibliothèque</option>
              <option value="global">Global</option>
            </select>

            <input
              name="sort_order"
              type="number"
              defaultValue={0}
              placeholder="Ordre"
            />

            <button type="submit">Créer la slide</button>
          </form>
        </section>

        <section className={styles.slidesGrid}>
          {slides.map((slide) => {
            const nextStatus =
              slide.status === "inactive" ? "active" : "inactive";

            return (
              <article key={slide.id} className={styles.slideCard}>
                <div className={styles.preview}>
                  {slide.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slide.image_url} alt="" />
                  ) : (
                    <div className={styles.noImage}>Image</div>
                  )}

                  <span
                    className={`${styles.statusBadge} ${statusClass(
                      slide.status
                    )}`}
                  >
                    {statusLabel(slide.status)}
                  </span>
                </div>

                <div className={styles.slideBody}>
                  <p className={styles.placement}>
                    {slide.placement || "home"} · ordre {slide.sort_order ?? 0}
                  </p>

                  <h2>{slide.title || "Slide sans titre"}</h2>

                  {slide.subtitle && <p className={styles.subtitle}>{slide.subtitle}</p>}

                  {(slide.button_label || slide.button_href) && (
                    <p className={styles.buttonInfo}>
                      Bouton : {slide.button_label || "—"} →{" "}
                      {slide.button_href || "—"}
                    </p>
                  )}

                  <div className={styles.actions}>
                    <Link href={`/admin/slider/${slide.id}`}>Modifier</Link>

                    <form action={toggleSlideAction}>
                      <input type="hidden" name="id" value={slide.id} />
                      <input type="hidden" name="status" value={nextStatus} />
                      <button type="submit">
                        {slide.status === "inactive" ? "Activer" : "Désactiver"}
                      </button>
                    </form>

                    <form action={deleteSlideAction}>
                      <input type="hidden" name="id" value={slide.id} />
                      <button type="submit" className={styles.dangerBtn}>
                        Supprimer
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}

          {slides.length === 0 && (
            <div className={styles.emptyState}>
              Aucune slide créée pour le moment.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}