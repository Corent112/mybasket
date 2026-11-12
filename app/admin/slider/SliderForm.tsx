"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { saveSlide } from "./actions";
import styles from "./page.module.css";

type Slide = {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  button_label: string | null;
  button_href: string | null;
  placement: string | null;
  status: string | null;
  sort_order: number | null;
};

export function SliderForm({ slide }: { slide?: Slide }) {
  const [error, setError] = useState("");
  function validate(event: FormEvent<HTMLFormElement>) {
    const file = new FormData(event.currentTarget).get("image_file");
    if (file instanceof File && file.size > 3 * 1024 * 1024) {
      event.preventDefault();
      setError("Choisis une image de 3 Mo maximum.");
    } else setError("");
  }

  return (
    <form action={saveSlide} onSubmit={validate} className={styles.form}>
      {slide && <input type="hidden" name="id" value={slide.id} />}
      <input type="hidden" name="placement" value={slide?.placement ?? "home"} />
      <label>Titre<input name="title" defaultValue={slide?.title ?? ""} required /></label>
      <label>Texte<textarea name="subtitle" defaultValue={slide?.subtitle ?? ""} rows={3} /></label>
      <label>Choisir une image (JPG, PNG ou WebP, 3 Mo max.)<input name="image_file" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <label>Ou saisir l’adresse de l’image<input name="image_url" defaultValue={slide?.image_url ?? ""} placeholder="https://…" /></label>
      <label>Texte du bouton<input name="button_label" defaultValue={slide?.button_label ?? ""} placeholder="Découvrir les offres" /></label>
      <label>Lien du bouton<input name="button_href" defaultValue={slide?.button_href ?? ""} placeholder="/abonnements ou https://…" /></label>
      <label>Ordre d’affichage<input name="sort_order" type="number" defaultValue={slide?.sort_order ?? 0} /></label>
      <label><input name="published" type="checkbox" defaultChecked={slide?.status === "active"} /> Publier sur l’accueil</label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">{slide ? "Enregistrer les modifications" : "Créer la slide"}</button>
    </form>
  );
}
