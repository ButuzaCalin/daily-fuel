import { useId } from 'react';
import { formatWeight } from './format.js';
import { formatDate } from '../../lib/date.js';
import { chartNumber, niceStep } from '../../lib/format.js';

// Line chart with x spaced by date (weigh-ins are irregular) and y fitted tightly to the weight range instead of starting at 0.
export function WeightChart({ entries }) {
  const gradientId = `weight-fill-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const values = entries.map((entry) => entry.weight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = niceStep(Math.max(max - min, 0.6) / 3);
  const low = Math.floor((min - step / 4) / step) * step;
  const high = Math.ceil((max + step / 4) / step) * step;
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => Math.round((high - index * step) * 10) / 10);
  const time = (date) => new Date(`${date}T12:00:00`).getTime();
  const start = time(entries[0].date);
  const span = Math.max(time(entries.at(-1).date) - start, 1);
  // Inset the ends so the first and last dots are not clipped by the plot edges.
  const chartX = (date) => 3 + ((time(date) - start) / span) * 94;
  const chartY = (value) => 6 + (1 - (value - low) / (high - low)) * 88;
  const chartPx = (value) => `${(chartY(value) / 100) * 168}px`;
  const points = entries.map((entry) => `${chartX(entry.date)},${chartY(entry.weight)}`);
  const latest = entries.at(-1);
  const labelDate = (value) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
  const labels = entries.length > 2 ? [start, start + span / 2, start + span] : [start, start + span];
  return (
    <div className="line-chart weight-chart">
      <div className="chart-scale" aria-hidden="true">{ticks.map((tick) => <span key={tick} style={{ top: chartPx(tick) }}>{chartNumber(tick)}</span>)}</div>
      <div className="chart-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Weight over time line chart">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--green)" stopOpacity=".18" />
              <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => <line key={tick} x1="0" y1={chartY(tick)} x2="100" y2={chartY(tick)} className={tick === ticks.at(-1) ? 'chart-axis' : 'chart-grid'} />)}
          <polygon points={`${chartX(entries[0].date)},${chartY(low)} ${points.join(' ')} ${chartX(latest.date)},${chartY(low)}`} fill={`url(#${gradientId})`} />
          <polyline points={points.join(' ')} className="chart-line" />
        </svg>
        {entries.map((entry) => <span key={entry.date} className={`chart-dot${entry === latest ? ' is-latest' : ''}`} style={{ left: `${chartX(entry.date)}%`, top: chartPx(entry.weight) }} title={`${formatDate(entry.date)}: ${formatWeight(entry.weight)} kg`} />)}
        <div className="chart-labels">{labels.map((value, index) => <span key={index}>{labelDate(value)}</span>)}</div>
      </div>
    </div>
  );
}
