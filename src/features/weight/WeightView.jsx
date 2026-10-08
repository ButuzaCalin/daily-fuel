import { useState } from 'react';
import { Menu as MenuIcon, Trash2 } from 'lucide-react';
import { HeaderQuota } from '../../components/HeaderQuota.jsx';
import { Menu } from '../../components/Menu.jsx';
import { Toast } from '../../components/Toast.jsx';
import { emptyNutrition, sumNutrition } from '../meals/nutrition.js';
import { reportMetrics } from '../reports/reports.js';
import { dayStatus } from '../score/score.js';
import { WeightChart } from './WeightChart.jsx';
import { WeightMacros } from './WeightMacros.jsx';
import { formatWeight, formatWeightChange } from './format.js';
import { dateKey, formatDate, shiftDate } from '../../lib/date.js';
import { decimalInput } from '../../lib/format.js';

// A weigh-in covers the days from the previous weigh-in up to the day before it; only completed, logged days count.
export function WeightView({ goal, quota, mealsByDate, weights, setWeights, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, notify }) {
  const now = new Date();
  const todayKey = dateKey(now);
  const [date, setDate] = useState(todayKey);
  const [weight, setWeight] = useState('');
  const entries = [...weights].sort((first, second) => first.date.localeCompare(second.date));
  const last = entries.at(-1);

  function averageMacros(start, end) {
    const days = [];
    for (let day = start; day < end; day = shiftDate(day, 1)) {
      const meals = mealsByDate[day] || [];
      if (meals.length && dayStatus(day, todayKey, now) === 'complete') days.push(sumNutrition(meals));
    }
    const total = days.reduce((sum, nutrition) => Object.fromEntries(Object.keys(emptyNutrition).map((key) => [key, sum[key] + nutrition[key]])), { ...emptyNutrition });
    return { average: Object.fromEntries(Object.keys(emptyNutrition).map((key) => [key, days.length ? total[key] / days.length : 0])), days: days.length };
  }

  const sinceLast = last ? averageMacros(last.date, shiftDate(todayKey, 1)) : null;
  const history = entries.map((entry, index) => {
    const previous = entries[index - 1];
    return { ...entry, change: previous ? entry.weight - previous.weight : null, macros: previous ? averageMacros(previous.date, entry.date) : null };
  }).reverse();

  function logWeight(event) {
    event.preventDefault();
    const value = Math.round(Number(weight) * 10) / 10;
    if (!(value > 0)) return notify('Enter your weight.');
    if (!date || date > todayKey) return notify('Choose a date up to today.');
    setWeights((current) => [...current.filter((entry) => entry.date !== date), { date, weight: value }]);
    setWeight('');
    notify('Weight logged.', 'success');
  }

  function removeWeight(entry) {
    setWeights((current) => current.filter((item) => item.date !== entry.date));
    notify('Weigh-in deleted.', 'info', { label: 'Undo', onClick: () => setWeights((current) => [...current.filter((item) => item.date !== entry.date), entry]) });
  }

  return (
    <main className="app-shell reports-page weight-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button>
        <HeaderQuota quota={quota} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">Weigh-ins</p><h1>Weight</h1></div></div>

      {last && (
        <section className="chart-card weight-card weight-trend">
          <div className="weight-current">
            <div>
              <span>Current weight</span>
              <strong>{formatWeight(last.weight)}<small> kg</small></strong>
              <small>{formatDate(last.date)}</small>
            </div>
            {entries.length >= 2 && (
              <dl className="weight-deltas">
                <div><dt>Last change</dt><dd>{formatWeightChange(last.weight - entries.at(-2).weight)}<small> kg</small></dd></div>
                <div><dt>Since {formatDate(entries[0].date)}</dt><dd>{formatWeightChange(last.weight - entries[0].weight)}<small> kg</small></dd></div>
              </dl>
            )}
          </div>
          {entries.length >= 2 ? <WeightChart entries={entries} /> : <p className="usage-empty">Log another weigh-in to see your trend.</p>}
        </section>
      )}

      <form className="settings-form weight-form" onSubmit={logWeight}>
        <h2>Log weight</h2>
        <div className="weight-inputs">
          <label>Date<input type="date" value={date} max={todayKey} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Weight (kg)<input type="text" inputMode="decimal" value={weight} onChange={(event) => setWeight(decimalInput(event.target.value))} /></label>
        </div>
        <button className="auth-submit" type="submit">Log weight</button>
      </form>

      {last && (
        <section className="chart-card weight-card">
          <div className="card-heading"><h2>Average daily macros</h2><span>since {formatDate(last.date)}{sinceLast.days ? ` · ${sinceLast.days} ${sinceLast.days === 1 ? 'day' : 'days'}` : ''}</span></div>
          {sinceLast.days ? (
            <div className="weight-averages">
              {Object.entries(reportMetrics).map(([key, metric]) => <div key={key}><span>{metric.label}</span><strong>{Math.round(sinceLast.average[key]).toLocaleString()}<small>{metric.suffix}</small></strong></div>)}
            </div>
          ) : <p className="usage-empty">No completed days logged since then yet.</p>}
        </section>
      )}

      <section className="chart-card weight-card">
        <div className="card-heading"><h2>History</h2><span>{entries.length} {entries.length === 1 ? 'weigh-in' : 'weigh-ins'}</span></div>
        {history.length === 0 ? <p className="usage-empty">No weigh-ins yet.</p> : (
          <div className="weight-list">
            {history.map((entry) => (
              <div className="weight-row" key={entry.date}>
                <div className="weight-row-main">
                  <span>{formatDate(entry.date)}</span>
                  <strong>{formatWeight(entry.weight)}<small> kg</small></strong>
                  {entry.change !== null && <small className="weight-change">{formatWeightChange(entry.change)} kg</small>}
                </div>
                {entry.change === null ? <small className="weight-row-note">First weigh-in</small> : <WeightMacros result={entry.macros} />}
                <button className="remove-button" type="button" onClick={() => removeWeight(entry)} aria-label={`Delete weigh-in on ${formatDate(entry.date)}`} title="Delete weigh-in"><Trash2 /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
