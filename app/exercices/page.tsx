import styles from "./exercices-layout.module.css";
import ExercicesClient from "./ExercicesClient";

export default function ExercicesPage() {
  return (
    <div className={styles.exercisesWidePage}>
      <ExercicesClient />
    </div>
  );
}
