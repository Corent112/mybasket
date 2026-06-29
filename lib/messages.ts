export type MessageStatut = "non lu" | "lu";

export type MessageType =
  | "annonce"
  | "rdv"
  | "reservation"
  | "direct";

export interface MbMessage {
  id: string;
  date: string;
  type: MessageType;

  sujet: string;

  annonceId?: string;
  annonceTitre?: string;

  expediteurNom: string;
  expediteurEmail: string;
  destinataireNom: string;

  message: string;

  statut: MessageStatut;

  reponses?: {
    date: string;
    texte: string;
  }[];
}

const KEY = "mybasket_messages";

function read(): MbMessage[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(KEY);

    if (!raw) return [];

    return JSON.parse(raw) as MbMessage[];
  } catch {
    return [];
  }
}

function write(list: MbMessage[]) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    console.error("Impossible d'enregistrer les messages");
  }
}

const uid = () =>
  `msg_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

export function getMessages(): MbMessage[] {
  return read()
    .map((message) => ({
      ...message,
      type: message.type ?? "annonce",
      sujet:
        message.sujet ??
        message.annonceTitre ??
        "Message",
    }))
    .sort(
      (a, b) =>
        new Date(b.date).getTime() -
        new Date(a.date).getTime()
    );
}

export function addMessage(
  input: Omit<
    MbMessage,
    "id" | "date" | "statut" | "reponses"
  >
): MbMessage {
  const message: MbMessage = {
    ...input,
    id: uid(),
    date: new Date().toISOString(),
    statut: "non lu",
    reponses: [],
  };

  const current = read();

  write([message, ...current]);

  return message;
}

export function markAsRead(
  id: string
): MbMessage[] {
  const next = read().map((message) =>
    message.id === id
      ? {
          ...message,
          statut: "lu" as const,
        }
      : message
  );

  write(next);

  return next;
}

export function addReply(
  id: string,
  texte: string
): MbMessage[] {
  const next = read().map((message) =>
    message.id === id
      ? {
          ...message,
          reponses: [
            ...(message.reponses ?? []),
            {
              date: new Date().toISOString(),
              texte,
            },
          ],
        }
      : message
  );

  write(next);

  return next;
}

export function deleteMessage(
  id: string
): MbMessage[] {
  const next = read().filter(
    (message) => message.id !== id
  );

  write(next);

  return next;
}

export function unreadCount(): number {
  return read().filter(
    (message) => message.statut === "non lu"
  ).length;
}

/* ------------------------------------------------ */
/* Helpers d'envoi                                  */
/* ------------------------------------------------ */

type BaseMessage = {
  expediteurNom: string;
  expediteurEmail: string;
  destinataireNom: string;
  message: string;
};

export function sendAnnonceMessage(
  params: BaseMessage & {
    annonceId: string;
    annonceTitre: string;
  }
) {
  return addMessage({
    ...params,
    type: "annonce",
    sujet: `Annonce : ${params.annonceTitre}`,
  });
}

export function sendReservation(
  params: BaseMessage & {
    serviceTitre: string;
  }
) {
  return addMessage({
    ...params,
    type: "reservation",
    sujet: `Réservation : ${params.serviceTitre}`,
  });
}

export function sendRdv(
  params: BaseMessage & {
    sujet?: string;
  }
) {
  return addMessage({
    ...params,
    type: "rdv",
    sujet:
      params.sujet ??
      "Demande de rendez-vous",
  });
}

export function sendDirect(
  params: BaseMessage & {
    sujet?: string;
  }
) {
  return addMessage({
    ...params,
    type: "direct",
    sujet:
      params.sujet ??
      "Message direct",
  });
}

export const TYPE_LABEL: Record<
  MessageType,
  string
> = {
  annonce: "Annonce",
  rdv: "RDV",
  reservation: "Réservation",
  direct: "Message",
};