import type { DiaryEntry, Goals, Product, SuggestionSettings } from '../src/index.ts';
import { DEFAULT_SETTINGS } from '../src/index.ts';
import { BASE_PRODUCTS } from './catalog.ts';

export interface StoredEntry extends DiaryEntry {
  id: string;
}

export interface AppState {
  goals: Goals;
  settings: SuggestionSettings;
  entries: StoredEntry[];
  customProducts: Product[];
}

const KEY = 'fooder:v1';

export const DEFAULT_GOALS: Goals = { kcal: 2000, protein: 100, fat: 67, carbs: 250, fiber: 28, sugarMax: 50 };

function fresh(): AppState {
  return { goals: { ...DEFAULT_GOALS }, settings: { ...DEFAULT_SETTINGS }, entries: [], customProducts: [] };
}

export function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw) as Partial<AppState>;
    return {
      goals: { ...DEFAULT_GOALS, ...s.goals },
      settings: { ...DEFAULT_SETTINGS, ...s.settings },
      entries: Array.isArray(s.entries) ? s.entries : [],
      customProducts: Array.isArray(s.customProducts) ? s.customProducts : [],
    };
  } catch {
    return fresh();
  }
}

export function save(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Хранилище недоступно — данные останутся до закрытия приложения.
  }
}

export function catalogOf(state: AppState): Map<string, Product> {
  const map = new Map<string, Product>();
  for (const p of BASE_PRODUCTS) map.set(p.id, p);
  for (const p of state.customProducts) map.set(p.id, p);
  return map;
}

export function newId(prefix = 'e'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
