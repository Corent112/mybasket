"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PageProps = {
  params: Promise<{ id: string }>;
};

type PracticeSessionRow = Record<string, any>;

type Html2PdfWorker = {
  set: (options: Record<string, unknown>) => Html2PdfWorker;
  from: (source: HTMLElement | string) => Html2PdfWorker;
  outputPdf: (type: "blob") => Promise<Blob>;
  save: (filename?: string) => Promise<void>;
};

type Html2PdfFactory = () => Html2PdfWorker;

declare global {
  interface Window {
    html2pdf?: Html2PdfFactory;
  }
}

function safeFileName(value: string) {
  return String(value || "fiche-seance")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function readSessionContent(row: PracticeSessionRow | null) {
  if (!row) return null;
  const direct = row.session_content || row.content_json || row.content;

  if (direct) {
    if (typeof direct === "string") {
      try {
        return JSON.parse(direct);
      } catch {
        return null;
      }
    }
    return direct;
  }

  try {
    const parsedNotes = typeof row.notes === "string" ? JSON.parse(row.notes) : row.notes;
    return parsedNotes && typeof parsedNotes === "object" ? parsedNotes : null;
  } catch {
    return null;
  }
}

function getSessionHtml(row: PracticeSessionRow | null) {
  if (!row) return "";
  const content = readSessionContent(row) || {};
  return String(row.pdf_html || row.pdfHtml || content.pdf_html || content.pdfHtml || "");
}

function htmlForPdf(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/window\.print\(\)/g, "");
}

function htmlForPreview(html: string) {
  const extra = `
    <style>
      html, body {
        max-width: 100% !important;
        min-height: 100% !important;
        overflow-x: hidden !important;
        background: #eef1f5 !important;
      }
      body {
        padding: 32px !important;
      }
      .page {
        width: 1120px !important;
        max-width: none !important;
        min-height: 790px !important;
        margin: 0 auto !important;
        box-shadow: 0 18px 55px rgba(15, 23, 42, .16) !important;
        border-radius: 10px !important;
        overflow: hidden !important;
      }
      img { max-width: 100%; }
      @media (max-width: 1180px) {
        body { padding: 18px !important; }
        .page {
          transform: scale(.88);
          transform-origin: top center;
          margin-bottom: -90px !important;
        }
      }
      @media (max-width: 980px) {
        .page {
          transform: scale(.72);
          margin-bottom: -220px !important;
        }
      }
    </style>
  `;

  if (html.includes("</head>")) return html.replace("</head>", `${extra}</head>`);
  return `${extra}${html}`;
}

async function loadHtml2Pdf() {
  if (typeof window === "undefined") {
    throw new Error("Génération PDF disponible uniquement dans le navigateur.");
  }

  if (window.html2pdf) return window.html2pdf;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-html2pdf="true"]');

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Chargement html2pdf impossible.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.async = true;
    script.dataset.html2pdf = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Chargement html2pdf impossible."));
    document.head.appendChild(script);
  });

  if (!window.html2pdf) throw new Error("html2pdf n'est pas disponible.");
  return window.html2pdf;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadFileFromUrl(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Téléchargement impossible.");
  const blob = await response.blob();
  downloadBlob(filename, blob);
}

