import jsPDF from "jspdf";
import type { Playbook, PlaybookSystem } from "@/lib/playbook";

export type PlaybookPdfExportOptions = {
  courtsPerRow?: 1 | 2 | 3 | 4;
  includeComments?: boolean;
  includeSystemNames?: boolean;
  includePhaseNumbers?: boolean;
  comments?: Record<string, string>;
  preserveOrder?: boolean;
};

type Counts = {
  total: number;
  demi: number;
  slob: number;
  blob: number;
  favoris: number;
};

const CATEGORY_ORDER: Array<PlaybookSystem["category"]> = [
  "Système demi-terrain",
  "SLOB",
  "BLOB",
];

function safe(value: string | null | undefined, fallback = "—") {
  return value?.trim() || fallback;
}

function slugify(value: string | null | undefined) {
  return safe(value, "playbook")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function imageToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);

    if (!response.ok) return null;

    const blob = await response.blob();

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        resolve(null);
      };

      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addFooter(pdf: jsPDF, page: number) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(120);
  pdf.text(`pg. ${page}`, 105, 290, { align: "center" });
}

function addHeader(pdf: jsPDF, title: string) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(0);
  pdf.text(title.toUpperCase(), 14, 12);

  pdf.setDrawColor(220);
  pdf.setLineWidth(0.3);
  pdf.line(14, 16, 196, 16);
}

function getOrderedSystems(systems: PlaybookSystem[]) {
  return [...systems].sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a.category);
    const bIndex = CATEGORY_ORDER.indexOf(b.category);

    const safeAIndex = aIndex === -1 ? 999 : aIndex;
    const safeBIndex = bIndex === -1 ? 999 : bIndex;

    if (safeAIndex !== safeBIndex) return safeAIndex - safeBIndex;

    return safe(a.title, "").localeCompare(safe(b.title, ""));
  });
}

function drawWrappedText(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5
) {
  const lines = pdf.splitTextToSize(text, maxWidth) as string[];

  pdf.text(lines, x, y);

  return y + lines.length * lineHeight;
}

