import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import styles from "../page.module.css";

async function createClub(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion");

  const name = String(formData.get("name") || "").trim();
  const city = String(formData.get("city") || "").trim();

  if (!name) redirect("/admin/clubs/nouveau?error=missing-name");

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .insert({
      name,
      city: city || null,
      status: "active",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (clubError || !club) {
    console.error("Erreur création club:", clubError);
    redirect("/admin/clubs/nouveau?error=create-club");
  }

  const { error: memberError } = await supabase
    .from("club_members")
    .insert({
      club_id: club.id,
      user_id: user.id,
      role: "owner",
      status: "active",
    });

  if (memberError) {
    console.error("Erreur club_members:", memberError);
    redirect("/admin/clubs/nouveau?error=create-member");
  }

  redirect(`/admin/clubs/${club.id}`);
}

export default function NewClubPage() {
  return (
    <main className={styles.adminClubs}>
      <div className={styles.container}>
        <Link href="/admin/clubs" className={styles.backLink}>
          ← Retour aux clubs
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Créer un club</h1>
            <span>
              Création du club + rattachement automatique de ton compte en owner.
            </span>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Nouveau club</h2>
          </div>

          <form action={createClub} className={styles.filters}>
            <input name="name" placeholder="Nom du club" required />
            <input name="city" placeholder="Ville" />

            <button type="submit">Créer le club</button>
          </form>
        </section>
      </div>
    </main>
  );
}