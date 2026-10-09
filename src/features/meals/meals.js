import { blankNutrition, cleanNutrition, cleanPortion, hasNutrition, sumNutrition, valueSources } from './nutrition.js';
import { dateKey, formatDate, shiftDate } from '../../lib/date.js';

export const mealTextMaxLength = 300;

export function sortMeals(meals) {
  return [...meals].sort((first, second) => first.time.localeCompare(second.time));
}

export function clearEstimating(mealsByDate) {
  return Object.fromEntries(Object.entries(mealsByDate).map(([date, meals]) => [date, Array.isArray(meals) ? meals.map((meal) => (meal?.estimating ? { ...meal, estimating: false } : meal)) : []]));
}

// Unique previously logged meals, most recent first, for searching and re-adding.
export function pastMeals(mealsByDate) {
  const seen = new Map();
  Object.keys(mealsByDate).sort().reverse().forEach((date) => {
    // Old or imported entries may be malformed; skip anything without text rather than crash on startup.
    const dayMeals = Array.isArray(mealsByDate[date]) ? mealsByDate[date].filter((meal) => typeof meal?.text === 'string') : [];
    [...dayMeals].sort((first, second) => String(second.time ?? '').localeCompare(String(first.time ?? ''))).forEach((meal) => {
      // Items of a meal are offered on their own too, so "3 eggs" can be re-added without the rest.
      const entries = Array.isArray(meal.items) ? [meal, ...meal.items.filter((item) => typeof item?.text === 'string')] : [meal];
      entries.forEach((entry) => {
        const key = entry.text.trim().toLowerCase();
        if (!key) return;
        if (seen.has(key)) seen.get(key).count += 1;
        else seen.set(key, { text: entry.text.trim(), nutrition: cleanNutrition(entry.nutrition), portion: cleanPortion(entry.portion), source: cleanSource(entry), ...(entry.items && { items: cleanItems(entry.items) }), date, time: meal.time, count: 1 });
      });
    });
  });
  return [...seen.values()];
}

export function matchMeals(meals, query, limit = 5) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (query.trim().length < 2) return [];
  return meals.filter((meal) => {
    const text = meal.text.toLowerCase();
    return text !== query.trim().toLowerCase() && words.every((word) => text.includes(word));
  }).slice(0, limit);
}

export function loggedLabel(date) {
  const today = dateKey(new Date());
  if (date === today) return 'Today';
  if (date === shiftDate(today, -1)) return 'Yesterday';
  return formatDate(date);
}

export function currentHour() {
  return `${String(new Date().getHours()).padStart(2, '0')}:00`;
}

function cleanSource(entry) {
  return valueSources.includes(entry?.source) && hasNutrition({ nutrition: cleanNutrition(entry.nutrition) }) ? entry.source : undefined;
}

export function cleanItems(items) {
  return items.filter((item) => typeof item?.text === 'string' && item.text.trim()).map((item) => ({
    id: String(item.id || crypto.randomUUID()),
    text: item.text.trim(),
    nutrition: cleanNutrition(item.nutrition),
    portion: cleanPortion(item.portion),
    source: cleanSource(item),
  }));
}

// A meal made of items keeps its own text and nutrition as the joined names and sum, so totals, reports and scores read it like any meal.
export function mealFields({ text, nutrition, portion, source, items }) {
  if (!items) return { text: text.trim(), nutrition: cleanNutrition(nutrition), portion: cleanPortion(portion), source: cleanSource({ nutrition, source }), items: undefined };
  const cleaned = cleanItems(items);
  if (cleaned.length === 1) {
    const [item] = cleaned;
    return { text: item.text, nutrition: item.nutrition, portion: item.portion, source: item.source, items: undefined };
  }
  return { text: cleaned.map((item) => item.text).join(', '), nutrition: cleanNutrition(sumNutrition(cleaned)), portion: undefined, source: undefined, items: cleaned };
}

export function mealFromDraft(draft) {
  return mealFields(draft.items ? { items: draft.items } : draft);
}

export function draftFromMeal(meal) {
  const items = Array.isArray(meal.items) && meal.items.length ? meal.items.map((item) => ({ ...item, nutrition: { ...item.nutrition }, portion: item.portion ?? null })) : null;
  return { text: items ? '' : meal.text, nutrition: { ...meal.nutrition }, portion: meal.portion ?? null, source: meal.source ?? null, items };
}

// Re-adding a past meal copies its items, which need their own ids so estimates don't mix them up.
export function withFreshIds(items) {
  return items?.map((item) => ({ ...item, id: crypto.randomUUID() })) ?? null;
}

export function blankItem() {
  return { id: crypto.randomUUID(), text: '', nutrition: blankNutrition, portion: null, source: null };
}

// Entries that still need AI values: the meal itself, or for a meal of items, the items without values.
export function pendingEntries(meal) {
  if (!meal.items) return hasNutrition(meal) ? [] : [meal];
  return meal.items.filter((item) => !hasNutrition(item));
}

// Entries a re-estimate may replace; scanned and hand-entered items keep their values.
export function reestimableEntries(meal) {
  if (!meal.items) return [meal];
  const pending = pendingEntries(meal);
  return pending.length ? pending : meal.items.filter((item) => item.source !== 'scan' && item.source !== 'manual');
}

export function applyEstimates(meal, nutritionById) {
  if (!meal.items) return nutritionById[meal.id] ? { ...meal, nutrition: nutritionById[meal.id], portion: undefined, source: 'ai' } : meal;
  const items = meal.items.map((item) => (nutritionById[item.id] ? { ...item, nutrition: nutritionById[item.id], portion: undefined, source: 'ai' } : item));
  return { ...meal, items, nutrition: cleanNutrition(sumNutrition(items)) };
}
