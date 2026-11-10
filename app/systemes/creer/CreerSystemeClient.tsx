"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ExercisePhotoImport from "@/components/ai/ExercisePhotoImport";
import type { AiExerciseImport } from "@/lib/import/types";
import { importToPlaquetteSchema, renderSchemaPreviews } from "@/lib/import/plaquette-converter";
import {
  saveSystem,
  updateSystem,
  getSystem,
  newSystemId,
  type SystemItem,
} from "@/lib/systems";
import { attachSystemToPlaybook, clearPendingPlaybookSelection, readPendingPlaybookSelection, listPersonalSystemTags, createPersonalSystemTag } from '@/lib/playbook-series';
import {
  getPlaquetteTransfer,
  setPlaquetteTransfer,
  removePlaquetteTransfer,
  preparePlaquetteNavigation,
} from "@/lib/plaquette-transfer";
import { drawingSessionStorage } from "@/lib/drawing-session-storage";
import { readAttachedImages } from "@/lib/import/attached-images";

type Systeme = {
  id?: string;
  title: string;
  objectif: string;
  organisation: string;
  deroulement: string;
  consignes: string;
  variantes: string;
  famille: string;
  categorie: string;
  type: string;
  tempsForts: string[];
  tags: string[];
  images: string[];
  videos: string[];
  schemaImages: string[];
  schemaDataList: any[];
  schemaVideo?: string | null;
  createdAt?: string | number;
};

const DRAFT_KEY = "mybasket_systeme_draft";
const RETURN_KEY = "mb_plaquette_return_to";
const LOAD_KEY = "mybasket_plaquette_load";
const RESULT_KEY = "mybasket_plaquette_result";
const EDIT_INDEX_KEY = "mybasket_edit_schema_index";
const EDIT_SCHEMA_GROUP_KEY = "mybasket_edit_schema_group_id";
const EDIT_SYSTEM_ID_KEY = "mybasket_edit_system_id";
const CURRENT_SYSTEM_ID_KEY = "mybasket_current_system_id";

const DEFAULT_FAMILLES = ["Offensif"];

const DEFAULT_TEMPS_FORTS = [
  "Pick top", "Pick side", "Pick non porteur", "Post up", "1v1", "Pick the picker", "Spanish"
];

const DEFAULT_CATEGORIES = ["U13", "U15", "U18", "U21", "Seniors"];

const DEFAULT_TYPES = [
  "SLOB",
  "BLOB",
  "Homme à Homme demi terrain",
  "Attaque de Zone",
  "Transition",
];

const DEFAULT_TAGS = [
  "spacing",
  "pick-and-roll",
  "shoot",
  "corner",
  "screen",
  "handoff",
  "transition",
  "zone",
];


const blank = (): Systeme => ({
  title: "",
  objectif: "",
  organisation: "",
  deroulement: "",
  consignes: "",
  variantes: "",
  famille: "Offensif",
  categorie: "U18",
  type: "Homme à Homme demi terrain",
  tempsForts: [],
  tags: [],
  images: [],
  videos: [],
  schemaImages: [],
  schemaDataList: [],
  schemaVideo: null,
});

