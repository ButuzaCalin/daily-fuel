import { metrics, objectiveKey } from '../score/score.js';
import { dateKey, formatDate, shiftDate } from '../../lib/date.js';

export const goalTargetKeys = ['calories', 'proteins', 'carbs', 'fats'];

export function goalTargets(value) {
  return { ...Object.fromEntries(goalTargetKeys.map((key) => [key, Math.max(0, Number(value?.[key]) || 0)])), objective: objectiveKey(value?.objective) };
}

// Goals are kept as periods, each used from its `from` date until the next one starts; the oldest also covers
// earlier days. Goals saved before periods existed become a single period starting today.
function goalPeriods(value) {
  const saved = Array.isArray(value?.periods) ? value.periods : null;
  const periods = saved
    ? saved.filter((period) => /^\d{4}-\d{2}-\d{2}$/.test(period?.from)).map((period) => ({ from: period.from, ...goalTargets(period) }))
    : goalTargetKeys.some((key) => Number(value?.[key]) > 0) ? [{ from: dateKey(new Date()), ...goalTargets(value) }] : [];
  return [...new Map(periods.map((period) => [period.from, period])).values()].sort((first, second) => first.from.localeCompare(second.from));
}

// The period in effect on `date`; days before the oldest period use the oldest.
export function activePeriod(periods, date) {
  return periods.findLast((item) => item.from <= date) || periods[0];
}

// The top-level targets mirror today's period. Goals can start in the future, so App re-derives them with goalOn
// on every render and a goal starting tomorrow takes over without a save.
// Scoring can only stay on while at least one target is set.
export function normalizeGoal(value) {
  const periods = goalPeriods(value);
  const targets = goalTargets(activePeriod(periods, dateKey(new Date())));
  const anyTarget = goalTargetKeys.some((key) => targets[key] > 0);
  return { ...targets, periods, scoring: Boolean(value?.scoring && anyTarget), weightTracking: Boolean(value?.weightTracking), workouts: Boolean(value?.workouts) };
}

// The goal with the targets and objective that applied on `date`.
export function goalOn(goal, date) {
  if (!goal?.periods?.length) return goal;
  return { ...goal, ...goalTargets(activePeriod(goal.periods, date)) };
}

// The oldest goal also covers the days before its start, so it reads "Until …".
export function periodRange(period, next, oldest, today) {
  if (!next) return oldest ? 'All days' : `${period.from > today ? 'From' : 'Since'} ${formatDate(period.from)}`;
  return oldest ? `Until ${formatDate(shiftDate(next.from, -1))}` : `${formatDate(period.from)} – ${formatDate(shiftDate(next.from, -1))}`;
}

export function goalSummary(period) {
  const parts = [period.calories > 0 && `${Math.round(period.calories)} kcal`, ...metrics.slice(1).filter(({ key }) => period[key] > 0).map(({ key, label }) => `${label} ${Math.round(period[key])}g`)].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No targets';
}
