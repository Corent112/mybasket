"use client";
import Link from "next/link";
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
  resources?: string[];
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

type Conversation = { id: string; title: string; module: string };

export default function KnowledgeChat({ workspace = false }: { workspace?: boolean } = {}) {
  const path = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [history, setHistory] = useState<Conversation[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [opening, setOpening] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
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
      if (live && owner.current === undefined) {
        owner.current = data.user?.id || "";
        setAccountId(owner.current);
        setEnabled(!!data.user);
        setAuthReady(true);
      }
    });
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (live) {
          const next = session?.user.id || "";
          setEnabled(!!session);
          setAccountId(next);
          setAuthReady(true);
          if (owner.current !== undefined && owner.current !== next) {
            setMessages([]);
            setHistory([]);
            setFiles([]);
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
  useEffect(() => {
    if (!workspace || !accountId) return;
    const controller = new AbortController();
    setLoadingHistory(true);
    setHistoryError("");
    fetch("/api/ai/conversations?module=coach-chat", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const { conversations } = await response.json();
        if (!controller.signal.aborted) setHistory(conversations ?? []);
      })
      .catch(() => { if (!controller.signal.aborted) setHistoryError("Historique momentanément indisponible."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingHistory(false); });
    return () => controller.abort();
  }, [workspace, accountId]);

  function newConversation() {
    conversation.current = null;
    setMessages([]);
    setInput("");
    setFiles([]);
    setError("");
    field.current?.focus();
  }

  async function openConversation(id: string) {
    if (busy || opening) return;
    setOpening(true);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const { messages: entries } = await response.json();
      if (controller.signal.aborted) return;
      conversation.current = id;
      setInput("");
      setFiles([]);
      setMessages((entries ?? []).flatMap((entry: { role: string; content: string; citations?: AiCitation[]; attachments?: { name: string }[] }) =>
        (entry.role === "user" || entry.role === "assistant") && entry.content
          ? [{ role: entry.role, text: entry.content, citations: entry.citations, resources: entry.attachments?.map(file => file.name) }] : []
      ));
    } catch {
      if (!controller.signal.aborted) setError("Impossible d’ouvrir cette conversation.");
    } finally {
      setOpening(false);
      abort.current = null;
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || opening) return;
    const selectedFiles = files;
    setBusy(true);
    setError("");
    setInput("");
    setMessages((old) => [
      ...old,
      { role: "user", text: question, resources: selectedFiles.map(file => file.name) },
      { role: "assistant", text: "" },
    ]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const chat = JSON.stringify({ message: question, conversationId: conversation.current, module: "coach-chat", workspace });
      const payload = selectedFiles.length ? new FormData() : null;
      if (payload) {
        payload.set("chat", chat);
        for (const file of selectedFiles) payload.append("resources", file);
      }
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: payload ? undefined : { "Content-Type": "application/json" },
        body: payload ?? chat,
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
        if (done || controller.signal.aborted) break;
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
          if (event === "done") {
            complete = true;
            const id = conversation.current;
            if (workspace && id) setHistory(old => {
              const existing = old.find(item => item.id === id);
              return [existing ?? { id, title: question.slice(0, 80), module: "coach-chat" }, ...old.filter(item => item.id !== id)];
            });
          }
          if (event === "error")
            throw new Error(data.message || "Réponse interrompue.");
        }
      }
      if (complete) setFiles([]);
      if (!complete && !controller.signal.aborted) throw new Error("Réponse interrompue. Tu peux réessayer.");
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
  if (workspace && !enabled) return (
    <section className={styles.signedOut}>
      <h1>Coach IA MyBasket</h1>
      {authReady ? <Link href="/connexion?next=/assistant">Se connecter pour discuter</Link> : <p role="status">Chargement…</p>}
    </section>
  );
  if (
    (!workspace && path.startsWith("/assistant")) ||
    !enabled ||
    path.startsWith("/admin") ||
    path.startsWith("/dessin") ||
    path.startsWith("/plaquette") ||
    path.includes("prise-stats")
  )
    return null;
  const last = messages.at(-1);
  const follow =
    !workspace && last?.role === "assistant" &&
    last.text.trim().endsWith("?") &&
    !busy &&
    !error;
  return (
    <aside className={workspace ? styles.workspace : styles.root} aria-label="Assistant MyBasket">
      {workspace && <nav className={styles.history} aria-label="Conversations">
        <button type="button" onClick={newConversation} disabled={busy || opening}>＋ Nouvelle conversation</button>
        <details open>
          <summary>Historique</summary>
          {loadingHistory && <p role="status">Chargement…</p>}
          {historyError && <p role="status">{historyError}</p>}
          {history.map(item => <button type="button" key={item.id} disabled={busy || opening}
            aria-current={conversation.current === item.id ? "true" : undefined}
            onClick={() => void openConversation(item.id)}>{item.title}</button>)}
        </details>
      </nav>}
      {(open || workspace) && (
        <section
          role={workspace ? undefined : "dialog"}
          aria-label="Assistant MyBasket"
          className={workspace ? styles.workspacePanel : styles.panel}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          <header>
            <div>
              <strong>Assistant MyBasket</strong>
              <small>Les connaissances basket à portée de main</small>
            </div>
            {!workspace && <div className={styles.launchActions}>
              <Link href="/assistant">Plein écran</Link>
              <button aria-label="Fermer l’assistant" onClick={close}>×</button>
            </div>}
          </header>
          <div className={styles.messages} role="log" aria-live="polite">
            {workspace && !messages.length && !opening && <div className={styles.welcome}>
              <h1>Qu’est-ce qu’on travaille aujourd’hui ?</h1>
              <div className={styles.starters}>
                {["Prépare une séance U18 pour mieux défendre le pick and roll.", "Propose trois solutions contre une zone 2–3.", "Explique le short roll et trouve une vidéo pour l’illustrer."].map(question =>
                  <button type="button" key={question} onClick={() => void send(question)}>{question}</button>
                )}
              </div>
            </div>}
            {opening && <p role="status">Ouverture de la conversation…</p>}
            {messages.map((m, i) => (
              <article
                key={i}
                className={m.role === "user" ? styles.user : styles.assistant}
              >
                {!!m.resources?.length && <p className={styles.resourceNames}>{m.resources.join(" · ")}</p>}
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
          {workspace && !!files.length && <div className={styles.fileList}>
            {files.map((file, index) => <button type="button" key={`${file.name}-${index}`} disabled={busy}
              aria-label={`Retirer ${file.name}`} onClick={() => setFiles(old => old.filter((_, i) => i !== index))}>{file.name} ×</button>)}
          </div>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            {workspace && <>
              <input ref={picker} hidden type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md,.csv,.jpg,.jpeg,.png,.webp"
                onChange={event => {
                  const next = [...files, ...Array.from(event.target.files ?? [])];
                  event.target.value = "";
                  if (next.length > 3 || next.reduce((sum, file) => sum + file.size, 0) > 4_000_000) {
                    setError("Ajoute jusqu’à 3 fichiers, pour un total de 4 Mo.");
                    return;
                  }
                  setError("");
                  setFiles(next);
                }} />
              <button type="button" title="Joindre jusqu’à 3 ressources · 4 Mo au total" aria-label="Joindre une ressource"
                disabled={opening || busy} onClick={() => picker.current?.click()}>＋</button>
            </>}
            <input
              ref={field}
              disabled={opening}
              aria-label="Ta question"
              placeholder="Pose ta question…"
              value={input}
              maxLength={8000}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              disabled={busy || opening || !input.trim()}
              aria-label="Envoyer la question"
            >
              ↑
            </button>
          </form>
        </section>
      )}
      {!workspace && <button
        ref={launch}
        className={styles.launch}
        aria-label={open ? "Fermer l’assistant" : "Ouvrir l’assistant MyBasket"}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? "×" : "✦"}
      </button>}
    </aside>
  );
}
