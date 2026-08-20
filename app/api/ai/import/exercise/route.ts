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
import type { AiExerciseImport } from "@/lib/import/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  image?: string;
  note?: string;
};

const ALLOWED_THEMES = [
  "Fondamentaux individuel",
  "Fondamentaux pré collectif",
  "Collectif",
  "Défense",
  "Surnombre",
  "Jeu rapide",
  "Repli",
  "Rebond",
  "Physique",
  "Adresse",
];

function extractJson(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Réponse IA non structurée.");
  return JSON.parse(clean.slice(start, end + 1));
}

function num(value: unknown, max = 100): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function confidence(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function normalize(raw: any): AiExerciseImport {
  const categories = ["— Choisir —", "U9", "U11", "U13", "U15", "U18", "U21", "Senior"];
  const types = ["Individuel", "Pré-co", "Collectif"];
  const levels = ["Débutant", "Intermédiaire", "Confirmé"];
  const courtType = raw?.diagram?.courtType === "full" ? "full" : "half";
  const maxY = courtType === "half" ? 0.49 : 0.98;
  const coord = (v: unknown, fallback = 0.5) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0.02, Math.min(0.98, n)) : fallback;
  };
  const coordY = (v: unknown) => Math.min(maxY, coord(v, courtType === "half" ? 0.25 : 0.5));

  const players = Array.isArray(raw?.diagram?.players)
    ? raw.diagram.players.slice(0, 20).map((p: any, i: number) => ({
        key: str(p?.key, 30) || `p${i + 1}`,
        label: str(p?.label, 8) || String(i + 1),
        team: p?.team === "def" ? "def" : "att",
        x: coord(p?.x),
        y: coordY(p?.y),
        hasBall: Boolean(p?.hasBall),
      }))
    : [];

  const objects = Array.isArray(raw?.diagram?.objects)
    ? raw.diagram.objects.slice(0, 30).map((o: any) => ({
        kind: ["cone", "ball", "text", "circle", "square", "triangle"].includes(o?.kind)
          ? o.kind
          : "cone",
        x: coord(o?.x),
        y: coordY(o?.y),
        text: str(o?.text, 80) || undefined,
      }))
    : [];

  const actions = Array.isArray(raw?.diagram?.actions)
    ? raw.diagram.actions.slice(0, 40).map((a: any, i: number) => ({
        action: ["pass", "dribble", "cut", "screen", "shoot"].includes(a?.action)
          ? a.action
          : "cut",
        fromPlayer: str(a?.fromPlayer, 30) || undefined,
        toPlayer: str(a?.toPlayer, 30) || undefined,
        from: a?.from ? { x: coord(a.from.x), y: coordY(a.from.y) } : undefined,
        to: { x: coord(a?.to?.x), y: coordY(a?.to?.y) },
        order: num(a?.order, 100) ?? i + 1,
      }))
    : [];

  return {
    title: str(raw?.title, 140) || "Exercice importé",
    organisation: str(raw?.organisation, 3000),
    deroulement: Array.isArray(raw?.deroulement) ? raw.deroulement.map((v: unknown) => str(v, 1200)).filter(Boolean) : [],
    consignes: Array.isArray(raw?.consignes) ? raw.consignes.map((v: unknown) => str(v, 1200)).filter(Boolean) : [],
    variantes: Array.isArray(raw?.variantes) ? raw.variantes.map((v: unknown) => str(v, 1200)).filter(Boolean) : [],
    plots: num(raw?.plots, 50),
    ballons: num(raw?.ballons, 50),
    paniers: num(raw?.paniers, 10),
    joueurs: num(raw?.joueurs, 30),
    categorie: categories.includes(raw?.categorie) ? raw.categorie : "— Choisir —",
    type: types.includes(raw?.type) ? raw.type : "Collectif",
    niveau: levels.includes(raw?.niveau) ? raw.niveau : "Intermédiaire",
    temps: num(raw?.temps, 180),
    themes: Array.isArray(raw?.themes)
      ? raw.themes.filter((v: unknown) => ALLOWED_THEMES.includes(String(v))).slice(0, 5)
      : [],
    diagram: {
      detected: Boolean(raw?.diagram?.detected) && players.length > 0,
      courtType,
      players,
      objects,
      actions,
      notes: str(raw?.diagram?.notes, 800),
    },
    confidence: {
      text: confidence(raw?.confidence?.text),
      diagram: confidence(raw?.confidence?.diagram),
    },
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map((v: unknown) => str(v, 240)).filter(Boolean).slice(0, 8) : [],
  } as AiExerciseImport;
}

