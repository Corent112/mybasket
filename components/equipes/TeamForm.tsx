// components/equipes/TeamForm.tsx
"use client";

import { useRef, useState } from "react";
import type { Team } from "../../types/player";
import { emptyTeam } from "../../types/player";

/** Compresse une image (data URL) côté client via canvas. */
function compress(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponible"));

        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };

      img.onerror = reject;
      img.src = reader.result as string;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TeamForm({
  team,
  onSave,
  onClose,
}: {
  team?: Team;
  onSave: (t: Team) => void;
  onClose: () => void;
}) {
  const [t, setT] = useState<Team>(() => ({
    ...emptyTeam(),
    ...(team ?? {}),
    supabaseTeamId: team?.supabaseTeamId ?? null,
    clubId: team?.clubId ?? null,
    season: team?.season ?? "2025-2026",
  }));

  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof Team>(k: K, v: Team[K]) {
    setT((prev) => ({ ...prev, [k]: v }));
  }

  function setKpi(k: keyof Team["kpi"], v: number) {
    setT((prev) => ({
      ...prev,
      kpi: {
        ...prev.kpi,
        [k]: Number.isFinite(v) ? v : 0,
      },
    }));
  }

  function setColor(i: number, v: string) {
    setT((prev) => {
      const c = [...(prev.couleurs || ["#7a1228", "#e0a82e"])];
      c[i] = v;
      return { ...prev, couleurs: c };
    });
  }

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) set("logo", await compress(f, 400));
  }

  async function pickBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) set("banniere", await compress(f, 1400));
  }

  function submit() {
    if (!t.name.trim()) {
      alert("Le nom de l'équipe est obligatoire.");
      return;
    }

    const tags =
      t.tags && t.tags.length
        ? t.tags
        : [t.niveau, t.cat, t.genre].filter(Boolean);

    onSave({
      ...t,
      tags,
      season: t.season || "2025-2026",
      supabaseTeamId: t.supabaseTeamId ?? null,
      clubId: t.clubId ?? null,
    });
  }

  return (
    <div className="tl-modal-bg" onClick={onClose}>
      <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{team ? "Modifier l'équipe" : "Nouvelle équipe"}</h3>

        {/* Visuels */}
        <div className="grp">
          <div className="h">Visuels</div>

          <div style={{ display: "flex", gap: "1.4rem", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: ".72rem",
                  color: "#6a5b54",
                  marginBottom: ".3rem",
                  fontWeight: 700,
                }}
              >
                LOGO
              </div>

              {t.logo ? (
                <img src={t.logo} alt="" className="tl-upload-prev" />
              ) : (
                <div
                  className="tl-upload-prev"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  🏀
                </div>
              )}

              <div>
                <button
                  type="button"
                  className="tl-btn tl-btn-ghost tl-btn-sm"
                  style={{ marginTop: ".4rem", minWidth: 110, minHeight: 42, padding: "0.65rem 1rem", whiteSpace: "nowrap" }}
                  onClick={() => logoRef.current?.click()}
                >
                  Choisir
                </button>
              </div>

              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                hidden
                onChange={pickLogo}
              />
            </div>

            <div style={{ flex: 1, minWidth: 200, textAlign: "center" }}>
              <div
                style={{
                  fontSize: ".72rem",
                  color: "#6a5b54",
                  marginBottom: ".3rem",
                  fontWeight: 700,
                }}
              >
                PHOTO D'ÉQUIPE
              </div>

              {t.banniere ? (
                <img
                  src={t.banniere}
                  alt=""
                  style={{
                    width: "100%",
                    maxHeight: 90,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "1px solid #efe6db",
                  }}
                />
              ) : (
                <div
                  style={{
                    height: 72,
                    borderRadius: 12,
                    border: "1px dashed #e0cdbb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9a8a82",
                  }}
                >
                  Aucune photo
                </div>
              )}

              <button
                type="button"
                className="tl-btn tl-btn-ghost tl-btn-sm"
                style={{ marginTop: ".4rem", minWidth: 160, minHeight: 42, padding: "0.65rem 1rem", whiteSpace: "nowrap" }}
                onClick={() => bannerRef.current?.click()}
              >
                Choisir une photo
              </button>

              <input
                ref={bannerRef}
                type="file"
                accept="image/*"
                hidden
                onChange={pickBanner}
              />
            </div>
          </div>
        </div>

        {/* Identité */}
        <div className="grp">
          <div className="h">Identité</div>

          <div className="tl-fields">
            <div className="tl-field full">
              <label>Nom de l'équipe</label>
              <input
                value={t.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Paris Basketball"
              />
            </div>

            <div className="tl-field full">
              <label>Catégorie (libellé)</label>
              <input
                value={t.categorieLabel}
                onChange={(e) => set("categorieLabel", e.target.value)}
                placeholder="U15 France - Masculins"
              />
            </div>

            <div className="tl-field">
              <label>Catégorie courte</label>
              <input
                value={t.cat}
                onChange={(e) => set("cat", e.target.value)}
                placeholder="U15"
              />
            </div>

            <div className="tl-field">
              <label>Niveau</label>
              <input
                value={t.niveau}
                onChange={(e) => set("niveau", e.target.value)}
                placeholder="Départemental"
              />
            </div>

            <div className="tl-field">
              <label>Genre</label>
              <input
                value={t.genre}
                onChange={(e) => set("genre", e.target.value)}
                placeholder="Masculins"
              />
            </div>

            <div className="tl-field">
              <label>Saison</label>
              <input
                value={t.season || ""}
                onChange={(e) => set("season", e.target.value)}
                placeholder="2025-2026"
              />
            </div>

            <div className="tl-field">
              <label>Création de l'équipe</label>
              <input
                value={t.dateCreation}
                onChange={(e) => set("dateCreation", e.target.value)}
                placeholder="01/07/2025"
              />
            </div>
          </div>
        </div>

        {/* Encadrement */}
        <div className="grp">
          <div className="h">Encadrement</div>

          <div className="tl-fields">
            <div className="tl-field">
              <label>Entraîneur principal</label>
              <input
                value={t.entraineurPrincipal}
                onChange={(e) => set("entraineurPrincipal", e.target.value)}
                placeholder="Lucas Martin"
              />
            </div>

            <div className="tl-field">
              <label>Assistant</label>
              <input
                value={t.assistant}
                onChange={(e) => set("assistant", e.target.value)}
                placeholder="Noah Bernard"
              />
            </div>

            <div className="tl-field full">
              <label>Salle principale</label>
              <input
                value={t.sallePrincipale}
                onChange={(e) => set("sallePrincipale", e.target.value)}
                placeholder="Gymnase Carpentier"
              />
            </div>

            <div className="tl-field">
              <label>Couleur 1</label>
              <input
                type="color"
                value={t.couleurs?.[0] || "#7a1228"}
                onChange={(e) => setColor(0, e.target.value)}
              />
            </div>

            <div className="tl-field">
              <label>Couleur 2</label>
              <input
                type="color"
                value={t.couleurs?.[1] || "#e0a82e"}
                onChange={(e) => setColor(1, e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Indicateurs saison */}
        <div className="grp">
          <div className="h">Indicateurs de la saison</div>

          <div className="tl-fields">
            <div className="tl-field">
              <label>Présence moy. (%)</label>
              <input
                type="number"
                value={t.kpi.presenceMoyennePct}
                onChange={(e) =>
                  setKpi("presenceMoyennePct", Number(e.target.value))
                }
              />
            </div>

            <div className="tl-field">
              <label>Matchs joués</label>
              <input
                type="number"
                value={t.kpi.matchsJoues}
                onChange={(e) => setKpi("matchsJoues", Number(e.target.value))}
              />
            </div>

            <div className="tl-field">
              <label>Victoires</label>
              <input
                type="number"
                value={t.kpi.victoires}
                onChange={(e) => setKpi("victoires", Number(e.target.value))}
              />
            </div>

            <div className="tl-field">
              <label>Défaites</label>
              <input
                type="number"
                value={t.kpi.defaites}
                onChange={(e) => setKpi("defaites", Number(e.target.value))}
              />
            </div>

            <div className="tl-field">
              <label>Points moy.</label>
              <input
                type="number"
                value={t.kpi.pointsMoyenne}
                onChange={(e) =>
                  setKpi("pointsMoyenne", Number(e.target.value))
                }
              />
            </div>

            <div className="tl-field">
              <label>Progression (%)</label>
              <input
                type="number"
                value={t.kpi.progressionPct}
                onChange={(e) =>
                  setKpi("progressionPct", Number(e.target.value))
                }
              />
            </div>
          </div>
        </div>

        {/* Liaison technique invisible dans l'interface principale */}
        <input type="hidden" value={t.supabaseTeamId ?? ""} readOnly />
        <input type="hidden" value={t.clubId ?? ""} readOnly />

        <div className="tl-modal-actions">
          <button type="button" className="tl-btn tl-btn-ghost" style={{ minWidth: 120, minHeight: 44, padding: "0.7rem 1.2rem", whiteSpace: "nowrap" }} onClick={onClose}>
            Annuler
          </button>

          <button type="button" className="tl-btn tl-btn-bx" style={{ minWidth: 130, minHeight: 44, padding: "0.7rem 1.2rem", whiteSpace: "nowrap" }} onClick={submit}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}