export type CandidateImportRow = {
  line: number; firstName: string; lastName: string; email: string; phone: string;
  formation: string; clubName: string; tutorName: string; tutorEmail: string;
  cohortId: string; errors: string[]; result?: string; done?: boolean;
};
export const normalizeImportText = (value: unknown) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const aliases = {
  lastName: ["nom", "nomdefamille", "lastname"], firstName: ["prenom", "firstname"],
  email: ["mail", "email", "adressemail", "adresseemail"], phone: ["numero", "numerodetelephone", "telephone", "tel", "mobile", "portable"],
  formation: ["formation", "promotion", "diplome"], clubName: ["club", "nomduclub"],
  tutorName: ["tuteur", "nomtuteur", "nomdututeur"], tutorEmail: ["mailtuteur", "maildututeur", "emailtuteur", "emaildututeur"],
} as const;
export function readCandidateRows(matrix: unknown[][]): CandidateImportRow[] {
  const headerIndex = matrix.findIndex((row, i) => i < 25 && aliases.lastName.some(a => row.map(normalizeImportText).includes(a)) && aliases.firstName.some(a => row.map(normalizeImportText).includes(a)) && aliases.email.some(a => row.map(normalizeImportText).includes(a)));
  if (headerIndex < 0) throw new Error("Les colonnes Nom, Prénom et Mail sont obligatoires.");
  const headers = matrix[headerIndex].map(normalizeImportText);
  const columns = Object.fromEntries(Object.entries(aliases).map(([field, values]) => [field, headers.findIndex(h => (values as readonly string[]).includes(h))]));
  const rows: CandidateImportRow[] = [];
  matrix.slice(headerIndex + 1).forEach((cells, i) => {
    if (!cells.some(c => String(c ?? "").trim())) return;
    const value = (field: string) => String(cells[columns[field]] ?? "").trim();
    const errors: string[] = [];
    const email = value("email").toLowerCase(), tutorEmail = value("tutorEmail").toLowerCase();
    if (!value("lastName")) errors.push("Nom manquant");
    if (!value("firstName")) errors.push("Prénom manquant");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Mail invalide ou manquant");
    if (tutorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tutorEmail)) errors.push("Mail tuteur invalide");
    let phone = value("phone");
    if (/^[1-9]\d{8}$/.test(phone)) phone = `0${phone}`;
    rows.push({line: headerIndex + i + 2, firstName: value("firstName"), lastName: value("lastName"), email, phone, formation: value("formation"), clubName: value("clubName"), tutorName: value("tutorName"), tutorEmail, cohortId: "", errors});
  });
  if (!rows.length) throw new Error("Aucun candidat trouvé dans le fichier.");
  if (rows.length > 500) throw new Error("Importe au maximum 500 candidats par fichier.");
  return rows;
}
export function resolveCandidateFormation(value: string, cohorts: {id: string; name: string; label: string; program?: string; code?: string}[], selectedId: string) {
  if (!value.trim()) return cohorts.some(c => c.id === selectedId) ? selectedId : "";
  const n = normalizeImportText(value).replace(/promotion/g, "");
  const matches = cohorts.filter(c => [c.id, c.name, c.label, c.program, c.code].filter(Boolean).some(v => normalizeImportText(v).replace(/promotion/g, "") === n));
  return matches.length === 1 ? matches[0].id : "";
}
export function candidateTutor(notes?: string | null) {
  return {name: notes?.match(/^Tuteur : (.*)$/m)?.[1] || "", email: notes?.match(/^Mail tuteur : (.*)$/m)?.[1] || ""};
}
export function withCandidateTutor(notes: string | null | undefined, name: string, email: string) {
  const rest = (notes || "").split(/\r?\n/).filter(line => !/^(Tuteur|Mail tuteur) : /.test(line));
  if (name.trim()) rest.push(`Tuteur : ${name.trim().replace(/[\r\n]/g, " ")}`);
  if (email.trim()) rest.push(`Mail tuteur : ${email.trim().toLowerCase().replace(/[\r\n]/g, " ")}`);
  return rest.filter(Boolean).join("\n") || null;
}
