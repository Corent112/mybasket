import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const PAGE_MARGIN = 18;
const HEADER_H = 114;
const DAY_HEADER_H = 22;
const FOOTER_H = 14;
const TIME_COL_W = 42;
const MAX_DAYS_PER_PAGE = 5;

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_MARGIN,
    paddingHorizontal: PAGE_MARGIN,
    paddingBottom: PAGE_MARGIN + FOOTER_H,
    fontFamily: "Helvetica",
    fontSize: 7,
    color: "#171717",
    backgroundColor: "#FFFFFF",
  },

  topTitle: {
    borderWidth: 1,
    borderColor: "#111111",
    minHeight: 22,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  topTitleText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    textTransform: "uppercase",
  },

  infoRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#111111",
    minHeight: 18,
  },
  infoCell: {
    flexDirection: "row",
    alignItems: "center",
    borderRightWidth: 1,
    borderColor: "#111111",
    paddingHorizontal: 5,
    minWidth: 0,
  },
  infoCellLast: {
    borderRightWidth: 0,
  },
  infoLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.8,
    marginRight: 5,
  },
  infoValue: {
    fontSize: 6.8,
    flex: 1,
  },

  summaryRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#111111",
    minHeight: 54,
  },
  summaryCell: {
    padding: 5,
    borderRightWidth: 1,
    borderColor: "#111111",
    minWidth: 0,
  },
  summaryCellLast: {
    borderRightWidth: 0,
  },
  summaryHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.8,
    marginBottom: 3,
    textDecoration: "underline",
  },
  summaryText: {
    fontSize: 6.4,
    lineHeight: 1.22,
  },

  schedule: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#111111",
  },
  daysHeader: {
    flexDirection: "row",
    height: DAY_HEADER_H,
    borderBottomWidth: 1,
    borderColor: "#111111",
  },
  blankDayHeader: {
    width: TIME_COL_W,
    borderRightWidth: 1,
    borderColor: "#111111",
  },
  dayHeader: {
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderColor: "#111111",
  },
  dayHeaderLast: {
    borderRightWidth: 0,
  },
  dayHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    textTransform: "uppercase",
    textAlign: "center",
  },

  timelineBody: {
    position: "relative",
  },
  timeAxis: {
    position: "absolute",
    left: 0,
    top: 0,
    width: TIME_COL_W,
    borderRightWidth: 1,
    borderColor: "#111111",
  },
  timeLabel: {
    position: "absolute",
    left: 0,
    width: TIME_COL_W - 2,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 6.3,
  },
  dayColumn: {
    position: "absolute",
    top: 0,
    borderRightWidth: 1,
    borderColor: "#111111",
  },
  hourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 0.55,
    backgroundColor: "#111111",
  },
  halfHourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 0.3,
    backgroundColor: "#BDBDBD",
  },

  block: {
    position: "absolute",
    left: 2,
    right: 2,
    borderWidth: 0.8,
    borderColor: "#111111",
    paddingHorizontal: 4,
    paddingVertical: 3,
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  blockMeal: {
    backgroundColor: "#EDEDED",
  },
  blockBreak: {
    backgroundColor: "#F4F4F4",
  },
  blockAssessment: {
    backgroundColor: "#FFF4E6",
  },
  blockMeeting: {
    backgroundColor: "#F7F2FA",
  },
  blockCourt: {
    backgroundColor: "#F7FBF4",
  },
  blockTime: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.4,
    textAlign: "center",
    marginBottom: 2,
  },
  blockTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    lineHeight: 1.12,
    textAlign: "center",
  },
  blockMeta: {
    fontSize: 6,
    lineHeight: 1.08,
    textAlign: "center",
    marginTop: 2,
  },

  footer: {
    position: "absolute",
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    bottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 5.5,
    color: "#666666",
  },
  footerLogo: {
    width: 38,
    height: 16,
    objectFit: "contain",
  },
});

