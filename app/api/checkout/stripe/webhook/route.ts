import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();

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

      await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", userId)
        .eq("item_type", "product");
    }
  }

  return NextResponse.json({ received: true });
}