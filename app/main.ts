import {
  suggestTopUp,
  usualForMeal,
  oftenTogether,
  weeklyBalance,
  dismissProduct,
  excludeCategory,
  restore,
  setEnabled,
  portionOptions,
  usualPortion,
  gramPortionOf,
  productTitle,
  totalOf,
  mealByTime,
  median,
  type MealType,
  type Portion,
  type Product,
  type Nutrients,
} from './lib.ts';
import { addDays, dateOf } from '../src/time.ts';
import { CATEGORY_LABELS } from './catalog.ts';
import { catalogOf, DEFAULT_GOALS, load, newId, save, type AppState, type StoredEntry } from './store.ts';
import { demoHistory } from './demo.ts';

// ---------------------------------------------------------------------------
// Состояние

let state: AppState = load();
let catalog = catalogOf(state);
let selectedDate = today();
let query = '';

function commit(mutate: (s: AppState) => void): void {
  mutate(state);
  save(state);
  catalog = catalogOf(state);
  render();
}

// ---------------------------------------------------------------------------
// Время

function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function today(): string {
  return nowLocal().slice(0, 10);
}

const MEALS: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const MEAL_LABEL: Record<MealType, string> = { breakfast: 'Завтрак', lunch: 'Обед', snack: 'Перекус', dinner: 'Ужин' };
const MEAL_TIME: Record<MealType, string> = { breakfast: '08:00', lunch: '13:00', snack: '16:30', dinner: '19:30' };
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function dateTitle(date: string): string {
  const t = today();
  if (date === t) return 'Сегодня';
  if (date === addDays(t, -1)) return 'Вчера';
  if (date === addDays(t, 1)) return 'Завтра';
  const [y, m, d] = date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(y!, m! - 1, d!).getDay()];
  return `${d} ${MONTHS[m! - 1]}, ${wd}`;
}

/** Время новой записи: сейчас — для сегодняшнего дня, иначе обычное время приёма. */
function entryTime(meal: MealType): string {
  return selectedDate === today() ? nowLocal() : `${selectedDate}T${MEAL_TIME[meal]}`;
}

// ---------------------------------------------------------------------------
// DOM-помощники

type Child = Node | string | number | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const r0 = (x: number) => Math.round(x);
const kcalOf = (n: Nutrients) => `${r0(n.kcal)} ккал`;
const bju = (n: Nutrients) => `Б ${r0(n.protein)} · Ж ${r0(n.fat)} · У ${r0(n.carbs)}`;

let toastTimer = 0;
function toast(text: string, action?: { label: string; run: () => void }): void {
  document.querySelector('.toast')?.remove();
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', null, text),
    action &&
      h('button', {
        class: 'toast-action',
        onclick: () => {
          el.remove();
          action.run();
        },
      }, action.label),
  );
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 4000);
}

function openSheet(build: (close: () => void) => HTMLElement): void {
  document.querySelector('.toast')?.remove();
  const close = (): void => overlay.remove();
  const overlay = h('div', { class: 'overlay', onclick: (e: Event) => e.target === overlay && close() });
  overlay.append(h('div', { class: 'sheet' }, build(close)));
  document.body.append(overlay);
}

// ---------------------------------------------------------------------------
// Действия

function addEntries(items: { product: Product; portion: Portion }[], meal: MealType): void {
  const added: StoredEntry[] = items.map(({ product, portion }) => ({
    id: newId(),
    productId: product.id,
    grams: portion.grams,
    meal,
    at: entryTime(meal),
  }));
  commit((s) => s.entries.push(...added));
  const ids = new Set(added.map((e) => e.id));
  const what = items.length === 1 ? `${items[0]!.product.name}, ${items[0]!.portion.label}` : `${items.length} продукта`;
  toast(`Добавлено в «${MEAL_LABEL[meal]}»: ${what}`, {
    label: 'Отменить',
    run: () => commit((s) => (s.entries = s.entries.filter((e) => !ids.has(e.id)))),
  });
}

