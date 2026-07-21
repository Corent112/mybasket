import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY manquant dans .env.local");
}

if (!webhookSecret) {
  throw new Error("STRIPE_WEBHOOK_SECRET manquant dans .env.local");
}

const stripe = new Stripe(stripeSecretKey);

type OrderItem = {
  id: string;
  order_id: string;
  user_id: string;
  item_type: string;
  item_id: string | null;
  title: string | null;
  assigned_to: string | null;
  price_cents?: number | null;
  unit_price_cents?: number | null;
  quantity?: number | null;
};

async function activateOrder(orderId: string, stripeSession: Stripe.Checkout.Session) {
  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, user_id, status, total, total_cents")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!order) throw new Error("Commande introuvable");

  const typedOrder = order as {
    id: string;
    user_id: string;
    status: string | null;
    total: number | null;
    total_cents?: number | null;
  };

  if (["paid", "succeeded", "completed"].includes(String(typedOrder.status || "").toLowerCase())) {
    return;
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .eq("user_id", typedOrder.user_id);

  if (itemsError) throw itemsError;

  const items = (itemsData ?? []) as OrderItem[];
  const amountTotalCents = Number(stripeSession.amount_total || 0);

  await supabase
    .from("orders")
    .update({
      status: "paid",
      stripe_session_id: stripeSession.id,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  await supabase.from("payments").insert({
    user_id: typedOrder.user_id,
    order_id: orderId,
    amount_cents: amountTotalCents,
    amount: amountTotalCents / 100,
    currency: String(stripeSession.currency || "eur").toUpperCase(),
    status: "paid",
    provider: "stripe",
    provider_session_id: stripeSession.id,
    description: `Commande MyBasket ${orderId}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const subscriptionItems = items.filter((item) => item.item_type === "subscription" && item.item_id);

  if (subscriptionItems.length > 0) {
    await supabase
      .from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("user_id", typedOrder.user_id)
      .eq("status", "active");
  }

  for (const item of subscriptionItems) {
    const billing = item.assigned_to === "yearly" ? "yearly" : "monthly";
    const periodEnd = new Date();

    if (billing === "yearly") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await supabase.from("subscriptions").insert({
      user_id: typedOrder.user_id,
      plan_id: item.item_id,
      billing_period: billing,
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  await supabase
    .from("cart_items")
    .delete()
    .eq("user_id", typedOrder.user_id)
    .in("item_type", ["product", "subscription"]);
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Signature Stripe manquante" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret as string);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signature Stripe invalide" },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id || session.client_reference_id;

    if (!orderId) {
      return NextResponse.json({ error: "order_id manquant" }, { status: 400 });
    }

    await activateOrder(orderId, session);
  }

  return NextResponse.json({ received: true });
}
