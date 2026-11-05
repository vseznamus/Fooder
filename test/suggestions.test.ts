import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  suggestTopUp,
  usualForMeal,
  oftenTogether,
  weeklyBalance,
  dismissProduct,
  excludeCategory,
  portionOptions,
  usualPortion,
  type TopUpResult,
  type DiaryEntry,
} from '../src/index.ts';
import { BASE_CATALOG, CATALOG, GOALS, SATURDAY, TODAY, entry, settings, typicalHistory } from './fixtures.ts';
import { addDays } from '../src/time.ts';

/** Вечер, съедено 1400 ккал / Б 75 / Ж 65 / У 140 → осталось 600 ккал, белка −45 г, жиров 5 г. */
function proteinDeficitDay(): DiaryEntry[] {
  return [...typicalHistory(), entry(TODAY, '14:00', 'lunch', 'dayBefore', 100)];
}

function assertOk(r: TopUpResult): asserts r is Extract<TopUpResult, { kind: 'ok' }> {
  assert.equal(r.kind, 'ok', `ожидали kind=ok, получили ${r.kind}`);
}

describe('1. Дефицит белка', () => {
  const r = suggestTopUp({ goals: GOALS, history: proteinDeficitDay(), catalog: CATALOG, settings: settings(), now: `${TODAY}T18:30` });

  it('находит главный дефицит и лимит по жирам', () => {
    assertOk(r);
    assert.equal(Math.round(r.remaining.kcal), 600);
    assert.equal(r.focus.main, 'protein');
    assert.deepEqual(r.focus.tight, ['fat']);
    assert.equal(r.summary, 'Осталось 600 ккал, белка не хватает 45 г, жиров почти лимит → нужен белковый продукт с минимумом жиров');
  });

  it('первым предлагает белковый продукт почти без жиров и укладывается в остаток', () => {
    assertOk(r);
    assert.ok(r.suggestions.length >= 3 && r.suggestions.length <= 5);
    const top = r.suggestions[0]!;
    assert.equal(top.product.id, 'chicken');
    assert.ok(top.portion.nutrients.protein >= 40);
    assert.ok(top.portion.nutrients.fat <= 5);
    for (const s of r.suggestions) {
      assert.ok(s.portion.nutrients.kcal <= r.remaining.kcal, `${s.text} не влезает в остаток`);
    }
    // Жирное (орехи, сыр, лосось) при лимите жиров не предлагаем.
    const ids = r.suggestions.map((s) => s.product.id);
    for (const fatty of ['nuts', 'cheese', 'salmon', 'cookie']) assert.ok(!ids.includes(fatty), fatty);
  });

  it('пишет пояснение в формате «продукт, порция — +белок, ккал, останется»', () => {
    assertOk(r);
    const tvorog = r.suggestions.find((s) => s.product.id === 'tvorog5');
    assert.ok(tvorog, 'творог должен быть среди вариантов');
    assert.match(tvorog.text, /^Творог 5 % «Савушкин», \d+ г — \+\d+ г белка, \d+ ккал, останется \d+ ккал$/);
    assert.equal(r.suggestions[0]!.text, 'Куриная грудка варёная, 150 г — +45 г белка, 206 ккал, останется 395 ккал');
  });

  it('сначала продукты из моей истории, общая база — только в конце', () => {
    assertOk(r);
    assert.equal(r.suggestions[0]!.fromHistory, true);
    const firstBase = r.suggestions.findIndex((s) => !s.fromHistory);
    if (firstBase >= 0) assert.ok(r.suggestions.slice(firstBase).every((s) => !s.fromHistory));
  });

  it('штрафует продукт, который я уже ел сегодня', () => {
    const history = [...proteinDeficitDay(), entry(TODAY, '11:00', 'snack', 'chicken', 1)];
    const again = suggestTopUp({ goals: GOALS, history, catalog: CATALOG, settings: settings(), now: `${TODAY}T18:30` });
    assertOk(again);
    assertOk(r);
    const before = r.suggestions.find((s) => s.product.id === 'chicken')!.score;
    const after = again.suggestions.find((s) => s.product.id === 'chicken')!.score;
    assert.ok(after < before - 0.25, `${after} vs ${before}`);
  });
});

