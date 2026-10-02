import { useId, useRef, useState } from 'react';
import { BicepsFlexed, Check, ChevronLeft, ChevronRight, Download, HeartPulse, Info, Plus, Shirt, Trash2, Upload, X } from 'lucide-react';
import { dateKey, formatDate, useEscape, usePresence } from './shared.js';
import './workouts.css';

// Body-part icons drawn in Lucide's style (24px grid, 2px round strokes) for the parts Lucide has no icon for.
function bodyIcon(paths) {
  return function BodyIcon(props) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths.map((d) => <path d={d} key={d} />)}</svg>;
  };
}

const BackIcon = bodyIcon(['M3 6.5 6.5 4h11L21 6.5 18 12l-1 8H7l-1-8z', 'M12 4v16', 'M7.5 8c1.2 2 2.8 3 4.5 3s3.3-1 4.5-3']);
const ShouldersIcon = bodyIcon(['M12 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5', 'M9 10h6', 'M3 21v-6.5A4.5 4.5 0 0 1 7.5 10H9', 'M21 21v-6.5a4.5 4.5 0 0 0-4.5-4.5H15', 'M7 21v-6', 'M17 21v-6']);
const AbdomenIcon = bodyIcon(['M7 3.5c1.5-.7 3.2-1 5-1s3.5.3 5 1V16c0 3-2.2 5.5-5 5.5S7 19 7 16z', 'M12 3v18', 'M7 8.5h10', 'M7 13.5h10']);
const LegsIcon = bodyIcon(['M5 3h14', 'M5.5 3c-.5 5 0 8 1 10.5s0 5 0 7.5', 'M11 3c0 5-.5 8-1.5 10.5s.5 5 .5 7.5', 'M18.5 3c.5 5 0 8-1 10.5s0 5 0 7.5', 'M13 3c0 5 .5 8 1.5 10.5s-.5 5-.5 7.5']);
const GlutesIcon = bodyIcon(['M5 4h14', 'M5 7h14', 'M5 4 3.5 19h6.5L12 11l2 8h6.5L19 4']);

export const workoutIcons = { chest: Shirt, back: BackIcon, shoulders: ShouldersIcon, arms: BicepsFlexed, legs: LegsIcon, glutes: GlutesIcon, cardio: HeartPulse, abdomen: AbdomenIcon };
const defaultIcon = 'chest';
const iconLabels = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', glutes: 'Glutes', cardio: 'Cardio', abdomen: 'Abdomen' };
// Icons from before the body-part set: cardio-type ones become cardio, the rest the default.
const legacyCardioIcons = ['run', 'bike', 'swim', 'hike', 'activity', 'timer', 'flame'];

function iconKey(name) {
  if (workoutIcons[name]) return name;
  return legacyCardioIcons.includes(name) ? 'cardio' : defaultIcon;
}

function WorkoutIcon({ name, ...props }) {
  const Icon = workoutIcons[iconKey(name)];
  return <Icon aria-hidden="true" {...props} />;
}

// Exercises are measured either in reps (with optional kg) or in time; older entries without a type are reps.
const exerciseType = (exercise) => (exercise?.type === 'time' ? 'time' : 'reps');
const blankEntry = () => ({ sets: '', reps: '', weight: '', min: '', sec: '' });
const blankExercise = () => ({ id: crypto.randomUUID(), name: '', type: 'reps' });
const exerciseKey = (exercise) => `${exerciseType(exercise)}:${exercise.name.trim().toLowerCase()}`;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const whole = (value) => Math.max(0, Math.round(Number(value)) || 0);

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

// An exercise is logged as one entry: how many sets, and the reps and kg (or time) per set.
// Entries saved before this format kept one item per set; they are read as a count plus the first set's values.
function logEntry(exercise) {
  if (!Array.isArray(exercise.sets)) return { sets: whole(exercise.sets), reps: whole(exercise.reps), weight: Math.max(0, Number(exercise.weight) || 0), seconds: whole(exercise.seconds) };
  const first = exercise.sets[0] || {};
  return { sets: exercise.sets.length, reps: whole(first.reps), weight: Math.max(0, Number(first.weight) || 0), seconds: whole(first.seconds) };
}

