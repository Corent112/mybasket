import { AI_VISION_MODEL } from "@/lib/ai/config";
import { getOpenAI } from "@/lib/ai/openai";
import { resolveActor } from "@/lib/ai/knowledge";
import { apiError, enforceRateLimit, readJson, str } from "@/lib/ai/http";
import type { AiDiagramPlayer, AiExerciseImport } from "@/lib/import/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = { image?: string };

function extractJson(text: string): any {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Réponse Vision 2 non structurée.");
  return JSON.parse(clean.slice(start, end + 1));
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function normalizePlayer(raw: any, index: number, courtType: "half" | "full"): AiDiagramPlayer | null {
  const team = raw?.team === "def" ? "def" : raw?.team === "att" ? "att" : null;
  if (!team) return null;
  const label = String(raw?.label ?? "").trim().replace(/[^0-9A-Za-z]/g, "").slice(0, 3);
  if (!label) return null;
  const x = clamp(raw?.x, 0.01, 0.99, 0.5);
  // Le modèle renvoie y dans le terrain photographié : 0=ligne de fond/panier, 1=ligne médiane.
  // Plaquette utilise 0..0.5 pour un demi-terrain.
  const rawY = clamp(raw?.y, 0.01, 0.99, 0.5);
  const y = courtType === "half" ? rawY * 0.5 : rawY;
  return {
    key: `${team === "def" ? "d" : "a"}${label}-${index + 1}`,
    label,
    team,
    x,
    y,
    hasBall: false,
    labelConfident: raw?.labelConfidence !== false,
    type: team === "def" ? "defender" : "attacker",
    confidence: clamp(raw?.confidence, 0, 1, 0.75),
    typeConfidence: clamp(raw?.teamConfidence, 0, 1, 0.8),
    source: "vision2-players",
  };
}

export async function POST(request: Request) {
  const auth = await resolveActor();
  if (!auth.ok) return apiError(auth.error, auth.status);
  const limited = enforceRateLimit(request, "vision2-players", auth.actor.userId, 15, 60_000);
  if (limited) return limited;

  const body = (await readJson<Body>(request)) || {};
  const image = str(body.image, 4_500_000);
  if (!image || !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image)) {
    return apiError("Image invalide. Utilise une photo JPG, PNG ou WebP.");
  }

  const client = getOpenAI();
  if (!client) return apiError("MyBasket AI n'est pas configuré côté serveur.", 503);

  const prompt = `
Tu es le module Vision 2 de MyBasket. Ta SEULE mission est de relever les JOUEURS visibles sur un schéma de basketball.

IMPORTANT : ne cherche PAS à comprendre l'exercice. Ignore totalement flèches, trajectoires, ballon, cônes/plots, texte, paniers et autres objets.

1. Repère d'abord les limites et lignes structurelles du terrain pour établir le repère spatial.
2. Détecte ensuite uniquement les symboles qui représentent réellement des joueurs.
3. Les joueurs NOIRS / GRIS FONCÉ / BLEU FONCÉ sont des attaquants : team="att".
4. Les joueurs ROUGES / ROSES sont des défenseurs : team="def".
5. Lis le NUMÉRO écrit dans ou immédiatement associé à chaque symbole joueur. Conserve exactement ce numéro. Ne renumérote jamais selon l'ordre de détection.
6. Le centre x/y doit être le CENTRE DU SYMBOLE JOUEUR, pas le centre de son numéro, d'une flèche ou d'un cône.
7. Ne transforme JAMAIS un cône triangulaire, un ballon, une flèche, un point isolé ou un marquage du terrain en joueur.
8. Un défenseur rouge peut être dessiné comme deux parenthèses/arcs autour d'un numéro : c'est UN seul joueur, centré entre les arcs.
9. Si un numéro est illisible, n'invente pas : omets ce candidat plutôt que créer un faux joueur.
10. Retourne les positions relativement à l'AIRE DE JEU visible : x=0 bord gauche, x=1 bord droit ; y=0 ligne de fond côté panier, y=1 ligne médiane pour un demi-terrain. Si le terrain est complet, y=0 en haut et y=1 en bas.
11. Si la photo est en perspective, utilise les lignes du terrain pour corriger mentalement la perspective avant d'estimer x/y.
12. Deux symboles proches de couleurs différentes sont deux joueurs distincts. Ne fusionne pas attaquant et défenseur.

Réponds UNIQUEMENT avec ce JSON, sans markdown :
{
  "courtType":"half",
  "players":[
    {"label":"1","team":"att","x":0.50,"y":0.72,"confidence":0.95,"teamConfidence":0.98,"labelConfidence":true}
  ],
  "confidence":0.0,
  "warnings":[]
}

courtType vaut "half" ou "full". Ne retourne RIEN d'autre que les joueurs.
`;

  try {
    const response = await client.responses.create({
      model: AI_VISION_MODEL,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: image, detail: "high" },
        ],
      }],
    });
    const raw = extractJson(response.output_text || "");
    const courtType: "half" | "full" = raw?.courtType === "full" ? "full" : "half";
    const players = (Array.isArray(raw?.players) ? raw.players : [])
      .slice(0, 20)
      .map((player: any, index: number) => normalizePlayer(player, index, courtType))
      .filter(Boolean) as AiDiagramPlayer[];

    const exercise: AiExerciseImport = {
      title: "",
      organisation: "",
      deroulement: [],
      consignes: [],
      variantes: [],
      plots: null,
      ballons: null,
      paniers: null,
      joueurs: players.length || null,
      categorie: "— Choisir —",
      type: "Collectif",
      niveau: "Intermédiaire",
      temps: null,
      themes: [],
      diagram: {
        detected: players.length > 0,
        courtType,
        players,
        objects: [],
        actions: [],
        notes: "Vision 2 · joueurs uniquement",
        confidence: clamp(raw?.confidence, 0, 1, players.length ? 0.75 : 0),
      },
      source: "ai",
      importConfidence: clamp(raw?.confidence, 0, 1, players.length ? 0.75 : 0),
      confidence: { text: 0, diagram: clamp(raw?.confidence, 0, 1, players.length ? 0.75 : 0) },
      warnings: Array.isArray(raw?.warnings) ? raw.warnings.map((v: unknown) => String(v)).slice(0, 5) : [],
    };

    return Response.json({ exercise });
  } catch (error) {
    console.error("[Vision2][players]", error);
    return apiError("Vision 2 n'a pas pu relever les joueurs sur cette image.", 500);
  }
}
