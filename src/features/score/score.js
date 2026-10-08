// Deterministic Daily Score: how closely a day followed the user's own calorie and macro targets.
// Targets are the source of truth; nothing here calculates, changes or recommends them.

// Deviation is relative to the target (−0.1 = 10% under). Each side of a curve scores 100 up to
// `plateau`, then eases down as 100·exp(−((|d| − plateau) / w)^k). Tune scoring here, not in the algorithm.
const standard = { plateau: 0, w: 0.41, k: 1.7 }; // 180g target: 170 → ~97, 160 → ~90, 150 → ~80, 135 → ~65

const tolerant = { plateau: 0.05, w: 0.41, k: 1.7 };

export const scoringConfig = {
  macroCurves: {
    // Going over the protein target is treated gently; falling short follows the standard curve.
    proteins: { below: standard, above: { plateau: 0.1, w: 0.5, k: 2 } },
    carbs: { below: tolerant, above: tolerant },
    fats: { below: tolerant, above: tolerant },
  },
  // Calorie curves depend on the objective (2000 kcal examples in the comments).
  calorieCurves: {
    // 1900–2000 excellent, 1800 ~95, 1500 ~66, 1200 ~40; 2100 ~92, 2300 ~60, 2600 ~20.
    lose: { below: { plateau: 0.05, w: 0.36, k: 1.5 }, above: { plateau: 0, w: 0.225, k: 1.65 } },
    // Symmetric: 1960–2040 excellent, 1900/2100 ~96, 1800/2200 ~75, 1600/2400 ~24.
    maintain: { below: { plateau: 0.02, w: 0.15, k: 2 }, above: { plateau: 0.02, w: 0.15, k: 2 } },
    // 1900 ~75, 1800 ~45; 2000–2100 excellent, 2200 ~92, 2500 ~60, 3000 ~23.
    gain: { below: { plateau: 0, w: 0.115, k: 1.5 }, above: { plateau: 0.05, w: 0.338, k: 1.3 } },
    // Narrow window at or just above target: 1900 ~80, 1800 ~52; 2060 excellent, 2200 ~83, 2400 ~46.
    muscle: { below: { plateau: 0, w: 0.13, k: 1.6 }, above: { plateau: 0.03, w: 0.2, k: 1.6 } },
    // Target or a slight deficit: 1840–2000 excellent, 1700 ~86, 1500 ~47; 2100 ~87, 2200 ~62.
    recomp: { below: { plateau: 0.08, w: 0.2, k: 1.8 }, above: { plateau: 0, w: 0.15, k: 1.8 } },
  },
  // Share of a macro's penalty forgiven when that macro explains the calorie deviation, so one
  // behaviour (e.g. extra carbs) isn't penalised in full both as "calories high" and "carbs high".
  overlapDiscount: 0.5,
};

export const objectives = {
  lose: { label: 'Lose weight', description: 'For eating in a calorie deficit. Staying a little under your calorie target scores fully, going over costs the most, and protein is weighted high.', weights: { calories: 0.4, proteins: 0.3, carbs: 0.15, fats: 0.15 }, calorieNote: 'A little under your calorie target is fine; going over costs more, and very low intake is penalised too.' },
  maintain: { label: 'Maintain', description: 'For keeping your weight steady. Calories score best close to your target in either direction, and the macros are weighted more evenly.', weights: { calories: 0.35, proteins: 0.25, carbs: 0.2, fats: 0.2 }, calorieNote: 'Calories score best close to your target, whether over or under.' },
  gain: { label: 'Gain weight', description: 'For eating in a surplus. A little over your calorie target is fine, falling short costs the most, and large surpluses still lower the score.', weights: { calories: 0.4, proteins: 0.3, carbs: 0.15, fats: 0.15 }, calorieNote: 'A little over your calorie target is fine; falling short costs more, and large surpluses are penalised too.' },
  muscle: { label: 'Build muscle', description: 'For lean gaining while training. Protein carries the most weight, and calories score best in a narrow range at or just above your target.', weights: { calories: 0.3, proteins: 0.4, carbs: 0.2, fats: 0.1 }, calorieNote: 'Calories score best in a narrow range at or just above your target.' },
  recomp: { label: 'Recomposition', description: 'For losing fat while building muscle. Protein carries the most weight, and calories score best at or slightly below your target; large deficits are penalised.', weights: { calories: 0.3, proteins: 0.4, carbs: 0.15, fats: 0.15 }, calorieNote: 'Calories score best at or slightly below your target; large deficits are penalised.' },
};

