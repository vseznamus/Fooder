/**
 * «Что добрать сегодня»: что съесть, чтобы закрыть остаток дня по калориям и БЖУ.
 */
import type { Catalog, DiaryEntry, Goals, Macro, MealType, Nutrients, Portion, Product, SuggestionSettings } from './types.ts';
import { MACROS } from './types.ts';
import { remaining, totalOf, add, ZERO } from './nutrition.ts';
import { buildHistory, mealShare, usualGrams, type HistoryStats } from './history.ts';
import { portionOptions, usualPortion } from './portion.ts';
import { isAllowed } from './settings.ts';
import { dateOf, mealByTime } from './time.ts';

export interface TopUpInput {
  goals: Goals;
  /** Вся история дневника, включая сегодняшние записи. */
  history: DiaryEntry[];
  catalog: Catalog;
  settings: SuggestionSettings;
  /** Текущее локальное время 'YYYY-MM-DDTHH:mm'. */
  now: string;
  /** Текущий приём пищи; если не задан — определяется по времени. */
  meal?: MealType;
  /** Сколько одиночных вариантов показать (3–5). */
  limit?: number;
  /** Окно истории для кандидатов, дней. */
  historyDays?: number;
}

export interface Focus {
  /** Главный дефицит — что в первую очередь надо добрать. null — только калории. */
  main: Macro | null;
  /** Макросы, по которым остаток почти исчерпан или превышен. */
  tight: Macro[];
}

export interface Suggestion {
  product: Product;
  portion: Portion;
  score: number;
  fromHistory: boolean;
  /** Сколько ккал останется после этой порции. */
  leftKcal: number;
  /** «Творог 5 % «Савушкин», 200 г — +34 г белка, 242 ккал, останется 358 ккал» */
  text: string;
}

export interface Combo {
  items: { product: Product; portion: Portion }[];
  total: Nutrients;
  leftKcal: number;
  score: number;
  text: string;
}

export type TopUpResult =
  | { kind: 'disabled' }
  | {
      /** Норма калорий уже превышена — еду не предлагаем. */
      kind: 'over';
      remaining: Nutrients;
      message: string;
      /** Почти без калорий: овощи, чай, вода. */
      lowCalorie: Suggestion[];
    }
  | {
      kind: 'ok';
      remaining: Nutrients;
      focus: Focus;
      /** «Осталось 600 ккал, белка не хватает 45 г, жиров почти лимит → нужен белковый продукт с минимумом жиров» */
      summary: string;
      suggestions: Suggestion[];
      combos: Combo[];
    };

/** Веса формулы оценки — вынесены, чтобы их было легко подкрутить. */
export const WEIGHTS = {
  /** Насколько порция закрывает главный дефицит (0..1). */
  cover: 1,
  /** Превышение остатка по неглавным макросам, в долях нормы. */
  overMacro: 4,
  /** Перебор по главному макросу (взяли больше, чем нужно) — мягче. */
  overMain: 1,
  /** Порция съедает заметно больше остатка калорий, чем закрывает дефицита. */
  kcalWaste: 0.4,
  /** Как часто я ем продукт (0..1, логарифмически). */
  frequency: 0.25,
  /** Подходит к текущему приёму пищи. */
  mealFit: 0.15,
  /** Уже ел этот продукт сегодня. */
  eatenToday: 0.3,
};

const MIN_DEFICIT: Record<Macro, number> = { protein: 10, fat: 5, carbs: 15 };
/** Белок добрать сложнее всего, поэтому при равных долях он «главнее». */
const PRIORITY: Record<Macro, number> = { protein: 1.2, carbs: 1, fat: 0.9 };
const TIGHT_SHARE = 0.1;
const MIN_SCORE = 0.25;
/** Одиночный вариант должен закрывать хотя бы 30 % главного дефицита — иначе это не «добор». */
const MIN_COVER = 0.3;
const COMBO_POOL = 30;
/**
 * Одна порция не должна «закрывать весь день»: утром, когда съедено 0 ккал,
 * разумная цель — около 40 % дневной нормы, а не 120 г белка за раз.
 */
