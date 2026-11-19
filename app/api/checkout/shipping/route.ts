import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveShippingQuote } from "@/lib/shop/shipping";
import { isSameOriginMutation } from "@/lib/security/request-origin";
export async function POST(request: Request) {
  if (!isSameOriginMutation(request))
    return NextResponse.json({ error: "Origine invalide" }, { status: 403 });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { data: items, error } = await db
    .from("cart_items")
    .select("item_type,item_id,quantity")
    .eq("user_id", user.id)
    .in("item_type", ["product", "subscription"]);
  if (error)
    return NextResponse.json({ error: "Panier indisponible" }, { status: 503 });
  try {
    return NextResponse.json(
      await resolveShippingQuote(
        db,
        items || [],
        String(body.country || "FR"),
        String(body.postalCode || ""),
      ),
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
