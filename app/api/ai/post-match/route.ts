import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  resolveActor,
  buildAIContext,
  buildScopeContext,
} from "@/lib/ai/knowledge";
import { getOpenAI } from "@/lib/ai/openai";
import { AI_MATCH_ANALYSIS_MODEL } from "@/lib/ai/config";
import {
  blankStats,
  matchEvidence,
  normalizeReport,
  normalizeSheet,
} from "@/lib/ai/match-analysis/model";
import { boxOf, automaticInsights, indicators } from "@/lib/analytics/matches";
import { rateLimit } from "@/lib/security/rate-limit";
import { isSameOriginMutation } from "@/lib/security/request-origin";
export const maxDuration = 90;
export async function POST(request: Request) {
  if (!isSameOriginMutation(request))
    return NextResponse.json({ error: "Origine invalide" }, { status: 403 });
  const result = await resolveActor();
  if (!result.ok)
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  const { actor } = result;
  const body = await request.json().catch(() => ({}));
  const id = typeof body.matchId === "string" ? body.matchId : "";
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id))
    return NextResponse.json({ error: "Match invalide" }, { status: 400 });
  const { data: match, error } = await actor.supabase
    .from("match_stats")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !match)
    return NextResponse.json({ error: "Match introuvable" }, { status: 404 });
  if (match.project_status && match.project_status !== "completed")
    return NextResponse.json(
      { error: "Le match doit être terminé." },
      { status: 409 },
    );
  const { data: rows, error: rowsError } = await actor.supabase
    .from("match_player_stats")
    .select("*")
    .eq("match_id", id)
    .limit(100);
  if (rowsError)
    return NextResponse.json(
      { error: "Statistiques indisponibles" },
      { status: 503 },
    );
  const own = boxOf(rows || []);
  const opponent = { ...boxOf([]), pts: match.them_score ?? null };
  const facts = {
    score: match.us_score,
    adversaire: match.them_score,
    statistiques: own,
    indicateurs: indicators(own, opponent),
  };
  const fallback = automaticInsights(own, opponent).join("\n");
  const ai = getOpenAI();
  if (!ai || !rows?.length)
    return NextResponse.json({
      text:
        fallback ||
        "Les statistiques détaillées de ce match ne sont pas encore renseignées.",
      source: "calculated",
    });
  const title = `post-match:${id}:${createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 24)}`;
  const { data: cached } = await actor.supabase
    .from("ai_conversations")
    .select("id")
    .eq("user_id", actor.userId)
    .eq("module", "post-match")
    .eq("title", title)
    .limit(1)
    .maybeSingle();
  if (cached) {
    const { data: message } = await actor.supabase
      .from("ai_messages")
      .select("content")
      .eq("conversation_id", cached.id)
      .eq("role", "assistant")
      .is("error", null)
      .limit(1)
      .maybeSingle();
    if (message?.content)
      return NextResponse.json({
        text: message.content,
        source: "ai",
        cached: true,
      });
  }
  if (!rateLimit(`post-match:${actor.userId}`, 6, 60000).allowed)
    return NextResponse.json({ text: fallback, source: "calculated" });
  try {
    const context = await buildAIContext(actor.supabase, {
      query:
        "Analyse après-match, efficacité offensive, pertes de balle, rebonds et adresse",
      module: "post-match",
      scope: buildScopeContext(actor),
      includeDocuments: true,
    });
    const sheet = normalizeSheet({
      teams: [
        {
          name: "Équipe analysée",
          players: [],
          totals: {
            ...blankStats(),
            pts: match.us_score ?? own.pts,
            twoMade: own.p2m,
            twoAttempted: own.p2a,
            threeMade: own.p3m,
            threeAttempted: own.p3a,
            ftMade: own.ftm,
            ftAttempted: own.fta,
            offReb: own.off_reb,
            defReb: own.def_reb,
            assists: own.ast,
            turnovers: own.turnovers,
          },
        },
        {
          name: "Adversaire",
          players: [],
          totals: { ...blankStats(), pts: match.them_score ?? null },
        },
      ],
    });
    const evidence = matchEvidence(sheet, 0);
    const response = await ai.responses.create({
      model: AI_MATCH_ANALYSIS_MODEL,
      store: false,
      max_output_tokens: 1200,
      instructions: `${context.systemPrompt}\nBilan après-match à partir des seules preuves fournies. JSON : {constats:[{text,evidence:[id]}],hypotheses:[{text,evidence:[id]}],priorites:[{text,evidence:[id]}]}. Deux ou trois constats, une hypothèse à vérifier en vidéo et deux pistes concrètes d’entraînement. Chaque phrase cite les identifiants des preuves qui la justifient. Aucun nombre dans les phrases : leurs valeurs sont ajoutées automatiquement. Aucune causalité certaine, psychologie ou blessure déduite des statistiques. Une comparaison exige une preuve pour chaque équipe. Les connaissances basket éclairent l’analyse sans inventer de faits sur ce match.`,
      input: JSON.stringify({ preuves: evidence }),
    });
    const raw = (response.output_text || "")
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, "");
    const report = normalizeReport(JSON.parse(raw), evidence);
    if (!report.constats.length) throw new Error("ungrounded");
    const text = (
      [
        ["Constats", report.constats],
        ["À vérifier en vidéo", report.hypotheses],
        ["Pistes de travail", report.priorites],
      ] as const
    )
      .filter(([, items]) => items.length)
      .map(
        ([title, items]) =>
          title +
          "\n" +
          items
            .map(
              (item) =>
                item.text +
                " " +
                item.evidence
                  .map((id) => {
                    const e = evidence.find((p) => p.id === id)!;
                    return `${e.label} : ${e.value.toLocaleString("fr-FR")} ${e.unit}`;
                  })
                  .join(" · "),
            )
            .join("\n"),
      )
      .join("\n\n");

    const { data: conversation } = await actor.supabase
      .from("ai_conversations")
      .insert({
        user_id: actor.userId,
        module: "post-match",
        title,
        scope: "user",
      })
      .select("id")
      .single();
    if (conversation)
      await actor.supabase.from("ai_messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: text,
        citations: context.citations,
        model: AI_MATCH_ANALYSIS_MODEL,
      });
    return NextResponse.json({ text, source: "ai" });
  } catch {
    return NextResponse.json({
      text: fallback,
      source: "calculated",
      note: "Le bilan chiffré reste disponible. L’analyse IA pourra être relancée.",
    });
  }
}
