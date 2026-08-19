import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendOrderEmails } from "@/lib/order-email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Signature manquante" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook invalide" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 500 });

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const orderId = session.metadata?.order_id;
    const userId = session.metadata?.user_id;

    if (orderId && userId) {
      await supabase
        .from("orders")
        .update({
          status: "paid",
          stripe_session_id: session.id,
          paid_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("user_id", userId);

      const { data: subscriptionItems } = await supabase
        .from("order_items")
        .select("item_id,assigned_to")
        .eq("order_id", orderId)
        .eq("item_type", "subscription");

      if (subscriptionItems?.length) {
        const now = new Date();

        for (const item of subscriptionItems) {
          if (!item.item_id) continue;

          // En cas de prolongation, on repart de la fin de l'abonnement actuel
          // si elle est future. Ainsi le client ne perd pas les jours déjà payés.
          const { data: currentSubscriptions } = await supabase
            .from("subscriptions")
            .select("id,plan_id,current_period_end,status")
            .eq("user_id", userId)
            .in("status", ["active", "trialing"])
            .order("current_period_end", { ascending: false })
            .limit(10);

          const current = (currentSubscriptions ?? []).find(
            (row: any) => String(row.plan_id) === String(item.item_id),
          );
          const currentEnd = current?.current_period_end
            ? new Date(current.current_period_end)
            : null;
          const periodStart =
            currentEnd && !Number.isNaN(currentEnd.getTime()) && currentEnd > now
              ? currentEnd
              : now;
          const end = new Date(periodStart);
          const yearly = item.assigned_to === "yearly";
          if (yearly) end.setFullYear(end.getFullYear() + 1);
          else end.setMonth(end.getMonth() + 1);

          // Créer le nouvel abonnement AVANT d'annuler l'ancien évite toute
          // fenêtre où /api/access ne trouve plus aucun abonnement actif.
          const { data: created, error: subscriptionError } = await supabase
            .from("subscriptions")
            .insert({
              user_id: userId,
              plan_id: item.item_id,
              billing_period: yearly ? "yearly" : "monthly",
              status: "active",
              current_period_start: periodStart.toISOString(),
              current_period_end: end.toISOString(),
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .select("id")
            .single();

          if (subscriptionError || !created?.id) {
            throw subscriptionError || new Error("Création abonnement impossible");
          }

          await supabase
            .from("subscriptions")
            .update({ status: "canceled", updated_at: now.toISOString() })
            .eq("user_id", userId)
            .in("status", ["active", "trialing"])
            .neq("id", created.id);
        }
      }

      await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", userId)
        .in("item_type", ["product", "subscription"]);

      await sendOrderEmails(orderId);
    }
  }

  return NextResponse.json({ received: true });
}