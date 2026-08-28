"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveExercise, updateExercise, getExercise } from "@/lib/exercises";
import ExercisePhotoImport from "@/components/ai/ExercisePhotoImport";
import type { AiExerciseImport } from "@/lib/import/types";
import { importToPlaquetteSchema, renderSchemaPreviews } from "@/lib/import/plaquette-converter";
import { getPlaquetteTransfer, setPlaquetteTransfer, removePlaquetteTransfer } from "@/lib/plaquette-transfer";

type Ex = {
  title: string;
  organisation: string;
  deroulement: string;
  consignes: string;
  variantes: string;
  plots: string;
  ballons: string;
  paniers: string;
  joueurs: string;
  categorie: string;
  type: string;
  niveau: string;
  temps: string;
  themes: string[];
  images: string[];
  videos: string[];
  schemaImages: string[];
  schemaDataList: any[];
};

const DRAFT_KEY = "mybasket_exo_draft";
const RETURN_KEY = "mb_plaquette_return_to";
const LOAD_KEY = "mybasket_plaquette_load";
const RESULT_KEY = "mybasket_plaquette_result";
const EDIT_INDEX_KEY = "mybasket_edit_schema_index";
const EDIT_EXERCISE_ID_KEY = "mybasket_edit_exercise_id";
const EDIT_SCHEMA_GROUP_KEY = "mybasket_edit_schema_group_id";

const NUM = (n: number) => Array.from({ length: n + 1 }, (_, i) => String(i));

const CATS = ["— Choisir —", "U9", "U11", "U13", "U15", "U18", "U21", "Senior"];
const TYPES = ["Individuel", "Pré-co", "Collectif"];
const NIVEAUX = ["Débutant", "Intermédiaire", "Confirmé"];
const TEMPS = ["5", "10", "15", "20", "25", "30", "40", "45", "60", "75", "90"];

const THEMES = [
  "Fondamentaux individuel",
  "Fondamentaux pré collectif",
  "Collectif",
  "Défense",
  "Surnombre",
  "Jeu rapide",
  "Repli",
  "Rebond",
  "Physique",
  "Adresse",
];

