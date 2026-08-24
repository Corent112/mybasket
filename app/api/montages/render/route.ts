import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token =
      auth.replace(/^Bearer\s+/i, "") ||
      req.cookies.get("sb-access-token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const montageId = String(body.montageId || "");
    const playbackRate = Math.max(0.25, Math.min(4, Number(body.playbackRate || 1)));

    if (!montageId) {
      return NextResponse.json({ error: "montageId manquant" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData.user) {
      return NextResponse.json({ error: "Session invalide" }, { status: 401 });
    }

    const { data: montage, error: montageError } = await supabase
      .from("livestat_montages")
      .select("*")
      .eq("id", montageId)
      .single();

    if (
      montageError ||
      !montage ||
      String(montage.user_id) !== String(userData.user.id)
    ) {
      return NextResponse.json({ error: "Montage introuvable" }, { status: 404 });
    }

    const { data: items, error: itemsError } = await supabase
      .from("livestat_montage_items")
      .select("*")
      .eq("montage_id", montageId)
      .order("sort_order", { ascending: true });

    if (itemsError) throw itemsError;

    const actionIds = (items ?? [])
      .map((item: any) => item.action_id)
      .filter(Boolean);

    const { data: actions, error: actionsError } = actionIds.length
      ? await supabase
          .from("match_actions")
          .select(
            "id,client_action_id,match_id,team_id,player_id,clip_start,clip_end,edited_clip_start,edited_clip_end,video_time,clip_title",
          )
          .in("id", actionIds)
      : { data: [], error: null };

    if (actionsError) throw actionsError;

    const matchIds = Array.from(
      new Set((actions ?? []).map((action: any) => action.match_id).filter(Boolean)),
    );

    const { data: matches, error: matchesError } = matchIds.length
      ? await supabase
          .from("match_stats")
          .select("id,video_url,youtube_url,opponent,match_date")
          .in("id", matchIds)
      : { data: [], error: null };

    if (matchesError) throw matchesError;

    const actionMap = Object.fromEntries(
      (actions ?? []).map((action: any) => [String(action.id), action]),
    );
    const matchMap = Object.fromEntries(
      (matches ?? []).map((match: any) => [String(match.id), match]),
    );

    const manifest = {
      version: 3,
      montage: {
        id: montage.id,
        title: montage.title,
        team_id: montage.team_id,
        player_id: montage.player_id,
        coach_note: montage.coach_note,
      },
      playback_rate: playbackRate,
      generated_at: new Date().toISOString(),
      items: (items ?? []).map((item: any) => {
        const action = item.action_id ? actionMap[String(item.action_id)] : null;
        const match = action?.match_id ? matchMap[String(action.match_id)] : null;

        return {
          id: item.id,
          item_type: item.item_type,
          track: item.track,
          timeline_start: Number(item.timeline_start || 0),
          duration: Number(item.duration || 0),
          title: item.title,
          text: item.text,
          image_url: item.image_url,
          volume: Number(item.volume ?? 1),
          freeze_time: item.freeze_time,
          freeze_duration: item.freeze_duration,
          annotations: item.annotations || [],
          editor_state: item.editor_state || {},
          playback_rate: Number(item.editor_state?.playbackRate ?? 1),
          repeat_count: Math.max(1, Number(item.editor_state?.repeatCount ?? 1)),
          transition: item.editor_state?.transition || "none",
          clip_start: item.clip_start,
          clip_end: item.clip_end,
          action_id: item.action_id,
          source: action
            ? {
                action_id: action.id,
                match_id: action.match_id,
                video_url: match?.video_url || match?.youtube_url || null,
                clip_start:
                  item.clip_start ??
                  action.edited_clip_start ??
                  action.clip_start ??
                  action.video_time ??
                  0,
                clip_end:
                  item.clip_end ??
                  action.edited_clip_end ??
                  action.clip_end ??
                  action.video_time ??
                  0,
              }
            : null,
        };
      }),
    };

    const { data: job, error: jobError } = await supabase
      .from("livestat_render_jobs")
      .insert({
        user_id: userData.user.id,
        montage_id: montageId,
        status: "queued",
        render_manifest: manifest,
        progress: 0,
      })
      .select("id,status")
      .single();

    if (jobError) throw jobError;

    await supabase
      .from("livestat_montages")
      .update({
        export_status: "queued",
        updated_at: new Date().toISOString(),
      })
      .eq("id", montageId);

    return NextResponse.json({ ok: true, job });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 },
    );
  }
}
