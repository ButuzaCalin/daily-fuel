import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { iconLabels, WorkoutIcon, workoutIcons } from './WorkoutIcon.jsx';
import { DialogShell } from './dialogs.jsx';
import { NameField, TypeToggle } from './fields.jsx';
import { blankExercise, exerciseType } from './workouts.js';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';

export function TemplateDialog({ draft, onChange, onDelete, onClose, onSubmit }) {
  const [shown, closing] = usePresence(draft, 150);
  // The exercise row added last, so its name field gets focus when it mounts.
  const [focusId, setFocusId] = useState(null);
  useEscape(Boolean(draft), onClose);
  if (!shown) return null;
  function addExercise(afterIndex = shown.exercises.length - 1) {
    const exercise = blankExercise();
    setFocusId(exercise.id);
    onChange({ exercises: [...shown.exercises.slice(0, afterIndex + 1), exercise, ...shown.exercises.slice(afterIndex + 1)] });
  }
  const updateExercise = (exerciseId, patch) => onChange({ exercises: shown.exercises.map((exercise) => (exercise.id === exerciseId ? { ...exercise, ...patch } : exercise)) });
  return (
    <DialogShell shown={shown} closing={closing} title={shown.id ? 'Edit workout' : 'New workout'} onClose={onClose}>
      <form className="workout-form" onSubmit={onSubmit}>
        <label className="workout-field">Name<input value={shown.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="e.g. Push day" maxLength={60} autoFocus={!shown.id} /></label>
        <fieldset className="workout-field">
          <legend>Icon</legend>
          <div className="workout-icon-picker" role="radiogroup" aria-label="Icon">
            {Object.keys(workoutIcons).map((name) => <button className={shown.icon === name ? 'active' : ''} type="button" role="radio" onClick={() => onChange({ icon: name })} aria-checked={shown.icon === name} title={iconLabels[name]} key={name}><WorkoutIcon name={name} /><small>{iconLabels[name]}</small></button>)}
          </div>
        </fieldset>
        <fieldset className="workout-field">
          <legend>Exercises</legend>
          <div className="exercise-list">
            {shown.exercises.map((exercise, index) => (
              <div className="exercise-row" key={exercise.id}>
                <span className="exercise-number">{index + 1}</span>
                {/* Enter adds the next exercise, so a list can be typed without reaching for the button. */}
                <NameField value={exercise.name} onChange={(value) => updateExercise(exercise.id, { name: value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (exercise.name.trim()) addExercise(index); } }} placeholder="Exercise name" maxLength={60} autoFocus={exercise.id === focusId} enterKeyHint="next" aria-label={`Exercise ${index + 1}`} />
                <TypeToggle value={exerciseType(exercise)} onChange={(type) => updateExercise(exercise.id, { type })} label={`Exercise ${index + 1} measured by`} />
                <button className="exercise-remove" type="button" onClick={() => onChange({ exercises: shown.exercises.filter((item) => item.id !== exercise.id) })} aria-label={`Remove exercise ${index + 1}`}><X /></button>
              </div>
            ))}
            <button className="exercise-add-row" type="button" onClick={() => addExercise()}><Plus aria-hidden="true" />Add exercise</button>
          </div>
        </fieldset>
        <label className="workout-field">Notes<textarea value={shown.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Warm-up, tempo, rest times…" maxLength={500} rows="2" /></label>
        <div className="dialog-actions">
          {onDelete && <button className="clear-meal-form" type="button" onClick={onDelete}><Trash2 aria-hidden="true" />Delete</button>}
          <button className="confirm-add" type="submit" disabled={!shown.name.trim()}>{shown.logAfter ? 'Save & start' : 'Save'}</button>
        </div>
      </form>
    </DialogShell>
  );
}
