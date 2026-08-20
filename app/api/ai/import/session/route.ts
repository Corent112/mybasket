import { AI_VISION_MODEL } from "@/lib/ai/config";
import {
  buildAIContext,
  buildScopeContext,
  getWriterClient,
  logAIUsage,
  resolveActor,
} from "@/lib/ai/knowledge";
import { getOpenAI } from "@/lib/ai/openai";
import { apiError, enforceRateLimit, readJson, str } from "@/lib/ai/http";
import type { AiSessionScan, AiSessionScanExercise } from "@/lib/import/session-scan-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = { image?: string; note?: string };

function extractJson(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Réponse IA non structurée.");
  return JSON.parse(clean.slice(start, end + 1));
}

function clampConfidence(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function duration(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(240, Math.round(n)));
}

function time(value: unknown) {
  const v = str(value, 20).trim();
  const match = v.match(/^(\d{1,2})[:hH](\d{2})$/);
  if (!match) return "";
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : "";
}

function date(value: unknown) {
  const v = str(value, 30).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return "";
}

function normalizeExercise(raw: any, index: number): AiSessionScanExercise {
  return {
    title: str(raw?.title, 180) || `Exercice ${index + 1}`,
    durationMinutes: duration(raw?.durationMinutes),
    explanation: str(raw?.explanation, 3500),
    instructions: str(raw?.instructions, 3500),
    variants: str(raw?.variants, 2500),
    who: ["CP", "AC1", "AC2", "PP", "RV"].includes(String(raw?.who)) ? String(raw.who) : "CP",
    confidence: clampConfidence(raw?.confidence),
  };
}

function normalize(raw: any): AiSessionScan {
  const exercises = Array.isArray(raw?.exercises)
    ? raw.exercises.slice(0, 30).map((exercise: any, index: number) => normalizeExercise(exercise, index))
    : [];

  return {
    title: str(raw?.title, 180),
    theme: str(raw?.theme, 240),
    sessionDate: date(raw?.sessionDate),
    startTime: time(raw?.startTime),
    endTime: time(raw?.endTime),
    location: str(raw?.location, 300),
    exercises,
    confidence: {
      text: clampConfidence(raw?.confidence?.text),
      structure: clampConfidence(raw?.confidence?.structure),
    },
    warnings: Array.isArray(raw?.warnings)
      ? raw.warnings.map((warning: unknown) => str(warning, 300)).filter(Boolean).slice(0, 12)
      : [],
  };
}

export async function POST(request: Request) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);
  const { actor } = result;

  const limited = enforceRateLimit(request, "ai-session-scan", actor.userId, 8, 60_000);
  if (limited) return limited;

  const body = (await readJson<Body>(request)) || {};
  const image = str(body.image, 4_500_000);
  const note = str(body.note, 800);
  if (!image || !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image)) {
    return apiError("Image invalide. Utilise une photo JPG, PNG ou WebP.");
  }

  const client = getOpenAI();
  if (!client) return apiError("MyBasket AI n'est pas configuré côté serveur.", 503);

  const scope = buildScopeContext(actor);
  const context = await buildAIContext(actor.supabase, {
    query: note || "Numérisation d'une fiche séance de basketball manuscrite ou imprimée",
    module: "session-scan",
    scope,
    includeDocuments: true,
    includeTerms: true,
    includeCorrections: true,
    includeReferences: true,
    documentLimit: 5,
    termLimit: 8,
    correctionLimit: 5,
    referenceLimit: 3,
  });

  const prompt = `
Tu analyses UNE PHOTO d'une fiche séance de basketball (manuscrite, imprimée ou mixte) afin de préremplir le mode Coach de MyBasket.
Le coach vérifiera tout avant d'enregistrer. N'invente aucune information absente ou incertaine.

OBJECTIF :
1. Identifier les informations générales visibles : titre, thème, date, horaires, lieu.
2. Découper la feuille en exercices/ateliers distincts dans l'ordre réel de la séance.
3. Pour chaque exercice, remettre au propre le titre, la durée, le déroulement, les consignes et variantes visibles.
4. Si la feuille contient seulement un intitulé d'exercice sans explication, conserve cet intitulé et laisse les textes vides plutôt que d'inventer.
5. Si un temps global ou un créneau permet de calculer une durée de séance, NE répartis PAS artificiellement cette durée entre les exercices.

RÈGLES MYBASKET :
- Réponds UNIQUEMENT par un JSON valide, sans markdown.
- Rédige au présent.
- Dans les explications, désigne les participants par « le joueur 1 », « le joueur 2 », etc. lorsque la feuille permet d'identifier les rôles.
- Respecte la terminologie et les règles fournies dans les connaissances MyBasket.
- Durées en minutes entières ou null.
- Date uniquement au format YYYY-MM-DD si elle est certaine, sinon chaîne vide.
- Horaires uniquement HH:MM si certains, sinon chaîne vide.
- who : CP par défaut, sauf si CP/AC1/AC2/PP/RV est explicitement identifiable.
- confidence est compris entre 0 et 1.
- Ajoute un warning lorsqu'une ligne, un exercice ou une durée est ambiguë.

JSON ATTENDU :
{
  "title":"",
  "theme":"",
  "sessionDate":"",
  "startTime":"",
  "endTime":"",
  "location":"",
  "exercises":[
    {
      "title":"",
      "durationMinutes":null,
      "explanation":"",
      "instructions":"",
      "variants":"",
      "who":"CP",
      "confidence":0.0
    }
  ],
  "confidence":{"text":0.0,"structure":0.0},
  "warnings":[]
}

Note facultative du coach : ${note || "Aucune"}
`;

  const started = Date.now();
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    const response = await client.responses.create({
      model: AI_VISION_MODEL,
      instructions: context.systemPrompt,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: image, detail: "high" },
        ],
      }],
    });

    promptTokens = response.usage?.input_tokens ?? 0;
    completionTokens = response.usage?.output_tokens ?? 0;
    const scan = normalize(extractJson(response.output_text || ""));
    if (!scan.exercises.length) throw new Error("Aucun exercice détecté sur la fiche séance.");

    await logAIUsage(getWriterClient(actor.supabase), {
      userId: actor.userId,
      clubId: actor.clubIds[0] ?? null,
      module: "session-scan",
      operation: "analysis",
      model: AI_VISION_MODEL,
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - started,
      success: true,
      metadata: {
        inputType: "image",
        documentType: "practice-session",
        imageCount: 1,
        exerciseCount: scan.exercises.length,
        textConfidence: scan.confidence.text,
        structureConfidence: scan.confidence.structure,
      },
    });

    return Response.json({ session: scan, citations: context.citations, warnings: scan.warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur d'analyse.";
    console.error("[AI][session-scan]", error);
    await logAIUsage(getWriterClient(actor.supabase), {
      userId: actor.userId,
      clubId: actor.clubIds[0] ?? null,
      module: "session-scan",
      operation: "analysis",
      model: AI_VISION_MODEL,
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - started,
      success: false,
      error: message,
      metadata: { inputType: "image", documentType: "practice-session", imageCount: 1 },
    });
    return apiError("La fiche séance n'a pas pu être analysée. Réessaie avec une photo plus nette et cadrée.", 500);
  }
}
