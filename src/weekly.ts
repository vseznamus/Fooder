/**
 * Баланс за неделю: ненавязчивая карточка, если несколько дней подряд
 * не хватает белка/клетчатки или слишком много сахара.
 */
import type { Catalog, DiaryEntry, Goals, Portion, Product, SuggestionSettings } from './types.ts';
import { buildHistory, usualGrams } from './history.ts';
import { scale, totalOf } from './nutrition.ts';
import { usualPortion } from './portion.ts';
import { isSuggestable } from './settings.ts';
import { addDays, dateOf } from './time.ts';
import { productTitle } from './topUp.ts';

export type BalanceIssue = 'lowProtein' | 'lowFiber' | 'highSugar';

export interface WeeklyCard {
  /** Стабильный id, чтобы UI мог скрыть карточку «на сегодня». */
  id: string;
  issue: BalanceIssue;
  /** Сколько дней подряд (заканчивая вчерашним). */
  days: number;
  message: string;
  products: { product: Product; portion: Portion; why: string }[];
}

export interface WeeklyInput {
  history: DiaryEntry[];
  catalog: Catalog;
  goals: Goals;
  settings: SuggestionSettings;
  now: string;
  /** С какой длины серии показывать карточку. */
  minStreak?: number;
  lookbackDays?: number;
}

export const WEEKLY_THRESHOLDS = {
  /** День «без белка», если съедено меньше 85 % нормы. */
  protein: 0.85,
  /** День «без клетчатки» — меньше 80 % нормы. */
  fiber: 0.8,
  /** Если за день записано меньше 50 % нормы калорий — день, скорее всего, заполнен не полностью и в серию не идёт. */
  completeDay: 0.5,
};

