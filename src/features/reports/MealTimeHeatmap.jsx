import { MealTimeInsights } from './MealTimeInsights.jsx';

const heatmapWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Meal counts per weekday × hour; the hour range covers 06–23 and stretches to any earlier or later meal.
export function MealTimeHeatmap({ days }) {
  const grid = heatmapWeekdays.map(() => Array(24).fill(0));
  const byHour = Array(24).fill(0);
  for (const day of days) {
    const weekday = (new Date(`${day.date}T12:00:00`).getDay() + 6) % 7;
    for (const meal of day.meals) {
      const hour = Number.parseInt(meal.time, 10);
      if (!(hour >= 0 && hour < 24)) continue;
      grid[weekday][hour] += 1;
      byHour[hour] += 1;
    }
  }
  const logged = byHour.map((count, hour) => (count ? hour : null)).filter((hour) => hour !== null);
  if (!logged.length) return null;
  const firstHour = Math.min(6, ...logged);
  const lastHour = Math.max(23, ...logged);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const peak = Math.max(...grid.flat());
  const busiest = byHour.indexOf(Math.max(...byHour));
  const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

  return (
    <section className="chart-card report-chart-card">
      <div className="card-heading"><h2>Logged meal times</h2><span>most logged around {hourLabel(busiest)}</span></div>
      <div className="heatmap" style={{ '--hours': hours.length }}>
        {grid.map((row, weekday) => (
          <div className="heatmap-row" key={heatmapWeekdays[weekday]}>
            <span>{heatmapWeekdays[weekday]}</span>
            {hours.map((hour) => {
              const count = row[hour];
              return <i key={hour} title={`${heatmapWeekdays[weekday]} ${hourLabel(hour)}: ${count} ${count === 1 ? 'meal' : 'meals'}`} style={count ? { opacity: 0.25 + (count / peak) * 0.75 } : undefined} data-empty={!count || undefined} />;
            })}
          </div>
        ))}
        <div className="heatmap-row heatmap-hours" aria-hidden="true">
          <span />
          {hours.map((hour) => <small key={hour}>{hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</small>)}
        </div>
      </div>
      <p className="bar-hint">Darker cells mean more meals logged at that hour.</p>
      <MealTimeInsights days={days} />
    </section>
  );
}
