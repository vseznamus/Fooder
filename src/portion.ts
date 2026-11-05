import type { Portion, PortionUnit, Product } from './types.ts';
import { scale } from './nutrition.ts';

const GRAM_STEPS = [50, 100, 150, 200, 250, 300];
/** Для калорийных продуктов (орехи, сыр, печенье) 50 г — уже много, а 300 г — нереально. */
const DENSE_STEPS = [20, 30, 50, 100];
const DENSE_KCAL = 350;

/**
 * Варианты порций, из которых подсказка выбирает подходящую.
 * Если у продукта есть штучная единица («шт.», «стакан») — предлагаем 1–3 единицы:
 * «2 яйца» понятнее, чем «110 г». Иначе — граммы удобными шагами.
 * Обычная порция пользователя (медиана) добавляется, округлённая до 50 г.
 */
export function portionOptions(product: Product, usual?: number): Portion[] {
  const unit = product.units?.[0];
  if (unit) {
    const maxCount = unit.grams <= 70 ? 3 : 2;
    const out: Portion[] = [];
    for (let n = 1; n <= maxCount; n++) out.push(unitPortion(product, unit, n));
    return out;
  }

  const dense = product.per100.kcal >= DENSE_KCAL;
  const grams = new Set(dense ? DENSE_STEPS : GRAM_STEPS);
  if (usual && usual > 0) grams.add(roundNice(usual));
  return [...grams].sort((a, b) => a - b).map((g) => gramPortion(product, g));
}

/** Порция «как обычно» для добавления одним касанием: медиана, округлённая до 5 г. */
export function usualPortion(product: Product, usual?: number): Portion {
  const unit = product.units?.[0];
  if (unit) {
    const n = usual ? Math.max(1, Math.round(usual / unit.grams)) : 1;
    return unitPortion(product, unit, n);
  }
  const g = usual && usual > 0 ? Math.max(5, Math.round(usual / 5) * 5) : 100;
  return gramPortion(product, g);
}

export function gramPortion(product: Product, grams: number): Portion {
  return { grams, label: `${grams} г`, nutrients: scale(product.per100, grams) };
}

export function unitPortion(product: Product, unit: PortionUnit, count: number): Portion {
  const grams = unit.grams * count;
  return { grams, label: `${count} ${unitLabel(unit, count)}`, nutrients: scale(product.per100, grams) };
}

/** Удобное округление: до 10 г для маленьких порций, до 50 г для обычных. */
export function roundNice(g: number): number {
  if (g < 100) return Math.max(10, Math.round(g / 10) * 10);
  return Math.round(g / 50) * 50;
}

function unitLabel(unit: PortionUnit, n: number): string {
  if (!unit.forms) return unit.label;
  return pluralRu(n, unit.forms);
}

/** Русская множественная форма: 1 стакан, 2 стакана, 5 стаканов. */
export function pluralRu(n: number, [one, few, many]: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}