const MEAL_SHARE_CAP = 0.4;
/** Совсем лёгкое: вода, чай (на 100 г). */
const FREE_KCAL_PER100 = 5;
/** Лёгкие овощи и т.п. (на 100 г). */
const LOW_KCAL_PER100 = 40;
const LOW_KCAL_CATEGORIES = ['vegetables', 'greens'];

const GEN: Record<Macro, string> = { protein: 'белка', fat: 'жиров', carbs: 'углеводов' };
const NEED: Record<Macro, string> = {
  protein: 'нужен белковый продукт',
  carbs: 'нужен источник углеводов',
  fat: 'нужен источник жиров',
};

export function suggestTopUp(input: TopUpInput): TopUpResult {
  const { goals, catalog, settings, now } = input;
  if (!settings.enabled) return { kind: 'disabled' };

  const today = dateOf(now);
  const meal = input.meal ?? mealByTime(now);
  const limit = Math.min(5, Math.max(3, input.limit ?? 5));
  const todayEntries = input.history.filter((e) => dateOf(e.at) === today);
  const rem = remaining(goals, totalOf(todayEntries, catalog));
  const stats = buildHistory(input.history, today, input.historyDays ?? 60);
  const eatenToday = new Set(todayEntries.map((e) => e.productId));

  const allowed = (id: string): Product | undefined => {
    const p = catalog.get(id);
    return p && isAllowed(p, settings) ? p : undefined;
  };

  if (rem.kcal <= 0) {
    return {
      kind: 'over',
      remaining: rem,
      message:
        `Норма калорий на сегодня уже набрана (+${Math.round(-rem.kcal)} ккал). ` +
        'Ничего страшного — один день ничего не решает. Если хочется чего-то ещё, вот самое лёгкое:',
      lowCalorie: lowCalorieOptions(catalog, stats, allowed, rem, meal),
    };
  }

  const focus = findFocus(goals, rem);
  const budgetKcal = Math.min(rem.kcal, goals.kcal * MEAL_SHARE_CAP);
  const need = focus.main ? Math.min(rem[focus.main], goals[focus.main] * MEAL_SHARE_CAP) : budgetKcal;
  const ctx: EvalCtx = { goals, rem, focus, stats, meal, eatenToday, need, budgetKcal };

  // 1. Сначала — продукты из моей истории за 60 дней.
  const historyIds = [...stats.sessionCount.keys()];
  const fromHistory = rankCandidates(historyIds, allowed, ctx, true);
  // 2. Общая база — только чтобы добрать недостающее.
  const historySet = new Set(historyIds);
  let fromBase: Suggestion[] | undefined;
  const base = (): Suggestion[] =>
    (fromBase ??= rankCandidates(
      [...catalog.keys()].filter((id) => !historySet.has(id)),
      allowed,
      ctx,
      false,
    ));

  const useful = (s: Suggestion): boolean => s.score >= MIN_SCORE && coverOf(s, ctx) >= MIN_COVER;
  const suggestions = fromHistory.filter(useful).slice(0, limit);
  if (suggestions.length < limit) {
    suggestions.push(...base().filter(useful).slice(0, limit - suggestions.length));
  }

  // Для комбинаций нужны и «дополняющие» продукты (гарнир к белку), поэтому
  // берём всю историю по убыванию оценки, а общую базу — только если истории мало.
  let pool = fromHistory.slice(0, COMBO_POOL);
  if (pool.length < COMBO_POOL) pool = pool.concat(base().slice(0, COMBO_POOL - pool.length));

  return {
    kind: 'ok',
    remaining: rem,
    focus,
    summary: summarize(rem, focus),
    suggestions,
    combos: findCombos(pool, ctx),
  };
}

// ---------------------------------------------------------------------------
// Главный дефицит

export function findFocus(goals: Goals, rem: Nutrients): Focus {
  const tight = MACROS.filter((m) => rem[m] <= goals[m] * TIGHT_SHARE);
  let main: Macro | null = null;
  let best = 0;
  for (const m of MACROS) {
    if (tight.includes(m) || rem[m] < MIN_DEFICIT[m]) continue;
    const share = (rem[m] / goals[m]) * PRIORITY[m];
    if (share > best) {
      best = share;
      main = m;
    }
  }
  return { main, tight };
}

