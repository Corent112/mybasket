// components/equipes/TeamForm.tsx
"use client";

import { useRef, useState } from "react";
import type { Team } from "../../types/player";
import { emptyTeam } from "../../types/player";

function compress(file: File, max: number, preserveTransparency = false): Promise<string> {
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

        if (!preserveTransparency) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
        }

        ctx.drawImage(img, 0, 0, w, h);
        resolve(
          preserveTransparency
            ? canvas.toDataURL("image/png")
            : canvas.toDataURL("image/jpeg", 0.88),
        );
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const BORDEAUX = "#7a1228";
const GOLD = "#e0a82e";
const INK = "#251d1a";
const MUTED = "#766a64";
const LINE = "#eadfd5";
const SOFT = "#fbf8f5";

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
    couleurs:
      team?.couleurs?.length
        ? team.couleurs
        : [BORDEAUX, GOLD],
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
      const c = [...(prev.couleurs || [BORDEAUX, GOLD])];
      c[i] = v;
      return { ...prev, couleurs: c };
    });
  }

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) set("logo", await compress(f, 500, true));
  }

  async function pickBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) set("banniere", await compress(f, 1600, false));
  }

  function submit() {
    if (!clubName.trim()) {
      alert("Le nom du club est obligatoire.");
      return;
    }
    if (!t.cat) {
      alert("La catégorie est obligatoire.");
      return;
    }
    if (!t.niveau) {
      alert("Le niveau de l'équipe est obligatoire.");
      return;
    }

    const generatedName = team?.name?.trim() || t.cat;
    const tags = [t.niveau, t.cat].filter(Boolean);

    onSave({
      ...t,
      name: generatedName,
      categorieLabel: t.cat,
      tags,
      season: t.season || "2025-2026",
      supabaseTeamId: t.supabaseTeamId ?? null,
      clubId: t.clubId ?? null,
      clubName: clubName.trim(),
    } as Team & { clubName: string });
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 46,
    border: `1px solid ${LINE}`,
    borderRadius: 10,
    background: "#fff",
    color: INK,
    padding: "0 13px",
    fontSize: ".92rem",
    fontWeight: 650,
    boxSizing: "border-box",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    color: MUTED,
    fontSize: ".68rem",
    fontWeight: 900,
    letterSpacing: ".035em",
    textTransform: "uppercase",
  };

  const uploadButtonStyle: React.CSSProperties = {
    minHeight: 40,
    padding: "0 18px",
    borderRadius: 9,
    border: `1.5px solid ${BORDEAUX}`,
    background: "#fff",
    color: BORDEAUX,
    fontSize: ".82rem",
    fontWeight: 900,
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
  };

  return (
    <div
      className="tl-modal-bg"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        background: "rgba(22,18,16,.58)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(760px, calc(100vw - 36px))",
          maxHeight: "calc(100vh - 36px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "#fff",
          borderRadius: 20,
          border: "1px solid rgba(122,18,40,.10)",
          boxShadow: "0 30px 90px rgba(20,13,10,.32)",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "18px 24px",
            borderBottom: `1px solid ${LINE}`,
            background: "linear-gradient(180deg,#fff 0%,#fffdfb 100%)",
            flex: "0 0 auto",
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              background: "#fff5f6",
              border: "1px solid #f0d9de",
              fontSize: 21,
            }}
          >
            🛡️
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <h3
              style={{
                margin: 0,
                color: INK,
                fontSize: "1.35rem",
                lineHeight: 1.05,
                fontWeight: 950,
                textTransform: "uppercase",
                letterSpacing: ".01em",
              }}
            >
              {team ? "Modifier l'équipe" : "Nouvelle équipe"}
            </h3>
            <div
              style={{
                marginTop: 5,
                color: MUTED,
                fontSize: ".82rem",
                fontWeight: 550,
              }}
            >
              {team
                ? "Modifie les informations de cette équipe."
                : "Crée une nouvelle équipe pour gérer tes joueurs et matchs."}
            </div>
          </div>

          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              border: `1px solid ${LINE}`,
              background: "#fff",
              color: "#4d433f",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* BODY */}
        <div
          style={{
            padding: "20px 24px 22px",
            overflowY: "auto",
            flex: "1 1 auto",
          }}
        >
          {/* PHOTOS */}
          <section>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
                color: INK,
                fontWeight: 950,
                fontSize: ".88rem",
              }}
            >
              <span>🖼️</span>
              <span>PHOTOS</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "200px minmax(0,1fr)",
                gap: 28,
                alignItems: "start",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={labelStyle}>Logo du club</div>
                <div
                  style={{
                    width: 160,
                    height: 150,
                    margin: "0 auto",
                    border: `1px solid ${LINE}`,
                    borderRadius: 15,
                    background: "#fff",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    position: "relative",
                    boxShadow: "0 3px 12px rgba(44,30,24,.05)",
                  }}
                >
                  {t.logo ? (
                    <img
                      src={t.logo}
                      alt="Logo du club"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        padding: 15,
                        boxSizing: "border-box",
                        background: "#fff",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 82,
                        height: 82,
                        borderRadius: 18,
                        display: "grid",
                        placeItems: "center",
                        background: "#fff8f1",
                        color: GOLD,
                        fontSize: 32,
                      }}
                    >
                      🏀
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => logoRef.current?.click()}
                    aria-label="Modifier le logo"
                    style={{
                      position: "absolute",
                      right: 8,
                      bottom: 8,
                      width: 31,
                      height: 31,
                      borderRadius: 999,
                      border: "2px solid #fff",
                      background: "#3a3431",
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    📷
                  </button>
                </div>

                <button
                  type="button"
                  style={{ ...uploadButtonStyle, marginTop: 10 }}
                  onClick={() => logoRef.current?.click()}
                >
                  Choisir un logo
                </button>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/png,image/webp,image/jpeg"
                  hidden
                  onChange={pickLogo}
                />
              </div>

              <div style={{ textAlign: "center" }}>
                <div style={labelStyle}>Photo de l'équipe</div>
                <div
                  style={{
                    height: 150,
                    border: `1px solid ${LINE}`,
                    borderRadius: 15,
                    background: SOFT,
                    overflow: "hidden",
                    position: "relative",
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "0 3px 12px rgba(44,30,24,.05)",
                  }}
                >
                  {t.banniere ? (
                    <img
                      src={t.banniere}
                      alt="Photo de l'équipe"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        color: "#9a8d86",
                        fontSize: ".9rem",
                        fontWeight: 700,
                      }}
                    >
                      Aucune photo
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => bannerRef.current?.click()}
                    aria-label="Modifier la photo"
                    style={{
                      position: "absolute",
                      right: 8,
                      bottom: 8,
                      width: 31,
                      height: 31,
                      borderRadius: 999,
                      border: "2px solid #fff",
                      background: "#3a3431",
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    📷
                  </button>
                </div>

                <button
                  type="button"
                  style={{ ...uploadButtonStyle, marginTop: 10 }}
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
          </section>

          <div
            style={{
              height: 1,
              background: LINE,
              margin: "20px 0 18px",
            }}
          />

          {/* INFORMATIONS */}
          <section>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
                color: INK,
                fontWeight: 950,
                fontSize: ".88rem",
              }}
            >
              <span>ⓘ</span>
              <span>INFORMATIONS DE L'ÉQUIPE</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px 20px",
              }}
            >
              <div>
                <label style={labelStyle}>Nom du club</label>
                <input
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  placeholder="Paris Basketball"
                  style={fieldStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Catégorie</label>
                <select
                  value={t.cat}
                  onChange={(e) => {
                    const cat = e.target.value;
                    set("cat", cat);
                    set("categorieLabel", cat);
                    if (!team?.name) set("name", cat);
                  }}
                  style={fieldStyle}
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

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Niveau de l'équipe</label>
                <select
                  value={t.niveau}
                  onChange={(e) => set("niveau", e.target.value)}
                  style={fieldStyle}
                >
                  <option value="">Choisir le niveau</option>
                  <option value="Départemental">Départemental</option>
                  <option value="Régional">Régional</option>
                  <option value="National">National</option>
                </select>
              </div>
            </div>
          </section>

          {/* COLORS */}
          <section style={{ marginTop: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                color: INK,
                fontWeight: 950,
                fontSize: ".88rem",
              }}
            >
              <span>🎨</span>
              <span>COULEURS DU MAILLOT</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
              }}
            >
              {[0, 1].map((index) => (
                <div key={index}>
                  <label style={labelStyle}>
                    {index === 0 ? "Couleur principale" : "Couleur secondaire"}
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "46px 1fr",
                      gap: 9,
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="color"
                      value={t.couleurs?.[index] || (index === 0 ? BORDEAUX : GOLD)}
                      onChange={(e) => setColor(index, e.target.value)}
                      style={{
                        width: 46,
                        height: 46,
                        border: `1px solid ${LINE}`,
                        borderRadius: 9,
                        padding: 4,
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    />
                    <div
                      style={{
                        ...fieldStyle,
                        display: "flex",
                        alignItems: "center",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: ".82rem",
                      }}
                    >
                      {t.couleurs?.[index] || (index === 0 ? BORDEAUX : GOLD)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <input type="hidden" value={t.supabaseTeamId ?? ""} readOnly />
          <input type="hidden" value={t.clubId ?? ""} readOnly />
        </div>

        {/* FOOTER */}
        <div
          style={{
            flex: "0 0 auto",
            padding: "14px 24px 18px",
            borderTop: `1px solid ${LINE}`,
            background: "#fff",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              minWidth: 150,
              minHeight: 46,
              padding: "0 20px",
              borderRadius: 10,
              border: `1.5px solid ${BORDEAUX}`,
              background: "#fff",
              color: BORDEAUX,
              fontSize: ".88rem",
              fontWeight: 900,
              cursor: "pointer",
              appearance: "none",
              WebkitAppearance: "none",
            }}
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={submit}
            style={{
              minWidth: 178,
              minHeight: 46,
              padding: "0 20px",
              borderRadius: 10,
              border: `1.5px solid ${BORDEAUX}`,
              background: BORDEAUX,
              color: "#fff",
              fontSize: ".88rem",
              fontWeight: 950,
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(122,18,40,.20)",
              appearance: "none",
              WebkitAppearance: "none",
            }}
          >
            Enregistrer l'équipe ✓
          </button>
        </div>
      </div>
    </div>
  );
}
