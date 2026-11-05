import type { DiaryEntry, Goals, MealType, Product, SuggestionSettings } from '../src/types.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { addDays, isWeekend } from '../src/time.ts';

const glass: Product['units'] = [{ label: 'стакан', grams: 250, forms: ['стакан', 'стакана', 'стаканов'] }];
const pcs = (grams: number): Product['units'] => [{ label: 'шт.', grams }];

export const PRODUCTS: Product[] = [
  { id: 'tvorog5', name: 'Творог 5 %', brand: 'Савушкин', category: 'dairy', per100: { kcal: 121, protein: 17, fat: 5, carbs: 1.8, sugar: 1.8 }, meals: ['breakfast', 'snack'] },
  { id: 'chicken', name: 'Куриная грудка варёная', category: 'meat', per100: { kcal: 137, protein: 29.8, fat: 1.8, carbs: 0.5 }, meals: ['lunch', 'dinner'] },
  { id: 'buckwheat', name: 'Гречка варёная', category: 'grains', per100: { kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3, fiber: 2.7 }, meals: ['lunch', 'dinner'] },
  { id: 'cutlet', name: 'Котлета куриная', category: 'meat', per100: { kcal: 190, protein: 18, fat: 11, carbs: 6 }, units: pcs(80), meals: ['lunch', 'dinner'] },
  { id: 'oatmeal', name: 'Овсянка на воде', category: 'grains', per100: { kcal: 88, protein: 3, fat: 1.7, carbs: 15, fiber: 2 }, meals: ['breakfast'] },
  { id: 'banana', name: 'Банан', category: 'fruit', per100: { kcal: 96, protein: 1.5, fat: 0.5, carbs: 21, fiber: 1.7, sugar: 12 }, units: pcs(120), meals: ['breakfast', 'snack'] },
  { id: 'coffee', name: 'Кофе с молоком', category: 'drinks', per100: { kcal: 25, protein: 1.2, fat: 1, carbs: 2, sugar: 2 }, units: glass, meals: ['breakfast', 'snack'] },
  { id: 'egg', name: 'Яйцо куриное', category: 'eggs', per100: { kcal: 157, protein: 12.7, fat: 11.5, carbs: 0.7 }, units: pcs(55), meals: ['breakfast'] },
  { id: 'syrniki', name: 'Сырники', category: 'dairy', per100: { kcal: 220, protein: 13, fat: 10, carbs: 20, sugar: 8 }, units: pcs(60), meals: ['breakfast'] },
  { id: 'cheese', name: 'Сыр «Российский»', category: 'dairy', per100: { kcal: 360, protein: 23, fat: 29, carbs: 0 } },
  { id: 'nuts', name: 'Грецкие орехи', category: 'nuts', per100: { kcal: 654, protein: 15, fat: 65, carbs: 14, fiber: 6.7 }, meals: ['snack'] },
  { id: 'bread', name: 'Хлеб цельнозерновой', category: 'bakery', per100: { kcal: 250, protein: 9, fat: 3, carbs: 45, fiber: 7 }, units: [{ label: 'ломтик', grams: 30, forms: ['ломтик', 'ломтика', 'ломтиков'] }] },
  { id: 'cucumber', name: 'Огурец', category: 'vegetables', per100: { kcal: 15, protein: 0.8, fat: 0.1, carbs: 2.8, fiber: 1 }, units: pcs(120) },
  { id: 'tomato', name: 'Помидор', category: 'vegetables', per100: { kcal: 20, protein: 1, fat: 0.2, carbs: 3.7, fiber: 1.2 } },
  { id: 'broccoli', name: 'Брокколи', category: 'vegetables', per100: { kcal: 34, protein: 2.8, fat: 0.4, carbs: 6.6, fiber: 2.6 }, meals: ['lunch', 'dinner'] },
  { id: 'tea', name: 'Чай без сахара', category: 'drinks', per100: { kcal: 1, protein: 0, fat: 0, carbs: 0.2 }, units: glass },
  { id: 'water', name: 'Вода', category: 'drinks', per100: { kcal: 0, protein: 0, fat: 0, carbs: 0 }, units: glass },
  { id: 'kefir', name: 'Кефир 2,5 %', category: 'dairy', per100: { kcal: 53, protein: 3, fat: 2.5, carbs: 4, sugar: 4 }, units: glass, meals: ['snack', 'dinner'] },
  { id: 'cookie', name: 'Печенье овсяное', category: 'sweets', per100: { kcal: 450, protein: 6, fat: 17, carbs: 70, sugar: 30 }, meals: ['snack'] },
  { id: 'rice', name: 'Рис варёный', category: 'grains', per100: { kcal: 116, protein: 2.2, fat: 0.5, carbs: 25 }, meals: ['lunch', 'dinner'] },
  { id: 'pasta', name: 'Макароны варёные', category: 'grains', per100: { kcal: 112, protein: 3.5, fat: 0.4, carbs: 23 }, meals: ['lunch', 'dinner'] },
  { id: 'salmon', name: 'Лосось запечённый', category: 'fish', per100: { kcal: 208, protein: 20, fat: 13, carbs: 0 }, meals: ['lunch', 'dinner'] },
  { id: 'yogurt', name: 'Йогурт греческий 2 %', category: 'dairy', per100: { kcal: 66, protein: 9, fat: 2, carbs: 3.6, sugar: 3.6 }, units: pcs(140), meals: ['breakfast', 'snack'] },
  { id: 'apple', name: 'Яблоко', category: 'fruit', per100: { kcal: 47, protein: 0.4, fat: 0.4, carbs: 9.8, fiber: 1.8, sugar: 10 }, units: pcs(150), meals: ['snack'] },
  // Только в общей базе — в моей истории их нет.
  { id: 'shrimp', name: 'Креветки варёные', category: 'seafood', per100: { kcal: 95, protein: 20, fat: 1.5, carbs: 0 } },
  { id: 'lentils', name: 'Чечевица варёная', category: 'legumes', per100: { kcal: 116, protein: 9, fat: 0.4, carbs: 20, fiber: 8 } },
  { id: 'turkey', name: 'Филе индейки', category: 'meat', per100: { kcal: 114, protein: 24, fat: 1.5, carbs: 0 } },
  // «Сводный» продукт для тестов: ровно столько уже съедено к этому моменту (100 г = весь день).
  { id: 'dayBefore', name: 'Съедено ранее', category: 'test', per100: { kcal: 1400, protein: 75, fat: 65, carbs: 140 } },
];

