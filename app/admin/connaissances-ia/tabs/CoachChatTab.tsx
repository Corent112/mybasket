"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AiCitation, AiConversation, AiMessage } from "@/lib/ai/knowledge/types";
import { API, api } from "../api";
import styles from "../page.module.css";
import { ConfirmDialog, type ConfirmState, Notice, formatDateTime } from "../ui";

type Props = {
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  openAiConfigured: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: AiCitation[];
  pending?: boolean;
};

const SUGGESTIONS = [
  "Qu'est-ce qu'un Short Roll ?",
  "Comment dois-je rédiger mes exercices ?",
  "Cherche dans mes documents ce qui concerne la défense du Pick and Roll.",
  "Propose une progression pour travailler le jeu à deux.",
];

export default function CoachChatTab({ notify, openAiConfigured }: Props) {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [degradedNote, setDegradedNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Compteur local pour les identifiants optimistes : évite Date.now(), qui
  // rendrait le rendu non déterministe.
  const localIdRef = useRef(0);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get<{ conversations: AiConversation[] }>(API.conversations);
      setConversations(data.conversations);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Chargement impossible.", "error");
    }
  }, [notify]);

  useEffect(() => {
    // Chargement initial depuis le serveur (système externe).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const openConversation = async (id: string) => {
    setLoadingHistory(true);
    setConversationId(id);
    setDegradedNote(null);
    try {
      const data = await api.get<{ messages: AiMessage[] }>(`${API.conversations}/${id}`);
      setMessages(
        data.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            citations: Array.isArray(m.citations) ? m.citations : [],
          }))
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Conversation illisible.", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  const newConversation = () => {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setDegradedNote(null);
    setInput("");
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || streaming) return;

    if (!openAiConfigured) {
      notify("OPENAI_API_KEY absente : Coach IA est désactivé.", "error");
      return;
    }

    setInput("");
    setDegradedNote(null);
    setStreaming(true);

    const localId = ++localIdRef.current;
    const userMessage: ChatMessage = {
      id: `local-user-${localId}`,
      role: "user",
      content: message,
      citations: [],
    };
    const assistantId = `local-assistant-${localId}`;

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "", citations: [], pending: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(API.chat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId, module: "coach-chat" }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let errorMessage = "Coach IA est indisponible.";
        try {
          const payload = await response.json();
          if (typeof payload.error === "string") errorMessage = payload.error;
        } catch {
          // corps non JSON
        }
        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7).trim();
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (event === "context") {
            if (typeof payload.conversationId === "string") {
              setConversationId(payload.conversationId);
            }
            const citations = Array.isArray(payload.citations)
              ? (payload.citations as AiCitation[])
              : [];
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, citations } : m))
            );
            if (payload.degraded && Array.isArray(payload.notes) && payload.notes.length) {
              setDegradedNote(String(payload.notes[0]));
            }
          } else if (event === "delta") {
            const chunk = String(payload.text || "");
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + chunk, pending: true } : m
              )
            );
          } else if (event === "done") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m))
            );
            await loadConversations();
          } else if (event === "error") {
            throw new Error(String(payload.message || "Erreur pendant la génération."));
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m))
      );
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;

      const errorMessage =
        error instanceof Error ? error.message : "Coach IA est indisponible.";
      notify(errorMessage, "error");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, pending: false, content: m.content || `⚠️ ${errorMessage}` }
            : m
        )
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const askDelete = (conversation: AiConversation) => {
    setConfirm({
      title: "Supprimer cette conversation ?",
      message: `« ${conversation.title} » et tous ses messages seront supprimés. Cette action est irréversible.`,
      onConfirm: async () => {
        try {
          await api.delete(`${API.conversations}/${conversation.id}`);
          if (conversationId === conversation.id) newConversation();
          await loadConversations();
          notify("Conversation supprimée.", "success");
        } catch (error) {
          notify(error instanceof Error ? error.message : "Suppression impossible.", "error");
        }
      },
    });
  };

  return (
    <div>
      {!openAiConfigured ? (
        <Notice tone="error">
          <span>⚠️</span>
          <span>
            <strong>Coach IA est désactivé.</strong> La variable{" "}
            <code>OPENAI_API_KEY</code> n’est pas définie côté serveur.
          </span>
        </Notice>
      ) : null}

      {degradedNote ? (
        <Notice tone="warn">
          <span>ℹ️</span>
          <span>{degradedNote}</span>
        </Notice>
      ) : null}

      <div className={styles.chatLayout}>
        <aside className={styles.chatSidebar}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={newConversation}
          >
            + Nouvelle conversation
          </button>

          <div className={styles.chatList}>
            {conversations.length === 0 ? (
              <p style={{ margin: 0, padding: "12px 4px", color: "#7f7478", fontSize: 12 }}>
                Aucune conversation.
              </p>
            ) : (
              conversations.map((conversation) => (
                <div key={conversation.id} style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    className={`${styles.chatItem} ${
                      conversationId === conversation.id ? styles.chatItemActive : ""
                    }`}
                    onClick={() => openConversation(conversation.id)}
                    title={`${conversation.title} — ${formatDateTime(conversation.last_message_at)}`}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSm}`}
                    onClick={() => askDelete(conversation)}
                    aria-label="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className={styles.chatMain}>
          <div className={styles.chatMessages} ref={scrollRef}>
            {loadingHistory ? (
              <div className={styles.loading}>Chargement de la conversation…</div>
            ) : messages.length === 0 ? (
              <div className={styles.empty}>
                <strong>Coach IA MyBasket</strong>
                Pose une question : l’IA répondra en s’appuyant sur ton lexique, tes règles
                et tes documents indexés, avec la provenance de chaque connaissance utilisée.
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`${styles.msg} ${message.role === "user" ? styles.msgUser : ""}`}
                >
                  <div className={styles.msgAvatar}>
                    {message.role === "user" ? "👤" : "🧠"}
                  </div>
                  <div className={styles.msgBubble}>
                    {message.content}
                    {message.pending ? <span className={styles.cursor} /> : null}

                    {message.role === "assistant" &&
                    !message.pending &&
                    message.citations.length > 0 ? (
                      <div className={styles.citations}>
                        {message.citations.slice(0, 8).map((citation, i) => (
                          <span
                            key={`${citation.kind}-${citation.id}-${i}`}
                            className={styles.citation}
                            title={citation.detail || undefined}
                          >
                            {citation.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          {messages.length === 0 ? (
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={styles.chip}
                  onClick={() => send(suggestion)}
                  disabled={streaming || !openAiConfigured}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.chatComposer}>
            <textarea
              className={styles.chatInput}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Pose ta question à Coach IA… (Entrée pour envoyer, Maj+Entrée pour un retour à la ligne)"
              rows={2}
              disabled={streaming || !openAiConfigured}
            />
            {streaming ? (
              <button
                type="button"
                className={styles.btn}
                onClick={() => abortRef.current?.abort()}
              >
                Stopper
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => send(input)}
                disabled={!input.trim() || !openAiConfigured}
              >
                Envoyer
              </button>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