function formEntry(entry) {
  const value = (number) => (number ? String(number) : '');
  return { sets: value(entry.sets), reps: value(entry.reps), weight: value(entry.weight), min: value(Math.floor(entry.seconds / 60)), sec: value(entry.seconds % 60) };
}

// Leaves out whatever was not filled in, e.g. "3 sets", "8 × 60 kg" or "3 × 1:30".
function entrySummary(entry, type) {
  const amount = type === 'time' ? (entry.seconds ? formatDuration(entry.seconds) : '') : entry.reps ? `${entry.reps}${entry.weight ? ` × ${entry.weight} kg` : ''}` : '';
  if (!amount) return plural(entry.sets, 'set');
  return entry.sets ? `${entry.sets} × ${amount}` : amount;
}

// A previous entry worth showing: plain numbers with at least a set count, reps or time.
function shownEntry(entry) {
  if (!entry || Array.isArray(entry) || typeof entry !== 'object') return null;
  const clean = { sets: whole(entry.sets), reps: whole(entry.reps), weight: Math.max(0, Number(entry.weight) || 0), seconds: whole(entry.seconds) };
  return clean.sets || clean.reps || clean.seconds ? clean : null;
}

const loggedExercises = (workout) => workout.exercises.filter((exercise) => { const entry = logEntry(exercise); return entry.sets || entry.reps || entry.seconds; });

// Cleans form strings into stored numbers; exercises without a name, and logged exercises left empty, are dropped.
function cleanExercises(exercises, logged, preserveEmpty = false) {
  const cleaned = exercises.map((exercise) => {
    const type = exerciseType(exercise);
    if (!logged) return { id: exercise.id, name: exercise.name.trim(), type };
    const values = type === 'time' ? { seconds: whole(exercise.min) * 60 + whole(exercise.sec) } : { reps: whole(exercise.reps), weight: Math.max(0, Math.round(Number(exercise.weight) * 10) / 10 || 0) };
    return { id: exercise.id, name: exercise.name.trim(), type, sets: whole(exercise.sets), ...values };
  }).filter((exercise) => exercise.name);
  return logged && !preserveEmpty ? cleaned.filter((exercise) => exercise.sets || exercise.reps || exercise.seconds) : cleaned;
}

// The most recent earlier session of the same workout, shown as gray placeholders.
function withPrevious(draft, logs, date) {
  const previous = Object.keys(logs).filter((day) => day <= date).sort().reverse().flatMap((day) => [...logs[day]].reverse())
    .find((log) => log.templateId === draft.templateId && log.id !== draft.id);
  const last = new Map((previous?.exercises || []).map((exercise) => [exerciseKey(exercise), logEntry(exercise)]));
  return { ...draft, exercises: draft.exercises.map((exercise) => ({ ...exercise, previous: last.get(exerciseKey(exercise)) || null })) };
}

function startSession(template, logs, date) {
  return withPrevious({
    id: crypto.randomUUID(),
    templateId: template.id,
    name: template.name,
    icon: template.icon,
    notes: '',
    exercises: template.exercises.map((exercise) => ({ id: crypto.randomUUID(), name: exercise.name, type: exerciseType(exercise), ...blankEntry() })),
  }, logs, date);
}

// Same name and exercises (ignoring case) counts as a workout that is already saved.
function templateSignature(template) {
  return JSON.stringify([template.name, ...template.exercises.map((exercise) => `${exerciseType(exercise)}:${exercise.name}`)].map((value) => value.trim().toLowerCase()));
}

// Accepts a workouts export or a full Daily Fuel backup; every imported workout gets fresh ids so it never replaces one you have.
function parseTemplates(file) {
  const items = file?.app === 'daily-fuel-workouts' ? file.workouts : file?.app === 'daily-fuel' ? file.data?.workoutTemplates : null;
  if (!Array.isArray(items)) throw new Error('This is not a Daily Fuel workouts file.');
  return items.filter((item) => typeof item?.name === 'string' && item.name.trim()).map((item) => ({
    id: crypto.randomUUID(),
    name: item.name.trim().slice(0, 60),
    icon: iconKey(item.icon),
    notes: typeof item.notes === 'string' ? item.notes.trim().slice(0, 500) : '',
    exercises: (Array.isArray(item.exercises) ? item.exercises : [])
      .filter((exercise) => typeof exercise?.name === 'string' && exercise.name.trim())
      .map((exercise) => ({ id: crypto.randomUUID(), name: exercise.name.trim().slice(0, 60), type: exerciseType(exercise) })),
  }));
}

