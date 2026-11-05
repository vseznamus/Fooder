import type { MealType, Nutrients, PortionUnit, Product } from '../src/index.ts';

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
  soups: 'Супы',
  dishes: 'Готовые блюда',
  sports: 'Спортпит',
  custom: 'Свои продукты',
};

const pcs = (grams: number): PortionUnit[] => [{ label: 'шт.', grams }];
const glass: PortionUnit[] = [{ label: 'стакан', grams: 250, forms: ['стакан', 'стакана', 'стаканов'] }];
const cup: PortionUnit[] = [{ label: 'чашка', grams: 250, forms: ['чашка', 'чашки', 'чашек'] }];
const slice = (grams: number): PortionUnit[] => [{ label: 'ломтик', grams, forms: ['ломтик', 'ломтика', 'ломтиков'] }];
const spoon = (grams: number): PortionUnit[] => [{ label: 'ложка', grams, forms: ['ложка', 'ложки', 'ложек'] }];
const plate: PortionUnit[] = [{ label: 'тарелка', grams: 300, forms: ['тарелка', 'тарелки', 'тарелок'] }];
const piece = (grams: number): PortionUnit[] => [{ label: 'кусок', grams, forms: ['кусок', 'куска', 'кусков'] }];

const B: MealType = 'breakfast';
const L: MealType = 'lunch';
const D: MealType = 'dinner';
const S: MealType = 'snack';

type Row = [id: string, name: string, category: string, kcal: number, p: number, f: number, c: number, extra?: { fiber?: number; sugar?: number; units?: PortionUnit[]; meals?: MealType[]; brand?: string; addon?: boolean }];

