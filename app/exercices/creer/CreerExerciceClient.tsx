"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveExercise, updateExercise, getExercise } from "@/lib/exercises";

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

const NUM = (n: number) => Array.from({ length: n + 1 }, (_, i) => String(i));

const CATS = ["— Choisir —", "U9", "U11", "U13", "U15", "U18", "U21", "Senior"];

const TYPES = ["Individuel", "Pré-co", "Collectif"];

const NIVEAUX = ["Débutant", "Intermédiaire", "Confirmé"];

const TEMPS = ["5", "10", "15", "20", "25", "30", "40", "45", "60", "75", "90"];

const THEMES = [
  "Échauffement",
  "Dribble",
  "Passe",
  "Défense",
  "Tir",
  "Pré-co",
  "Surnombre",
  "Ludique",
  "Rebonds",
  "Physique",
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

function normalizeSchemaData(schema: any, index: number, image = "") {
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

function syncSchemas(images: string[], dataList: any[]) {
  return images.map((image, index) =>
    normalizeSchemaData(dataList[index], index, image)
  );
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
        const resultRaw = localStorage.getItem(RESULT_KEY);
        const draftRaw = localStorage.getItem(draftKey);

        if (draftRaw) {
          base = {
            ...base,
            ...JSON.parse(draftRaw),
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

        if (resultRaw) {
          const result = JSON.parse(resultRaw);

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

            if (
              editIndex !== null &&
              Number.isFinite(editIndex) &&
              editIndex >= 0 &&
              editIndex < nextImages.length
            ) {
              nextImages.splice(editIndex, 1, ...incomingImages);

              nextData.splice(
                editIndex,
                1,
                ...incomingImages.map((image, index) =>
                  normalizeSchemaData(incomingData[index], editIndex + index, image)
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

          localStorage.removeItem(RESULT_KEY);
          localStorage.removeItem(EDIT_INDEX_KEY);
          localStorage.removeItem(LOAD_KEY);
          localStorage.removeItem(RETURN_KEY);
          localStorage.removeItem(EDIT_EXERCISE_ID_KEY);
          localStorage.removeItem("mybasket_edit_schema_group_id");
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
    try {
      localStorage.setItem(draftKey, JSON.stringify(ex));
    } catch {}
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

    try {
      const cleanDataList = syncSchemas(ex.schemaImages, ex.schemaDataList);

      localStorage.setItem(
        draftKey,
        JSON.stringify({
          ...ex,
          schemaDataList: cleanDataList,
        })
      );

      localStorage.setItem("mybasket_current_exercise_id", exerciseStorageId);

      localStorage.removeItem(LOAD_KEY);
      localStorage.removeItem(RESULT_KEY);
      localStorage.removeItem("mybasket_edit_schema_group_id");

      if (typeof index === "number") {
        localStorage.setItem(EDIT_INDEX_KEY, String(index));

        const schemaData = cleanDataList[index];
        const schemaImage = ex.schemaImages[index];

        const loadPayload = {
          title: schemaData?.title || `Schéma ${index + 1}`,
          editIndex: index,
          schemaGroupId: schemaData?.schemaGroupId || crypto.randomUUID(),
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

        localStorage.setItem(LOAD_KEY, JSON.stringify(loadPayload));
      } else {
        localStorage.removeItem(EDIT_INDEX_KEY);
      }

      if (editId) {
        localStorage.setItem(EDIT_EXERCISE_ID_KEY, editId);
        localStorage.setItem(RETURN_KEY, `/exercices/creer?id=${editId}`);
      } else {
        localStorage.removeItem(EDIT_EXERCISE_ID_KEY);
        localStorage.setItem(RETURN_KEY, "/exercices/creer");
      }

      router.push(
        typeof index === "number" ? "/plaquette?mode=edit" : "/plaquette?mode=new"
      );
    } catch (error) {
      console.error(error);
      flash("Erreur avant ouverture de la plaquette");
    }
  };

  const removeSchema = (index: number) =>
    setEx((current) => {
      const nextImages = current.schemaImages.filter((_, itemIndex) => itemIndex !== index);
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

    const { data } = supabase.storage.from("exercise-schemas").getPublicUrl(fileName);

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

      const cleanSchemaDataList = syncSchemas(ex.schemaImages, ex.schemaDataList);

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
        schemaImages: ex.schemaImages,
        videos: ex.videos.filter((video) => !video.startsWith("data:")),
        schemaDataList: cleanSchemaDataList,
      };

      const saved = editId
        ? await updateExercise(editId, payload)
        : await saveExercise(payload);

      if (!saved) {
        flash("Erreur Supabase : exercice non enregistré");
        return;
      }

      localStorage.removeItem(draftKey);
      localStorage.removeItem(RESULT_KEY);
      localStorage.removeItem(EDIT_INDEX_KEY);
      localStorage.removeItem(LOAD_KEY);
      localStorage.removeItem(RETURN_KEY);
      localStorage.removeItem(EDIT_EXERCISE_ID_KEY);
      localStorage.removeItem("mybasket_edit_schema_group_id");
      localStorage.removeItem("mybasket_current_exercise_id");
      localStorage.removeItem(`${draftKey}_storage_id`);

      const goId = saved?.id ?? editId;

      flash("Exercice enregistré ✅");

      setTimeout(() => {
        if (goId) router.push(`/exercices/${goId}`);
        else router.push("/mon-compte/exercices");
      }, 600);
    } catch (error) {
      console.error(error);
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
@media (max-width:900px){.ce-grid,.ce-schemas{grid-template-columns:1fr}.ce-title h1{font-size:1.8rem}.ce-title .dash{width:28px}.ce-actions{flex-wrap:wrap}}
`;