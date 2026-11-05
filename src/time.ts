import type { MealType } from './types.ts';

/**
 * Время в модуле — «локальное настенное»: строки 'YYYY-MM-DDTHH:mm'.
 * Часовые пояса сознательно не учитываются — подсказкам важны «утро/вечер»
 * и «будни/выходные» в том виде, в каком их видит пользователь.
 */

export function dateOf(at: string): string {
  return at.slice(0, 10);
}

/** Минуты от полуночи. */
export function minuteOfDay(at: string): number {
  const h = Number(at.slice(11, 13)) || 0;
  const m = Number(at.slice(14, 16)) || 0;
  return h * 60 + m;
}

/** Номер дня с эпохи (UTC-арифметика над локальной датой — без DST-сюрпризов). */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}

export function addDays(date: string, delta: number): string {
  const dn = dayNumber(date) + delta;
  return new Date(dn * 86_400_000).toISOString().slice(0, 10);
}

export function isWeekend(date: string): boolean {
  const dow = new Date(dayNumber(date) * 86_400_000).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Приём пищи по времени суток, если пользователь его не выбрал явно. */
export function mealByTime(at: string): MealType {
  const min = minuteOfDay(at);
  if (min >= 4 * 60 && min < 11 * 60) return 'breakfast';
  if (min >= 11 * 60 && min < 16 * 60) return 'lunch';
  if (min >= 16 * 60 && min < 18 * 60) return 'snack';
  if (min >= 18 * 60 && min < 23 * 60) return 'dinner';
  return 'snack';
}

/** Разница во времени суток с учётом перехода через полночь. */
export function minuteDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}
