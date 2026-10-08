import { useState } from 'react';
import { Menu as MenuIcon } from 'lucide-react';
import { HeaderQuota } from '../../components/HeaderQuota.jsx';
import { Menu } from '../../components/Menu.jsx';
import { Toast } from '../../components/Toast.jsx';
import { goalOn } from '../goal/goal.js';
import { emptyNutrition } from '../meals/nutrition.js';
import { MealTimeHeatmap } from './MealTimeHeatmap.jsx';
import { AverageCalories, MacroBar, ReportStat } from './ReportStat.jsx';
import { goalTone, reportMetrics, shortDate } from './reports.js';
import { DAY_COMPLETE_HOUR } from '../score/score.js';
import { formatDate } from '../../lib/date.js';
import { chartNumber, compactNumber, niceStep } from '../../lib/format.js';

export function ReportsView({ goal, quota, mealsByDate, onOpenDay, report, period, setPeriod, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast }) {
  const [metric, setMetric] = useState('calories');
  const metricInfo = reportMetrics[metric];
  const goalValue = goal?.[metric] || 0;
  const chartPeak = Math.max(...report.days.map((day) => day.nutrition[metric]), goalValue, 1);
  const chartStep = niceStep(chartPeak / 4);
  const tickCount = Math.max(Math.ceil(chartPeak / chartStep), 1);
  const maxValue = chartStep * tickCount;
  const chartTicks = Array.from({ length: tickCount + 1 }, (_, index) => (tickCount - index) * chartStep);
  const percentOf = (value) => `${(value / maxValue) * 100}%`;
  const labelStep = { month: 5, quarter: 15 }[period] || 1;
  const loggedDays = report.days.filter((day) => day.meals.length).length;
  const average = loggedDays ? Object.fromEntries(Object.keys(emptyNutrition).map((key) => [key, report.total[key] / loggedDays])) : emptyNutrition;
  const averageMax = Math.max(average.proteins, average.carbs, average.fats, 1);
  const mealCount = report.days.reduce((sum, day) => sum + day.meals.length, 0);
  const calorieGoal = goal?.calories || 0;
  const onTargetDays = report.days.filter((day) => day.meals.length && goalTone(day.nutrition.calories, goalOn(goal, day.date)?.calories) === 'on').length;
  const stats = [
    { label: 'Days logged', value: loggedDays, suffix: `/ ${report.days.length}` },
    calorieGoal > 0 && { label: 'On target', value: onTargetDays, suffix: `/ ${loggedDays}` },
    { label: 'Meals per day', value: loggedDays ? Math.round((mealCount / loggedDays) * 10) / 10 : 0 },
  ].filter(Boolean);

  return (
    <main className="app-shell reports-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home">
          <span className="brand-mark">DF</span>
          <span>Daily Fuel</span>
        </button>
        <HeaderQuota quota={quota} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />

      <div className="reports-heading">
        <div><p className="eyebrow">Overview · {new Date().getHours() >= DAY_COMPLETE_HOUR ? 'up to today' : `up to yesterday · today will be added at ${DAY_COMPLETE_HOUR}:00`}</p><h1>Reports</h1></div>
        <div className="period-toggle" role="group" aria-label="Report period">
          <button className={period === 'week' ? 'active' : ''} type="button" onClick={() => setPeriod('week')}>7 days</button>
          <button className={period === 'month' ? 'active' : ''} type="button" onClick={() => setPeriod('month')}>30 days</button>
          <button className={period === 'quarter' ? 'active' : ''} type="button" onClick={() => setPeriod('quarter')}>3 months</button>
        </div>
      </div>

      <section className="report-summary-grid" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((stat) => <ReportStat key={stat.label} {...stat} />)}
      </section>

      <section className="chart-card macro-card"><div className="card-heading"><h2>Daily average</h2><span>per logged day</span></div><AverageCalories value={average.calories} goal={goal?.calories} /><MacroBar label="Protein" value={average.proteins} goal={goal?.proteins} color="green" max={averageMax} /><MacroBar label="Carbs" value={average.carbs} goal={goal?.carbs} color="yellow" max={averageMax} /><MacroBar label="Fat" value={average.fats} goal={goal?.fats} color="coral" max={averageMax} /></section>

      <section className="chart-card report-chart-card">
        <div className="card-heading chart-heading"><h2>{metricInfo.label} per day</h2><div className="metric-toggle" role="group" aria-label="Chart metric">{Object.entries(reportMetrics).map(([key, item]) => <button className={metric === key ? 'active' : ''} type="button" onClick={() => setMetric(key)} key={key}>{item.label}</button>)}</div></div>
        {goalValue > 0 && <div className="bar-legend" aria-hidden="true"><span><i className="tone-under" />Under</span><span><i className="tone-on" />{metric === 'proteins' ? 'Goal reached' : 'On target'}</span>{metric !== 'proteins' && <span><i className="tone-over" />Over</span>}<span><b />Goal {chartNumber(goalValue)} {metricInfo.suffix}</span></div>}
        <div className="bar-chart" data-period={period}>
          <div className="bar-scale" aria-hidden="true">{chartTicks.map((tick) => <span key={tick} style={{ bottom: percentOf(tick) }}>{chartNumber(tick)}</span>)}</div>
          <div className="bar-plot">
            {chartTicks.map((tick) => <i key={tick} className="bar-grid" style={{ bottom: percentOf(tick) }} />)}
            {goalValue > 0 && <i className="bar-goal" style={{ bottom: percentOf(goalValue) }} />}
            {report.days.map((day) => {
              const value = day.nutrition[metric];
              const logged = day.meals.length > 0;
              const label = `${formatDate(day.date)}: ${logged ? `${Math.round(value).toLocaleString()} ${metricInfo.suffix}` : 'nothing logged'}`;
              return (
                <button key={day.date} className="bar-column" type="button" onClick={() => onOpenDay(day.date)} aria-label={`${label}. Open day`} title={label}>
                  {logged ? <i className={`tone-${goalTone(value, goalOn(goal, day.date)?.[metric], metric)}`} style={{ height: percentOf(value) }} /> : <i className="bar-empty" />}
                  {period === 'week' && logged && <small style={{ bottom: percentOf(value) }}>{compactNumber(value)}</small>}
                </button>
              );
            })}
          </div>
          <div className="bar-labels" aria-hidden="true">{report.days.map((day, index) => <span key={day.date} data-muted={!day.meals.length || undefined}>{index % labelStep === 0 ? shortDate(day.date, period) : ''}</span>)}</div>
        </div>
        <p className="bar-hint">Tap a day to open it.</p>
      </section>

      <MealTimeHeatmap days={report.days} />
    </main>
  );
}
