import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function paypalBaseUrl() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error("PAYPAL_CLIENT_ID ou PAYPAL_CLIENT_SECRET manquant dans .env.local");
  }

  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "Impossible de se connecter à PayPal");
  }
  return String(data.access_token);
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

    const { data: cart, error: cartError } = await supabase
      .from("cart_items")
      .select("*")
      .eq("user_id", user.id)
      .in("item_type", ["product", "subscription"]);
    if (cartError) throw cartError;

    const items: Array<{
      item_type: string; item_id: string | null; title: string; quantity: number;
      assigned_to: string | null; unitCents: number; taxMode: "TTC" | "HT";
    }> = [];

    for (const raw of cart ?? []) {
      if (raw.item_type === "product" && raw.item_id) {
        const { data: product } = await supabase.from("products")
          .select("name,price_cents,status").eq("id", raw.item_id).eq("status", "active").maybeSingle();
        if (product && Number(product.price_cents) > 0) {
          items.push({ item_type: "product", item_id: raw.item_id, title: product.name || raw.title,
            quantity: Math.max(1, Number(raw.quantity || 1)), assigned_to: null,
            unitCents: Number(product.price_cents), taxMode: "TTC" });
        }
      }
      if (raw.item_type === "subscription" && raw.item_id) {
        const { data: plan } = await supabase.from("subscription_plans")
          .select("name,price_cents,price_monthly_cents,price_yearly_cents,price_tax_mode,status")
          .eq("id", raw.item_id).eq("status", "active").maybeSingle();
        if (plan) {
          const billing = raw.assigned_to === "yearly" ? "yearly" : "monthly";
          const cents = billing === "yearly"
            ? Number(plan.price_yearly_cents || 0)
            : Number(plan.price_monthly_cents ?? plan.price_cents ?? 0);
          if (cents > 0) items.push({ item_type: "subscription", item_id: raw.item_id,
            title: plan.name || raw.title, quantity: 1, assigned_to: billing,
            unitCents: cents, taxMode: plan.price_tax_mode === "HT" ? "HT" : "TTC" });
        }
      }
    }

    if (!items.length) return NextResponse.json({ error: "Panier vide ou invalide" }, { status: 400 });

    const totalCents = items.reduce((sum, item) => {
      const line = item.unitCents * item.quantity;
      return sum + (item.taxMode === "HT" ? Math.round(line * 1.2) : line);
    }, 0);
    const taxCents = items.reduce((sum, item) => {
      const line = item.unitCents * item.quantity;
      return sum + (item.taxMode === "HT" ? Math.round(line * .2) : Math.round(line - line / 1.2));
    }, 0);
    const subtotalCents = totalCents - taxCents;
    const now = new Date().toISOString();

    let orderResult = await supabase.from("orders").insert({
      user_id: user.id, status: "pending", payment_provider: "paypal",
      subtotal: subtotalCents / 100, tax: taxCents / 100, total: totalCents / 100,
      subtotal_cents: subtotalCents, tax_cents: taxCents, total_cents: totalCents,
      created_at: now, updated_at: now,
    }).select("id").single();
    if (orderResult.error?.code === "PGRST204" || orderResult.error?.message?.includes("schema cache")) {
      orderResult = await supabase.from("orders").insert({
        user_id: user.id, status: "pending", payment_provider: "paypal",
        subtotal: subtotalCents / 100, tax: taxCents / 100, total: totalCents / 100,
        created_at: now, updated_at: now,
      }).select("id").single();
    }
    const { data: order, error: orderError } = orderResult;
    if (orderError || !order) throw orderError || new Error("Commande introuvable");

    const { error: itemError } = await supabase.from("order_items").insert(items.map((item, index) => ({
      order_id: order.id, user_id: user.id, item_type: item.item_type, item_id: item.item_id,
      title: item.title, price: item.unitCents / 100, unit_price: item.unitCents / 100,
      quantity: item.quantity, assigned_to: item.assigned_to, sort_order: index, created_at: now,
    })));
    if (itemError) throw itemError;

    const token = await getAccessToken();
    const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ reference_id: order.id, custom_id: user.id,
          amount: { currency_code: "EUR", value: (totalCents / 100).toFixed(2) } }],
        payment_source: { paypal: { experience_context: {
          return_url: `${siteUrl()}/api/checkout/paypal/capture?local_order=${order.id}`,
          cancel_url: `${siteUrl()}/panier`, user_action: "PAY_NOW",
        } } },
      }),
      cache: "no-store",
    });
    const paypalOrder = await response.json();
    if (!response.ok) throw new Error(paypalOrder.message || "Création PayPal impossible");
    const approval = paypalOrder.links?.find((link: { rel: string; href: string }) => link.rel === "payer-action" || link.rel === "approve");
    if (!approval?.href) throw new Error("Lien d’approbation PayPal absent");

    await supabase.from("orders").update({ provider_session_id: paypalOrder.id, updated_at: now }).eq("id", order.id);
    return NextResponse.json({ url: approval.href });
  } catch (error) {
    console.error("Erreur checkout PayPal:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur PayPal" }, { status: 500 });
  }
}
