// components/equipes/PlayerForm.tsx
"use client";

import { useRef, useState } from "react";
import {
  MAINS,
  POSTES,
  STATUTS,
  emptyPlayer,
  type Player,
} from "../../types/player";

type PlayerExtra = Player & {
  licenceNumber?: string;
  tuteur1Phone?: string;
  tuteur1Email?: string;
  tuteur2Phone?: string;
  tuteur2Email?: string;
};

export default function PlayerForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Player;
  onSave: (p: Player) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial?.id;

  const [p, setP] = useState<PlayerExtra>({
    ...emptyPlayer(),
    ...(initial ?? {}),
    licenceNumber: (initial as PlayerExtra)?.licenceNumber ?? "",
    tuteur1Phone: (initial as PlayerExtra)?.tuteur1Phone ?? "",
    tuteur1Email: (initial as PlayerExtra)?.tuteur1Email ?? "",
    tuteur2Phone: (initial as PlayerExtra)?.tuteur2Phone ?? "",
    tuteur2Email: (initial as PlayerExtra)?.tuteur2Email ?? "",
  });

  const fileRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof PlayerExtra>(key: K, value: PlayerExtra[K]) {
    setP((prev) => ({ ...prev, [key]: value }));
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (ev) => {
      const img = new Image();

      img.onload = () => {
        const max = 400;
        const ratio = Math.min(max / img.width, max / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);

        set("photo", canvas.toDataURL("image/jpeg", 0.85));
      };

      img.src = ev.target?.result as string;
    };

    reader.readAsDataURL(file);
  }

  function submit() {
    if (!p.firstName.trim()) {
      alert("Le prénom est obligatoire.");
      return;
    }

    onSave(p as Player);
  }

  const num = (v: number | null) => (v == null ? "" : String(v));

  return (
    <div className="mbk-modal-overlay" onClick={onClose}>
      <div className="mbk-modal player-form-light" onClick={(e) => e.stopPropagation()}>
        <style jsx global>{`
          .player-form-light {
            background: #fff !important;
            color: #111 !important;
            max-width: 760px;
          }

          .player-form-light * {
            color: #111 !important;
          }

          .player-form-light h2 {
            margin: 0 0 1.2rem;
            font-size: 1.5rem;
            font-weight: 900;
            text-transform: uppercase;
            color: #6b1a2c !important;
          }

          .player-form-light h3 {
            margin: 0 0 0.8rem;
            font-size: 0.95rem;
            font-weight: 900;
            text-transform: uppercase;
            color: #6b1a2c !important;
          }

          .player-form-light .mbk-form-section {
            background: #fff !important;
            border: 1px solid #eee;
            border-radius: 14px;
            padding: 1rem;
            margin-bottom: 1rem;
          }

          .player-form-light .mbk-fields {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.85rem;
          }

          .player-form-light .mbk-field.full {
            grid-column: 1 / -1;
          }

          .player-form-light .mbk-field label {
            display: block;
            margin-bottom: 0.3rem;
            font-size: 0.75rem;
            font-weight: 900;
            text-transform: uppercase;
            color: #6a5b54 !important;
          }

          .player-form-light input,
          .player-form-light select {
            width: 100%;
            background: #fff !important;
            border: 1px solid #ddd !important;
            border-radius: 10px;
            padding: 0.65rem 0.75rem;
            color: #111 !important;
            font-size: 0.95rem;
          }

          .player-form-light input:focus,
          .player-form-light select:focus {
            outline: 2px solid rgba(107, 26, 44, 0.25);
            border-color: #6b1a2c !important;
          }

          .player-form-light .mbk-photo-pick {
            display: flex;
            align-items: center;
            gap: 1rem;
          }

          .player-form-light .preview {
            width: 92px;
            height: 92px;
            border-radius: 16px;
            background: #f4f4f4 !important;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            font-size: 2rem;
            border: 1px solid #ddd;
          }

          .player-form-light .preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .player-form-light .mbk-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 0.7rem;
            margin-top: 1rem;
          }

          .player-form-light .mbk-btn {
            border-radius: 10px;
            padding: 0.65rem 1rem;
            font-weight: 900;
            border: 1px solid #ddd;
            background: #fff;
          }

          .player-form-light .mbk-btn-orange {
            background: #6b1a2c !important;
            color: #fff !important;
            border-color: #6b1a2c !important;
          }

          .player-form-light .mbk-btn-ghost {
            background: #fff !important;
            color: #6b1a2c !important;
            border-color: #6b1a2c !important;
          }

          .player-form-light .mbk-btn-red {
            background: #fff !important;
            color: #c5283d !important;
            border-color: #c5283d !important;
          }

          @media (max-width: 700px) {
            .player-form-light .mbk-fields {
              grid-template-columns: 1fr;
            }

            .player-form-light .mbk-photo-pick {
              flex-direction: column;
              align-items: flex-start;
            }
          }
        `}</style>

        <h2>{isEdit ? "Modifier le joueur" : "Ajouter un joueur"}</h2>

        <div className="mbk-form-section">
          <h3>Photo</h3>

          <div className="mbk-photo-pick">
            <div className="preview">
              {p.photo ? <img src={p.photo} alt="" /> : "📷"}
            </div>

            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="mbk-btn mbk-btn-ghost"
                onClick={() => fileRef.current?.click()}
              >
                {p.photo ? "Changer" : "Ajouter une photo"}
              </button>

              {p.photo && (
                <button
                  type="button"
                  className="mbk-btn mbk-btn-red"
                  onClick={() => set("photo", null)}
                >
                  Retirer
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onPhoto}
              />
            </div>
          </div>
        </div>

        <div className="mbk-form-section">
          <h3>Identité joueur</h3>

          <div className="mbk-fields">
            <Field label="Prénom *">
              <input
                value={p.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </Field>

            <Field label="Nom">
              <input
                value={p.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </Field>

            <Field label="Numéro de maillot">
              <input
                type="number"
                value={num(p.num)}
                onChange={(e) =>
                  set("num", e.target.value === "" ? null : +e.target.value)
                }
              />
            </Field>

            <Field label="Numéro de licence">
              <input
                value={p.licenceNumber ?? ""}
                onChange={(e) => set("licenceNumber", e.target.value)}
                placeholder="Ex : FFBB123456"
              />
            </Field>

            <Field label="Date de naissance">
              <input
                value={p.dob}
                onChange={(e) => set("dob", e.target.value)}
                placeholder="JJ/MM/AAAA"
              />
            </Field>

            <Field label="Catégorie">
              <input
                value={p.categorie}
                onChange={(e) => set("categorie", e.target.value)}
                placeholder="U15 / U18 / Seniors..."
              />
            </Field>
          </div>
        </div>

        <div className="mbk-form-section">
          <h3>Informations sportives</h3>

          <div className="mbk-fields">
            <Field label="Poste principal">
              <select
                value={p.postePrincipal}
                onChange={(e) =>
                  set("postePrincipal", e.target.value as Player["postePrincipal"])
                }
              >
                {POSTES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>

            <Field label="Poste secondaire">
              <select
                value={p.posteSecondaire}
                onChange={(e) =>
                  set("posteSecondaire", e.target.value as Player["posteSecondaire"])
                }
              >
                <option value="">—</option>
                {POSTES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>

            <Field label="Taille">
              <input
                value={p.taille}
                onChange={(e) => set("taille", e.target.value)}
                placeholder="1m82"
              />
            </Field>

            <Field label="Poids">
              <input
                value={p.poids}
                onChange={(e) => set("poids", e.target.value)}
                placeholder="72 kg"
              />
            </Field>

            <Field label="Main dominante">
              <select
                value={p.mainDominante}
                onChange={(e) =>
                  set("mainDominante", e.target.value as Player["mainDominante"])
                }
              >
                {MAINS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>

            <Field label="Statut">
              <select
                value={p.statut}
                onChange={(e) => set("statut", e.target.value as Player["statut"])}
              >
                {STATUTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="mbk-form-section">
          <h3>Tuteur 1</h3>

          <div className="mbk-fields">
            <Field label="Téléphone tuteur 1">
              <input
                value={p.tuteur1Phone ?? ""}
                onChange={(e) => set("tuteur1Phone", e.target.value)}
                placeholder="06 00 00 00 00"
              />
            </Field>

            <Field label="Email tuteur 1">
              <input
                type="email"
                value={p.tuteur1Email ?? ""}
                onChange={(e) => set("tuteur1Email", e.target.value)}
                placeholder="parent1@email.fr"
              />
            </Field>
          </div>
        </div>

        <div className="mbk-form-section">
          <h3>Tuteur 2</h3>

          <div className="mbk-fields">
            <Field label="Téléphone tuteur 2">
              <input
                value={p.tuteur2Phone ?? ""}
                onChange={(e) => set("tuteur2Phone", e.target.value)}
                placeholder="06 00 00 00 00"
              />
            </Field>

            <Field label="Email tuteur 2">
              <input
                type="email"
                value={p.tuteur2Email ?? ""}
                onChange={(e) => set("tuteur2Email", e.target.value)}
                placeholder="parent2@email.fr"
              />
            </Field>
          </div>
        </div>

        <div className="mbk-modal-actions">
          <button className="mbk-btn mbk-btn-ghost" onClick={onClose}>
            Annuler
          </button>

          <button className="mbk-btn mbk-btn-orange" onClick={submit}>
            {isEdit ? "Sauvegarder" : "Ajouter le joueur"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`mbk-field${full ? " full" : ""}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}