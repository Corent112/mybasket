import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export default async function OrderResult({searchParams}:{searchParams:Promise<{order?:string}>}){
 const {order:id}=await searchParams,sb=await createClient(),{data:{user}}=await sb.auth.getUser();
 if(!user)redirect('/connexion?next=/panier');
 const {data:order}=id?await sb.from('orders').select('id,status,total').eq('id',id).eq('user_id',user.id).maybeSingle():{data:null};
 const paid=order&&['paid','succeeded','completed'].includes(order.status);
 return <main style={{maxWidth:620,margin:'80px auto',padding:28,background:'white',border:'1px solid #eadfd8',borderRadius:18}}><h1>{paid?'Paiement confirmé':order?'Confirmation du paiement en cours':'Commande introuvable'}</h1><p>{paid?'Merci ! Tes achats et ton accès sont enregistrés.':order?'La confirmation est transmise automatiquement par le prestataire. Ne paie pas une deuxième fois. Actualise cette page dans quelques instants.':'Cette commande n’est pas disponible pour ton compte.'}</p>{order&&<p>Référence : {order.id.slice(0,8).toUpperCase()}</p>}<div style={{display:'flex',gap:18,flexWrap:'wrap'}}>{order&&!paid&&<a href={`/panier/success?order=${encodeURIComponent(order.id)}`}>Actualiser</a>}<Link href="/mon-compte">Mon compte</Link><Link href="/panier">Retour au panier</Link></div></main>;
}
