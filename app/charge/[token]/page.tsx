import PublicPlayerLoadForm from "@/components/equipes/PublicPlayerLoadForm";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicPlayerLoadForm token={token} />;
}