describe('2. Превышение калорий', () => {
  // Съедено 2100 ккал при норме 2000.
  const history = [...typicalHistory(), entry(TODAY, '14:00', 'lunch', 'dayBefore', 150)];
  const r = suggestTopUp({ goals: GOALS, history, catalog: CATALOG, settings: settings(), now: `${TODAY}T20:00` });

  it('не предлагает еду, а показывает мягкое сообщение', () => {
    assert.equal(r.kind, 'over');
    if (r.kind !== 'over') return;
    assert.ok(!('suggestions' in r));
    assert.match(r.message, /уже набрана \(\+100 ккал\)/);
    assert.doesNotMatch(r.message, /нельзя|плохо|ошибк/i);
  });

  it('варианты — только почти без калорий: вода/чай и овощи', () => {
    if (r.kind !== 'over') return assert.fail();
    assert.ok(r.lowCalorie.length >= 2 && r.lowCalorie.length <= 3);
    for (const s of r.lowCalorie) {
      assert.ok(s.product.per100.kcal <= 40, s.text);
      assert.ok(s.portion.nutrients.kcal <= 70, s.text);
    }
    const cats = r.lowCalorie.map((s) => s.product.category);
    assert.ok(cats.includes('drinks') && cats.includes('vegetables'), cats.join());
    assert.ok(r.lowCalorie.every((s) => s.product.id !== 'coffee'), 'кофе с молоком — не «чай, вода»');
  });
});

describe('3. Пустая история', () => {
  const base = { history: [] as DiaryEntry[], catalog: BASE_CATALOG, settings: settings() };

  it('«что добрать» берёт кандидатов из общей базы', () => {
    const r = suggestTopUp({ ...base, goals: GOALS, now: `${TODAY}T09:00` });
    assertOk(r);
    assert.equal(r.focus.main, 'protein');
    assert.ok(r.suggestions.length >= 3);
    assert.ok(r.suggestions.every((s) => !s.fromHistory));
    // Утром с нуля одна порция не пытается закрыть весь дневной белок.
    for (const s of r.suggestions) {
      assert.ok(s.portion.nutrients.kcal <= GOALS.kcal * 0.4, s.text);
      assert.ok(s.portion.nutrients.protein <= GOALS.protein * 0.45, s.text);
    }
    // Комбинации «в ноль» на весь день (2000 ккал) не строим.
    assert.deepEqual(r.combos, []);
  });

  it('«обычно едите», связки и недельный баланс пустые и не падают', () => {
    const now = `${TODAY}T08:00`;
    const u = usualForMeal({ ...base, now });
    assert.equal(u.meal, 'breakfast');
    assert.deepEqual(u.products, []);
    assert.deepEqual(u.templates, []);
    assert.deepEqual(oftenTogether({ ...base, now, productIds: ['buckwheat'] }), []);
    assert.deepEqual(weeklyBalance({ ...base, goals: GOALS, now }), []);
  });
});

