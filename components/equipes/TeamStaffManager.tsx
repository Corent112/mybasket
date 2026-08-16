"use client";

import { useMemo, useRef, useState } from "react";
import type { StaffMember } from "@/types/player";

type StaffDraft = {
  id?: string;
  prenom: string;
  nom: string;
  role: string;
  email: string;
  photo: string | null;
};

const ROLES = [
  "Entraîneur principal",
  "Assistant",
  "Analyste vidéo",
  "Préparateur physique",
  "Kiné",
  "Manager",
  "Autre",
];

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `staff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyDraft(): StaffDraft {
  return {
    prenom: "",
    nom: "",
    role: "Assistant",
    email: "",
    photo: null,
  };
}

export default function TeamStaffManager({
  staff,
  onChange,
}: {
  staff: StaffMember[];
  onChange: (next: StaffMember[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<StaffDraft>(emptyDraft());
  const photoInputRef = useRef<HTMLInputElement>(null);

  const normalizedStaff = useMemo(() => staff ?? [], [staff]);

  function openCreate() {
    setDraft(emptyDraft());
    setOpen(true);
  }

  function openEdit(member: StaffMember) {
    setDraft({
      id: member.id,
      prenom: member.prenom || "",
      nom: member.nom || "",
      role: member.role || "Assistant",
      email: member.email || "",
      photo: member.photo ?? null,
    });
    setOpen(true);
  }

  function onPhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Choisis un fichier image.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = (loadEvent) => {
      const image = new Image();

      image.onload = () => {
        const maxSize = 500;
        const ratio = Math.min(
          maxSize / image.width,
          maxSize / image.height,
          1,
        );

        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) return;

        context.drawImage(image, 0, 0, width, height);

        setDraft((prev) => ({
          ...prev,
          photo: canvas.toDataURL("image/jpeg", 0.85),
        }));
      };

      image.src = loadEvent.target?.result as string;
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function save() {
    const prenom = draft.prenom.trim();
    const nom = draft.nom.trim();
    const role = draft.role.trim() || "Assistant";
    const email = draft.email.trim().toLowerCase();

    if (!prenom || !nom) {
      alert("Renseigne le prénom et le nom du membre du staff.");
      return;
    }

    setSaving(true);
    try {
      const existing = normalizedStaff.find((item) => item.id === draft.id);

      const member: StaffMember = {
        id: draft.id || newId(),
        prenom,
        nom,
        role,
        email: email || undefined,
        photo: draft.photo,
        userId: existing?.userId ?? null,
      };

      const exists = normalizedStaff.some((item) => item.id === member.id);
      const next = exists
        ? normalizedStaff.map((item) => (item.id === member.id ? member : item))
        : [...normalizedStaff, member];

      await onChange(next);
      setOpen(false);
      setDraft(emptyDraft());
    } finally {
      setSaving(false);
    }
  }

  async function remove(member: StaffMember) {
    if (
      !confirm(
        `Retirer ${member.prenom} ${member.nom} du staff de cette équipe ?`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      await onChange(
        normalizedStaff.filter((item) => item.id !== member.id),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="staffCard">
        <div className="staffHeader">
          <div>
            <span className="eyebrow">ENCADREMENT</span>
            <h2>Staff</h2>
          </div>
          <button type="button" className="addButton" onClick={openCreate}>
            + Ajouter un membre
          </button>
        </div>

        {normalizedStaff.length === 0 ? (
          <div className="empty">
            <strong>Aucun membre du staff.</strong>
            <span>
              Ajoute un entraîneur, un assistant ou un analyste. L’adresse
              e-mail est conservée pour préparer la future collaboration.
            </span>
          </div>
        ) : (
          <div className="staffList">
            {normalizedStaff.map((member) => {
              const initials =
                `${member.prenom?.[0] || ""}${member.nom?.[0] || ""}`.toUpperCase();

              return (
                <article className="staffRow" key={member.id}>
                  <div className="avatar">
                    {member.photo ? (
                      <img src={member.photo} alt="" />
                    ) : (
                      initials || "S"
                    )}
                  </div>

                  <div className="identity">
                    <strong>
                      {member.prenom} {member.nom}
                    </strong>
                    <div className="meta">
                      <span className="role">{member.role}</span>
                      {member.email ? <span>{member.email}</span> : null}
                    </div>
                  </div>

                  <div className="actions">
                    <button
                      type="button"
                      className="edit"
                      onClick={() => openEdit(member)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="delete"
                      disabled={saving}
                      onClick={() => remove(member)}
                    >
                      Retirer
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {open && (
        <div className="modalBackdrop" onClick={() => !saving && setOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <span className="eyebrow">STAFF ÉQUIPE</span>
                <h3>{draft.id ? "Modifier le membre" : "Ajouter un membre"}</h3>
              </div>
              <button
                type="button"
                className="close"
                disabled={saving}
                onClick={() => setOpen(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="grid">
              <div className="photoField">
                <span className="fieldLabel">Photo</span>

                <div className="photoPicker">
                  <div className="photoPreview">
                    {draft.photo ? (
                      <img src={draft.photo} alt="Aperçu du membre du staff" />
                    ) : (
                      <span>📷</span>
                    )}
                  </div>

                  <div className="photoActions">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={onPhotoChange}
                    />

                    <button
                      type="button"
                      className="photoButton"
                      onClick={() => photoInputRef.current?.click()}
                    >
                      {draft.photo ? "Changer la photo" : "Ajouter une photo"}
                    </button>

                    {draft.photo ? (
                      <button
                        type="button"
                        className="removePhotoButton"
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, photo: null }))
                        }
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                </div>

                <small>
                  La photo est redimensionnée automatiquement avant
                  l’enregistrement.
                </small>
              </div>

              <label>
                Prénom *
                <input
                  value={draft.prenom}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      prenom: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Nom *
                <input
                  value={draft.nom}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      nom: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Fonction
                <select
                  value={draft.role}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      role: event.target.value,
                    }))
                  }
                >
                  {ROLES.map((role) => (
                    <option value={role} key={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                E-mail
                <input
                  type="email"
                  value={draft.email}
                  placeholder="coach@exemple.fr"
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                />
                <small>
                  Cet e-mail servira ensuite à lier ce membre à son compte
                  MyBasket pour la collaboration.
                </small>
              </label>
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="cancel"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="save"
                disabled={saving}
                onClick={save}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .staffCard {
          background: #fff;
          border: 1px solid #eadfd5;
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 10px 28px rgba(48, 28, 20, 0.05);
        }
        .staffHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        .eyebrow {
          display: block;
          color: #d4a24c;
          font-size: 0.65rem;
          font-weight: 950;
          letter-spacing: 0.12em;
        }
        h2,
        h3 {
          margin: 4px 0 0;
          color: #251d1a;
        }
        h2 {
          font-size: 1.2rem;
        }
        h3 {
          font-size: 1.25rem;
        }
        .addButton,
        .save {
          border: 0;
          border-radius: 999px;
          background: #6b1a2c;
          color: white;
          font-weight: 900;
          padding: 11px 18px;
          cursor: pointer;
        }
        .empty {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 18px;
          border: 1px dashed #dfcfc3;
          border-radius: 14px;
          color: #766a64;
          background: #fbf8f5;
        }
        .empty strong {
          color: #251d1a;
        }
        .staffList {
          display: grid;
          gap: 10px;
        }
        .staffRow {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 12px;
          border: 1px solid #eee3da;
          border-radius: 14px;
        }
        .avatar {
          width: 44px;
          height: 44px;
          flex: 0 0 44px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 50%;
          background: #6b1a2c;
          color: white;
          font-weight: 950;
        }
        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .identity {
          min-width: 0;
          flex: 1;
        }
        .identity strong {
          color: #251d1a;
        }
        .meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 4px;
          color: #766a64;
          font-size: 0.78rem;
        }
        .role {
          color: #6b1a2c;
          font-weight: 900;
        }
        .actions {
          display: flex;
          gap: 8px;
        }
        .actions button,
        .cancel,
        .close,
        .photoButton,
        .removePhotoButton {
          cursor: pointer;
        }
        .edit,
        .delete {
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 800;
          background: #fff;
        }
        .edit {
          border: 1px solid #d9c7bb;
          color: #6b1a2c;
        }
        .delete {
          border: 1px solid #f0c9cf;
          color: #a1243b;
        }
        .modalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(20, 14, 12, 0.6);
          backdrop-filter: blur(3px);
        }
        .modal {
          width: min(620px, 100%);
          max-height: calc(100vh - 36px);
          overflow-y: auto;
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 30px 90px rgba(20, 13, 10, 0.3);
        }
        .modalHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 20px 22px;
          border-bottom: 1px solid #eadfd5;
        }
        .close {
          width: 38px;
          height: 38px;
          border: 1px solid #eadfd5;
          border-radius: 50%;
          background: #fff;
          color: #6b1a2c;
          font-size: 1.4rem;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          padding: 22px;
        }
        label {
          display: grid;
          gap: 7px;
          color: #766a64;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        input,
        select {
          width: 100%;
          min-height: 44px;
          box-sizing: border-box;
          border: 1px solid #dfd3ca;
          border-radius: 10px;
          background: #fff;
          color: #251d1a;
          padding: 0 12px;
          font: inherit;
          font-size: 0.9rem;
          font-weight: 650;
          text-transform: none;
          letter-spacing: 0;
          outline: none;
        }
        small {
          color: #988b84;
          font-size: 0.68rem;
          font-weight: 600;
          line-height: 1.35;
          text-transform: none;
          letter-spacing: 0;
        }
        .photoField {
          grid-column: 1 / -1;
          display: grid;
          gap: 9px;
        }
        .fieldLabel {
          color: #766a64;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .photoPicker {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px;
          border: 1px solid #eadfd5;
          border-radius: 14px;
          background: #fbf8f5;
        }
        .photoPreview {
          width: 82px;
          height: 82px;
          flex: 0 0 82px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 50%;
          border: 2px solid #fff;
          background: #f0e9e3;
          box-shadow: 0 2px 8px rgba(48, 28, 20, 0.08);
          font-size: 1.7rem;
        }
        .photoPreview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .photoActions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .photoButton,
        .removePhotoButton {
          border-radius: 999px;
          padding: 9px 13px;
          font-weight: 850;
          background: #fff;
        }
        .photoButton {
          border: 1px solid #d9c7bb;
          color: #6b1a2c;
        }
        .removePhotoButton {
          border: 1px solid #f0c9cf;
          color: #a1243b;
        }
        .modalActions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 16px 22px 22px;
        }
        .cancel {
          border: 1px solid #dfd3ca;
          border-radius: 999px;
          background: #fff;
          color: #6b1a2c;
          font-weight: 900;
          padding: 10px 16px;
        }
        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        @media (max-width: 680px) {
          .staffHeader,
          .staffRow {
            align-items: stretch;
            flex-direction: column;
          }
          .addButton {
            width: 100%;
          }
          .avatar {
            align-self: flex-start;
          }
          .actions {
            width: 100%;
          }
          .actions button {
            flex: 1;
          }
          .grid {
            grid-template-columns: 1fr;
          }
          .photoField {
            grid-column: auto;
          }
          .photoPicker {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </>
  );
}
