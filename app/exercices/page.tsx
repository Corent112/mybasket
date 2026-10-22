import InstitutionalSessionBasketBanner from "@/components/institutionnel/InstitutionalSessionBasketBanner";
import styles from "./exercices-layout.module.css";
import ExercicesClient from "./ExercicesClient";

export default function ExercicesPage() {
  return (
    <div className={styles.exercisesWidePage}>
      <InstitutionalSessionBasketBanner />
      <ExercicesClient />
    </div>
  );
}