function summarize(rem: Nutrients, focus: Focus): string {
  const parts = [`Осталось ${Math.round(rem.kcal)} ккал`];
  if (focus.main) parts.push(`${GEN[focus.main]} не хватает ${Math.round(rem[focus.main])} г`);
  for (const m of focus.tight) parts.push(rem[m] < 0 ? `${GEN[m]} уже больше нормы` : `${GEN[m]} почти лимит`);
  let need = focus.main ? NEED[focus.main] : 'подойдёт что-то лёгкое в пределах остатка';
  if (focus.main && focus.tight.length) need += ` с минимумом ${focus.tight.map((m) => GEN[m]).join(' и ')}`;
  return `${parts.join(', ')} → ${need}`;
}

// ---------------------------------------------------------------------------
// Оценка кандидата

interface EvalCtx {
  goals: Goals;
  rem: Nutrients;
  focus: Focus;
  stats: HistoryStats;
  meal: MealType;
  eatenToday: Set<string>;
  /** Сколько главного макроса (или ккал, если главного нет) имеет смысл добрать за один приём. */
  need: number;
  /** Калорийный бюджет одного приёма. */
  budgetKcal: number;
}

/** Оценка «продукт + порция» по формуле из ТЗ. Порция, не влезающая в остаток калорий, — null. */
export function scorePortion(product: Product, portion: Portion, ctx: EvalCtx): number | null {
  const { goals, rem, focus, stats } = ctx;
  const n = portion.nutrients;
  if (n.kcal > rem.kcal) return null;

  // + насколько порция закрывает главный дефицит (в пределах одного приёма)
  const main = focus.main;
  const got = main ? n[main] : n.kcal;
  const cover = Math.min(got / ctx.need, 1);

  // − превышение остатка по остальным макросам (в долях дневной нормы)
  let overMacro = 0;
  for (const m of MACROS) {
    if (m === main) continue;
    overMacro += Math.max(0, n[m] - Math.max(rem[m], 0)) / goals[m];
  }
  const overMain = main ? Math.max(0, n[main] - ctx.need) / goals[main] : 0;
  // − порция тратит долю калорий заметно бóльшую, чем доля закрытого дефицита
  //   (и мягко — если выходит за «бюджет одного приёма»)
  const kcalWaste = (main ? Math.max(0, n.kcal / ctx.budgetKcal - cover) : 0) +
    Math.max(0, n.kcal - ctx.budgetKcal) / goals.kcal;

  // + частота, + подходит к приёму пищи, − уже ел сегодня
  const count = stats.sessionCount.get(product.id) ?? 0;
  const freq = stats.maxSessionCount > 0 ? Math.log1p(count) / Math.log1p(stats.maxSessionCount) : 0;
  const mealFit = mealFitOf(product, ctx);
  const eaten = ctx.eatenToday.has(product.id) ? 1 : 0;

  return (
    WEIGHTS.cover * cover -
    WEIGHTS.overMacro * overMacro -
    WEIGHTS.overMain * overMain -
    WEIGHTS.kcalWaste * kcalWaste +
    WEIGHTS.frequency * freq +
    WEIGHTS.mealFit * mealFit -
    WEIGHTS.eatenToday * eaten
  );
}

function coverOf(s: Suggestion, ctx: EvalCtx): number {
  const n = s.portion.nutrients;
  return Math.min(1, (ctx.focus.main ? n[ctx.focus.main] : n.kcal) / ctx.need);
}

/** 0..1: насколько продукт «про этот приём пищи» — по моей истории или по разметке продукта. */
function mealFitOf(product: Product, ctx: EvalCtx): number {
  const share = mealShare(ctx.stats, product.id, ctx.meal);
  return Math.max(Math.min(1, share * 2), product.meals?.includes(ctx.meal) ? 0.8 : 0);
}

