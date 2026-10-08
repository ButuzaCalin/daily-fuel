export const emptyNutrition ={ calories: 0, proteins: 0, carbs: 0, fats: 0 };

export const blankNutrition = { calories: '', proteins: '', carbs: '', fats: '' };

// Optional by-weight entry kept on a meal: grams eaten plus the label values per `base` grams.
export function cleanPortion(source) {
  const grams = Number(source?.grams);
  const base = Number(source?.base);
  if (!(grams > 0) || !(base > 0)) return undefined;
  const serving = Number(source.serving);
  return { grams, base, per: cleanNutrition(source.per), ...(serving > 0 && { serving }) };
}

export function portionFromPer(values, serving) {
  return cleanPortion({ grams: values.portion, base: values.base, per: values, serving }) ?? null;
}

export function perFromPortion(portion) {
  return { base: String(portion.base), portion: String(portion.grams), ...Object.fromEntries(Object.entries(portion.per).map(([key, value]) => [key, String(value)])) };
}

export function cleanNutrition(source) {
  return ['calories', 'proteins', 'carbs', 'fats'].reduce((nutrition, key) => {
    const value = Number(source?.[key]);
    nutrition[key] = Number.isFinite(value) ? Math.max(0, Math.round(value * 10) / 10) : 0;
    return nutrition;
  }, {});
}

export function hasNutrition(meal) {
  return Object.values(meal.nutrition || {}).some((value) => Number(value) > 0);
}

export function sumNutrition(meals) {
  return meals.reduce((sum, meal) => ({
    calories: sum.calories + (Number(meal.nutrition.calories) || 0),
    proteins: sum.proteins + (Number(meal.nutrition.proteins) || 0),
    carbs: sum.carbs + (Number(meal.nutrition.carbs) || 0),
    fats: sum.fats + (Number(meal.nutrition.fats) || 0),
  }), { ...emptyNutrition });
}

// Keeps the amount in the meal text, so a later edit or AI re-estimate still knows the portion.
export function productText(name, portion) {
  return Number(portion) > 0 ? `${name} (${portion} g)` : name;
}

// Recovers the product name from text written by productText, so the grams keep syncing on edit.
export function productNameIn(text, portion) {
  const suffix = ` (${portion.grams} g)`;
  return text.endsWith(suffix) ? text.slice(0, -suffix.length) : null;
}

export const blankPerValues = { base: '100', portion: '', ...blankNutrition };

export function scaleNutrition({ base, portion, ...values }) {
  const factor = Number(portion) / Number(base);
  const valid = portion !== '' && Number(base) > 0 && Number.isFinite(factor);
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, valid && value !== '' ? String(Math.round(Number(value) * factor * 10) / 10) : '']));
}
