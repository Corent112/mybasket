"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  listPlaybooks,
  addSystemToPlaybook,
  type Playbook,
  type PlaybookCategory,
} from "@/lib/playbook";
import { getSystem, deleteSystem, type SystemItem } from "@/lib/systems";

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

function systemCategoryToPlaybookCategory(
  value?: string | null
): PlaybookCategory {
  const v = (value || "").toUpperCase();

  if (v.includes("BLOB")) return "BLOB";
  if (v.includes("SLOB")) return "SLOB";
  if (v.includes("ATO")) return "ATO";

  return "Système demi-terrain";
}

export default function SystemeDetailClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [systeme, setSysteme] = useState<SystemItem | null>(null);
  const [ready, setReady] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentImage, setCurrentImage] = useState(0);

  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [playbookModalOpen, setPlaybookModalOpen] = useState(false);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState("");
  const [addingPlaybook, setAddingPlaybook] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/abonnements");
          return;
        }

        if (!id) {
          setReady(true);
          return;
        }

        const data = await getSystem(id);
        setSysteme(data);
      } catch (error) {
        console.error("Erreur chargement système :", error);
        setSysteme(null);
      } finally {
        setReady(true);
      }
    }

    load();
  }, [id, router]);

  async function remove() {
    if (!id) return;

    const ok = window.confirm("Supprimer définitivement ce système ?");
    if (!ok) return;

    setDeleting(true);
    await deleteSystem(id);
    setDeleting(false);

    router.push("/systemes");
  }

  async function openPlaybookModal() {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/abonnements");
      return;
    }

    const data = await listPlaybooks();

    if (data.length === 0) {
      alert("Tu dois d’abord créer un playbook dans Mon compte.");
      router.push("/mon-compte?tab=playbooks");
      return;
    }

    setPlaybooks(data);
    setSelectedPlaybookId(data[0].id);
    setPlaybookModalOpen(true);
  }

  async function addToPlaybook() {
    if (!systeme || !selectedPlaybookId) return;

    try {
      setAddingPlaybook(true);

      await addSystemToPlaybook({
        playbook_id: selectedPlaybookId,
        system_id: systeme.id,
        title: systeme.title || "Système sans titre",
        category: systemCategoryToPlaybookCategory(
          `${systeme.type || ""} ${systeme.categorie || ""}`
        ),
        description: systeme.objectif || systeme.organisation || "",
        schema_images: systeme.schemaImages ?? [],
        schema_data_list: systeme.schemaDataList ?? [],
        tags: systeme.tags ?? [],
      });

      window.location.href = `/mon-compte/playbooks/${selectedPlaybookId}`;
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Erreur ajout playbook");
    } finally {
      setAddingPlaybook(false);
    }
  }

  function goEdit() {
    router.push(`/systemes/creer?id=${id}`);
  }

  const steps = useMemo(() => normalizeList(systeme?.deroulement), [systeme]);
  const consignes = useMemo(() => normalizeList(systeme?.consignes), [systeme]);
  const variantes = useMemo(() => normalizeList(systeme?.variantes), [systeme]);

  const sliderItems = useMemo(() => {
    if (!systeme) return [];

    const images = [
      ...((systeme.schemaImages || []) as string[]),
      ...((systeme.images || []) as string[]),
    ].filter(Boolean);

    const videos = ((systeme.videos || []) as string[]).filter(Boolean);

    return [
      ...images.map((src) => ({ type: "image" as const, src })),
      ...videos.map((src) => ({ type: "video" as const, src })),
    ];
  }, [systeme]);

  useEffect(() => {
    if (currentImage >= sliderItems.length) {
      setCurrentImage(0);
    }
  }, [currentImage, sliderItems.length]);

  if (!ready) {
    return <main className="ed-page">Chargement...</main>;
  }

  if (!systeme) {
    return (
      <main className="ed-page">
        <p>Système introuvable.</p>

        <button className="ed-btn ghost" onClick={() => router.push("/systemes")}>
          ← Retour aux systèmes
        </button>

        <style jsx>{CSS}</style>
      </main>
    );
  }

  const videos = (systeme.videos || []) as string[];
  const tags = (systeme.tags || []) as string[];
  const tempsForts = (systeme.tempsForts || []) as string[];

  return (
    <main className="ed-page">
      <div className="ed-top">
        <button className="ed-back" onClick={() => router.push("/systemes")}>
          ← Retour aux systèmes
        </button>

        <div className="ed-top-actions">
          <button className="ed-btn ghost" onClick={goEdit}>
            Modifier
          </button>

          <button className="ed-btn danger" onClick={remove} disabled={deleting}>
            {deleting ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      </div>

      <section className="ed-hero">
        <div>
          <div className="ed-kicker">SYSTÈME BASKETBALL</div>

          <h1>{systeme.title || "Système sans titre"}</h1>

          <p>
            {systeme.objectif ||
              systeme.organisation ||
              "Fiche système MyBasket"}
          </p>

          <div className="ed-badges">
            <span>Public</span>
            <span>Validé</span>
          </div>

          <div className="ed-main-actions">
            <button type="button" className="primary" onClick={openPlaybookModal}>
              Ajouter à mon playbook
            </button>

            <button
              type="button"
              className="gold"
              onClick={() => alert("Ajouté aux favoris")}
            >
              Ajouter aux favoris
            </button>

            <button type="button" onClick={goEdit}>
              Modifier
            </button>
          </div>
        </div>

        <div className="ed-hero-info">
          <div>
            <span>FAMILLE</span>
            <b>{systeme.famille || "—"}</b>
          </div>

          <div>
            <span>TYPE</span>
            <b>{systeme.type || "—"}</b>
          </div>

          <div>
            <span>CATÉGORIE</span>
            <b>{systeme.categorie || "—"}</b>
          </div>
        </div>
      </section>

      <section className="ed-layout">
        <div className="ed-main">
          <div className="ed-card">
            <h2>DESSIN DU SYSTÈME</h2>

            {sliderItems.length > 0 ? (
              <div className="ed-slider">
                {sliderItems.length > 1 && (
                  <button
                    className="slider-btn"
                    onClick={() =>
                      setCurrentImage(
                        currentImage === 0
                          ? sliderItems.length - 1
                          : currentImage - 1
                      )
                    }
                  >
                    ‹
                  </button>
                )}

                {sliderItems[currentImage]?.type === "video" ? (
                  <video
                    className="ed-schema"
                    src={sliderItems[currentImage].src}
                    controls
                  />
                ) : (
                  <img
                    className="ed-schema"
                    src={sliderItems[currentImage]?.src}
                    alt="Schéma du système"
                  />
                )}

                {sliderItems.length > 1 && (
                  <button
                    className="slider-btn"
                    onClick={() =>
                      setCurrentImage(
                        currentImage === sliderItems.length - 1
                          ? 0
                          : currentImage + 1
                      )
                    }
                  >
                    ›
                  </button>
                )}
              </div>
            ) : (
              <div className="ed-empty">Aucun schéma</div>
            )}
          </div>

          {sliderItems.length > 1 && (
            <div className="ed-thumbs">
              {sliderItems.map((item, index) => (
                <button
                  key={index}
                  className={
                    currentImage === index ? "ed-thumb active" : "ed-thumb"
                  }
                  onClick={() => setCurrentImage(index)}
                >
                  {item.type === "video" ? (
                    <div className="video-thumb">▶</div>
                  ) : (
                    <img src={item.src} alt="" />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="ed-card">
            <h2>OBJECTIF</h2>
            <p>{systeme.objectif || "—"}</p>
          </div>

          <div className="ed-card">
            <h2>ORGANISATION</h2>
            <p>{systeme.organisation || "—"}</p>
          </div>

          <div className="ed-card">
            <h2>DÉROULEMENT</h2>
            {steps.length > 0 ? (
              <ol className="ed-steps">
                {steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            ) : (
              <p>—</p>
            )}
          </div>

          <div className="ed-card">
            <h2>CONSIGNES TECHNIQUES</h2>
            {consignes.length > 0 ? (
              <ul className="ed-list">
                {consignes.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </div>

          <div className="ed-card">
            <h2>ÉVOLUTION / VARIANTES</h2>
            {variantes.length > 0 ? (
              <ul className="ed-list orange">
                {variantes.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </div>

          <div className="ed-media-grid">
            <div className="ed-card">
              <h2>VIDÉO / ANIMATION</h2>

              {videos[0] ? (
                <video src={videos[0]} controls className="ed-video" />
              ) : (
                <div className="ed-empty small">Aucune vidéo</div>
              )}
            </div>

            <div className="ed-card">
              <h2>IMAGES / SCHÉMAS</h2>

              {sliderItems.filter((item) => item.type === "image").length > 0 ? (
                <div className="ed-gallery">
                  {sliderItems
                    .filter((item) => item.type === "image")
                    .slice(0, 4)
                    .map((item, index) => (
                      <img key={index} src={item.src} alt="" />
                    ))}
                </div>
              ) : (
                <div className="ed-empty small">Aucune image</div>
              )}
            </div>
          </div>
        </div>

        <aside className="ed-side">
          <div className="ed-card sticky">
            <h2>CRITÈRES</h2>

            <div className="ed-criteria">
              <Row label="Famille" value={systeme.famille} />
              <Row label="Catégorie" value={systeme.categorie} />
              <Row label="Type" value={systeme.type} badge />
              <Row
                label="Schémas"
                value={String(systeme.schemaImages?.length || 0)}
              />
              <Row label="Vidéos" value={String(systeme.videos?.length || 0)} />
            </div>

            <h3>TEMPS FORTS</h3>

            {tempsForts.length > 0 ? (
              <div className="ed-themes">
                {tempsForts.map((item) => (
                  <span key={item}>✓ {item}</span>
                ))}
              </div>
            ) : (
              <p className="ed-muted">Aucun temps fort.</p>
            )}

            <h3>TAGS</h3>

            {tags.length > 0 ? (
              <div className="ed-themes">
                {tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            ) : (
              <p className="ed-muted">Aucun tag.</p>
            )}
          </div>
        </aside>
      </section>

      {playbookModalOpen && (
        <div className="pb-modal-bg" onClick={() => setPlaybookModalOpen(false)}>
          <div className="pb-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Ajouter au playbook</h3>

            <label>Choisir un playbook</label>

            <select
              value={selectedPlaybookId}
              onChange={(e) => setSelectedPlaybookId(e.target.value)}
            >
              {playbooks.map((playbook) => (
                <option key={playbook.id} value={playbook.id}>
                  {playbook.title}
                </option>
              ))}
            </select>

            <div className="pb-modal-actions">
              <button type="button" onClick={() => setPlaybookModalOpen(false)}>
                Annuler
              </button>

              <button
                type="button"
                className="main"
                onClick={addToPlaybook}
                disabled={!selectedPlaybookId || addingPlaybook}
              >
                {addingPlaybook ? "Ajout..." : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{CSS}</style>
    </main>
  );
}

function Row({
  label,
  value,
  badge = false,
}: {
  label: string;
  value?: string | number;
  badge?: boolean;
}) {
  return (
    <div className="ed-row">
      <span>{label}</span>
      <b className={badge ? "badge" : ""}>{value || "—"}</b>
    </div>
  );
}

const CSS = `
.ed-page{
  background:#fff;
  color:#111;
  max-width:1280px;
  margin:0 auto;
  padding:28px;
  font-family:Roboto,system-ui,sans-serif;
}

.ed-top{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:22px;
}

.ed-top-actions{
  display:flex;
  gap:10px;
}

.ed-back,
.ed-btn,
.ed-big{
  border:none;
  border-radius:999px;
  padding:11px 18px;
  font-weight:900;
  cursor:pointer;
}

.ed-back,
.ed-btn.ghost{
  background:#f1f1f1;
  color:#111;
}

.ed-btn.danger{
  background:#c0392b;
  color:white;
}

.ed-btn:disabled{
  opacity:.6;
  cursor:not-allowed;
}

.ed-hero{
  display:grid;
  grid-template-columns:1fr 280px;
  gap:24px;
  align-items:center;
  border:1px solid #eee;
  border-radius:24px;
  padding:34px;
  margin-bottom:24px;
  background:linear-gradient(135deg,#fff,#f7f7f7);
  box-shadow:0 10px 30px rgba(0,0,0,.06);
}

.ed-kicker{
  color:#f58213;
  font-weight:900;
  letter-spacing:.08em;
  margin-bottom:8px;
}

.ed-hero h1{
  font-size:3.3rem;
  line-height:.95;
  margin:0;
  font-weight:1000;
  text-transform:uppercase;
  font-style:italic;
}

.ed-hero p{
  color:#555;
  font-size:1.1rem;
  margin-top:18px;
  line-height:1.5;
}

.ed-badges{
  display:flex;
  gap:10px;
  margin-top:18px;
}

.ed-badges span{
  background:#fff0dc;
  color:#6b1a2c;
  border-radius:999px;
  padding:8px 14px;
  font-weight:900;
  font-size:.8rem;
}

.ed-main-actions{
  display:flex;
  gap:12px;
  margin-top:20px;
  flex-wrap:wrap;
}

.ed-main-actions button{
  border:0;
  border-radius:999px;
  padding:13px 20px;
  font-weight:1000;
  cursor:pointer;
}

.ed-main-actions .primary{
  background:#6b1a2c;
  color:#fff;
}

.ed-main-actions .gold{
  background:#d4a24c;
  color:#111;
}

.ed-hero-info{
  border-left:1px solid #ddd;
  padding-left:24px;
  display:flex;
  flex-direction:column;
  gap:18px;
}

.ed-hero-info span{
  display:block;
  font-size:.72rem;
  color:#777;
  font-weight:900;
  text-transform:uppercase;
}

.ed-hero-info b{
  font-size:1rem;
  text-transform:uppercase;
}

.ed-layout{
  display:grid;
  grid-template-columns:1fr 340px;
  gap:22px;
  align-items:start;
}

.ed-main{
  display:flex;
  flex-direction:column;
  gap:14px;
}

.ed-side{
  display:flex;
  flex-direction:column;
  gap:18px;
}

.ed-card{
  border:1px solid #e6e6e6;
  border-radius:18px;
  background:#fff;
  padding:22px;
  box-shadow:0 8px 24px rgba(0,0,0,.045);
}

.ed-card h2{
  margin:0 0 16px;
  font-size:1.05rem;
  font-weight:1000;
  text-transform:uppercase;
}

.ed-card h2:after{
  content:"";
  display:block;
  width:52px;
  height:3px;
  background:#f58213;
  margin-top:8px;
}

.ed-card p{
  white-space:pre-line;
  line-height:1.65;
  color:#333;
}

.ed-slider{
  width:100%;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:20px;
  margin-top:20px;
}

.ed-schema{
  width:100%;
  max-width:760px;
  height:500px;
  object-fit:contain;
  display:block;
  margin:auto;
}

.slider-btn{
  width:42px;
  height:42px;
  border:none;
  border-radius:50%;
  background:#f58213;
  color:white;
  font-size:30px;
  line-height:1;
  cursor:pointer;
  font-weight:900;
  flex:0 0 auto;
}

.slider-btn:hover{
  opacity:.9;
}

.ed-empty{
  height:280px;
  border:2px dashed #ddd;
  border-radius:14px;
  display:flex;
  align-items:center;
  justify-content:center;
  color:#999;
  font-weight:800;
}

.ed-empty.small{
  height:150px;
}

.ed-steps{
  list-style:none;
  counter-reset:step;
  padding:0;
  margin:0;
  display:flex;
  flex-direction:column;
  gap:14px;
}

.ed-steps li{
  counter-increment:step;
  display:flex;
  gap:12px;
  line-height:1.55;
}

.ed-steps li:before{
  content:counter(step);
  width:25px;
  height:25px;
  border-radius:50%;
  background:#f58213;
  color:white;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-size:.8rem;
  font-weight:900;
  flex:0 0 auto;
}

.ed-list{
  margin:0;
  padding-left:20px;
  line-height:1.75;
}

.ed-list li::marker{
  color:#f58213;
}

.ed-media-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:14px;
}

.ed-video{
  width:100%;
  border-radius:12px;
  background:#000;
}

.ed-gallery{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:10px;
}

.ed-gallery img{
  width:100%;
  height:120px;
  object-fit:cover;
  border-radius:12px;
  border:1px solid #ddd;
}

.sticky{
  position:sticky;
  top:20px;
}

.ed-criteria{
  display:flex;
  flex-direction:column;
}

.ed-row{
  display:flex;
  justify-content:space-between;
  gap:16px;
  border-bottom:1px solid #eee;
  padding:14px 0;
}

.ed-row span{
  text-transform:uppercase;
  font-weight:900;
  color:#333;
  font-size:.85rem;
}

.ed-row b{
  text-align:right;
  font-size:.9rem;
}

.badge{
  background:#f58213;
  color:white;
  padding:6px 14px;
  border-radius:8px;
}

.ed-card h3{
  margin:22px 0 12px;
  text-transform:uppercase;
  font-size:1rem;
}

.ed-themes{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}

.ed-themes span{
  border:1px solid #f58213;
  border-radius:8px;
  padding:10px;
  font-weight:900;
  color:#f58213;
  font-size:.85rem;
}

.ed-muted{
  color:#888;
}

.ed-actions{
  display:grid;
  grid-template-columns:1.4fr 1fr 1fr 1fr;
  gap:14px;
  margin-top:24px;
}

.ed-big{
  background:#111;
  color:#fff;
  border-radius:12px;
  padding:18px;
}

.ed-big.orange{
  background:#f58213;
}

.ed-big.playbook{
  background:#6b1a2c;
}

.ed-thumbs{
  display:flex;
  justify-content:center;
  gap:12px;
  margin-top:20px;
  flex-wrap:wrap;
}

.ed-thumb{
  width:90px;
  height:90px;
  border:2px solid transparent;
  border-radius:10px;
  overflow:hidden;
  background:#fff;
  cursor:pointer;
  padding:0;
}

.ed-thumb.active{
  border-color:#f58213;
}

.ed-thumb img{
  width:100%;
  height:100%;
  object-fit:cover;
}

.video-thumb{
  width:100%;
  height:100%;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#111;
  color:#f58213;
  font-size:28px;
  font-weight:900;
}

.pb-modal-bg{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.45);
  z-index:9999;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
}

.pb-modal{
  width:100%;
  max-width:430px;
  background:#fff;
  border-radius:18px;
  padding:24px;
}

.pb-modal h3{
  margin:0 0 18px;
  color:#6b1a2c;
  font-size:1.4rem;
  font-weight:1000;
}

.pb-modal label{
  display:block;
  margin:12px 0 6px;
  font-size:.8rem;
  font-weight:900;
  text-transform:uppercase;
}

.pb-modal select{
  width:100%;
  height:44px;
  border:1px solid #ddd;
  border-radius:10px;
  padding:0 12px;
}

.pb-modal-actions{
  display:flex;
  justify-content:flex-end;
  gap:10px;
  margin-top:20px;
}

.pb-modal-actions button{
  border:1px solid #ddd;
  background:#fff;
  border-radius:999px;
  padding:10px 16px;
  font-weight:900;
}

.pb-modal-actions .main{
  background:#6b1a2c;
  color:#fff;
  border-color:#6b1a2c;
}

@media(max-width:900px){
  .ed-page{
    padding:18px;
  }

  .ed-hero,
  .ed-layout,
  .ed-media-grid,
  .ed-actions{
    grid-template-columns:1fr;
  }

  .ed-hero h1{
    font-size:2.1rem;
  }

  .ed-hero-info{
    border-left:none;
    border-top:1px solid #ddd;
    padding-left:0;
    padding-top:18px;
  }

  .ed-slider{
    gap:6px;
  }

  .slider-btn{
    width:34px;
    height:34px;
    font-size:24px;
  }
}
`;