function rankCandidates(
  ids: string[],
  allowed: (id: string) => Product | undefined,
  ctx: EvalCtx,
  fromHistory: boolean,
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const id of ids) {
    const product = allowed(id);
    if (!product) continue;
    let best: { portion: Portion; score: number } | undefined;
    for (const portion of portionOptions(product, usualGrams(ctx.stats, id, ctx.meal))) {
      const score = scorePortion(product, portion, ctx);
      if (score === null) continue;
      // При равной оценке — меньшая порция (варианты идут по возрастанию).
      if (!best || score > best.score + 1e-9) best = { portion, score };
    }
    if (best) out.push(makeSuggestion(product, best.portion, best.score, fromHistory, ctx));
  }
  return out.sort((a, b) => b.score - a.score);
}

function makeSuggestion(product: Product, portion: Portion, score: number, fromHistory: boolean, ctx: EvalCtx): Suggestion {
  const n = portion.nutrients;
  const leftKcal = ctx.rem.kcal - n.kcal;
  const main = ctx.focus.main;
  const gain = main ? `+${Math.round(n[main])} г ${GEN[main]}, ` : '';
  return {
    product,
    portion,
    score,
    fromHistory,
    leftKcal,
    text: `${productTitle(product)}, ${portion.label} — ${gain}${Math.round(n.kcal)} ккал, останется ${Math.round(leftKcal)} ккал`,
  };
}

export function productTitle(p: Product): string {
  return p.brand ? `${p.name} «${p.brand}»` : p.name;
}

// ---------------------------------------------------------------------------
// Комбинации из 2–3 продуктов

interface ComboItem {
  s: Suggestion;
  options: { portion: Portion; v: [number, number, number, number] }[];
}

const COMBO_MIN_KCAL = 150;
/** Больше ~1000 ккал тремя продуктами «в ноль» не закрыть разумно — это уже несколько приёмов. */
const COMBO_MAX_KCAL = 1000;
/** Комбинация должна закрыть остаток калорий хотя бы на 85 % и не превысить его. */
const COMBO_MIN_FILL = 0.85;
const COMBO_MAX = 3;

