import {subscriptionIsUsable,grantIsUsable,normalizePlanSlug} from '@/lib/effective-subscription';
type Row=Record<string,any>;
export function resolveAdminUserSubscription(user:{id:string;email?:string|null},subscriptions:Row[],grants:Row[],plans:Row[],now=Date.now()){
 const recent=(a:Row,b:Row)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)||String(b.id||'').localeCompare(String(a.id||''));
 const rows=subscriptions.filter(r=>r.user_id===user.id).sort(recent);
 const subscription=rows.find(r=>r.plan_id&&subscriptionIsUsable(r,now));
 const paidPlan=subscription&&plans.find(p=>p.id===subscription.plan_id);
 const email=String(user.email||'').trim().toLowerCase();
 const grant=grants.filter(r=>email&&String(r.user_email||'').trim().toLowerCase()===email).sort((a,b)=>(Date.parse(b.updated_at)||Date.parse(b.created_at)||0)-(Date.parse(a.updated_at)||Date.parse(a.created_at)||0)||recent(a,b)).find(r=>grantIsUsable(r,now));
 if(grant?.plan_slug){const wanted=normalizePlanSlug(grant.plan_slug),plan=plans.find(p=>p.status==='active'&&(normalizePlanSlug(p.slug)===wanted||normalizePlanSlug(p.name)===wanted))||{id:null,name:grant.plan_slug};return {active:true,source:'free',plan,subscription:grant};}
 if(paidPlan)return {active:true,source:'subscription',plan:paidPlan,subscription};
 const previous=rows[0];return {active:false,source:null,plan:previous?plans.find(p=>p.id===previous.plan_id)||null:null,subscription:previous||null};
}
export async function readAllAuthUsers(client:any){
 const users:Row[]=[];
 for(let page=1;;page++){
  const {data,error}=await client.auth.admin.listUsers({page,perPage:200});
  if(error)throw Error("Lecture des comptes impossible : "+error.message);
  if(!data?.users?.length)return users;
  users.push(...data.users);
 }
}
export async function readAdminRows(client:any,table:string,select='*'){
 const rows:Row[]=[];
 for(let start=0;;start+=1000){const {data,error}=await client.from(table).select(select).order('id').range(start,start+999);if(error)throw Error(`Lecture ${table} impossible : ${error.message}`);rows.push(...(data||[]));if((data||[]).length<1000)return rows;}
}

