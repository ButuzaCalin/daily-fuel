import { scoreTone } from './DayScore.jsx';
import { scoreLabel } from './score.js';

// Literal colors for the poster's SVG ring, which the image export can't style through CSS.
const toneColors = { great: '#34704d', good: '#4f8a3c', fair: '#b58a1d', low: '#c66b59', none: '#747b76' };

// Story-sized (1080×1920) image of a month's scores, rendered off-screen and captured by the share button.
export function SharePoster({ ref, month, days, leading, scores, average }) {
  const tone = average === null ? 'none' : scoreTone(average);
  const ring = 2 * Math.PI * 250;
  const best = scores.length ? Math.max(...scores) : null;
  const greatDays = scores.filter((score) => score >= 90).length;
  let streak = 0;
  let run = 0;
  days.forEach((day) => { run = day.score !== null && day.score >= 75 ? run + 1 : 0; streak = Math.max(streak, run); });
  return (
    <div className={`share-poster day-score-${tone}`} ref={ref}>
      <header className="poster-brand"><span className="brand-mark">DF</span><span>Daily Fuel</span></header>
      <div className="poster-title"><p>Daily score</p><h2>{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(month)}</h2></div>
      <div className="poster-hero">
        <svg viewBox="0 0 560 560" aria-hidden="true">
          <circle cx="280" cy="280" r="250" fill="none" stroke={toneColors[tone]} strokeOpacity="0.16" strokeWidth="34" />
          <circle cx="280" cy="280" r="250" fill="none" stroke={toneColors[tone]} strokeWidth="34" strokeLinecap="round" strokeDasharray={`${ring * (average ?? 0) / 100} ${ring}`} transform="rotate(-90 280 280)" />
        </svg>
        <div className="poster-average">
          <small>Monthly average</small>
          <strong>{average ?? '–'}</strong>
          <span>{average === null ? 'No scored days' : scoreLabel(average)}</span>
        </div>
      </div>
      <div className="poster-stats">
        <div><strong>{scores.length}</strong><span>{scores.length === 1 ? 'day scored' : 'days scored'}</span></div>
        <div><strong>{best ?? '–'}</strong><span>best day</span></div>
        <div><strong>{greatDays}</strong><span>{greatDays === 1 ? 'great day' : 'great days'}</span></div>
        <div><strong>{streak}</strong><span>best streak 75+</span></div>
      </div>
      <div className="poster-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span className="poster-weekday" key={index}>{label}</span>)}
        {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}
        {days.map((day) => (
          <div className={`poster-day${day.score !== null ? ` day-score-${scoreTone(day.score)}` : ''}`} key={day.date}>
            <small>{day.day}</small>
            <strong>{day.score ?? ''}</strong>
          </div>
        ))}
      </div>
      <footer className="poster-legend">
        <span className="day-score-great">90+ great</span>
        <span className="day-score-good">75+ good</span>
        <span className="day-score-fair">60+ fair</span>
        <span className="day-score-low">below 60</span>
      </footer>
    </div>
  );
}
