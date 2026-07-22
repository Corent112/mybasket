import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { cleanPracticeText, parsePracticeDuration, shortCoachCode } from "@/lib/practice-session-format";

type CompositionTeam = { id?: string; name: string; playerIds: string[] };
type CompositionBlock = {
  id?: string;
  title: string;
  playersPerTeam?: number;
  teams: CompositionTeam[];
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
  team_composition_blocks?: CompositionBlock[] | null;
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
  title: string;
  who: string | null;
  duration_minutes: number | null;
  situation_image_url?: string | null;
  schema_urls?: string[] | null;
  explanation: string | null;
  instructions: string | null;
  variants?: string | null;
};

type Props = {
  session: Session;
  players: Player[];
  exercises: Exercise[];
};

function formatDate(date?: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(time?: string | null) {
  return time ? time.slice(0, 5) : "";
}

function playerName(player: Player) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Joueur";
}

function playerId(player: Player) {
  return String(player.player_id || player.id || "");
}

function compositionBlocks(session: Session): CompositionBlock[] {
  if (Array.isArray(session.team_composition_blocks) && session.team_composition_blocks.length) {
    return session.team_composition_blocks;
  }

  const legacy = session.player_groups && typeof session.player_groups === "object"
    ? Object.entries(session.player_groups).map(([name, ids]) => ({
        name,
        playerIds: Array.isArray(ids) ? ids : [],
      }))
    : [];

  return legacy.length
    ? [{ title: "Équipes de travail", playersPerTeam: 0, teams: legacy }]
    : [];
}

