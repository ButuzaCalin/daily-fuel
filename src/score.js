// Deterministic Daily Macro Score: adherence to protein/carb/fat targets for a completed day.

export const objectives = {
  lose: { label: 'Lose weight', weights: { proteins: 0.5, carbs: 0.25, fats: 0.25 } },
  maintain: { label: 'Maintain', weights: { proteins: 0.35, carbs: 0.35, fats: 0.3 } },
  muscle: { label: 'Build muscle', weights: { proteins: 0.45, carbs: 0.3, fats: 0.25 } },
};

// Retired objectives map to their closest replacement so saved goals keep working.
export function objectiveKey(key) {
  if (key === 'gain') return 'muscle';
  return objectives[key] ? key : 'lose';
}

// Today counts as complete from this hour; earlier days are always complete.
export const DAY_COMPLETE_HOUR = 21;
// Eating window used by the Day Progress pace indicator.
const DAY_START_HOUR = 7;

// Smooth falloff: 100 at zero deviation, easing down as |deviation| grows. `w` sets the width, `k` the shape.
function falloff(deviation, { w, k }) {
  return 100 * Math.exp(-((Math.abs(deviation) / w) ** k));
}

// Curves per macro and side of the target, fitted to the target bands (deviation is relative to target).
const curves = {
  // Protein is a minimum: below target it drops (90% → ~90, 75% → ~71, 50% → ~43), at or above it stays 100.
  proteins: { below: { w: 0.565, k: 1.3 }, above: null },
  // Carbs tolerate a wider undershoot (e.g. 140g: 100–160 excellent, 85/180 good, 70/200 mediocre).
  carbs: { below: { w: 0.545, k: 3.5 }, above: { w: 0.54, k: 1.7 } },
  // Fat is slightly tighter (e.g. 85g: 75–95 excellent, 65/105 good, 55/120 mediocre).
  fats: { below: { w: 0.444, k: 1.7 }, above: { w: 0.483, k: 1.6 } },
};

export const macroLabels = { proteins: 'Protein', carbs: 'Carbs', fats: 'Fat' };

export function macroScore(key, value, target) {
  const deviation = (value - target) / target;
  const curve = deviation < 0 ? curves[key].below : curves[key].above;
  return curve ? falloff(deviation, curve) : 100;
}

export function scoringAvailable(goal) {
  return Boolean(goal?.scoring && goal.proteins > 0 && goal.carbs > 0 && goal.fats > 0);
}

export function scoreLabel(score) {
  if (score >= 90) return 'Excellent day';
  if (score >= 75) return 'Good day';
  if (score >= 60) return 'Fair day';
  return 'Off target';
}

function describeMacro(key, value, target, score) {
  if (key === 'proteins') {
    if (value >= target) return 'protein target reached';
    if (score >= 88) return 'protein just under target';
    return score >= 70 ? 'protein below target' : 'protein well below target';
  }
  if (score >= 88) return 'close to goal';
  const direction = value > target ? 'high' : 'low';
  return score >= 65 ? `a bit ${direction}` : `too ${direction}`;
}

export function calculateScore(total, goal) {
  const weights = objectives[objectiveKey(goal.objective)].weights;
  const macros = Object.keys(weights).map((key) => {
    const value = total[key] || 0;
    const target = goal[key];
    const score = macroScore(key, value, target);
    return { key, label: macroLabels[key], value, target, score, weight: weights[key], points: score * weights[key], note: describeMacro(key, value, target, score) };
  });
  const score = Math.round(Math.min(100, Math.max(0, macros.reduce((sum, macro) => sum + macro.points, 0))));
  const [protein, carbs, fats] = macros.map((macro) => macro.note);
  const rest = carbs === fats ? `carbs and fat ${carbs === 'close to goal' ? 'stayed close to your goals' : carbs}` : `carbs ${carbs}, fat ${fats}`;
  const summary = `${protein.charAt(0).toUpperCase()}${protein.slice(1)}; ${rest}.`;
  return { score, label: scoreLabel(score), macros, summary };
}

// 'past' days are scored, 'today' is scored only after DAY_COMPLETE_HOUR, 'future' never.
export function dayStatus(selectedDate, todayKey, now) {
  if (selectedDate < todayKey) return 'complete';
  if (selectedDate > todayKey) return 'future';
  return now.getHours() >= DAY_COMPLETE_HOUR ? 'complete' : 'in-progress';
}

// Pace check for an unfinished day: compares intake with the share of the eating window that has passed.
export function dayProgress(total, goal, now) {
  const hours = now.getHours() + now.getMinutes() / 60;
  const expected = Math.min(1, Math.max(0, (hours - DAY_START_HOUR) / (DAY_COMPLETE_HOUR - DAY_START_HOUR)));
  const pace = Object.fromEntries(Object.keys(macroLabels).map((key) => [key, (total[key] || 0) / goal[key]]));
  const ahead = ['carbs', 'fats'].filter((key) => pace[key] > expected + 0.35 && pace[key] > 0.8);
  let status = 'On track';
  let message = 'Your intake so far fits this time of day.';
  if (ahead.length) {
    status = 'Running ahead';
    message = `${ahead.map((key) => macroLabels[key]).join(' and ')} already close to the daily goal — keep the rest of the day lighter.`;
  } else if (expected >= 0.4 && pace.proteins < expected - 0.25) {
    status = 'Protein behind';
    message = 'Add some protein to your next meals to reach the minimum.';
  }
  return { expected, pace, status, message };
}
