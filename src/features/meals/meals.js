import { cleanNutrition, cleanPortion } from './nutrition.js';
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
      const key = meal.text.trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) seen.get(key).count += 1;
      else seen.set(key, { text: meal.text.trim(), nutrition: cleanNutrition(meal.nutrition), portion: cleanPortion(meal.portion), date, time: meal.time, count: 1 });
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
