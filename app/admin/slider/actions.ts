"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { safeSliderUrl } from "@/lib/home-slider-url";

export async function saveSlide(form: FormData) {
  await requireAdmin();
  const db = createAdminClient();
  const read = (key: string) => String(form.get(key) || "").trim();
  const id = read("id");
  const returnPath = id && /^[a-f\d-]{36}$/i.test(id) ? `/admin/slider/${id}` : "/admin/slider";
  const title = read("title");
  const buttonLabel = read("button_label");
  const buttonHref = safeSliderUrl(read("button_href"));
  const typedImage = read("image_url");
  const sortOrder = Number(read("sort_order") || 0);
  const file = form.get("image_file");
  let image = safeSliderUrl(typedImage);
  let uploadedPath: string | null = null;

  if (!db) redirect(`${returnPath}?error=database`);
  if (!title || Boolean(buttonLabel) !== Boolean(buttonHref) || (read("button_href") && !buttonHref) ||
      (typedImage && !image) || !Number.isInteger(sortOrder) || Math.abs(sortOrder) > 100000) {
    redirect(`${returnPath}?error=fields`);
  }

  if (file instanceof File && file.size > 0) {
    if (file.size > 3 * 1024 * 1024) redirect(`${returnPath}?error=image`);
    let buffer: Buffer;
    try {
      const input = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 24_000_000 });
      const metadata = await input.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Format d’image invalide");
      buffer = await input.rotate().resize({ width: 1920, height: 1080, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    } catch {
      redirect(`${returnPath}?error=image`);
    }
    uploadedPath = `home/${crypto.randomUUID()}.webp`;
    const storage = db.storage.from("slider-images");
    const { error } = await storage.upload(uploadedPath, buffer, { contentType: "image/webp" });
    if (error) redirect(`${returnPath}?error=storage`);
    image = storage.getPublicUrl(uploadedPath).data.publicUrl;
  }

  const values = {
    title, subtitle: read("subtitle") || null, image_url: image,
    button_label: buttonLabel || null, button_href: buttonHref,
    placement: read("placement") === "global" ? "global" : "home",
    status: form.has("published") ? "active" : "inactive",
    sort_order: sortOrder, updated_at: new Date().toISOString(),
  };
  const { data, error } = await (id
    ? db.from("admin_slider").update(values).eq("id", id).select("id").maybeSingle()
    : db.from("admin_slider").insert(values).select("id").single());
  if (error || !data) {
    if (uploadedPath) await db.storage.from("slider-images").remove([uploadedPath]);
    redirect(`${returnPath}?error=database`);
  }
  revalidatePath("/");
  revalidatePath("/admin/slider");
  redirect(`${returnPath}?saved=1`);
}

export async function deleteSlide(form: FormData) {
  await requireAdmin();
  const db = createAdminClient();
  const id = String(form.get("id") || "");
  if (!db || !id) redirect("/admin/slider?error=database");
  const { error } = await db.from("admin_slider").delete().eq("id", id);
  if (error) redirect("/admin/slider?error=database");
  revalidatePath("/");
  revalidatePath("/admin/slider");
}