describe('4. Утро и вечер', () => {
  const ctx = (now: string) => ({ history: typicalHistory(now.slice(0, 10)), catalog: CATALOG, settings: settings(), now });

  it('утром в будни — овсянка с бананом, без ужинных продуктов', () => {
    const u = usualForMeal(ctx(`${TODAY}T07:45`));
    assert.equal(u.meal, 'breakfast');
    assert.equal(u.weekend, false);
    const ids = u.products.slice(0, 3).map((p) => p.product.id);
    assert.ok(ids.includes('oatmeal') && ids.includes('banana'), ids.join());
    assert.ok(!u.products.some((p) => p.product.id === 'buckwheat' || p.product.id === 'cutlet'));
    assert.deepEqual(u.templates[0]!.items.map((i) => i.product.id).sort(), ['banana', 'coffee', 'oatmeal']);
  });

  it('вечером — гречка с котлетами', () => {
    const u = usualForMeal(ctx(`${TODAY}T20:00`));
    assert.equal(u.meal, 'dinner');
    assert.deepEqual(u.products.slice(0, 2).map((p) => p.product.id).sort(), ['buckwheat', 'cutlet']);
    assert.ok(!u.products.some((p) => p.product.id === 'oatmeal'));
  });

  it('утром в выходные — сырники выше овсянки', () => {
    const u = usualForMeal(ctx(`${SATURDAY}T10:15`));
    assert.equal(u.weekend, true);
    const rank = (id: string) => u.products.findIndex((p) => p.product.id === id);
    assert.ok(rank('syrniki') >= 0 && rank('syrniki') < rank('oatmeal'));
    assert.ok(u.templates[0]!.items.some((i) => i.product.id === 'syrniki'));
  });

  it('порция «одним касанием» — медиана по истории, а не 100 г', () => {
    const u = usualForMeal(ctx(`${TODAY}T07:45`));
    const oat = u.products.find((p) => p.product.id === 'oatmeal')!;
    assert.equal(oat.portion.grams, 250); // в истории 250 г, иногда 300 г
    const syrniki = usualForMeal(ctx(`${SATURDAY}T10:15`)).products.find((p) => p.product.id === 'syrniki')!;
    assert.equal(syrniki.portion.label, '3 шт.');
  });

  it('«Часто вместе с гречкой» — котлеты с обычной порцией', () => {
    const t = oftenTogether({ history: typicalHistory(), catalog: CATALOG, settings: settings(), now: `${TODAY}T19:00`, productIds: ['buckwheat'] });
    assert.equal(t[0]!.product.id, 'cutlet');
    assert.equal(t[0]!.with.id, 'buckwheat');
    assert.equal(t[0]!.portion.label, '2 шт.');
    assert.ok(t[0]!.confidence > 0.9);
  });

  it('«что добрать» утром предпочитает завтрачные продукты', () => {
    // Утро, съеден только кофе — белковый завтрак: творог/йогурт, а не котлета.
    const history = [...typicalHistory(), entry(TODAY, '07:30', 'breakfast', 'coffee', 250)];
    const r = suggestTopUp({ goals: GOALS, history, catalog: CATALOG, settings: settings(), now: `${TODAY}T07:40` });
    assertOk(r);
    const rank = (id: string) => r.suggestions.findIndex((s) => s.product.id === id);
    assert.ok(rank('tvorog5') >= 0);
    assert.ok(rank('cutlet') === -1 || rank('tvorog5') < rank('cutlet'));
  });
});

describe('5. Исключённый продукт', () => {
  const s = excludeCategory(dismissProduct(settings(), 'chicken'), 'dairy');

  it('не появляется в «что добрать» и в комбинациях', () => {
    const r = suggestTopUp({ goals: GOALS, history: proteinDeficitDay(), catalog: CATALOG, settings: s, now: `${TODAY}T18:30` });
    assertOk(r);
    const ids = [...r.suggestions.map((x) => x.product), ...r.combos.flatMap((c) => c.items.map((i) => i.product))];
    assert.ok(ids.length > 0);
    assert.ok(!ids.some((p) => p.id === 'chicken' || p.category === 'dairy'), ids.map((p) => p.id).join());
    assert.equal(r.focus.main, 'protein');
  });

  it('не появляется в «обычно едите», шаблонах, связках и при превышении', () => {
    const lunch = usualForMeal({ history: typicalHistory(), catalog: CATALOG, settings: s, now: `${TODAY}T13:00` });
    assert.ok(lunch.products.length > 0);
    assert.ok(!lunch.products.some((p) => p.product.id === 'chicken'));
    assert.ok(!lunch.templates.some((t) => t.items.some((i) => i.product.id === 'chicken')));

    const t = oftenTogether({ history: typicalHistory(), catalog: CATALOG, settings: s, now: `${TODAY}T13:00`, productIds: ['rice'] });
    assert.ok(!t.some((x) => x.product.id === 'chicken'));

    const noWater = dismissProduct(s, 'water');
    const over = suggestTopUp({
      goals: GOALS,
      history: [...typicalHistory(), entry(TODAY, '14:00', 'lunch', 'dayBefore', 150)],
      catalog: CATALOG,
      settings: noWater,
      now: `${TODAY}T20:00`,
    });
    if (over.kind !== 'over') return assert.fail();
    assert.ok(!over.lowCalorie.some((x) => x.product.id === 'water'));
  });

  it('«не предлагать это» не дублирует id и не мутирует настройки', () => {
    const a = settings();
    const b = dismissProduct(a, 'tvorog5');
    assert.deepEqual(a.excludedProductIds, []);
    assert.equal(dismissProduct(b, 'tvorog5'), b);
  });

  it('выключенные подсказки возвращают пусто', () => {
    const off = settings({ enabled: false });
    assert.equal(suggestTopUp({ goals: GOALS, history: proteinDeficitDay(), catalog: CATALOG, settings: off, now: `${TODAY}T18:30` }).kind, 'disabled');
    assert.deepEqual(usualForMeal({ history: typicalHistory(), catalog: CATALOG, settings: off, now: `${TODAY}T08:00` }).products, []);
    assert.deepEqual(weeklyBalance({ history: typicalHistory(), catalog: CATALOG, goals: GOALS, settings: off, now: `${TODAY}T08:00` }), []);
  });
});

