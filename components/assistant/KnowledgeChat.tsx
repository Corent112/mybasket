"use client";
import KnowledgeDiagram from "@/components/assistant/KnowledgeDiagram";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

import { Fragment, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AiCitation } from "@/lib/ai/knowledge/types";
import styles from "./KnowledgeChat.module.css";

type Message = {
  role: "user" | "assistant";
  text: string;
  citations?: AiCitation[];
};
function AnswerWithSources({ text, citations }: { text: string; citations?: AiCitation[] }) {
  const sources = (citations ?? []).flatMap(citation => {
    if (citation.kind !== "web" || !citation.url || !/^https?:\/\//i.test(citation.url)) return [];
    return [{ ...citation, url: citation.url }];
  }).sort((a, b) => (a.endIndex ?? text.length) - (b.endIndex ?? text.length));
  if (!sources.length || !text) return <p>{text || "Je consulte les ressources…"}</p>;
  const uniqueSources = [...new Map(sources.map(source => [source.url, source])).values()];
  const numbers = new Map(uniqueSources.map((source, index) => [source.url, index + 1]));
  let offset = 0;
  return <>
    <p>{sources.map((source, index) => {
      const end = Math.max(offset, Math.min(source.endIndex ?? text.length, text.length));
      const part = text.slice(offset, end);
      offset = end;
      return <Fragment key={`${source.id}-${index}`}>{part}<a className={styles.citation}
        href={source.url} target="_blank" rel="noopener noreferrer" title={source.label}
        aria-label={`Source ${numbers.get(source.url)} · ${source.label}`}>[{numbers.get(source.url)}]</a></Fragment>;
    })}{text.slice(offset)}</p>
    <div className={styles.sources}>
      <strong>Sources web</strong>
      <ol>{uniqueSources.map(source => <li key={source.url}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
      </li>)}</ol>
    </div>
  </>;
}

export default function KnowledgeChat() {
  const path = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const owner = useRef<string | undefined>(undefined);
  const conversation = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const launch = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const db = createClient();
    let live = true;
    db.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      if (live) setEnabled(!!data.user);
    });
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (live) {
          const next = session?.user.id || "";
          setEnabled(!!session);
          if (owner.current !== undefined && owner.current !== next) {
            setMessages([]);
            setOpen(false);
            conversation.current = null;
            abort.current?.abort();
          }
          owner.current = next;
        }
      },
    );
    return () => {
      live = false;
      subscription.unsubscribe();
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);
  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setError("");
    setInput("");
    setMessages((old) => [
      ...old,
      { role: "user", text: question },
      { role: "assistant", text: "" },
    ]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          conversationId: conversation.current,
          module: "coach-chat",
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          response.status === 503
            ? data.code === "AI_SETUP_REQUIRED"
              ? "L’assistant doit être initialisé par l’administrateur avant de pouvoir répondre."
              : "L’assistant est temporairement indisponible."
            : data.error || "La réponse n’a pas pu être chargée.",
        );
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let complete = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const lines = frame.split("\n");
          const event = lines
            .find((line) => line.startsWith("event: "))
            ?.slice(7);
          const raw = lines.find((line) => line.startsWith("data: "))?.slice(6);
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (event === "context") {
            conversation.current = data.conversationId;
            setMessages((old) =>
              old.map((m, i) =>
                i === old.length - 1 ? { ...m, citations: data.citations } : m,
              ),
            );
          }
          if (event === "delta")
            setMessages((old) =>
              old.map((m, i) =>
                i === old.length - 1
                  ? { ...m, text: m.text + String(data.text || "") }
                  : m,
              ),
            );
          if (event === "done") complete = true;
          if (event === "error")
            throw new Error(data.message || "Réponse interrompue.");
        }
      }
      if (!complete) throw new Error("Réponse interrompue. Tu peux réessayer.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setInput(question);
        setMessages((old) =>
          old.filter(
            (m, i) =>
              i !== old.length - 1 || m.role !== "assistant" || !!m.text,
          ),
        );
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  function close() {
    setOpen(false);
    launch.current?.focus();
  }
  if (
    !enabled ||
    path.startsWith("/admin") ||
    path.startsWith("/dessin") ||
    path.startsWith("/plaquette") ||
    path.includes("prise-stats")
  )
    return null;
  const last = messages.at(-1);
  const follow =
    last?.role === "assistant" &&
    last.text.trim().endsWith("?") &&
    !busy &&
    !error;
  return (
    <aside className={styles.root} aria-label="Assistant MyBasket">
      {open && (
        <section
          role="dialog"
          aria-label="Assistant MyBasket"
          className={styles.panel}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          <header>
            <div>
              <strong>Assistant MyBasket</strong>
              <small>Les connaissances basket à portée de main</small>
            </div>
            <button aria-label="Fermer l’assistant" onClick={close}>
              ×
            </button>
          </header>
          <div className={styles.messages} role="log" aria-live="polite">
            {messages.map((m, i) => (
              <article
                key={i}
                className={m.role === "user" ? styles.user : styles.assistant}
              >
                <AnswerWithSources text={m.text} citations={m.citations} />
                <KnowledgeDiagram citations={m.citations} />
              </article>
            ))}
            <div ref={end} />
          </div>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {follow && (
            <div className={styles.choices}>
              <button onClick={() => void send("Oui, explique-moi la suite.")}>
                Oui, explique-moi
              </button>
              <button onClick={() => void send("Non merci, restons-en là.")}>
                Non merci
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              ref={field}
              aria-label="Ta question"
              placeholder="Pose ta question…"
              value={input}
              maxLength={8000}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              disabled={busy || !input.trim()}
              aria-label="Envoyer la question"
            >
              ↑
            </button>
          </form>
        </section>
      )}
      <button
        ref={launch}
        className={styles.launch}
        aria-label={open ? "Fermer l’assistant" : "Ouvrir l’assistant MyBasket"}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? "×" : "✦"}
      </button>
    </aside>
  );
}
