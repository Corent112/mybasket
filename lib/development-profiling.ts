export type RatingMap = Record<string, number>;

export const BASKET_PROFILE_CRITERIA = [
  { key: "shooting", label: "Tir" },
  { key: "finishing", label: "Finition" },
  { key: "creation", label: "Création" },
  { key: "dribble", label: "Dribble" },
  { key: "passing", label: "Passe" },
  { key: "game_reading", label: "Lecture du jeu" },
  { key: "off_ball", label: "Jeu sans ballon" },
  { key: "on_ball_defense", label: "Défense porteur" },
  { key: "off_ball_defense", label: "Défense non-porteur" },
  { key: "rebounding", label: "Rebond" },
  { key: "motor_athleticism", label: "Moteur / Athléticité" },
] as const;

export const CHARACTER_PROFILE_CRITERIA = [
  { key: "communication", label: "Communication" },
  { key: "leadership", label: "Leadership" },
  { key: "concentration", label: "Concentration" },
  { key: "competitiveness", label: "Compétitivité" },
  { key: "reaction_to_error", label: "Réaction à l’erreur" },
  { key: "confidence", label: "Confiance" },
  { key: "autonomy", label: "Autonomie" },
  { key: "coachability", label: "Réceptivité au coaching" },
  { key: "emotional_management", label: "Gestion émotionnelle" },
  { key: "engagement", label: "Engagement" },
] as const;

export const SESSION_REVIEW_QUESTIONS = [
  { key: "objectives_rating", label: "Les objectifs prévus ont-ils été atteints ?" },
  { key: "clarity_rating", label: "La qualité et la clarté de mes interventions étaient-elles satisfaisantes ?" },
  { key: "adaptation_rating", label: "Ai-je correctement adapté la séance aux réponses des joueurs ?" },
  { key: "rhythm_rating", label: "Le rythme et le temps réel de pratique étaient-ils satisfaisants ?" },
  { key: "relevance_rating", label: "Cette séance répondait-elle réellement aux besoins actuels de l’équipe ?" },
] as const;

export function clampRating(value: unknown) {
  const n = Math.round(Number(value) || 0);
  return Math.max(1, Math.min(5, n || 1));
}

export function masteryStatus(value: number) {
  if (value >= 4) return "mastered" as const;
  if (value >= 3) return "progress" as const;
  return "not_mastered" as const;
}

export function masteryLabel(value: number) {
  const status = masteryStatus(value);
  if (status === "mastered") return "Maîtrisé";
  if (status === "progress") return "En cours";
  return "Non maîtrisé";
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function ratingLabel(value: number) {
  if (value >= 4.5) return "Très fort";
  if (value >= 3.7) return "Fort";
  if (value >= 2.8) return "Intermédiaire";
  if (value >= 2) return "À développer";
  return "Prioritaire";
}

export type ExerciseReviewInput = {
  exercise_id: string;
  exercise_title: string;
  mastery_rating: number;
  comment?: string;
};

export type SessionReviewInput = {
  objectives_rating: number;
  clarity_rating: number;
  adaptation_rating: number;
  rhythm_rating: number;
  relevance_rating: number;
  takeaway?: string;
  next_time_change?: string;
};

export function buildSessionAnalysis(
  review: SessionReviewInput,
  exercises: ExerciseReviewInput[],
) {
  const questionEntries = SESSION_REVIEW_QUESTIONS.map((q) => ({
    key: q.key,
    label: q.label,
    value: clampRating(review[q.key]),
  }));

  const coachAverage = average(questionEntries.map((item) => item.value));
  const strongest = [...questionEntries].sort((a, b) => b.value - a.value)[0];
  const weakest = [...questionEntries].sort((a, b) => a.value - b.value)[0];
  const exerciseAverage = average(exercises.map((item) => clampRating(item.mastery_rating)));
  const mastered = exercises.filter((item) => clampRating(item.mastery_rating) >= 4);
  const toWork = exercises
    .filter((item) => clampRating(item.mastery_rating) <= 3)
    .sort((a, b) => a.mastery_rating - b.mastery_rating);

  const positives: string[] = [];
  const priorities: string[] = [];
  const advice: string[] = [];

  if (strongest && strongest.value >= 4) positives.push(`Point fort de la séance : ${strongest.label.replace(" ?", "")} (${strongest.value}/5).`);
  if (mastered.length) positives.push(`${mastered.length} exercice${mastered.length > 1 ? "s" : ""} considéré${mastered.length > 1 ? "s" : ""} comme maîtrisé${mastered.length > 1 ? "s" : ""}.`);
  if (weakest && weakest.value <= 3) priorities.push(`À surveiller : ${weakest.label.replace(" ?", "")} (${weakest.value}/5).`);
  toWork.slice(0, 3).forEach((item) => priorities.push(`${item.exercise_title} : ${masteryLabel(item.mastery_rating)} (${item.mastery_rating}/5).`));

  if (toWork.length) {
    advice.push(`Reprendre ${toWork[0].exercise_title} lors de la prochaine séance, avec une contrainte ou une progression plus simple avant de complexifier.`);
  }
  if (weakest?.key === "clarity_rating") advice.push("Prévoir des consignes plus courtes et un critère de réussite visible avant chaque exercice.");
  if (weakest?.key === "rhythm_rating") advice.push("Réduire les temps morts et préparer les transitions entre exercices avant le début de séance.");
  if (weakest?.key === "adaptation_rating") advice.push("Prévoir une variante plus simple et une variante plus exigeante pour adapter rapidement la tâche.");
  if (weakest?.key === "relevance_rating") advice.push("Repartir des priorités du profil équipe et des deux derniers bilans avant de construire la prochaine séance.");
  if (!advice.length) advice.push("Conserver la structure générale et faire progresser la difficulté sur les exercices maîtrisés.");

  return {
    coachAverage,
    exerciseAverage,
    masteredCount: mastered.length,
    toWorkCount: toWork.length,
    positives,
    priorities,
    advice,
  };
}
