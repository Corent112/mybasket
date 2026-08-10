import { createAdminClient } from "@/lib/supabase/admin-server";
import { ADMIN_EMAIL, sendTransactionalEmail } from "@/lib/server-notifications";

function euro(cents: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100); }
function esc(v: unknown) { return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }

export async function sendOrderEmails(orderId: string) {
  const supabase = createAdminClient();
  if (!supabase) return;

  const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return;
  const { data: items } = await supabase.from("order_items").select("*").eq("order_id", orderId).order("sort_order");
  const { data: userData } = await supabase.auth.admin.getUserById(order.user_id);
  const customerEmail = userData?.user?.email || null;

  const totalCents = Number(order.total_cents ?? Math.round(Number(order.total || 0) * 100));
  const taxCents = Number(order.tax_cents ?? Math.round(Number(order.tax || 0) * 100));
  const subtotalCents = Number(order.subtotal_cents ?? Math.round(Number(order.subtotal || 0) * 100));
  const rows = (items || []).map((item: any) => `<tr><td style="padding:9px;border-bottom:1px solid #eee">${esc(item.title)}</td><td style="padding:9px;border-bottom:1px solid #eee;text-align:center">${item.quantity || 1}</td><td style="padding:9px;border-bottom:1px solid #eee;text-align:right">${euro(Number(item.unit_price_cents ?? Math.round(Number(item.unit_price || item.price || 0)*100)) * Number(item.quantity || 1))}</td></tr>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto"><div style="background:#6B1A2C;color:#fff;padding:20px"><h2 style="margin:0">MyBasket — Facture / commande ${esc(orderId.slice(0,8).toUpperCase())}</h2></div><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:9px">Produit</th><th>Qté</th><th style="text-align:right;padding:9px">Prix</th></tr></thead><tbody>${rows}</tbody></table><div style="margin-left:auto;width:320px;padding:16px"><p>Sous-total HT : <strong>${euro(subtotalCents)}</strong></p><p>Dont TVA 20% : <strong>${euro(taxCents)}</strong></p><p style="font-size:18px">TOTAL TTC : <strong>${euro(totalCents)}</strong></p></div><p style="color:#777">Paiement : ${esc(order.payment_provider || "en ligne")} · Référence ${esc(orderId)}</p></div>`;

  const sends = [] as Promise<unknown>[];
  if (customerEmail) sends.push(sendTransactionalEmail({ to: customerEmail, subject: `Votre facture MyBasket — ${orderId.slice(0,8).toUpperCase()}`, html }));
  sends.push(sendTransactionalEmail({ to: ADMIN_EMAIL, subject: `[MyBasket] Bon de commande — ${orderId.slice(0,8).toUpperCase()}`, html: `<p><strong>Client :</strong> ${esc(customerEmail || order.user_id)}</p>${html}` }));
  await Promise.allSettled(sends);
}