// Пищевая ценность на 100 г, по усреднённым справочным данным.
const ROWS: Row[] = [
  ['tvorog0', 'Творог 0 %', 'dairy', 71, 16.5, 0.2, 1.3, { sugar: 1.3, meals: [B, S] }],
  ['tvorog5', 'Творог 5 %', 'dairy', 121, 17, 5, 1.8, { sugar: 1.8, meals: [B, S] }],
  ['tvorog9', 'Творог 9 %', 'dairy', 159, 16.7, 9, 2, { sugar: 2, meals: [B, S] }],
  ['milk', 'Молоко 2,5 %', 'dairy', 52, 2.8, 2.5, 4.7, { sugar: 4.7, units: glass, meals: [B, S] }],
  ['kefir1', 'Кефир 1 %', 'dairy', 40, 3, 1, 4, { sugar: 4, units: glass, meals: [S, D] }],
  ['kefir25', 'Кефир 2,5 %', 'dairy', 53, 3, 2.5, 4, { sugar: 4, units: glass, meals: [S, D] }],
  ['yogurtGreek', 'Йогурт греческий 2 %', 'dairy', 66, 9, 2, 3.6, { sugar: 3.6, units: pcs(140), meals: [B, S] }],
  ['yogurtFruit', 'Йогурт фруктовый 2,5 %', 'dairy', 85, 2.8, 2.5, 12.5, { sugar: 12, units: pcs(125), meals: [B, S] }],
  ['sourCream', 'Сметана 15 %', 'dairy', 160, 2.6, 15, 3, { addon: true, sugar: 3, units: spoon(20) }],
  ['cheese', 'Сыр «Российский»', 'dairy', 360, 23, 29, 0, { units: slice(20), meals: [B, S] }],
  ['mozzarella', 'Моцарелла', 'dairy', 254, 18, 20, 2, {}],
  ['syrniki', 'Сырники', 'dairy', 220, 13, 10, 20, { sugar: 8, units: pcs(60), meals: [B] }],

  ['egg', 'Яйцо куриное', 'eggs', 157, 12.7, 11.5, 0.7, { units: pcs(55), meals: [B] }],
  ['omelet', 'Омлет', 'eggs', 184, 9.6, 15.4, 1.9, { meals: [B] }],

  ['chicken', 'Куриная грудка варёная', 'meat', 137, 29.8, 1.8, 0.5, { meals: [L, D] }],
  ['chickenThigh', 'Куриное бедро запечённое', 'meat', 190, 24, 10, 0, { meals: [L, D] }],
  ['turkey', 'Филе индейки запечённое', 'meat', 130, 25, 3, 0, { meals: [L, D] }],
  ['beef', 'Говядина тушёная', 'meat', 232, 25, 15, 0, { meals: [L, D] }],
  ['pork', 'Свинина запечённая', 'meat', 260, 22, 19, 0, { meals: [L, D] }],
  ['cutletChicken', 'Котлета куриная', 'meat', 190, 18, 11, 6, { units: pcs(80), meals: [L, D] }],
  ['cutletBeef', 'Котлета говяжья', 'meat', 220, 16, 14, 8, { units: pcs(80), meals: [L, D] }],
  ['sausages', 'Сосиски молочные', 'meat', 266, 11, 24, 1.6, { units: pcs(50), meals: [B, D] }],
  ['ham', 'Ветчина', 'meat', 145, 17, 8, 1, { units: slice(20), meals: [B] }],
  ['pelmeni', 'Пельмени', 'meat', 248, 11, 12, 24, { meals: [L, D] }],

  ['salmon', 'Лосось запечённый', 'fish', 208, 20, 13, 0, { meals: [L, D] }],
  ['cod', 'Треска запечённая', 'fish', 105, 23, 1, 0, { meals: [L, D] }],
  ['tuna', 'Тунец в собственном соку', 'fish', 96, 21, 1, 0, { meals: [L, D] }],
  ['shrimp', 'Креветки варёные', 'fish', 95, 20, 1.5, 0, { meals: [L, D] }],

  ['buckwheat', 'Гречка варёная', 'grains', 110, 4.2, 1.1, 21.3, { fiber: 2.7, meals: [L, D] }],
  ['rice', 'Рис варёный', 'grains', 116, 2.2, 0.5, 25, { fiber: 0.4, meals: [L, D] }],
  ['oatmeal', 'Овсянка на воде', 'grains', 88, 3, 1.7, 15, { fiber: 2, meals: [B] }],
  ['oatmealMilk', 'Овсянка на молоке', 'grains', 140, 4.8, 4.5, 20, { fiber: 1.8, sugar: 5, meals: [B] }],
  ['pasta', 'Макароны варёные', 'grains', 112, 3.5, 0.4, 23, { fiber: 1.2, meals: [L, D] }],
  ['bulgur', 'Булгур варёный', 'grains', 83, 3, 0.2, 19, { fiber: 4.5, meals: [L, D] }],
  ['potato', 'Картофель варёный', 'grains', 82, 2, 0.4, 16.7, { fiber: 1.5, meals: [L, D] }],
  ['mash', 'Картофельное пюре', 'grains', 106, 2.5, 4.2, 14.7, { fiber: 1.2, meals: [L, D] }],
  ['friedPotato', 'Картофель жареный', 'grains', 192, 2.8, 9.5, 23.4, { fiber: 2, meals: [L, D] }],
  ['granola', 'Гранола', 'grains', 450, 10, 18, 64, { fiber: 7, sugar: 20, meals: [B] }],

  ['lentils', 'Чечевица варёная', 'legumes', 116, 9, 0.4, 20, { fiber: 8, meals: [L, D] }],
  ['chickpeas', 'Нут варёный', 'legumes', 164, 8.9, 2.6, 27, { fiber: 7.6, meals: [L, D] }],
  ['beans', 'Фасоль красная варёная', 'legumes', 127, 8.7, 0.5, 22.8, { fiber: 6.4, meals: [L, D] }],
  ['hummus', 'Хумус', 'legumes', 166, 7.9, 9.6, 14.3, { fiber: 6, units: spoon(30), meals: [S] }],

  ['breadWhole', 'Хлеб цельнозерновой', 'bakery', 250, 9, 3, 45, { fiber: 7, units: slice(30) }],
  ['breadWhite', 'Батон', 'bakery', 262, 7.5, 2.9, 51, { fiber: 2.3, sugar: 4, units: slice(30) }],
  ['breadRye', 'Хлеб ржаной', 'bakery', 210, 6.6, 1.2, 42, { fiber: 6, units: slice(30) }],
  ['lavash', 'Лаваш', 'bakery', 275, 9, 1, 56, { fiber: 2.2 }],
  ['crispbread', 'Хлебцы цельнозерновые', 'bakery', 300, 11, 3, 57, { fiber: 11, units: pcs(10), meals: [B, S] }],
  ['pancakes', 'Блины', 'bakery', 230, 6, 10, 29, { sugar: 5, units: pcs(50), meals: [B] }],

  ['cucumber', 'Огурец', 'vegetables', 15, 0.8, 0.1, 2.8, { fiber: 1, units: pcs(120) }],
  ['tomato', 'Помидор', 'vegetables', 20, 1, 0.2, 3.7, { fiber: 1.2, sugar: 2.6, units: pcs(120) }],
  ['broccoli', 'Брокколи', 'vegetables', 34, 2.8, 0.4, 6.6, { fiber: 2.6, meals: [L, D] }],
  ['cabbage', 'Капуста белокочанная', 'vegetables', 27, 1.8, 0.1, 4.7, { fiber: 2 }],
  ['carrot', 'Морковь', 'vegetables', 35, 1.3, 0.1, 6.9, { fiber: 2.4, sugar: 4.7, units: pcs(80) }],
  ['pepper', 'Перец болгарский', 'vegetables', 26, 1.3, 0.1, 5.3, { fiber: 1.9, sugar: 4, units: pcs(150) }],
  ['lettuce', 'Салат листовой', 'vegetables', 14, 1.2, 0.3, 1.3, { fiber: 1.2 }],
  ['zucchini', 'Кабачок', 'vegetables', 24, 0.6, 0.3, 4.6, { fiber: 1 }],
  ['beet', 'Свёкла варёная', 'vegetables', 49, 1.8, 0, 10.8, { fiber: 2.5, sugar: 8 }],
  ['vegSalad', 'Салат из огурцов и помидоров с маслом', 'dishes', 80, 0.9, 6.5, 4, { fiber: 1.2, meals: [L, D] }],

  ['banana', 'Банан', 'fruit', 96, 1.5, 0.5, 21, { fiber: 1.7, sugar: 12, units: pcs(120), meals: [B, S] }],
  ['apple', 'Яблоко', 'fruit', 47, 0.4, 0.4, 9.8, { fiber: 1.8, sugar: 10, units: pcs(150), meals: [S] }],
  ['orange', 'Апельсин', 'fruit', 43, 0.9, 0.2, 8.1, { fiber: 2.2, sugar: 8, units: pcs(160), meals: [S] }],
  ['pear', 'Груша', 'fruit', 47, 0.4, 0.3, 10.3, { fiber: 2.8, sugar: 9.8, units: pcs(170), meals: [S] }],
  ['tangerine', 'Мандарин', 'fruit', 38, 0.8, 0.2, 7.5, { fiber: 1.8, sugar: 7, units: pcs(70), meals: [S] }],
  ['strawberry', 'Клубника', 'fruit', 33, 0.7, 0.3, 7.7, { fiber: 2, sugar: 4.9, meals: [B, S] }],
  ['grapes', 'Виноград', 'fruit', 72, 0.6, 0.6, 15.4, { fiber: 0.9, sugar: 15, meals: [S] }],
  ['driedApricot', 'Курага', 'fruit', 215, 5.2, 0.3, 51, { fiber: 7, sugar: 48, meals: [S] }],

  ['walnuts', 'Грецкие орехи', 'nuts', 654, 15, 65, 14, { fiber: 6.7, sugar: 2.6, meals: [S] }],
  ['almonds', 'Миндаль', 'nuts', 609, 18.6, 53.7, 13, { fiber: 7, sugar: 4, meals: [S] }],
  ['peanutButter', 'Арахисовая паста', 'nuts', 588, 25, 50, 20, { fiber: 6, sugar: 9, units: spoon(15), meals: [B, S] }],

  ['water', 'Вода', 'drinks', 0, 0, 0, 0, { units: glass }],
  ['tea', 'Чай без сахара', 'drinks', 1, 0, 0, 0.2, { units: cup }],
  ['coffee', 'Кофе чёрный', 'drinks', 2, 0.2, 0, 0.3, { units: cup }],
  ['coffeeMilk', 'Кофе с молоком', 'drinks', 25, 1.2, 1, 2, { sugar: 2, units: cup, meals: [B, S] }],
  ['cappuccino', 'Капучино', 'drinks', 37, 2, 2, 3, { sugar: 3, units: cup, meals: [B, S] }],
  ['juice', 'Сок апельсиновый', 'drinks', 45, 0.7, 0.1, 10, { sugar: 9, units: glass, meals: [B] }],
  ['cola', 'Кола', 'drinks', 42, 0, 0, 10.6, { sugar: 10.6, units: glass }],

  ['cookie', 'Печенье овсяное', 'sweets', 450, 6, 17, 70, { sugar: 30, fiber: 2.5, units: pcs(15), meals: [S] }],
  ['chocoDark', 'Шоколад горький', 'sweets', 540, 6.2, 35.4, 48, { sugar: 30, fiber: 7, meals: [S] }],
  ['chocoMilk', 'Шоколад молочный', 'sweets', 550, 7, 32, 57, { sugar: 50, meals: [S] }],
  ['honey', 'Мёд', 'sweets', 304, 0.3, 0, 82, { addon: true, sugar: 82, units: spoon(12) }],
  ['sugar', 'Сахар', 'sweets', 398, 0, 0, 99.8, { addon: true, sugar: 99.8, units: [{ label: 'ч. л.', grams: 5 }] }],
  ['icecream', 'Мороженое пломбир', 'sweets', 230, 3.2, 15, 20, { sugar: 20, units: pcs(80), meals: [S] }],

  ['oil', 'Масло подсолнечное', 'fats', 899, 0, 99.9, 0, { addon: true, units: spoon(15) }],
  ['butter', 'Масло сливочное 82 %', 'fats', 748, 0.5, 82.5, 0.8, { addon: true }],
  ['mayo', 'Майонез 67 %', 'fats', 624, 0.4, 67, 2.6, { addon: true, units: spoon(15) }],
  ['ketchup', 'Кетчуп', 'fats', 93, 1.8, 1, 22, { addon: true, sugar: 20, units: spoon(15) }],

  ['borscht', 'Борщ', 'soups', 49, 1.1, 2.2, 6.7, { fiber: 1.2, units: plate, meals: [L] }],
  ['chickenSoup', 'Суп куриный с лапшой', 'soups', 45, 3, 1.6, 5, { units: plate, meals: [L] }],
  ['plov', 'Плов с курицей', 'dishes', 150, 8, 5, 19, { fiber: 0.8, meals: [L, D] }],
  ['caesar', 'Салат «Цезарь» с курицей', 'dishes', 190, 10, 14, 6, { fiber: 1, meals: [L, D] }],
  ['pizza', 'Пицца «Маргарита»', 'dishes', 250, 11, 9, 31, { fiber: 2, units: piece(120), meals: [L, D] }],
  ['shawarma', 'Шаурма с курицей', 'dishes', 210, 10, 11, 18, { fiber: 1.5, units: pcs(300), meals: [L, D] }],

  ['proteinBar', 'Протеиновый батончик', 'sports', 350, 30, 10, 35, { sugar: 5, fiber: 5, units: pcs(50), meals: [S] }],
];

export const BASE_PRODUCTS: Product[] = ROWS.map(([id, name, category, kcal, protein, fat, carbs, x = {}]) => {
  const per100: Nutrients = { kcal, protein, fat, carbs };
  if (x.fiber !== undefined) per100.fiber = x.fiber;
  if (x.sugar !== undefined) per100.sugar = x.sugar;
  const p: Product = { id, name, category, per100 };
  if (x.units) p.units = x.units;
  if (x.meals) p.meals = x.meals;
  if (x.brand) p.brand = x.brand;
  if (x.addon) p.standalone = false;
  return p;
});
