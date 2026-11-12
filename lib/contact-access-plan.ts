export function getContactAccessType(plan: {
  name?: string | null;
  slug?: string | null;
  target?: string | null;
}): "institution" | "club" | null {
  const identity = `${plan.slug ?? ""} ${plan.name ?? ""}`;
  if (plan.target === "institution" || /\binstitution(?:nel|nelle)?\b/i.test(identity.replaceAll("_", " "))) {
    return "institution";
  }
  return plan.target === "club" ? "club" : null;
}
