// Собирает базу продуктов app/catalog.data.json из первичных источников.
//
//   data/catalog.json      — какой продукт откуда брать (руками)
//   data/usda/foods.csv    — USDA FoodData Central, на 100 г (скачано scripts/fetch_sources.py)
//   data/usda/portions.csv — стандартные порции USDA (вес «шт.», «ломтика», «ложки»)
//   data/off/*.json        — этикетки Open Food Facts (российские товары)
//
// Цифры пищевой ценности руками не пишутся. Для OFF берётся медиана этикеток,
// прошедших фильтры (название, жирность, согласованность ккал с БЖУ); нужно ≥ 3 этикеток.
//
// node scripts/build-catalog.mjs          — пересобрать
// node scripts/build-catalog.mjs --check  — проверить, что файл актуален (для CI)

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const MIN_LABELS = 3;
/** Допустимое расхождение заявленных ккал с 4·Б + 9·Ж + 4·У. */
const ATWATER_TOLERANCE = 0.15;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v));
const r1 = (x) => Math.round(x * 10) / 10;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const atwaterOk = (n, tol = ATWATER_TOLERANCE) => {
  if (n.kcal < 20) return true;
  const est = 4 * n.protein + 9 * n.fat + 4 * n.carbs;
  return Math.abs(est - n.kcal) / n.kcal <= tol;
};

const map = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const usda = new Map(parseCsv(readFileSync('data/usda/foods.csv', 'utf8')).map((r) => [r.fdc_id, r]));
const portions = new Map();
for (const p of parseCsv(readFileSync('data/usda/portions.csv', 'utf8'))) {
  if (!portions.has(p.fdc_id)) portions.set(p.fdc_id, []);
  portions.get(p.fdc_id).push(p);
}
const off = new Map();
for (const f of readdirSync('data/off')) {
  const d = JSON.parse(readFileSync(`data/off/${f}`, 'utf8'));
  off.set(d.query, d);
}
const usdaSource = readFileSync('data/usda/SOURCE.txt', 'utf8');

const errors = [];
const report = [];
const products = [];

