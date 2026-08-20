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
import type { AiShootingGridImport } from "@/lib/import/shooting-grid-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RosterPlayer = { id: string; name: string };
type GridRow = { id: string; name: string };
type Body = {
  image?: string;
  note?: string;
  gridName?: string;
  inputMode?: "fixed_attempts" | "fixed_makes";
  fixedValue?: number;
  players?: RosterPlayer[];
  rows?: GridRow[];
};

function extractJson(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Réponse IA non structurée.");
  return JSON.parse(clean.slice(start, end + 1));
}

function safeCount(value: unknown, max = 1000): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function conf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function validDate(value: unknown): string | null {
  const s = str(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalize(raw: any, roster: RosterPlayer[], rows: GridRow[]): AiShootingGridImport {
  const playerIds = new Set(roster.map((p) => p.id));
  const rowIds = new Set(rows.map((r) => r.id));

  const players = Array.isArray(raw?.players)
    ? raw.players.slice(0, 40).map((p: any) => ({
        sourceName: str(p?.sourceName, 120) || "Joueur non identifié",
        matchedPlayerId:
          typeof p?.matchedPlayerId === "string" && playerIds.has(p.matchedPlayerId)
            ? p.matchedPlayerId
            : null,
        matchConfidence: conf(p?.matchConfidence),
        results: Array.isArray(p?.results)
          ? p.results.slice(0, 80).map((r: any) => ({
              sourceSpot: str(r?.sourceSpot, 160) || "Spot non identifié",
              matchedRowId:
                typeof r?.matchedRowId === "string" && rowIds.has(r.matchedRowId)
                  ? r.matchedRowId
                  : null,
              made: safeCount(r?.made),
              attempted: safeCount(r?.attempted),
              confidence: conf(r?.confidence),
            }))
          : [],
      }))
    : [];

  return {
    sessionDate: validDate(raw?.sessionDate),
    notes: str(raw?.notes, 1200),
    players,
    confidence: {
      text: conf(raw?.confidence?.text),
      mapping: conf(raw?.confidence?.mapping),
    },
    warnings: Array.isArray(raw?.warnings)
      ? raw.warnings.map((v: unknown) => str(v, 260)).filter(Boolean).slice(0, 12)
      : [],
  };
}

export async function POST(request: Request) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);
  const { actor } = result;

  const limited = enforceRateLimit(request, "ai-photo-shooting-grid", actor.userId, 10, 60_000);
  if (limited) return limited;

  const body = (await readJson<Body>(request)) || {};
  const image = str(body.image, 4_500_000);
  const note = str(body.note, 800);
  const gridName = str(body.gridName, 160) || "Grille de tir";
  const inputMode = body.inputMode === "fixed_makes" ? "fixed_makes" : "fixed_attempts";
  const fixedValue = Math.max(1, Math.min(500, Number(body.fixedValue) || 10));
  const roster = Array.isArray(body.players)
    ? body.players
        .slice(0, 80)
        .map((p) => ({ id: str(p?.id, 100), name: str(p?.name, 160) }))
        .filter((p) => p.id && p.name)
    : [];
  const rows = Array.isArray(body.rows)
    ? body.rows
        .slice(0, 80)
        .map((r) => ({ id: str(r?.id, 100), name: str(r?.name, 180) }))
        .filter((r) => r.id && r.name)
    : [];

  if (!image || !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image)) {
    return apiError("Image invalide. Utilise une photo JPG, PNG ou WebP.");
  }
  if (!roster.length) return apiError("Aucun joueur n'est disponible dans cette équipe.");
  if (!rows.length) return apiError("Cette grille ne contient aucun spot.");

  const client = getOpenAI();
  if (!client) return apiError("MyBasket AI n'est pas configuré côté serveur.", 503);

  const scope = buildScopeContext(actor);
  const context = await buildAIContext(actor.supabase, {
    query: note || "Lecture d'une grille de tir basketball manuscrite et saisie des résultats",
    module: "photo-analysis",
    scope,
    includeDocuments: true,
    includeTerms: true,
    includeCorrections: true,
    includeReferences: false,
    documentLimit: 4,
    termLimit: 8,
    correctionLimit: 5,
    referenceLimit: 0,
  });

  const rosterText = roster.map((p) => `- ${p.id}: ${p.name}`).join("\n");
  const rowsText = rows.map((r) => `- ${r.id}: ${r.name}`).join("\n");
  const prompt = `
Tu analyses UNE PHOTO d'une grille de tir de basketball remplie sur papier.
Ton but est de retranscrire les résultats dans la grille MyBasket déjà ouverte, sans inventer.

GRILLE MYBASKET : ${gridName}
MODE : ${inputMode === "fixed_attempts" ? `${fixedValue} tirs tentés imposés par spot` : `${fixedValue} tirs marqués imposés par spot`}

JOUEURS DISPONIBLES :
${rosterText}

SPOTS DISPONIBLES :
${rowsText}

RÈGLES :
- Réponds UNIQUEMENT avec un objet JSON valide, sans markdown.
- Lis les noms/prénoms/initiales tels qu'ils apparaissent sur la feuille.
- matchedPlayerId doit être un ID de la liste uniquement si la correspondance est suffisamment sûre. Sinon null.
- matchedRowId doit être un ID de spot de la liste uniquement si la correspondance est suffisamment sûre. Sinon null.
- TM = made = tirs marqués. TT = attempted = tirs tentés.
- Si la feuille indique « 6/10 », made=6 et attempted=10.
- Si elle n'affiche qu'un nombre de paniers et que le mode impose ${fixedValue} tentés, utilise attempted=${fixedValue} seulement si cela correspond clairement au tableau.
- Si elle n'affiche qu'un nombre de tentatives et que le mode impose ${fixedValue} marqués, utilise made=${fixedValue} seulement si cela correspond clairement au tableau.
- Ne calcule pas un chiffre illisible. Mets null et ajoute un warning.
- Ne crée aucun joueur et aucun spot absent des listes MyBasket.
- Détecte la date seulement si elle apparaît clairement. Format YYYY-MM-DD.

JSON ATTENDU :
{
  "sessionDate": null,
  "notes": "",
  "players": [
    {
      "sourceName": "Paul",
      "matchedPlayerId": "id-ou-null",
      "matchConfidence": 0.0,
      "results": [
        {
          "sourceSpot": "Corner G",
          "matchedRowId": "id-ou-null",
          "made": 6,
          "attempted": 10,
          "confidence": 0.0
        }
      ]
    }
  ],
  "confidence": {"text":0.0,"mapping":0.0},
  "warnings": []
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
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image, detail: "high" },
          ],
        },
      ],
    });

    promptTokens = response.usage?.input_tokens ?? 0;
    completionTokens = response.usage?.output_tokens ?? 0;
    const normalized = normalize(extractJson(response.output_text || ""), roster, rows);

    await logAIUsage(getWriterClient(actor.supabase), {
      userId: actor.userId,
      clubId: actor.clubIds[0] ?? null,
      module: "photo-analysis",
      operation: "analysis",
      model: AI_VISION_MODEL,
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - started,
      success: true,
      metadata: {
        inputType: "image",
        documentType: "shooting-grid",
        gridName,
        detectedPlayers: normalized.players.length,
      },
    });

    return Response.json({ ok: true, data: normalized });
  } catch (error: any) {
    console.error("[ai/import/shooting-grid]", error);
    try {
      await logAIUsage(getWriterClient(actor.supabase), {
        userId: actor.userId,
        clubId: actor.clubIds[0] ?? null,
        module: "photo-analysis",
        operation: "analysis",
        model: AI_VISION_MODEL,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - started,
        success: false,
        error: error?.message || "Analyse grille de tir impossible",
        metadata: { inputType: "image", documentType: "shooting-grid", gridName },
      });
    } catch {}
    return apiError(error?.message || "Impossible d'analyser cette grille de tir.", 500);
  }
}
