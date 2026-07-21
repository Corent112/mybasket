import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { cleanPracticeText, parsePracticeDuration, shortCoachCode } from "@/lib/practice-session-format";

type TeamCompositionBlock = {
  id: string;
  title: string;
  playersPerTeam: number;
  teams: Array<{ id: string; name: string; playerIds: string[] }>;
};

type Session = {
  title: string;
  theme: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  club_logo_url: string | null;
  mybasket_logo_url: string | null;
  team_composition_blocks?: TeamCompositionBlock[] | null;
  player_groups?: Record<string, string[]> | null;
};

type Player = {
  id?: string | null;
  player_id?: string | null;
  first_name: string | null;
  last_name: string | null;
  position: "guard" | "forward" | "center" | null;
};

type Exercise = {
  id?: string;
  title: string;
  who: string | null;
  duration_minutes: number | null;
  situation_image_url: string | null;
  situation_image_urls?: string[] | null;
  image_urls?: string[] | null;
  schema_urls?: string[] | null;
  explanation: string | null;
  instructions: string | null;
  variants?: string | null;
  metadata?: Record<string, unknown> | null;
};

type Props = { session: Session; players: Player[]; exercises: Exercise[] };

function formatDate(date?: string | null) {
  if (!date) return "Date non définie";
  return new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function formatTime(time?: string | null) { return time ? time.slice(0, 5) : ""; }
function playerName(player: Player) { return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(); }
function playerId(player: Player) { return String(player.player_id || player.id || ""); }
function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}
function exerciseImages(exercise: Exercise) {
  const metadata = exercise.metadata ?? {};
  return uniqueStrings([
    exercise.situation_image_url,
    exercise.situation_image_urls ?? [],
    exercise.image_urls ?? [],
    exercise.schema_urls ?? [],
    (metadata as Record<string, unknown>).situation_image_urls ?? [],
    (metadata as Record<string, unknown>).image_urls ?? [],
    (metadata as Record<string, unknown>).schema_urls ?? [],
  ]);
}
function compositionBlocks(session: Session): TeamCompositionBlock[] {
  if (Array.isArray(session.team_composition_blocks) && session.team_composition_blocks.length) return session.team_composition_blocks;
  const legacy = session.player_groups && typeof session.player_groups === "object" ? session.player_groups : {};
  const teams = Object.entries(legacy).map(([name, playerIds], index) => ({ id: `legacy-team-${index}`, name, playerIds: Array.isArray(playerIds) ? playerIds : [] }));
  return teams.length ? [{ id: "legacy-block", title: "Équipes de travail", playersPerTeam: 0, teams }] : [];
}

