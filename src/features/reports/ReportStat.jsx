import { fillStyle } from '../../components/progress.jsx';

export function ReportStat({ label, value, suffix = '' }) {
  return <div className="report-stat"><span>{label}</span><strong>{value.toLocaleString()}<small>{suffix}</small></strong></div>;
}

export function AverageCalories({ value, goal }) {
  return (
    <div className="average-calories">
      <div>
        <strong>{value ? Math.round(value).toLocaleString() : '—'}<small>kcal</small></strong>
        {goal > 0 && <span>of {Math.round(goal).toLocaleString()} goal</span>}
      </div>
      {goal > 0 && <span className="progress-track"><i style={fillStyle(Math.min((value / goal) * 100, 100))} /></span>}
    </div>
  );
}

// With a goal the bar shows progress toward it; without one it compares the macros to each other.
export function MacroBar({ label, value, goal, color, max }) {
  const percent = goal > 0 ? Math.min((value / goal) * 100, 100) : (value / max) * 100;
  return <div className="macro-bar-row"><div><span>{label}</span><strong>{value ? Math.round(value) : '—'}{goal > 0 ? <small> / {Math.round(goal)}g</small> : 'g'}</strong></div><span className={`macro-track macro-track-${color}`}><i style={fillStyle(Math.max(percent, value ? 4 : 0))} /></span></div>;
}
