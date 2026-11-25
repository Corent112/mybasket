"use client";

import Link from "next/link";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Clock, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SESSION_CART_TYPES, sessionCartMinutes, sessionCartTotal } from "@/lib/session-cart-summary";

export type SessionCartPreviewRow = {
  id: string;
  item_id: string | null;
  item_type: string;
  title: string | null;
  image_url: string | null;
  duration_minutes: number | null;
};

export function useSessionCartPreview(userId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<SessionCartPreviewRow[]>([]);
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++revision.current;
    if (!userId) { setRows([]); return; }
    const { data, error } = await supabase.from("cart_items")
      .select("id,item_id,item_type,title,image_url,duration_minutes")
      .eq("user_id", userId)
      .in("item_type", [...SESSION_CART_TYPES])
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (request !== revision.current) return;
    if (!error) setRows((data ?? []) as SessionCartPreviewRow[]);
  }, [supabase, userId]);

  useEffect(() => {
    setRows([]);
    void refresh();
    const sync = () => { void refresh(); };
    window.addEventListener("cart-updated", sync);
    window.addEventListener("focus", sync);
    return () => {
      revision.current++;
      window.removeEventListener("cart-updated", sync);
      window.removeEventListener("focus", sync);
    };
  }, [refresh]);

  return { rows, refresh };
}

export function SessionCartPreview({ rows }: { rows: SessionCartPreviewRow[] }) {
  const [expanded, setExpanded] = useState(true);
  if (!rows.length) return null;
  const count = rows.length;
  const total = sessionCartTotal(rows);
  return (
    <aside className="session-cart-preview" aria-label="Séance en cours">
      <button type="button" className="session-cart-toggle" aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}>
        <ClipboardList size={21} aria-hidden="true" />
        <div className="session-cart-heading">
          <strong>Ma séance en cours</strong>
          <small>{count} {rows.every(row => row.item_type === "exercise") ? (count > 1 ? "exercices" : "exercice") : (count > 1 ? "éléments" : "élément")}</small>
        </div>
        <span className="session-cart-time"><Clock size={15} aria-hidden="true" />{total} min</span>
        {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
      </button>
      {expanded && <div className="session-cart-content">
        <ol>
          {rows.map((row, index) => <li key={row.id}>
            <span className="session-cart-index">{index + 1}</span>
            {row.image_url ? <img src={row.image_url} alt="" loading="lazy" /> : <span className="session-cart-thumbnail"><ClipboardList size={18} /></span>}
            <span className="session-cart-name">{row.title || "Sans titre"}</span>
            <b>{sessionCartMinutes(row)} min</b>
          </li>)}
        </ol>
        <Link href="/panier" className="session-cart-link">Organiser ma séance →</Link>
      </div>}
      <style jsx>{`
        .session-cart-preview { position: fixed; left: 22px; bottom: 22px; z-index: 9000; width: min(365px, calc(100vw - 100px)); border: 1px solid #e5d4d8; border-radius: 15px; background: #fff; box-shadow: 0 12px 40px #29101830; overflow: hidden; font-family: inherit; }
        .session-cart-toggle { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; padding: 13px; background: #6b1a2c; color: #fff; text-align: left; cursor: pointer; font: inherit; }
        .session-cart-heading { flex: 1; min-width: 0; display: grid; gap: 3px; }
        .session-cart-heading strong { font-size: 14px; }
        .session-cart-heading small { font-size: 11px; color: #f1d9dc; }
        .session-cart-time { display: flex; align-items: center; gap: 5px; white-space: nowrap; color: #f5d286; font-size: 13px; font-weight: 800; }
        .session-cart-content { padding: 10px; }
        .session-cart-content ol { margin: 0 0 10px; padding: 0; list-style: none; max-height: min(320px, 45vh); overflow-y: auto; }
        .session-cart-content li { display: grid; grid-template-columns: 18px 44px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 8px 2px; border-bottom: 1px solid #f0e8e8; font-size: 12px; }
        .session-cart-content li:last-child { border-bottom: 0; }
        .session-cart-index { font-size: 11px; font-weight: 800; color: #9b6d76; text-align: center; }
        .session-cart-content img, .session-cart-thumbnail { width: 44px; height: 40px; border-radius: 6px; object-fit: contain; background: #f7f0e8; display: grid; place-items: center; color: #6b1a2c; }
        .session-cart-name { min-width: 0; overflow-wrap: anywhere; font-weight: 700; color: #282023; }
        .session-cart-content b { color: #6b1a2c; white-space: nowrap; font-size: 12px; }
        .session-cart-content :global(.session-cart-link) { display: block; padding: 11px 10px; border-radius: 8px; background: #f6ead6; color: #5a1928; text-align: center; font-size: 13px; font-weight: 800; text-decoration: none; }
        @media (max-width: 540px) { .session-cart-preview { left: 10px; bottom: 12px; width: min(365px, calc(100vw - 84px)); } .session-cart-toggle { gap: 6px; padding: 10px; } .session-cart-heading strong { font-size: 12px; } }
      `}</style>
    </aside>
  );
}

/** Library landing page does not otherwise load the current coach. */
export default function LibrarySessionCartPreview() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (active) setUserId(data.user?.id ?? null);
    }
    void loadUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (active) setUserId(session?.user.id ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [supabase]);
  const { rows } = useSessionCartPreview(userId);
  return <SessionCartPreview rows={rows} />;
}
