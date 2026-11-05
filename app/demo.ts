import type { MealType } from '../src/index.ts';
import { isWeekend } from '../src/index.ts';
import { addDays, minuteOfDay } from '../src/time.ts';
import { newId, type StoredEntry } from './store.ts';

/**
 * Пример истории за 45 дней — чтобы сразу увидеть, как работают подсказки.
 * Будни: овсянка с бананом и кофе; выходные: сырники. Обед — курица с рисом
 * или макароны с сыром, перекус — творог/яблоко/печенье, ужин — гречка с котлетами
 * или лосось с брокколи. Сегодня заполняются только уже прошедшие приёмы.
 */
export function demoHistory(now: string, days = 45): StoredEntry[] {
  const today = now.slice(0, 10);
  const nowMin = minuteOfDay(now);
  const out: StoredEntry[] = [];
  const add = (date: string, time: string, meal: MealType, productId: string, grams: number): void => {
    if (date === today && minuteOfDay(`${date}T${time}`) > nowMin) return;
    out.push({ id: newId(), productId, grams, meal, at: `${date}T${time}` });
  };

  for (let i = days; i >= 0; i--) {
    const d = addDays(today, -i);
    if (isWeekend(d)) {
      add(d, '10:00', 'breakfast', 'syrniki', 180);
      add(d, '10:05', 'breakfast', 'coffeeMilk', 250);
      add(d, '14:30', 'lunch', 'pasta', 250);
      add(d, '14:30', 'lunch', 'cheese', 30);
    } else {
      add(d, '07:30', 'breakfast', 'oatmeal', i % 4 === 0 ? 300 : 250);
      add(d, '07:30', 'breakfast', 'banana', 120);
      add(d, '07:35', 'breakfast', 'coffeeMilk', 250);
      add(d, '13:00', 'lunch', 'chicken', 150);
      add(d, '13:00', 'lunch', 'rice', 200);
      add(d, '13:00', 'lunch', 'cucumber', 120);
    }
    if (i % 2 === 0) add(d, '16:30', 'snack', 'tvorog5', 200);
    else if (i % 5 === 0) add(d, '16:30', 'snack', 'cookie', 60);
    else add(d, '16:30', 'snack', 'apple', 150);
    if (i % 3 === 0) {
      add(d, '19:30', 'dinner', 'salmon', 150);
      add(d, '19:30', 'dinner', 'broccoli', 200);
    } else {
      add(d, '19:30', 'dinner', 'buckwheat', 200);
      add(d, '19:30', 'dinner', 'cutletChicken', 160);
    }
  }
  return out;
}