function normalizeSchemaData(schema: any, index: number, image = "") {
  return {
    title: schema?.title ?? `Schéma ${index + 1}`,
    schemaGroupId: schema?.schemaGroupId ?? crypto.randomUUID(),
    phaseIndex: schema?.phaseIndex ?? index,
    courtType: schema?.courtType ?? "half",
    courtStyle: schema?.courtStyle,
    courtBranding: schema?.courtBranding,
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

function syncSchemas(images: string[], dataList: any[]) {
  const count = Math.max(images.length, dataList.length);

  return Array.from({ length: count }, (_, index) =>
    normalizeSchemaData(
      dataList[index],
      index,
      images[index] || dataList[index]?.imageData || ""
    )
  );
}

function systemToForm(system: SystemItem): Systeme {
  const schemaImages = system.schemaImages || [];
  const schemaDataList = syncSchemas(schemaImages, system.schemaDataList || []);

  return {
    id: system.id,
    title: system.title || "",
    objectif: system.objectif || "",
    organisation: system.organisation || "",
    deroulement: system.deroulement || "",
    consignes: system.consignes || "",
    variantes: system.variantes || "",
    famille: system.famille || "Offensif",
    categorie: system.categorie || "U18",
    type: system.type || "Homme à Homme demi terrain",
    tempsForts: system.tempsForts || [],
    tags: system.tags || [],
    images: system.images || [],
    videos: system.videos || [],
    schemaImages,
    schemaDataList,
    schemaVideo: (system as any).schemaVideo || null,
    createdAt: system.createdAt,
  };
}

export default function SystemesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const editId = searchParams.get("id");
  const isNew = searchParams.get("new") === "1";
  const draftKey = editId ? `${DRAFT_KEY}_${editId}` : DRAFT_KEY;

  const imgInput = useRef<HTMLInputElement | null>(null);
  const vidInput = useRef<HTMLInputElement | null>(null);
  const toastT = useRef<number | null>(null);

  const [systeme, setSysteme] = useState<Systeme>(blank());
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const drawingPending = useRef(false);
  const [drawingOpening, setDrawingOpening] = useState(false);
  const [drawingOpenError, setDrawingOpenError] = useState("");
  const [systemStorageId, setSystemStorageId] = useState<string>(editId || "");
  const [personalTempsForts,setPersonalTempsForts]=useState<string[]>([]);
  useEffect(()=>{ listPersonalSystemTags().then(rows=>setPersonalTempsForts(rows.map(x=>x.name))).catch(()=>setPersonalTempsForts(DEFAULT_TEMPS_FORTS)); },[]);
  const addPersonalTempsFort=async()=>{const n=prompt('Nouveau tag de jeu ?');if(!n?.trim())return;await createPersonalSystemTag(n);setPersonalTempsForts((await listPersonalSystemTags()).map(x=>x.name));};

  const tempsFortsOptions = personalTempsForts.length?personalTempsForts:DEFAULT_TEMPS_FORTS;
  const categories = DEFAULT_CATEGORIES;
  const types = DEFAULT_TYPES;

  const flash = (message: string) => {
    setToast(message);
    if (toastT.current) window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(""), 2600);
  };

  const set = <K extends keyof Systeme>(key: K, value: Systeme[K]) => {
    setSysteme((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArray = (key: "tempsForts" | "tags", value: string) => {
    setSysteme((prev) => {
      const current = prev[key];

      return {
        ...prev,
        [key]: current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value],
      };
    });
  };


  useEffect(() => {
    if (editId) {
      setSystemStorageId(editId);
      return;
    }

    const key = `${draftKey}_storage_id`;
    const existing = drawingSessionStorage.getItem(key);

    if (existing) {
      setSystemStorageId(existing);
      return;
    }

    const temporaryDraftId = crypto.randomUUID();
    drawingSessionStorage.setItem(key, temporaryDraftId);
    setSystemStorageId(temporaryDraftId);
  }, [editId, draftKey]);

  useEffect(() => {
    // Ne jamais écrire le formulaire vide au premier rendu.
    // Les schémas/images peuvent être volumineux : même stockage que les exercices.
    if (!draftReady || drawingOpening) return;

    const timer = window.setTimeout(() => {
      void setPlaquetteTransfer(draftKey, systeme).catch((error) => {
        console.warn("Sauvegarde brouillon système impossible", error);
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [draftKey, systeme, draftReady, drawingOpening]);

  useEffect(() => {
    const load = async () => {
      setDraftReady(false);
      let base = blank();

      try {
        const storedResult = await getPlaquetteTransfer<any>(RESULT_KEY);
        const resultStored = storedResult?.targetType === "exercise" ? null : storedResult;
        const draftStored =
          await getPlaquetteTransfer<Partial<Systeme>>(draftKey);
        let syncDraft: Partial<Systeme> | null = null;
        try {
          const raw = drawingSessionStorage.getItem(`${draftKey}_sync`);
          syncDraft = raw ? JSON.parse(raw) : null;
        } catch { syncDraft = null; }
        let sourceMeta: (Partial<Systeme> & { originalSystemId?: string }) | null = null;
        try {
          const raw = localStorage.getItem('mybasket_drawing_source_system_meta');
          sourceMeta = raw ? JSON.parse(raw) : null;
        } catch { sourceMeta = null; }

        if (!editId && resultStored && sourceMeta) {
          // Duplication depuis DESSIN : on reprend la fiche source mais jamais ses anciens schémas.
          // Les nouveaux schémas sont injectés juste après depuis mybasket_plaquette_result.
          base = {
            ...base,
            title: sourceMeta.title || '',
            objectif: sourceMeta.objectif || '',
            organisation: sourceMeta.organisation || '',
            deroulement: sourceMeta.deroulement || '',
            consignes: sourceMeta.consignes || '',
            variantes: sourceMeta.variantes || '',
            famille: sourceMeta.famille || 'Offensif',
            categorie: sourceMeta.categorie || 'U18',
            type: sourceMeta.type || 'Homme à Homme demi terrain',
            tempsForts: Array.isArray(sourceMeta.tempsForts) ? sourceMeta.tempsForts : [],
            tags: Array.isArray(sourceMeta.tags) ? sourceMeta.tags : [],
          };
        }

        if (draftStored) {
          base = {
            ...base,
            ...draftStored,
          };
        }

        if (syncDraft) {
          base = { ...base, ...syncDraft };
        }

        if (isNew) {
          drawingSessionStorage.removeItem(RETURN_KEY);
          await removePlaquetteTransfer(LOAD_KEY);
          await setPlaquetteTransfer(draftKey, base);
          drawingSessionStorage.removeItem(`${draftKey}_sync`);
          await removePlaquetteTransfer(RESULT_KEY);
          drawingSessionStorage.removeItem(EDIT_INDEX_KEY);
          drawingSessionStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);
          drawingSessionStorage.removeItem(EDIT_SYSTEM_ID_KEY);
          drawingSessionStorage.removeItem(CURRENT_SYSTEM_ID_KEY);
          await removePlaquetteTransfer(draftKey);
          drawingSessionStorage.removeItem(`${draftKey}_storage_id`);

          const temporaryDraftId = crypto.randomUUID();
          drawingSessionStorage.setItem(`${DRAFT_KEY}_storage_id`, temporaryDraftId);
          setSystemStorageId(temporaryDraftId);
          setSysteme(blank());
          setDraftReady(true);
          return;
        }

        if (editId) {
          setLoading(true);

          const existing = await getSystem(editId);

          if (existing) {
            base = systemToForm(existing);

            // Comme pour les exercices, le brouillon local doit rester prioritaire
            // au retour de la plaquette afin de ne pas perdre les champs saisis.
            if (draftStored || syncDraft) {
              base = { ...base, ...draftStored, ...syncDraft, id: existing.id };
            }

            if (!DEFAULT_CATEGORIES.includes(base.categorie)) {
              base.categorie = "U18";
            }

            if (!DEFAULT_TYPES.includes(base.type)) {
              base.type = "Attaque demi-terrain Homme à homme";
            }
          } else {
            flash("Système introuvable");
          }

          setLoading(false);
        }

        if (resultStored) {
          const result = resultStored;

          const incomingImages: string[] = Array.isArray(result.schemaImages)
            ? result.schemaImages
            : result.schemaImage
            ? [result.schemaImage]
            : [];

          const incomingData: any[] = Array.isArray(result.schemaDataList)
            ? result.schemaDataList
            : result.schemaData
            ? [result.schemaData]
            : [];

          const storedEditIndex = drawingSessionStorage.getItem(EDIT_INDEX_KEY);

          const editIndex =
            typeof result.editIndex === "number"
              ? result.editIndex
              : storedEditIndex !== null
              ? Number(storedEditIndex)
              : null;

          if (typeof result.schemaVideo === 'string' && result.schemaVideo) {
            base = { ...base, schemaVideo: result.schemaVideo };
          }

          if (incomingImages.length || incomingData.length) {
            const nextData = syncSchemas(base.schemaImages, base.schemaDataList);
            const nextImages = nextData.map((schema, i) => base.schemaImages[i] || schema.imageData || "");
            const group = typeof result.schemaGroupId === "string" && result.schemaGroupId
              ? result.schemaGroupId : editIndex !== null ? nextData[editIndex]?.schemaGroupId : null;
            const members = group ? nextData.flatMap((schema, i) => schema.schemaGroupId === group ? [i] : []) : [];
            if (!members.length && editIndex !== null && Number.isInteger(editIndex)
              && editIndex >= 0 && editIndex < nextData.length) members.push(editIndex);
            const at = members[0] ?? nextData.length;
            for (const i of members.slice().reverse()) {
              nextImages.splice(i, 1);
              nextData.splice(i, 1);
            }
            const inserted = syncSchemas(incomingImages, incomingData);
            nextData.splice(at, 0, ...inserted);
            nextImages.splice(at, 0, ...inserted.map((schema, i) => incomingImages[i] || schema.imageData || ""));
            base = { ...base, schemaImages: nextImages, schemaDataList: nextData };
          }

          await setPlaquetteTransfer(draftKey, base);
          drawingSessionStorage.removeItem(`${draftKey}_sync`);
          await removePlaquetteTransfer(RESULT_KEY);
          drawingSessionStorage.removeItem(EDIT_INDEX_KEY);
          await removePlaquetteTransfer(LOAD_KEY);
          drawingSessionStorage.removeItem(RETURN_KEY);
          drawingSessionStorage.removeItem(EDIT_SYSTEM_ID_KEY);
          drawingSessionStorage.removeItem(CURRENT_SYSTEM_ID_KEY);
          drawingSessionStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);
          localStorage.removeItem('mybasket_drawing_source_system_meta');

          flash(sourceMeta ? "Informations de l’original reprises ✅" : "Schéma ajouté au système ✅");
        }

        setSysteme({
          ...base,
          schemaDataList: syncSchemas(base.schemaImages, base.schemaDataList),
        });
        setDraftReady(true);
      } catch (error) {
        console.error(error);
        setLoading(false);
        setDraftReady(true);
        flash("Erreur lors du chargement");
      }
    };

    load();
  }, [editId, isNew, draftKey]);

  /** Import Vision : photo / capture / dessin papier -> phases Plaquette natives. */
  const applyVisionImport = async (result: AiExerciseImport) => {
    const imported = importToPlaquetteSchema(result);
    if (!imported) {
      flash("Aucun schéma exploitable détecté. Tu peux corriger l’analyse puis réessayer.");
      return;
    }

    const previews = await renderSchemaPreviews(imported);

    setSysteme((current) => {
      const images = imported.entries.map((_entry, index) => previews[index] || "");
      const data = imported.entries.map((entry, index) => ({
        ...entry,
        imageData: images[index],
        phaseImages: images,
      }));

      const existing = syncSchemas(current.schemaImages, current.schemaDataList);
      const nextImages = [...existing.map((schema, i) => current.schemaImages[i] || schema.imageData || ""), ...images];
      const nextData = [...existing, ...data];

      return {
        ...current,
        schemaImages: nextImages,
        schemaDataList: syncSchemas(nextImages, nextData),
      };
    });

    const count = imported.phases.length;
    flash(`Import Vision terminé — ${count} phase${count > 1 ? "s" : ""} reconstruite${count > 1 ? "s" : ""}.`);
  };

  const systemSchemas = syncSchemas(systeme.schemaImages, systeme.schemaDataList);
  const drawingPreviews = systemSchemas
    .map((schema: any, index: number) => ({
      index,
      src: systeme.schemaImages[index] || schema?.imageData || schema?.phaseImages?.[schema?.current ?? 0] || schema?.phaseImages?.[0] || "",
    }))
    .filter((item) => !!item.src || !!systemSchemas[item.index]?.phases?.length);

  const openDraw = async (index?: number) => {
    if (drawingPending.current) return;
    drawingPending.current = true;
    setDrawingOpening(true);
    setDrawingOpenError("");
    try {
      const storageKey = `${draftKey}_storage_id`;
      const targetStorageId = editId || systemStorageId || drawingSessionStorage.getItem(storageKey) || crypto.randomUUID();
      const data = syncSchemas(systeme.schemaImages, systeme.schemaDataList);
      const context: Record<string, string | null> = {
        [storageKey]: targetStorageId,
        mybasket_drawing_flow: "insert-system-draft",
        mybasket_system_schema_room: String(Math.max(0, 50 - data.length)),
        [RETURN_KEY]: editId ? `/systemes/creer?id=${encodeURIComponent(editId)}` : "/systemes/creer",
        [CURRENT_SYSTEM_ID_KEY]: targetStorageId,
        [EDIT_SYSTEM_ID_KEY]: editId,
        [EDIT_INDEX_KEY]: null,
        [EDIT_SCHEMA_GROUP_KEY]: null,
        mybasket_current_exercise_id: null,
        mybasket_edit_exercise_id: null,
        mybasket_edit_systeme_id: null,
      };
      const schema = typeof index === "number" ? data[index] : null;
      const extra: Record<string, unknown> = { [LOAD_KEY]: null };
      if (schema && typeof index === "number") {
        const replaced = data.filter(item => item.schemaGroupId === schema.schemaGroupId).length;
        context[EDIT_INDEX_KEY] = String(index);
        context[EDIT_SCHEMA_GROUP_KEY] = schema.schemaGroupId;
        context.mybasket_system_schema_room = String(Math.max(0, 50 - data.length + replaced));
        extra[LOAD_KEY] = { ...schema, editIndex: index };
      }
      await preparePlaquetteNavigation(draftKey, { ...systeme, schemaDataList: data }, context, extra);
      setSystemStorageId(targetStorageId);
      window.location.assign(`/plaquette?mode=${schema ? "edit" : "insert"}&return=systeme`);
    } catch (error) {
      console.error("Ouverture du dessin impossible", error);
      setDrawingOpenError("Le dessin n’a pas pu s’ouvrir. Tes informations restent dans le formulaire. Réessaie.");
    } finally {
      drawingPending.current = false;
      setDrawingOpening(false);
    }
  };

  const removeSchema = (index: number) => {
    setSysteme((prev) => {
      const nextImages = prev.schemaImages.filter((_, i) => i !== index);
      const nextData = prev.schemaDataList.filter((_, i) => i !== index);

      return {
        ...prev,
        schemaImages: nextImages,
        schemaDataList: syncSchemas(nextImages, nextData),
      };
    });
  };

  const [attachmentMessage, setAttachmentMessage] = useState("");
  const onImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const { attached, warnings } = await readAttachedImages(files, 5 - systeme.images.length);
    setSysteme(current => ({ ...current, images: [...current.images, ...attached].slice(0, 5) }));
    setAttachmentMessage(warnings.join(" "));
  };

  const removeImage = (index: number) => {
    setSysteme((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

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

    const extension = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] || "png";
    const fileName = `${user.id}/${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

    const { error } = await supabase.storage
      .from("exercise-schemas")
      .upload(fileName, blob, {
        contentType: blob.type || "image/png",
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from("exercise-schemas")
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  const onVideos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = (event.target.files || [])[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () =>
      setSysteme((current) => ({
        ...current,
        videos: [reader.result as string],
      }));
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const removeVideo = () =>
    setSysteme((current) => ({
      ...current,
      videos: [],
    }));

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
    if (!systeme.title.trim()) {
      flash("Ajoute un titre à ton système");
      return;
    }

    if (!systemStorageId) {
      flash("Chargement du système en cours, réessaie dans une seconde");
      return;
    }

    setLoading(true);

    const id = editId || systeme.id || newSystemId();

    try {
      const uploadedImages = await Promise.all(
        systeme.images.map((image) =>
          uploadBase64Image(image, `systemes/${systemStorageId}/images`)
        )
      );

      const uploadedVideos = await Promise.all(
        systeme.videos.map((video) =>
          uploadBase64Video(video, `systemes/${systemStorageId}/videos`)
        )
      );

      const uploadedSchemaImages = await Promise.all(
        systeme.schemaImages.map((image) =>
          uploadBase64Image(
            image,
            `systemes/${systemStorageId}/schemas/imported`
          )
        )
      );

      const cleanSchemaDataList = syncSchemas(
        systeme.schemaImages,
        systeme.schemaDataList
      ).map((schema, index) => {
        const imageData =
          typeof schema?.imageData === "string" &&
          schema.imageData.startsWith("data:image")
            ? uploadedSchemaImages[index] || schema.imageData
            : schema?.imageData;

        const phaseImages = Array.isArray(schema?.phaseImages)
          ? schema.phaseImages.map((image: string) => {
              if (!image?.startsWith?.("data:image")) return image;

              const globalIndex = systeme.schemaImages.indexOf(image);
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
      });

      const payload: Systeme = {
        ...systeme,
        id,
        title: systeme.title.trim(),
        images: uploadedImages,
        videos: uploadedVideos,
        schemaImages: uploadedSchemaImages,
        schemaDataList: cleanSchemaDataList,
      };

      const systemPayload = {
        ...payload,
        schemaVideo: payload.schemaVideo ?? undefined,
      };

      const saved =
        editId || systeme.id
          ? await updateSystem(id, systemPayload)
          : await saveSystem(systemPayload);

      setLoading(false);

      if (!saved) {
        flash("Erreur lors de la sauvegarde");
        return;
      }

      // Les tags choisis dans DESSIN sont toujours appliqués à la fiche privée.
      // Playbook/Série restent facultatifs et ne créent jamais une seconde fiche système.
      const pendingPlaybook = readPendingPlaybookSelection();
      if (pendingPlaybook) {
        try {
          await attachSystemToPlaybook(saved, pendingPlaybook);
          clearPendingPlaybookSelection();
        } catch (linkError) {
          console.error('Erreur rattachement Playbook/Série', linkError);
          flash('Système enregistré, mais rattachement au Playbook à vérifier');
        }
      }

      drawingSessionStorage.removeItem(RETURN_KEY);
      await removePlaquetteTransfer(LOAD_KEY);
      await removePlaquetteTransfer(RESULT_KEY);
      await removePlaquetteTransfer(draftKey);
      drawingSessionStorage.removeItem(`${draftKey}_sync`);
      drawingSessionStorage.removeItem(EDIT_INDEX_KEY);
      drawingSessionStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);
      drawingSessionStorage.removeItem(EDIT_SYSTEM_ID_KEY);
      drawingSessionStorage.removeItem(CURRENT_SYSTEM_ID_KEY);

      flash(editId ? "Système mis à jour ✅" : "Système enregistré ✅");

      setTimeout(() => {
        router.push(`/systemes/${saved.id}`);
      }, 600);
    } catch (error) {
      console.error("Erreur sauvegarde système :", error);
      setLoading(false);
      flash("Erreur lors de la sauvegarde");
    }
  };

  return (
    <div className="cs">
      <style>{CSS}</style>

      <div className="cs-topbar">
        <button className="cs-retour" onClick={() => router.push("/systemes")}>
          ← Retour aux systèmes
        </button>

        <span className="cs-nouvel">
          {editId ? "✏️ MODIFIER LE SYSTÈME" : "+ NOUVEAU SYSTÈME"}
        </span>
      </div>

      <div className="cs-title">
        <span className="dash" />
        <h1>
          {editId ? "MODIFIER UN SYSTÈME DE JEU" : "CRÉER UN SYSTÈME DE JEU"}
        </h1>
        <span className="dash" />
      </div>

      <p className="cs-sub">
        Renseigne ton système, ajoute tes schémas, puis sélectionne uniquement
        sa base, sa catégorie et ses temps forts.
      </p>

      {loading && <div className="cs-loading">Chargement...</div>}

      <div className="cs-grid">
        <div className="cs-card">
          <label className="cs-lab">
            Titre du système <b className="req">*</b>
          </label>

          <input
            className="cs-input"
            value={systeme.title}
            placeholder="Ex : Système 32-Hammer en attaque demi-terrain"
            onChange={(e) => set("title", e.target.value)}
          />

          <label className="cs-lab">Objectif du système</label>
          <textarea
            className="cs-area"
            value={systeme.objectif}
            onChange={(e) => set("objectif", e.target.value)}
          />

          <label className="cs-lab">Organisation</label>
          <textarea
            className="cs-area"
            value={systeme.organisation}
            onChange={(e) => set("organisation", e.target.value)}
          />

          <label className="cs-lab">Déroulement</label>
          <textarea
            className="cs-area big"
            value={systeme.deroulement}
            onChange={(e) => set("deroulement", e.target.value)}
          />

          <label className="cs-lab">Consignes techniques</label>
          <textarea
            className="cs-area"
            value={systeme.consignes}
            onChange={(e) => set("consignes", e.target.value)}
          />

          <label className="cs-lab">Évolution / Variantes</label>
          <textarea
            className="cs-area"
            value={systeme.variantes}
            onChange={(e) => set("variantes", e.target.value)}
          />

          <label className="cs-lab">
            Schémas du système{" "}
            <span className="cs-soft">({drawingPreviews.length})</span>
          </label>

          <div className="cs-vision-import">
            <ExercisePhotoImport onImported={applyVisionImport} phaseRoom={Math.max(0, 50 - systemSchemas.length)} />
          </div>

          {drawingOpenError && <p role="alert">{drawingOpenError}</p>}
          <div className="cs-schemas">
            {drawingPreviews.map(({ src, index }) => (
              <div className="cs-schema" key={`${src}-${index}`}>
                {src ? <img src={src} alt={`Schéma ${index + 1}`} /> : <p>Phase {index + 1}</p>}

                <div className="cs-schema-actions">
                  <button type="button" disabled={drawingOpening || !draftReady} onClick={() => void openDraw(index)}>
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

            {systemSchemas.length < 50 && (
              <button type="button" className="cs-draw" disabled={drawingOpening || !draftReady} onClick={() => void openDraw()}>
                <span>✏️</span>
                <b>{drawingOpening ? "Ouverture du dessin…" : "Ajouter un schéma"}</b>
                <small>{systemSchemas.length}/50 phases ajoutées</small>
              </button>
            )}
          </div>

          <label className="cs-lab">Animation du système</label>

          <div className="cs-animation-source">
            <div className="cs-animation-icon">▶</div>
            <div style={{ flex: 1 }}>
              <b>Vidéo / Animation <span style={{fontWeight:500,opacity:.65}}>(1 max)</span></b>
              <p>
                Tu peux ajouter une vidéo au système comme pour un exercice.
                L’animation générée dans DESSIN reste indépendante et conservée.
              </p>
              {systeme.videos[0] ? (
                <div className="cs-video">
                  <video src={systeme.videos[0]} controls />
                  <button type="button" className="rm" onClick={removeVideo}>✕ Retirer la vidéo</button>
                </div>
              ) : (
                <button type="button" className="cs-addimg" onClick={() => vidInput.current?.click()}>
                  🎬 Ajouter une vidéo
                </button>
              )}
              <input ref={vidInput} type="file" accept="video/mp4,video/*" hidden onChange={onVideos} />
            </div>
          </div>

          <label className="cs-lab">
            Photos et dessins sur papier <span className="cs-soft">(5 max)</span>
          </label>

          <p>Ajoute plusieurs photos telles quelles. Pour obtenir des phases éditables, utilise « Scanner des schémas ».</p>
          {attachmentMessage && <p role="status">{attachmentMessage}</p>}
          <div className="cs-imgs">
            {systeme.images.map((src, index) => (
              <div className="cs-thumb" key={`${src}-${index}`}>
                <img src={src} alt="" />
                <button type="button" onClick={() => removeImage(index)}>
                  ✕
                </button>
              </div>
            ))}

            {systeme.images.length < 5 && (
              <button
                type="button"
                className="cs-add-img"
                onClick={() => imgInput.current?.click()}
              >
                📷 Joindre des images
              </button>
            )}

            <input
              ref={imgInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              multiple
              hidden
              onChange={onImages}
            />
          </div>
        </div>

        <div className="cs-card cs-criteres">
          <h2>CRITÈRES</h2>

          <label className="cs-lab" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>Tags de jeu <button type="button" onClick={addPersonalTempsFort}>+ Ajouter</button></label>

          <div className="cs-check-grid">
            {tempsFortsOptions.map((item) => (
              <label key={item} className="cs-check">
                <input
                  type="checkbox"
                  checked={systeme.tempsForts.includes(item)}
                  onChange={() => toggleArray("tempsForts", item)}
                />
                {item}
              </label>
            ))}
          </div>

          <label className="cs-lab">Catégorie</label>
          <select
            className="cs-select"
            value={systeme.categorie}
            onChange={(e) => set("categorie", e.target.value)}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <label className="cs-lab">Type de système</label>
          <div className="cs-radio-list">
            {types.map((item) => (
              <label key={item} className="cs-radio">
                <input
                  type="radio"
                  name="type"
                  checked={systeme.type === item}
                  onChange={() => set("type", item)}
                />
                {item}
              </label>
            ))}
          </div>



          <small className="cs-help">
            Sélectionne uniquement la base, la catégorie et les temps forts du système.
          </small>
        </div>
      </div>

      <div className="cs-actions">
        <button type="button" className="cs-btn ghost" onClick={() => router.back()}>
          Annuler
        </button>

        <button type="button" className="cs-btn save" onClick={save} disabled={loading}>
          💾 {editId ? "METTRE À JOUR LE SYSTÈME" : "SAUVEGARDER LE SYSTÈME"}
        </button>
      </div>

      {toast && <div className="cs-toast">{toast}</div>}
    </div>
  );
}

const CSS = `
.cs{font-family:'Roboto',system-ui,sans-serif;background:#fff;color:#0F0F12;max-width:1280px;margin:0 auto;padding:1.4rem 1.6rem 3rem}
.cs *{box-sizing:border-box}
.cs button{font-family:inherit;cursor:pointer}
.cs button:disabled{opacity:.55;cursor:not-allowed}
.cs img{display:block;max-width:100%}
.cs-loading{background:#fff8ec;border:1px solid #f6d29b;color:#8a5a00;border-radius:12px;padding:.8rem 1rem;margin:1rem 0;font-weight:800}
.cs-topbar{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.cs-retour{border:2px solid #0F0F12;background:#fff;border-radius:999px;padding:.5rem 1.1rem;font-weight:800;font-size:.95rem}
.cs-retour:hover{background:#0F0F12;color:#fff}
.cs-nouvel{font-weight:900;color:#777;letter-spacing:.04em}
.cs-title{display:flex;align-items:center;justify-content:center;gap:1.2rem;margin:1.2rem 0 .3rem}
.cs-title h1{font-weight:900;font-size:2.35rem;letter-spacing:.02em;text-align:center;margin:0}
.cs-title .dash{height:4px;width:58px;background:#0F0F12;display:inline-block}
.cs-sub{text-align:center;color:#666;max-width:760px;margin:0 auto 1.6rem}
.cs-grid{display:grid;grid-template-columns:2fr 1.25fr;gap:1.6rem;align-items:start}
.cs-card{background:#fff;border:1px solid #e4e4e4;border-radius:18px;padding:1.4rem;box-shadow:0 2px 12px rgba(0,0,0,.04)}
.cs-lab{display:block;font-weight:900;text-transform:uppercase;font-size:.82rem;letter-spacing:.03em;margin:1rem 0 .4rem}
.cs-lab:first-of-type{margin-top:0}
.cs-soft{font-weight:500;text-transform:none;color:#888}
.req{color:#C0392B}
.cs-input,.cs-area,.cs-select{width:100%;border:1px solid #d6d6d6;border-radius:10px;padding:.7rem .9rem;font-size:.95rem;font-family:inherit;background:#f7f7f7}
.cs-input:focus,.cs-area:focus,.cs-select:focus{outline:2px solid #6B1A2C;border-color:#6B1A2C;background:#fff}
.cs-area{min-height:105px;resize:vertical}
.cs-area.big{min-height:150px}
.cs-help{display:block;color:#777;font-size:.78rem;margin-top:.35rem}
.cs-vision-import{margin:.55rem 0 1rem}
.cs-schemas{display:grid;grid-template-columns:repeat(2,1fr);gap:.8rem}
.cs-draw{min-height:170px;width:100%;border:2px dashed #cfcfcf;background:#f6f6f6;border-radius:14px;padding:1.2rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.3rem}
.cs-draw:hover{background:#f0f0f0;border-color:#6B1A2C}
.cs-draw span{font-size:1.8rem}
.cs-draw b{font-size:1.05rem}
.cs-draw small{color:#888}
.cs-schema{border:1px solid #e0e0e0;border-radius:14px;overflow:hidden;background:#fafafa}
.cs-schema img{width:100%;height:190px;object-fit:contain;background:#fff}
.cs-schema-actions{display:flex;gap:.6rem;padding:.7rem;border-top:1px solid #eee}
.cs-schema-actions button{flex:1;border:1px solid #d6d6d6;background:#fff;border-radius:8px;padding:.45rem .8rem;font-weight:700;font-size:.85rem}
.cs-schema-actions .rm,.cs-video .rm{color:#C0392B;border-color:#F2C3C3}
.cs-video{border:1px solid #e0e0e0;border-radius:12px;overflow:hidden}
.cs-video video{width:100%;display:block;background:#000;max-height:320px}
.cs-video .rm{width:100%;border:none;border-top:1px solid #eee;background:#fff;padding:.5rem;font-weight:700;font-size:.85rem}
.cs-animation-source{display:flex;gap:.8rem;align-items:flex-start;border:1px solid #e4ddd5;background:#faf8f5;border-radius:12px;padding:.9rem 1rem;color:#333}
.cs-animation-icon{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:#6B1A2C;color:#fff;font-size:.8rem;padding-left:2px}
.cs-animation-source b{display:block;color:#6B1A2C;font-size:.9rem;margin-bottom:.2rem}
.cs-animation-source p{margin:0;color:#6f6f6f;font-size:.8rem;line-height:1.45}
.cs-imgs{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
.cs-thumb{position:relative;width:90px;height:90px;border-radius:10px;overflow:hidden;border:1px solid #ddd}
.cs-thumb img{width:100%;height:100%;object-fit:cover}
.cs-thumb button{position:absolute;top:3px;right:3px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(0,0,0,.65);color:#fff;font-size:.7rem}
.cs-add-img{border:2px dashed #D4A24C;color:#B8860B;background:#fff;border-radius:10px;padding:.7rem 1rem;font-weight:700;font-size:.9rem}
.cs-add-img:hover{background:#FFF8EC}
.cs-criteres h2{font-weight:900;font-size:1.3rem;letter-spacing:.02em;border-bottom:2px solid #eee;padding-bottom:.6rem;margin:0 0 .8rem}
.cs-check-grid{display:grid;grid-template-columns:1fr 1fr;gap:.45rem}
.cs-check,.cs-radio,.cs-tag{display:flex;align-items:center;gap:.5rem;background:#f6f6f6;border:1px solid #ececec;border-radius:8px;padding:.55rem .7rem;font-size:.9rem}
.cs-check input,.cs-radio input,.cs-tag input{width:16px;height:16px;accent-color:#6B1A2C}
.cs-radio-list{display:grid;grid-template-columns:1fr;gap:.45rem}
.cs-tags{display:grid;grid-template-columns:1fr 1fr;gap:.45rem}
.cs-actions{display:flex;justify-content:flex-end;gap:.8rem;margin-top:1.6rem}
.cs-btn{border-radius:999px;padding:.8rem 1.5rem;font-weight:800;font-size:.95rem;border:2px solid #0F0F12;background:#fff;color:#0F0F12}
.cs-btn.ghost:hover{background:#f2f2f2}
.cs-btn.save{background:#0F0F12;color:#fff;letter-spacing:.02em}
.cs-btn.save:hover{background:#000}
.cs-toast{position:fixed;bottom:1.2rem;left:50%;transform:translateX(-50%);background:#0F0F12;color:#fff;padding:.6rem 1.1rem;border-radius:10px;font-weight:600;font-size:.9rem;z-index:5000;box-shadow:0 8px 24px rgba(0,0,0,.3)}
@media (max-width:900px){
  .cs-grid,.cs-schemas{grid-template-columns:1fr}
  .cs-title h1{font-size:1.8rem}
  .cs-title .dash{width:28px}
  .cs-actions{flex-wrap:wrap}
  .cs-check-grid,.cs-tags{grid-template-columns:1fr}
}
`;
