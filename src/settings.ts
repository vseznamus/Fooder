import type { Product, SuggestionSettings } from './types.ts';

/** Можно ли вообще предлагать этот продукт. */
export function isAllowed(product: Product, settings: SuggestionSettings): boolean {
  return !settings.excludedProductIds.includes(product.id) && !settings.excludedCategories.includes(product.category);
}

/** Можно ли предложить продукт как отдельную еду (не исключён и не добавка вроде масла). */
export function isSuggestable(product: Product, settings: SuggestionSettings): boolean {
  return product.standalone !== false && isAllowed(product, settings);
}

/** Кнопка «не предлагать это». Возвращает новые настройки, исходные не меняет. */
export function dismissProduct(settings: SuggestionSettings, productId: string): SuggestionSettings {
  if (settings.excludedProductIds.includes(productId)) return settings;
  return { ...settings, excludedProductIds: [...settings.excludedProductIds, productId] };
}

export function excludeCategory(settings: SuggestionSettings, category: string): SuggestionSettings {
  if (settings.excludedCategories.includes(category)) return settings;
  return { ...settings, excludedCategories: [...settings.excludedCategories, category] };
}

/** Вернуть продукт или категорию из исключений. */
export function restore(settings: SuggestionSettings, idOrCategory: string): SuggestionSettings {
  return {
    ...settings,
    excludedProductIds: settings.excludedProductIds.filter((x) => x !== idOrCategory),
    excludedCategories: settings.excludedCategories.filter((x) => x !== idOrCategory),
  };
}

export function setEnabled(settings: SuggestionSettings, enabled: boolean): SuggestionSettings {
  return { ...settings, enabled };
}