const toNum = (v: string): number | undefined => {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

const asText = (v: any): string => (Array.isArray(v) ? v.join("\n") : v || "");

const toLines = (v: string): string[] =>
  v
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

const blank = (): Ex => ({
  title: "",
  organisation: "",
  deroulement: "",
  consignes: "",
  variantes: "",
  plots: "",
  ballons: "",
  paniers: "",
  joueurs: "5",
  categorie: "— Choisir —",
  type: "Collectif",
  niveau: "Intermédiaire",
  temps: "15",
  themes: [],
  images: [],
  videos: [],
  schemaImages: [],
  schemaDataList: [],
});

/** Exporté pour les tests de non-régression — comportement inchangé. */
export function normalizeSchemaData(schema: any, index: number, image = "") {
  return {
    title: schema?.title ?? `Schéma ${index + 1}`,
    schemaGroupId: schema?.schemaGroupId ?? crypto.randomUUID(),
    phaseIndex: index,
    courtType: schema?.courtType ?? "half",
    phases: Array.isArray(schema?.phases) ? schema.phases : [],
    sheet: schema?.sheet ?? null,
    current: typeof schema?.current === "number" ? schema.current : 0,
    imageData: schema?.imageData ?? image ?? "",
    phaseImages: Array.isArray(schema?.phaseImages)
      ? schema.phaseImages
      : image
      ? [image]
      : [],
    editable: true,
  };
}

/** Exporté pour les tests de non-régression — comportement inchangé. */
export function syncSchemas(images: string[], dataList: any[]) {
  // Un schéma Plaquette natif ne doit jamais disparaître simplement parce que
  // sa miniature n'a pas pu être générée. L'ancien code itérait uniquement
  // sur `images`, ce qui supprimait silencieusement les imports dont les
  // données `phases` étaient pourtant valides.
  const count = Math.max(images.length, dataList.length);
  return Array.from({ length: count }, (_, index) =>
    normalizeSchemaData(dataList[index], index, images[index] || dataList[index]?.imageData || "")
  );
}

/**
 * Où insérer/remplacer les vignettes qui reviennent de la Plaquette.
 *
 * Règle historique conservée : sans schemaGroupId exploitable, on remplace
 * exactement UNE vignette à `editIndex` (comportement d'avant), et sans
 * editIndex on ajoute à la fin.
 *
 * Règle ajoutée : quand la Plaquette renvoie le schemaGroupId d'un schéma déjà
 * présent, on remplace TOUT le groupe. Sans cela, un schéma à N phases occupant
 * N vignettes voyait 1 vignette remplacée par N à chaque modification.
 *
 * Exporté pour être testable isolément.
 */
export function resolveSchemaReplacement(
  existing: any[],
  incomingGroupId: string | null,
  editIndex: number | null,
  existingCount: number
): { at: number; count: number } {
  const groupStart = incomingGroupId
    ? existing.findIndex((schema) => schema?.schemaGroupId === incomingGroupId)
    : -1;

  if (groupStart >= 0) {
    const groupCount = existing.filter(
      (schema) => schema?.schemaGroupId === incomingGroupId
    ).length;
    return { at: groupStart, count: groupCount };
  }

  const usable =
    editIndex !== null &&
    Number.isFinite(editIndex) &&
    editIndex >= 0 &&
    editIndex < existingCount;

  return usable ? { at: editIndex as number, count: 1 } : { at: -1, count: 0 };
}

export default function CreerExerciceClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const imgInput = useRef<HTMLInputElement | null>(null);
  const vidInput = useRef<HTMLInputElement | null>(null);

  const draftKey = editId ? `${DRAFT_KEY}_${editId}` : DRAFT_KEY;

  const [ex, setEx] = useState<Ex>(blank());
  const [toast, setToast] = useState("");
  const [exerciseStorageId, setExerciseStorageId] = useState<string>(editId || "");

  const toastT = useRef<number | null>(null);

  const flash = (message: string) => {
    setToast(message);
    if (toastT.current) window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(""), 2600);
  };

  const set = <K extends keyof Ex>(key: K, value: Ex[K]) =>
    setEx((current) => ({ ...current, [key]: value }));

  const toggleTheme = (theme: string) =>
    setEx((current) => ({
      ...current,
      themes: current.themes.includes(theme)
        ? current.themes.filter((item) => item !== theme)
        : [...current.themes, theme],
    }));

  /**
   * Numérisation d'une fiche → préremplissage du formulaire.
   *
   * RÈGLES :
   *  - rien n'est enregistré ici : seul le bouton « Sauvegarder l'exercice »
   *    écrit en base ;
   *  - une zone absente du document laisse le champ INCHANGÉ (jamais écrasé
   *    par du vide, jamais rempli par une valeur inventée) ;
   *  - les schémas détectés forment UN schéma Plaquette de N phases, avec la
   *    même structure qu'un schéma multi-phases dessiné à la main : N entrées
   *    schemaImages / schemaDataList partageant un même schemaGroupId et un
   *    même tableau `phases`.
   */
  const applyAIImport = async (result: AiExerciseImport) => {
    const imported = importToPlaquetteSchema(result);
    const previews = imported ? await renderSchemaPreviews(imported) : [];

    setEx((current) => {
      const next: Ex = { ...current };

      if (result.title) next.title = result.title;
      if (result.organisation) next.organisation = result.organisation;
      if (result.deroulement.length) next.deroulement = result.deroulement.join("\n");
      if (result.consignes.length) next.consignes = result.consignes.join("\n");
      if (result.variantes.length) next.variantes = result.variantes.join("\n");
      if (result.plots !== null) next.plots = String(result.plots);
      if (result.ballons !== null) next.ballons = String(result.ballons);
      if (result.paniers !== null) next.paniers = String(result.paniers);
      if (result.joueurs !== null) next.joueurs = String(result.joueurs);
      if (result.categorie && result.categorie !== "— Choisir —") next.categorie = result.categorie;
      if (result.temps !== null) next.temps = String(result.temps);
      if (result.themes.length) next.themes = result.themes;

      if (imported) {
        const images = imported.entries.map((_entry, index) => previews[index] || "");

        const dataList = imported.entries.map((entry, index) => ({
          ...entry,
          imageData: images[index],
          phaseImages: images,
        }));

        const nextImages = [...current.schemaImages, ...images].slice(0, 50);
        const nextData = [...current.schemaDataList, ...dataList].slice(0, 50);

        next.schemaImages = nextImages;
        next.schemaDataList = syncSchemas(nextImages, nextData);
      }

      return next;
    });

    if (imported) {
      const count = imported.phases.length;
      flash(
        `Import terminé — ${count} phase${count > 1 ? "s" : ""} reconstruite${count > 1 ? "s" : ""}. Vérifie puis sauvegarde.`
      );
    } else {
      flash("Import terminé — aucun schéma reconnu. Vérifie le texte puis sauvegarde.");
    }
  };

  useEffect(() => {
    if (editId) {
      setExerciseStorageId(editId);
      return;
    }

    const key = `${draftKey}_storage_id`;
    const existing = localStorage.getItem(key);

    if (existing) {
      setExerciseStorageId(existing);
      return;
    }

    const temporaryDraftId = crypto.randomUUID();
    localStorage.setItem(key, temporaryDraftId);
    setExerciseStorageId(temporaryDraftId);
  }, [editId, draftKey]);

  useEffect(() => {
    const load = async () => {
      let base = blank();

      try {
        const resultStored = await getPlaquetteTransfer<any>(RESULT_KEY);
        const draftStored = await getPlaquetteTransfer<Partial<Ex>>(draftKey);

        if (draftStored) {
          base = {
            ...base,
            ...draftStored,
          };
        }

        if (editId) {
          const existing = await getExercise(editId);

          if (existing) {
            const schemaImages = ((existing as any).schemaImages || []) as string[];
            const schemaDataList = ((existing as any).schemaDataList || []) as any[];

            base = {
              ...base,
              title: existing.title || "",
              organisation: asText((existing as any).organisation),
              deroulement: asText((existing as any).deroulement),
              consignes: asText((existing as any).consignes),
              variantes: asText((existing as any).variantes),
              plots: String((existing as any).plots ?? ""),
              ballons: String((existing as any).ballons ?? ""),
              paniers: String((existing as any).paniers ?? ""),
              joueurs: String((existing as any).joueurs ?? "5"),
              categorie:
                (existing as any).categorie ||
                existing.category ||
                "— Choisir —",
              type: existing.type || "Collectif",
              niveau:
                (existing as any).niveau ||
                existing.level ||
                "Intermédiaire",
              temps: String((existing as any).temps ?? existing.duration ?? "15"),
              themes: ((existing as any).themes || existing.tags || []) as string[],
              images: ((existing as any).images || []) as string[],
              videos: ((existing as any).videos || []) as string[],
              schemaImages,
              schemaDataList: syncSchemas(schemaImages, schemaDataList),
            };
          }
        }

        if (resultStored) {
          const result = resultStored;

          const incomingImages: string[] = Array.isArray(result.schemaImages)
            ? result.schemaImages.filter(Boolean)
            : result.schemaImage
            ? [result.schemaImage]
            : [];

          const incomingData: any[] = Array.isArray(result.schemaDataList)
            ? result.schemaDataList
            : result.schemaData
            ? [result.schemaData]
            : [];

          const storedEditIndex = localStorage.getItem(EDIT_INDEX_KEY);

          const editIndex =
            typeof result.editIndex === "number"
              ? result.editIndex
              : storedEditIndex !== null
              ? Number(storedEditIndex)
              : null;

          if (incomingImages.length) {
            const nextImages = [...base.schemaImages];
            const nextData = [...base.schemaDataList];

            // Un schéma à N phases occupe N vignettes qui partagent le même
            // schemaGroupId. Au retour de la Plaquette il faut donc remplacer
            // TOUT le groupe, sinon on remplaçait 1 vignette par N et les
            // schémas multi-phases se dupliquaient à chaque modification.
            // Repli intégral sur l'ancien comportement quand le groupe est
            // inconnu (schémas enregistrés avant cette version).
            const incomingGroupId =
              typeof result.schemaGroupId === "string" && result.schemaGroupId
                ? result.schemaGroupId
                : null;

            const { at: replaceAt, count: replaceCount } = resolveSchemaReplacement(
              nextData,
              incomingGroupId,
              editIndex,
              nextImages.length
            );

            if (replaceAt >= 0) {
              nextImages.splice(replaceAt, replaceCount, ...incomingImages);

              nextData.splice(
                replaceAt,
                replaceCount,
                ...incomingImages.map((image, index) =>
                  normalizeSchemaData(incomingData[index], replaceAt + index, image)
                )
              );
            } else {
              const startIndex = nextImages.length;

              nextImages.push(...incomingImages);

              incomingImages.forEach((image, index) => {
                nextData.push(
                  normalizeSchemaData(incomingData[index], startIndex + index, image)
                );
              });
            }

            const limitedImages = nextImages.slice(0, 50);
            const limitedData = syncSchemas(limitedImages, nextData).slice(0, 50);

            base = {
              ...base,
              schemaImages: limitedImages,
              schemaDataList: limitedData,
            };
          }

          await removePlaquetteTransfer(RESULT_KEY);
          localStorage.removeItem(EDIT_INDEX_KEY);
          await removePlaquetteTransfer(LOAD_KEY);
          localStorage.removeItem(RETURN_KEY);
          localStorage.removeItem(EDIT_EXERCISE_ID_KEY);
          localStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);
        }

        setEx({
          ...base,
          schemaDataList: syncSchemas(base.schemaImages, base.schemaDataList),
        });
      } catch (error) {
        console.error(error);
        flash("Erreur lors du chargement");
      }
    };

    load();
  }, [editId, draftKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void setPlaquetteTransfer(draftKey, ex).catch((error) => {
        console.warn("Sauvegarde brouillon exercice impossible", error);
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [draftKey, ex]);

  const openDraw = async (index?: number) => {
    if (!ex.title.trim()) {
      flash("Ajoute un titre avant d’ouvrir la plaquette");
      return;
    }

    if (!exerciseStorageId) {
      flash("Chargement de l’exercice en cours, réessaie dans une seconde");
      return;
    }

    // On pose le contexte de retour en premier : le bouton Insérer ne doit
    // jamais dépendre du stockage d'un gros schéma.
    if (editId) {
      localStorage.setItem(EDIT_EXERCISE_ID_KEY, editId);
      localStorage.setItem(RETURN_KEY, `/exercices/creer?id=${editId}`);
    } else {
      localStorage.removeItem(EDIT_EXERCISE_ID_KEY);
      localStorage.setItem(RETURN_KEY, "/exercices/creer");
    }
    localStorage.setItem("mybasket_current_exercise_id", exerciseStorageId);

    try {
      const cleanDataList = syncSchemas(ex.schemaImages, ex.schemaDataList);

      // IndexedDB remplace localStorage pour les payloads volumineux
      // (images base64, phases, schémas) afin d'éviter QuotaExceededError.
      await setPlaquetteTransfer(draftKey, {
        ...ex,
        schemaDataList: cleanDataList,
      });

      await removePlaquetteTransfer(LOAD_KEY);
      await removePlaquetteTransfer(RESULT_KEY);
      localStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);

      if (typeof index === "number") {
        localStorage.setItem(EDIT_INDEX_KEY, String(index));

        const schemaData = cleanDataList[index];
        const schemaImage = ex.schemaImages[index];
        const schemaGroupId = schemaData?.schemaGroupId || crypto.randomUUID();
        localStorage.setItem(EDIT_SCHEMA_GROUP_KEY, schemaGroupId);

        const loadPayload = {
          title: schemaData?.title || `Schéma ${index + 1}`,
          editIndex: index,
          schemaGroupId,
          courtType: schemaData?.courtType || "half",
          phases: Array.isArray(schemaData?.phases) ? schemaData.phases : [],
          sheet: schemaData?.sheet ?? null,
          current: typeof schemaData?.current === "number" ? schemaData.current : 0,
          imageData: schemaData?.imageData || schemaImage || "",
          phaseImages: Array.isArray(schemaData?.phaseImages)
            ? schemaData.phaseImages
            : schemaImage
            ? [schemaImage]
            : [],
        };

        await setPlaquetteTransfer(LOAD_KEY, loadPayload);
      } else {
        localStorage.removeItem(EDIT_INDEX_KEY);
        localStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);
      }

      router.push(
        typeof index === "number"
          ? "/plaquette?mode=edit&return=exercise"
          : "/plaquette?mode=new&return=exercise"
      );
    } catch (error) {
      console.error(error);
      flash("Erreur avant ouverture de la plaquette");
    }
  };

  const removeSchema = (index: number) =>
    setEx((current) => {
      const nextImages = current.schemaImages.filter(
        (_, itemIndex) => itemIndex !== index
      );

      const nextData = current.schemaDataList.filter(
        (_, itemIndex) => itemIndex !== index
      );

      return {
        ...current,
        schemaImages: nextImages,
        schemaDataList: syncSchemas(nextImages, nextData),
      };
    });

  const onImages = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const room = 5 - ex.images.length;

    files.slice(0, room).forEach((file) => {
      const reader = new FileReader();

      reader.onload = () =>
        setEx((current) => ({
          ...current,
          images: [...current.images, reader.result as string].slice(0, 5),
        }));

      reader.readAsDataURL(file);
    });

    event.target.value = "";
  };

  const removeImage = (index: number) =>
    setEx((current) => ({
      ...current,
      images: current.images.filter((_, itemIndex) => itemIndex !== index),
    }));

  const onVideos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = (event.target.files || [])[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () =>
      setEx((current) => ({
        ...current,
        videos: [reader.result as string],
      }));

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const removeVideo = () =>
    setEx((current) => ({
      ...current,
      videos: [],
    }));

  async function uploadBase64Image(base64: string, folder = "schemas") {
    if (!base64.startsWith("data:image")) return base64;

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Utilisateur non connecté");
    }

    const res = await fetch(base64);
    const blob = await res.blob();

    const fileName = `${user.id}/${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.png`;

    const { error } = await supabase.storage
      .from("exercise-schemas")
      .upload(fileName, blob, {
        contentType: "image/png",
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from("exercise-schemas")
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  async function uploadBase64Video(base64: string, folder = "videos") {
    if (!base64.startsWith("data:video")) return base64;

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Utilisateur non connecté");
    }

    const res = await fetch(base64);
    const blob = await res.blob();

    const extension = blob.type.includes("quicktime")
      ? "mov"
      : blob.type.includes("webm")
      ? "webm"
      : "mp4";

    const fileName = `${user.id}/${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

    const { error } = await supabase.storage
      .from("exercise-videos")
      .upload(fileName, blob, {
        contentType: blob.type || "video/mp4",
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from("exercise-videos")
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  const save = async () => {
    if (!ex.title.trim()) {
      flash("Ajoute un titre à ton exercice");
      return;
    }

    if (!exerciseStorageId) {
      flash("Chargement de l’exercice en cours, réessaie dans une seconde");
      return;
    }

    try {
      const uploadedImages = await Promise.all(
        ex.images.map((image) =>
          uploadBase64Image(image, `exercices/${exerciseStorageId}/images`)
        )
      );

      const uploadedVideos = await Promise.all(
        ex.videos.map((video) =>
          uploadBase64Video(video, `exercices/${exerciseStorageId}/videos`)
        )
      );

      const uploadedSchemaImages = await Promise.all(
        ex.schemaImages.map((image) =>
          uploadBase64Image(image, `exercices/${exerciseStorageId}/schemas/imported`)
        )
      );

      const cleanSchemaDataList = syncSchemas(ex.schemaImages, ex.schemaDataList).map(
        (schema, index) => {
          const imageData =
            typeof schema?.imageData === "string" && schema.imageData.startsWith("data:image")
              ? uploadedSchemaImages[index] || schema.imageData
              : schema?.imageData;

          // Les miniatures d'import sont en base64 : on les remplace par leur
          // URL Storage en respectant l'ordre des phases du schéma.
          const phaseImages = Array.isArray(schema?.phaseImages)
            ? schema.phaseImages.map((image: string) => {
                if (!image?.startsWith?.("data:image")) return image;
                const globalIndex = ex.schemaImages.indexOf(image);
                if (globalIndex >= 0 && uploadedSchemaImages[globalIndex]) {
                  return uploadedSchemaImages[globalIndex];
                }
                return uploadedSchemaImages[index] || image;
              })
            : [];

          return {
            ...schema,
            imageData,
            phaseImages,
          };
        }
      );

      const payload = {
        title: ex.title.trim(),
        organisation: ex.organisation,
        deroulement: toLines(ex.deroulement),
        consignes: toLines(ex.consignes),
        variantes: toLines(ex.variantes),
        plots: toNum(ex.plots),
        ballons: toNum(ex.ballons),
        paniers: toNum(ex.paniers),
        joueurs: toNum(ex.joueurs),
        categorie: ex.categorie,
        category: ex.categorie,
        type: ex.type,
        niveau: ex.niveau,
        level: ex.niveau,
        temps: toNum(ex.temps),
        duration: ex.temps,
        themes: ex.themes,
        tags: ex.themes,
        images: uploadedImages,
        schemaImages: uploadedSchemaImages,
        videos: uploadedVideos,
        schemaDataList: cleanSchemaDataList,
      };

      const saved = editId
        ? await updateExercise(editId, payload)
        : await saveExercise(payload);

      if (!saved) {
        flash("Erreur Supabase : exercice non enregistré");
        return;
      }

      await removePlaquetteTransfer(draftKey);
      await removePlaquetteTransfer(RESULT_KEY);
      localStorage.removeItem(EDIT_INDEX_KEY);
      await removePlaquetteTransfer(LOAD_KEY);
      localStorage.removeItem(RETURN_KEY);
      localStorage.removeItem(EDIT_EXERCISE_ID_KEY);
      localStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);
      localStorage.removeItem("mybasket_current_exercise_id");
      localStorage.removeItem(`${draftKey}_storage_id`);

      const goId = saved?.id ?? editId;

      flash("Exercice enregistré ✅");

      setTimeout(() => {
        if (goId) router.push(`/exercices/${goId}`);
        else router.push("/mon-compte/exercices");
      }, 600);
    } catch (error) {
      console.error("Erreur sauvegarde exercice :", error);
      flash("Erreur lors de la sauvegarde");
    }
  };

  return (
    <div className="ce">
      <style>{CSS}</style>

      <div className="ce-topbar">
        <button
          className="ce-retour"
          onClick={() => router.push("/mon-compte/exercices")}
        >
          ← Retour à mes exercices
        </button>

        <span className="ce-nouvel">
          {editId ? "✏️ MODIFIER L’EXERCICE" : "+ NOUVEL EXERCICE"}
        </span>
      </div>

      <div className="ce-title">
        <span className="dash" />
        <h1>{editId ? "MODIFIER UN EXERCICE" : "CRÉER UN EXERCICE"}</h1>
        <span className="dash" />
      </div>

      <p className="ce-sub">
        Renseigne les informations de ton exercice. Il restera privé dans ton compte
        tant que tu ne le proposes pas au CEO.
      </p>

      <ExercisePhotoImport onImported={applyAIImport} />

      <div className="ce-grid">
        <div className="ce-card">
          <label className="ce-lab">
            Titre de l’exercice <b className="req">*</b>
          </label>

          <input
            className="ce-input"
            value={ex.title}
            onChange={(event) => set("title", event.target.value)}
          />

          <label className="ce-lab">Organisation</label>

          <textarea
            className="ce-area"
            value={ex.organisation}
            onChange={(event) => set("organisation", event.target.value)}
          />

          <label className="ce-lab">Déroulement</label>

          <textarea
            className="ce-area"
            value={ex.deroulement}
            onChange={(event) => set("deroulement", event.target.value)}
          />

          <label className="ce-lab">Consignes techniques</label>

          <textarea
            className="ce-area"
            value={ex.consignes}
            onChange={(event) => set("consignes", event.target.value)}
          />

          <label className="ce-lab">Évolution / Variantes</label>

          <textarea
            className="ce-area"
            value={ex.variantes}
            onChange={(event) => set("variantes", event.target.value)}
          />

          <label className="ce-lab">
            Dessins de l’exercice{" "}
            <span className="ce-lab-soft">(50 phases max)</span>
          </label>

          <div className="ce-schemas">
            {ex.schemaImages.map((src, index) => (
              <div key={`${src}-${index}`} className="ce-schema">
                <img src={src} alt={`Schéma ${index + 1}`} />

                <div className="ce-schema-acts">
                  <button type="button" onClick={() => openDraw(index)}>
                    ✏️ Modifier
                  </button>

                  <button
                    type="button"
                    className="rm"
                    onClick={() => removeSchema(index)}
                  >
                    ✕ Retirer
                  </button>
                </div>
              </div>
            ))}

            {ex.schemaImages.length < 50 && (
              <button type="button" className="ce-draw" onClick={() => openDraw()}>
                <span className="ce-draw-ico">✏️</span>
                <b>Ajouter un schéma</b>
                <small>{ex.schemaImages.length}/50 phases ajoutées</small>
              </button>
            )}
          </div>

          <label className="ce-lab">
            Vidéo / Animation <span className="ce-lab-soft">(1 max)</span>
          </label>

          <div className="ce-videos">
            {ex.videos[0] ? (
              <div className="ce-video">
                <video src={ex.videos[0]} controls />

                <button type="button" className="rm" onClick={removeVideo}>
                  ✕ Retirer
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="ce-addvid"
                onClick={() => vidInput.current?.click()}
              >
                🎬 Ajouter une vidéo
              </button>
            )}

            <input
              ref={vidInput}
              type="file"
              accept="video/mp4,video/*"
              hidden
              onChange={onVideos}
            />
          </div>

          <label className="ce-lab">
            Images / Schémas <span className="ce-lab-soft">(5 max)</span>
          </label>

          <div className="ce-imgs">
            {ex.images.map((src, index) => (
              <div key={`${src}-${index}`} className="ce-thumb">
                <img src={src} alt="" />

                <button type="button" onClick={() => removeImage(index)}>
                  ✕
                </button>
              </div>
            ))}

            {ex.images.length < 5 && (
              <button
                type="button"
                className="ce-addimg"
                onClick={() => imgInput.current?.click()}
              >
                📷 Ajouter une image
              </button>
            )}

            <input
              ref={imgInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={onImages}
            />
          </div>
        </div>

        <div className="ce-card ce-criteres">
          <h2>CRITÈRES</h2>

          <label className="ce-lab">Plots</label>

          <select
            className="ce-select"
            value={ex.plots}
            onChange={(event) => set("plots", event.target.value)}
          >
            <option value="">—</option>
            {NUM(12).map((number) => (
              <option key={number}>{number}</option>
            ))}
          </select>

          <label className="ce-lab">Ballons</label>

          <select
            className="ce-select"
            value={ex.ballons}
            onChange={(event) => set("ballons", event.target.value)}
          >
            <option value="">—</option>
            {NUM(12).map((number) => (
              <option key={number}>{number}</option>
            ))}
          </select>

          <label className="ce-lab">Nombre de paniers</label>

          <select
            className="ce-select"
            value={ex.paniers}
            onChange={(event) => set("paniers", event.target.value)}
          >
            <option value="">—</option>
            {NUM(8).map((number) => (
              <option key={number}>{number}</option>
            ))}
          </select>

          <label className="ce-lab">Nombre de joueurs</label>

          <select
            className="ce-select"
            value={ex.joueurs}
            onChange={(event) => set("joueurs", event.target.value)}
          >
            {NUM(20)
              .slice(1)
              .map((number) => (
                <option key={number}>{number}</option>
              ))}
          </select>

          <label className="ce-lab">Catégorie</label>

          <select
            className="ce-select"
            value={ex.categorie}
            onChange={(event) => set("categorie", event.target.value)}
          >
            {CATS.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>

          <label className="ce-lab">Type</label>

          <div className="ce-toggles">
            {TYPES.map((type) => (
              <button
                type="button"
                key={type}
                className={"ce-toggle" + (ex.type === type ? " on" : "")}
                onClick={() => set("type", type)}
              >
                {type}
              </button>
            ))}
          </div>

          <label className="ce-lab">Niveau</label>

          <div className="ce-toggles">
            {NIVEAUX.map((level) => (
              <button
                type="button"
                key={level}
                className={"ce-toggle" + (ex.niveau === level ? " on" : "")}
                onClick={() => set("niveau", level)}
              >
                {level}
              </button>
            ))}
          </div>

          <label className="ce-lab">Temps estimé min</label>

          <select
            className="ce-select"
            value={ex.temps}
            onChange={(event) => set("temps", event.target.value)}
          >
            {TEMPS.map((time) => (
              <option key={time}>{time}</option>
            ))}
          </select>

          <label className="ce-lab">Thèmes</label>

          <div className="ce-themes">
            {THEMES.map((theme) => (
              <label key={theme} className="ce-theme">
                <input
                  type="checkbox"
                  checked={ex.themes.includes(theme)}
                  onChange={() => toggleTheme(theme)}
                />{" "}
                {theme}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="ce-actions">
        <button type="button" className="ce-btn ghost" onClick={() => router.back()}>
          Annuler
        </button>

        <button type="button" className="ce-btn save" onClick={save}>
          💾 {editId ? "METTRE À JOUR L’EXERCICE" : "SAUVEGARDER L’EXERCICE"}
        </button>
      </div>

      {toast && <div className="ce-toast">{toast}</div>}
    </div>
  );
}

const CSS = `
.ce{font-family:'Roboto',system-ui,sans-serif;background:#fff;color:#0F0F12;max-width:1280px;margin:0 auto;padding:1.4rem 1.6rem 3rem}
.ce *{box-sizing:border-box}.ce button{font-family:inherit;cursor:pointer}.ce img{display:block;max-width:100%}
.ce-topbar{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.ce-retour{border:2px solid #0F0F12;background:#fff;border-radius:999px;padding:.5rem 1.1rem;font-weight:800;font-size:.95rem}
.ce-retour:hover{background:#0F0F12;color:#fff}
.ce-nouvel{font-weight:900;color:#777;letter-spacing:.04em}
.ce-title{display:flex;align-items:center;justify-content:center;gap:1.2rem;margin:1.2rem 0 .3rem}
.ce-title h1{font-weight:900;font-size:2.6rem;letter-spacing:.02em;text-align:center}
.ce-title .dash{height:3px;width:54px;background:#0F0F12;display:inline-block}
.ce-sub{text-align:center;color:#666;max-width:760px;margin:0 auto 1.6rem}
.ce-ai-import{margin:0 auto 1.4rem;max-width:980px;border:1px solid #ead7a9;background:linear-gradient(135deg,#fffaf0,#fff);border-radius:16px;padding:1rem 1.1rem;display:grid;grid-template-columns:1fr auto;gap:.8rem 1.2rem;align-items:center;box-shadow:0 3px 14px rgba(0,0,0,.04)}
.ce-ai-copy{display:flex;align-items:flex-start;gap:.8rem}.ce-ai-copy b{font-size:1rem}.ce-ai-copy p{margin:.22rem 0 0;color:#666;font-size:.9rem;line-height:1.4}.ce-ai-badge{flex:0 0 auto;background:#6B1A2C;color:#fff;border-radius:999px;padding:.28rem .58rem;font-size:.68rem;font-weight:900;letter-spacing:.06em}.ce-ai-btn{border:0;background:#0F0F12;color:#fff;border-radius:999px;padding:.75rem 1.05rem;font-weight:900;white-space:nowrap}.ce-ai-btn:hover{background:#6B1A2C}.ce-ai-btn:disabled{opacity:.55;cursor:wait}.ce-ai-state{grid-column:1/-1;border-top:1px solid #eee1c2;padding-top:.7rem;color:#5f4a20;font-size:.86rem;font-weight:700}.ce-ai-state.error{color:#a12626}
.ce-ai-warn{grid-column:1/-1;margin:.2rem 0 0;padding-left:1.1rem;color:#6b5a33;font-size:.83rem;line-height:1.5}
.ce-ai-warn li{margin:.1rem 0}
.ce-ai-debug{grid-column:1/-1;border-top:1px dashed #d9c79a;padding-top:.6rem}
.ce-ai-debug-toggle{border:1px solid #d9c79a;background:#fffdf7;border-radius:8px;padding:.3rem .6rem;font-size:.76rem;font-weight:800;color:#6b5a33}
.ce-ai-debug-body{margin-top:.6rem;font-size:.78rem;color:#3d3d3d;max-height:420px;overflow:auto;background:#fcfaf5;border:1px solid #eee1c2;border-radius:10px;padding:.6rem .8rem}
.ce-ai-debug-body summary{cursor:pointer;font-weight:800;margin:.35rem 0}
.ce-ai-debug-body pre{white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #eee;border-radius:6px;padding:.4rem .5rem;font-size:.72rem;max-height:220px;overflow:auto}
.ce-ai-debug-body ul{padding-left:1.1rem;margin:.2rem 0}
.ce-grid{display:grid;grid-template-columns:2fr 1fr;gap:1.6rem;align-items:start}
.ce-card{background:#fff;border:1px solid #e4e4e4;border-radius:18px;padding:1.4rem;box-shadow:0 2px 12px rgba(0,0,0,.04)}
.ce-lab{display:block;font-weight:900;text-transform:uppercase;font-size:.82rem;letter-spacing:.03em;margin:1rem 0 .4rem}
.ce-lab-soft{font-weight:500;text-transform:none;color:#888}
.ce-lab:first-of-type{margin-top:0}
.req{color:#C0392B}
.ce-input,.ce-area,.ce-select{width:100%;border:1px solid #d6d6d6;border-radius:10px;padding:.7rem .9rem;font-size:.95rem;font-family:inherit;background:#fff}
.ce-input:focus,.ce-area:focus,.ce-select:focus{outline:2px solid #6B1A2C;border-color:#6B1A2C}
.ce-area{min-height:110px;resize:vertical}
.ce-schemas{display:grid;grid-template-columns:repeat(2,1fr);gap:.8rem}
.ce-draw{min-height:170px;width:100%;border:2px dashed #cfcfcf;background:#f6f6f6;border-radius:14px;padding:1.2rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.3rem}
.ce-draw:hover{background:#f0f0f0;border-color:#6B1A2C}
.ce-draw-ico{font-size:1.8rem}.ce-draw b{font-size:1.05rem}.ce-draw small{color:#888}
.ce-schema{border:1px solid #e0e0e0;border-radius:14px;overflow:hidden;background:#fafafa}
.ce-schema img{width:100%;height:190px;object-fit:contain;background:#fff}
.ce-schema-acts{display:flex;gap:.6rem;padding:.7rem;border-top:1px solid #eee}
.ce-schema-acts button{flex:1;border:1px solid #d6d6d6;background:#fff;border-radius:8px;padding:.45rem .8rem;font-weight:700;font-size:.85rem}
.ce-schema-acts .rm,.ce-video .rm{color:#C0392B;border-color:#F2C3C3}
.ce-videos{display:flex;flex-direction:column;gap:.7rem}
.ce-video{border:1px solid #e0e0e0;border-radius:12px;overflow:hidden}
.ce-video video{width:100%;display:block;background:#000;max-height:320px}
.ce-video .rm{width:100%;border:none;border-top:1px solid #eee;background:#fff;padding:.5rem;font-weight:700;font-size:.85rem}
.ce-addvid{border:2px dashed #6B1A2C;color:#6B1A2C;background:#fff;border-radius:10px;padding:.7rem 1rem;font-weight:700;font-size:.9rem;text-align:center}
.ce-addvid:hover{background:#FBEFF1}
.ce-imgs{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
.ce-thumb{position:relative;width:90px;height:90px;border-radius:10px;overflow:hidden;border:1px solid #ddd}
.ce-thumb img{width:100%;height:100%;object-fit:cover}
.ce-thumb button{position:absolute;top:3px;right:3px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(0,0,0,.65);color:#fff;font-size:.7rem}
.ce-addimg{border:2px dashed #D4A24C;color:#B8860B;background:#fff;border-radius:10px;padding:.7rem 1rem;font-weight:700;font-size:.9rem}
.ce-addimg:hover{background:#FFF8EC}
.ce-criteres h2{font-weight:900;font-size:1.3rem;letter-spacing:.02em;border-bottom:2px solid #eee;padding-bottom:.6rem;margin-bottom:.4rem}
.ce-toggles{display:flex;gap:.5rem}
.ce-toggle{flex:1;border:1px solid #ddd;background:#f3f3f3;border-radius:10px;padding:.65rem;font-weight:800;font-size:.88rem;color:#333}
.ce-toggle.on{background:#0F0F12;color:#fff;border-color:#0F0F12}
.ce-themes{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
.ce-theme{display:flex;align-items:center;gap:.5rem;background:#f6f6f6;border:1px solid #ececec;border-radius:8px;padding:.5rem .7rem;font-size:.9rem}
.ce-theme input{width:16px;height:16px;accent-color:#6B1A2C}
.ce-actions{display:flex;justify-content:flex-end;gap:.8rem;margin-top:1.6rem}
.ce-btn{border-radius:999px;padding:.8rem 1.5rem;font-weight:800;font-size:.95rem;border:2px solid #0F0F12;background:#fff;color:#0F0F12}
.ce-btn.ghost:hover{background:#f2f2f2}
.ce-btn.save{background:#0F0F12;color:#fff;letter-spacing:.02em}
.ce-btn.save:hover{background:#000}
.ce-toast{position:fixed;bottom:1.2rem;left:50%;transform:translateX(-50%);background:#0F0F12;color:#fff;padding:.6rem 1.1rem;border-radius:10px;font-weight:600;font-size:.9rem;z-index:5000;box-shadow:0 8px 24px rgba(0,0,0,.3)}
@media (max-width:900px){.ce-ai-import{grid-template-columns:1fr}.ce-ai-btn{width:100%}.ce-grid,.ce-schemas{grid-template-columns:1fr}.ce-title h1{font-size:1.8rem}.ce-title .dash{width:28px}.ce-actions{flex-wrap:wrap}}
`;
