"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  StaffMember,
  TeamCollaborationPermissions,
} from "@/types/player";

type StaffDraft = {
  id?: string;
  prenom: string;
  nom: string;
  role: string;
  email: string;
  photo: string | null;
};

type InvitationRecord = {
  id: string;
  staff_member_id?: string | null;
  email: string;
  role: string;
  permissions: TeamCollaborationPermissions;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  expires_at?: string | null;
  sent_at?: string | null;
};

type MemberRecord = {
  id: string;
  user_id: string;
  email?: string | null;
  role: string;
  permissions: TeamCollaborationPermissions;
  status: "accepted" | "removed";
};

type AccessEditor = {
  mode: "invite" | "member";
  staff: StaffMember;
  memberId?: string;
  permissions: TeamCollaborationPermissions;
  role: string;
} | null;

const ROLES = [
  "Entraîneur principal",
  "Assistant",
  "Analyste vidéo",
  "Préparateur physique",
  "Kiné",
  "Manager",
  "Autre",
];

const PERMISSION_ROWS: Array<{
  key: keyof TeamCollaborationPermissions;
  label: string;
  hint: string;
}> = [
  {
    key: "players",
    label: "Joueurs",
    hint: "Consulter et modifier l’effectif de cette équipe.",
  },
  {
    key: "sessions",
    label: "Séances & calendrier",
    hint: "Créer, modifier et supprimer les séances de cette équipe.",
  },
  {
    key: "livestats",
    label: "LiveStats",
    hint: "Créer et coder les matchs de cette équipe.",
  },
  {
    key: "media",
    label: "Médias & Google Drive",
    hint: "Utiliser les médias et le Drive liés à cette équipe.",
  },
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

function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function defaultPermissions(role: string): TeamCollaborationPermissions {
  const normalized = role.toLowerCase();

  if (normalized.includes("entraîneur principal")) {
    return {
      view_team: true,
      players: true,
      sessions: true,
      livestats: true,
      media: true,
    };
  }

  if (normalized.includes("assistant")) {
    return {
      view_team: true,
      players: true,
      sessions: true,
      livestats: true,
      media: true,
    };
  }

  if (normalized.includes("analyste")) {
    return {
      view_team: true,
      players: false,
      sessions: false,
      livestats: true,
      media: true,
    };
  }

  return {
    view_team: true,
    players: false,
    sessions: false,
    livestats: false,
    media: false,
  };
}

export default function TeamStaffManager({
  teamId,
  staff,
  onChange,
  isOwner = true,
}: {
  teamId: string;
  staff: StaffMember[];
  onChange: (next: StaffMember[]) => Promise<void>;
  isOwner?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collabBusy, setCollabBusy] = useState(false);
  const [collabError, setCollabError] = useState("");
  const [draft, setDraft] = useState<StaffDraft>(emptyDraft());
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [accessEditor, setAccessEditor] = useState<AccessEditor>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const normalizedStaff = useMemo(() => staff ?? [], [staff]);

  async function loadCollaboration() {
    if (!isOwner || !teamId) {
      setInvitations([]);
      setMembers([]);
      return;
    }

    const response = await fetch(
      `/api/team-invitations?teamId=${encodeURIComponent(teamId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setCollabError(payload?.error || "Impossible de charger la collaboration.");
      return;
    }

    setCollabError("");
    setInvitations((payload.invitations || []) as InvitationRecord[]);
    setMembers((payload.members || []) as MemberRecord[]);
  }

  useEffect(() => {
    void loadCollaboration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, isOwner]);

  useEffect(() => {
    if (typeof window === "undefined" || !isOwner) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("addStaff") !== "1") return;

    setDraft(emptyDraft());
    setOpen(true);

    params.delete("addStaff");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}#staff`;
    window.history.replaceState({}, "", nextUrl);
  }, [isOwner]);

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

  function memberFor(staffMember: StaffMember) {
    const email = cleanEmail(staffMember.email);
    return members.find(
      (member) =>
        (staffMember.userId && member.user_id === staffMember.userId) ||
        (email && cleanEmail(member.email) === email),
    );
  }

  function pendingInvitationFor(staffMember: StaffMember) {
    const email = cleanEmail(staffMember.email);
    return invitations.find(
      (invitation) =>
        invitation.status === "pending" &&
        (String(invitation.staff_member_id || "") === String(staffMember.id) ||
          (email && cleanEmail(invitation.email) === email)),
    );
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
    const email = cleanEmail(draft.email);

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
      await loadCollaboration();
    } finally {
      setSaving(false);
    }
  }

  async function patchCollaboration(body: Record<string, unknown>) {
    const response = await fetch("/api/team-invitations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, ...body }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || "Action de collaboration impossible.");
    }

    return payload;
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
    setCollabError("");
    try {
      const activeMember = memberFor(member);
      const pending = pendingInvitationFor(member);

      if (activeMember) {
        await patchCollaboration({
          action: "remove_member",
          memberId: activeMember.id,
        });
      } else if (pending) {
        await patchCollaboration({
          action: "revoke",
          invitationId: pending.id,
        });
      }

      await onChange(
        normalizedStaff.filter((item) => item.id !== member.id),
      );
      await loadCollaboration();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Impossible de retirer ce membre.";
      setCollabError(message);
      alert(message);
    } finally {
      setSaving(false);
    }
  }

  function beginInvite(member: StaffMember) {
    if (!member.email) {
      alert("Ajoute d’abord l’adresse e-mail de ce membre du staff.");
      openEdit(member);
      return;
    }

    setAccessEditor({
      mode: "invite",
      staff: member,
      role: member.role || "Assistant",
      permissions: defaultPermissions(member.role || "Assistant"),
    });
  }

  function beginManage(member: StaffMember, linked: MemberRecord) {
    setAccessEditor({
      mode: "member",
      staff: member,
      memberId: linked.id,
      role: linked.role || member.role || "Staff",
      permissions: {
        view_team: true,
        players: linked.permissions?.players === true,
        sessions: linked.permissions?.sessions === true,
        livestats: linked.permissions?.livestats === true,
        media: linked.permissions?.media === true,
      },
    });
  }

  async function saveAccess() {
    if (!accessEditor) return;

    setCollabBusy(true);
    setCollabError("");

    try {
      if (accessEditor.mode === "invite") {
        const response = await fetch("/api/team-invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId,
            staffMemberId: accessEditor.staff.id,
            email: accessEditor.staff.email,
            role: accessEditor.role,
            permissions: {
              ...accessEditor.permissions,
              view_team: true,
            },
          }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || "Invitation non envoyée.");
        }
      } else {
        await patchCollaboration({
          action: "update_member",
          memberId: accessEditor.memberId,
          role: accessEditor.role,
          permissions: {
            ...accessEditor.permissions,
            view_team: true,
          },
        });
      }

      setAccessEditor(null);
      await loadCollaboration();
    } catch (error) {
      setCollabError(
        error instanceof Error ? error.message : "Erreur collaboration.",
      );
    } finally {
      setCollabBusy(false);
    }
  }

  async function resend(invitation: InvitationRecord) {
    setCollabBusy(true);
    setCollabError("");

    try {
      await patchCollaboration({
        action: "resend",
        invitationId: invitation.id,
      });
      await loadCollaboration();
    } catch (error) {
      setCollabError(error instanceof Error ? error.message : "E-mail non envoyé.");
    } finally {
      setCollabBusy(false);
    }
  }

  async function revoke(invitation: InvitationRecord) {
    if (!confirm("Annuler cette invitation ?")) return;

    setCollabBusy(true);
    try {
      await patchCollaboration({
        action: "revoke",
        invitationId: invitation.id,
      });
      await loadCollaboration();
    } catch (error) {
      setCollabError(error instanceof Error ? error.message : "Action impossible.");
    } finally {
      setCollabBusy(false);
    }
  }

  return (
    <>
      <section id="staff" className="staffCard">
        <div className="staffHeader">
          <div>
            <span className="eyebrow">ENCADREMENT</span>
            <h2>Staff</h2>
            {isOwner && (
              <p className="staffIntro">
                Le staff peut rester informatif ou recevoir un accès MyBasket
                limité à cette équipe.
              </p>
            )}
          </div>

          {isOwner && (
            <button type="button" className="addButton" onClick={openCreate}>
              + Ajouter un membre
            </button>
          )}
        </div>

        {collabError && <div className="collabError">{collabError}</div>}

        {normalizedStaff.length === 0 ? (
          <div className="empty">
            <strong>Aucun membre du staff.</strong>
            <span>
              Ajoute un entraîneur, un assistant ou un analyste à cette équipe.
            </span>
          </div>
        ) : (
          <div className="staffList">
            {normalizedStaff.map((member) => {
              const initials =
                `${member.prenom?.[0] || ""}${member.nom?.[0] || ""}`.toUpperCase();
              const linked = memberFor(member);
              const pending = pendingInvitationFor(member);

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

                    {linked ? (
                      <span className="collabBadge active">
                        ● Collaborateur actif
                      </span>
                    ) : pending ? (
                      <span className="collabBadge pending">
                        ● Invitation en attente
                      </span>
                    ) : isOwner && member.email ? (
                      <span className="collabBadge neutral">
                        Staff non connecté à MyBasket
                      </span>
                    ) : null}
                  </div>

                  {isOwner && (
                    <div className="actions">
                      {linked ? (
                        <button
                          type="button"
                          className="access"
                          onClick={() => beginManage(member, linked)}
                        >
                          Gérer les accès
                        </button>
                      ) : pending ? (
                        <>
                          <button
                            type="button"
                            className="access"
                            disabled={collabBusy}
                            onClick={() => void resend(pending)}
                          >
                            Renvoyer
                          </button>
                          <button
                            type="button"
                            className="softDelete"
                            disabled={collabBusy}
                            onClick={() => void revoke(pending)}
                          >
                            Annuler invitation
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="invite"
                          onClick={() => beginInvite(member)}
                        >
                          Inviter à collaborer
                        </button>
                      )}

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
                        onClick={() => void remove(member)}
                      >
                        Retirer
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {open && isOwner && (
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
                  Cette adresse servira à envoyer l’invitation de collaboration.
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
                onClick={() => void save()}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {accessEditor && isOwner && (
        <div
          className="modalBackdrop"
          onClick={() => !collabBusy && setAccessEditor(null)}
        >
          <div className="modal accessModal" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <span className="eyebrow">COLLABORATION</span>
                <h3>
                  {accessEditor.mode === "invite"
                    ? `Inviter ${accessEditor.staff.prenom}`
                    : `Accès de ${accessEditor.staff.prenom}`}
                </h3>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setAccessEditor(null)}
              >
                ×
              </button>
            </div>

            <div className="accessBody">
              <label>
                Rôle dans l’équipe
                <select
                  value={accessEditor.role}
                  onChange={(event) =>
                    setAccessEditor((prev) =>
                      prev ? { ...prev, role: event.target.value } : prev,
                    )
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <div className="accessInfo">
                <strong>✓ Voir l’équipe</strong>
                <span>
                  Cet accès est obligatoire pour un collaborateur et reste
                  limité à cette équipe.
                </span>
              </div>

              <div className="permissionRows">
                {PERMISSION_ROWS.map((permission) => (
                  <label className="permissionRow" key={permission.key}>
                    <div>
                      <strong>{permission.label}</strong>
                      <span>{permission.hint}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={accessEditor.permissions[permission.key] === true}
                      onChange={(event) =>
                        setAccessEditor((prev) =>
                          prev
                            ? {
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  [permission.key]: event.target.checked,
                                },
                              }
                            : prev,
                        )
                      }
                    />
                  </label>
                ))}
              </div>

              {accessEditor.mode === "invite" && (
                <div className="mailPreview">
                  ✉️ Un e-mail MyBasket sera envoyé à{" "}
                  <strong>{accessEditor.staff.email}</strong> avec un lien
                  sécurisé valable 7 jours.
                </div>
              )}

              {collabError && <div className="collabError">{collabError}</div>}
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="cancel"
                disabled={collabBusy}
                onClick={() => setAccessEditor(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="save"
                disabled={collabBusy}
                onClick={() => void saveAccess()}
              >
                {collabBusy
                  ? "Enregistrement…"
                  : accessEditor.mode === "invite"
                    ? "Envoyer l’invitation"
                    : "Enregistrer les accès"}
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
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        .staffIntro {
          margin: 6px 0 0;
          color: #8b7e77;
          font-size: 0.78rem;
          line-height: 1.45;
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
        .collabError {
          margin: 10px 0;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fff0f2;
          color: #a1243b;
          font-size: 0.78rem;
          font-weight: 800;
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
          width: 48px;
          height: 48px;
          flex: 0 0 48px;
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
        .collabBadge {
          display: inline-flex;
          margin-top: 7px;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 0.66rem;
          font-weight: 900;
        }
        .collabBadge.active {
          background: #eaf7ee;
          color: #227441;
        }
        .collabBadge.pending {
          background: #fff5df;
          color: #a66b00;
        }
        .collabBadge.neutral {
          background: #f4f1ef;
          color: #81746e;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 7px;
          flex-wrap: wrap;
        }
        .actions button,
        .cancel,
        .close,
        .photoButton,
        .removePhotoButton {
          cursor: pointer;
        }
        .edit,
        .delete,
        .invite,
        .access,
        .softDelete {
          border-radius: 999px;
          padding: 8px 11px;
          font-weight: 800;
          background: #fff;
          font-size: 0.72rem;
        }
        .invite {
          background: #6b1a2c;
          border: 1px solid #6b1a2c;
          color: #fff;
        }
        .access {
          border: 1px solid #d4a24c;
          color: #8d6118;
          background: #fffaf0;
        }
        .edit {
          border: 1px solid #d9c7bb;
          color: #6b1a2c;
        }
        .delete,
        .softDelete {
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
        .accessModal {
          width: min(680px, 100%);
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
        .accessBody {
          padding: 22px;
          display: grid;
          gap: 16px;
        }
        .accessInfo,
        .mailPreview {
          display: grid;
          gap: 4px;
          padding: 14px;
          border-radius: 13px;
          background: #fbf8f5;
          color: #766a64;
          font-size: 0.78rem;
        }
        .accessInfo strong {
          color: #6b1a2c;
        }
        .permissionRows {
          display: grid;
          gap: 9px;
        }
        .permissionRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 13px 14px;
          border: 1px solid #eadfd5;
          border-radius: 13px;
          text-transform: none;
          letter-spacing: 0;
        }
        .permissionRow div {
          display: grid;
          gap: 3px;
        }
        .permissionRow strong {
          color: #251d1a;
          font-size: 0.84rem;
        }
        .permissionRow span {
          color: #8b7e77;
          font-size: 0.7rem;
          font-weight: 600;
        }
        .permissionRow input {
          width: 20px;
          min-height: 20px;
          height: 20px;
          flex: 0 0 20px;
          accent-color: #6b1a2c;
        }
        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        @media (max-width: 760px) {
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
            justify-content: flex-start;
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
