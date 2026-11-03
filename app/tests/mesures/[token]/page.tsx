import PublicPlayerTestForm from '@/components/players/PublicPlayerTestForm';
export const metadata={title:'Saisie des tests · MyBasket',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{token:string}>}){const{token}=await params;return <PublicPlayerTestForm token={token}/>}
