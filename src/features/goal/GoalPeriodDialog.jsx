import { useId, useLayoutEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { ManualInput } from '../../components/ManualInput.jsx';
import { goalTargetKeys, goalTargets, suggestTarget } from './goal.js';
import { objectives } from '../score/score.js';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';
import { dateKey, formatDate, shiftDate } from '../../lib/date.js';

// Adds a goal starting on a chosen day, or edits/deletes an existing one; `period.isNew` marks a new goal.
export function GoalPeriodDialog({ period, periods, active, showObjective, onSave, onDelete, onClose }) {
  const [shown, closing] = usePresence(period, 150);
  const id = useId();
  const [draft, setDraft] = useState(null);
  useEscape(Boolean(period), onClose);

  useLayoutEffect(() => {
    if (period) setDraft({ from: period.from, objective: period.objective, ...Object.fromEntries(goalTargetKeys.map((key) => [key, period[key] ? String(period[key]) : ''])) });
  }, [period]);

  if (!shown || !draft) return null;
  const originalFrom = shown.isNew ? null : shown.from;
  const today = dateKey(new Date());
  const targets = goalTargets(draft);
  const suggested = suggestTarget(draft);
  const error = !/^\d{4}-\d{2}-\d{2}$/.test(draft.from) ? 'Choose a start date.'
    : draft.from !== originalFrom && periods.some((item) => item.from === draft.from) && !(shown.isNew && draft.from === active?.from) ? `Another goal already starts on ${formatDate(draft.from)}.`
    : !goalTargetKeys.some((key) => targets[key] > 0) ? 'Set at least one target.' : '';
  // A new goal starting on the current goal's start day moves the current goal back a day so earlier days keep it;
  // only when that day already belongs to the previous goal (the current one began today) is it replaced.
  const takesCurrentDay = shown.isNew && draft.from === active?.from;
  const movedFrom = takesCurrentDay && shiftDate(active.from, -1);
  const moved = takesCurrentDay && !(periods[periods.indexOf(active) - 1]?.from >= movedFrom) ? { ...active, from: movedFrom } : null;
  const replacesCurrent = takesCurrentDay && !moved;
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));

  function submit(event) {
    event.preventDefault();
    if (error) return;
    onSave({ from: draft.from, ...targets }, takesCurrentDay ? draft.from : originalFrom, moved);
  }

  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading"><h2 id={`${id}-title`}>{shown.isNew ? 'New goal' : 'Edit goal'}</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        <form className="meal-form goal-period-form" onSubmit={submit}>
          <label className="manual-input goal-period-date">Starts on<input type="date" value={draft.from} onChange={(event) => set({ from: event.target.value })} /></label>
          <ManualInput label="Calories (kcal)" value={draft.calories} suggestion={suggested?.key === 'calories' ? suggested.value : null} onChange={(value) => set({ calories: value })} />
          <ManualInput label="Protein (g)" value={draft.proteins} suggestion={suggested?.key === 'proteins' ? suggested.value : null} onChange={(value) => set({ proteins: value })} />
          <ManualInput label="Carbs (g)" value={draft.carbs} suggestion={suggested?.key === 'carbs' ? suggested.value : null} onChange={(value) => set({ carbs: value })} />
          <ManualInput label="Fat (g)" value={draft.fats} suggestion={suggested?.key === 'fats' ? suggested.value : null} onChange={(value) => set({ fats: value })} />
          {showObjective && (
            <div className="goal-objective goal-period-objective" role="radiogroup" aria-label="Objective">
              <span>Objective</span>
              <div className="objective-toggle">{Object.entries(objectives).map(([key, objective]) => <button className={draft.objective === key ? 'active' : ''} type="button" role="radio" aria-checked={draft.objective === key} onClick={() => set({ objective: key })} key={key}>{objective.label}</button>)}</div>
            </div>
          )}
          <p className="goal-period-hint" data-error={error || undefined}>{error || (replacesCurrent ? 'This replaces the current goal, which also started on this day.' : moved ? `Used from this day on. Your current goal stays on days up to ${formatDate(movedFrom)}.` : draft.from > today ? `Starts automatically on ${formatDate(draft.from)}; until then your current goal stays in use.` : 'Used from this day until the next goal starts.')}</p>
          <div className="dialog-actions">
            {!shown.isNew && periods.length > 1 && <button className="clear-meal-form" type="button" onClick={() => onDelete(shown.from)}><Trash2 aria-hidden="true" />Delete</button>}
            <button type="button" onClick={onClose}>Cancel</button>
            <button className="confirm-add" type="submit" disabled={Boolean(error)}>Save</button>
          </div>
        </form>
      </section>
    </div>
  );
}
