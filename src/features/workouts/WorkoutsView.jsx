import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, Trash2, Upload } from 'lucide-react';
import { RoutineDialog } from './RoutineDialog.jsx';
import { TemplateDialog } from './TemplateDialog.jsx';
import { defaultIcon, iconKey, WorkoutIcon } from './WorkoutIcon.jsx';
import { PickWorkoutDialog, UnsavedDialog } from './dialogs.jsx';
import { useTicker } from './useTicker.js';
import { autoEndSeconds, blankExercise, cleanExercises, durationLabel, elapsed, exerciseSummary, exerciseType, formatDuration, loggedExercises, parseTemplates, routineDraft, routineLog, routineSnapshot, startRoutine, templateSignature, templateSnapshot } from './workouts.js';
import { dateKey, formatDate } from '../../lib/date.js';
import { plural } from '../../lib/format.js';
import { loadLocal, saveLocal } from '../../lib/storage.js';
import './workouts.css';

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
  const now = useTicker(Boolean(routine));
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