function findCombos(pool: Suggestion[], ctx: EvalCtx): Combo[] {
  const { rem, goals } = ctx;
  if (rem.kcal < COMBO_MIN_KCAL || rem.kcal > COMBO_MAX_KCAL || pool.length < 2) return [];

  const target = [rem.kcal, rem.protein, rem.fat, rem.carbs].map((x) => Math.max(0, x));
  const norm = [goals.kcal, goals.protein, goals.fat, goals.carbs];
  const w = [2, ctx.focus.main === 'protein' ? 2 : 1.2, 1, 1];

  const items: ComboItem[] = pool.map((s) => ({
    s,
    options: portionOptions(s.product, usualGrams(ctx.stats, s.product.id, ctx.meal))
      .filter((p) => p.nutrients.kcal <= rem.kcal)
      .map((portion) => {
        const n = portion.nutrients;
        return { portion, v: [n.kcal, n.protein, n.fat, n.carbs] as [number, number, number, number] };
      }),
  }));

  const found: { idx: number[]; opt: number[]; err: number }[] = [];
  const sumV = [0, 0, 0, 0];

  const evaluate = (idx: number[], opt: number[]): void => {
    if (sumV[0]! > target[0]! + 1e-6 || sumV[0]! < target[0]! * COMBO_MIN_FILL) return;
    let err = 0;
    for (let k = 0; k < 4; k++) {
      const d = sumV[k]! - target[k]!;
      err += (w[k]! * Math.abs(d) * (d > 0 ? 2 : 1)) / norm[k]!;
    }
    // Небольшие предпочтения: продукты из истории, подходящие к приёму пищи,
    // разные категории, меньше позиций, не то, что уже ел сегодня.
    const cats = new Set<string>();
    for (const i of idx) {
      const s = items[i]!.s;
      if (s.fromHistory) err -= 0.06;
      err -= 0.06 * mealFitOf(s.product, ctx);
      if (ctx.eatenToday.has(s.product.id)) err += 0.1;
      if (cats.has(s.product.category)) err += 0.05;
      cats.add(s.product.category);
    }
    err += 0.03 * (idx.length - 2);
    found.push({ idx: [...idx], opt: [...opt], err });
    // Держим в памяти только лучшие варианты.
    if (found.length > 400) {
      found.sort((a, b) => a.err - b.err);
      found.length = 100;
    }
  };

  const idx: number[] = [];
  const opt: number[] = [];
  const dfs = (start: number): void => {
    if (idx.length >= 2) evaluate(idx, opt);
    if (idx.length === COMBO_MAX) return;
    for (let i = start; i < items.length; i++) {
      const options = items[i]!.options;
      for (let o = 0; o < options.length; o++) {
        const v = options[o]!.v;
        if (sumV[0]! + v[0] > target[0]!) break; // варианты отсортированы по граммам → по ккал
        for (let k = 0; k < 4; k++) sumV[k]! += v[k]!;
        idx.push(i);
        opt.push(o);
        dfs(i + 1);
        idx.pop();
        opt.pop();
        for (let k = 0; k < 4; k++) sumV[k]! -= v[k]!;
      }
    }
  };
  dfs(0);

  found.sort((a, b) => a.err - b.err);
  const chosen: typeof found = [];
  for (const f of found) {
    // Разнообразие: не больше одного общего продукта с уже выбранными комбинациями.
    if (chosen.some((c) => c.idx.filter((i) => f.idx.includes(i)).length > 1)) continue;
    chosen.push(f);
    if (chosen.length === 3) break;
  }

  return chosen.map((f) => {
    const list = f.idx.map((i, j) => ({ product: items[i]!.s.product, portion: items[i]!.options[f.opt[j]!]!.portion }));
    const total = list.reduce((acc, x) => add(acc, x.portion.nutrients), ZERO);
    const leftKcal = rem.kcal - total.kcal;
    return {
      items: list,
      total,
      leftKcal,
      score: -f.err,
      text:
        list.map((x) => `${productTitle(x.product)} ${x.portion.label}`).join(' + ') +
        ` — ${Math.round(total.kcal)} ккал, Б ${Math.round(total.protein)} г, Ж ${Math.round(total.fat)} г, ` +
        `У ${Math.round(total.carbs)} г, останется ${Math.round(leftKcal)} ккал`,
    };
  });
}

// ---------------------------------------------------------------------------
// Норма превышена: только почти бескалорийное

function lowCalorieOptions(
  catalog: Catalog,
  stats: HistoryStats,
  allowed: (id: string) => Product | undefined,
  rem: Nutrients,
  meal: MealType,
): Suggestion[] {
  const count = (p: Product): number => stats.sessionCount.get(p.id) ?? 0;
  // Сначала то, что я обычно пью/ем, потом — самое лёгкое.
  const byHabit = (a: Product, b: Product): number => count(b) - count(a) || a.per100.kcal - b.per100.kcal;
  const all = [...catalog.keys()].map(allowed).filter((p): p is Product => !!p);

  const free = all.filter((p) => p.per100.kcal <= FREE_KCAL_PER100).sort(byHabit).slice(0, 1);
  const veg = all
    .filter((p) => LOW_KCAL_CATEGORIES.includes(p.category) && p.per100.kcal <= LOW_KCAL_PER100)
    .sort(byHabit)
    .slice(0, 2);
  const picked = [...free, ...veg];
  // Если вода/овощи исключены — любое лёгкое, но не больше 3.
  if (picked.length < 3) {
    const rest = all.filter((p) => p.per100.kcal <= LOW_KCAL_PER100 && !picked.includes(p)).sort(byHabit);
    picked.push(...rest.slice(0, 3 - picked.length));
  }

  return picked.map((p) => {
    const portion = usualPortion(p, usualGrams(stats, p.id, meal) ?? 150);
    return {
      product: p,
      portion,
      score: 0,
      fromHistory: stats.sessionCount.has(p.id),
      leftKcal: rem.kcal - portion.nutrients.kcal,
      text: `${productTitle(p)}, ${portion.label} — ${Math.round(portion.nutrients.kcal)} ккал`,
    };
  });
}
