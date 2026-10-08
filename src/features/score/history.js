import { goalOn } from '../goal/goal.js';
import { sumNutrition } from '../meals/nutrition.js';
import { calculateScore, dayStatus } from './score.js';

// Final score for a completed day with logged values, otherwise null.
export function scoreForDay(date, mealsByDate, goal, todayKey, now) {
  const meals = mealsByDate[date] || [];
  return meals.length && dayStatus(date, todayKey, now) === 'complete' ? calculateScore(sumNutrition(meals), goalOn(goal, date)).score : null;
}
