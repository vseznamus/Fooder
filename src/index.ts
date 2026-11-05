/**
 * Умные подсказки для дневника питания.
 * Работают локально: только правила и история пользователя, без сети и без ИИ.
 *
 * Где показывать:
 *  - главный экран дневника, под счётчиком  → suggestTopUp()      «Что добрать сегодня»
 *                                           → weeklyBalance()     карточка недельного баланса
 *  - экран добавления продукта, до поиска  → usualForMeal()      «Обычно вы едите»
 *                                           → oftenTogether()     «Часто вместе с …»
 */
export * from './types.ts';
export { suggestTopUp, findFocus, scorePortion, productTitle, WEIGHTS } from './topUp.ts';
export type { TopUpInput, TopUpResult, Suggestion, Combo, Focus } from './topUp.ts';
export { usualForMeal, oftenTogether, cooccurrence, sessionWeight, USUAL_TUNING } from './usual.ts';
export type { UsualInput, UsualResult, UsualItem, MealTemplate, TogetherInput, TogetherItem } from './usual.ts';
export { weeklyBalance, WEEKLY_THRESHOLDS } from './weekly.ts';
export type { WeeklyCard, WeeklyInput, BalanceIssue } from './weekly.ts';
export { isAllowed, isSuggestable, dismissProduct, excludeCategory, restore, setEnabled } from './settings.ts';
export { buildHistory, usualGrams, median } from './history.ts';
export { portionOptions, usualPortion, roundNice, pluralRu } from './portion.ts';
export { scale, sum, totalOf, remaining } from './nutrition.ts';
export { mealByTime, isWeekend } from './time.ts';

import type { DiaryEntry, Portion, Product, MealType } from './types.ts';

/** «Добавить одним касанием»: готовая запись дневника из подсказки. */
export function toEntry(product: Product, portion: Portion, meal: MealType, at: string): DiaryEntry {
  return { productId: product.id, grams: portion.grams, meal, at };
}