export async function POST(request: Request) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);
  const { actor } = result;

  const limited = enforceRateLimit(request, "ai-photo-exercise", actor.userId, 10, 60_000);
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
    query: note || "Analyse d'un croquis d'exercice de basketball et reconstruction du schéma",
    module: "photo-analysis",
    scope,
    includeDocuments: true,
    includeTerms: true,
    includeCorrections: true,
    includeReferences: true,
    documentLimit: 5,
    termLimit: 8,
    correctionLimit: 5,
    referenceLimit: 2,
  });

  const prompt = `
Tu analyses UNE PHOTO d'un brouillon d'exercice de basketball afin de préremplir MyBasket.
Le coach validera et pourra tout modifier : n'invente pas ce qui n'est pas visible ou raisonnablement déductible.

RÈGLES DE SORTIE :
- Réponds UNIQUEMENT par un objet JSON valide, sans markdown.
- Rédige au présent.
- Désigne les participants dans les textes par « le joueur 1 », « le joueur 2 », etc.
- Conserve l'intention du coach et mets le brouillon au propre sans changer le fond de l'exercice.
- Si une information est absente, utilise null, [] ou une chaîne vide selon le type.
- Catégorie autorisée : « — Choisir — », U9, U11, U13, U15, U18, U21, Senior.
- Type autorisé : Individuel, Pré-co, Collectif.
- Niveau autorisé : Débutant, Intermédiaire, Confirmé.
- Thèmes autorisés : ${ALLOWED_THEMES.join(", ")}.

SCHÉMA :
- diagram.detected=true seulement si un vrai schéma exploitable est visible.
- courtType=half sauf si le terrain complet est clairement représenté.
- Coordonnées x/y normalisées. x est entre 0 et 1 de gauche à droite.
- Pour un demi-terrain, y DOIT être entre 0 et 0.5 (repère canonique Plaquette : panier vers y≈0.10, ligne médiane vers y=0.50).
- Pour un terrain complet, y est entre 0 et 1.
- Chaque joueur possède une key stable (p1, p2...), un label visible ou déduit, team=att/def, x, y, hasBall.
- Une passe va d'un joueur à un joueur quand les deux sont identifiables.
- Pour dribble/cut/screen, indique fromPlayer et la destination to.
- Pour shoot, indique fromPlayer et une destination approximative vers le panier.
- N'invente pas une trajectoire invisible : ajoute plutôt un warning.

JSON ATTENDU :
{
  "title":"",
  "organisation":"",
  "deroulement":[""],
  "consignes":[""],
  "variantes":[""],
  "plots":null,
  "ballons":null,
  "paniers":null,
  "joueurs":null,
  "categorie":"— Choisir —",
  "type":"Collectif",
  "niveau":"Intermédiaire",
  "temps":null,
  "themes":[],
  "diagram":{
    "detected":false,
    "courtType":"half",
    "players":[{"key":"p1","label":"1","team":"att","x":0.5,"y":0.3,"hasBall":false}],
    "objects":[{"kind":"cone","x":0.4,"y":0.25}],
    "actions":[{"action":"pass","fromPlayer":"p1","toPlayer":"p2","to":{"x":0.7,"y":0.25},"order":1}],
    "notes":""
  },
  "confidence":{"text":0.0,"diagram":0.0},
  "warnings":[]
}

Note facultative du coach : ${note || "Aucune"}
`;

  const started = Date.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let failure: string | null = null;

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
    const parsed = extractJson(response.output_text || "");
    const normalized = normalize(parsed);

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
        documentType: "exercise",
        imageCount: 1,
        diagramDetected: normalized.diagram.detected,
        textConfidence: normalized.confidence.text,
        diagramConfidence: normalized.confidence.diagram,
      },
    });

    return Response.json({ exercise: normalized, citations: context.citations, warnings: normalized.warnings });
  } catch (error) {
    failure = error instanceof Error ? error.message : "Erreur d'analyse.";
    console.error("[AI][photo-analysis]", error);
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
      error: failure,
      metadata: { inputType: "image", documentType: "exercise", imageCount: 1 },
    });
    return apiError("La photo n'a pas pu être analysée. Réessaie avec une photo plus nette.", 500);
  }
}
