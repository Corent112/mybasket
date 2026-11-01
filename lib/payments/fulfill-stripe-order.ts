import type Stripe from 'stripe';
import {checkoutItemsDigest,equalDigest,paymentRowId} from './checkout-integrity';
function checked(result:any){if(result.error)throw Error(result.error.message);return result.data;}
/** Retry-safe fulfillment: deterministic primary keys prevent duplicate financial/access rows. */
export async function fulfillStripeOrder(db:any,session:Stripe.Checkout.Session){
 if(session.payment_status!=='paid'||session.status!=='complete')return false;
 const orderId=session.metadata?.order_id,userId=session.metadata?.user_id;
 if(!orderId||!userId||session.client_reference_id!==orderId)throw Error('Payment reference mismatch');
 const order=checked(await db.from('orders').select('*').eq('id',orderId).eq('user_id',userId).maybeSingle());
 if(!order||order.payment_provider!=='stripe'||order.stripe_session_id!==session.id)throw Error('Payment owner or session mismatch');
 if(['paid','succeeded','completed'].includes(String(order.status).toLowerCase()))return false;
 const amount=Number(order.total_cents??Math.round(Number(order.total)*100));
 if(!Number.isSafeInteger(amount)||amount<=0||session.currency!=='eur'||session.amount_total!==amount)throw Error('Payment amount mismatch');
 const items=checked(await db.from('order_items').select('*').eq('order_id',orderId).eq('user_id',userId));
 if(!items?.length||!equalDigest(session.metadata?.items_digest,checkoutItemsDigest(items)))throw Error('Payment items mismatch: review required');
 if(items.filter((i:any)=>i.item_type==='subscription').length>1)throw Error('Only one subscription per order');
 const now=new Date().toISOString();
 checked(await db.from('payments').upsert({id:paymentRowId(session.id),user_id:userId,order_id:orderId,amount_cents:amount,amount:amount/100,currency:'EUR',status:'paid',provider:'stripe',provider_session_id:session.id,description:`Commande MyBasket ${orderId}`,created_at:now,updated_at:now},{onConflict:'id',ignoreDuplicates:true}));
 for(const item of items.filter((i:any)=>i.item_type==='subscription'&&i.item_id)){
  const id=paymentRowId(`${session.id}:${item.id}`);
  const existing=checked(await db.from('subscriptions').select('id,created_at').eq('id',id).maybeSingle());
  if(existing){checked(await db.from('subscriptions').update({status:'canceled',updated_at:now}).eq('user_id',userId).in('status',['active','trialing']).lt('created_at',existing.created_at).neq('id',id));continue;}
  const current=checked(await db.from('subscriptions').select('*').eq('user_id',userId).eq('plan_id',item.item_id).in('status',['active','trialing']).order('current_period_end',{ascending:false}).limit(20));
  const nowDate=new Date(),lastEnd=(current||[]).map((s:any)=>Date.parse(s.current_period_end)).filter((n:number)=>Number.isFinite(n)&&n>nowDate.getTime());
  const start=new Date(lastEnd.length?Math.max(...lastEnd):nowDate.getTime()),end=new Date(start),yearly=item.assigned_to==='yearly';
  if(yearly)end.setFullYear(end.getFullYear()+1);else end.setMonth(end.getMonth()+1);
  checked(await db.from('subscriptions').upsert({id,user_id:userId,plan_id:item.item_id,billing_period:yearly?'yearly':'monthly',status:'active',current_period_start:nowDate.toISOString(),current_period_end:end.toISOString(),created_at:now,updated_at:now},{onConflict:'id',ignoreDuplicates:true}));
  const saved=checked(await db.from('subscriptions').select('created_at').eq('id',id).single());
  checked(await db.from('subscriptions').update({status:'canceled',updated_at:now}).eq('user_id',userId).in('status',['active','trialing']).lt('created_at',saved.created_at).neq('id',id));
 }
 // Only remove the original purchased cart rows, never items added after checkout.
 const cartIds=items.map((i:any)=>i.metadata?.cart_item_id).filter((id:any)=>typeof id==='string');
 if(cartIds.length)checked(await db.from('cart_items').delete().eq('user_id',userId).in('id',cartIds));
 // Complete last; a failed access write leaves the order retryable.
 const result=checked(await db.from('orders').update({status:'paid',paid_at:now,updated_at:now}).eq('id',orderId).eq('user_id',userId).eq('status',order.status).select('id'));
 return !!result?.length;
}
