import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveSubscriptionForUser } from "@/lib/effective-subscription";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { active: false, source: null, plan: null, subscription: null },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const effective = await getEffectiveSubscriptionForUser({
    supabase,
    userId: user.id,
    email: user.email,
  });

  return NextResponse.json(effective, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
