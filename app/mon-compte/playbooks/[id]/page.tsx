import PlaybookDetail from "@/components/playbook/PlaybookDetail";

export default async function PlaybookDetailPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlaybookDetail key={id} id={id} />;
}