export default function PracticeSessionPdf({ session, players, exercises }: Props) {
  const blocks = compositionBlocks(session);
  const totalDuration = exercises.reduce((total, exercise) => total + parsePracticeDuration(exercise.duration_minutes, 0), 0);
  const playerById = new Map(players.map((player) => [playerId(player), player]));
  const guards = players.filter((player) => player.position === "guard");
  const forwards = players.filter((player) => player.position === "forward");
  const centers = players.filter((player) => player.position === "center");

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page} wrap>
        <View style={styles.header} wrap={false}>
          <View style={styles.logoBox}>
            {session.mybasket_logo_url ? <Image src={session.mybasket_logo_url} style={styles.logo} /> : <Text style={styles.logoText}>MYBASKET</Text>}
          </View>
          <View style={styles.titleBox}>
            <Text style={styles.kicker}>MYBASKET · PRACTICE PLAN</Text>
            <Text style={styles.title}>{session.title || "FICHE SÉANCE"}</Text>
            <Text style={styles.meta}>{formatDate(session.session_date)} · {formatTime(session.start_time)} — {formatTime(session.end_time)}</Text>
            <Text style={styles.meta}>{session.theme || "Sans thème"} · {session.location || "Lieu non défini"} · {totalDuration} min</Text>
          </View>
          <View style={styles.logoBox}>
            {session.club_logo_url ? <Image src={session.club_logo_url} style={styles.logo} /> : <Text style={styles.logoText}>CLUB</Text>}
          </View>
        </View>

        <View style={styles.presentSection} wrap={false}>
          <Text style={styles.sectionEyebrow}>JOUEURS PRÉSENTS</Text>
          <View style={styles.positionGrid}>
            {[
              { title: "GUARD", items: guards },
              { title: "FORWARD", items: forwards },
              { title: "CENTER", items: centers },
            ].map((column) => (
              <View key={column.title} style={styles.positionColumn}>
                <Text style={styles.positionTitle}>{column.title}</Text>
                {column.items.length ? column.items.map((player) => (
                  <Text key={playerId(player)} style={styles.positionPlayer}>{playerName(player)}</Text>
                )) : <Text style={styles.positionPlayer}>—</Text>}
              </View>
            ))}
          </View>
        </View>

        {exercises.map((exercise, index) => {
          const images = exerciseImages(exercise);
          return (
            <View key={exercise.id || `${exercise.title}-${index}`} style={styles.exerciseCard} wrap={false}>
              <View style={styles.exerciseTopline}>
                <View>
                  <Text style={styles.exerciseNumber}>EXERCICE {index + 1}</Text>
                  <Text style={styles.exerciseTitle}>{exercise.title}</Text>
                </View>
                <View style={styles.exerciseBadges}>
                  <Text style={styles.badge}>{shortCoachCode(exercise.who)}</Text>
                  <Text style={styles.badgeGold}>{parsePracticeDuration(exercise.duration_minutes, 0)} MIN</Text>
                </View>
              </View>

              {images.length ? (
                <View style={images.length === 1 ? styles.singleImageWrap : styles.imageGrid}>
                  {images.map((src, imageIndex) => (
                    <Image key={`${src}-${imageIndex}`} src={src} style={images.length === 1 ? styles.singleImage : styles.gridImage} />
                  ))}
                </View>
              ) : (
                <View style={styles.placeholder}><Text style={styles.placeholderText}>SCHÉMA NON DISPONIBLE</Text></View>
              )}

              <View style={styles.textGrid}>
                <View style={styles.textPanel}>
                  <Text style={styles.textLabel}>DÉROULEMENT</Text>
                  <Text style={styles.bodyText}>{cleanPracticeText(exercise.explanation) || "—"}</Text>
                </View>
                <View style={styles.textPanelGold}>
                  <Text style={styles.textLabel}>CONSIGNES / VARIANTES</Text>
                  <Text style={styles.bodyText}>{cleanPracticeText(exercise.instructions) || cleanPracticeText(exercise.variants) || "—"}</Text>
                </View>
              </View>
            </View>
          );
        })}

        {blocks.length > 0 && (
          <View style={styles.compositions}>
            <Text style={styles.compositionsTitle}>COMPOSITIONS D’ÉQUIPES</Text>
            {blocks.map((block, blockIndex) => (
              <View key={block.id} style={styles.block} wrap={false}>
                <View style={styles.blockHeader}>
                  <Text style={styles.blockIndex}>BLOC {blockIndex + 1}</Text>
                  <Text style={styles.blockTitle}>{block.title || "Composition"}</Text>
                  <Text style={styles.blockCount}>{block.playersPerTeam > 0 ? `${block.playersPerTeam} joueurs / équipe` : "Groupes libres"}</Text>
                </View>
                <View style={styles.teamsGrid}>
                  {block.teams.map((team, teamIndex) => {
                    const teamPlayers = team.playerIds.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));
                    return (
                      <View key={team.id} style={styles.teamCard}>
                        <View style={styles.teamCardHeader}>
                          <Text style={styles.teamDot}>{teamIndex + 1}</Text>
                          <Text style={styles.teamName}>{team.name}</Text>
                        </View>
                        <View style={styles.teamPlayers}>
                          {teamPlayers.length ? teamPlayers.map((player) => (
                            <Text key={playerId(player)} style={styles.teamPlayerName}>• {playerName(player)}</Text>
                          )) : <Text style={styles.teamPlayerName}>—</Text>}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 18, paddingHorizontal: 18, paddingBottom: 20, fontSize: 9, backgroundColor: "#f7f4ee", color: "#111" },
  header: { flexDirection: "row", backgroundColor: "#0d0d0f", borderRadius: 10, padding: 12, alignItems: "center", marginBottom: 12 },
  logoBox: { width: 78, height: 62, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: 8, padding: 6 },
  logo: { maxWidth: 62, maxHeight: 50, objectFit: "contain" }, logoText: { fontSize: 11, fontWeight: 900 },
  titleBox: { flex: 1, alignItems: "center", paddingHorizontal: 12 }, kicker: { fontSize: 6.5, letterSpacing: 1.7, color: "#d4a24c", marginBottom: 4 },
  title: { fontSize: 19, fontWeight: 900, color: "#fff", marginBottom: 4, textAlign: "center" }, meta: { fontSize: 8, color: "#ddd", marginBottom: 2, textAlign: "center" },
  presentSection: { backgroundColor: "#fff", borderRadius: 9, padding: 10, marginBottom: 12, border: "1px solid #e4dfd6" },
  sectionEyebrow: { fontSize: 7, fontWeight: 900, letterSpacing: 1.3, color: "#8c651f", marginBottom: 7 },
  positionGrid: { flexDirection: "row" }, positionColumn: { flex: 1, border: "1px solid #e4dfd6", marginRight: 5 },
  positionTitle: { backgroundColor: "#111", color: "#d4a24c", fontSize: 8, fontWeight: 900, textAlign: "center", paddingVertical: 5 },
  positionPlayer: { fontSize: 7.5, fontWeight: 700, textAlign: "center", paddingVertical: 4, borderTop: "1px solid #eee8df" },
  exerciseCard: { backgroundColor: "#fff", borderRadius: 10, marginBottom: 13, padding: 12, border: "1px solid #ded8ce" },
  exerciseTopline: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 9 }, exerciseNumber: { fontSize: 6.5, letterSpacing: 1.5, color: "#9b762f", fontWeight: 900 },
  exerciseTitle: { fontSize: 16, fontWeight: 900, color: "#111", marginTop: 2 }, exerciseBadges: { flexDirection: "row", gap: 5 }, badge: { backgroundColor: "#111", color: "#fff", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 7, fontSize: 7, fontWeight: 900 }, badgeGold: { backgroundColor: "#d4a24c", color: "#111", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 7, fontSize: 7, fontWeight: 900 },
  singleImageWrap: { backgroundColor: "#fafafa", borderRadius: 8, padding: 6, marginBottom: 9, alignItems: "center" }, singleImage: { width: "100%", height: 255, objectFit: "contain" },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 9 }, gridImage: { width: "48.8%", height: 150, objectFit: "contain", backgroundColor: "#fafafa", borderRadius: 6 },
  placeholder: { height: 180, border: "1px dashed #cfc7ba", borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 9 }, placeholderText: { color: "#888", fontWeight: 900, letterSpacing: 1 },
  textGrid: { flexDirection: "row", gap: 8 }, textPanel: { flex: 1, backgroundColor: "#f4f4f4", borderRadius: 7, padding: 9 }, textPanelGold: { flex: 1, backgroundColor: "#f6efe1", borderRadius: 7, padding: 9 },
  textLabel: { fontSize: 7, fontWeight: 900, letterSpacing: 1, marginBottom: 5, color: "#7d5d25" }, bodyText: { fontSize: 8.5, lineHeight: 1.4 },
  compositions: { marginTop: 3 }, compositionsTitle: { backgroundColor: "#111", color: "#d4a24c", borderRadius: 8, padding: 10, fontSize: 14, fontWeight: 900, letterSpacing: 1, marginBottom: 9 },
  block: { backgroundColor: "#fff", borderRadius: 9, padding: 10, marginBottom: 10, border: "1px solid #ded8ce" }, blockHeader: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  blockIndex: { backgroundColor: "#d4a24c", color: "#111", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 7, fontSize: 6.5, fontWeight: 900, marginRight: 7 }, blockTitle: { fontSize: 13, fontWeight: 900, flex: 1 }, blockCount: { fontSize: 7, color: "#777" },
  teamsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, teamCard: { width: "31.9%", border: "1px solid #ddd5c8", borderRadius: 8, overflow: "hidden" },
  teamCardHeader: { flexDirection: "row", alignItems: "center", backgroundColor: "#171719", padding: 7 }, teamDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#d4a24c", color: "#111", textAlign: "center", paddingTop: 3, fontSize: 6.5, fontWeight: 900, marginRight: 6 }, teamName: { color: "#fff", fontSize: 9, fontWeight: 900 },
  teamPlayers: { paddingVertical: 6, paddingHorizontal: 8 }, teamPlayerName: { fontSize: 7.5, fontWeight: 700, paddingVertical: 3 },
});
