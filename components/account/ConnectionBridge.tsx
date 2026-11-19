"use client";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
export default function ConnectionBridge() {
  useEffect(() => {
    const db = createClient();
    let live = true;
    let pending = false;
    async function sync(id: string | undefined) {
      if (!id || pending) return;
      const key = `mybasket:connection:${id}`;
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(key) || 0);
      } catch {}
      if (Date.now() - last < 60_000) return;
      pending = true;
      try {
        const response = await fetch("/api/auth/connection", {
          method: "POST",
        });
        if (response.ok && live)
          try {
            sessionStorage.setItem(key, String(Date.now()));
          } catch {}
      } finally {
        pending = false;
      }
    }
    db.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      if (live) void sync(data.user?.id);
    });
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === "SIGNED_IN" && live)
          setTimeout(() => void sync(session?.user.id), 0);
      },
    );
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);
  return null;
}
