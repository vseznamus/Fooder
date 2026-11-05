import type { DiaryEntry, MealType } from './types.ts';
import { dateOf, dayNumber, isWeekend, minuteOfDay } from './time.ts';

/** Один приём пищи в один день: всё, что записано в «завтрак 05.11». */
export interface MealSession {
  date: string;
  meal: MealType;
  weekend: boolean;
  /** Медианное время записей сессии, минуты от полуночи. */
  minute: number;
  /** Сколько дней назад относительно «сегодня». */
  ageDays: number;
  /** productId → граммы (если продукт записан дважды — сумма). */
  grams: Map<string, number>;
}

export interface HistoryStats {
  today: string;
  sessions: MealSession[];
  /** В скольких сессиях встречался продукт. */
  sessionCount: Map<string, number>;
  /** Все порции продукта, г. */
  gramsAll: Map<string, number[]>;
  /** Порции продукта в разрезе приёма пищи. */
  gramsByMeal: Map<string, Map<MealType, number[]>>;
  /** Сколько раз продукт встречался в каждом приёме. */
  mealCount: Map<string, Map<MealType, number>>;
  maxSessionCount: number;
}

/**
 * Собирает статистику по истории за окно `windowDays` дней до `today`
 * включительно. Сегодняшние записи тоже входят: для «обычно едите» и связок
 * они полезны, а «ел сегодня» учитывается отдельно в подсказках на день.
 */
export function buildHistory(entries: DiaryEntry[], today: string, windowDays = 60): HistoryStats {
  const todayN = dayNumber(today);
  const bySession = new Map<string, { date: string; meal: MealType; minutes: number[]; grams: Map<string, number> }>();

  for (const e of entries) {
    if (!(e.grams > 0)) continue;
    const date = dateOf(e.at);
    const age = todayN - dayNumber(date);
    if (age < 0 || age >= windowDays) continue;
    const key = `${date}|${e.meal}`;
    let s = bySession.get(key);
    if (!s) {
      s = { date, meal: e.meal, minutes: [], grams: new Map() };
      bySession.set(key, s);
    }
    s.minutes.push(minuteOfDay(e.at));
    s.grams.set(e.productId, (s.grams.get(e.productId) ?? 0) + e.grams);
  }

  const stats: HistoryStats = {
    today,
    sessions: [],
    sessionCount: new Map(),
    gramsAll: new Map(),
    gramsByMeal: new Map(),
    mealCount: new Map(),
    maxSessionCount: 0,
  };

  for (const s of bySession.values()) {
    const session: MealSession = {
      date: s.date,
      meal: s.meal,
      weekend: isWeekend(s.date),
      minute: median(s.minutes),
      ageDays: todayN - dayNumber(s.date),
      grams: s.grams,
    };
    stats.sessions.push(session);
    for (const [id, g] of s.grams) {
      const c = (stats.sessionCount.get(id) ?? 0) + 1;
      stats.sessionCount.set(id, c);
      stats.maxSessionCount = Math.max(stats.maxSessionCount, c);
      push(stats.gramsAll, id, g);
      let byMeal = stats.gramsByMeal.get(id);
      if (!byMeal) stats.gramsByMeal.set(id, (byMeal = new Map()));
      const list = byMeal.get(s.meal) ?? [];
      list.push(g);
      byMeal.set(s.meal, list);
      let mc = stats.mealCount.get(id);
      if (!mc) stats.mealCount.set(id, (mc = new Map()));
      mc.set(s.meal, (mc.get(s.meal) ?? 0) + 1);
    }
  }
  stats.sessions.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  return stats;
}

/**
 * Обычная порция продукта — медиана по истории. Если в этом приёме пищи
 * продукт встречался хотя бы дважды — медиана именно по нему
 * (кофе утром и кофе вечером могут быть разного объёма).
 */
export function usualGrams(stats: HistoryStats, productId: string, meal?: MealType): number | undefined {
  if (meal) {
    const m = stats.gramsByMeal.get(productId)?.get(meal);
    if (m && m.length >= 2) return median(m);
  }
  const all = stats.gramsAll.get(productId);
  return all && all.length ? median(all) : undefined;
}

/** Доля появлений продукта в данном приёме пищи (0..1). */
export function mealShare(stats: HistoryStats, productId: string, meal: MealType): number {
  const total = stats.sessionCount.get(productId) ?? 0;
  if (!total) return 0;
  return (stats.mealCount.get(productId)?.get(meal) ?? 0) / total;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
