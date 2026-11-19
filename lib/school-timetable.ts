export type SchoolCourse = {
  day: number;
  title: string;
  start: string;
  end: string;
  location: string;
};
export function normalizeSchoolCourses(value: unknown): SchoolCourse[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    const day = Number(item?.day),
      title = String(item?.title || "")
        .trim()
        .slice(0, 140),
      start = String(item?.start || ""),
      end = String(item?.end || "");
    if (
      !Number.isInteger(day) ||
      day < 1 ||
      day > 7 ||
      !title ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
      end <= start
    )
      return [];
    return [
      {
        day,
        title,
        start,
        end,
        location: String(item?.location || "")
          .trim()
          .slice(0, 200),
      },
    ];
  });
}
export function schoolOccurrences(
  courses: SchoolCourse[],
  from: string,
  to: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    throw Error("Choisis une période valide.");
  const first = new Date(`${from}T12:00:00Z`),
    last = new Date(`${to}T12:00:00Z`);
  const span = (last.getTime() - first.getTime()) / 86400000;
  if (
    !Number.isFinite(span) ||
    span < 0 ||
    span > 366 ||
    first.toISOString().slice(0, 10) !== from ||
    last.toISOString().slice(0, 10) !== to
  )
    throw Error("La période doit couvrir au maximum une année scolaire.");
  const result: Array<SchoolCourse & { date: string }> = [];
  for (let day = 0; day <= span; day++) {
    const date = new Date(first.getTime() + day * 86400000);
    const weekday = date.getUTCDay() || 7;
    for (const course of courses)
      if (course.day === weekday)
        result.push({ ...course, date: date.toISOString().slice(0, 10) });
  }
  if (result.length > 2000)
    throw Error("Choisis une période plus courte (2 000 cours maximum).");
  return result;
}
