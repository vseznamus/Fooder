import type { Catalog, DiaryEntry, Goals, Nutrients } from './types.ts';

export const ZERO: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar: 0 };

export function scale(per100: Nutrients, grams: number): Nutrients {
  const k = grams / 100;
  return {
    kcal: per100.kcal * k,
    protein: per100.protein * k,
    fat: per100.fat * k,
    carbs: per100.carbs * k,
    fiber: (per100.fiber ?? 0) * k,
    sugar: (per100.sugar ?? 0) * k,
  };
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carbs: a.carbs + b.carbs,
    fiber: (a.fiber ?? 0) + (b.fiber ?? 0),
    sugar: (a.sugar ?? 0) + (b.sugar ?? 0),
  };
}

export function sum(list: Nutrients[]): Nutrients {
  return list.reduce(add, ZERO);
}

/** Сумма съеденного по записям. Записи с неизвестным продуктом пропускаются. */
export function totalOf(entries: DiaryEntry[], catalog: Catalog): Nutrients {
  let total = ZERO;
  for (const e of entries) {
    const p = catalog.get(e.productId);
    if (p) total = add(total, scale(p.per100, e.grams));
  }
  return total;
}

/** Остаток на день: норма − съеденное (может быть отрицательным). */
export function remaining(goals: Goals, eaten: Nutrients): Nutrients {
  return {
    kcal: goals.kcal - eaten.kcal,
    protein: goals.protein - eaten.protein,
    fat: goals.fat - eaten.fat,
    carbs: goals.carbs - eaten.carbs,
    fiber: (goals.fiber ?? 0) - (eaten.fiber ?? 0),
    sugar: (goals.sugarMax ?? 0) - (eaten.sugar ?? 0),
  };
}
