import InstitutionalWorkspace from "@/components/institutionnel/InstitutionalWorkspace";
export default async function Page({params}:{params:Promise<{structureId:string}>}){const{structureId}=await params;return <InstitutionalWorkspace structureId={structureId}/>}
