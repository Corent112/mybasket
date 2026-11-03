export type PainZone = {
  id: string;
  label: string;
  side: "front" | "back";
  x: number;
  y: number;
};
export const PAIN_ZONES: PainZone[] = [
  { id: "head_front", label: "Tête", side: "front", x: 48, y: 4 },
  { id: "shoulder_left_front", label: "Épaule gauche", side: "front", x: 72, y: 20 },
  { id: "shoulder_right_front", label: "Épaule droite", side: "front", x: 28, y: 20 },
  { id: "plexus_front", label: "Plexus", side: "front", x: 50, y: 27 },
  { id: "biceps_left_front", label: "Biceps gauche", side: "front", x: 78, y: 35 },
  { id: "biceps_right_front", label: "Biceps droit", side: "front", x: 22, y: 35 },
  { id: "abdomen_front", label: "Abdos", side: "front", x: 50, y: 39 },
  { id: "fingers_left_front", label: "Doigts / main gauche", side: "front", x: 80, y: 51 },
  { id: "fingers_right_front", label: "Doigts / main droite", side: "front", x: 20, y: 51 },
  { id: "hip_left_front", label: "Hanche gauche", side: "front", x: 61, y: 48 },
  { id: "hip_right_front", label: "Hanche droite", side: "front", x: 39, y: 48 },
  { id: "thigh_left_front", label: "Cuisse gauche", side: "front", x: 61, y: 59 },
  { id: "thigh_right_front", label: "Cuisse droite", side: "front", x: 39, y: 59 },
  { id: "knee_left_front", label: "Genou gauche", side: "front", x: 62, y: 72 },
  { id: "knee_right_front", label: "Genou droit", side: "front", x: 38, y: 72 },
  { id: "tibia_left_front", label: "Tibia / cheville gauche", side: "front", x: 62, y: 83 },
  { id: "tibia_right_front", label: "Tibia / cheville droite", side: "front", x: 38, y: 83 },
  { id: "neck_back", label: "Nuque", side: "back", x: 50, y: 8 },
  { id: "upper_back", label: "Dos", side: "back", x: 50, y: 20 },
  { id: "elbow_left_back", label: "Coude gauche", side: "back", x: 24, y: 34 },
  { id: "elbow_right_back", label: "Coude droit", side: "back", x: 76, y: 34 },
  { id: "wrist_left_back", label: "Poignet gauche", side: "back", x: 18, y: 43 },
  { id: "wrist_right_back", label: "Poignet droit", side: "back", x: 82, y: 43 },
  { id: "hamstring_left", label: "Ischio gauche", side: "back", x: 39, y: 49 },
  { id: "hamstring_right", label: "Ischio droit", side: "back", x: 61, y: 49 },
  { id: "calf_left", label: "Mollet gauche", side: "back", x: 39, y: 61 },
  { id: "calf_right", label: "Mollet droit", side: "back", x: 61, y: 61 },
  { id: "achilles_left_back", label: "Tendon gauche", side: "back", x: 39, y: 72 },
  { id: "achilles_right_back", label: "Tendon droit", side: "back", x: 61, y: 72 },
  { id: "foot_left_back", label: "Pied gauche", side: "back", x: 39, y: 82 },
  { id: "foot_right_back", label: "Pied droit", side: "back", x: 61, y: 82 },
];

const LEGACY_PAIN_LABELS: Record<string,string> = {
    head_front:"Tête / visage", neck_front:"Cou", shoulder_left_front:"Épaule G", shoulder_right_front:"Épaule D", chest_front:"Thorax", plexus_front:"Plexus", abdomen_front:"Abdos", elbow_left_front:"Coude G", elbow_right_front:"Coude D", wrist_left_front:"Poignet G", wrist_right_front:"Poignet D", hip_left_front:"Hanche G", hip_right_front:"Hanche D", thigh_left_front:"Cuisse G", thigh_right_front:"Cuisse D", knee_left_front:"Genou G", knee_right_front:"Genou D", calf_left_front:"Mollet G", calf_right_front:"Mollet D", ankle_left_front:"Cheville G", ankle_right_front:"Cheville D", head_back:"Arrière tête", neck_back:"Nuque", shoulder_left_back:"Épaule G dos", shoulder_right_back:"Épaule D dos", upper_back:"Haut dos", lower_back:"Lombaires", elbow_left_back:"Coude G dos", elbow_right_back:"Coude D dos", wrist_left_back:"Poignet G dos", wrist_right_back:"Poignet D dos", glute_left:"Fessier G", glute_right:"Fessier D", hamstring_left:"Ischio G", hamstring_right:"Ischio D", knee_left_back:"Genou G arrière", knee_right_back:"Genou D arrière", calf_left:"Mollet G", calf_right:"Mollet D", ankle_left_back:"Cheville G dos", ankle_right_back:"Cheville D dos"
  };

export function painZoneLabel(id: string): string {
  return PAIN_ZONES.find(zone => zone.id === id)?.label || LEGACY_PAIN_LABELS[id] || "Autre zone déclarée";
}
