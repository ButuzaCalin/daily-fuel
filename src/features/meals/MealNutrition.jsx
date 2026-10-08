import { hasNutrition } from './nutrition.js';

export function MealNutrition({ nutrition }) {
  if (!hasNutrition({ nutrition })) return <div className="meal-nutrition is-empty">Not estimated</div>;
  const grams = (value) => Math.round(Number(value) || 0);
  return (
    <div className="meal-nutrition">
      <span className="meal-stat is-kcal"><strong>{grams(nutrition.calories)}</strong><small>kcal</small></span>
      <span className="meal-stat macro-green"><strong>{grams(nutrition.proteins)}g</strong><small>protein</small></span>
      <span className="meal-stat macro-yellow"><strong>{grams(nutrition.carbs)}g</strong><small>carbs</small></span>
      <span className="meal-stat macro-coral"><strong>{grams(nutrition.fats)}g</strong><small>fat</small></span>
    </div>
  );
}
