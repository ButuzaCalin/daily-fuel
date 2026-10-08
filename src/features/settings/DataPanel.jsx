import { useEffect, useState } from 'react';
import { defaultSettings, exclusiveAiSettings } from '../ai/settings.js';
import { pruneUsage } from '../ai/usage.js';
import { normalizeGoal } from '../goal/goal.js';
import { cleanPortion, emptyNutrition } from '../meals/nutrition.js';
import { dateKey, shiftDate } from '../../lib/date.js';
import { formatBytes, plural } from '../../lib/format.js';
import { requestPersistentStorage } from '../../lib/storage.js';
import { backupAgeLabel, lastBackupAt, markBackedUp } from './backup.js';

// Sizes come from current state (what saveLocal writes), since localStorage is only updated after render.
// Browsers store strings as UTF-16, so each character takes 2 bytes.
function storageUsage(stored) {
  const entry = (key, text) => (key.length + (text?.length || 0)) * 2;
  const items = Object.entries(stored).map(([key, { label, value }]) => ({ key, label, bytes: entry(key, JSON.stringify(value)) }));
  let other = 0;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!stored[key]) other += entry(key, localStorage.getItem(key));
    }
  } catch {
    other = 0;
  }
  if (other) items.push({ key: 'other', label: 'Other', bytes: other });
  return { items, total: items.reduce((sum, item) => sum + item.bytes, 0) };
}

// What a range clear would remove, per kind of dated data, for the preview and the confirmation toast.
function clearRangePlan({ mealsByDate, weights, workoutLogs }, start, end) {
  const inRange = (date) => date >= start && date <= end;
  const mealDays = Object.entries(mealsByDate).filter(([date, meals]) => inRange(date) && meals.length);
  const meals = mealDays.reduce((sum, [, dayMeals]) => sum + dayMeals.length, 0);
  const weighIns = weights.filter((entry) => inRange(entry.date)).length;
  const sessions = Object.entries(workoutLogs).filter(([date]) => inRange(date)).reduce((sum, [, logs]) => sum + logs.length, 0);
  return [
    { key: 'meals', name: 'Meals', count: meals, label: plural(meals, 'meal'), detail: meals ? `${plural(meals, 'meal')} · ${plural(mealDays.length, 'day')}` : 'None' },
    { key: 'weights', name: 'Weigh-ins', count: weighIns, label: plural(weighIns, 'weigh-in'), detail: weighIns ? plural(weighIns, 'weigh-in') : 'None' },
    { key: 'workoutLogs', name: 'Workout sessions', count: sessions, label: plural(sessions, 'workout session'), detail: sessions ? plural(sessions, 'session') : 'None' },
  ];
}