// Unknown objectives fall back to the default so saved goals keep working.
export function objectiveKey(key) {
  return objectives[key] ? key : 'lose';
}

// Metric keys match the app's nutrition fields; `name` is the public result name.
export const metrics = [
  { key: 'calories', name: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'proteins', name: 'protein', label: 'Protein', unit: 'g', kcalPerUnit: 4 },
  { key: 'carbs', name: 'carbs', label: 'Carbs', unit: 'g', kcalPerUnit: 4 },
  { key: 'fats', name: 'fat', label: 'Fat', unit: 'g', kcalPerUnit: 9 },
];

export const macroLabels = { proteins: 'Protein', carbs: 'Carbs', fats: 'Fat' };

// Today counts as complete from this hour; earlier days are always complete.
export const DAY_COMPLETE_HOUR = 21;

// Eating window used by the Day Progress pace indicator.
const DAY_START_HOUR = 7;

export function curveScore(deviation, curve) {
  const side = deviation < 0 ? curve.below : curve.above;
  const excess = Math.max(0, Math.abs(deviation) - side.plateau);
  return 100 * Math.exp(-((excess / side.w) ** side.k));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function scoreLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Great';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Needs improvement';
}

// Core scorer, independent of the UI. Missing targets (≤ 0) are skipped and their weight redistributed;
// with no food logged, or no targets at all, the score is null rather than 0.
export function scoreNutrition({ goal, calorieTarget, proteinTarget, carbTarget, fatTarget, actualCalories, actualProtein, actualCarbs, actualFat }, config = scoringConfig) {
  const objective = objectiveKey(goal);
  const targets = { calories: calorieTarget, proteins: proteinTarget, carbs: carbTarget, fats: fatTarget };
  const actual = { calories: actualCalories, proteins: actualProtein, carbs: actualCarbs, fats: actualFat };
  const hasFood = Object.values(actual).some((value) => Number(value) > 0);
  const active = metrics.filter(({ key }) => Number(targets[key]) > 0);
  const weightSum = active.reduce((sum, { key }) => sum + objectives[objective].weights[key], 0);

  const rows = metrics.map((metric) => {
    const target = Number(targets[metric.key]) || 0;
    const value = Number(actual[metric.key]) || 0;
    if (!(target > 0)) return { ...metric, target: null, value, scored: false, score: null, rawScore: null, weight: 0, points: 0, deviation: null };
    const relative = (value - target) / target;
    const curve = metric.key === 'calories' ? config.calorieCurves[objective] : config.macroCurves[metric.key];
    const rawScore = curveScore(relative, curve);
    return { ...metric, target, value, scored: true, rawScore, score: rawScore, weight: objectives[objective].weights[metric.key] / weightSum, deviation: { amount: round(value - target), percent: round(relative * 100) } };
  });

  // Forgive part of a macro's penalty in proportion to how much of the calorie deviation it explains.
  const calories = rows[0];
  if (calories.scored && calories.value !== calories.target) {
    const calorieGap = calories.value - calories.target;
    const caloriePenalty = 100 - calories.rawScore;
    rows.slice(1).filter((row) => row.scored).forEach((row) => {
      const share = Math.min(1, Math.max(0, ((row.value - row.target) * row.kcalPerUnit) / calorieGap));
      const penalty = 100 - row.rawScore;
      row.score = 100 - (penalty - config.overlapDiscount * share * Math.min(penalty, caloriePenalty));
    });
  }
  rows.forEach((row) => { if (row.scored) row.points = row.score * row.weight; });

  const score = hasFood && active.length ? Math.round(Math.min(100, Math.max(0, rows.reduce((sum, row) => sum + row.points, 0)))) : null;
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  const rounded = (row) => (row.scored && score !== null ? Math.round(row.score) : null);
  return {
    score,
    label: score === null ? null : scoreLabel(score),
    calorieScore: rounded(byName.calories),
    proteinScore: rounded(byName.protein),
    carbScore: rounded(byName.carbs),
    fatScore: rounded(byName.fat),
    weights: Object.fromEntries(rows.map((row) => [row.name, round(row.weight, 4)])),
    deviation: Object.fromEntries(rows.map((row) => [row.name, row.deviation])),
    objective,
    metrics: rows,
    summary: score === null ? '' : describe(rows),
  };
}