describe('6. Комбинация из 2–3 продуктов', () => {
  const r = suggestTopUp({ goals: GOALS, history: proteinDeficitDay(), catalog: CATALOG, settings: settings(), now: `${TODAY}T18:30` });

  it('закрывает остаток почти в ноль, не превышая его', () => {
    assertOk(r);
    assert.ok(r.combos.length >= 1 && r.combos.length <= 3);
    for (const c of r.combos) {
      assert.ok(c.items.length >= 2 && c.items.length <= 3, c.text);
      assert.equal(new Set(c.items.map((i) => i.product.id)).size, c.items.length, 'продукты не повторяются');
      assert.ok(c.total.kcal <= r.remaining.kcal + 1e-6, c.text);
      assert.ok(c.leftKcal <= r.remaining.kcal * 0.15, `останется слишком много: ${c.text}`);
      assert.ok(Math.abs(c.total.protein - r.remaining.protein) <= 8, `белок мимо: ${c.text}`);
      assert.ok(c.total.fat <= r.remaining.fat + 6, `жиры мимо: ${c.text}`);
    }
  });

  it('собирает комбинации из моих продуктов и пишет понятный текст', () => {
    assertOk(r);
    const best = r.combos[0]!;
    assert.ok(best.items.every((i) => CATALOG.get(i.product.id) && i.product.id !== 'dayBefore'));
    assert.ok(best.items.some((i) => i.product.id === 'chicken' || i.product.id === 'tvorog5' || i.product.id === 'yogurt'));
    assert.match(best.text, /^.+ \+ .+ — \d+ ккал, Б \d+ г, Ж \d+ г, У \d+ г, останется \d+ ккал$/);
  });

  it('уважает заданный приём пищи и не тянет общую базу при богатой истории', () => {
    assertOk(r);
    const historyIds = new Set(typicalHistory().map((e) => e.productId));
    for (const c of r.combos) assert.ok(c.items.every((i) => historyIds.has(i.product.id)), c.text);
  });
});