export const CATALOG: ReadonlyMap<string, Product> = new Map(PRODUCTS.map((p) => [p.id, p]));
/** База без тестового «сводного» продукта — для сценариев, где он не нужен. */
export const BASE_CATALOG: ReadonlyMap<string, Product> = new Map(PRODUCTS.filter((p) => p.id !== 'dayBefore').map((p) => [p.id, p]));

export const GOALS: Goals = { kcal: 2000, protein: 120, fat: 70, carbs: 230, fiber: 28, sugarMax: 50 };

/** Четверг. */
export const TODAY = '2026-11-05';
export const SATURDAY = '2026-11-07';

export const settings = (over: Partial<SuggestionSettings> = {}): SuggestionSettings => ({ ...DEFAULT_SETTINGS, ...over });

const e = (date: string, time: string, meal: MealType, productId: string, grams: number): DiaryEntry => ({
  productId,
  grams,
  meal,
  at: `${date}T${time}`,
});

/**
 * Типичная история за `days` дней до `today` (не включая сегодня):
 *  - будни, завтрак 7:30 — овсянка 250 г + банан + кофе с молоком;
 *  - выходные, завтрак 10:00 — сырники 3 шт. + кофе;
 *  - обед — курица + рис + огурец (по выходным — макароны с сыром);
 *  - перекус — то творог, то яблоко, иногда печенье;
 *  - ужин 19:30 — гречка + 2 котлеты, каждый третий день — лосось с брокколи.
 */
export function typicalHistory(today = TODAY, days = 45): DiaryEntry[] {
  const out: DiaryEntry[] = [];
  for (let i = days; i >= 1; i--) {
    const d = addDays(today, -i);
    if (isWeekend(d)) {
      out.push(e(d, '10:00', 'breakfast', 'syrniki', 180), e(d, '10:05', 'breakfast', 'coffee', 250));
      out.push(e(d, '14:30', 'lunch', 'pasta', 250), e(d, '14:30', 'lunch', 'cheese', 30));
    } else {
      out.push(
        e(d, '07:30', 'breakfast', 'oatmeal', i % 4 === 0 ? 300 : 250),
        e(d, '07:30', 'breakfast', 'banana', 120),
        e(d, '07:35', 'breakfast', 'coffee', 250),
      );
      out.push(e(d, '13:00', 'lunch', 'chicken', 150), e(d, '13:00', 'lunch', 'rice', 200), e(d, '13:00', 'lunch', 'cucumber', 120));
    }
    if (i % 2 === 0) out.push(e(d, '16:30', 'snack', 'tvorog5', 200));
    else if (i % 5 === 0) out.push(e(d, '16:30', 'snack', 'cookie', 60));
    else out.push(e(d, '16:30', 'snack', 'apple', 150));
    if (i % 7 === 3) out.push(e(d, '17:00', 'snack', 'yogurt', 140));

    if (i % 3 === 0) out.push(e(d, '19:30', 'dinner', 'salmon', 150), e(d, '19:30', 'dinner', 'broccoli', 200));
    else out.push(e(d, '19:30', 'dinner', 'buckwheat', 200), e(d, '19:30', 'dinner', 'cutlet', 160));
  }
  return out;
}

export { e as entry };
