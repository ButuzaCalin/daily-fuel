import { iconKey } from './WorkoutIcon.jsx';
import { dateKey } from '../../lib/date.js';
import { plural } from '../../lib/format.js';

// Exercises are measured either in reps (with optional kg) or in time; older entries without a type are reps.
export const exerciseType = (exercise) => (exercise?.type === 'time' ? 'time' : 'reps');

export const blankExercise = () => ({ id: crypto.randomUUID(), name: '', type: 'reps' });

const exerciseKey = (exercise) => `${exerciseType(exercise)}:${exercise.name.trim().toLowerCase()}`;

export const whole = (value) => Math.max(0, Math.round(Number(value)) || 0);

export function formatDuration(seconds) {
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

export function formEntry(entry) {
  const value = (number) => (number ? String(number) : '');
  return { sets: value(entry.sets), reps: value(entry.reps), weight: value(entry.weight), min: value(Math.floor(entry.seconds / 60)), sec: value(entry.seconds % 60) };
}

// A previous entry worth showing: plain numbers with at least a set count, reps or time.
function shownEntry(entry) {
  if (!entry || Array.isArray(entry) || typeof entry !== 'object') return null;
  const clean = { sets: whole(entry.sets), reps: whole(entry.reps), weight: Math.max(0, Number(entry.weight) || 0), seconds: whole(entry.seconds) };
  return clean.sets || clean.reps || clean.seconds ? clean : null;
}

export const loggedExercises = (workout) => workout.exercises.filter((exercise) => { const entry = logEntry(exercise); return entry.sets || entry.reps || entry.seconds; });

// Exercises without a name are dropped.
export function cleanExercises(exercises) {
  return exercises.map((exercise) => ({ id: exercise.id, name: exercise.name.trim(), type: exerciseType(exercise) })).filter((exercise) => exercise.name);
}

// Same name and exercises (ignoring case) counts as a workout that is already saved.
export function templateSignature(template) {
  return JSON.stringify([template.name, ...template.exercises.map((exercise) => `${exerciseType(exercise)}:${exercise.name}`)].map((value) => value.trim().toLowerCase()));
}

// Accepts a workouts export or a full Daily Fuel backup; every imported workout gets fresh ids so it never replaces one you have.
export function parseTemplates(file) {
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

export function templateSnapshot(draft) {
  return JSON.stringify([draft.name.trim(), draft.icon, draft.notes.trim(), draft.exercises.filter((exercise) => exercise.name.trim()).map((exercise) => [exercise.name.trim(), exerciseType(exercise)])]);
}

// Routines log every set on its own: { reps, weight } or { seconds }. Older entries are expanded into that many equal sets.
function setList(exercise) {
  if (Array.isArray(exercise?.sets)) return exercise.sets.map((set) => ({ reps: whole(set?.reps), weight: Math.max(0, Number(set?.weight) || 0), seconds: whole(set?.seconds) })).filter((set) => set.reps || set.seconds);
  const entry = shownEntry(logEntry(exercise || {}));
  if (!entry || !(entry.reps || entry.seconds)) return [];
  return Array.from({ length: Math.max(1, entry.sets) }, () => ({ reps: entry.reps, weight: entry.weight, seconds: entry.seconds }));
}

export const setLabel = (set, type) => (type === 'time' ? formatDuration(set.seconds) : `${set.reps}${set.weight ? ` × ${set.weight} kg` : ''}`);

// "3 × 8 × 60 kg" when every set matches, otherwise each set in order.
export function exerciseSummary(exercise) {
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
export function routineDraft(base, sourceExercises, template, logs, date) {
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
export function startRoutine(template, logs, date) {
  return routineDraft({ id: crypto.randomUUID(), templateId: template.id, name: template.name, icon: template.icon, notes: '', date, startedAt: date === dateKey(new Date()) ? Date.now() : null }, [], template, logs, date);
}

export function routineLog(routine, duration) {
  const { active: _active, startedAt: _startedAt, date: _date, initial: _initial, ...rest } = routine;
  return { ...rest, routine: true, duration, exercises: routine.exercises.filter((exercise) => exercise.sets.length).map(({ id, name, type, sets }) => ({ id, name, type, sets: sets.map((set) => (type === 'time' ? { seconds: set.seconds } : { reps: set.reps, weight: set.weight })) })) };
}

export const routineSnapshot = (routine) => JSON.stringify(routine.exercises.map((exercise) => exercise.sets));

// A timed workout still running after this long was most likely forgotten, so it is ended for you.
export const autoEndSeconds = 2 * 60 * 60;

export const durationLabel = (log) => `${formatDuration(log.duration)}${log.autoEnded ? ' (auto ended)' : ''}`;

export const elapsed = (routine, now) => (routine.startedAt ? Math.max(0, Math.floor((now - routine.startedAt) / 1000)) : 0);
