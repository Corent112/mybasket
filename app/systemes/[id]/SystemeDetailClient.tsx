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
import { getSystem, type SystemItem } from "@/lib/systems";

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|,/)
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

  return "Système demi-terrain";
}

function statusLabel(status?: string | null) {
  if (status === "submitted") return "Soumis à MyBasket";
  if (status === "approved") return "Validé";
  if (status === "rejected") return "Refusé";
  return "Brouillon privé";
}

export default function SystemeDetailClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [systeme, setSysteme] = useState<SystemItem | null>(null);
  const [ready, setReady] = useState(false);
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

      router.push(`/mon-compte/playbooks/${selectedPlaybookId}`);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Erreur ajout playbook");
    } finally {
      setAddingPlaybook(false);
    }
  }

  function goEdit() {
    try {
      localStorage.removeItem(`mybasket_systeme_draft_${id}`);
      localStorage.removeItem(`mybasket_systeme_draft_${id}_storage_id`);
      localStorage.removeItem("mybasket_plaquette_load");
      localStorage.removeItem("mybasket_plaquette_result");
      localStorage.removeItem("mybasket_edit_schema_index");
      localStorage.removeItem("mybasket_edit_schema_group_id");
      localStorage.removeItem("mb_plaquette_return_to");
      localStorage.removeItem("mybasket_edit_system_id");
      localStorage.removeItem("mybasket_current_system_id");
    } catch {}

    router.push(`/systemes/creer?id=${id}`);
  }

  const steps = useMemo(() => normalizeList(systeme?.deroulement), [systeme]);
  const consignes = useMemo(() => normalizeList(systeme?.consignes), [systeme]);
  const variantes = useMemo(() => normalizeList(systeme?.variantes), [systeme]);

  const images = useMemo(() => {
    if (!systeme) return [];

    return [
      ...((systeme.schemaImages || []) as string[]),
      ...((systeme.images || []) as string[]),
    ].filter(Boolean);
  }, [systeme]);

  const videos = useMemo(
    () => ((systeme?.videos || []) as string[]).filter(Boolean),
    [systeme]
  );

  useEffect(() => {
    if (currentImage >= images.length) {
      setCurrentImage(0);
    }
  }, [currentImage, images.length]);

  function prevImage() {
    setCurrentImage((value) =>
      value <= 0 ? Math.max(images.length - 1, 0) : value - 1
    );
  }

  function nextImage() {
    setCurrentImage((value) =>
      value >= images.length - 1 ? 0 : value + 1
    );
  }

  if (!ready) {
    return <main className="ed-page">Chargement...</main>;
  }

  if (!systeme) {
    return (
      <main className="ed-page">
        <section className="ed-not-found">
          <h1>Système introuvable</h1>
          <p>
            Ce système est privé, supprimé, ou tu n’as pas les droits pour le consulter.
          </p>
          <button type="button" onClick={() => router.push("/systemes")}>
            ← Retour aux systèmes
          </button>
        </section>
        <style jsx>{CSS}</style>
      </main>
    );
  }

  const tags = (systeme.tags || []) as string[];
  const tempsForts = (systeme.tempsForts || []) as string[];

  return (
    <main className="ed-page">
      <div className="ed-top">
        <button type="button" onClick={() => router.push("/systemes")}>
          ← Retour aux systèmes
        </button>
      </div>

      <section className="ed-hero">
        <div>
          <p className="ed-kicker">SYSTÈME BASKETBALL</p>
          <h1>{systeme.title || "Système sans titre"}</h1>
          <p>
            {systeme.objectif ||
              systeme.organisation ||
              "Fiche système MyBasket"}
          </p>

          <div className="ed-badges">
            <span>{systeme.visibility === "public" ? "Public" : "Privé"}</span>
            <span>{statusLabel(systeme.review_status)}</span>
          </div>

          {systeme.review_status === "rejected" &&
            systeme.rejection_reason && (
              <div className="ed-reject-box">
                Motif du refus : {systeme.rejection_reason}
              </div>
            )}

          <div className="ed-main-actions">
            <button
              type="button"
              className="primary"
              onClick={openPlaybookModal}
            >
              Ajouter à mon playbook
            </button>

            <button
              type="button"
              className="gold"
              onClick={() => alert("Ajouté aux favoris")}
            >
              Ajouter aux favoris
            </button>

            <button type="button" className="dark" onClick={goEdit}>
              Modifier fiche
            </button>
          </div>
        </div>

        <div className="ed-hero-info">
          <div>
            <span>FAMILLE</span>
            <strong>{systeme.famille || "—"}</strong>
          </div>

          <div>
            <span>TYPE</span>
            <strong>{systeme.type || "—"}</strong>
          </div>

          <div>
            <span>CATÉGORIE</span>
            <strong>{systeme.categorie || "—"}</strong>
          </div>
        </div>
      </section>

      <div className="ed-layout">
        <section className="ed-main">
          <article className="ed-card">
            <h2>DESSIN DU SYSTÈME</h2>

            {images.length > 0 ? (
              <>
                <div className="ed-image-wrap">
                  {images.length > 1 && (
                    <button
                      type="button"
                      className="ed-arrow left"
                      onClick={prevImage}
                    >
                      ‹
                    </button>
                  )}

                  <img
                    src={images[currentImage]}
                    alt={systeme.title || "Système"}
                  />

                  {images.length > 1 && (
                    <button
                      type="button"
                      className="ed-arrow right"
                      onClick={nextImage}
                    >
                      ›
                    </button>
                  )}
                </div>

                {images.length > 1 && (
                  <div className="ed-thumbs">
                    {images.map((src, index) => (
                      <button
                        key={`${src}-${index}`}
                        type="button"
                        className={index === currentImage ? "active" : ""}
                        onClick={() => setCurrentImage(index)}
                      >
                        <img src={src} alt={`Phase ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="ed-empty">
                <p>Aucun schéma.</p>
              </div>
            )}
          </article>

          {videos.length > 0 && (
            <article className="ed-card">
              <h2>VIDÉO / ANIMATION</h2>
              <div className="ed-video-list">
                {videos.map((src, index) => (
                  <video
                    key={`${src}-${index}`}
                    src={src}
                    controls
                    playsInline
                    className="ed-video"
                  />
                ))}
              </div>
            </article>
          )}

          <article className="ed-card">
            <h2>OBJECTIF</h2>
            <p>{systeme.objectif || "—"}</p>
          </article>

          <article className="ed-card">
            <h2>ORGANISATION</h2>
            <p>{systeme.organisation || "—"}</p>
          </article>

          <article className="ed-card">
            <h2>DÉROULEMENT</h2>
            {steps.length > 0 ? (
              <ol>
                {steps.map((step, index) => (
                  <li key={`${step}-${index}`}>{step}</li>
                ))}
              </ol>
            ) : (
              <p>—</p>
            )}
          </article>

          <article className="ed-card">
            <h2>CONSIGNES</h2>
            {consignes.length > 0 ? (
              <ul>
                {consignes.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </article>

          <article className="ed-card">
            <h2>VARIANTES</h2>
            {variantes.length > 0 ? (
              <ul>
                {variantes.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </article>
        </section>

        <aside className="ed-side">
          <article className="ed-card ed-criteria">
            <h2>CRITÈRES</h2>

            <div className="ed-crit-row">
              <span>FAMILLE</span>
              <strong>{systeme.famille || "—"}</strong>
            </div>

            <div className="ed-crit-row">
              <span>CATÉGORIE</span>
              <strong>{systeme.categorie || "—"}</strong>
            </div>

            <div className="ed-crit-row">
              <span>TYPE</span>
              <strong className="ed-pill">{systeme.type || "—"}</strong>
            </div>

            <div className="ed-crit-row">
              <span>PHASES</span>
              <strong>{systeme.schemaImages?.length || 0}</strong>
            </div>

            <div className="ed-crit-row">
              <span>VIDÉOS</span>
              <strong>{videos.length}</strong>
            </div>

            <div className="ed-side-section">
              <h3>TEMPS FORTS</h3>
              {tempsForts.length ? (
                <div className="ed-tags">
                  {tempsForts.map((item) => (
                    <span key={item}>✓ {item}</span>
                  ))}
                </div>
              ) : (
                <p>Aucun temps fort.</p>
              )}
            </div>

            <div className="ed-side-section">
              <h3>TAGS</h3>
              {tags.length ? (
                <div className="ed-tags">
                  {tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              ) : (
                <p>Aucun tag.</p>
              )}
            </div>
          </article>
        </aside>
      </div>

      {playbookModalOpen && (
        <div
          className="pb-modal-bg"
          onClick={() => setPlaybookModalOpen(false)}
        >
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
              <button
                type="button"
                onClick={() => setPlaybookModalOpen(false)}
              >
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

const CSS = `
.ed-page{
  max-width:1180px;
  margin:0 auto;
  padding:28px 20px 70px;
  color:#111;
  font-family:Roboto,system-ui,sans-serif;
}
.ed-top{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:20px;
  gap:12px;
}
.ed-page button{
  border:0;
  cursor:pointer;
  font-weight:900;
  border-radius:999px;
  padding:10px 14px;
  background:#f2f2f2;
  color:#111;
  font-family:inherit;
}
.ed-page button:disabled{
  opacity:.65;
  cursor:not-allowed;
}
.ed-hero{
  display:grid;
  grid-template-columns:1fr 300px;
  gap:28px;
  border:1px solid #e6e6e6;
  border-radius:20px;
  padding:34px;
  margin-bottom:24px;
  background:#fff;
  box-shadow:0 10px 28px rgba(0,0,0,.04);
}
.ed-kicker{
  color:#f47b20!important;
  font-weight:900!important;
  letter-spacing:.08em;
  font-size:.78rem!important;
  margin:0 0 8px!important;
}
.ed-hero h1{
  font-size:clamp(2.1rem,5vw,4rem);
  line-height:.95;
  margin:0 0 16px;
  font-weight:1000;
  text-transform:uppercase;
  font-style:italic;
}
.ed-hero p{
  margin:0;
  color:#555;
}
.ed-badges{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:12px;
}
.ed-badges span{
  background:#fff4dd;
  color:#6b1a2c;
  border-radius:999px;
  padding:7px 11px;
  font-size:12px;
  font-weight:900;
}
.ed-reject-box{
  margin-top:14px;
  background:#ffe8ec;
  color:#c5283d;
  border-radius:12px;
  padding:10px 12px;
  font-weight:800;
  font-size:13px;
}
.ed-main-actions{
  display:flex;
  flex-wrap:wrap;
  gap:12px;
  margin-top:22px;
}
.ed-main-actions button{
  padding:13px 18px;
  transition:transform .18s ease,box-shadow .18s ease;
}
.ed-main-actions button:hover:not(:disabled){
  transform:translateY(-2px);
  box-shadow:0 10px 22px rgba(0,0,0,.14);
}
.ed-main-actions .primary{
  background:#6b1a2c;
  color:#fff;
}
.ed-main-actions .gold{
  background:#d4a24c;
  color:#111;
}
.ed-main-actions .dark{
  background:#111;
  color:#fff;
}
.ed-hero-info{
  border-left:1px solid #ddd;
  padding-left:28px;
  display:flex;
  flex-direction:column;
  gap:18px;
}
.ed-hero-info span,
.ed-crit-row span{
  display:block;
  font-size:.72rem;
  color:#777;
  font-weight:900;
  text-transform:uppercase;
}
.ed-hero-info strong,
.ed-crit-row strong{
  font-size:.9rem;
  text-transform:uppercase;
}
.ed-layout{
  display:grid;
  grid-template-columns:1fr 300px;
  gap:22px;
  align-items:start;
}
.ed-main,
.ed-side{
  display:flex;
  flex-direction:column;
  gap:16px;
}
.ed-card{
  background:#fff;
  border:1px solid #e6e6e6;
  border-radius:18px;
  padding:22px;
  box-shadow:0 8px 24px rgba(0,0,0,.04);
}
.ed-card h2{
  margin:0 0 18px;
  font-size:.95rem;
  font-weight:1000;
  text-transform:uppercase;
}
.ed-card h2::after{
  content:"";
  display:block;
  width:42px;
  height:3px;
  margin-top:8px;
  background:#f47b20;
}
.ed-card p,
.ed-card li{
  color:#555;
  line-height:1.6;
  font-size:.95rem;
}
.ed-card ol,
.ed-card ul{
  margin:0;
  padding-left:20px;
}
.ed-image-wrap{
  position:relative;
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:430px;
  background:#fff;
}
.ed-image-wrap img{
  max-width:100%;
  max-height:460px;
  object-fit:contain;
}
.ed-arrow{
  position:absolute;
  top:50%;
  transform:translateY(-50%);
  width:36px;
  height:36px;
  padding:0!important;
  background:#f47b20!important;
  color:#fff!important;
  font-size:2rem;
  line-height:1;
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:2;
}
.ed-arrow.left{left:0}
.ed-arrow.right{right:0}
.ed-thumbs{
  display:flex;
  gap:10px;
  justify-content:center;
  margin-top:18px;
  flex-wrap:wrap;
}
.ed-thumbs button{
  width:70px;
  height:58px;
  border-radius:8px;
  padding:0;
  overflow:hidden;
  border:2px solid transparent;
  background:#eee;
  position:relative;
}
.ed-thumbs button.active{
  border-color:#f47b20;
}
.ed-thumbs img{
  width:100%;
  height:100%;
  object-fit:contain;
  background:#6b1a2c;
}
.ed-video-list{
  display:flex;
  flex-direction:column;
  gap:14px;
}
.ed-video{
  width:100%;
  max-height:480px;
  border-radius:14px;
  background:#000;
  display:block;
}
.ed-empty{
  min-height:260px;
  display:flex;
  flex-direction:column;
  gap:14px;
  align-items:center;
  justify-content:center;
  color:#888;
  background:#f6f6f6;
  border-radius:14px;
  font-weight:800;
}
.ed-criteria{
  position:sticky;
  top:24px;
}
.ed-crit-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  padding:13px 0;
  border-bottom:1px solid #eee;
}
.ed-pill{
  background:#f47b20;
  color:#fff;
  border-radius:999px;
  padding:6px 10px;
  font-size:.72rem!important;
  text-align:right;
}
.ed-side-section{
  margin-top:20px;
}
.ed-side-section h3{
  font-size:.8rem;
  text-transform:uppercase;
  margin:0 0 8px;
}
.ed-tags{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.ed-tags span{
  background:#f6eadc;
  color:#6b1a2c;
  border-radius:999px;
  padding:6px 9px;
  font-size:.75rem;
  font-weight:900;
}
.ed-not-found{
  border:1px solid #eee;
  border-radius:20px;
  padding:34px;
  text-align:center;
}
.ed-not-found h1{
  color:#6b1a2c;
  margin:0 0 12px;
}
.ed-not-found p{
  color:#666;
  margin-bottom:20px;
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
.pb-modal-actions .main{
  background:#6b1a2c;
  color:#fff;
}
@media(max-width:900px){
  .ed-hero,
  .ed-layout{
    grid-template-columns:1fr;
  }
  .ed-hero-info{
    border-left:0;
    border-top:1px solid #ddd;
    padding-left:0;
    padding-top:20px;
  }
  .ed-criteria{
    position:static;
  }
}
`;
