import {createHash,timingSafeEqual} from 'node:crypto';
type Item=Record<string,any>;
export function checkoutItemsDigest(items:Item[]){
 const canonical=items.map(item=>({id:String(item.id),type:String(item.item_type),item:String(item.item_id||''),billing:String(item.assigned_to||''),quantity:Number(item.quantity||1),cents:Number(item.unit_price_cents??item.price_cents??Math.round(Number(item.unit_price??item.price??0)*100))})).sort((a,b)=>a.id.localeCompare(b.id));
 return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
export function equalDigest(a:unknown,b:unknown){return typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
export function paymentRowId(reference:string){const h=createHash('sha256').update(`mybasket-payment-v1:${reference}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
export function safeQuantity(value:unknown){const n=Number(value??1);return Number.isFinite(n)?Math.max(1,Math.min(99,Math.trunc(n))):1;}
