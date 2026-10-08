import { useState } from 'react';
import { Check, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { WorkoutIcon } from './WorkoutIcon.jsx';
import { DialogShell } from './dialogs.jsx';
import { durationLabel, elapsed, exerciseSummary, formatDuration, formEntry, setLabel, whole } from './workouts.js';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';
import { dateKey, formatDate } from '../../lib/date.js';
import { decimalInput, plural } from '../../lib/format.js';

// Lists the workout's exercises, each started on its own. A started exercise fills the modal by itself until it is ended:
// last time's sets above, today's below, and one row for the next set. Closing a live workout only hides it.
export function RoutineDialog({ routine, live, hintHidden, onHideHint, now, notes, onChange, onClose, onEnd, onDiscard }) {
  const [shown, closing] = usePresence(routine, 150);
  // Typed values for the next set; empty fields fall back to the placeholder, so repeating a set is one tap.
  const [input, setInput] = useState({});
  useEscape(Boolean(routine), onClose);
  if (!shown) return null;
  const exercise = shown.exercises.find((item) => item.id === shown.active);
  const setActive = (active) => { setInput({}); onChange({ active }); };
  const dayLabel = shown.date === dateKey(new Date()) ? 'Today' : formatDate(shown.date);
  const timer = live ? (shown.startedAt ? formatDuration(elapsed(shown, now)) : '') : shown.duration > 0 ? durationLabel(shown) : '';
  const doneCount = shown.exercises.filter((item) => item.sets.length).length;

  if (!exercise) return (
    <DialogShell shown={shown} closing={closing} title={<span className="workout-dialog-title"><WorkoutIcon name={shown.icon} />{shown.name}</span>} onClose={onClose} className="routine-dialog">
      <p className="workout-dialog-date">{dayLabel}{timer && <> · <span className="routine-timer">{timer}</span></>}</p>
      {live && !hintHidden && <div className="routine-hint"><p className="routine-save-hint">Closing this window or app won't stop your workout. Your progress is saved, so you can come back and continue.</p><button type="button" onClick={onHideHint} aria-label="Hide hint" title="Hide hint"><EyeOff aria-hidden="true" /></button></div>}
      {notes?.trim() && <p className="routine-notes">{notes}</p>}
      <div className="routine-list">
        {shown.exercises.map((item) => (
          <div className={`routine-item${item.sets.length ? ' is-done' : ''}`} key={item.id}>
            <span className="routine-item-check" aria-hidden="true">{item.sets.length > 0 && <Check />}</span>
            <span className="routine-item-main">
              <strong>{item.name}</strong>
              <small>{item.sets.length ? exerciseSummary(item) : item.previous ? `Last: ${exerciseSummary({ type: item.type, sets: item.previous.sets })}` : 'Not done yet'}</small>
            </span>
            <button className="routine-item-start" type="button" onClick={() => setActive(item.id)}>{item.sets.length ? 'Edit' : 'Start'}</button>
          </div>
        ))}
      </div>
      <div className={`dialog-actions routine-actions${live ? ' is-live' : ''}`}>
        {live && <button className="routine-close" type="button" onClick={onClose}>Close</button>}
        {!live && <button className="clear-meal-form" type="button" onClick={onDiscard}><Trash2 aria-hidden="true" />Delete</button>}
        <button className="confirm-add" type="button" onClick={onEnd}>{live ? 'Finish workout' : 'Save'}{doneCount > 0 && ` · ${doneCount}/${shown.exercises.length}`}</button>
      </div>
    </DialogShell>
  );

  const { type } = exercise;
  const index = exercise.sets.length;
  const last = exercise.previous?.sets || [];
  const suggestion = exercise.sets[index - 1] || last[index] || last[last.length - 1] || null;
  const placeholder = suggestion ? formEntry({ sets: 0, ...suggestion }) : {};
  const value = (key) => ((input[key] ?? '') !== '' ? input[key] : placeholder[key] || '');
  const next = type === 'time' ? { reps: 0, weight: 0, seconds: whole(value('min')) * 60 + whole(value('sec')) } : { reps: whole(value('reps')), weight: Math.max(0, Math.round(Number(value('weight')) * 10) / 10 || 0), seconds: 0 };
  const canAdd = type === 'time' ? next.seconds > 0 : next.reps > 0;
  const fields = type === 'time' ? [['min', 'min', 'numeric'], ['sec', 'sec', 'numeric']] : [['reps', 'reps', 'numeric'], ['weight', 'kg', 'decimal']];
  const updateSets = (sets) => onChange({ exercises: shown.exercises.map((item) => (item.id === exercise.id ? { ...item, sets } : item)) });
  function addSet(event) {
    event.preventDefault();
    if (!canAdd) return;
    updateSets([...exercise.sets, next]);
    setInput({});
  }
  return (
    <DialogShell shown={shown} closing={closing} title={exercise.name} onClose={onClose} className="routine-dialog">
      <p className="workout-dialog-date">{shown.name}{timer && <> · <span className="routine-timer">{timer}</span></>}</p>
      {live && !hintHidden && <div className="routine-hint"><p className="routine-save-hint">Closing this window or app won't stop your workout. Your progress is saved, so you can come back and continue.</p><button type="button" onClick={onHideHint} aria-label="Hide hint" title="Hide hint"><EyeOff aria-hidden="true" /></button></div>}
      {exercise.previous && (
        <div className="routine-block routine-last">
          <h3>Last time <small>{formatDate(exercise.previous.date)}</small></h3>
          <ol className="routine-sets">{last.map((set, setIndex) => <li key={setIndex}><span className="routine-set-number">{setIndex + 1}</span><span>{setLabel(set, type)}</span></li>)}</ol>
        </div>
      )}
      <div className="routine-block">
        <h3>{dayLabel} <small>{plural(index, 'set')} logged</small></h3>
        {index === 0 && <p className="routine-empty">Enter {type === 'time' ? 'the time' : 'reps and kg'}, then tap <Plus aria-hidden="true" /> to log each set.</p>}
        {index > 0 && <ol className="routine-sets">
          {exercise.sets.map((set, setIndex) => (
            <li key={setIndex}>
              <span className="routine-set-number">{setIndex + 1}</span>
              <span>{setLabel(set, type)}</span>
              <button type="button" onClick={() => updateSets(exercise.sets.filter((_, item) => item !== setIndex))} aria-label={`Remove set ${setIndex + 1}`}><X /></button>
            </li>
          ))}
        </ol>}
        <form className="routine-add" onSubmit={addSet}>
          <span className="routine-set-number is-next">{index + 1}</span>
          {fields.map(([key, label, inputMode]) => (
            <label className="routine-field" key={key}>
              <input type={inputMode === 'decimal' ? 'text' : 'number'} min="0" max={key === 'sec' ? '59' : undefined} step="1" inputMode={inputMode} value={input[key] ?? ''} placeholder={placeholder[key] || (key === 'weight' ? '–' : '0')} onChange={(event) => setInput((current) => ({ ...current, [key]: inputMode === 'decimal' ? decimalInput(event.target.value) : event.target.value }))} aria-label={`Set ${index + 1} ${label}`} />
              <small>{label}</small>
            </label>
          ))}
          <button className="routine-add-set" type="submit" disabled={!canAdd} aria-label={`Add set ${index + 1}`}><Plus aria-hidden="true" /></button>
        </form>
      </div>
      <div className={`dialog-actions routine-actions${live ? ' is-live' : ''}`}>
        {live && <button className="routine-close" type="button" onClick={onClose}>Close</button>}
        <button className="confirm-add" type="button" onClick={() => setActive(null)}>End exercise{index > 0 && ` · ${plural(index, 'set')}`}</button>
      </div>
    </DialogShell>
  );
}
