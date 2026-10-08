import { useId } from 'react';
import { X } from 'lucide-react';
import { fillStyle } from '../../components/progress.jsx';
import { scoreTone } from './DayScore.jsx';
import { calculateScore, DAY_COMPLETE_HOUR, dayProgress, macroLabels, metrics, objectiveKey, objectives } from './score.js';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';

export function ScoreDialog({ open, total, goal, meals, pendingCount, status, now, onClose }) {
  const [shown, closing] = usePresence(open ? { total, goal, meals, pendingCount, status, now } : null, 150);
  const id = useId();
  useEscape(open, onClose);
  if (!shown) return null;
  const objective = objectives[objectiveKey(shown.goal.objective)];
  const result = shown.meals.length && shown.status === 'complete' ? calculateScore(shown.total, shown.goal) : null;
  const scored = result?.score != null;
  const final = scored;
  const hasValues = shown.meals.length > shown.pendingCount;
  const progress = shown.status === 'in-progress' ? dayProgress(shown.total, shown.goal, shown.now) : null;
  const weighted = result ? result.metrics.filter((metric) => metric.scored) : [];
  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog score-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading"><h2 id={`${id}-title`}>Daily Score</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        {scored ? (
          <>
            <div className={`score-hero${final ? ` day-score-${scoreTone(result.score)}` : ''}`}><strong>{result.score}<small> / 100</small></strong><span>{final ? result.label : 'So far'}</span></div>
            {final
              ? <p className="score-summary">{result.summary}</p>
              : <p className="score-summary">Based on today's logged food so far. The final score is set once the day is complete (after {DAY_COMPLETE_HOUR}:00).</p>}
            <table className="score-table">
              <thead><tr><th>Target</th><th>Eaten / target</th><th>Score</th><th>Weight</th><th>Points</th></tr></thead>
              <tbody>
                {weighted.map((metric) => (
                  <tr key={metric.key}>
                    <th scope="row">{metric.label}</th>
                    <td>{Math.round(metric.value)} / {Math.round(metric.target)}{metric.unit === 'kcal' ? '' : 'g'}</td>
                    <td>{Math.round(metric.score)}</td>
                    <td>× {Math.round(metric.weight * 100)}%</td>
                    <td>{metric.points.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row" colSpan="4">Total</th><td>{result.score}</td></tr></tfoot>
            </table>
          </>
        ) : progress ? (
          <>
            <div className="score-hero"><strong>—<small> / 100</small></strong><span>Day in progress</span></div>
            <p className="score-summary">Your score appears once the day is complete (after {DAY_COMPLETE_HOUR}:00).</p>
          </>
        ) : (
          <p className="score-summary">{shown.meals.length ? 'Add or estimate values for your meals to get a score.' : 'Log meals for this day to get a score.'}</p>
        )}
        {progress && hasValues && (
          <div className="day-progress">
            <div><span>Day progress</span><strong>{progress.status}</strong></div>
            <p>{progress.message}</p>
            {Object.entries(macroLabels).filter(([key]) => progress.pace[key] !== null).map(([key, label]) => (
              <div className="day-progress-row" key={key}>
                <span>{label}</span>
                <span className="progress-track"><i style={fillStyle(Math.min(progress.pace[key] * 100, 100))} /><b style={{ left: `${progress.expected * 100}%` }} /></span>
                <span>{Math.round(shown.total[key] || 0)} / {Math.round(shown.goal[key])}g</span>
              </div>
            ))}
            <small>Marker shows about {Math.round(progress.expected * 100)}% — where you'd typically be by now.</small>
          </div>
        )}
        {scored && shown.pendingCount > 0 && <p className="score-note">{shown.pendingCount} {shown.pendingCount === 1 ? 'meal has' : 'meals have'} no values yet and {shown.pendingCount === 1 ? 'is' : 'are'} not counted.</p>}
        <details className="score-method">
          <summary>How it's calculated</summary>
          <p>Each target you've set gets a 0–100 score for how closely you followed it, weighted for your objective (<strong>{objective.label}</strong>: {metrics.map((metric) => `${metric.label.toLowerCase()} ${Math.round(objective.weights[metric.key] * 100)}%`).join(', ')}).</p>
          <ul>
            <li><strong>Calories</strong>: {objective.calorieNote}</li>
            <li><strong>Protein</strong> eases down the further you fall below your target (90% → ~90, 75% → ~65); going a little over isn't penalised.</li>
            <li><strong>Carbs</strong> and <strong>fat</strong> have some room either side of your target before the score drops.</li>
          </ul>
          <p>When one macro explains most of a calorie difference, part of its penalty is forgiven so the same food isn't counted twice. Targets you haven't set aren't scored, and their weight goes to the others.</p>
        </details>
      </section>
    </div>
  );
}