export function DataPanel({ mealsByDate, setMealsByDate, goal, setGoal, weights, setWeights, workoutTemplates, setWorkoutTemplates, workoutLogs, setWorkoutLogs, settings, setSettings, usage, setUsage, notify }) {
  const today = dateKey(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [clearKinds, setClearKinds] = useState({ meals: true, weights: false, workoutLogs: false });
  const [lastBackup, setLastBackup] = useState(lastBackupAt);
  const [persisted, setPersisted] = useState(null);
  useEffect(() => { requestPersistentStorage().then(setPersisted); }, []);
  const storage = storageUsage({
    'daily-fuel-meals': { label: 'Meals', value: mealsByDate },
    'daily-fuel-weights': { label: 'Weights', value: weights },
    'daily-fuel-workout-templates': { label: 'My workouts', value: workoutTemplates },
    'daily-fuel-workout-logs': { label: 'Workout sessions', value: workoutLogs },
    'daily-fuel-usage': { label: 'Token usage', value: usage },
    'daily-fuel-settings': { label: 'Settings', value: settings },
    'daily-fuel-goal': { label: 'Goal', value: goal },
  });

  function exportData() {
    const backup = {
      app: 'daily-fuel',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { mealsByDate, goal, weights, workoutTemplates, workoutLogs, settings, usage },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-fuel-backup-${dateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    markBackedUp();
    setLastBackup(lastBackupAt());
    notify('Backup exported.', 'success');
  }

  async function importData(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      const data = backup?.app === 'daily-fuel' ? backup.data : null;
      if (!data || typeof data.mealsByDate !== 'object' || Array.isArray(data.mealsByDate)) throw new Error('This is not a valid Daily Fuel backup.');
      const importedMeals = Object.fromEntries(Object.entries(data.mealsByDate).map(([date, meals]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(meals)) throw new Error('The backup contains invalid meal data.');
        return [date, meals.map((meal) => ({
          id: String(meal.id || crypto.randomUUID()),
          time: String(meal.time || '12:00'),
          text: String(meal.text || '').trim(),
          nutrition: { ...emptyNutrition, ...(meal.nutrition || {}) },
          portion: cleanPortion(meal.portion),
          estimating: false,
          error: '',
        })).filter((meal) => meal.text)];
      }));
      setMealsByDate(importedMeals);
      setGoal(data.goal && typeof data.goal === 'object' ? normalizeGoal({ ...data.goal, scoring: data.goal.scoring === true, weightTracking: data.goal.weightTracking === true, workouts: data.goal.workouts === true }) : null);
      if (Array.isArray(data.weights)) setWeights(data.weights.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry?.date) && Number(entry.weight) > 0).map((entry) => ({ date: entry.date, weight: Number(entry.weight) })));
      if (Array.isArray(data.workoutTemplates)) setWorkoutTemplates(data.workoutTemplates.filter((template) => typeof template?.name === 'string' && Array.isArray(template.exercises)));
      if (data.workoutLogs && typeof data.workoutLogs === 'object' && !Array.isArray(data.workoutLogs)) setWorkoutLogs(Object.fromEntries(Object.entries(data.workoutLogs).filter(([date, logs]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(logs))));
      setSettings(exclusiveAiSettings({ ...defaultSettings, ...(data.settings || {}) }));
      if (data.usage && typeof data.usage === 'object') setUsage(pruneUsage(data.usage));
      notify('Backup imported.', 'success');
    } catch (error) {
      notify(error.message || 'Could not import this backup.');
    }
  }

  const clearPlan = clearRangePlan({ mealsByDate, weights, workoutLogs }, start, end);
  const clearTotal = clearPlan.reduce((sum, item) => sum + (clearKinds[item.key] ? item.count : 0), 0);
  const oldestDate = [...Object.keys(mealsByDate), ...weights.map((entry) => entry.date), ...Object.keys(workoutLogs)].sort()[0];
  // Selects the first `days` days starting at the oldest logged entry, to trim history from the far end.
  function selectOldest(days) {
    setStart(oldestDate);
    setEnd(shiftDate(oldestDate, days - 1));
  }
  function clearRange(event) {
    event.preventDefault();
    if (start > end) return notify('Choose a valid date range.');
    if (!clearTotal) return;
    const inRange = (date) => date >= start && date <= end;
    const removedMeals = clearKinds.meals ? Object.fromEntries(Object.entries(mealsByDate).filter(([date]) => inRange(date))) : {};
    const removedWeights = clearKinds.weights ? weights.filter((entry) => inRange(entry.date)) : [];
    const removedLogs = clearKinds.workoutLogs ? Object.fromEntries(Object.entries(workoutLogs).filter(([date]) => inRange(date))) : {};
    if (clearKinds.meals) setMealsByDate((current) => Object.fromEntries(Object.entries(current).filter(([date]) => !inRange(date))));
    if (clearKinds.weights) setWeights((current) => current.filter((entry) => !inRange(entry.date)));
    if (clearKinds.workoutLogs) setWorkoutLogs((current) => Object.fromEntries(Object.entries(current).filter(([date]) => !inRange(date))));
    const summary = clearPlan.filter((item) => clearKinds[item.key] && item.count).map((item) => item.label).join(', ');
    // Undo merges the removed entries back, so anything added in the meantime is kept.
    notify(`Deleted ${summary}.`, 'success', {
      label: 'Undo',
      onClick: () => {
        setMealsByDate((current) => ({ ...current, ...removedMeals }));
        setWeights((current) => [...current, ...removedWeights.filter((entry) => !current.some((item) => item.date === entry.date))].sort((a, b) => a.date.localeCompare(b.date)));
        setWorkoutLogs((current) => ({ ...current, ...removedLogs }));
        notify('Deleted data restored.', 'success');
      },
    });
  }
  return <><section className="settings-form storage-form"><div className="storage-heading"><h2>Storage</h2><strong>{formatBytes(storage.total)}</strong></div><div className="storage-list">{storage.items.map((item) => <div key={item.key}><span>{item.label}</span><strong>{formatBytes(item.bytes)}</strong></div>)}</div></section><section className="settings-form migration-form"><div><h2>Backup</h2><p>Your data is only stored on this device. Export a backup regularly, and before switching devices, or restore one you saved earlier.</p><p className="backup-status"><strong>{backupAgeLabel(lastBackup)}</strong>{persisted !== null && <span>{persisted ? 'Storage is protected from automatic cleanup.' : 'The browser may clear data if the device runs low on space.'}</span>}</p></div><div className="migration-actions"><button className="auth-submit" type="button" onClick={exportData}>Export</button><label className="import-button">Import<input type="file" accept="application/json,.json" onChange={importData} /></label></div></section><form className="settings-form clear-form" onSubmit={clearRange}>
    <h2>Clear data</h2>
    <p>Delete logged data within a date range. You can undo right after.</p>
    <div className="clear-presets" role="group" aria-label="Quick ranges">
      <button type="button" onClick={() => selectOldest(7)} disabled={!oldestDate}>Oldest week</button>
      <button type="button" onClick={() => selectOldest(30)} disabled={!oldestDate}>Oldest month</button>
    </div>
    <div className="clear-dates">
      <label>From<input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></label>
      <label>To<input type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} /></label>
    </div>
    <div className="clear-kinds">
      {clearPlan.map((item) => (
        <label key={item.key} data-empty={!item.count || undefined}>
          <input type="checkbox" checked={clearKinds[item.key]} onChange={(event) => setClearKinds((current) => ({ ...current, [item.key]: event.target.checked }))} />
          <span>{item.name}</span>
          <strong>{item.detail}</strong>
        </label>
      ))}
    </div>
    <p className="clear-summary">{start > end ? 'The start date is after the end date.' : clearTotal ? `${clearTotal} ${clearTotal === 1 ? 'item' : 'items'} will be deleted.` : 'Nothing selected to delete in this range.'}</p>
    <button className="clear-data-button" type="submit" disabled={!clearTotal || start > end}>{clearTotal ? `Delete ${clearTotal} ${clearTotal === 1 ? 'item' : 'items'}` : 'Nothing to delete'}</button>
  </form></>;
}
