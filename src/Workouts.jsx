import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { BicepsFlexed, Check, ChevronLeft, ChevronRight, Download, EyeOff, HeartPulse, Plus, Shirt, Trash2, Upload, X } from 'lucide-react';
import { dateKey, decimalInput, formatDate, loadLocal, saveLocal, useEscape, usePresence } from './shared.js';
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

// A previous entry worth showing: plain numbers with at least a set count, reps or time.
function shownEntry(entry) {
  if (!entry || Array.isArray(entry) || typeof entry !== 'object') return null;
  const clean = { sets: whole(entry.sets), reps: whole(entry.reps), weight: Math.max(0, Number(entry.weight) || 0), seconds: whole(entry.seconds) };
  return clean.sets || clean.reps || clean.seconds ? clean : null;
}

const loggedExercises = (workout) => workout.exercises.filter((exercise) => { const entry = logEntry(exercise); return entry.sets || entry.reps || entry.seconds; });

// Exercises without a name are dropped.
function cleanExercises(exercises) {
  return exercises.map((exercise) => ({ id: exercise.id, name: exercise.name.trim(), type: exerciseType(exercise) })).filter((exercise) => exercise.name);
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

function templateSnapshot(draft) {
  return JSON.stringify([draft.name.trim(), draft.icon, draft.notes.trim(), draft.exercises.filter((exercise) => exercise.name.trim()).map((exercise) => [exercise.name.trim(), exerciseType(exercise)])]);
}

// Routines log every set on its own: { reps, weight } or { seconds }. Older entries are expanded into that many equal sets.
function setList(exercise) {
  if (Array.isArray(exercise?.sets)) return exercise.sets.map((set) => ({ reps: whole(set?.reps), weight: Math.max(0, Number(set?.weight) || 0), seconds: whole(set?.seconds) })).filter((set) => set.reps || set.seconds);
  const entry = shownEntry(logEntry(exercise || {}));
  if (!entry || !(entry.reps || entry.seconds)) return [];
  return Array.from({ length: Math.max(1, entry.sets) }, () => ({ reps: entry.reps, weight: entry.weight, seconds: entry.seconds }));
}

const setLabel = (set, type) => (type === 'time' ? formatDuration(set.seconds) : `${set.reps}${set.weight ? ` × ${set.weight} kg` : ''}`);

// "3 × 8 × 60 kg" when every set matches, otherwise each set in order.
function exerciseSummary(exercise) {
  const type = exerciseType(exercise);
  const labels = setList(exercise).map((set) => setLabel(set, type));
  if (!labels.length) return plural(logEntry(exercise).sets, 'set');
  return labels.every((label) => label === labels[0]) ? `${labels.length} × ${labels[0]}` : labels.join(', ');
}

// For each exercise, the sets from the most recent earlier session that did it (in any workout), for the "Last time" view and the placeholders.
function routinePrevious(logs, date, excludeId) {
  const found = new Map();
  Object.keys(logs).filter((day) => day <= date).sort().reverse().forEach((day) => [...logs[day]].reverse().forEach((log) => {
    if (log.id === excludeId) return;
    (log.exercises || []).forEach((exercise) => {
      const key = exerciseKey(exercise);
      const sets = setList(exercise);
      if (!found.has(key) && sets.length) found.set(key, { date: day, sets });
    });
  }));
  return found;
}

// The workout's exercises in order, keeping logged sets that match; logged exercises no longer in the workout come last.
function routineDraft(base, sourceExercises, template, logs, date) {
  const remaining = [...sourceExercises];
  const take = (exercise) => {
    const index = remaining.findIndex((item) => exerciseKey(item) === exerciseKey(exercise));
    return index < 0 ? null : remaining.splice(index, 1)[0];
  };
  const previous = routinePrevious(logs, date, base.id);
  const build = (exercise, saved) => ({ id: saved?.id || crypto.randomUUID(), name: exercise.name, type: exerciseType(exercise), sets: saved ? setList(saved) : [], previous: previous.get(exerciseKey(exercise)) || null });
  const exercises = (template?.exercises || []).map((exercise) => build(exercise, take(exercise)));
  return { ...base, active: null, exercises: [...exercises, ...remaining.map((exercise) => build(exercise, exercise))] };
}

// Only a routine for today is timed; one logged for another day has no duration.
function startRoutine(template, logs, date) {
  return routineDraft({ id: crypto.randomUUID(), templateId: template.id, name: template.name, icon: template.icon, notes: '', date, startedAt: date === dateKey(new Date()) ? Date.now() : null }, [], template, logs, date);
}

function routineLog(routine, duration) {
  const { active: _active, startedAt: _startedAt, date: _date, initial: _initial, ...rest } = routine;
  return { ...rest, routine: true, duration, exercises: routine.exercises.filter((exercise) => exercise.sets.length).map(({ id, name, type, sets }) => ({ id, name, type, sets: sets.map((set) => (type === 'time' ? { seconds: set.seconds } : { reps: set.reps, weight: set.weight })) })) };
}

const routineSnapshot = (routine) => JSON.stringify(routine.exercises.map((exercise) => exercise.sets));

// Re-renders every second while `active`, for running timers.
function useNow(active) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

// A timed workout still running after this long was most likely forgotten, so it is ended for you.
const autoEndSeconds = 2 * 60 * 60;
const durationLabel = (log) => `${formatDuration(log.duration)}${log.autoEnded ? ' (auto ended)' : ''}`;

const elapsed = (routine, now) => (routine.startedAt ? Math.max(0, Math.floor((now - routine.startedAt) / 1000)) : 0);

export function WorkoutsView({ chrome, templates, setTemplates, logs, setLogs, notify }) {
  const todayKey = dateKey(new Date());
  const [tab, setTab] = useState('calendar');
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [picking, setPicking] = useState(false);
  const [templateDraft, setTemplateDraftState] = useState(null);
  // Which screen is asking "Save changes?" after a close attempt: 'template', 'routine' or null.
  const [confirming, setConfirming] = useState(null);
  // Opening a dialog records its starting state, so a close can tell whether anything changed.
  const openTemplate = (value) => setTemplateDraftState(value && { ...value, initial: templateSnapshot(value) });
  // The routine being done right now; kept in storage so a reload or leaving the page does not lose it.
  const [routine, setRoutine] = useState(() => loadLocal('daily-fuel-active-routine', null));
  const [routineOpen, setRoutineOpen] = useState(false);
  const [routineHintHidden, setRoutineHintHidden] = useState(() => loadLocal('daily-fuel-hide-routine-hint', false));
  // A logged session opened from the calendar to change its sets.
  const [routineEdit, setRoutineEdit] = useState(null);
  useEffect(() => saveLocal('daily-fuel-active-routine', routine), [routine]);
  useEffect(() => saveLocal('daily-fuel-hide-routine-hint', routineHintHidden), [routineHintHidden]);
  const now = useNow(Boolean(routine));
  // Ids picked in select mode on the My workouts tab; null when not selecting.
  const [selected, setSelected] = useState(null);
  const dayLogs = logs[selectedDate] || [];

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = (month.getDay() + 6) % 7;
  const shiftMonth = (amount) => setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1));
  const monthCount = Object.entries(logs).filter(([date]) => date.startsWith(dateKey(month).slice(0, 7))).reduce((sum, [, items]) => sum + items.length, 0);

  function newTemplate(logAfter = false) {
    if (logAfter && selectedDate > todayKey) return;
    setPicking(false);
    openTemplate({ id: null, name: '', icon: defaultIcon, notes: '', exercises: [blankExercise()], logAfter });
  }

  function saveTemplate(event) {
    event?.preventDefault();
    const name = templateDraft.name.trim();
    if (!name) return;
    const template = { id: templateDraft.id || crypto.randomUUID(), name, icon: templateDraft.icon, notes: templateDraft.notes.trim(), exercises: cleanExercises(templateDraft.exercises) };
    setTemplates((current) => (templateDraft.id ? current.map((item) => (item.id === template.id ? template : item)) : [...current, template]));
    setTemplateDraftState(null);
    setConfirming(null);
    if (templateDraft.logAfter && selectedDate <= todayKey) { setRoutine(startRoutine(template, logs, selectedDate)); setRoutineOpen(true); }
    else notify(templateDraft.id ? 'Workout updated.' : 'Workout saved.', 'success');
  }

  function removeTemplate(template) {
    const index = templates.findIndex((item) => item.id === template.id);
    setTemplates((current) => current.filter((item) => item.id !== template.id));
    setTemplateDraftState(null);
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

  function endRoutine(auto = false) {
    const log = { ...routineLog(routine, auto ? autoEndSeconds : elapsed(routine, Date.now())), ...(auto && { autoEnded: true }) };
    const { date } = routine;
    setRoutine(null);
    setRoutineOpen(false);
    if (!log.exercises.length) return notify(auto ? `${log.name} was ended after 2 hours. No sets were logged.` : 'Routine ended. No sets were logged.', 'info');
    setLogs((current) => ({ ...current, [date]: [...(current[date] || []), log] }));
    setSelectedDate(date);
    notify(auto ? `${log.name} was still running after 2 hours, so it was ended and logged.` : 'Workout logged.', auto ? 'info' : 'success');
  }

  // Also catches a workout left running while the app was closed, as soon as this page opens.
  // The ref keeps a repeated effect run (e.g. StrictMode) from logging the same workout twice.
  const autoEnded = useRef(null);
  useEffect(() => {
    if (!routine?.startedAt || elapsed(routine, now) < autoEndSeconds || autoEnded.current === routine.id) return;
    autoEnded.current = routine.id;
    endRoutine(true);
  }, [now, routine]);

  function openRoutineEdit(log, date) {
    const draft = routineDraft(log, log.exercises, templates.find((template) => template.id === log.templateId), logs, date);
    setRoutineEdit({ ...draft, date, initial: routineSnapshot(draft) });
  }

  function saveRoutineEdit() {
    const { date } = routineEdit;
    const log = routineLog(routineEdit, routineEdit.duration);
    setLogs((current) => ({ ...current, [date]: (current[date] || []).map((item) => (item.id === log.id ? log : item)) }));
    setRoutineEdit(null);
    setConfirming(null);
    notify('Workout updated.', 'success');
  }

  function removeLog(log, date) {
    setLogs((current) => {
      const items = (current[date] || []).filter((item) => item.id !== log.id);
      const { [date]: _removed, ...rest } = current;
      return items.length ? { ...current, [date]: items } : rest;
    });
    setRoutineEdit(null);
    notify('Session deleted.', 'info', { label: 'Undo', onClick: () => setLogs((current) => ({ ...current, [date]: [...(current[date] || []), log] })) });
  }

  const unsaved = (
    <UnsavedDialog
      open={Boolean(confirming)}
      canSave={confirming !== 'template' || Boolean(templateDraft?.name.trim())}
      onSave={() => (confirming === 'template' ? saveTemplate() : saveRoutineEdit())}
      onDiscard={() => { if (confirming === 'template') setTemplateDraftState(null); else setRoutineEdit(null); setConfirming(null); }}
      onKeepEditing={() => setConfirming(null)}
    />
  );

  function startWorkout(template) {
    if (selectedDate > todayKey) return;
    setPicking(false);
    setRoutine(startRoutine(template, logs, selectedDate));
    setRoutineOpen(true);
  }

  // One workout runs at a time; adding while one is running brings it back.
  const openPicker = () => {
    if (selectedDate > todayKey) return;
    if (routine) setRoutineOpen(true);
    else setPicking(true);
  };
  const shownRoutine = routineOpen ? routine : routineEdit;
  return (
    <main className="app-shell reports-page workouts-page">
      {chrome}
      <div className="reports-heading">
        <div><p className="eyebrow">Training log</p><h1>Workouts</h1></div>
        <div className="period-toggle" role="group" aria-label="Workouts view">
          <button className={tab === 'calendar' ? 'active' : ''} type="button" onClick={() => { setTab('calendar'); setSelected(null); }} aria-pressed={tab === 'calendar'}>Calendar</button>
          <button className={tab === 'saved' ? 'active' : ''} type="button" onClick={() => setTab('saved')} aria-pressed={tab === 'saved'}>My workouts ({templates.length})</button>
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
                <button className={`calendar-day workout-day${items.length ? ' has-workout' : ''}${date === todayKey ? ' is-today' : ''}${date === selectedDate ? ' is-selected' : ''}`} type="button" onClick={() => setSelectedDate(date)} disabled={date > todayKey} aria-pressed={date === selectedDate} aria-label={`${formatDate(date)}${items.length ? `: ${items.map((item) => item.name).join(', ')}` : date > todayKey ? ': unavailable' : ''}`} key={date}>
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
          {routine?.date === selectedDate && (
            <button className="workout-card routine-running" type="button" onClick={() => setRoutineOpen(true)}>
              <span className="workout-icon"><WorkoutIcon name={routine.icon} /></span>
              <span className="workout-card-main">
                <strong>{routine.name}</strong>
                <small>In progress{routine.startedAt ? ` · ${formatDuration(elapsed(routine, now))}` : ''} · {plural(routine.exercises.filter((exercise) => exercise.sets.length).length, 'exercise')} done</small>
              </span>
              <span className="routine-running-action">Continue</span>
            </button>
          )}
          {dayLogs.length === 0 ? (routine?.date === selectedDate ? null :
            <div className="empty-state">
              <p>No workouts logged {selectedDate === todayKey ? 'today' : 'on this day'}</p>
              <button className="empty-add" type="button" onClick={openPicker}>Start a workout</button>
            </div>
          ) : (
            <div className="workout-list">
              {dayLogs.map((log) => (
                <div className="workout-row" key={log.id}>
                  <button className="workout-card" type="button" onClick={() => openRoutineEdit(log, selectedDate)}>
                    <span className="workout-icon"><WorkoutIcon name={log.icon} /></span>
                    <span className="workout-card-main">
                      <strong>{log.name}</strong>
                      <small>{plural(loggedExercises(log).length, 'exercise')}{log.duration > 0 && ` · ${durationLabel(log)}`}</small>
                      {loggedExercises(log).length > 0 && (() => {
                        const detail = loggedExercises(log).map((exercise) => `${exercise.name} ${exerciseSummary(exercise)}`).join(' · ');
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
              <p>No workouts yet</p>
              <button className="empty-add" type="button" onClick={() => newTemplate()}>Create a workout</button>
            </div>
          ) : (
            <div className="workout-list">
              {templates.map((template) => (
                <button className={`workout-card${selected?.has(template.id) ? ' is-selected' : ''}`} type="button" onClick={() => (selected ? toggleSelected(template.id) : openTemplate({ ...template, icon: iconKey(template.icon), exercises: template.exercises.length ? template.exercises : [blankExercise()], logAfter: false }))} aria-pressed={selected ? selected.has(template.id) : undefined} key={template.id}>
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
      {!selected && <button className="add-meal-fab" type="button" onClick={() => (tab === 'calendar' ? openPicker() : newTemplate())} aria-label={tab === 'calendar' ? 'Start workout' : 'New workout'}>+</button>}

      <PickWorkoutDialog
        open={picking}
        date={selectedDate}
        templates={templates}
        onPick={startWorkout}
        onCreate={() => newTemplate(true)}
        onClose={() => setPicking(false)}
      />
      <TemplateDialog draft={templateDraft} onChange={(patch) => setTemplateDraftState((current) => ({ ...current, ...patch }))} onDelete={templateDraft?.id ? () => removeTemplate(templates.find((item) => item.id === templateDraft.id)) : null} onClose={() => (templateSnapshot(templateDraft) === templateDraft.initial ? setTemplateDraftState(null) : setConfirming('template'))} onSubmit={saveTemplate} />
      <RoutineDialog
        routine={shownRoutine}
        live={routineOpen}
        hintHidden={routineHintHidden}
        onHideHint={() => setRoutineHintHidden(true)}
        now={now}
        notes={templates.find((template) => template.id === shownRoutine?.templateId)?.notes}
        onChange={(patch) => (routineOpen ? setRoutine((current) => ({ ...current, ...patch })) : setRoutineEdit((current) => ({ ...current, ...patch })))}
        onClose={() => (routineOpen ? setRoutineOpen(false) : routineSnapshot(routineEdit) === routineEdit.initial ? setRoutineEdit(null) : setConfirming('routine'))}
        onEnd={routineOpen ? () => endRoutine() : saveRoutineEdit}
        onDiscard={() => removeLog(logs[routineEdit.date].find((item) => item.id === routineEdit.id), routineEdit.date)}
      />
      {unsaved}
    </main>
  );
}

// Asked when a dialog with changes is closed by tapping outside, Escape or ×.
function UnsavedDialog({ open, canSave, onSave, onDiscard, onKeepEditing }) {
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

// Lists the workout's exercises, each started on its own. A started exercise fills the modal by itself until it is ended:
// last time's sets above, today's below, and one row for the next set. Closing a live workout only hides it.
function RoutineDialog({ routine, live, hintHidden, onHideHint, now, notes, onChange, onClose, onEnd, onDiscard }) {
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

// A one-line text field that wraps long names onto more lines instead of hiding them (an input cannot wrap).
// Line breaks are typed as Enter, which callers handle, so the value always stays a single line.
function NameField({ value, onChange, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows="1" value={value} onChange={(event) => onChange(event.target.value.replace(/\s*\n\s*/g, ' '))} {...props} />;
}

function TypeToggle({ value, onChange, label }) {
  return (
    <div className="exercise-type" role="radiogroup" aria-label={label}>
      {[['reps', 'Reps'], ['time', 'Time']].map(([type, text]) => <button className={value === type ? 'active' : ''} type="button" role="radio" aria-checked={value === type} onClick={() => onChange(type)} key={type}>{text}</button>)}
    </div>
  );
}