describe('Недельный баланс', () => {
  /** Белковый день — граница серии. */
  const proteinDay = (d: string): DiaryEntry[] => [
    entry(d, '09:00', 'breakfast', 'tvorog5', 300),
    entry(d, '13:00', 'lunch', 'chicken', 300),
    entry(d, '13:00', 'lunch', 'rice', 300),
    entry(d, '19:00', 'dinner', 'buckwheat', 300),
  ];
  const pastaDay = (d: string, grams = 500): DiaryEntry[] => [
    entry(d, '09:00', 'breakfast', 'cookie', 200),
    entry(d, '13:00', 'lunch', 'pasta', grams),
    entry(d, '19:00', 'dinner', 'bread', 200),
  ];

  /** 4 полных дня подряд с недобором белка: макароны, хлеб, печенье; до них — нормальный день. */
  function lowProteinDays(): DiaryEntry[] {
    const h = [...typicalHistory(addDays(TODAY, -5), 40), ...proteinDay(addDays(TODAY, -5))];
    for (let i = 1; i <= 4; i++) {
      const d = addDays(TODAY, -i);
      h.push(
        entry(d, '09:00', 'breakfast', 'cookie', 200),
        entry(d, '13:00', 'lunch', 'pasta', 500),
        entry(d, '19:00', 'dinner', 'bread', 200),
      );
    }
    return h;
  }

  it('после 3+ дней недобора белка предлагает 2–3 белковых продукта из моей истории', () => {
    const cards = weeklyBalance({ history: lowProteinDays(), catalog: CATALOG, goals: GOALS, settings: settings(), now: `${TODAY}T09:00` });
    const protein = cards.find((c) => c.issue === 'lowProtein');
    assert.ok(protein, JSON.stringify(cards.map((c) => c.issue)));
    assert.equal(protein.days, 4);
    assert.match(protein.message, /^4 дня подряд белка меньше нормы/);
    assert.ok(protein.products.length >= 2 && protein.products.length <= 3);
    for (const p of protein.products) assert.ok(p.product.per100.protein >= 13, p.product.name);
    // Сахар тоже зашкаливал (печенье) — отдельная карточка с источником.
    const sugar = cards.find((c) => c.issue === 'highSugar');
    assert.ok(sugar);
    assert.match(sugar.message, /больше всего — Печенье овсяное/);
    assert.ok(sugar.products.every((p) => (p.product.per100.sugar ?? 0) <= 5));
  });

  it('не показывает карточку, если серия короче 3 дней', () => {
    const h = [...typicalHistory(addDays(TODAY, -3), 40), ...proteinDay(addDays(TODAY, -3))];
    h.push(...pastaDay(addDays(TODAY, -2)), ...pastaDay(addDays(TODAY, -1)));
    const cards = weeklyBalance({ history: h, catalog: CATALOG, goals: GOALS, settings: settings(), now: `${TODAY}T09:00` });
    assert.ok(!cards.some((c) => c.issue === 'lowProtein'));
  });

  it('недозаполненный день (меньше половины нормы ккал) прерывает серию', () => {
    const h = [...typicalHistory(addDays(TODAY, -5), 40), ...proteinDay(addDays(TODAY, -5))];
    h.push(...pastaDay(addDays(TODAY, -4)), ...pastaDay(addDays(TODAY, -3)));
    h.push(entry(addDays(TODAY, -2), '09:00', 'breakfast', 'apple', 150)); // записал только яблоко
    h.push(...pastaDay(addDays(TODAY, -1)));
    const cards = weeklyBalance({ history: h, catalog: CATALOG, goals: GOALS, settings: settings(), now: `${TODAY}T09:00` });
    assert.ok(!cards.some((c) => c.issue === 'lowProtein'));
    // Без вчерашнего «короткого» дня та же неделя дала бы серию из 3.
    const full = [...h.filter((x) => !x.at.startsWith(addDays(TODAY, -2))), ...pastaDay(addDays(TODAY, -2))];
    const again = weeklyBalance({ history: full, catalog: CATALOG, goals: GOALS, settings: settings(), now: `${TODAY}T09:00` });
    assert.equal(again.find((c) => c.issue === 'lowProtein')?.days, 4);
  });
});

describe('Порции', () => {
  it('удобные значения: граммы шагом 50, штуки, стаканы со склонением', () => {
    const kefir = CATALOG.get('kefir')!;
    assert.deepEqual(portionOptions(kefir).map((p) => p.label), ['1 стакан', '2 стакана']);
    const bread = CATALOG.get('bread')!;
    assert.deepEqual(portionOptions(bread).map((p) => p.label), ['1 ломтик', '2 ломтика', '3 ломтика']);
    assert.deepEqual(portionOptions(CATALOG.get('chicken')!).map((p) => p.grams), [50, 100, 150, 200, 250, 300]);
    // Калорийное — не больше 100 г.
    assert.deepEqual(portionOptions(CATALOG.get('nuts')!).map((p) => p.grams), [20, 30, 50, 100]);
    // Обычная порция пользователя добавляется в варианты (округлённая).
    assert.ok(portionOptions(CATALOG.get('chicken')!, 180).some((p) => p.grams === 200));
    assert.equal(usualPortion(CATALOG.get('oatmeal')!, 237).grams, 235);
  });
});
