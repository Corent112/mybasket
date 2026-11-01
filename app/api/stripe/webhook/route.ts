import {NextResponse} from 'next/server';
import Stripe from 'stripe';
import {createAdminClient} from '@/lib/supabase/admin-server';
import {fulfillStripeOrder} from '@/lib/payments/fulfill-stripe-order';
import {sendOrderEmails} from '@/lib/order-email';
export async function POST(request:Request){
 const secret=process.env.STRIPE_SECRET_KEY,webhookSecret=process.env.STRIPE_WEBHOOK_SECRET;
 if(!secret||!webhookSecret)return NextResponse.json({error:'Payment service unavailable'},{status:503});
 const signature=request.headers.get('stripe-signature');if(!signature)return NextResponse.json({error:'Invalid signature'},{status:400});
 const stripe=new Stripe(secret);let event:Stripe.Event;
 try{event=stripe.webhooks.constructEvent(await request.text(),signature,webhookSecret)}catch{return NextResponse.json({error:'Invalid signature'},{status:400})}
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return NextResponse.json({received:true});
 try{
  const db=createAdminClient();if(!db)throw Error('Admin client unavailable');
  const announced=event.data.object as Stripe.Checkout.Session;
  const session=await stripe.checkout.sessions.retrieve(announced.id);
  const fulfilled=await fulfillStripeOrder(db,session);
  if(fulfilled)await sendOrderEmails(session.metadata!.order_id);
  return NextResponse.json({received:true});
 }catch(error){console.error('[payment] fulfillment failed',{eventId:event.id,error:error instanceof Error?error.message:'unknown'});return NextResponse.json({error:'Confirmation pending; retry required'},{status:500})}
}