function dismiss(product: Product): void {
  commit((s) => (s.settings = dismissProduct(s.settings, product.id)));
  toast(`Больше не предлагаем: ${product.name}`, {
    label: 'Вернуть',
    run: () => commit((s) => (s.settings = restore(s.settings, product.id))),
  });
}

function portionSheet(product: Product, meal: MealType, entry?: StoredEntry): void {
  openSheet((close) => {
    const mine = state.entries.filter((e) => e.productId === product.id).map((e) => e.grams);
    const usual = entry?.grams ?? usualPortion(product, mine.length ? median(mine) : undefined).grams;
    const input = h('input', { type: 'number', inputmode: 'decimal', min: '1', value: String(usual), class: 'grams-input' });
    const preview = h('div', { class: 'preview' });
    const update = (): void => {
      const g = Number(input.value);
      const n = gramPortionOf(product, g > 0 ? g : 0).nutrients;
      preview.textContent = `${kcalOf(n)} · ${bju(n)}`;
    };
    input.addEventListener('input', update);
    update();

    const chips = portionOptions(product).slice(0, 6).map((p) =>
      h('button', {
        class: 'chip',
        onclick: () => {
          input.value = String(p.grams);
          update();
        },
      }, p.label),
    );

    const grams = (): number => Math.round(Number(input.value));
    return h(
      'div',
      null,
      h('h2', null, productTitle(product)),
      h('p', { class: 'muted' }, `на 100 г: ${kcalOf(product.per100)} · ${bju(product.per100)}`),
      h('div', { class: 'chips' }, chips),
      h('label', { class: 'grams' }, input, h('span', null, 'г')),
      preview,
      h(
        'div',
        { class: 'sheet-actions' },
        entry &&
          h('button', {
            class: 'btn danger',
            onclick: () => {
              close();
              commit((s) => (s.entries = s.entries.filter((e) => e.id !== entry.id)));
              toast(`Удалено: ${product.name}`, { label: 'Вернуть', run: () => commit((s) => s.entries.push(entry)) });
            },
          }, 'Удалить'),
        h('button', { class: 'btn', onclick: close }, 'Отмена'),
        h('button', {
          class: 'btn primary',
          onclick: () => {
            const g = grams();
            if (!(g > 0)) return input.focus();
            close();
            if (entry) commit(() => (entry.grams = g));
            else addEntries([{ product, portion: gramPortionOf(product, g) }], meal);
          },
        }, entry ? 'Сохранить' : 'Добавить'),
      ),
    );
  });
}

function customProductSheet(name: string, meal: MealType): void {
  openSheet((close) => {
    const field = (label: string, key: string, required = true) =>
      h('label', { class: 'field' }, h('span', null, label), h('input', { name: key, type: 'number', inputmode: 'decimal', min: '0', step: 'any', required }));
    const form = h(
      'form',
      {
        onsubmit: (e: Event) => {
          e.preventDefault();
          const fd = new FormData(form);
          const num = (k: string) => Number(String(fd.get(k) ?? '').replace(',', '.')) || 0;
          const title = String(fd.get('name') ?? '').trim();
          if (!title) return;
          const per100: Nutrients = { kcal: num('kcal'), protein: num('protein'), fat: num('fat'), carbs: num('carbs') };
          if (fd.get('fiber')) per100.fiber = num('fiber');
          if (fd.get('sugar')) per100.sugar = num('sugar');
          const product: Product = { id: newId('u'), name: title, category: 'custom', per100 };
          close();
          commit((s) => s.customProducts.push(product));
          portionSheet(product, meal);
        },
      },
      h('h2', null, 'Свой продукт'),
      h('label', { class: 'field wide' }, h('span', null, 'Название'), h('input', { name: 'name', value: name, required: true })),
      h('p', { class: 'muted' }, 'На 100 г:'),
      h('div', { class: 'fields' }, field('Ккал', 'kcal'), field('Белки, г', 'protein'), field('Жиры, г', 'fat'), field('Углеводы, г', 'carbs'), field('Клетчатка, г', 'fiber', false), field('Сахар, г', 'sugar', false)),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'btn', onclick: close }, 'Отмена'), h('button', { class: 'btn primary' }, 'Сохранить')),
    );
    return form;
  });
}