async function createPdfBlobFromHtml(html: string) {
  const html2pdf = await loadHtml2Pdf();
  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "0";
  holder.style.width = "1120px";
  holder.innerHTML = htmlForPdf(html);
  document.body.appendChild(holder);

  try {
    const page = holder.querySelector<HTMLElement>(".page") || holder;
    return await html2pdf()
      .set({
        margin: 0,
        filename: "fiche-seance.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "px", format: [1120, 790], orientation: "landscape" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(page)
      .outputPdf("blob");
  } finally {
    holder.remove();
  }
}

function formatDate(value: unknown) {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function SessionPreviewPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();
  const [session, setSession] = useState<PracticeSessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      const { data, error: loadError } = await supabase
        .from("practice_sessions")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!active) return;

      if (loadError) {
        console.error("Erreur chargement aperçu séance:", loadError);
        setError(loadError.message || "Impossible de charger la séance.");
        setSession(null);
      } else {
        setSession((data || null) as PracticeSessionRow | null);
      }

      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [id, supabase]);

  const pdfUrl = String(session?.pdf_url || session?.pdfUrl || session?.attachment_url || "");
  const savedHtml = useMemo(() => getSessionHtml(session), [session]);
  const previewHtml = useMemo(() => htmlForPreview(savedHtml), [savedHtml]);
  const title = String(session?.title || "Fiche séance");
  const fileName = `${safeFileName(title)}.pdf`;

  async function downloadPdf() {
    try {
      setDownloading(true);

      if (pdfUrl) {
        await downloadFileFromUrl(pdfUrl, fileName);
        return;
      }

      if (!savedHtml) {
        alert("Aucun PDF ou HTML de séance disponible.");
        return;
      }

      const blob = await createPdfBlobFromHtml(savedHtml);
      downloadBlob(fileName, blob);
    } catch (downloadError) {
      console.error("Téléchargement PDF impossible:", downloadError);
      alert("Impossible de télécharger le PDF pour le moment.");
    } finally {
      setDownloading(false);
    }
  }

  function printSession() {
    if (pdfUrl) {
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (!savedHtml) return;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(savedHtml);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1200);
    }, 350);
  }

  function goFullscreen() {
    document.documentElement.requestFullscreen?.();
  }

  return (
    <main className="previewPage">
      <header className="previewTopbar">
        <button type="button" className="back" onClick={() => router.back()}>
          ← Retour
        </button>

        <div className="titleBlock">
          <p>Fiche séance</p>
          <h1>{title}</h1>
          {session && (
            <span>
              {formatDate(session.session_date || session.date)} · {session.team_name || session.location || "Équipe"}
            </span>
          )}
        </div>

        <div className="actions">
          <button type="button" className="download" onClick={downloadPdf} disabled={downloading || loading}>
            {downloading ? "Préparation..." : "⬇ Télécharger PDF"}
          </button>
          <button type="button" onClick={printSession} disabled={loading}>
            🖨 Imprimer
          </button>
          <button type="button" onClick={goFullscreen}>
            ⛶ Plein écran
          </button>
        </div>
      </header>

      <section className="viewerShell">
        {loading && <div className="empty">Chargement de la fiche séance...</div>}

        {!loading && error && <div className="empty error">{error}</div>}

        {!loading && !error && pdfUrl && (
          <iframe title="Fiche séance PDF" src={pdfUrl} className="pdfFrame" />
        )}

        {!loading && !error && !pdfUrl && savedHtml && (
          <iframe title="Fiche séance" srcDoc={previewHtml} className="pdfFrame" />
        )}

        {!loading && !error && !pdfUrl && !savedHtml && (
          <div className="empty">Aucune fiche sauvegardée pour cette séance.</div>
        )}
      </section>

      <style jsx>{`
        .previewPage {
          min-height: 100vh;
          background: #eef1f5;
          color: #111827;
          font-family: Roboto, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .previewTopbar {
          position: sticky;
          top: 0;
          z-index: 20;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 18px;
          align-items: center;
          padding: 16px 24px;
          background: rgba(255, 255, 255, 0.94);
          border-bottom: 1px solid #e5e7eb;
          backdrop-filter: blur(14px);
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
        }

        .back,
        .actions button {
          border: 1px solid #eadfd5;
          border-radius: 999px;
          background: #fff;
          color: #6b1a2c;
          padding: 12px 16px;
          font-weight: 950;
          cursor: pointer;
        }

        .actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .actions .download {
          background: #d4a24c;
          border-color: #d4a24c;
          color: #111827;
          box-shadow: 0 10px 24px rgba(212, 162, 76, 0.22);
        }

        .actions button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .titleBlock p {
          margin: 0 0 4px;
          color: #d4a24c;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 0.72rem;
        }

        .titleBlock h1 {
          margin: 0;
          color: #6b1a2c;
          font-size: clamp(1.2rem, 2.2vw, 2rem);
          line-height: 1;
        }

        .titleBlock span {
          display: block;
          margin-top: 5px;
          color: #6b7280;
          font-weight: 800;
        }

        .viewerShell {
          min-height: calc(100vh - 86px);
          padding: 24px;
          display: grid;
          place-items: start center;
        }

        .pdfFrame {
          width: min(1280px, 100%);
          height: calc(100vh - 135px);
          border: 0;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 24px 80px rgba(15, 23, 42, 0.22);
        }

        .empty {
          width: min(760px, 100%);
          margin: 40px auto;
          border: 1px dashed #d8c8b8;
          border-radius: 24px;
          background: #fff;
          color: #6b7280;
          padding: 36px;
          text-align: center;
          font-weight: 900;
        }

        .empty.error {
          color: #b91c1c;
          background: #fff5f5;
          border-color: #fecaca;
        }

        @media (max-width: 900px) {
          .previewTopbar {
            grid-template-columns: 1fr;
          }

          .actions {
            justify-content: flex-start;
          }

          .viewerShell {
            padding: 12px;
          }

          .pdfFrame {
            height: calc(100vh - 230px);
            border-radius: 16px;
          }
        }
      `}</style>
    </main>
  );
}
