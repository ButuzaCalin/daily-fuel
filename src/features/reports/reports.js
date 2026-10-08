import { dateKey } from '../../lib/date.js';

export const reportMetrics = {
  calories: { label: 'Calories', suffix: 'kcal' },
  proteins: { label: 'Protein', suffix: 'g' },
  carbs: { label: 'Carbs', suffix: 'g' },
  fats: { label: 'Fat', suffix: 'g' },
};

// Completed days only: the range ends yesterday, or today once it is complete (after DAY_COMPLETE_HOUR).
export function reportDays(period, includeToday) {
  const days = [];
  const count = { week: 7, month: 30, quarter: 90 }[period] || 7;
  const today = new Date();
  const last = includeToday ? 0 : 1;
  for (let index = count - 1 + last; index >= last; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    days.push(dateKey(date));
  }
  return days;
}

export function shortDate(value, period) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en', period !== 'week'
    ? { month: 'numeric', day: 'numeric' }
    : { weekday: 'short' }).format(date);
}

// Within 10% of the goal counts as on target; extra protein is never "over", matching the scoring.
export function goalTone(value, goal, metric) {
  if (!(goal > 0)) return 'none';
  if (value < goal * 0.9) return 'under';
  if (value > goal * 1.1 && metric !== 'proteins') return 'over';
  return 'on';
}
