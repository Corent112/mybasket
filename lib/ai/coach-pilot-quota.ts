import { createAdminClient } from "@/lib/supabase/admin-server";

function dailyLimit(value: string | undefined, fallback: number) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 1 ? count : fallback;
}

export async function getCoachPilotRestriction(userId: string): Promise<string | null> {
  const userLimit = dailyLimit(process.env.MYBASKET_COACH_DAILY_USER_LIMIT, 10);
  const siteLimit = dailyLimit(process.env.MYBASKET_COACH_DAILY_SITE_LIMIT, 50);
  const unavailable = "Le mode IA est temporairement indisponible. La limite se renouvelle à minuit, heure de Paris.";
  try {
    const db = createAdminClient();
    if (!db) return unavailable;
    const { data, error } = await db.rpc("reserve_coach_pilot_turn", {
      p_user: userId, p_user_limit: userLimit, p_site_limit: siteLimit,
    });
    if (error) {
      console.warn("[AI][coach-quota]", error.code);
      return unavailable;
    }
    if (data === "allowed") return null;
    if (data === "user_limit") return `Tes ${userLimit} réponses IA du jour ont été utilisées. Le quota se renouvelle à minuit, heure de Paris.`;
    if (data === "site_limit") return "Le quota IA de MyBasket est atteint pour aujourd’hui. Il se renouvelle à minuit, heure de Paris.";
    return unavailable;
  } catch {
    console.warn("[AI][coach-quota] indisponible");
    return unavailable;
  }
}
