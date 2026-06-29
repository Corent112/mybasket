// app/api/club/settings/signature-image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const clubId = String(formData.get("clubId") || "");
    const file = formData.get("file") as File | null;

    if (!clubId || !file) {
      return NextResponse.json({ error: "clubId ou fichier manquant." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "La signature doit être une image." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      return NextResponse.json({ error: "Non connecté." }, { status: 401 });
    }

    const { data: member } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!member || !["owner", "admin", "direction_technique", "secretariat"].includes(member.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${clubId}/settings/signature-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("club-documents")
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicData } = supabase.storage.from("club-documents").getPublicUrl(path);
    const url = publicData.publicUrl;

    const { error: updateError } = await supabase
      .from("club_settings")
      .update({ signature_image_url: url })
      .eq("club_id", clubId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
  }
}