export default function PracticeSessionPdf({ session, players, exercises }: Props) {
  const guards = players.filter((player) => player.position === "guard");
  const forwards = players.filter((player) => player.position === "forward");
  const centers = players.filter((player) => player.position === "center");
  const blocks = compositionBlocks(session);
  const totalDuration = exercises.reduce(
    (total, exercise) => total + parsePracticeDuration(exercise.duration_minutes, 0),
    0,
  );

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.header} wrap={false}>
          <View style={styles.logoBox}>
            {session.mybasket_logo_url ? (
              <Image src={session.mybasket_logo_url} style={styles.logo} />
            ) : (
              <Text style={styles.logoFallback}>MYBASKET</Text>
            )}
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.practicePlan}>Practice Plan</Text>
            <Text style={styles.headerLine}>Date : {formatDate(session.session_date)}</Text>
            <Text style={styles.headerLine}>Thème : {session.theme || "—"}</Text>
            <Text style={styles.headerLine}>
              Horaire : {formatTime(session.start_time)} - {formatTime(session.end_time)}
            </Text>
            <Text style={styles.headerLine}>Lieu : {session.location || "—"}</Text>
            <Text style={styles.headerLine}>Durée : {totalDuration} min</Text>
          </View>

          <View style={styles.logoBox}>
            {session.club_logo_url ? (
              <Image src={session.club_logo_url} style={styles.logo} />
            ) : (
              <Text style={styles.logoFallback}>CLUB</Text>
            )}
          </View>
        </View>

        <View style={styles.playersTable} wrap={false}>
          <PlayerColumn title="Guard" players={guards} />
          <PlayerColumn title="Forward" players={forwards} />
          <PlayerColumn title="Center" players={centers} isLast />
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={styles.whoCell}>Qui</Text>
          <Text style={styles.timeCell}>Tps</Text>
          <Text style={styles.schemaCell}>Schémas</Text>
          <Text style={styles.explanationCell}>Explications</Text>
          <Text style={styles.instructionsCell}>Consignes / Variantes</Text>
        </View>

        {exercises.map((exercise, index) => {
          const images = Array.from(
            new Set([
              ...(Array.isArray(exercise.schema_urls) ? exercise.schema_urls : []),
              ...(exercise.situation_image_url ? [exercise.situation_image_url] : []),
            ].filter(Boolean)),
          ) as string[];

          return (
            <View key={`${exercise.title}-${index}`} style={styles.exerciseRow} wrap={false}>
              <View style={styles.whoCellBody}>
                <Text>{shortCoachCode(exercise.who)}</Text>
              </View>
              <View style={styles.timeCellBody}>
                <Text>{parsePracticeDuration(exercise.duration_minutes, 0)}'</Text>
              </View>
              <View style={styles.schemaCellBody}>
                <Text style={styles.exerciseTitle}>{exercise.title || `Exercice ${index + 1}`}</Text>
                {images.length ? (
                  <View style={styles.imageGrid}>
                    {images.map((image, imageIndex) => (
                      <Image
                        key={`${image}-${imageIndex}`}
                        src={image}
                        style={images.length === 1 ? styles.singleImage : styles.multiImage}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.noSchema}>
                    <Text>Aucun schéma</Text>
                  </View>
                )}
              </View>
              <View style={styles.explanationCellBody}>
                <Text>{cleanPracticeText(exercise.explanation) || "—"}</Text>
              </View>
              <View style={styles.instructionsCellBody}>
                <Text>
                  {cleanPracticeText(exercise.instructions) ||
                    cleanPracticeText(exercise.variants) ||
                    "—"}
                </Text>
              </View>
            </View>
          );
        })}

        {blocks.length > 0 && (
          <View style={styles.compositionsSection}>
            <Text style={styles.compositionsTitle}>COMPOSITIONS D’ÉQUIPES</Text>
            {blocks.map((block, blockIndex) => (
              <View key={block.id || `${block.title}-${blockIndex}`} style={styles.blockCard} wrap={false}>
                <Text style={styles.blockTitle}>{block.title || `Bloc ${blockIndex + 1}`}</Text>
                <View style={styles.teamsGrid}>
                  {(block.teams || []).map((team, teamIndex) => {
                    const teamPlayers = (team.playerIds || [])
                      .map((id) => players.find((player) => playerId(player) === String(id)))
                      .filter((player): player is Player => Boolean(player));

                    return (
                      <View key={team.id || `${team.name}-${teamIndex}`} style={styles.teamCard}>
                        <Text style={styles.teamTitle}>{team.name || `Équipe ${teamIndex + 1}`}</Text>
                        {teamPlayers.length ? (
                          teamPlayers.map((player) => (
                            <Text key={playerId(player)} style={styles.teamPlayer}>
                              {playerName(player)}
                            </Text>
                          ))
                        ) : (
                          <Text style={styles.emptyTeam}>Aucun joueur</Text>
                        )}
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

function PlayerColumn({
  title,
  players,
  isLast = false,
}: {
  title: string;
  players: Player[];
  isLast?: boolean;
}) {
  return (
    <View style={[styles.playerColumn, isLast ? styles.playerColumnLast : {}]}>
      <Text style={styles.playerColumnTitle}>{title}</Text>
      <View style={styles.playerList}>
        {players.length ? (
          players.map((player) => (
            <Text key={playerId(player)} style={styles.playerName}>
              {playerName(player)}
            </Text>
          ))
        ) : (
          <Text style={styles.playerName}>—</Text>
        )}
      </View>
    </View>
  );
}

const borderColor = "#111111";

const styles = StyleSheet.create({
  page: {
    padding: 8,
    paddingBottom: 16,
    fontSize: 8,
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  header: {
    minHeight: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  logoBox: {
    width: 105,
    minHeight: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 88,
    height: 88,
    objectFit: "contain",
  },
  logoFallback: {
    fontSize: 12,
    fontWeight: 900,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  practicePlan: {
    fontSize: 15,
    fontWeight: 900,
    marginBottom: 3,
  },
  headerLine: {
    fontSize: 9,
    fontWeight: 700,
    marginBottom: 1,
  },
  playersTable: {
    flexDirection: "row",
    borderWidth: 0.8,
    borderColor,
    marginBottom: 8,
  },
  playerColumn: {
    flex: 1,
    minHeight: 72,
    borderRightWidth: 0.8,
    borderRightColor: borderColor,
  },
  playerColumnLast: {
    borderRightWidth: 0,
  },
  playerColumnTitle: {
    paddingVertical: 3,
    textAlign: "center",
    fontSize: 12,
    fontWeight: 900,
    backgroundColor: "#d9d9d9",
    borderBottomWidth: 0.8,
    borderBottomColor: borderColor,
  },
  playerList: {
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  playerName: {
    fontSize: 8.5,
    fontWeight: 700,
    marginBottom: 1.2,
  },
  tableHeader: {
    flexDirection: "row",
    minHeight: 34,
    alignItems: "stretch",
    backgroundColor: "#050505",
    color: "#ffffff",
    borderWidth: 0.8,
    borderColor,
  },
  whoCell: { width: 30, padding: 4, textAlign: "center", fontWeight: 900 },
  timeCell: { width: 32, padding: 4, textAlign: "center", fontWeight: 900, borderLeftWidth: 0.8, borderLeftColor: "#ffffff" },
  schemaCell: { width: 220, padding: 4, textAlign: "center", fontWeight: 900, borderLeftWidth: 0.8, borderLeftColor: "#ffffff" },
  explanationCell: { width: 145, padding: 4, textAlign: "center", fontWeight: 900, borderLeftWidth: 0.8, borderLeftColor: "#ffffff" },
  instructionsCell: { flex: 1, padding: 4, textAlign: "center", fontWeight: 900, borderLeftWidth: 0.8, borderLeftColor: "#ffffff" },
  exerciseRow: {
    minHeight: 106,
    flexDirection: "row",
    borderLeftWidth: 0.8,
    borderRightWidth: 0.8,
    borderBottomWidth: 0.8,
    borderColor,
  },
  whoCellBody: {
    width: 30,
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
    borderRightWidth: 0.8,
    borderRightColor: borderColor,
    fontSize: 9,
    fontWeight: 900,
    textAlign: "center",
  },
  timeCellBody: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
    borderRightWidth: 0.8,
    borderRightColor: borderColor,
    fontSize: 9,
    fontWeight: 900,
  },
  schemaCellBody: {
    width: 220,
    padding: 4,
    borderRightWidth: 0.8,
    borderRightColor: borderColor,
  },
  explanationCellBody: {
    width: 145,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    borderRightWidth: 0.8,
    borderRightColor: borderColor,
    lineHeight: 1.35,
    textAlign: "center",
    fontSize: 8.5,
    fontWeight: 700,
  },
  instructionsCellBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    lineHeight: 1.35,
    textAlign: "center",
    fontSize: 8.5,
    fontWeight: 700,
  },
  exerciseTitle: {
    marginBottom: 4,
    fontSize: 8.5,
    fontWeight: 900,
    textAlign: "center",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
  },
  singleImage: {
    width: 205,
    height: 92,
    objectFit: "contain",
  },
  multiImage: {
    width: 99,
    height: 74,
    objectFit: "contain",
  },
  noSchema: {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "#cccccc",
  },
  compositionsSection: {
    marginTop: 14,
  },
  compositionsTitle: {
    paddingVertical: 6,
    textAlign: "center",
    fontSize: 13,
    fontWeight: 900,
    color: "#6b1a2c",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#6b1a2c",
    marginBottom: 8,
  },
  blockCard: {
    marginBottom: 10,
    padding: 7,
    borderWidth: 0.8,
    borderColor: "#d9c7bd",
    borderRadius: 5,
  },
  blockTitle: {
    marginBottom: 6,
    fontSize: 11,
    fontWeight: 900,
    color: "#6b1a2c",
  },
  teamsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  teamCard: {
    width: "31.8%",
    minHeight: 62,
    padding: 5,
    borderWidth: 0.7,
    borderColor: "#bfa99d",
    borderRadius: 4,
  },
  teamTitle: {
    paddingBottom: 3,
    marginBottom: 3,
    borderBottomWidth: 0.6,
    borderBottomColor: "#d8c7be",
    fontSize: 9,
    fontWeight: 900,
  },
  teamPlayer: {
    fontSize: 7.5,
    marginBottom: 1.5,
  },
  emptyTeam: {
    fontSize: 7.5,
    color: "#888888",
  },
});
