import {
  boxOf,
  indicators,
  numeric,
  sumKnown,
  addBoxes,
  opponentBoxOf,
  automaticInsights,
  type DataRow,
} from "./matches";
export async function exportMatchAnalysisPdf(input: {
  name: string;
  matches: DataRow[];
  rows: DataRow[];
  actions: DataRow[];
  mode: "average" | "matches";
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  let y = 16;
  const f = (value: unknown) =>
    numeric(value) == null
      ? "—"
      : Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  function page() {
    doc.addPage();
    y = 16;
    header();
  }
  function ensure(height: number) {
    if (y + height > 190) page();
  }
  function header() {
    doc.setFillColor(107, 26, 44);
    doc.rect(0, 0, W, 5, "F");
    doc.setFontSize(16);
    doc.setTextColor(107, 26, 44);
    doc.text(`MYBASKET · ${input.name}`.slice(0, 80), 15, y);
    y += 9;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `Analyse des matchs · ${input.mode === "average" ? "Moyennes" : "Match par match"} · ${new Date().toLocaleDateString("fr-FR")}`,
      15,
      y,
    );
    y += 12;
  }
  function heading(title: string) {
    ensure(22);
    doc.setFontSize(12);
    doc.setTextColor(107, 26, 44);
    doc.text(title, 15, y);
    y += 8;
  }
  function table(headers: string[], records: string[][]) {
    const first = 51;
    const col = (W - 30 - first) / (headers.length - 1);
    const widths = headers.map((_, i) => (i ? col : first));
    let rowIndex = 0;
    function cells(items: string[], head = false) {
      ensure(9);
      let x = 15;
      doc.setFillColor(
        ...((head
          ? [107, 26, 44]
          : rowIndex % 2
            ? [249, 244, 246]
            : [255, 255, 255]) as [number, number, number]),
      );
      doc.rect(15, y - 5, W - 30, 9, "F");
      doc.setTextColor(
        ...((head ? [255, 255, 255] : [45, 35, 40]) as [
          number,
          number,
          number,
        ]),
      );
      doc.setFontSize(head ? 8 : 8.3);
      items.forEach((text, i) => {
        const lines = doc.splitTextToSize(String(text), widths[i] - 3);
        doc.text(lines.slice(0, 2), x + 1, y);
        x += widths[i];
      });
      y += 9;
      rowIndex++;
    }
    cells(headers, true);
    for (const row of records) {
      if (y + 9 > 190) {
        page();
        cells(headers, true);
      }
      cells(row);
    }
    y += 4;
  }
  const matches = input.matches;
  const withRows = matches.filter((m) =>
    input.rows.some((r) => r.match_id === m.id && r.present !== false),
  );
  const groups =
    input.mode === "matches"
      ? matches.map((m) => ({
          label: `${String(m.match_date || "").slice(0, 10)} · ${m.opponent || "Match"}`,
          matches: [m],
        }))
      : [
          {
            label: `Moyennes · ${withRows.length} feuilles`,
            matches: withRows,
          },
        ];
  const records = groups.map((group) => {
    const ids = new Set(group.matches.map((m) => m.id));
    const rows = input.rows.filter(
      (r) => ids.has(r.match_id) && r.present !== false,
    );
    const b = boxOf(rows);
    const opp = addBoxes(
      group.matches.map((m) => opponentBoxOf(m, input.actions)),
    );
    const own = { ...b, pts: sumKnown(group.matches, "us_score") ?? b.pts };
    const v = indicators(own, opp);
    const divisor = input.mode === "average" ? group.matches.length : 1;
    const avg = (n: number | null) =>
      n == null || !divisor ? null : n / divisor;
    return {
      label: group.label,
      shots: [
        group.label,
        ...[own.pts, opp.pts, b.p2m, b.p2a, b.p3m, b.p3a, b.ftm, b.fta].map(
          (n) => f(avg(n)),
        ),
        f(v.efg),
        f(v.ts),
      ],
      activity: [
        group.label,
        ...[
          "off_reb",
          "def_reb",
          "reb",
          "ast",
          "stl",
          "blk",
          "turnovers",
          "pf",
          "fpf",
        ].map((key) => f(avg(sumKnown(rows, key)))),
      ],
      advanced: [
        group.label,
        f(v.ortg),
        f(v.drtg),
        f(v.net),
        f(avg(v.possessions)),
        f(v.tov),
        f(v.orb),
        f(v.astTo),
      ],
    };
  });
  header();
  heading("Adresse et points");
  table(
    [
      "Match",
      "PTS",
      "ENC",
      "2R",
      "2T",
      "3R",
      "3T",
      "LFR",
      "LFT",
      "eFG %",
      "TS %",
    ],
    records.map((r) => r.shots),
  );
  heading("Statistiques collectives");
  table(
    ["Match", "RO", "RD", "REB", "PD", "INT", "CTR", "BP", "F", "FP"],
    records.map((r) => r.activity),
  );
  heading("Indicateurs avancés");
  table(
    ["Match", "ORTG", "DRTG", "NET", "POSS.", "TOV %", "ORB %", "PD/BP"],
    records.map((r) => r.advanced),
  );
  const b = boxOf(
    input.rows.filter((r) => withRows.some((m) => m.id === r.match_id)),
  );
  const opponent = addBoxes(
    withRows.map((m) => opponentBoxOf(m, input.actions)),
  );
  heading("Lecture des chiffres");
  doc.setFontSize(10);
  doc.setTextColor(45, 35, 40);
  for (const text of automaticInsights(b, opponent)) {
    const lines = doc.splitTextToSize(text, W - 30);
    ensure(lines.length * 5 + 3);
    doc.text(lines, 15, y);
    y += lines.length * 5 + 3;
  }
  ensure(18);
  doc.setFontSize(8);
  doc.setTextColor(105);
  const notes = `${matches.length} match(s) sélectionné(s), ${withRows.length} avec feuille de statistiques. Les valeurs non renseignées restent vides (—). Les moyennes utilisent les feuilles disponibles ; les pourcentages sont calculés sur les totaux. Possessions estimées : tirs + 0,44 LF − RO + BP. Le codage défensif est utilisé lorsque ses points correspondent au score adverse.`;
  doc.text(doc.splitTextToSize(notes, W - 30), 15, y);
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`${i}/${count}`, W - 22, 204);
  }
  doc.save(`MyBasket-analyse-${input.mode}.pdf`);
}
