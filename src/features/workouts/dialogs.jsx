import { useId } from 'react';
import { Plus, X } from 'lucide-react';
import { WorkoutIcon } from './WorkoutIcon.jsx';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';
import { dateKey, formatDate } from '../../lib/date.js';
import { plural } from '../../lib/format.js';

// Asked when a dialog with changes is closed by tapping outside, Escape or ×.
export function UnsavedDialog({ open, canSave, onSave, onDiscard, onKeepEditing }) {
  const [shown, closing] = usePresence(open ? { canSave } : null, 150);
  const id = useId();
  useEscape(open, onKeepEditing);
  if (!shown) return null;
  return (
    <div className="dialog-layer unsaved-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onKeepEditing(); }}>
      <section className="add-meal-dialog unsaved-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`}>
        <h2 id={`${id}-title`}>Save changes?</h2>
        <p id={`${id}-text`}>{shown.canSave ? 'You have changes that are not saved yet.' : 'Add a name to save this workout, or discard it.'}</p>
        <div className="dialog-actions">
          <button className="unsaved-discard" type="button" onClick={onDiscard}>Discard</button>
          <button type="button" onClick={onKeepEditing} autoFocus={!shown.canSave}>Keep editing</button>
          {shown.canSave && <button className="confirm-add" type="button" onClick={onSave} autoFocus>Save</button>}
        </div>
      </section>
    </div>
  );
}

export function DialogShell({ shown, closing, title, onClose, children, className = '' }) {
  const id = useId();
  if (!shown) return null;
  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`add-meal-dialog workout-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading"><h2 id={`${id}-title`}>{title}</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        {children}
      </section>
    </div>
  );
}

export function PickWorkoutDialog({ open, date, templates, onPick, onCreate, onClose }) {
  const [shown, closing] = usePresence(open ? { date } : null, 150);
  useEscape(open, onClose);
  return (
    <DialogShell shown={shown} closing={closing} title={`Start workout · ${shown && shown.date === dateKey(new Date()) ? 'Today' : shown && formatDate(shown.date)}`} onClose={onClose}>
      <div className="workout-pick-list">
        {templates.map((template) => (
          <button type="button" onClick={() => onPick(template)} key={template.id}>
            <span className="workout-icon"><WorkoutIcon name={template.icon} /></span>
            <span className="workout-card-main"><strong>{template.name}</strong><small>{plural(template.exercises.length, 'exercise')}</small></span>
          </button>
        ))}
        <button className="workout-pick-new" type="button" onClick={onCreate}>
          <span className="workout-icon"><Plus aria-hidden="true" /></span>
          <span className="workout-card-main"><strong>New workout</strong><small>Create it, then start it</small></span>
        </button>
      </div>
    </DialogShell>
  );
}
