/**
 * «Обычно вы едите» и «Часто вместе с …» — для экрана добавления продукта, до поиска.
 */
import type { Catalog, DiaryEntry, MealType, Portion, Product, SuggestionSettings } from './types.ts';
import { buildHistory, median, usualGrams, type HistoryStats, type MealSession } from './history.ts';
import { usualPortion } from './portion.ts';
import { isAllowed } from './settings.ts';
import { dateOf, isWeekend, mealByTime, minuteDistance, minuteOfDay } from './time.ts';

export interface UsualInput {
  history: DiaryEntry[];
  catalog: Catalog;
  settings: SuggestionSettings;
  now: string;
  meal?: MealType;
  /** Что уже добавлено в текущий приём — это не показываем. */
  alreadyAdded?: string[];
  limit?: number;
  historyDays?: number;
}

export interface UsualItem {
  product: Product;
  /** Обычная порция — медиана по истории. Добавляется одним касанием. */
  portion: Portion;
  /** В скольких похожих приёмах встречался. */
  times: number;
  score: number;
}

export interface MealTemplate {
  /** «Овсянка + Банан + Кофе с молоком» */
  title: string;
  items: { product: Product; portion: Portion }[];
  times: number;
  score: number;
}

export interface UsualResult {
  meal: MealType;
  weekend: boolean;
  products: UsualItem[];
  templates: MealTemplate[];
}

/** Параметры похожести «сессии из прошлого» на текущий момент. */
export const USUAL_TUNING = {
  /** Полураспад давности, дней: позавчерашний завтрак важнее месячной давности. */
  halfLifeDays: 21,
  /** Вес приёма из «другого» типа дня (будни ↔ выходные). */
  otherDayType: 0.35,
  /** Ширина окна по времени суток, минут (σ гауссианы). */
  timeSigma: 90,
  /** Минимальный вес по времени, чтобы ранний/поздний завтрак не пропадал совсем. */
  timeFloor: 0.25,
};

export function sessionWeight(s: MealSession, weekend: boolean, minute: number): number {
  const t = USUAL_TUNING;
  const recency = Math.pow(0.5, s.ageDays / t.halfLifeDays);
  const dayType = s.weekend === weekend ? 1 : t.otherDayType;
  const d = minuteDistance(s.minute, minute) / t.timeSigma;
  const time = Math.max(t.timeFloor, Math.exp(-(d * d) / 2));
  return recency * dayType * time;
}

export function usualForMeal(input: UsualInput): UsualResult {
  const meal = input.meal ?? mealByTime(input.now);
  const today = dateOf(input.now);
  const weekend = isWeekend(today);
  const empty: UsualResult = { meal, weekend, products: [], templates: [] };
  if (!input.settings.enabled) return empty;

  const stats = buildHistory(input.history, today, input.historyDays ?? 90);
  const minute = minuteOfDay(input.now);
  const skip = new Set(input.alreadyAdded ?? []);
  const allowed = (id: string): Product | undefined => {
    const p = input.catalog.get(id);
    return p && isAllowed(p, input.settings) ? p : undefined;
  };

  // Сегодняшняя сессия этого приёма — это «то, что уже добавлено», а не история.
  const sessions = stats.sessions.filter((s) => s.meal === meal && !(s.date === today));

  const score = new Map<string, number>();
  const times = new Map<string, number>();
  const templates = new Map<string, { ids: string[]; score: number; times: number; grams: Map<string, number[]> }>();

  for (const s of sessions) {
    const w = sessionWeight(s, weekend, minute);
    for (const id of s.grams.keys()) {
      score.set(id, (score.get(id) ?? 0) + w);
      times.set(id, (times.get(id) ?? 0) + 1);
    }
    if (s.grams.size >= 2) {
      const ids = [...s.grams.keys()].sort();
      const key = ids.join('+');
      let t = templates.get(key);
      if (!t) templates.set(key, (t = { ids, score: 0, times: 0, grams: new Map() }));
      t.score += w;
      t.times += 1;
      for (const [id, g] of s.grams) {
        const list = t.grams.get(id) ?? [];
        list.push(g);
        t.grams.set(id, list);
      }
    }
  }

  const limit = input.limit ?? 6;
  const products: UsualItem[] = [];
  for (const [id, sc] of [...score].sort((a, b) => b[1] - a[1])) {
    if (skip.has(id)) continue;
    const product = allowed(id);
    if (!product) continue;
    products.push({ product, portion: usualPortion(product, usualGrams(stats, id, meal)), times: times.get(id)!, score: sc });
    if (products.length >= limit) break;
  }

  const tpl: MealTemplate[] = [];
  for (const t of [...templates.values()].sort((a, b) => b.score - a.score)) {
    // Шаблон — то, что повторялось хотя бы дважды.
    if (t.times < 2) continue;
    const items = t.ids.map((id) => allowed(id));
    if (items.some((p) => !p)) continue; // в шаблоне есть исключённый продукт — не предлагаем целиком
    const list = (items as Product[]).map((product) => ({ product, portion: usualPortion(product, median(t.grams.get(product.id)!)) }));
    tpl.push({ title: list.map((x) => x.product.name).join(' + '), items: list, times: t.times, score: t.score });
    if (tpl.length >= 3) break;
  }

  return { meal, weekend, products, templates: tpl };
}