for (const m of map.products) {
  const p = { id: m.id, name: m.name, category: m.category };
  let per100;
  let source;

  if (m.usda) {
    const row = usda.get(String(m.usda));
    if (!row) { errors.push(`${m.id}: нет fdc_id ${m.usda} в data/usda/foods.csv`); continue; }
    per100 = { kcal: num(row.kcal), protein: num(row.protein), fat: num(row.fat), carbs: num(row.carbs) };
    if (num(row.fiber) !== undefined) per100.fiber = num(row.fiber);
    if (num(row.sugar) !== undefined) per100.sugar = num(row.sugar);
    const label = row.dataset === 'fndds' ? 'USDA FNDDS 2021–2023' : 'USDA SR Legacy';
    source = { kind: 'usda', label, id: Number(m.usda), title: row.description, url: `https://fdc.nal.usda.gov/food-details/${m.usda}/nutrients` };
    report.push(`${m.id.padEnd(14)} ${label.padEnd(20)} #${m.usda} ${row.description.slice(0, 60)}`);
  } else if (m.off) {
    const f = m.off;
    const nameRx = new RegExp(f.name, 'i');
    const exRx = f.exclude ? new RegExp(f.exclude, 'i') : null;
    const seen = new Map();
    for (const q of f.queries) {
      const d = off.get(q);
      if (!d) { errors.push(`${m.id}: нет выгрузки OFF для запроса «${q}»`); continue; }
      for (const x of d.products) if (x.code && !seen.has(x.code)) seen.set(x.code, x);
    }
    const ok = [...seen.values()].filter((x) => {
      const name = String(x.name ?? '').toLowerCase().replace(/ё/g, 'е').replace(/&quot;/g, '"');
      if (!nameRx.test(name) || (exRx && exRx.test(name))) return false;
      const n = { kcal: num(x.kcal), protein: num(x.protein), fat: num(x.fat), carbs: num(x.carbs) };
      if (Object.values(n).some((v) => v === undefined || v < 0)) return false;
      if (f.fat && (n.fat < f.fat[0] || n.fat > f.fat[1])) return false;
      if (f.minProtein && n.protein < f.minProtein) return false;
      return atwaterOk(n);
    });
    if (ok.length < MIN_LABELS) {
      errors.push(`${m.id}: подходящих этикеток OFF ${ok.length} < ${MIN_LABELS} (${[...seen.values()].length} кандидатов)`);
      continue;
    }
    const med = (k) => r1(median(ok.map((x) => num(x[k]))));
    per100 = { kcal: med('kcal'), protein: med('protein'), fat: med('fat'), carbs: med('carbs') };
    for (const [k, key] of [['fiber', 'fiber'], ['sugar', 'sugar']]) {
      const vals = ok.map((x) => num(x[key])).filter((v) => v !== undefined);
      if (vals.length >= MIN_LABELS) per100[k] = r1(median(vals));
    }
    source = {
      kind: 'off',
      label: 'Open Food Facts',
      n: ok.length,
      title: `медиана ${ok.length} этикеток`,
      codes: ok.map((x) => x.code),
      url: `https://world.openfoodfacts.org/product/${ok[0].code}`,
    };
    report.push(`${m.id.padEnd(14)} OFF, медиана ${String(ok.length).padStart(2)}    ${ok.slice(0, 4).map((x) => x.name).join(' | ').slice(0, 90)}`);
  } else {
    errors.push(`${m.id}: не указан источник`);
    continue;
  }

  for (const k of ['kcal', 'protein', 'fat', 'carbs']) if (per100[k] === undefined) errors.push(`${m.id}: нет ${k}`);
  if (!atwaterOk(per100, 0.2)) {
    const est = r1(4 * per100.protein + 9 * per100.fat + 4 * per100.carbs);
    errors.push(`${m.id}: ккал ${per100.kcal} не сходятся с БЖУ (${est})`);
  }
  p.per100 = per100;

  if (m.unit) {
    const u = { label: m.unit.label };
    if (m.unit.forms) u.forms = m.unit.forms;
    if (m.unit.usdaPortion) {
      const list = portions.get(String(m.usda)) ?? [];
      const hit = list.find((x) => x.description.toLowerCase().startsWith(m.unit.usdaPortion.toLowerCase()));
      if (!hit) { errors.push(`${m.id}: нет порции USDA «${m.unit.usdaPortion}» (есть: ${list.map((x) => x.description).join('; ')})`); continue; }
      const amount = num(hit.amount) || 1;
      u.grams = r1(num(hit.gram_weight) / amount);
      u.source = `USDA: ${hit.amount ? hit.amount + ' ' : ''}${hit.description}`;
    } else {
      u.grams = m.unit.grams;
    }
    p.units = [u];
  }
  if (m.meals) p.meals = m.meals;
  if (m.addon) p.standalone = false;
  p.source = source;
  products.push(p);
}

const out = {
  _doc: 'Сгенерировано scripts/build-catalog.mjs из data/. Не редактировать вручную.',
  sources: {
    usda: usdaSource.trim().split('\n'),
    off: 'Open Food Facts (ODbL), https://world.openfoodfacts.org — медиана этикеток российских товаров',
  },
  products,
};
const json = JSON.stringify(out, null, 1) + '\n';

console.log(report.join('\n'));
if (errors.length) {
  console.error(`\nОшибки (${errors.length}):\n  ` + errors.join('\n  '));
  process.exit(1);
}
if (process.argv.includes('--check')) {
  const cur = readFileSync('app/catalog.data.json', 'utf8');
  if (cur !== json) { console.error('app/catalog.data.json устарел: запустите npm run build:catalog'); process.exit(1); }
  console.log(`\nOK: ${products.length} продуктов, файл актуален`);
} else {
  writeFileSync('app/catalog.data.json', json);
  console.log(`\nЗаписано ${products.length} продуктов в app/catalog.data.json`);
}
