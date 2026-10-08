import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { dateKey } from '../../lib/date.js';
import { mean } from '../../lib/format.js';
import { loadLocal, saveLocal } from '../../lib/storage.js';

function mealMinutes(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return Number.isFinite(hours) ? hours * 60 + (minutes || 0) : null;
}

function clockLabel(minutes) {
  const rounded = Math.round(minutes / 15) * 15;
  return `${String(Math.floor(rounded / 60) % 24).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function durationLabel(minutes) {
  const hours = Math.round(minutes / 30) / 2;
  return `${hours}h`;
}

// Plain-language takeaways from meal times; each one needs at least 3 logged days to be shown.
export function MealTimeInsights({ days }) {
  const [collapsed, setCollapsed] = useState(() => loadLocal('daily-fuel-insights-collapsed', false));
  const logged = days
    .map((day) => ({ date: day.date, times: day.meals.map((meal) => mealMinutes(meal.time)).filter((value) => value !== null).sort((a, b) => a - b) }))
    .filter((day) => day.times.length);
  if (logged.length < 3) return null;

  const firsts = logged.map((day) => day.times[0]);
  const lasts = logged.map((day) => day.times.at(-1));
  const insights = [];

  const window = mean(lasts) - mean(firsts);
  insights.push(`Logged meals usually fall between ${clockLabel(mean(firsts))} and ${clockLabel(mean(lasts))}, a ${durationLabel(window)} window.`);

  const fasts = [];
  for (let index = 1; index < logged.length; index += 1) {
    const previous = new Date(`${logged[index - 1].date}T12:00:00`);
    previous.setDate(previous.getDate() + 1);
    if (dateKey(previous) === logged[index].date) fasts.push(24 * 60 - logged[index - 1].times.at(-1) + logged[index].times[0]);
  }
  if (fasts.length >= 2) insights.push(`About ${durationLabel(mean(fasts))} usually pass between the last logged meal and the next day's first.`);

  const spread = Math.sqrt(mean(firsts.map((value) => (value - mean(firsts)) ** 2)));
  insights.push(spread <= 45 ? 'The first logged meal is at a similar time each day, within about 45 min.' : `The first logged meal varies by about ±${durationLabel(spread)} from day to day.`);

  const allTimes = logged.flatMap((day) => day.times);
  const late = allTimes.filter((value) => value >= 21 * 60).length / allTimes.length;
  if (late >= 0.15) insights.push(`${Math.round(late * 100)}% of logged meals are at 21:00 or later.`);

  const isWeekend = (date) => [0, 6].includes(new Date(`${date}T12:00:00`).getDay());
  const weekendFirsts = logged.filter((day) => isWeekend(day.date)).map((day) => day.times[0]);
  const weekdayFirsts = logged.filter((day) => !isWeekend(day.date)).map((day) => day.times[0]);
  if (weekendFirsts.length && weekdayFirsts.length) {
    const shift = mean(weekendFirsts) - mean(weekdayFirsts);
    if (Math.abs(shift) >= 45) insights.push(`On weekends the first logged meal is ${durationLabel(Math.abs(shift))} ${shift > 0 ? 'later' : 'earlier'} than on weekdays.`);
  }

  function toggle() {
    setCollapsed((current) => {
      saveLocal('daily-fuel-insights-collapsed', !current);
      return !current;
    });
  }

  return (
    <div className="heatmap-insights">
      <button className="insights-toggle" type="button" onClick={toggle} aria-expanded={!collapsed}>
        From your log<ChevronDown aria-hidden="true" data-collapsed={collapsed || undefined} />
      </button>
      {!collapsed && <ul>{insights.map((text) => <li key={text}>{text}</li>)}</ul>}
    </div>
  );
}
