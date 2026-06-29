"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  saveSystem,
  updateSystem,
  getSystem,
  newSystemId,
  type SystemItem,
} from "@/lib/systems";
import { uploadSchemaImage } from "@/lib/supabase/upload-schema";

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
  createdAt?: string | number;
};

const RETURN_KEY = "mb_plaquette_return_to";
const LOAD_KEY = "mybasket_plaquette_load";
const RESULT_KEY = "mybasket_plaquette_result";
const EDIT_INDEX_KEY = "mybasket_edit_schema_index";
const EDIT_SCHEMA_GROUP_KEY = "mybasket_edit_schema_group_id";
const EDIT_SYSTEM_ID_KEY = "mybasket_edit_system_id";
const CURRENT_SYSTEM_ID_KEY = "mybasket_current_system_id";

const DEFAULT_FAMILLES = ["Offensif", "Défensif", "Transition", "Remise en jeu"];

const DEFAULT_TEMPS_FORTS = [
  "Pick top",
  "Pick side",
  "Pick the picker",
  "Hand-off",
  "Isolation",
  "Post-up",
  "Double drag",
  "Flex cut",
];

const DEFAULT_CATEGORIES = ["U13", "U15", "U18", "U21", "Seniors"];

const DEFAULT_TYPES = [
  "BLOB",
  "SLOB",
  "Attaque demi-terrain Homme à homme",
  "Attaque demi-terrain Zone",
  "ATO",
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

function adminList(key: string, fallback: string[]) {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(`mybasket_admin_${key}`);
    const parsed = raw ? JSON.parse(raw) : null;

    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}

  return fallback;
}

const blank = (): Systeme => ({
  title: "",
  objectif: "",
  organisation: "",
  deroulement: "",
  consignes: "",
  variantes: "",
  famille: "Offensif",
  categorie: "U18",
  type: "Attaque demi-terrain Homme à homme",
  tempsForts: [],
  tags: [],
  images: [],
  videos: [],
  schemaImages: [],
  schemaDataList: [],
});

function systemToForm(system: SystemItem): Systeme {
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
    type: system.type || "Attaque demi-terrain Homme à homme",
    tempsForts: system.tempsForts || [],
    tags: system.tags || [],
    images: system.images || [],
    videos: system.videos || [],
    schemaImages: system.schemaImages || [],
    schemaDataList: system.schemaDataList || [],
    createdAt: system.createdAt,
  };
}

