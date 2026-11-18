import { redirect } from 'next/navigation';
import { resolveActor } from '@/lib/ai/knowledge';
import AssistantWorkspace from '@/components/assistant/AssistantWorkspace';
export default async function AssistantPage(){
  const actor=await resolveActor();if(!actor.ok)redirect('/connexion?next=/assistant');
  return <AssistantWorkspace configured={Boolean(process.env.OPENAI_API_KEY)} />;
}
