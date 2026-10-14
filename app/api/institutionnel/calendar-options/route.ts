import { NextResponse } from "next/server";
import { institutionalSportActor, canManageSport } from "@/lib/institutionnel/sport-access-server";
import { POST as createSelection } from "../sport/selections/route";
import { POST as attachPlayer } from "../sport/players/route";
import { currentBasketballSeason, competitionSeason } from "@/lib/team-season";
function ageCategory(value: string) { const name = value.trim().toUpperCase(); return name === "U12" ? "U13" : name; }
function groupCategory(title: string) { return title.toUpperCase().match(/\bU\d{1,2}(?:[MF])?\b/)?.[0] || ""; }
export async function GET(req: Request) {
    const structureId = new URL(req.url).searchParams.get("structureId") || "";
    if (!structureId)
        return NextResponse.json({ error: "Institution manquante" }, { status: 400 });
    const ctx = await institutionalSportActor(structureId);
    if ("error" in ctx)
        return ctx.error;
    const [s, g, c, p] = await Promise.all([
        ctx.admin.from("institutional_selections").select("id,team_id,name,category,season_label").eq("structure_id", structureId).or("status.is.null,status.neq.archived").order("name"),
        ctx.admin.from("institutional_detection_events").select("id,title,event_date,event_type").eq("structure_id", structureId).eq("archived", false).order("event_date", { ascending: false }),
        ctx.admin.from("institutional_calendar_categories").select("id,name,color,description,event_types").eq("structure_id", structureId).eq("archived", false).order("name"),
        ctx.admin.from("institutional_players").select("category").eq("structure_id", structureId).eq("archived", false),
    ]);
    const legacyIds = new Set((g.data || []).map((row: any) => row.id));
    const selections = (s.data || []).map((row: any) => ({ ...row, origin: legacyIds.has(row.id) ? "detection" : "selection" }));
    const ids = new Set(selections.map((row: any) => row.id));
    const groups = (g.data || []).filter((row: any) => !ids.has(row.id)).map((row: any) => ({ id: row.id, name: row.title, category: groupCategory(row.title), event_date: row.event_date, season_label: competitionSeason([{ date: row.event_date }]), origin: "detection" }));
    const presets = Array.from(new Set<string>([...(p.data || []).map((row: any) => ageCategory(String(row.category || ""))), ...groups.map((row: any) => row.category), ...selections.map((row: any) => ageCategory(String(row.category || "")))].filter(Boolean))).sort();
    return NextResponse.json({ selections: [...selections, ...groups], categories: c.data || [], presetCategories: presets, errors: { selections: s.error?.message || g.error?.message || "", categories: c.error?.message || "" } });
}
export async function POST(req: Request) {
    const body = await req.json().catch(() => ({})), structureId = String(body.structureId || "");
    if (!structureId)
        return NextResponse.json({ error: "Institution manquante" }, { status: 400 });
    const ctx = await institutionalSportActor(structureId);
    if ("error" in ctx)
        return ctx.error;
    if (!canManageSport(ctx.member))
        return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
    if (body.kind === "category") {
        const name = String(body.name || "").trim(), color = String(body.color || "#6B1A2C");
        if (!name || name.length > 100 || !/^#[\da-f]{6}$/i.test(color))
            return NextResponse.json({ error: "Nom ou couleur de catégorie invalide" }, { status: 400 });
        const existing = await ctx.admin.from("institutional_calendar_categories").select("id,name,color,description,event_types").eq("structure_id", structureId).eq("archived", false);
        if (existing.error)
            return NextResponse.json({ error: existing.error.message }, { status: 400 });
        const same = (existing.data || []).find((row: any) => row.name.trim().toLowerCase() === name.toLowerCase());
        if (same)
            return NextResponse.json({ category: same });
        const saved = await ctx.admin.from("institutional_calendar_categories").insert({ structure_id: structureId, name, color, description: String(body.description || "").trim() || null, event_types: Array.isArray(body.eventTypes) ? body.eventTypes.filter((value: unknown) => typeof value === "string") : [], created_by: ctx.user.id }).select("id,name,color,description,event_types").single();
        if (saved.error)
            return NextResponse.json({ error: saved.error.message }, { status: 400 });
        return NextResponse.json({ category: saved.data });
    }
    if (body.kind !== "detection_group")
        return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
    const eventId = String(body.eventId || "");
    const group = await ctx.admin.from("institutional_detection_events").select("id,title,event_date").eq("structure_id", structureId).eq("id", eventId).eq("archived", false).maybeSingle();
    if (group.error || !group.data)
        return NextResponse.json({ error: "Groupe introuvable dans cette institution" }, { status: 404 });
    const request = (payload: Record<string, unknown>) => new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(payload) });
    const created = await createSelection(request({ structureId, detectionEventId: eventId, name: group.data.title, category: groupCategory(group.data.title), seasonLabel: competitionSeason([{ date: group.data.event_date }]) || currentBasketballSeason() }));
    if (!created)
        return NextResponse.json({ error: "Création de la sélection impossible" }, { status: 500 });
    const result = await created.json();
    if (!created.ok)
        return NextResponse.json(result, { status: created.status });
    const parts = await ctx.admin.from("institutional_detection_participants").select("player_id").eq("event_id", eventId);
    if (parts.error)
        return NextResponse.json({ error: parts.error.message }, { status: 400 });
    const members = await ctx.admin.from("institutional_selection_players").select("player_id").eq("selection_id", result.selection.id);
    if (members.error)
        return NextResponse.json({ error: members.error.message }, { status: 400 });
    const attached = new Set((members.data || []).map((row: any) => String(row.player_id)));
    const missing = [...new Set<string>((parts.data || []).filter((row: any) => row.player_id).map((row: any) => String(row.player_id)))].filter(id => !attached.has(id));
    for (let start = 0; start < missing.length; start += 5) {
        const responses = await Promise.all(missing.slice(start, start + 5).map(playerId => attachPlayer(request({ structureId, mode: "attach", selectionId: result.selection.id, playerId }))));
        const failed = responses.find(response => !response || !response.ok);
        if (responses.some(response => !response))
            return NextResponse.json({ error: "Rattachement du groupe interrompu" }, { status: 500 });
        if (failed) {
            const failure = await failed.json();
            return NextResponse.json({ error: failure.error || "Rattachement du groupe incomplet. Réessaie l’enregistrement." }, { status: failed.status });
        }
    }
    return NextResponse.json({ selection: result.selection });
}