// ---------------------------------------------------------------------------
// Экран: дневник

function diaryView(): HTMLElement {
  const isToday = selectedDate === today();
  const dayEntries = state.entries.filter((e) => dateOf(e.at) === selectedDate);
  const eaten = totalOf(dayEntries, catalog);
  const g = state.goals;
  const left = g.kcal - eaten.kcal;

  const bar = (value: number, goal: number, cls = '') =>
    h('div', { class: `bar ${cls} ${value > goal ? 'over' : ''}` }, h('div', { style: `width:${Math.min(100, (value / goal) * 100)}%` }));

  const counter = h(
    'section',
    { class: 'card counter' },
    h('div', { class: 'counter-main' },
      h('div', null, h('span', { class: 'big' }, r0(eaten.kcal)), h('span', { class: 'muted' }, ` / ${g.kcal} ккал`)),
      h('div', { class: left < 0 ? 'left over-text' : 'left' }, left >= 0 ? `осталось ${r0(left)}` : `+${r0(-left)} сверх нормы`)),
    bar(eaten.kcal, g.kcal, 'thick'),
    h('div', { class: 'macros' },
      ...([['Белки', 'protein'], ['Жиры', 'fat'], ['Углеводы', 'carbs']] as const).map(([label, k]) =>
        h('div', { class: 'macro' }, h('div', { class: 'macro-label' }, h('span', null, label), h('span', { class: 'muted' }, `${r0(eaten[k])}/${g[k]} г`)), bar(eaten[k], g[k])),
      ),
    ),
  );

  const sections: HTMLElement[] = [counter];
  if (isToday) {
    const tu = topUpCard();
    if (tu) sections.push(tu);
    sections.push(...weeklyCards());
  }

  for (const meal of MEALS) {
    const list = dayEntries.filter((e) => e.meal === meal);
    const sum = totalOf(list, catalog);
    sections.push(
      h('section', { class: 'card meal' },
        h('div', { class: 'meal-head' },
          h('h3', null, MEAL_LABEL[meal]),
          h('span', { class: 'muted' }, list.length ? kcalOf(sum) : ''),
          h('button', { class: 'icon-btn add', 'aria-label': `Добавить в ${MEAL_LABEL[meal]}`, onclick: () => go(`#/add/${meal}`) }, '+')),
        list.map((e) => {
          const p = catalog.get(e.productId);
          if (!p) return null;
          const n = gramPortionOf(p, e.grams).nutrients;
          return h('button', { class: 'row', onclick: () => portionSheet(p, meal, e) },
            h('span', { class: 'row-title' }, p.name, h('span', { class: 'muted' }, ` · ${e.grams} г`)),
            h('span', { class: 'row-kcal' }, r0(n.kcal)));
        }),
      ),
    );
  }

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Предыдущий день', onclick: () => { selectedDate = addDays(selectedDate, -1); render(); } }, '‹'),
      h('button', { class: 'date-title', onclick: () => { selectedDate = today(); render(); } }, dateTitle(selectedDate)),
      h('button', { class: 'icon-btn', 'aria-label': 'Следующий день', onclick: () => { selectedDate = addDays(selectedDate, 1); render(); } }, '›'),
      h('button', { class: 'icon-btn gear', 'aria-label': 'Настройки', onclick: () => go('#/settings') }, '⚙')),
    sections);
}

