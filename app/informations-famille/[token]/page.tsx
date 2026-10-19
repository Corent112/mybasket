import type { Metadata } from 'next';
import FamilyQuestionnaire from './FamilyQuestionnaire';
export const metadata:Metadata={title:'Informations famille · MyBasket',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{token:string}>}) {
  const {token}=await params;return <FamilyQuestionnaire token={token}/>;
}