// ---------------------------------------------------------------------------
// Связки «Часто вместе с …»

export interface TogetherInput {
  history: DiaryEntry[];
  catalog: Catalog;
  settings: SuggestionSettings;
  now: string;
  /** Продукты, уже добавленные в текущий приём (например, гречка). */
  productIds: string[];
  /** Если задан — считаем связки только внутри этого приёма пищи. */
  meal?: MealType;
  limit?: number;
  historyDays?: number;
}

export interface TogetherItem {
  product: Product;
  portion: Portion;
  /** С каким из добавленных продуктов связка. */
  with: Product;
  /** Сколько раз ели вместе. */
  together: number;
  /** Доля приёмов с `with`, где был и этот продукт (0..1). */
  confidence: number;
}

/** Минимум совместных появлений и доля, чтобы связка считалась «обычной». */
export const TOGETHER_MIN_TIMES = 2;
export const TOGETHER_MIN_CONFIDENCE = 0.3;

export function oftenTogether(input: TogetherInput): TogetherItem[] {
  if (!input.settings.enabled || !input.productIds.length) return [];
  const today = dateOf(input.now);
  const stats = buildHistory(input.history, today, input.historyDays ?? 90);
  const added = new Set(input.productIds);
  const best = new Map<string, TogetherItem>();

  for (const anchorId of added) {
    const anchor = input.catalog.get(anchorId);
    if (!anchor) continue;
    const { withAnchor, co } = cooccurrence(stats, anchorId, input.meal, today);
    if (!withAnchor) continue;
    for (const [id, together] of co) {
      if (added.has(id) || together < TOGETHER_MIN_TIMES) continue;
      const confidence = together / withAnchor;
      if (confidence < TOGETHER_MIN_CONFIDENCE) continue;
      const product = input.catalog.get(id);
      if (!product || !isAllowed(product, input.settings)) continue;
      const prev = best.get(id);
      if (prev && prev.confidence >= confidence) continue;
      best.set(id, {
        product,
        portion: usualPortion(product, usualGrams(stats, id, input.meal)),
        with: anchor,
        together,
        confidence,
      });
    }
  }

  return [...best.values()]
    .sort((a, b) => b.confidence - a.confidence || b.together - a.together)
    .slice(0, input.limit ?? 4);
}

/** Сколько раз каждый продукт встречался в одном приёме пищи с `anchorId`. */
export function cooccurrence(
  stats: HistoryStats,
  anchorId: string,
  meal?: MealType,
  excludeDate?: string,
): { withAnchor: number; co: Map<string, number> } {
  let withAnchor = 0;
  const co = new Map<string, number>();
  for (const s of stats.sessions) {
    if ((meal && s.meal !== meal) || s.date === excludeDate || !s.grams.has(anchorId)) continue;
    withAnchor++;
    for (const id of s.grams.keys()) if (id !== anchorId) co.set(id, (co.get(id) ?? 0) + 1);
  }
  return { withAnchor, co };
}