function addSystemTitle(
  pdf: jsPDF,
  playbookTitle: string,
  systemTitle: string,
  systemCategory: string
) {
  addHeader(pdf, playbookTitle);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(0);
  pdf.text(systemTitle, 105, 30, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(80);
  pdf.text(systemCategory, 105, 39, { align: "center" });
}

async function addSystemImages(
  pdf: jsPDF,
  images: string[],
  page: number,
  playbookTitle: string,
  systemTitle: string,
  systemCategory: string,
  options: PlaybookPdfExportOptions
) {
  let currentPage = page;
  const perRow = Math.max(1, Math.min(4, options.courtsPerRow ?? 2));
  const gap = 5;
  const left = 14;
  const usable = 182;
  const imageWidth = (usable - gap * (perRow - 1)) / perRow;
  const imageHeight = imageWidth * 0.72;
  const labelSpace = options.includePhaseNumbers === false ? 5 : 10;
  const rowHeight = imageHeight + labelSpace + 8;
  const startY = 52;
  const maxY = 268;
  let y = startY;
  let col = 0;

  if (images.length === 0) {
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(12); pdf.setTextColor(120);
    pdf.text("Aucun schéma disponible", 105, 120, { align: "center" });
    return { page: currentPage, contentY: 150 };
  }

  for (let imageIndex=0; imageIndex<images.length; imageIndex++) {
    if (col === 0 && y + rowHeight > maxY) {
      addFooter(pdf,currentPage); pdf.addPage(); currentPage++;
      addSystemTitle(pdf,playbookTitle,systemTitle,systemCategory); y=startY;
    }
    const x = left + col * (imageWidth + gap);
    const img = await imageToDataUrl(images[imageIndex]);
    if (img) {
      try { pdf.addImage(img,"PNG",x,y,imageWidth,imageHeight); }
      catch { pdf.setFontSize(9); pdf.setTextColor(120); pdf.text("Schéma non exportable",x+imageWidth/2,y+imageHeight/2,{align:"center"}); }
    } else {
      pdf.setFontSize(9); pdf.setTextColor(120); pdf.text("Schéma non disponible",x+imageWidth/2,y+imageHeight/2,{align:"center"});
    }
    if (options.includePhaseNumbers !== false) {
      pdf.setFont("helvetica","normal"); pdf.setFontSize(8); pdf.setTextColor(50);
      pdf.text(`Phase ${imageIndex+1}`,x+imageWidth/2,y+imageHeight+5,{align:"center"});
    }
    col++;
    if(col>=perRow){ col=0; y += rowHeight; }
  }
  if(col!==0) y += rowHeight;
  return { page:currentPage, contentY:Math.min(y+2,280) };
}

export async function exportPlaybookPdf(
  playbook: Playbook,
  systems: PlaybookSystem[],
  counts: Counts,
  options: PlaybookPdfExportOptions = {}
) {
  const pdf = new jsPDF("p", "mm", "a4");
  const playbookTitle = safe(playbook.title, "Playbook");
  const fileName = `${slugify(playbookTitle)}-playbook-mybasket.pdf`;
  const orderedSystems = options.preserveOrder ? [...systems] : getOrderedSystems(systems);

  let page = 1;

  /**
   * PAGE 1 — COUVERTURE
   */
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, 210, 297, "F");

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.6);
  pdf.rect(12, 16, 186, 34);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.setTextColor(0);
  pdf.text("PLAYBOOK DE L'ÉQUIPE", 105, 31, { align: "center" });

  pdf.setFontSize(34);
  pdf.text(playbookTitle.toUpperCase(), 105, 86, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(14);
  pdf.text(
    `${safe(playbook.category, "Catégorie")} · ${safe(
      playbook.level,
      "Niveau"
    )} · ${safe(playbook.season, "Saison")}`,
    105,
    102,
    { align: "center" }
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(`${counts.total} SYSTÈME${counts.total > 1 ? "S" : ""}`, 105, 126, {
    align: "center",
  });

  addFooter(pdf, page);

  /**
   * PAGE 2 — SOMMAIRE
   */
  pdf.addPage();
  page++;

  addHeader(pdf, playbookTitle);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text("SOMMAIRE", 105, 34, { align: "center" });

  let y = 58;
  let systemPage = 3;

  CATEGORY_ORDER.forEach((category) => {
    const categorySystems = orderedSystems.filter(
      (item) => item.category === category
    );

    if (categorySystems.length === 0) return;

    if (y > 250) {
      addFooter(pdf, page);
      pdf.addPage();
      page++;
      addHeader(pdf, playbookTitle);
      y = 34;
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(0);
    pdf.text(safe(category, "Catégorie"), 22, y);
    y += 8;

    categorySystems.forEach((system, index) => {
      if (y > 270) {
        addFooter(pdf, page);
        pdf.addPage();
        page++;
        addHeader(pdf, playbookTitle);
        y = 34;
      }

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);

      const title = `${index + 1}. ${safe(system.title, "Système sans titre")}`;

      pdf.text(title, 30, y);
      pdf.text(String(systemPage), 185, y, { align: "right" });

      y += 7;

      const phaseCount = Math.max(1, system.schema_images?.length || 0);
      systemPage += Math.ceil(phaseCount / 2);
    });

    y += 8;
  });

  addFooter(pdf, page);

  /**
   * PAGES SYSTÈMES — TOUS LES SCHÉMAS DANS L'ORDRE
   */
  for (const system of orderedSystems) {
    pdf.addPage();
    page++;

    const systemTitle = safe(system.title, "Système sans titre");
    const systemCategory = safe(system.category, "Catégorie");
    const images = (system.schema_images || []).filter(Boolean);

    if (options.includeSystemNames !== false) addSystemTitle(pdf, playbookTitle, systemTitle, systemCategory);
    else addHeader(pdf, playbookTitle);

    const imageResult = await addSystemImages(
      pdf,
      images,
      page,
      playbookTitle,
      systemTitle,
      systemCategory,
      options
    );

    page = imageResult.page;

    let contentY = imageResult.contentY;

    if (contentY > 250) {
      addFooter(pdf, page);
      pdf.addPage();
      page++;
      addSystemTitle(pdf, playbookTitle, systemTitle, systemCategory);
      contentY = 52;
    }

    const description = options.includeComments === false ? "" : safe(options.comments?.[system.id] ?? system.description, "");

    if (description) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(0);
      pdf.text("Description", 20, contentY);

      contentY += 8;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(40);

      contentY = drawWrappedText(pdf, description, 20, contentY, 170, 5);
    }

    if (system.tags && system.tags.length > 0) {
      contentY += 8;

      if (contentY > 270) {
        addFooter(pdf, page);
        pdf.addPage();
        page++;
        addSystemTitle(pdf, playbookTitle, systemTitle, systemCategory);
        contentY = 52;
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(0);
      pdf.text("Tags", 20, contentY);

      contentY += 8;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(40);

      drawWrappedText(pdf, system.tags.join(" · "), 20, contentY, 170, 5);
    }

    addFooter(pdf, page);
  }

  pdf.save(fileName);
}

export async function exportElementToPdf(element: HTMLElement | null, filename = "playbook.pdf") {
  if (!element) return;

  const pdf = new jsPDF("p", "mm", "a4");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Export Playbook", 14, 20);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(element.innerText.slice(0, 2500), 14, 35, { maxWidth: 180 });
  pdf.save(filename);
}
