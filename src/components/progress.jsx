// Progress fills slide via transform so value changes animate without layout work.
export function fillStyle(percent) {
  return { transform: `translateX(${(Number.isFinite(percent) ? percent : 0) - 100}%)` };
}

export function Macro({ label, value, goal, color }) {
  return <div className={`macro macro-${color}`}><span className="macro-bar" /><div className="macro-content"><div><strong>{value ? Math.round(value) : '—'}<small>g</small></strong><span>{label}{goal ? ` / ${Math.round(goal)}g` : ''}</span></div>{goal > 0 && <span className="progress-track"><i style={fillStyle(Math.min((value / goal) * 100, 100))} /></span>}</div></div>;
}

export function GoalProgress({ value, goal, color }) {
  return <div className={`goal-progress goal-progress-${color}`}><span className="progress-track"><i style={fillStyle(Math.min((value / goal) * 100, 100))} /></span></div>;
}