function topUpCard(): HTMLElement | null {
  const now = nowLocal();
  const meal = mealByTime(now);
  const r = suggestTopUp({ goals: state.goals, history: state.entries, catalog, settings: state.settings, now, meal });
  if (r.kind === 'disabled') return null;

  const suggestionRow = (s: { product: Product; portion: Portion; text: string }) => {
    const [title, rest] = splitText(s.text);
    return h('div', { class: 'sugg' },
      h('div', { class: 'sugg-text' }, h('div', null, title), h('div', { class: 'muted small' }, rest)),
      h('button', { class: 'icon-btn add', 'aria-label': `Добавить ${s.product.name}`, onclick: () => addEntries([s], meal) }, '+'),
      h('button', { class: 'icon-btn ghost', 'aria-label': `Не предлагать ${s.product.name}`, title: 'Не предлагать это', onclick: () => dismiss(s.product) }, '×'));
  };

  if (r.kind === 'over') {
    return h('section', { class: 'card hint' },
      h('h3', null, 'Что добрать сегодня'),
      h('p', null, r.message),
      r.lowCalorie.map(suggestionRow));
  }

  return h('section', { class: 'card hint' },
    h('h3', null, 'Что добрать сегодня'),
    h('p', { class: 'muted small' }, r.summary),
    r.suggestions.length ? r.suggestions.map(suggestionRow) : h('p', null, 'Подходящих продуктов не нашлось — остаток почти закрыт.'),
    r.combos.length > 0 && h('h4', null, 'Или набором'),
    r.combos.map((c) => {
      const [title, rest] = splitText(c.text);
      return h('div', { class: 'sugg' },
        h('div', { class: 'sugg-text' }, h('div', null, title), h('div', { class: 'muted small' }, rest)),
        h('button', { class: 'btn small', onclick: () => addEntries(c.items, meal) }, 'Добавить всё'));
    }),
    h('p', { class: 'muted tiny' }, `Добавится в «${MEAL_LABEL[meal]}»`));
}

function weeklyCards(): HTMLElement[] {
  const now = nowLocal();
  const meal = mealByTime(now);
  return weeklyBalance({ history: state.entries, catalog, goals: state.goals, settings: state.settings, now }).map((c) =>
    h('section', { class: 'card soft' },
      h('p', null, c.message),
      h('div', { class: 'chips' }, c.products.map((p) =>
        h('button', { class: 'chip', onclick: () => addEntries([p], meal) }, `+ ${p.product.name}, ${p.portion.label}`, h('span', { class: 'muted' }, ` (${p.why})`))))));
}

function splitText(text: string): [string, string] {
  const i = text.indexOf(' — ');
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 3)];
}

// ---------------------------------------------------------------------------
// Экран: добавление продукта

function addView(meal: MealType): HTMLElement {
  const inMeal = state.entries.filter((e) => dateOf(e.at) === selectedDate && e.meal === meal);
  const inMealIds = [...new Set(inMeal.map((e) => e.productId))];
  const results = h('div', { class: 'results' });

  const search = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Поиск продукта',
    value: query,
    oninput: () => {
      query = search.value;
      fillResults();
    },
  });

  const fillResults = (): void => {
    results.replaceChildren(...(query.trim() ? searchResults(query, meal) : beforeSearch(meal, inMealIds)));
  };
  fillResults();

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Назад', onclick: () => history.back() }, '‹'),
      h('div', { class: 'date-title' }, `${MEAL_LABEL[meal]} · ${dateTitle(selectedDate).toLowerCase()}`)),
    h('div', { class: 'search-wrap' }, search),
    inMeal.length > 0 &&
      h('div', { class: 'in-meal muted small' }, 'Уже добавлено: ', inMeal.map((e) => catalog.get(e.productId)?.name).filter(Boolean).join(', ')),
    results);
}