function editableSession(log, template) {
  const remaining = [...log.exercises];
  const exercises = (template?.exercises || []).map((exercise) => {
    const index = remaining.findIndex((item) => exerciseKey(item) === exerciseKey(exercise));
    if (index < 0) return { id: crypto.randomUUID(), name: exercise.name, type: exerciseType(exercise), ...blankEntry() };
    const [saved] = remaining.splice(index, 1);
    return { id: saved.id, name: exercise.name, type: exerciseType(exercise), ...formEntry(logEntry(saved)) };
  });
  return { ...log, exercises: [...exercises, ...remaining.map((exercise) => ({ id: exercise.id, name: exercise.name, type: exerciseType(exercise), ...formEntry(logEntry(exercise)) }))] };
}

export function WorkoutsView({ chrome, templates, setTemplates, logs, setLogs, notify }) {
  const todayKey = dateKey(new Date());
  const [tab, setTab] = useState('calendar');
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [picking, setPicking] = useState(false);
  const [templateDraft, setTemplateDraft] = useState(null);
  const [session, setSession] = useState(null);
  // Ids picked in select mode on the Saved tab; null when not selecting.
  const [selected, setSelected] = useState(null);
  const dayLogs = logs[selectedDate] || [];

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = (month.getDay() + 6) % 7;
  const shiftMonth = (amount) => setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1));
  const monthCount = Object.entries(logs).filter(([date]) => date.startsWith(dateKey(month).slice(0, 7))).reduce((sum, [, items]) => sum + items.length, 0);

  function newTemplate(logAfter = false) {
    setPicking(false);
    setTemplateDraft({ id: null, name: '', icon: defaultIcon, notes: '', exercises: [blankExercise()], logAfter });
  }

  function saveTemplate(event) {
    event.preventDefault();
    const name = templateDraft.name.trim();
    if (!name) return;
    const template = { id: templateDraft.id || crypto.randomUUID(), name, icon: templateDraft.icon, notes: templateDraft.notes.trim(), exercises: cleanExercises(templateDraft.exercises, false) };
    setTemplates((current) => (templateDraft.id ? current.map((item) => (item.id === template.id ? template : item)) : [...current, template]));
    setTemplateDraft(null);
    if (templateDraft.logAfter) setSession({ draft: startSession(template, logs, selectedDate), date: selectedDate, isNew: true });
    else notify(templateDraft.id ? 'Workout updated.' : 'Workout saved.', 'success');
  }

  function removeTemplate(template) {
    const index = templates.findIndex((item) => item.id === template.id);
    setTemplates((current) => current.filter((item) => item.id !== template.id));
    setTemplateDraft(null);
    notify('Workout deleted.', 'info', { label: 'Undo', onClick: () => setTemplates((current) => [...current.slice(0, index), template, ...current.slice(index)]) });
  }

  function toggleSelected(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportTemplates(list) {
    const file = { app: 'daily-fuel-workouts', version: 1, exportedAt: new Date().toISOString(), workouts: list.map(({ name, icon, notes, exercises }) => ({ name, icon, notes, exercises: exercises.map((exercise) => ({ name: exercise.name, type: exerciseType(exercise) })) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-fuel-workouts-${dateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify(`${plural(list.length, 'workout')} exported.`, 'success');
    setSelected(null);
  }

  // Undo puts the workouts back in their original places, keeping anything created since.
  function deleteSelected() {
    const before = templates;
    const removed = new Set(selected);
    setTemplates((current) => current.filter((template) => !removed.has(template.id)));
    setSelected(null);
    notify(`${plural(removed.size, 'workout')} deleted.`, 'info', {
      label: 'Undo',
      onClick: () => setTemplates((current) => [...before.filter((template) => removed.has(template.id) || current.some((item) => item.id === template.id)), ...current.filter((item) => !before.some((template) => template.id === item.id))]),
    });
  }

  async function importTemplates(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = parseTemplates(JSON.parse(await file.text()));
      const known = new Set(templates.map(templateSignature));
      const added = imported.filter((template) => {
        const signature = templateSignature(template);
        if (known.has(signature)) return false;
        known.add(signature);
        return true;
      });
      const skipped = imported.length - added.length;
      if (added.length) setTemplates((current) => [...current, ...added]);
      notify(added.length ? `${plural(added.length, 'workout')} added${skipped ? `, ${skipped} already saved` : ''}.` : imported.length ? 'All of these workouts are already saved.' : 'No workouts found in this file.', added.length ? 'success' : 'info');
    } catch (error) {
      notify(error instanceof SyntaxError ? 'This file could not be read.' : error.message);
    }
  }

  function saveSession(event, preserveEmpty = false) {
    event?.preventDefault();
    const { draft, date } = session;
    const log = { ...draft, exercises: cleanExercises(draft.exercises, true, preserveEmpty) };
    setLogs((current) => {
      const items = current[date] || [];
      return { ...current, [date]: items.some((item) => item.id === log.id) ? items.map((item) => (item.id === log.id ? log : item)) : [...items, log] };
    });
    setSession(null);
    notify(session.isNew ? 'Workout logged.' : 'Workout updated.', 'success');
  }

  function removeLog(log, date) {
    setLogs((current) => {
      const items = (current[date] || []).filter((item) => item.id !== log.id);
      const { [date]: _removed, ...rest } = current;
      return items.length ? { ...current, [date]: items } : rest;
    });
    setSession(null);
    notify('Session deleted.', 'info', { label: 'Undo', onClick: () => setLogs((current) => ({ ...current, [date]: [...(current[date] || []), log] })) });
  }

  return (
    <main className="app-shell reports-page workouts-page">
      {chrome}
      <div className="reports-heading">
        <div><p className="eyebrow">Training log</p><h1>Workouts</h1></div>
        <div className="period-toggle" role="group" aria-label="Workouts view">
          <button className={tab === 'calendar' ? 'active' : ''} type="button" onClick={() => { setTab('calendar'); setSelected(null); }} aria-pressed={tab === 'calendar'}>Calendar</button>
          <button className={tab === 'saved' ? 'active' : ''} type="button" onClick={() => setTab('saved')} aria-pressed={tab === 'saved'}>Saved ({templates.length})</button>
        </div>
      </div>

      {tab === 'calendar' ? <>
        <section className="chart-card">
          <div className="card-heading"><h2>Sessions</h2><span>{plural(monthCount, 'session')} this month</span></div>
          <div className="calendar-nav">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft /></button>
            <strong>{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(month)}</strong>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight /></button>
          </div>
          <div className="calendar-grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span className="calendar-weekday" key={index}>{label}</span>)}
            {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const date = dateKey(new Date(month.getFullYear(), month.getMonth(), index + 1));
              const items = logs[date] || [];
              return (
                <button className={`calendar-day workout-day${items.length ? ' has-workout' : ''}${date === todayKey ? ' is-today' : ''}${date === selectedDate ? ' is-selected' : ''}`} type="button" onClick={() => setSelectedDate(date)} aria-pressed={date === selectedDate} aria-label={`${formatDate(date)}${items.length ? `: ${items.map((item) => item.name).join(', ')}` : ''}`} key={date}>
                  <small className="calendar-day-date">{index + 1}</small>
                  <span className="workout-day-icons">
                    {/* Up to two icons fit; from three on, one icon plus a count reads cleaner than icons and a count together. */}
                    {items.slice(0, items.length > 2 ? 1 : 2).map((item) => <WorkoutIcon name={item.icon} key={item.id} />)}
                    {items.length > 2 && <small>+{items.length - 1}</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="workout-day-panel">
          <div className="section-heading"><h2>{selectedDate === todayKey ? 'Today' : formatDate(selectedDate)}</h2><span className="meal-count">{dayLogs.length}</span></div>
          {dayLogs.length === 0 ? (
            <div className="empty-state">
              <p>No workouts logged {selectedDate === todayKey ? 'today' : 'on this day'}</p>
              <button className="empty-add" type="button" onClick={() => setPicking(true)}>Add a workout</button>
            </div>
          ) : (
            <div className="workout-list">
              {dayLogs.map((log) => (
                <div className="workout-row" key={log.id}>
                  <button className="workout-card" type="button" onClick={() => setSession({ draft: withPrevious(editableSession(log, templates.find((template) => template.id === log.templateId)), logs, selectedDate), date: selectedDate })}>
                    <span className="workout-icon"><WorkoutIcon name={log.icon} /></span>
                    <span className="workout-card-main">
                      <strong>{log.name}</strong>
                      <small>{plural(loggedExercises(log).length, 'exercise')}</small>
                      {loggedExercises(log).length > 0 && (() => {
                        const detail = loggedExercises(log).map((exercise) => `${exercise.name} ${entrySummary(logEntry(exercise), exerciseType(exercise))}`).join(' · ');
                        return <small className="workout-card-detail" title={detail}>{detail}</small>;
                      })()}
                    </span>
                  </button>
                  <button className="remove-button" type="button" onClick={() => removeLog(log, selectedDate)} aria-label={`Delete ${log.name}`} title="Delete session"><Trash2 /></button>
                </div>
              ))}
            </div>
          )}
        </section>
      </> : (
        <section className="workout-day-panel">
          <div className="workout-transfer">
            {selected ? <>
              <button type="button" onClick={() => setSelected(selected.size === templates.length ? new Set() : new Set(templates.map((template) => template.id)))}>{selected.size === templates.length ? 'Select none' : 'Select all'}</button>
              <button type="button" onClick={() => setSelected(null)}>Cancel</button>
            </> : <>
              <button type="button" onClick={() => setSelected(new Set())} disabled={!templates.length}><Check aria-hidden="true" />Select</button>
              <label><Upload aria-hidden="true" />Import<input type="file" accept="application/json,.json" onChange={importTemplates} /></label>
            </>}
          </div>
          {templates.length === 0 ? (
            <div className="empty-state">
              <p>No saved workouts yet</p>
              <button className="empty-add" type="button" onClick={() => newTemplate()}>Create a workout</button>
            </div>
          ) : (
            <div className="workout-list">
              {templates.map((template) => (
                <button className={`workout-card${selected?.has(template.id) ? ' is-selected' : ''}`} type="button" onClick={() => (selected ? toggleSelected(template.id) : setTemplateDraft({ ...template, icon: iconKey(template.icon), exercises: template.exercises.length ? template.exercises : [blankExercise()], logAfter: false }))} aria-pressed={selected ? selected.has(template.id) : undefined} key={template.id}>
                  {selected && <span className="workout-select" aria-hidden="true"><Check /></span>}
                  <span className="workout-icon"><WorkoutIcon name={template.icon} /></span>
                  <span className="workout-card-main">
                    <strong>{template.name}</strong>
                    <small title={template.exercises.map((exercise) => exercise.name).join(' · ') || undefined}>{template.exercises.length ? template.exercises.map((exercise) => exercise.name).join(' · ') : 'No exercises'}</small>
                    {template.notes && <small className="workout-card-detail" title={template.notes}>{template.notes}</small>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {selected && (
        <div className="save-bar workout-select-bar" role="region" aria-label="Selected workouts">
          <span>{selected.size ? `${selected.size} selected` : 'Tap workouts to select'}</span>
          <button className="save-bar-discard" type="button" onClick={() => exportTemplates(templates.filter((template) => selected.has(template.id)))} disabled={!selected.size}><Download aria-hidden="true" />Export</button>
          <button className="workout-select-delete" type="button" onClick={deleteSelected} disabled={!selected.size}><Trash2 aria-hidden="true" />Delete</button>
        </div>
      )}
      {!selected && <button className="add-meal-fab" type="button" onClick={() => (tab === 'calendar' ? setPicking(true) : newTemplate())} aria-label={tab === 'calendar' ? 'Add workout' : 'New workout'}>+</button>}

      <PickWorkoutDialog
        open={picking}
        date={selectedDate}
        templates={templates}
        onPick={(template) => { setPicking(false); setSession({ draft: startSession(template, logs, selectedDate), date: selectedDate, isNew: true }); }}
        onCreate={() => newTemplate(true)}
        onClose={() => setPicking(false)}
      />
      <TemplateDialog draft={templateDraft} onChange={(patch) => setTemplateDraft((current) => ({ ...current, ...patch }))} onDelete={templateDraft?.id ? () => removeTemplate(templates.find((item) => item.id === templateDraft.id)) : null} onClose={() => setTemplateDraft(null)} onSubmit={saveTemplate} />
      <SessionDialog session={session} template={templates.find((template) => template.id === session?.draft.templateId)} onNotesChange={(templateId, notes) => setTemplates((current) => current.map((template) => (template.id === templateId ? { ...template, notes } : template)))} onChange={(patch) => setSession((current) => ({ ...current, draft: { ...current.draft, ...patch } }))} onDelete={session && !session.isNew ? () => removeLog(logs[session.date].find((item) => item.id === session.draft.id), session.date) : null} onClose={() => saveSession(undefined, true)} onSubmit={saveSession} />
    </main>
  );
}

function DialogShell({ shown, closing, title, onClose, children, className = '' }) {
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

function PickWorkoutDialog({ open, date, templates, onPick, onCreate, onClose }) {
  const [shown, closing] = usePresence(open ? { date } : null, 150);
  useEscape(open, onClose);
  return (
    <DialogShell shown={shown} closing={closing} title={`Add workout · ${shown && shown.date === dateKey(new Date()) ? 'Today' : shown && formatDate(shown.date)}`} onClose={onClose}>
      <div className="workout-pick-list">
        {templates.map((template) => (
          <button type="button" onClick={() => onPick(template)} key={template.id}>
            <span className="workout-icon"><WorkoutIcon name={template.icon} /></span>
            <span className="workout-card-main"><strong>{template.name}</strong><small>{plural(template.exercises.length, 'exercise')}</small></span>
          </button>
        ))}
        <button className="workout-pick-new" type="button" onClick={onCreate}>
          <span className="workout-icon"><Plus aria-hidden="true" /></span>
          <span className="workout-card-main"><strong>New workout</strong><small>Create it, then log it</small></span>
        </button>
      </div>
    </DialogShell>
  );
}

function TemplateDialog({ draft, onChange, onDelete, onClose, onSubmit }) {
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
                <input value={exercise.name} onChange={(event) => updateExercise(exercise.id, { name: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (exercise.name.trim()) addExercise(index); } }} placeholder="Exercise name" title={exercise.name || undefined} maxLength={60} autoFocus={exercise.id === focusId} enterKeyHint="next" aria-label={`Exercise ${index + 1}`} />
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
          <button className="confirm-add" type="submit" disabled={!shown.name.trim()}>{shown.logAfter ? 'Save & log' : 'Save'}</button>
        </div>
      </form>
    </DialogShell>
  );
}

// One row per exercise: sets, then reps and kg (or min and sec). Inputs start empty; last session's values are the placeholders.
function SessionDialog({ session, template, onNotesChange, onChange, onDelete, onClose, onSubmit }) {
  const [shown, closing] = usePresence(session, 150);
  // Keyed by session so the notes bubble starts closed each time the dialog opens.
  const [notesFor, setNotesFor] = useState(null);
  const [arrowX, setArrowX] = useState(0);
  const notesRef = useRef(null);
  // Points the bubble's arrow at the ⓘ, whose position depends on the workout name's length.
  function toggleNotes(event) {
    const button = event.currentTarget.getBoundingClientRect();
    const dialog = event.currentTarget.closest('.workout-dialog');
    const left = dialog.getBoundingClientRect().left + parseFloat(getComputedStyle(dialog).paddingLeft) + dialog.clientLeft;
    setArrowX(button.left + button.width / 2 - left - 6);
    setNotesFor(notesOpen ? null : draft.id);
    // Wait a frame: the field is inert until the open state has rendered.
    if (!notesOpen && !notes) requestAnimationFrame(() => notesRef.current?.focus({ preventScroll: true }));
  }
  useEscape(Boolean(session), onClose);
  if (!shown) return null;
  const { draft } = shown;
  const updateExercise = (exerciseId, patch) => onChange({ exercises: draft.exercises.map((exercise) => (exercise.id === exerciseId ? { ...exercise, ...patch } : exercise)) });
  const notesOpen = notesFor === draft.id;
  const notes = template?.notes || '';
  return (
    <DialogShell shown={shown} closing={closing} title={<span className="workout-dialog-title"><WorkoutIcon name={draft.icon} />{draft.name}{template && <button className={`workout-notes-toggle${notes.trim() ? ' has-notes' : ''}`} type="button" onClick={toggleNotes} aria-expanded={notesOpen} aria-label="Workout notes" title="Workout notes"><Info /></button>}</span>} onClose={onClose}>
      <p className="workout-dialog-date">{shown.date === dateKey(new Date()) ? 'Today' : formatDate(shown.date)}</p>
      {/* Always mounted so it can expand and collapse; inert keeps it out of reach while closed. */}
      {template && (
        <div className="workout-notes" data-open={notesOpen || undefined} inert={!notesOpen}>
          <div className="workout-notes-inner">
            <div className="workout-notes-bubble" style={{ '--notes-arrow': `${arrowX}px` }}>
              {/* Notes belong to the saved workout, so they show up again every time it is logged. */}
              <textarea ref={notesRef} value={notes} onChange={(event) => onNotesChange(template.id, event.target.value)} placeholder="Add notes for this workout: warm-up, rest times, form cues…" maxLength={500} rows="3" aria-label="Workout notes" />
              <small>Saved to {template.name}</small>
            </div>
          </div>
        </div>
      )}
      <form className="workout-form session-form" onSubmit={onSubmit}>
        {draft.exercises.map((exercise) => {
          const type = exerciseType(exercise);
          const last = shownEntry(exercise.previous);
          const placeholder = last ? formEntry(last) : {};
          const fields = [['sets', 'Sets', 'numeric'], ...(type === 'time' ? [['min', 'Min', 'numeric'], ['sec', 'Sec', 'numeric']] : [['reps', 'Reps', 'numeric'], ['weight', 'kg', 'decimal']])];
          return (
            <div className="exercise-entry" key={exercise.id}>
              <div className="exercise-entry-name">
                <strong title={exercise.name}>{exercise.name}</strong>
                <small>{last ? `Last: ${entrySummary(last, type)}` : 'First time'}</small>
              </div>
              {fields.map(([key, label, inputMode]) => (
                <label className="entry-field" key={key}>
                  <small>{label}</small>
                  <input type="number" min="0" max={key === 'sec' ? '59' : undefined} step={key === 'weight' ? 'any' : '1'} inputMode={inputMode} value={exercise[key]} placeholder={placeholder[key] || (key === 'weight' ? '–' : '0')} onChange={(event) => updateExercise(exercise.id, { [key]: event.target.value })} aria-label={`${exercise.name} ${label}`} />
                </label>
              ))}
            </div>
          );
        })}
        <div className="dialog-actions">
          {onDelete && <button className="clear-meal-form" type="button" onClick={onDelete}><Trash2 aria-hidden="true" />Delete</button>}
          <button className="confirm-add" type="submit">{shown.isNew ? 'Log workout' : 'Save'}</button>
        </div>
      </form>
    </DialogShell>
  );
}

function TypeToggle({ value, onChange, label }) {
  return (
    <div className="exercise-type" role="radiogroup" aria-label={label}>
      {[['reps', 'Reps'], ['time', 'Time']].map(([type, text]) => <button className={value === type ? 'active' : ''} type="button" role="radio" aria-checked={value === type} onClick={() => onChange(type)} key={type}>{text}</button>)}
    </div>
  );
}
