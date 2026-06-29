import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

type CartItem = {
  id: string;
  user_id: string;
  item_type: "product" | "subscription" | "exercise" | "system" | "session";
  item_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  quantity: number | null;
  assigned_to: string | null;
  sort_order: number | null;
  metadata?: Record<string, unknown> | null;
};

type PayableItem = CartItem & {
  safeTitle: string;
  safeDescription: string | null;
  safeImageUrl: string | null;
  unitCents: number;
  quantity: number;
};

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY manquant dans .env.local");
}

const stripe = new Stripe(stripeSecretKey);

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function toPositiveQuantity(value: number | null | undefined) {
  return Math.max(1, Math.min(99, Number(value || 1)));
}

async function resolveSafeItem(supabase: Awaited<ReturnType<typeof createClient>>, item: CartItem): Promise<PayableItem | null> {
  const quantity = toPositiveQuantity(item.quantity);

  if (item.item_type === "product") {
    if (!item.item_id) return null;

    const { data, error } = await supabase
      .from("products")
      .select("id, name, description, image_url, price_cents, status")
      .eq("id", item.item_id)
      .eq("status", "active")
      .maybeSingle();

    if (error || !data) return null;

    const product = data as {
      id: string;
      name: string | null;
      description: string | null;
      image_url: string | null;
      price_cents: number | null;
      status: string | null;
    };

    const unitCents = Number(product.price_cents || 0);
    if (unitCents <= 0) return null;

    return {
      ...item,
      quantity,
      safeTitle: product.name || item.title || "Produit MyBasket",
      safeDescription: product.description,
      safeImageUrl: product.image_url,
      unitCents,
    };
  }

  if (item.item_type === "subscription") {
    if (!item.item_id) return null;

    const billing = item.assigned_to === "yearly" ? "yearly" : "monthly";

    const { data, error } = await supabase
      .from("subscription_plans")
      .select("id, name, status, price_monthly_cents, price_yearly_cents, price_cents")
      .eq("id", item.item_id)
      .eq("status", "active")
      .maybeSingle();

    if (error || !data) return null;

    const plan = data as {
      id: string;
      name: string | null;
      status: string | null;
      price_monthly_cents: number | null;
      price_yearly_cents: number | null;
      price_cents: number | null;
    };

    const unitCents = billing === "yearly"
      ? Number(plan.price_yearly_cents || 0)
      : Number(plan.price_monthly_cents ?? plan.price_cents ?? 0);

    if (unitCents <= 0) return null;

    return {
      ...item,
      quantity: 1,
      assigned_to: billing,
      safeTitle: plan.name || item.title || "Abonnement MyBasket",
      safeDescription: `Période : ${billing === "yearly" ? "Annuel" : "Mensuel"}`,
      safeImageUrl: item.image_url,
      unitCents,
    };
  }

  return null;
}

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("cart_items")
      .select("*")
      .eq("user_id", user.id)
      .in("item_type", ["product", "subscription"]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cartItems = (data ?? []) as CartItem[];
    const payableItems: PayableItem[] = [];

    for (const item of cartItems) {
      const safe = await resolveSafeItem(supabase, item);
      if (safe) payableItems.push(safe);
    }

    if (payableItems.length === 0) {
      return NextResponse.json({ error: "Aucun article payant valide dans le panier." }, { status: 400 });
    }

    const subtotalCents = payableItems.reduce(
      (sum, item) => sum + item.unitCents * item.quantity,
      0
    );

    const taxCents = Math.round(subtotalCents * 0.2);
    const totalCents = subtotalCents + taxCents;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        status: "pending",
        payment_provider: "stripe",
        subtotal: subtotalCents / 100,
        tax: taxCents / 100,
        total: totalCents / 100,
        subtotal_cents: subtotalCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message ?? "Erreur commande" }, { status: 500 });
    }

    const orderItemsPayload = payableItems.map((item) => ({
      order_id: order.id,
      user_id: user.id,
      item_type: item.item_type,
      item_id: item.item_id,
      title: item.safeTitle,
      description: item.safeDescription,
      image_url: item.safeImageUrl,
      price: item.unitCents / 100,
      unit_price: item.unitCents / 100,
      price_cents: item.unitCents,
      unit_price_cents: item.unitCents,
      quantity: item.quantity,
      assigned_to: item.assigned_to,
      sort_order: item.sort_order ?? 0,
      metadata: {
        ...(item.metadata ?? {}),
        billing_period: item.item_type === "subscription" ? item.assigned_to : null,
      },
      created_at: new Date().toISOString(),
    }));

    const { error: orderItemsError } = await supabase
      .from("order_items")
      .insert(orderItemsPayload);

    if (orderItemsError) {
      return NextResponse.json({ error: orderItemsError.message }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: order.id,
      customer_email: user.email ?? undefined,
      payment_method_types: ["card"],
      line_items: payableItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: "eur",
          unit_amount: item.unitCents,
          product_data: {
            name: item.item_type === "subscription" ? `Abonnement MyBasket - ${item.safeTitle}` : item.safeTitle,
            description: item.safeDescription ?? undefined,
            images: item.safeImageUrl ? [item.safeImageUrl] : undefined,
          },
        },
      })),
      success_url: `${siteUrl()}/panier/success?order=${order.id}`,
      cancel_url: `${siteUrl()}/panier`,
      metadata: {
        order_id: order.id,
        user_id: user.id,
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Impossible de créer la session Stripe." }, { status: 500 });
    }

    await supabase
      .from("orders")
      .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", order.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Erreur checkout Stripe:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur Stripe inconnue." },
      { status: 500 }
    );
  }
}
