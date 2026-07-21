import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MonCompteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?next=/mon-compte");

  return (
    <>
      {children}
    </>
  );
}