// App adapter: nutrition totals and a saved goal ({ calories, proteins, carbs, fats, objective }).
export function calculateScore(total, goal) {
  return scoreNutrition({
    goal: goal.objective,
    calorieTarget: goal.calories,
    proteinTarget: goal.proteins,
    carbTarget: goal.carbs,
    fatTarget: goal.fats,
    actualCalories: total.calories,
    actualProtein: total.proteins,
    actualCarbs: total.carbs,
    actualFat: total.fats,
  });
}

function joinList(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0];
}

// Factual, non-judgmental: states how far each metric was from the user's target.
function describe(rows) {
  const scored = rows.filter((row) => row.scored);
  const onTarget = scored.filter((row) => row.rawScore >= 97).map((row) => row.label.toLowerCase());
  const close = scored.filter((row) => row.rawScore < 97 && row.rawScore >= 85).map((row) => row.label.toLowerCase());
  const off = scored.filter((row) => row.rawScore < 85);
  const plural = new Set(['calories', 'carbs']);
  const verb = (items) => (items.length > 1 || plural.has(items[0]) ? 'were' : 'was');
  const sentences = [];
  if (onTarget.length) sentences.push(`${joinList(onTarget)} ${verb(onTarget)} right on target`);
  if (close.length) sentences.push(`${joinList(close)} ${verb(close)} close to your ${close.length > 1 ? 'targets' : 'target'}`);
  const first = sentences.length ? `${sentences.join(' and ')}.` : '';
  const rest = off.map((row) => `${row.label} ${verb([row.label.toLowerCase()])} ${Math.abs(Math.round(row.deviation.amount))}${row.unit === 'kcal' ? ' kcal' : 'g'} ${row.deviation.amount < 0 ? 'below' : 'above'} target.`);
  const text = [first, ...rest].filter(Boolean).join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function scoringAvailable(goal) {
  return Boolean(goal?.scoring && metrics.some(({ key }) => goal[key] > 0));
}

// 'past' days are scored, 'today' is scored only after DAY_COMPLETE_HOUR, 'future' never.
export function dayStatus(selectedDate, todayKey, now) {
  if (selectedDate < todayKey) return 'complete';
  if (selectedDate > todayKey) return 'future';
  return now.getHours() >= DAY_COMPLETE_HOUR ? 'complete' : 'in-progress';
}

// Pace check for an unfinished day: compares intake with the share of the eating window that has passed.
// Macros without a target have no pace (null).
export function dayProgress(total, goal, now) {
  const hours = now.getHours() + now.getMinutes() / 60;
  const expected = Math.min(1, Math.max(0, (hours - DAY_START_HOUR) / (DAY_COMPLETE_HOUR - DAY_START_HOUR)));
  const pace = Object.fromEntries(Object.keys(macroLabels).map((key) => [key, goal[key] > 0 ? (total[key] || 0) / goal[key] : null]));
  const ahead = ['carbs', 'fats'].filter((key) => pace[key] !== null && pace[key] > expected + 0.35 && pace[key] > 0.8);
  let status = 'On track';
  let message = 'Your intake so far fits this time of day.';
  if (ahead.length) {
    status = 'Running ahead';
    message = `${ahead.map((key) => macroLabels[key]).join(' and ')} already close to your daily target.`;
  } else if (pace.proteins !== null && expected >= 0.4 && pace.proteins < expected - 0.25) {
    status = 'Protein behind';
    message = `You're ${Math.round(goal.proteins - (total.proteins || 0))}g below your protein target so far.`;
  }
  return { expected, pace, status, message };
}
