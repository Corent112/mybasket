import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function siteUrl() { return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""); }
function paypalBaseUrl() { return process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"; }
async function token() {
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Configuration PayPal absente");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, { method: "POST", headers: {
    Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", cache: "no-store" });
  const data = await res.json(); if (!res.ok) throw new Error(data.error_description || "Connexion PayPal impossible"); return data.access_token as string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paypalOrderId = url.searchParams.get("token");
  const localOrderId = url.searchParams.get("local_order");
  if (!paypalOrderId || !localOrderId) return NextResponse.redirect(`${siteUrl()}/panier?payment=invalid`);

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${siteUrl()}/connexion?next=/panier`);

    const accessToken = await token();
    const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, cache: "no-store" });
    const capture = await res.json();
    if (!res.ok || capture.status !== "COMPLETED") throw new Error(capture.message || "Paiement PayPal non finalisé");

    const now = new Date().toISOString();
    await supabase.from("orders").update({ status: "paid", paid_at: now, updated_at: now,
      provider_session_id: paypalOrderId }).eq("id", localOrderId).eq("user_id", user.id);

    const { data: subscriptionItems } = await supabase.from("order_items")
      .select("item_id,assigned_to").eq("order_id", localOrderId).eq("item_type", "subscription");
    if (subscriptionItems?.length) {
      await supabase.from("subscriptions").update({ status: "canceled", updated_at: now })
        .eq("user_id", user.id).eq("status", "active");
      for (const item of subscriptionItems) {
        if (!item.item_id) continue;
        const yearly = item.assigned_to === "yearly";
        const end = new Date(); yearly ? end.setFullYear(end.getFullYear() + 1) : end.setMonth(end.getMonth() + 1);
        await supabase.from("subscriptions").insert({ user_id: user.id, plan_id: item.item_id,
          billing_period: yearly ? "yearly" : "monthly", status: "active",
          current_period_start: now, current_period_end: end.toISOString(), created_at: now, updated_at: now });
      }
    }
    await supabase.from("cart_items").delete().eq("user_id", user.id).in("item_type", ["product", "subscription"]);
    return NextResponse.redirect(`${siteUrl()}/panier/success?order=${localOrderId}`);
  } catch (error) {
    console.error("Capture PayPal:", error);
    return NextResponse.redirect(`${siteUrl()}/panier?payment=paypal_error`);
  }
}
