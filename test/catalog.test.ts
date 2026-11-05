import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

interface P {
  id: string;
  name: string;
  category: string;
  per100: { kcal: number; protein: number; fat: number; carbs: number; fiber?: number; sugar?: number };
  units?: { label: string; grams: number }[];
  standalone?: boolean;
  source: { kind: string; url: string; id?: number; n?: number; codes?: string[] };
}
const data = JSON.parse(readFileSync('app/catalog.data.json', 'utf8')) as { products: P[] };
const products = data.products;

describe('База продуктов', () => {
  it('сгенерирована из data/ и не правилась руками', () => {
    execFileSync('node', ['scripts/build-catalog.mjs', '--check'], { stdio: 'pipe' });
  });

  it('у каждого продукта есть первичный источник со ссылкой', () => {
    assert.ok(products.length >= 80, `${products.length}`);
    for (const p of products) {
      assert.ok(p.source.kind === 'usda' || p.source.kind === 'off', p.id);
      assert.match(p.source.url, /^https:\/\/(fdc\.nal\.usda\.gov|world\.openfoodfacts\.org)\//, p.id);
      if (p.source.kind === 'usda') assert.ok(p.source.id! > 0, p.id);
      if (p.source.kind === 'off') assert.ok(p.source.n! >= 3 && p.source.codes!.length === p.source.n, p.id);
    }
  });

  it('id уникальны, значения в физических пределах', () => {
    assert.equal(new Set(products.map((p) => p.id)).size, products.length);
    for (const { id, per100: n } of products) {
      for (const k of ['kcal', 'protein', 'fat', 'carbs'] as const) assert.ok(n[k] >= 0, `${id}.${k}`);
      assert.ok(n.kcal <= 900, id);
      assert.ok(n.protein + n.fat + n.carbs <= 101, id);
      assert.ok((n.sugar ?? 0) <= n.carbs + 0.5, `${id}: сахара больше углеводов`);
    }
  });

  it('калорийность согласуется с БЖУ (4/9/4) в пределах 20 %', () => {
    for (const { id, per100: n } of products) {
      if (n.kcal < 20) continue;
      const est = 4 * n.protein + 9 * n.fat + 4 * n.carbs;
      assert.ok(Math.abs(est - n.kcal) / n.kcal <= 0.2, `${id}: ${n.kcal} vs ${est.toFixed(0)}`);
    }
  });

  it('эталонные значения совпадают с USDA', () => {
    const by = new Map(products.map((p) => [p.id, p]));
    // Buckwheat groats, roasted, cooked (#170686): 92 ккал, Б 3.38, Ж 0.62, У 19.94
    assert.deepEqual(
      [by.get('buckwheat')!.per100.kcal, by.get('buckwheat')!.per100.protein, by.get('buckwheat')!.source.id],
      [92, 3.38, 170686],
    );
    // Bananas, raw (#173944), 1 medium = 118 г
    assert.equal(by.get('banana')!.units![0]!.grams, 118);
  });

  it('добавки помечены и не предлагаются как еда', () => {
    const addons = products.filter((p) => p.standalone === false).map((p) => p.id).sort();
    assert.deepEqual(addons, ['butter', 'honey', 'ketchup', 'mayo', 'oil', 'sourCream', 'sugar']);
  });

  it('демо-история ссылается только на существующие продукты', () => {
    const src = readFileSync('app/demo.ts', 'utf8');
    const ids = new Set(products.map((p) => p.id));
    const used = [...src.matchAll(/'(breakfast|lunch|snack|dinner)', '(\w+)'/g)].map((m) => m[2]!);
    assert.ok(used.length > 5);
    for (const id of used) assert.ok(ids.has(id), id);
  });
});
