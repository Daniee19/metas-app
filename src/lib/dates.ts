import * as chrono from "chrono-node";

export const TIMEZONE = process.env.APP_TIMEZONE ?? "America/Lima";
/** Desfase en minutos respecto a UTC. Lima es UTC-5 todo el año (sin horario de verano). */
const TZ_OFFSET_MIN = Number(process.env.APP_TZ_OFFSET_MIN ?? -300);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha local "YYYY-MM-DD" en tu zona horaria. */
export function localDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Hora local (0–23) en tu zona horaria. */
export function localHour(d: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(d),
  );
}

/** Diferencia en días de calendario (local) entre dos fechas "YYYY-MM-DD". */
export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(toYmd) - Date.parse(fromYmd)) / DAY_MS);
}

export function addDaysYmd(ymd: string, days: number): string {
  return new Date(Date.parse(ymd) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Instante UTC en que termina el día local indicado (por defecto, hoy). */
export function endOfLocalDay(d: Date = new Date()): Date {
  return new Date(Date.parse(`${localDate(d)}T23:59:59Z`) - TZ_OFFSET_MIN * 60 * 1000);
}

/** Convierte "YYYY-MM-DD" del input date a un Date a las 23:59 local. */
export function deadlineFromDateStr(ymd: string): Date {
  return new Date(Date.parse(`${ymd}T23:59:00Z`) - TZ_OFFSET_MIN * 60 * 1000);
}

export function formatDue(d: Date | null): string {
  if (!d) return "sin fecha";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Extrae una fecha de un texto en español y devuelve el texto limpio.
 * "Entregar informe IEEE el viernes a las 5pm" → { title: "Entregar informe IEEE", dueAt: <viernes 17:00> }
 * Si no se indica hora, se asume las 23:59 de ese día.
 */
export function parseTaskText(text: string, now: Date = new Date()) {
  const results = chrono.es.parse(text, { instant: now, timezone: TZ_OFFSET_MIN }, { forwardDate: true });
  const first = results[0];
  if (!first) return { title: text.trim(), dueAt: null as Date | null };

  const dueAt = first.start.date();
  if (!first.start.isCertain("hour")) {
    // Fin del día local
    const ymd = localDate(dueAt);
    dueAt.setTime(Date.parse(`${ymd}T23:59:00Z`) - TZ_OFFSET_MIN * 60 * 1000);
  }

  const title = (text.slice(0, first.index) + text.slice(first.index + first.text.length))
    .replace(/\s+(el|la|para|hasta|antes del?)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { title: title || text.trim(), dueAt };
}
