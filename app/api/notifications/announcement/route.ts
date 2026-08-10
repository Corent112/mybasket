import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlatformConversation, notifyAdmin } from "@/lib/server-notifications";

export async function POST(request: Request) {
  try {
    const { announcementId } = await request.json();
    if (!announcementId) return NextResponse.json({ error: "announcementId manquant" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

    const { data: ad, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("id", announcementId)
      .eq("author_user_id", user.id)
      .maybeSingle();

    if (error || !ad) return NextResponse.json({ error: error?.message || "Annonce introuvable" }, { status: 404 });

    const author = ad.author_name || user.email || "Utilisateur";
    const email = ad.author_email || user.email || "";

    await Promise.allSettled([
      notifyAdmin({
        subject: `[MyBasket] Nouvelle annonce à valider — ${ad.title || "Sans titre"}`,
        title: "Nouvelle annonce déposée",
        replyTo: email || null,
        fields: [
          ["Titre", ad.title], ["Catégorie", ad.category], ["Auteur", author],
          ["Email", email], ["Téléphone", ad.author_phone], ["Ville", ad.city],
          ["Statut", ad.status],
        ],
        message: ad.description,
      }),
      createPlatformConversation({
        type: "annonce",
        subject: `Annonce : ${ad.title || "Sans titre"}`,
        body: ad.description || "Nouvelle annonce déposée",
        senderUserId: user.id,
        senderName: author,
        senderEmail: email,
        referenceId: ad.id,
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur notification" }, { status: 500 });
  }
}
