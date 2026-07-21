"use client";

import { useEffect } from "react";
import { saveUserAppState } from "@/lib/user-app-state-client";

const EXACT_KEYS = [
  "mybasket_management_rotation",
  "mybasket_management_admin",
  "mybasket_calendar_events",
  "mybasket_systemes",
  "mybasket_annonces",
];
const PREFIXES = ["mybasket_player_montage_", "mybasket_player_montage_design_"];

export default function LegacyBusinessStateMigration() {
  useEffect(() => {
    const migrate = async () => {
      const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean) as string[];
      const selected = keys.filter((key) => EXACT_KEYS.includes(key) || PREFIXES.some((prefix) => key.startsWith(prefix)));
      for (const key of selected) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const value = JSON.parse(raw);
          await saveUserAppState(key, value);
          localStorage.setItem(`${key}__supabase_migrated`, "1");
        } catch {
          // Une valeur non JSON reste locale : elle est probablement transitoire.
        }
      }
    };
    void migrate();
  }, []);
  return null;
}
