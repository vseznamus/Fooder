/** Пищевая ценность. В продукте — на 100 г, в записи дневника — на порцию. */
export interface Nutrients {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  /** Клетчатка, г (необязательно — не во всех базах есть). */
  fiber?: number;
  /** Сахар, г. */
  sugar?: number;
}

export type Macro = 'protein' | 'fat' | 'carbs';
export const MACROS: readonly Macro[] = ['protein', 'fat', 'carbs'];

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Удобная единица порции: «1 шт.» = 60 г, «1 стакан» = 250 г. */
export interface PortionUnit {
  /** Например «шт.», «стакан», «ломтик». */
  label: string;
  grams: number;
  /** Формы для 1 / 2–4 / 5+: ['стакан', 'стакана', 'стаканов']. Без них label не склоняется. */
  forms?: [string, string, string];
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  /** Категория для исключений и фолбэков: 'dairy', 'meat', 'vegetables', 'drinks', … */
  category: string;
  per100: Nutrients;
  units?: PortionUnit[];
  /** К каким приёмам пищи продукт подходит «по умолчанию» (когда истории мало). */
  meals?: MealType[];
  /**
   * false — это добавка, а не еда сама по себе (масло, майонез, сахар, мёд).
   * В «Что добрать», наборах и недельном балансе такие продукты не предлагаются.
   */
  standalone?: boolean;
}

export interface DiaryEntry {
  productId: string;
  grams: number;
  meal: MealType;
  /** Локальное время приёма: 'YYYY-MM-DDTHH:mm' (секунды/зона допускаются, но игнорируются). */
  at: string;
}

export interface Goals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  /** Норма клетчатки, г — для недельного баланса. */
  fiber?: number;
  /** Верхний предел сахара, г/день. */
  sugarMax?: number;
}

export interface SuggestionSettings {
  /** Общий выключатель подсказок. */
  enabled: boolean;
  /** Продукты, которые никогда не предлагать (сюда же пишет кнопка «не предлагать это»). */
  excludedProductIds: string[];
  /** Категории, которые никогда не предлагать. */
  excludedCategories: string[];
}

export const DEFAULT_SETTINGS: SuggestionSettings = {
  enabled: true,
  excludedProductIds: [],
  excludedCategories: [],
};

/** Каталог продуктов: общая база + всё, что встречается в истории. */
export type Catalog = ReadonlyMap<string, Product>;

/** Конкретная порция: сколько граммов и как это показать человеку. */
export interface Portion {
  grams: number;
  /** «200 г», «1 шт.», «2 шт.», «1 стакан». */
  label: string;
  nutrients: Nutrients;
}