export type PlanningPdfBlock = {
  id: string;
  training_day: string;
  start_time: string;
  end_time: string;
  title: string;
  formation_name?: string | null;
  instructor_name?: string | null;
  room_name?: string | null;
  location_type?: string | null;
  block_type?: string | null;
  description?: string | null;
};

type Structure = {
  id?: string;
  name?: string | null;
  short_name?: string | null;
  logo_url?: string | null;
  email?: string | null;
  city?: string | null;
  document_primary_color?: string | null;
  document_secondary_color?: string | null;
};

type Cohort = {
  id?: string;
  name?: string | null;
  planning_title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
};

function toMinutes(value: string) {
  const [hours, minutes] = String(value || "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);

  return (hours || 0) * 60 + (minutes || 0);
}

function formatHour(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

function shortDate(value?: string | null) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR");
}

function dayLabel(value: string) {
  return new Date(`${value}T12:00:00`)
    .toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function getBlockStyle(type?: string | null) {
  if (type === "meal") return styles.blockMeal;
  if (type === "break") return styles.blockBreak;
  if (type === "assessment") return styles.blockAssessment;
  if (type === "meeting") return styles.blockMeeting;
  if (type === "court") return styles.blockCourt;
  return {};
}

function Header({
  structure,
  cohort,
  title,
  blocks,
  dates,
}: {
  structure: Structure;
  cohort: Cohort;
  title: string;
  blocks: PlanningPdfBlock[];
  dates: string[];
}) {
  const trainingBlocks = blocks.filter(
    (block) => block.block_type !== "meal" && block.block_type !== "break",
  );

  const totalMinutes = trainingBlocks.reduce((sum, block) => {
    return sum + Math.max(0, toMinutes(block.end_time) - toMinutes(block.start_time));
  }, 0);

  const instructors = unique(blocks.map((block) => block.instructor_name));
  const rooms = unique(blocks.map((block) => block.room_name));

  const descriptions = unique(blocks.map((block) => block.description)).slice(0, 4);
  const formationNames = unique(blocks.map((block) => block.formation_name)).slice(0, 5);

  const firstDate = cohort.start_date || dates[0] || "";
  const lastDate = cohort.end_date || dates[dates.length - 1] || "";
  const location =
    cohort.location ||
    structure.city ||
    rooms.slice(0, 2).join(" / ") ||
    "";

  return (
    <View>
      <View style={styles.topTitle}>
        <Text style={styles.topTitleText}>
          {(() => {
            const promotionName = String(cohort.name || "").trim();
            const formationName =
              unique(blocks.map((block) => block.formation_name))[0] || "";
            const planningTitle = String(title || "").trim();

            if (formationName && promotionName) {
              return `${formationName} - ${promotionName}`;
            }

            return formationName || promotionName || planningTitle || "Planning de formation";
          })()}
        </Text>
      </View>

      <View style={styles.infoRow}>
        <View style={[styles.infoCell, { width: "50%" }]}>
          <Text style={styles.infoLabel}>Dates :</Text>
          <Text style={styles.infoValue}>
            {firstDate && lastDate
              ? `du ${shortDate(firstDate)} au ${shortDate(lastDate)}`
              : dates.map(shortDate).join(" - ")}
          </Text>
        </View>
        <View style={[styles.infoCell, styles.infoCellLast, { width: "50%" }]}>
          <Text style={styles.infoLabel}>Lieu :</Text>
          <Text style={styles.infoValue}>{location || "-"}</Text>
        </View>
      </View>

      <View style={styles.infoRow}>
        <View style={[styles.infoCell, { width: "50%" }]}>
          <Text style={styles.infoLabel}>Nbr jours :</Text>
          <Text style={styles.infoValue}>
            {dates.length} jour{dates.length > 1 ? "s" : ""}
          </Text>
        </View>
        <View style={[styles.infoCell, styles.infoCellLast, { width: "50%" }]}>
          <Text style={styles.infoLabel}>Volume horaire :</Text>
          <Text style={styles.infoValue}>
            {Math.floor(totalMinutes / 60)} h
            {totalMinutes % 60 ? ` ${totalMinutes % 60} min` : ""}
          </Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCell, { width: "52%" }]}>
          <Text style={styles.summaryHeading}>Objectifs / consignes :</Text>
          <Text style={styles.summaryText}>
            {descriptions.length
              ? descriptions.map((item) => `• ${item}`).join("\n")
              : formationNames.length
                ? formationNames.map((item) => `• ${item}`).join("\n")
                : "—"}
          </Text>
        </View>

        <View style={[styles.summaryCell, { width: "22%" }]}>
          <Text style={styles.summaryHeading}>Types de séquences</Text>
          <Text style={styles.summaryText}>
            {unique(
              blocks.map((block) => {
                switch (block.block_type) {
                  case "court":
                    return "Terrain";
                  case "meeting":
                    return "Réunion";
                  case "meal":
                    return "Repas";
                  case "assessment":
                    return "Évaluation";
                  case "break":
                    return "Pause";
                  case "other":
                    return "Autre";
                  default:
                    return "Intervention";
                }
              }),
            )
              .map((item) => `• ${item}`)
              .join("\n") || "—"}
          </Text>
        </View>

        <View
          style={[
            styles.summaryCell,
            styles.summaryCellLast,
            { width: "26%" },
          ]}
        >
          <Text style={styles.summaryHeading}>Intervenants</Text>
          <Text style={styles.summaryText}>
            {instructors.length
              ? instructors.map((item) => `• ${item}`).join("\n")
              : "—"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function SchedulePage({
  structure,
  cohort,
  title,
  blocks,
  pageDays,
  allDays,
  pageIndex,
  pageCount,
}: {
  structure: Structure;
  cohort: Cohort;
  title: string;
  blocks: PlanningPdfBlock[];
  pageDays: string[];
  allDays: string[];
  pageIndex: number;
  pageCount: number;
}) {
  const pageBlocks = blocks.filter((block) =>
    pageDays.includes(block.training_day),
  );

  const earliest = Math.min(
    ...pageBlocks.map((block) => toMinutes(block.start_time)),
  );
  const latest = Math.max(
    ...pageBlocks.map((block) => toMinutes(block.end_time)),
  );

  const startMinute = Math.floor((earliest - 15) / 30) * 30;
  const endMinute = Math.ceil((latest + 15) / 30) * 30;

  const timelineHeight =
    PAGE_H -
    PAGE_MARGIN * 2 -
    HEADER_H -
    DAY_HEADER_H -
    FOOTER_H -
    18;

  const totalSpan = Math.max(60, endMinute - startMinute);
  const minuteToY = (minute: number) =>
    ((minute - startMinute) / totalSpan) * timelineHeight;

  const contentWidth = PAGE_W - PAGE_MARGIN * 2;
  const dayWidth = (contentWidth - TIME_COL_W) / Math.max(1, pageDays.length);

  const marks: number[] = [];
  for (let minute = startMinute; minute <= endMinute; minute += 30) {
    marks.push(minute);
  }

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Header
        structure={structure}
        cohort={cohort}
        title={title}
        blocks={blocks}
        dates={allDays}
      />

      <View style={styles.schedule}>
        <View style={styles.daysHeader}>
          <View style={styles.blankDayHeader} />

          {pageDays.map((day, index) => (
            <View
              key={day}
              style={[
                styles.dayHeader,
                index === pageDays.length - 1 ? styles.dayHeaderLast : {},
                { width: dayWidth },
              ]}
            >
              <Text style={styles.dayHeaderText}>{dayLabel(day)}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.timelineBody, { height: timelineHeight }]}>
          <View style={[styles.timeAxis, { height: timelineHeight }]}>
            {marks.map((minute) => (
              <Text
                key={`time-${minute}`}
                style={[
                  styles.timeLabel,
                  { top: Math.max(0, minuteToY(minute) - 3) },
                ]}
              >
                {formatHour(minute)}
              </Text>
            ))}
          </View>

          {pageDays.map((day, dayIndex) => {
            const left = TIME_COL_W + dayIndex * dayWidth;
            const dayBlocks = blocks.filter(
              (block) => block.training_day === day,
            );

            return (
              <View
                key={day}
                style={[
                  styles.dayColumn,
                  {
                    left,
                    width: dayWidth,
                    height: timelineHeight,
                    borderRightWidth:
                      dayIndex === pageDays.length - 1 ? 0 : 1,
                  },
                ]}
              >
                {marks.map((minute) => (
                  <View
                    key={`${day}-line-${minute}`}
                    style={[
                      minute % 60 === 0
                        ? styles.hourLine
                        : styles.halfHourLine,
                      { top: minuteToY(minute) },
                    ]}
                  />
                ))}

                {dayBlocks.map((block) => {
                  const start = toMinutes(block.start_time);
                  const end = toMinutes(block.end_time);
                  const top = minuteToY(start);
                  const rawHeight = Math.max(14, minuteToY(end) - top);

                  const compact = rawHeight < 34;
                  const veryCompact = rawHeight < 23;

                  return (
                    <View
                      key={block.id}
                      style={[
                        styles.block,
                        getBlockStyle(block.block_type),
                        {
                          top,
                          height: rawHeight,
                        },
                      ]}
                    >
                      <Text style={styles.blockTime}>
                        {String(block.start_time).slice(0, 5)} -{" "}
                        {String(block.end_time).slice(0, 5)}
                      </Text>

                      <Text
                        style={[
                          styles.blockTitle,
                          veryCompact ? { fontSize: 5.7 } : {},
                        ]}
                      >
                        {block.title}
                      </Text>

                      {!veryCompact && (
                        <Text
                          style={[
                            styles.blockMeta,
                            compact ? { fontSize: 5.4 } : {},
                          ]}
                        >
                          {[
                            block.formation_name,
                            block.instructor_name,
                            block.room_name,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.footer} fixed>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          {structure.logo_url ? (
            <Image src={structure.logo_url} style={styles.footerLogo} />
          ) : null}
          <Text>{structure.short_name || structure.name || "Institution"}</Text>
        </View>
        <Text>
          Planning généré par MyBasket
          {pageCount > 1 ? ` · page ${pageIndex + 1}/${pageCount}` : ""}
        </Text>
      </View>
    </Page>
  );
}

export function TrainingPlanningPdf({
  structure,
  cohort,
  title,
  blocks,
}: {
  structure: Structure;
  cohort: Cohort;
  title: string;
  blocks: PlanningPdfBlock[];
}) {
  const days = [...new Set(blocks.map((block) => block.training_day))].sort();
  const dayPages = chunk(days, MAX_DAYS_PER_PAGE);

  if (!days.length) {
    return (
      <Document title={`Planning - ${title}`}>
        <Page size="A4" orientation="landscape" style={styles.page}>
          <Header
            structure={structure}
            cohort={cohort}
            title={title}
            blocks={blocks}
            dates={[]}
          />
          <View style={{ marginTop: 20 }}>
            <Text>Aucun bloc n'est encore planifié.</Text>
          </View>
        </Page>
      </Document>
    );
  }

  return (
    <Document title={`Planning - ${title}`}>
      {dayPages.map((pageDays, pageIndex) => (
        <SchedulePage
          key={`page-${pageIndex}`}
          structure={structure}
          cohort={cohort}
          title={title}
          blocks={blocks}
          pageDays={pageDays}
          allDays={days}
          pageIndex={pageIndex}
          pageCount={dayPages.length}
        />
      ))}
    </Document>
  );
}