export function weeklyBalance(input: WeeklyInput): WeeklyCard[] {
  const { goals, catalog, settings } = input;
  if (!settings.enabled) return [];
  const today = dateOf(input.now);
  const minStreak = input.minStreak ?? 3;
  const lookback = input.lookbackDays ?? 7;

  const byDate = new Map<string, DiaryEntry[]>();
  for (const e of input.history) {
    const d = dateOf(e.at);
    const list = byDate.get(d) ?? [];
    list.push(e);
    byDate.set(d, list);
  }

  // Считаем серии по завершённым дням: от вчера назад.
  const streak: Record<BalanceIssue, number> = { lowProtein: 0, lowFiber: 0, highSugar: 0 };
  const open: Record<BalanceIssue, boolean> = { lowProtein: true, lowFiber: true, highSugar: !!goals.sugarMax };
  if (!goals.fiber) open.lowFiber = false;
  const sugarDays: string[] = [];

  for (let i = 1; i <= lookback; i++) {
    const day = addDays(today, -i);
    const entries = byDate.get(day);
    const t = entries ? totalOf(entries, catalog) : undefined;
    const complete = !!t && t.kcal >= goals.kcal * WEEKLY_THRESHOLDS.completeDay;
    const check = (issue: BalanceIssue, bad: boolean): void => {
      if (!open[issue]) return;
      if (complete && bad) streak[issue]++;
      else open[issue] = false;
    };
    check('lowProtein', !!t && t.protein < goals.protein * WEEKLY_THRESHOLDS.protein);
    check('lowFiber', !!t && (t.fiber ?? 0) < (goals.fiber ?? 0) * WEEKLY_THRESHOLDS.fiber);
    const wasOpen = open.highSugar;
    check('highSugar', !!t && (t.sugar ?? 0) > (goals.sugarMax ?? Infinity));
    if (wasOpen && open.highSugar) sugarDays.push(day);
  }

  const stats = buildHistory(input.history, today, 60);
  const mine = [...stats.sessionCount.keys()]
    .map((id) => catalog.get(id))
    .filter((p): p is Product => !!p && isSuggestable(p, settings));
  const freq = (p: Product): number => Math.log1p(stats.sessionCount.get(p.id) ?? 0);
  const portionOf = (p: Product): Portion => usualPortion(p, usualGrams(stats, p.id));

  const cards: WeeklyCard[] = [];

  if (streak.lowProtein >= minStreak) {
    // Плотность белка: граммы на 100 ккал. От 8 г — заметно белковый продукт.
    const picks = mine
      .filter((p) => p.per100.kcal > 0 && (p.per100.protein / p.per100.kcal) * 100 >= 8)
      .sort((a, b) => b.per100.protein * freq(b) - a.per100.protein * freq(a))
      .slice(0, 3);
    cards.push({
      id: `weekly:lowProtein:${today}`,
      issue: 'lowProtein',
      days: streak.lowProtein,
      message: `${streak.lowProtein} ${daysWord(streak.lowProtein)} подряд белка меньше нормы. Из того, что вы обычно едите, помогут:`,
      products: picks.map((p) => {
        const portion = portionOf(p);
        return { product: p, portion, why: `+${Math.round(portion.nutrients.protein)} г белка` };
      }),
    });
  }

  if (streak.lowFiber >= minStreak) {
    const picks = mine
      // Плотность клетчатки: от 1,5 г на 100 ккал (гречка, овощи, цельнозерновой хлеб — да, печенье — нет).
      .filter((p) => p.per100.kcal > 0 && ((p.per100.fiber ?? 0) / p.per100.kcal) * 100 >= 1.5)
      .sort((a, b) => (b.per100.fiber ?? 0) * freq(b) - (a.per100.fiber ?? 0) * freq(a))
      .slice(0, 3);
    cards.push({
      id: `weekly:lowFiber:${today}`,
      issue: 'lowFiber',
      days: streak.lowFiber,
      message: `${streak.lowFiber} ${daysWord(streak.lowFiber)} подряд мало клетчатки. Можно добавить:`,
      products: picks.map((p) => {
        const portion = portionOf(p);
        return { product: p, portion, why: `+${round1(portion.nutrients.fiber ?? 0)} г клетчатки` };
      }),
    });
  }

  if (streak.highSugar >= minStreak) {
    // Главный источник сахара за эти дни — чтобы подсказка была конкретной.
    const sugarBy = new Map<string, number>();
    for (const d of sugarDays) {
      for (const e of byDate.get(d) ?? []) {
        const p = catalog.get(e.productId);
        if (p) sugarBy.set(p.id, (sugarBy.get(p.id) ?? 0) + (scale(p.per100, e.grams).sugar ?? 0));
      }
    }
    const top = [...sugarBy].sort((a, b) => b[1] - a[1])[0];
    const source = top ? catalog.get(top[0]) : undefined;
    // Замена на перекус: из истории, мало сахара, обычно ем как перекус/завтрак.
    const picks = mine
      .filter((p) => p.id !== source?.id && (p.per100.sugar ?? 0) <= 5 && p.per100.kcal >= 40)
      .filter((p) => (stats.mealCount.get(p.id)?.get('snack') ?? 0) > 0 || p.meals?.includes('snack'))
      .sort((a, b) => freq(b) - freq(a))
      .slice(0, 3);
    cards.push({
      id: `weekly:highSugar:${today}`,
      issue: 'highSugar',
      days: streak.highSugar,
      message:
        `${streak.highSugar} ${daysWord(streak.highSugar)} подряд сахара больше нормы` +
        (source ? ` (больше всего — ${productTitle(source)})` : '') +
        '. На перекус можно взять:',
      products: picks.map((p) => {
        const portion = portionOf(p);
        return { product: p, portion, why: `${round1(portion.nutrients.sugar ?? 0)} г сахара` };
      }),
    });
  }

  return cards.filter((c) => c.products.length > 0).sort((a, b) => b.days - a.days);
}

function daysWord(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'день';
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'дня';
  return 'дней';
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
