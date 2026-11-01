import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";
import {getSiteUrl} from "@/lib/site-url";
import {checkoutItemsDigest,safeQuantity} from "@/lib/payments/checkout-integrity";
import {isSameOriginMutation} from "@/lib/security/request-origin";
import {rateLimit} from "@/lib/security/rate-limit";

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
  taxMode: "TTC" | "HT";
};

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY manquant dans .env.local");
  return new Stripe(key);
}

async function resolveSafeItem(supabase: Awaited<ReturnType<typeof createClient>>, item: CartItem): Promise<PayableItem | null> {
  const quantity = safeQuantity(item.quantity);

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
      taxMode: "TTC",
    };
  }

  if (item.item_type === "subscription") {
    if (!item.item_id) return null;

    const billing = item.assigned_to === "yearly" ? "yearly" : "monthly";

    const { data, error } = await supabase
      .from("subscription_plans")
      .select("id, name, status, price_monthly_cents, price_yearly_cents, price_cents, price_tax_mode")
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
      price_tax_mode: "TTC" | "HT" | null;
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
      taxMode: plan.price_tax_mode === "HT" ? "HT" : "TTC",
    };
  }

  return null;
}

export async function POST(request: Request) {
  try {
    if(!isSameOriginMutation(request))return NextResponse.json({error:"Requête refusée."},{status:403});
    if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)return NextResponse.json({error:"Le paiement en ligne est momentanément indisponible."},{status:503});
    const stripe = getStripe();
    const body = await request.json().catch(() => ({})) as { preferredMethod?: string };
    const preferredMethod = ["apple_pay","paypal"].includes(String(body.preferredMethod)) ? body.preferredMethod : "card";
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }

    if(!rateLimit(`checkout:${user.id}`,8,60000).allowed)return NextResponse.json({error:"Trop de tentatives. Réessaie dans une minute."},{status:429});
    const db=createAdminClient();if(!db)return NextResponse.json({error:"Paiement indisponible."},{status:503});
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

    if (payableItems.length !== cartItems.length || payableItems.length === 0 || payableItems.length > 100) {
      return NextResponse.json({ error: "Aucun article payant valide dans le panier." }, { status: 400 });
    }

    if(payableItems.filter(i=>i.item_type==="subscription").length>1)return NextResponse.json({error:"Choisis un seul abonnement par commande."},{status:400});
    const totalCents = payableItems.reduce(
      (sum, item) => {
        const line = item.unitCents * item.quantity;
        return sum + (item.taxMode === "HT" ? Math.round(line * 1.2) : line);
      },
      0
    );
    const taxCents = payableItems.reduce((sum, item) => {
      const line = item.unitCents * item.quantity;
      return sum + (item.taxMode === "HT"
        ? Math.round(line * 0.2)
        : Math.round(line - line / 1.2));
    }, 0);
    const subtotalCents = totalCents - taxCents;

    if(!Number.isSafeInteger(totalCents)||totalCents<50||totalCents>99999999)return NextResponse.json({error:"Montant du panier invalide."},{status:400});
    const now = new Date().toISOString();
    const completeOrderPayload = {
      user_id: user.id, status: "pending", payment_provider: "stripe",
      subtotal: subtotalCents / 100, tax: taxCents / 100, total: totalCents / 100,
      subtotal_cents: subtotalCents, tax_cents: taxCents, total_cents: totalCents,
      created_at: now, updated_at: now,
    };
    let orderResult = await db.from("orders").insert(completeOrderPayload).select("id").single();

    // Compatibilité avec les bases plus anciennes qui n'ont pas encore les colonnes *_cents.
    if (orderResult.error?.code === "PGRST204" || orderResult.error?.message?.includes("schema cache")) {
      orderResult = await db.from("orders").insert({
        user_id: user.id, status: "pending", payment_provider: "stripe",
        subtotal: subtotalCents / 100, tax: taxCents / 100, total: totalCents / 100,
        created_at: now, updated_at: now,
      }).select("id").single();
    }

    const { data: order, error: orderError } = orderResult;
    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message ?? "Erreur commande" }, { status: 500 });
    }

    const orderItemsPayload = payableItems.map((item) => ({
      id: crypto.randomUUID(),
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
        cart_item_id:item.id,
        billing_period: item.item_type === "subscription" ? item.assigned_to : null,
      },
      created_at: new Date().toISOString(),
    }));

    let { error: orderItemsError } = await db
      .from("order_items")
      .insert(orderItemsPayload);

    if (orderItemsError?.code === "PGRST204" || orderItemsError?.message?.includes("schema cache")) {
      const legacyPayload = orderItemsPayload.map(({ price_cents, unit_price_cents, ...item }) => item);
      const retry = await db.from("order_items").insert(legacyPayload);
      orderItemsError = retry.error;
    }

    if (orderItemsError) {
      return NextResponse.json({ error: orderItemsError.message }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: order.id,
      customer_email: user.email ?? undefined,
      line_items: payableItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: "eur",
          unit_amount: item.taxMode === "HT" ? Math.round(item.unitCents * 1.2) : item.unitCents,
          product_data: {
            name: item.item_type === "subscription" ? `Abonnement MyBasket - ${item.safeTitle}` : item.safeTitle,
            description: item.safeDescription ?? undefined,
            images: item.safeImageUrl ? [item.safeImageUrl] : undefined,
          },
        },
      })),
      success_url: `${getSiteUrl(request)}/panier/success?order=${order.id}`,
      cancel_url: `${getSiteUrl(request)}/panier`,
      metadata: {
        order_id: order.id,
        user_id: user.id,
        preferred_method: String(preferredMethod),
        items_digest: checkoutItemsDigest(orderItemsPayload),
        integrity_version: "1",
      },
    },{idempotencyKey:`checkout-${order.id}`});

    if (!session.url) {
      return NextResponse.json({ error: "Impossible de créer la session Stripe." }, { status: 500 });
    }

    const bound=await db.from("orders").update({stripe_session_id:session.id,updated_at:new Date().toISOString()}).eq("id",order.id).eq("user_id",user.id);
    if(bound.error){await stripe.checkout.sessions.expire(session.id);throw new Error("Session non enregistrée");}
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Erreur checkout Stripe:", error);

    return NextResponse.json(
      { error: "Impossible de préparer le paiement. Réessaie dans quelques instants." },
      { status: 500 }
    );
  }
}
