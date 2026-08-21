"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SelfAvatarButton({
  userId,
  onSaved,
  compact = false,
}: {
  userId: string;
  onSaved?: (avatarUrl: string) => void;
  compact?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function fileToAvatar(file: File) {
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    return await new Promise<string>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const side = Math.min(image.width, image.height);
        const sx = Math.max(0, (image.width - side) / 2);
        const sy = Math.max(0, (image.height - side) / 2);
        const canvas = document.createElement("canvas");
        canvas.width = 500;
        canvas.height = 500;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Impossible de préparer l’image."));
        ctx.drawImage(image, sx, sy, side, side, 0, 0, 500, 500);
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      };
      image.onerror = () => reject(new Error("Image invalide."));
      image.src = source;
    });
  }

  async function change(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Choisis un fichier image.");
    if (file.size > 10 * 1024 * 1024) return alert("La photo ne doit pas dépasser 10 Mo.");
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== userId) throw new Error("Tu peux modifier uniquement ta propre photo.");
      const avatarUrl = await fileToAvatar(file);
      const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq("id", user.id);
      if (error) throw error;
      onSaved?.(avatarUrl);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de modifier la photo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <>
    <input ref={inputRef} hidden type="file" accept="image/*" onChange={(e) => void change(e.target.files?.[0])}/>
    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} style={{background:"#fff",color:"#6B1A2C",border:"1px solid #d9c4c9",borderRadius:8,padding:compact?".28rem .5rem":".42rem .7rem",fontWeight:700,fontSize:compact?".7rem":".78rem",cursor:busy?"default":"pointer",opacity:busy ? .65 : 1}}>{busy ? "Photo…" : "Changer ma photo"}</button>
  </>;
}
