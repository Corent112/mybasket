export function getCoachCommissionRate(planName?: string | null) {
  const plan = (planName || "").toLowerCase();

  if (plan === "premium") return 5;
  if (plan === "pro") return 10;
  if (plan === "basic") return 15;

  return 20;
}

export function calculateCoachCommission(priceCents: number, planName?: string | null) {
  const commissionRate = getCoachCommissionRate(planName);
  const commissionAmountCents = Math.round(priceCents * (commissionRate / 100));
  const coachAmountCents = priceCents - commissionAmountCents;

  return {
    commissionRate,
    commissionAmountCents,
    coachAmountCents,
  };
}