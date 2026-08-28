export const PLAYER_BASKET_CRITERIA = [
  "Tir","Finition","Création","Dribble","Passe","Lecture du jeu","Jeu sans ballon",
  "Défense porteur","Défense non-porteur","Rebond","Moteur / Athléticité",
] as const;

export const PLAYER_CHARACTER_CRITERIA = [
  "Communication","Leadership","Concentration","Compétitivité","Réaction à l'erreur",
  "Confiance","Autonomie","Réceptivité au coaching","Gestion émotionnelle","Engagement",
] as const;

export const SESSION_QUESTIONS = [
  { key: "objectives_rating", short: "Objectifs", label: "Ai-je atteint les objectifs que j'avais fixés pour cette séance ?" },
  { key: "rhythm_rating", short: "Rythme", label: "Ai-je réussi à maintenir le rythme et l'intensité que je souhaitais ?" },
  { key: "clarity_rating", short: "Compréhension", label: "Mes consignes et mes interventions ont-elles permis aux joueurs de comprendre ce que je recherchais ?" },
  { key: "adaptation_rating", short: "Maîtrise", label: "Les joueurs ont-ils suffisamment maîtrisé les contenus travaillés pour que je puisse avancer ?" },
  { key: "relevance_rating", short: "Ressenti", label: "Globalement, suis-je satisfait de la séance que j'ai proposée et animée ?" },
] as const;

export function average(values: number[]) {
  const valid = values.filter((v) => Number.isFinite(v));
  return valid.length ? valid.reduce((a,b)=>a+b,0) / valid.length : 0;
}

export function buildSessionAnalysis(input: {
  questions: Record<string, number>;
  exercises: Array<{title:string; mastery_rating:number; understanding_rating?:number; status?:string}>;
  remark?: string;
}) {
  const q = input.questions;
  const axes = [
    ["objectives_rating","objectifs"],
    ["rhythm_rating","rythme"],
    ["clarity_rating","compréhension"],
    ["adaptation_rating","maîtrise"],
    ["relevance_rating","ressenti"],
  ] as const;

  const strong = axes.filter(([k]) => (q[k] ?? 0) >= 4);
  const weak = axes.filter(([k]) => (q[k] ?? 5) <= 2);
  const medium = axes.filter(([k]) => (q[k] ?? 0) === 3);

  const exerciseStrong = input.exercises.filter(e => e.mastery_rating >= 4);
  const exerciseWeak = input.exercises.filter(e => e.mastery_rating <= 2);

  const summaryParts:string[] = [];
  if (strong.length) summaryParts.push(`Points forts : ${strong.map(([,n])=>n).join(", ")}.`);
  if (weak.length) summaryParts.push(`Points à retravailler : ${weak.map(([,n])=>n).join(", ")}.`);
  if (!strong.length && !weak.length && medium.length) summaryParts.push("Séance équilibrée, sans point fort ou difficulté nettement marqué.");
  if (exerciseStrong.length) summaryParts.push(`${exerciseStrong.length} exercice${exerciseStrong.length>1?"s":""} particulièrement efficace${exerciseStrong.length>1?"s":""}.`);
  if (exerciseWeak.length) summaryParts.push(`${exerciseWeak.length} exercice${exerciseWeak.length>1?"s":""} à ajuster ou à retravailler.`);

  const advice:string[] = [];
  if ((q.objectives_rating ?? 5) <= 2) advice.push("Réduire le nombre d'objectifs et définir un objectif principal mesurable.");
  if ((q.rhythm_rating ?? 5) <= 2) advice.push("Prévoir des transitions plus courtes et davantage de temps de pratique.");
  if ((q.clarity_rating ?? 5) <= 2) advice.push("Simplifier les consignes et utiliser une démonstration plus courte avant la mise en action.");
  if ((q.adaptation_rating ?? 5) <= 2) advice.push("Reprendre les contenus encore fragiles avant d'augmenter la difficulté.");
  if ((q.relevance_rating ?? 5) <= 2) advice.push("Repartir des besoins observés aujourd'hui pour choisir le contenu de la prochaine séance.");
  exerciseWeak.slice(0,3).forEach(e => advice.push(`Revoir « ${e.title} » avec une variante plus simple ou plus progressive.`));
  if (!advice.length && exerciseStrong.length) advice.push(`Conserver la continuité et faire évoluer « ${exerciseStrong[0].title} » avec une contrainte supplémentaire.`);
  if (!advice.length) advice.push("Conserver la continuité de travail et augmenter progressivement la difficulté.");

  return {
    summary: summaryParts.join(" ") || "Séance enregistrée. Les prochaines évaluations permettront de faire ressortir des tendances.",
    advice: advice.join(" "),
    strengths: strong.map(([,n])=>n),
    priorities: weak.map(([,n])=>n),
  };
}
