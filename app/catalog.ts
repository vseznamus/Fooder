import type { Product } from '../src/index.ts';
import data from './catalog.data.json' with { type: 'json' };

/**
 * База продуктов. Пищевая ценность — только из первичных источников
 * (USDA FoodData Central, Open Food Facts), см. data/catalog.json и scripts/build-catalog.mjs.
 */

export interface ProductSource {
  kind: 'usda' | 'off' | 'custom';
  /** «USDA SR Legacy», «Open Food Facts», «Свой продукт». */
  label: string;
  /** Номер записи USDA (fdc_id). */
  id?: number;
  /** Описание записи USDA или «медиана N этикеток». */
  title?: string;
  /** Сколько этикеток OFF вошло в медиану. */
  n?: number;
  codes?: string[];
  url?: string;
}

export type CatalogProduct = Product & { source?: ProductSource };

export const BASE_PRODUCTS: CatalogProduct[] = data.products as CatalogProduct[];
export const SOURCES = data.sources;

/** Подписи категорий — для экрана исключений. */
export const CATEGORY_LABELS: Record<string, string> = {
  dairy: 'Молочное',
  eggs: 'Яйца',
  meat: 'Мясо и птица',
  fish: 'Рыба и морепродукты',
  grains: 'Крупы и гарниры',
  legumes: 'Бобовые',
  bakery: 'Хлеб и выпечка',
  vegetables: 'Овощи',
  fruit: 'Фрукты и ягоды',
  nuts: 'Орехи',
  drinks: 'Напитки',
  sweets: 'Сладкое',
  fats: 'Масла и соусы',
  dishes: 'Готовые блюда',
  sports: 'Спортпит',
  custom: 'Свои продукты',
};

/** Строка «откуда цифры» для экрана продукта. */
export function sourceText(p: CatalogProduct): string {
  const s = p.source;
  if (!s) return 'Свой продукт — значения введены вами';
  if (s.kind === 'usda') return `${s.label}, запись #${s.id}: ${s.title}`;
  if (s.kind === 'off') return `Open Food Facts: медиана ${s.n} этикеток российских товаров`;
  return s.label;
}