function beforeSearch(meal: MealType, inMealIds: string[]): HTMLElement[] {
  const now = `${selectedDate}T${selectedDate === today() ? nowLocal().slice(11) : MEAL_TIME[meal]}`;
  const out: HTMLElement[] = [];
  const base = { history: state.entries, catalog, settings: state.settings, now, meal };

  const together = oftenTogether({ ...base, productIds: inMealIds });
  if (together.length) {
    const anchors = [...new Set(together.map((t) => t.with.name))].join(', ');
    out.push(h('section', { class: 'card' },
      h('h3', null, `Часто вместе с: ${anchors}`),
      together.map((t) => quickRow(t.product, t.portion, meal, `${t.together} раз вместе`))));
  }

  const usual = usualForMeal({ ...base, alreadyAdded: inMealIds });
  if (usual.products.length || usual.templates.length) {
    out.push(h('section', { class: 'card' },
      h('h3', null, `Обычно вы едите${usual.weekend ? ' по выходным' : ''}`),
      usual.templates
        .filter((t) => t.items.some((i) => !inMealIds.includes(i.product.id)))
        .slice(0, 2)
        .map((t) =>
          h('div', { class: 'sugg' },
            h('div', { class: 'sugg-text' }, h('div', null, t.title), h('div', { class: 'muted small' }, `${t.items.map((i) => i.portion.label).join(' + ')} · ${t.times} раз`)),
            h('button', { class: 'btn small', onclick: () => addEntries(t.items, meal) }, 'Набором'))),
      usual.products.map((u) => quickRow(u.product, u.portion, meal, `${u.times} раз`))));
  }

  if (!out.length) {
    out.push(h('p', { class: 'empty muted' }, state.settings.enabled
      ? 'Здесь появятся продукты, которые вы обычно едите на этот приём пищи. Пока начните с поиска.'
      : 'Подсказки выключены в настройках.'));
  }
  return out;
}

