export const PLAYER_BASKET_CRITERIA = [
  "Tir",
  "Finition",
  "Création",
  "Dribble",
  "Passe",
  "Lecture du jeu",
  "Jeu sans ballon",
  "Défense porteur",
  "Défense non-porteur",
  "Rebond",
  "Moteur / Athléticité",
] as const;

export const PLAYER_CHARACTER_CRITERIA = [
  "Communication",
  "Leadership",
  "Concentration",
  "Compétitivité",
  "Réaction à l'erreur",
  "Confiance",
  "Autonomie",
  "Réceptivité au coaching",
  "Gestion émotionnelle",
  "Engagement",
] as const;

export const SESSION_QUESTIONS = [
  { key: "objectives_rating", label: "Les objectifs prévus ont-ils été atteints ?" },
  { key: "clarity_rating", label: "La qualité et la clarté de mes interventions étaient-elles satisfaisantes ?" },
  { key: "adaptation_rating", label: "Ai-je correctement adapté la séance aux réponses des joueurs ?" },
  { key: "rhythm_rating", label: "Le rythme et le temps réel de pratique étaient-ils satisfaisants ?" },
  { key: "relevance_rating", label: "Cette séance répondait-elle aux besoins actuels de l'équipe ?" },
] as const;

export function average(values: number[]) {
  const valid = values.filter((v) => Number.isFinite(v));
  return valid.length ? valid.reduce((a,b)=>a+b,0) / valid.length : 0;
}

export function buildSessionAnalysis(input: {
  questions: Record<string, number>;
  exercises: Array<{title:string; understanding_rating:number; mastery_rating:number; status:string}>;
}) {
  const q = input.questions;
  const positives: string[] = [];
  const priorities: string[] = [];
  if ((q.objectives_rating ?? 0) >= 4) positives.push("Les objectifs de séance sont globalement atteints.");
  if ((q.clarity_rating ?? 0) >= 4) positives.push("Les consignes et interventions ont été claires.");
  if ((q.rhythm_rating ?? 0) >= 4) positives.push("Le rythme de travail a été satisfaisant.");
  if ((q.objectives_rating ?? 5) <= 2) priorities.push("Recentrer la prochaine séance sur un objectif principal plus mesurable.");
  if ((q.clarity_rating ?? 5) <= 2) priorities.push("Réduire les temps d'explication et simplifier les consignes.");
  if ((q.adaptation_rating ?? 5) <= 2) priorities.push("Prévoir davantage de variantes pour adapter les situations aux réponses des joueurs.");
  if ((q.rhythm_rating ?? 5) <= 2) priorities.push("Augmenter le temps réel de pratique et limiter les temps morts.");
  if ((q.relevance_rating ?? 5) <= 2) priorities.push("Repartir des besoins prioritaires de l'équipe pour construire la prochaine séance.");
  const weak = input.exercises.filter((e) => e.mastery_rating <= 2 || e.status === 'not_mastered');
  const medium = input.exercises.filter((e) => e.mastery_rating === 3 || e.status === 'in_progress');
  const mastered = input.exercises.filter((e) => e.mastery_rating >= 4 || e.status === 'mastered');
  if (mastered.length) positives.push(`${mastered.length} exercice${mastered.length>1?'s':''} apparaît${mastered.length>1?'ssent':''} maîtrisé${mastered.length>1?'s':''}.`);
  weak.slice(0,3).forEach((e)=>priorities.push(`Retravailler « ${e.title} » : maîtrise ${e.mastery_rating}/5.`));
  if (!weak.length && medium.length) priorities.push(`Faire évoluer ${medium.length} exercice${medium.length>1?'s':''} encore en cours d'acquisition avec une variante ou une contrainte.`);
  const summary = positives.length ? positives.join(' ') : "Séance à consolider : les évaluations ne font pas encore ressortir de point fort net.";
  const advice = priorities.length ? priorities.join(' ') : "Conserver la continuité de travail et augmenter progressivement la difficulté sur les exercices maîtrisés.";
  return { summary, advice };
}
