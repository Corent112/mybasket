"use client";

export default function DeleteUserButton({
  userId,
  email,
  action,
}: {
  userId: string;
  email: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const ok = window.confirm(
          `Supprimer définitivement le compte ${email} ?\n\nCette action supprime l’accès MyBasket et ne peut pas être annulée.`,
        );
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit">Supprimer</button>
    </form>
  );
}
