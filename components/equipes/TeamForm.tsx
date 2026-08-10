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

  const [clubName, setClubName] = useState(
    () => (team as Team & { clubName?: string })?.clubName || "",
  );

  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof Team>(k: K, v: Team[K]) {
    setT((prev) => ({ ...prev, [k]: v }));
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

    if (!clubName.trim()) {
      alert("Le nom du club est obligatoire.");
      return;
    }

    const tags = [t.niveau, t.cat].filter(Boolean);

    onSave({
      ...t,
      tags,
      season: t.season || "2025-2026",
      supabaseTeamId: t.supabaseTeamId ?? null,
      clubId: t.clubId ?? null,
      clubName: clubName.trim(),
    } as Team & { clubName: string });
  }

  return (
    <div
      className="tl-modal-bg"
      onClick={onClose}
      style={{
        alignItems: "center",
        padding: "1rem",
        overflow: "hidden",
      }}
    >
      <div
        className="tl-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, calc(100vw - 2rem))",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: 0,
        }}
      >
        <div
          style={{
            padding: "1.1rem 1.25rem .9rem",
            borderBottom: "1px solid #efe6db",
            flex: "0 0 auto",
          }}
        >
          <h3 style={{ margin: 0 }}>
            {team ? "Modifier l'équipe" : "Nouvelle équipe"}
          </h3>
        </div>

        <div
          style={{
            padding: "1rem 1.25rem",
            overflowY: "auto",
            flex: "1 1 auto",
          }}
        >
          <div className="grp" style={{ marginBottom: "1rem" }}>
            <div className="h">Photos</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(150px, 180px) minmax(0, 1fr)",
                gap: "1rem",
                alignItems: "start",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: ".72rem",
                    color: "#6a5b54",
                    marginBottom: ".35rem",
                    fontWeight: 800,
                  }}
                >
                  LOGO DU CLUB
                </div>

                {t.logo ? (
                  <img
                    src={t.logo}
                    alt=""
                    className="tl-upload-prev"
                    style={{
                      width: 110,
                      height: 110,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    className="tl-upload-prev"
                    style={{
                      width: 110,
                      height: 110,
                      margin: "0 auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    🏀
                  </div>
                )}

                <button
                  type="button"
                  className="tl-btn tl-btn-ghost tl-btn-sm"
                  style={{
                    marginTop: ".45rem",
                    minWidth: 110,
                    minHeight: 40,
                  }}
                  onClick={() => logoRef.current?.click()}
                >
                  Choisir
                </button>

                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={pickLogo}
                />
              </div>

              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: ".72rem",
                    color: "#6a5b54",
                    marginBottom: ".35rem",
                    fontWeight: 800,
                  }}
                >
                  PHOTO DE L'ÉQUIPE
                </div>

                {t.banniere ? (
                  <img
                    src={t.banniere}
                    alt=""
                    style={{
                      width: "100%",
                      height: 110,
                      objectFit: "cover",
                      borderRadius: 12,
                      border: "1px solid #efe6db",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: 110,
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
                  style={{
                    marginTop: ".45rem",
                    minWidth: 150,
                    minHeight: 40,
                  }}
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

          <div className="grp">
            <div className="h">Informations de l'équipe</div>

            <div className="tl-fields">
              <div className="tl-field full">
                <label>Nom du club</label>
                <input
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  placeholder="Paris Basketball"
                />
              </div>

              <div className="tl-field full">
                <label>Nom de l'équipe</label>
                <input
                  value={t.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="PB18"
                />
              </div>

              <div className="tl-field">
                <label>Catégorie</label>
                <select
                  value={t.cat}
                  onChange={(e) => {
                    set("cat", e.target.value);
                    set("categorieLabel", e.target.value);
                  }}
                >
                  <option value="">Choisir</option>
                  <option value="U7">U7</option>
                  <option value="U9">U9</option>
                  <option value="U11">U11</option>
                  <option value="U13">U13</option>
                  <option value="U15">U15</option>
                  <option value="U18">U18</option>
                  <option value="U21">U21</option>
                  <option value="SENIOR">Senior</option>
                </select>
              </div>

              <div className="tl-field">
                <label>Niveau de l'équipe</label>
                <input
                  value={t.niveau}
                  onChange={(e) => set("niveau", e.target.value)}
                  placeholder="Départemental, Régional, France..."
                />
              </div>

              <div className="tl-field">
                <label>Couleur maillot 1</label>
                <div
                  style={{
                    display: "flex",
                    gap: ".6rem",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="color"
                    value={t.couleurs?.[0] || "#7a1228"}
                    onChange={(e) => setColor(0, e.target.value)}
                    style={{ width: 54, height: 42, padding: 3 }}
                  />
                  <span
                    style={{
                      fontSize: ".8rem",
                      color: "#6a5b54",
                      fontWeight: 700,
                    }}
                  >
                    {t.couleurs?.[0] || "#7a1228"}
                  </span>
                </div>
              </div>

              <div className="tl-field">
                <label>Couleur maillot 2</label>
                <div
                  style={{
                    display: "flex",
                    gap: ".6rem",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="color"
                    value={t.couleurs?.[1] || "#e0a82e"}
                    onChange={(e) => setColor(1, e.target.value)}
                    style={{ width: 54, height: 42, padding: 3 }}
                  />
                  <span
                    style={{
                      fontSize: ".8rem",
                      color: "#6a5b54",
                      fontWeight: 700,
                    }}
                  >
                    {t.couleurs?.[1] || "#e0a82e"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <input type="hidden" value={t.supabaseTeamId ?? ""} readOnly />
          <input type="hidden" value={t.clubId ?? ""} readOnly />
        </div>

        <div
          className="tl-modal-actions"
          style={{
            flex: "0 0 auto",
            margin: 0,
            padding: ".9rem 1.25rem",
            borderTop: "1px solid #efe6db",
            background: "#fff",
            position: "sticky",
            bottom: 0,
            zIndex: 5,
          }}
        >
          <button
            type="button"
            className="tl-btn tl-btn-ghost"
            style={{
              minWidth: 120,
              minHeight: 44,
              padding: ".7rem 1.2rem",
              whiteSpace: "nowrap",
            }}
            onClick={onClose}
          >
            Annuler
          </button>

          <button
            type="button"
            className="tl-btn tl-btn-bx"
            style={{
              minWidth: 140,
              minHeight: 44,
              padding: ".7rem 1.2rem",
              whiteSpace: "nowrap",
            }}
            onClick={submit}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
