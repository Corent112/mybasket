import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

type Session = {
  title: string;
  theme: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  club_logo_url: string | null;
  mybasket_logo_url: string | null;
};

type Player = {
  first_name: string | null;
  last_name: string | null;
  position: "guard" | "forward" | "center" | null;
};

type Exercise = {
  title: string;
  who: string | null;
  duration_minutes: number | null;
  situation_image_url: string | null;
  explanation: string | null;
  instructions: string | null;
};

type Feedback = {
  rating: number | null;
  intensity: number | null;
  engagement: number | null;
  positives: string | null;
  improvements: string | null;
  coach_notes: string | null;
} | null;

type Props = {
  session: Session;
  players: Player[];
  exercises: Exercise[];
  feedback: Feedback;
};

function formatDate(date?: string | null) {
  if (!date) return "Date non définie";

  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(time?: string | null) {
  if (!time) return "";
  return time.slice(0, 5);
}

function playerName(player: Player) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
}

export default function PracticeSessionPdf({
  session,
  players,
  exercises,
  feedback,
}: Props) {
  const guards = players.filter((player) => player.position === "guard");
  const forwards = players.filter((player) => player.position === "forward");
  const centers = players.filter((player) => player.position === "center");

  const totalDuration = exercises.reduce(
    (total, exercise) => total + Number(exercise.duration_minutes ?? 0),
    0
  );

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {session.mybasket_logo_url ? (
              <Image src={session.mybasket_logo_url} style={styles.logo} />
            ) : (
              <Text style={styles.logoText}>MYBASKET</Text>
            )}
          </View>

          <View style={styles.titleBox}>
            <Text style={styles.title}>FICHE SÉANCE</Text>
            <Text style={styles.line}>Date : {formatDate(session.session_date)}</Text>
            <Text style={styles.line}>Thème : {session.theme || "—"}</Text>
            <Text style={styles.line}>
              Horaire : {formatTime(session.start_time)} -{" "}
              {formatTime(session.end_time)}
            </Text>
            <Text style={styles.line}>Lieu : {session.location || "—"}</Text>
            <Text style={styles.line}>Durée : {totalDuration} min</Text>
          </View>

          <View style={styles.logoBox}>
            {session.club_logo_url ? (
              <Image src={session.club_logo_url} style={styles.logo} />
            ) : (
              <Text style={styles.logoText}>CLUB</Text>
            )}
          </View>
        </View>

        <View style={styles.players}>
          <PlayerColumn title="Guard" players={guards} />
          <PlayerColumn title="Forward" players={forwards} />
          <PlayerColumn title="Center" players={centers} />
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.cellWho}>Qui</Text>
          <Text style={styles.cellTime}>Tps</Text>
          <Text style={styles.cellSituation}>Situation</Text>
          <Text style={styles.cellText}>Explications</Text>
          <Text style={styles.cellText}>Consignes</Text>
        </View>

        {exercises.map((exercise, index) => (
          <View key={`${exercise.title}-${index}`} style={styles.row}>
            <Text style={styles.cellWho}>{exercise.who || "—"}</Text>
            <Text style={styles.cellTime}>{exercise.duration_minutes ?? 0}'</Text>

            <View style={styles.cellSituation}>
              {exercise.situation_image_url ? (
                <Image src={exercise.situation_image_url} style={styles.exerciseImg} />
              ) : (
                <View style={styles.placeholder}>
                  <Text>Terrain</Text>
                </View>
              )}
              <Text style={styles.exerciseTitle}>{exercise.title}</Text>
            </View>

            <Text style={styles.cellText}>{exercise.explanation || "—"}</Text>
            <Text style={styles.cellText}>{exercise.instructions || "—"}</Text>
          </View>
        ))}

        {feedback && (
          <View style={styles.feedback}>
            <Text style={styles.feedbackTitle}>Bilan séance</Text>
            <Text>Note : {feedback.rating ?? "—"}/5</Text>
            <Text>Intensité : {feedback.intensity ?? "—"}/5</Text>
            <Text>Engagement : {feedback.engagement ?? "—"}/5</Text>
            <Text>Points positifs : {feedback.positives || "—"}</Text>
            <Text>Axes d’amélioration : {feedback.improvements || "—"}</Text>
            <Text>Notes coach : {feedback.coach_notes || "—"}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

function PlayerColumn({
  title,
  players,
}: {
  title: string;
  players: Player[];
}) {
  return (
    <View style={styles.playerCol}>
      <Text style={styles.playerTitle}>{title}</Text>

      {players.length === 0 ? (
        <Text style={styles.playerName}>—</Text>
      ) : (
        players.map((player, index) => (
          <Text key={`${title}-${index}`} style={styles.playerName}>
            {playerName(player)}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 18,
    fontSize: 9,
    backgroundColor: "#ffffff",
    color: "#111111",
  },
  header: {
    flexDirection: "row",
    border: "1px solid #111",
  },
  logoBox: {
    width: 120,
    minHeight: 95,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  logo: {
    maxWidth: 90,
    maxHeight: 80,
    objectFit: "contain",
  },
  logoText: {
    fontSize: 14,
    fontWeight: 900,
  },
  titleBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderLeft: "1px solid #111",
    borderRight: "1px solid #111",
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 900,
    marginBottom: 6,
  },
  line: {
    fontSize: 10,
    marginBottom: 2,
  },
  players: {
    flexDirection: "row",
    borderLeft: "1px solid #111",
    borderRight: "1px solid #111",
    borderBottom: "1px solid #111",
  },
  playerCol: {
    flex: 1,
    minHeight: 70,
    borderRight: "1px solid #111",
    alignItems: "center",
  },
  playerTitle: {
    width: "100%",
    backgroundColor: "#d9d9d9",
    textAlign: "center",
    padding: 5,
    fontSize: 14,
    fontWeight: 900,
  },
  playerName: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: 700,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#000",
    color: "#fff",
    borderLeft: "1px solid #111",
    borderRight: "1px solid #111",
  },
  row: {
    flexDirection: "row",
    minHeight: 82,
    borderLeft: "1px solid #111",
    borderRight: "1px solid #111",
    borderBottom: "1px solid #111",
  },
  cellWho: {
    width: 55,
    padding: 6,
    borderRight: "1px solid #111",
    fontWeight: 700,
  },
  cellTime: {
    width: 45,
    padding: 6,
    borderRight: "1px solid #111",
    fontWeight: 700,
  },
  cellSituation: {
    width: 220,
    padding: 6,
    borderRight: "1px solid #111",
  },
  cellText: {
    flex: 1,
    padding: 6,
    borderRight: "1px solid #111",
    lineHeight: 1.35,
  },
  exerciseImg: {
    width: "100%",
    height: 52,
    objectFit: "contain",
    marginBottom: 4,
  },
  placeholder: {
    height: 52,
    border: "1px solid #ddd",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  exerciseTitle: {
    fontWeight: 900,
    fontSize: 9,
  },
  feedback: {
    marginTop: 10,
    border: "1px solid #111",
    padding: 8,
    lineHeight: 1.4,
  },
  feedbackTitle: {
    fontSize: 13,
    fontWeight: 900,
    marginBottom: 4,
  },
});