function quickRow(product: Product, portion: Portion, meal: MealType, note: string): HTMLElement {
  return h('div', { class: 'sugg' },
    h('button', { class: 'sugg-text link', onclick: () => portionSheet(product, meal) },
      h('div', null, product.name),
      h('div', { class: 'muted small' }, `${portion.label} · ${kcalOf(portion.nutrients)} · ${note}`)),
    h('button', { class: 'btn small', 'aria-label': `Добавить ${product.name}, ${portion.label}`, onclick: () => addEntries([{ product, portion }], meal) }, `+ ${portion.label}`));
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

function searchResults(q: string, meal: MealType): HTMLElement[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const found = [...catalog.values()]
    .filter((p) => {
      const name = norm(productTitle(p));
      return words.every((w) => name.includes(w));
    })
    .sort((a, b) => {
      const sa = norm(a.name).startsWith(words[0]!) ? 0 : 1;
      const sb = norm(b.name).startsWith(words[0]!) ? 0 : 1;
      return sa - sb || a.name.localeCompare(b.name, 'ru');
    })
    .slice(0, 40);

  return [
    h('section', { class: 'card' },
      found.length ? found.map((p) =>
        h('button', { class: 'row', onclick: () => portionSheet(p, meal) },
          h('span', { class: 'row-title' }, productTitle(p)),
          h('span', { class: 'muted small' }, `${r0(p.per100.kcal)} ккал/100 г`))) : h('p', { class: 'muted' }, 'Ничего не нашлось.'),
      h('button', { class: 'row create', onclick: () => customProductSheet(q.trim(), meal) }, `+ Создать свой продукт «${q.trim()}»`)),
  ];
}

// ---------------------------------------------------------------------------
// Экран: настройки

function settingsView(): HTMLElement {
  const g = state.goals;
  const goalField = (label: string, key: keyof typeof g) =>
    h('label', { class: 'field' }, h('span', null, label),
      h('input', {
        type: 'number', inputmode: 'numeric', min: '0', value: g[key] === undefined ? '' : String(g[key]),
        onchange: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value);
          commit((s) => {
            if (v > 0) s.goals[key] = v;
            else if (key === 'fiber' || key === 'sugarMax') delete s.goals[key];
            else s.goals[key] = DEFAULT_GOALS[key]!;
          });
        },
      }));

  const st = state.settings;
  const excludedProducts = st.excludedProductIds.map((id) => catalog.get(id)).filter((p): p is Product => !!p);
  const categorySelect = h('select', {
    onchange: (e: Event) => {
      const v = (e.target as HTMLSelectElement).value;
      if (v) commit((s) => (s.settings = excludeCategory(s.settings, v)));
    },
  }, h('option', { value: '' }, 'Исключить категорию…'),
    Object.entries(CATEGORY_LABELS).filter(([k]) => !st.excludedCategories.includes(k)).map(([k, label]) => h('option', { value: k }, label)));

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Назад', onclick: () => history.back() }, '‹'),
      h('div', { class: 'date-title' }, 'Настройки')),
    h('section', { class: 'card' },
      h('h3', null, 'Норма на день'),
      h('div', { class: 'fields' },
        goalField('Ккал', 'kcal'), goalField('Белки, г', 'protein'), goalField('Жиры, г', 'fat'), goalField('Углеводы, г', 'carbs'),
        goalField('Клетчатка, г', 'fiber'), goalField('Сахар, не больше, г', 'sugarMax'))),
    h('section', { class: 'card' },
      h('label', { class: 'switch-row' },
        h('span', null, 'Умные подсказки'),
        h('input', { type: 'checkbox', class: 'switch', checked: st.enabled, onchange: (e: Event) => commit((s) => (s.settings = setEnabled(s.settings, (e.target as HTMLInputElement).checked))) })),
      h('p', { class: 'muted small' }, 'Работают на телефоне, без интернета: только правила и ваша история.')),
    h('section', { class: 'card' },
      h('h3', null, 'Никогда не предлагать'),
      !excludedProducts.length && !st.excludedCategories.length && h('p', { class: 'muted small' }, 'Пусто. Нажмите «×» на любой подсказке, чтобы добавить сюда продукт.'),
      [...st.excludedCategories.map((c) => [c, `Категория: ${CATEGORY_LABELS[c] ?? c}`] as const), ...excludedProducts.map((p) => [p.id, p.name] as const)].map(([id, label]) =>
        h('div', { class: 'sugg' }, h('div', { class: 'sugg-text' }, label), h('button', { class: 'btn small', onclick: () => commit((s) => (s.settings = restore(s.settings, id))) }, 'Вернуть'))),
      categorySelect),
    h('section', { class: 'card' },
      h('h3', null, 'Данные'),
      h('p', { class: 'muted small' }, `Записей в дневнике: ${state.entries.length}. Данные хранятся только на этом телефоне.`),
      h('div', { class: 'stack' },
        h('button', {
          class: 'btn',
          onclick: () => {
            if (!confirm('Добавить пример истории за 45 дней? Ваши записи останутся.')) return;
            commit((s) => s.entries.push(...demoHistory(nowLocal())));
            toast('Пример истории добавлен');
          },
        }, 'Заполнить примером за 45 дней'),
        h('button', {
          class: 'btn danger',
          onclick: () => {
            if (!confirm('Удалить все записи дневника? Нормы и исключения сохранятся.')) return;
            commit((s) => (s.entries = []));
          },
        }, 'Удалить все записи'))),
    h('p', { class: 'muted tiny center' }, 'Fooder 0.1'));
}

// ---------------------------------------------------------------------------
// Роутинг

function go(hash: string): void {
  if (location.hash !== hash) location.hash = hash;
}

let lastRoute = '';
function render(): void {
  const route = location.hash || '#/';
  const sameRoute = route === lastRoute;
  const scroll = window.scrollY;
  const app = document.getElementById('app')!;
  const focused = document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'search';

  let view: HTMLElement;
  const add = /^#\/add\/(breakfast|lunch|dinner|snack)$/.exec(route);
  if (add) view = addView(add[1] as MealType);
  else if (route === '#/settings') view = settingsView();
  else view = diaryView();

  app.replaceChildren(view);
  if (sameRoute) window.scrollTo(0, scroll);
  else {
    window.scrollTo(0, 0);
    if (!add) query = '';
  }
  if (focused) (app.querySelector('input[type=search]') as HTMLInputElement | null)?.focus();
  lastRoute = route;
}

window.addEventListener('hashchange', () => {
  document.querySelector('.overlay')?.remove();
  render();
});
// Если приложение долго было в фоне — «сегодня» могло смениться.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});
render();
