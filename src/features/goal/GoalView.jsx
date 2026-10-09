import { useEffect, useState } from 'react';
import { Info, Menu as MenuIcon, Plus, Sparkles } from 'lucide-react';
import { HeaderQuota } from '../../components/HeaderQuota.jsx';
import { ManualInput } from '../../components/ManualInput.jsx';
import { Menu } from '../../components/Menu.jsx';
import { Toast } from '../../components/Toast.jsx';
import { GoalPeriodDialog } from './GoalPeriodDialog.jsx';
import { GoalWizardDialog } from './GoalWizardDialog.jsx';
import { ObjectiveInfoDialog } from './ObjectiveInfoDialog.jsx';
import { activePeriod, goalSummary, goalTargetKeys, goalTargets, normalizeGoal, periodRange, suggestTarget } from './goal.js';
import { objectives, scoringAvailable } from '../score/score.js';
import { dateKey, formatDate } from '../../lib/date.js';

// Goal edits are held in a draft until saved from the save bar.
export function GoalView({ goal, quota, setGoal, onEstimateGoal, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, notify }) {
  const current = normalizeGoal(goal);
  const toDraft = (value) => Object.fromEntries(goalTargetKeys.map((key) => [key, value[key] ? String(value[key]) : '']));
  const [draft, setDraft] = useState(() => toDraft(current));
  const [draftObjective, setDraftObjective] = useState(current.objective);
  const targets = normalizeGoal(draft);
  const suggested = suggestTarget(draft);
  const changed = goalTargetKeys.some((key) => targets[key] !== current[key]) || draftObjective !== current.objective;
  const targetSaved = goalTargetKeys.some((key) => current[key] > 0);
  const scoringOn = scoringAvailable(current);
  const [objectiveInfoOpen, setObjectiveInfoOpen] = useState(false);
  const [goalWizardOpen, setGoalWizardOpen] = useState(false);
  const [periodEdit, setPeriodEdit] = useState(null);
  const today = dateKey(new Date());
  const active = current.periods.length ? activePeriod(current.periods, today) : null;

  // Reload the form when the current goal changes elsewhere (e.g. a new goal from the history).
  const currentKey = JSON.stringify(goalTargets(current));
  useEffect(() => {
    setDraft(toDraft(current));
    setDraftObjective(current.objective);
  }, [currentKey]);

  function updateGoal(patch) {
    setGoal(normalizeGoal({ ...current, ...patch }));
  }

  function savePeriods(periods) {
    const next = normalizeGoal({ ...current, periods });
    setGoal(next);
    return next;
  }

  // Edits the current goal in place; days before its start keep their own goal.
  function saveTargets(event) {
    event.preventDefault();
    const period = { from: active?.from || today, ...goalTargets({ ...targets, objective: draftObjective }) };
    const next = savePeriods([...current.periods.filter((item) => item.from !== period.from), period]);
    setDraft(toDraft(next));
    setDraftObjective(next.objective);
    notify(current.scoring && !next.scoring ? 'Targets saved. Scoring turned off.' : 'Targets saved.', 'success');
  }

  // `moved` is the current goal shifted to start a day earlier, when a new goal takes over its start day.
  function savePeriod(period, originalFrom, moved) {
    savePeriods([...current.periods.filter((item) => item.from !== originalFrom && item.from !== period.from), ...(moved ? [moved] : []), period]);
    setPeriodEdit(null);
    notify(originalFrom ? 'Goal updated.' : 'New goal saved.', 'success');
  }

  function deletePeriod(from) {
    const previous = current.periods;
    savePeriods(previous.filter((item) => item.from !== from));
    setPeriodEdit(null);
    notify('Goal deleted.', 'info', { label: 'Undo', onClick: () => setGoal((value) => normalizeGoal({ ...value, periods: previous })) });
  }

  function startNewGoal() {
    setPeriodEdit({ from: today, ...goalTargets(current), isNew: true });
  }

  function applyAiGoal(values, objective) {
    setDraft(toDraft(values));
    setDraftObjective(objective);
  }

  return (
    <main className="app-shell goal-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button>
        <HeaderQuota quota={quota} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">Daily target</p><h1>Goal</h1></div></div>
      <div className="goal-sections">
        <form className="goal-form" onSubmit={saveTargets}>
          <div className="goal-section-heading goal-target-heading"><div><h2>Targets</h2><p>{active ? `Current goal, used ${current.periods[0] === active ? 'for all days until the next goal' : `since ${formatDate(active.from)}`}. Edits here also change past days.` : 'Set and save at least one target to activate scoring and see daily progress.'}</p></div><button className="goal-ai-button" type="button" onClick={() => setGoalWizardOpen(true)}><Sparkles aria-hidden="true" />Suggest with AI</button></div>
          <ManualInput label="Calories (kcal)" value={draft.calories} suggestion={suggested?.key === 'calories' ? suggested.value : null} onChange={(value) => setDraft((current) => ({ ...current, calories: value }))} />
          <ManualInput label="Protein (g)" value={draft.proteins} suggestion={suggested?.key === 'proteins' ? suggested.value : null} onChange={(value) => setDraft((current) => ({ ...current, proteins: value }))} />
          <ManualInput label="Carbs (g)" value={draft.carbs} suggestion={suggested?.key === 'carbs' ? suggested.value : null} onChange={(value) => setDraft((current) => ({ ...current, carbs: value }))} />
          <ManualInput label="Fat (g)" value={draft.fats} suggestion={suggested?.key === 'fats' ? suggested.value : null} onChange={(value) => setDraft((current) => ({ ...current, fats: value }))} />
          {active && (
            <div className="goal-new-callout">
              <span><strong>Changing your plan?</strong><small>Start a new goal so earlier days keep their targets.</small></span>
              <button className="goal-ai-button" type="button" onClick={startNewGoal}><Plus aria-hidden="true" />Start new goal</button>
            </div>
          )}
          {changed && (
            <div className="save-bar" role="region" aria-label="Unsaved changes">
              <span>Unsaved changes</span>
              <button className="save-bar-discard" type="button" onClick={() => { setDraft(toDraft(current)); setDraftObjective(current.objective); }}>Discard</button>
              <button className="save-bar-save" type="submit">Save</button>
            </div>
          )}
        </form>
        {active && (
          <section className="goal-form goal-history">
            <div className="goal-section-heading"><h2>Goal history</h2><p>Each day is scored and reported against the goal it had.</p></div>
            <ul className="goal-history-list">
              {[...current.periods].reverse().map((period, index, list) => (
                <li key={period.from}>
                  <button type="button" onClick={() => setPeriodEdit(period)} aria-label={`Edit goal from ${formatDate(period.from)}`}>
                    <span className="goal-history-dates"><strong>{periodRange(period, list[index - 1], index === list.length - 1, today)}</strong>{period === active ? <small>Current</small> : period.from > today && <small className="is-upcoming">Upcoming</small>}</span>
                    <span className="goal-history-targets">{goalSummary(period)}{scoringOn && ` · ${objectives[period.objective].label}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="goal-form">
          <div className="goal-section-heading"><h2>Daily score</h2><p>Adds the Scores page to the menu.</p></div>
          <label className="scoring-toggle">
            <input type="checkbox" role="switch" checked={scoringOn} disabled={!targetSaved} onChange={(event) => updateGoal({ scoring: event.target.checked })} />
            <span><strong>Scoring</strong><small>{targetSaved ? 'Rate each day 0–100 on how closely you followed your targets.' : 'Set and save at least one target to enable scoring.'}</small></span>
          </label>
          {scoringOn && (
            <div className="goal-objective">
              <div className="goal-objective-label"><span id="goal-objective-label">Objective</span><button type="button" onClick={() => setObjectiveInfoOpen(true)} aria-label="What do the objectives mean?" title="What do the objectives mean?"><Info aria-hidden="true" /></button></div>
              <div className="objective-toggle" role="radiogroup" aria-labelledby="goal-objective-label">
                {Object.entries(objectives).map(([key, objective]) => <button className={draftObjective === key ? 'active' : ''} type="button" role="radio" aria-checked={draftObjective === key} onClick={() => setDraftObjective(key)} key={key}>{objective.label}</button>)}
              </div>
            </div>
          )}
        </section>
        <GoalPeriodDialog period={periodEdit} periods={current.periods} active={active} showObjective={scoringOn} onSave={savePeriod} onDelete={deletePeriod} onClose={() => setPeriodEdit(null)} />
        <ObjectiveInfoDialog open={objectiveInfoOpen} selected={draftObjective} onSelect={(objective) => { setDraftObjective(objective); setObjectiveInfoOpen(false); }} onClose={() => setObjectiveInfoOpen(false)} />
        <GoalWizardDialog open={goalWizardOpen} selected={current.objective} onClose={() => setGoalWizardOpen(false)} onGenerate={onEstimateGoal} onApply={applyAiGoal} />
      </div>
    </main>
  );
}
