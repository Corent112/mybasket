/**
 * Point d'extension unique pour SMS / WhatsApp.
 * Aucun fournisseur n'est obligatoire : si le canal n'est pas configuré,
 * le moteur RPE continue normalement avec MyBasket + e-mail.
 */
export async function sendRpeExternalMessage(input: {
  phone?: string | null;
  message: string;
}) {
  const mode = String(process.env.RPE_EXTERNAL_MESSAGING_MODE || "disabled").toLowerCase();

  if (mode === "disabled" || !input.phone) {
    return { sent: false as const, reason: "disabled" as const };
  }

  // Architecture prête pour un fournisseur futur. On ne déclenche aucun appel
  // réseau tant qu'un mode explicitement pris en charge n'est pas configuré.
  console.info("Canal RPE externe préparé mais fournisseur non branché", {
    mode,
    phone: input.phone,
  });

  return { sent: false as const, reason: "provider_not_configured" as const };
}