export default function SystemesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const editId = searchParams.get("id");
  const isNew = searchParams.get("new") === "1";

  const imgInput = useRef<HTMLInputElement | null>(null);
  const vidInput = useRef<HTMLInputElement | null>(null);
  const toastT = useRef<number | null>(null);

  const [systeme, setSysteme] = useState<Systeme>(blank());
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const [familles, setFamilles] = useState(DEFAULT_FAMILLES);
  const [tempsFortsOptions, setTempsFortsOptions] = useState(DEFAULT_TEMPS_FORTS);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [types, setTypes] = useState(DEFAULT_TYPES);
  const [tagsOptions, setTagsOptions] = useState(DEFAULT_TAGS);

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
    setFamilles(adminList("systeme_familles", DEFAULT_FAMILLES));
    setTempsFortsOptions(adminList("systeme_temps_forts", DEFAULT_TEMPS_FORTS));
    setCategories(DEFAULT_CATEGORIES);
    setTypes(DEFAULT_TYPES);
    setTagsOptions(adminList("systeme_tags", DEFAULT_TAGS));
  }, []);

  useEffect(() => {
    const load = async () => {
      let base = blank();

      try {
        const resultRaw = localStorage.getItem(RESULT_KEY);

        if (isNew) {
          localStorage.removeItem(RETURN_KEY);
          localStorage.removeItem(LOAD_KEY);
          localStorage.removeItem(RESULT_KEY);
          localStorage.removeItem(EDIT_INDEX_KEY);
          localStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);
          localStorage.removeItem(EDIT_SYSTEM_ID_KEY);
          localStorage.removeItem(CURRENT_SYSTEM_ID_KEY);
          setSysteme(blank());
          return;
        }

        if (editId) {
          setLoading(true);

          const existing = await getSystem(editId);

          if (existing) {
            base = systemToForm(existing);

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

        if (resultRaw) {
          const result = JSON.parse(resultRaw);

          const incomingImages = Array.isArray(result.schemaImages)
            ? result.schemaImages
            : [];

          const incomingData = Array.isArray(result.schemaDataList)
            ? result.schemaDataList
            : [];

          const editIndex =
            typeof result.editIndex === "number" ? result.editIndex : null;

          const editedGroupId =
            result.schemaGroupId ||
            (editIndex !== null
              ? base.schemaDataList[editIndex]?.schemaGroupId
              : null);

          if (editedGroupId) {
            const firstIndex = base.schemaDataList.findIndex(
              (item) => item?.schemaGroupId === editedGroupId
            );

            const keepImages = base.schemaImages.filter(
              (_, idx) => base.schemaDataList[idx]?.schemaGroupId !== editedGroupId
            );

            const keepData = base.schemaDataList.filter(
              (item) => item?.schemaGroupId !== editedGroupId
            );

            const insertAt = firstIndex >= 0 ? firstIndex : keepImages.length;

            keepImages.splice(insertAt, 0, ...incomingImages);
            keepData.splice(insertAt, 0, ...incomingData);

            base = {
              ...base,
              schemaImages: keepImages.slice(0, 50),
              schemaDataList: keepData.slice(0, 50),
            };
          } else {
            base = {
              ...base,
              schemaImages: [...base.schemaImages, ...incomingImages].slice(0, 50),
              schemaDataList: [...base.schemaDataList, ...incomingData].slice(0, 50),
            };
          }

          localStorage.removeItem(RESULT_KEY);
          localStorage.removeItem(EDIT_INDEX_KEY);
          localStorage.removeItem(LOAD_KEY);
          localStorage.removeItem(RETURN_KEY);
          localStorage.removeItem(EDIT_SYSTEM_ID_KEY);
          localStorage.removeItem(CURRENT_SYSTEM_ID_KEY);
          localStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);

          flash("Schéma ajouté au système ✅");
        }

        setSysteme(base);
      } catch (error) {
        console.error(error);
        setLoading(false);
        flash("Erreur lors du chargement");
      }
    };

    load();
  }, [editId, isNew]);

  const saveDraftBeforeDraw = async () => {
    if (!systeme.title.trim()) {
      flash("Ajoute un titre avant d’ouvrir la plaquette");
      return null;
    }

    const id = editId || systeme.id || newSystemId();

    const payload: Systeme = {
      ...systeme,
      id,
      title: systeme.title.trim(),
    };

    const saved =
      editId || systeme.id
        ? await updateSystem(id, payload)
        : await saveSystem(payload);

    if (!saved) {
      flash("Impossible d’enregistrer le système avant la plaquette");
      return null;
    }

    setSysteme(systemToForm(saved));

    if (!editId) {
      router.replace(`/systemes/creer?id=${saved.id}`);
    }

    return saved;
  };

  const openDraw = async (index?: number) => {
    const saved = await saveDraftBeforeDraw();

    if (!saved) return;

    const currentId = saved.id;

    localStorage.setItem(EDIT_SYSTEM_ID_KEY, currentId);
    localStorage.setItem(CURRENT_SYSTEM_ID_KEY, currentId);

    localStorage.removeItem(LOAD_KEY);
    localStorage.removeItem(RESULT_KEY);
    localStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);

    if (typeof index === "number") {
      localStorage.setItem(EDIT_INDEX_KEY, String(index));

      const schemaData = saved.schemaDataList?.[index];
      const schemaImage = saved.schemaImages?.[index];

      const schemaGroupId = schemaData?.schemaGroupId || crypto.randomUUID();

      localStorage.setItem(EDIT_SCHEMA_GROUP_KEY, schemaGroupId);

      const loadPayload = {
        title: schemaData?.title || `Schéma ${index + 1}`,
        schemaGroupId,
        courtType: schemaData?.courtType || "half",
        phases: Array.isArray(schemaData?.phases) ? schemaData.phases : [],
        sheet: schemaData?.sheet ?? null,
        current:
          typeof schemaData?.current === "number"
            ? schemaData.current
            : typeof schemaData?.phaseIndex === "number"
            ? schemaData.phaseIndex
            : 0,
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

    localStorage.setItem(RETURN_KEY, `/systemes/creer?id=${currentId}`);

    router.push(
      typeof index === "number"
        ? "/plaquette?type=systeme&mode=edit"
        : "/plaquette?type=systeme&mode=new"
    );
  };

  const removeSchema = (index: number) => {
    setSysteme((prev) => {
      const removedGroupId = prev.schemaDataList[index]?.schemaGroupId;

      if (removedGroupId) {
        return {
          ...prev,
          schemaImages: prev.schemaImages.filter(
            (_, idx) => prev.schemaDataList[idx]?.schemaGroupId !== removedGroupId
          ),
          schemaDataList: prev.schemaDataList.filter(
            (item) => item?.schemaGroupId !== removedGroupId
          ),
        };
      }

      return {
        ...prev,
        schemaImages: prev.schemaImages.filter((_, i) => i !== index),
        schemaDataList: prev.schemaDataList.filter((_, i) => i !== index),
      };
    });
  };

  const onImages = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const room = 5 - systeme.images.length;

    files.slice(0, room).forEach((file) => {
      const reader = new FileReader();

      reader.onload = () => {
        setSysteme((prev) => ({
          ...prev,
          images: [...prev.images, reader.result as string].slice(0, 5),
        }));
      };

      reader.readAsDataURL(file);
    });

    event.target.value = "";
  };

  const removeImage = (index: number) => {
    setSysteme((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const onVideos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      setSysteme((prev) => ({
        ...prev,
        videos: [reader.result as string],
      }));
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const removeVideo = () => {
    setSysteme((prev) => ({
      ...prev,
      videos: [],
    }));
  };

  const save = async () => {
    if (!systeme.title.trim()) {
      flash("Ajoute un titre à ton système");
      return;
    }

    setLoading(true);

    const id = editId || systeme.id || newSystemId();

    const uploadedImages = await Promise.all(
      systeme.images.map(async (img) => {
        if (img.startsWith("http")) return img;
        return uploadSchemaImage(img, "systemes-images");
      })
    );

    const payload: Systeme = {
      ...systeme,
      id,
      title: systeme.title.trim(),
      images: uploadedImages,
      schemaImages: systeme.schemaImages,
      schemaDataList: systeme.schemaDataList.map((schema, index) => ({
        title: schema?.title ?? `Schéma ${index + 1}`,
        schemaGroupId: schema?.schemaGroupId ?? crypto.randomUUID(),
        phaseIndex:
          typeof schema?.phaseIndex === "number" ? schema.phaseIndex : index,
        courtType: schema?.courtType ?? "half",
        phases: Array.isArray(schema?.phases) ? schema.phases : [],
        sheet: schema?.sheet ?? null,
        current: typeof schema?.current === "number" ? schema.current : index,
        imageData: schema?.imageData ?? systeme.schemaImages[index] ?? "",
        phaseImages: Array.isArray(schema?.phaseImages)
          ? schema.phaseImages
          : systeme.schemaImages[index]
          ? [systeme.schemaImages[index]]
          : [],
        editable: true,
      })),
    };

    const saved =
      editId || systeme.id
        ? await updateSystem(id, payload)
        : await saveSystem(payload);

    setLoading(false);

    if (!saved) {
      flash("Erreur lors de la sauvegarde");
      return;
    }

    localStorage.removeItem(RETURN_KEY);
    localStorage.removeItem(LOAD_KEY);
    localStorage.removeItem(RESULT_KEY);
    localStorage.removeItem(EDIT_INDEX_KEY);
    localStorage.removeItem(EDIT_SCHEMA_GROUP_KEY);
    localStorage.removeItem(EDIT_SYSTEM_ID_KEY);
    localStorage.removeItem(CURRENT_SYSTEM_ID_KEY);

    flash(editId ? "Système mis à jour ✅" : "Système enregistré ✅");

    setTimeout(() => {
      router.push(`/systemes/${saved.id}`);
    }, 600);
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
        Renseigne ton système, ajoute tes schémas, puis classe-le avec les tags
        configurables depuis le dashboard admin.
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
            <span className="cs-soft">({systeme.schemaImages.length})</span>
          </label>

          <div className="cs-schemas">
            {systeme.schemaImages.map((src, index) => (
              <div className="cs-schema" key={`${src}-${index}`}>
                <img src={src} alt={`Schéma ${index + 1}`} />

                <div className="cs-schema-actions">
                  <button type="button" onClick={() => openDraw(index)}>
                    ✏️ Modifier
                  </button>
                  <button type="button" className="rm" onClick={() => removeSchema(index)}>
                    ✕ Retirer
                  </button>
                </div>
              </div>
            ))}

            {systeme.schemaImages.length < 50 && (
              <button type="button" className="cs-draw" onClick={() => openDraw()}>
                <span>✏️</span>
                <b>Ajouter un schéma</b>
                <small>{systeme.schemaImages.length}/50 phases ajoutées</small>
              </button>
            )}
          </div>

          <label className="cs-lab">
            Vidéo / Animation <span className="cs-soft">(1 max)</span>
          </label>

          {systeme.videos[0] ? (
            <div className="cs-video">
              <video src={systeme.videos[0]} controls />
              <button type="button" className="rm" onClick={removeVideo}>
                ✕ Retirer
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="cs-add-video"
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

          <label className="cs-lab">
            Images / Documents <span className="cs-soft">(5 max)</span>
          </label>

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

        <div className="cs-card cs-criteres">
          <h2>CRITÈRES</h2>

          <label className="cs-lab">Temps forts</label>

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

          <label className="cs-lab">Tags</label>
          <div className="cs-tags">
            {tagsOptions.map((tag) => (
              <label key={tag} className="cs-tag">
                <input
                  type="checkbox"
                  checked={systeme.tags.includes(tag)}
                  onChange={() => toggleArray("tags", tag)}
                />
                #{tag}
              </label>
            ))}
          </div>

          <small className="cs-help">
            Les tags sont prévus pour être modifiés depuis le dashboard admin.
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
.cs-add-video{border:2px dashed #6B1A2C;color:#6B1A2C;background:#fff;border-radius:10px;padding:.7rem 1rem;font-weight:700;font-size:.9rem;text-align:center}
.cs-add-video:hover{background:#FBEFF1}
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