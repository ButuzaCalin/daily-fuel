import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Home, LoaderCircle, Menu as MenuIcon, RefreshCw, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { routeFromPath, routePaths } from './app/routes.js';
import { HeaderQuota } from './components/HeaderQuota.jsx';
import { Menu } from './components/Menu.jsx';
import { Toast } from './components/Toast.jsx';
import { GoalProgress, Macro } from './components/progress.jsx';
import { estimateDayLocally, estimateGoalLocally, estimateLocally } from './features/ai/direct.js';
import { estimateGoalViaProxy, estimateViaProxy, fetchProxyQuota, formatResetTime } from './features/ai/proxy.js';
import { defaultSettings, exclusiveAiSettings, isAiConfigured } from './features/ai/settings.js';
import { pruneUsage, recordUsage } from './features/ai/usage.js';
import { GoalView } from './features/goal/GoalView.jsx';
import { goalOn, normalizeGoal } from './features/goal/goal.js';
import { HelpView } from './features/help/HelpView.jsx';
import { MealDialog } from './features/meals/MealDialog.jsx';
import { MealNutrition } from './features/meals/MealNutrition.jsx';
import { applyEstimates, clearEstimating, currentHour, draftFromMeal, loggedLabel, mealFields, mealFromDraft, pastMeals, pendingEntries, reestimableEntries, sortMeals, withFreshIds } from './features/meals/meals.js';
import { blankNutrition, cleanNutrition, emptyNutrition, hasNutrition, sumNutrition } from './features/meals/nutrition.js';
import { ReportsView } from './features/reports/ReportsView.jsx';
import { reportDays } from './features/reports/reports.js';
import { DayScore } from './features/score/DayScore.jsx';
import { ScoreDialog } from './features/score/ScoreDialog.jsx';
import { ScoresView } from './features/score/ScoresView.jsx';
import { DAY_COMPLETE_HOUR, dayStatus, scoringAvailable } from './features/score/score.js';
import { SettingsView } from './features/settings/SettingsView.jsx';
import { takeBackupReminder } from './features/settings/backup.js';
import { WeightView } from './features/weight/WeightView.jsx';
import { WorkoutsView } from './features/workouts/WorkoutsView.jsx';
import { useNow } from './hooks/useNow.js';
import { dateKey, formatDate, shiftDate } from './lib/date.js';
import { loadLocal, requestPersistentStorage, saveLocal } from './lib/storage.js';

export function App() {
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [mealsByDate, setMealsByDate] = useState(() => clearEstimating(loadLocal('daily-fuel-meals', {})));
  const [mealDraft, setMealDraft] = useState(blankDraft);
  const [editMeal, setEditMeal] = useState(null);
  const [addMealOpen, setAddMealOpen] = useState(false);
  const [savedGoal, setGoal] = useState(() => { const saved = loadLocal('daily-fuel-goal', null); return saved && normalizeGoal(saved); });
  const goal = goalOn(savedGoal, dateKey(new Date()));
  const [weights, setWeights] = useState(() => loadLocal('daily-fuel-weights', []));
  const [workoutTemplates, setWorkoutTemplates] = useState(() => loadLocal('daily-fuel-workout-templates', []));
  const [workoutLogs, setWorkoutLogs] = useState(() => loadLocal('daily-fuel-workout-logs', {}));
  const [settings, setSettings] = useState(() => exclusiveAiSettings({ ...defaultSettings, ...loadLocal('daily-fuel-settings', {}) }));
  const [usage, setUsage] = useState(() => pruneUsage(loadLocal('daily-fuel-usage', { records: [] })));
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [newMealId, setNewMealId] = useState(null);
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname));
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('week');
  const [scoreOpen, setScoreOpen] = useState(false);
  const scoring = scoringAvailable(goal);
  const now = useNow(scoring);
  const meals = sortMeals(mealsByDate[selectedDate] || []);
  const mealOrder = settings.mealOrder;
  const shownMeals = mealOrder === 'desc' ? [...meals].reverse() : meals;
  const previousMeals = useMemo(() => pastMeals(mealsByDate), [mealsByDate]);

  useEffect(() => saveLocal('daily-fuel-meals', mealsByDate), [mealsByDate]);
  useEffect(() => saveLocal('daily-fuel-goal', savedGoal), [savedGoal]);
  useEffect(() => saveLocal('daily-fuel-weights', weights), [weights]);
  useEffect(() => saveLocal('daily-fuel-workout-templates', workoutTemplates), [workoutTemplates]);
  useEffect(() => saveLocal('daily-fuel-workout-logs', workoutLogs), [workoutLogs]);
  useEffect(() => saveLocal('daily-fuel-settings', settings), [settings]);
  useEffect(() => {
    const pruned = pruneUsage(usage);
    saveLocal('daily-fuel-usage', pruned);
    if (pruned.records.length !== usage.records?.length) setUsage(pruned);
  }, [usage]);

  const total = useMemo(() => sumNutrition(meals), [meals]);
  const dayGoal = goalOn(goal, selectedDate);
  const pendingCount = meals.filter((meal) => pendingEntries(meal).length).length;
  const dayEstimateLabel = !meals.length ? 'No meals to estimate' : pendingCount ? `Estimate all ${pendingCount} ${pendingCount === 1 ? 'meal' : 'meals'} without values at once` : 'All meals already have values';

  const reportIncludesToday = new Date().getHours() >= DAY_COMPLETE_HOUR;
  const report = useMemo(() => {
    const days = reportDays(reportPeriod, reportIncludesToday);
    const daily = days.map((date) => ({
      date,
      meals: mealsByDate[date] || [],
      nutrition: sumNutrition(mealsByDate[date] || []),
    }));
    return { days: daily, total: sumNutrition(daily.flatMap((day) => day.meals)) };
  }, [mealsByDate, reportPeriod, reportIncludesToday]);

  function notify(message, type = 'error', action = null) {
    window.clearTimeout(toastTimer.current);
    const toastAction = action && { label: action.label, onClick: () => { window.clearTimeout(toastTimer.current); setToast(null); action.onClick(); } };
    setToast({ id: Date.now(), message, type, action: toastAction });
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 6000 : 4200);
  }

  const useProxy = settings.aiMode === 'proxy';
  const aiConfigured = isAiConfigured(settings);

  function promptForKey() {
    notify(useProxy ? 'Add your proxy URL and username in Settings first.' : 'Add your AI key in Settings first.', 'error', { label: 'Open settings', onClick: () => navigate('ai') });
  }

  function trackUsage(usage, model) {
    setUsage((current) => recordUsage(current, { model, prompt_tokens: usage.promptTokenCount || usage.prompt_tokens || 0, completion_tokens: usage.candidatesTokenCount || usage.completion_tokens || 0, total_tokens: usage.totalTokenCount || usage.total_tokens || 0, created_at: new Date().toISOString() }));
  }

  const manualModel = settings.provider === 'google' ? settings.googleModel : settings.openaiModel;
  const [proxyQuota, setProxyQuota] = useState(null);

  // Load the proxy's daily quota, and refresh it when the app comes back to the foreground (the day may have rolled over).
  useEffect(() => {
    if (!useProxy || !aiConfigured) {
      setProxyQuota(null);
      return undefined;
    }
    let cancelled = false;
    const refresh = () => fetchProxyQuota(settings).then((quota) => { if (!cancelled) setProxyQuota(quota); }).catch(() => {});
    const handleVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [useProxy, aiConfigured, settings.proxyUrl, settings.proxyUsername, settings.proxyKey]);

  // Skip the round trip when the proxy already told us today's requests are used up.
  function quotaExhausted() {
    if (!useProxy || !proxyQuota || proxyQuota.remaining > 0 || new Date(proxyQuota.resetsAt) <= new Date()) return false;
    notify(`No AI requests left today. They reset at ${formatResetTime(proxyQuota.resetsAt)}.`);
    return true;
  }

  useEffect(() => {
    const handlePopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    requestPersistentStorage();
    const oldestDate = [...Object.keys(mealsByDate), ...weights.map((entry) => entry.date), ...Object.keys(workoutLogs)].sort()[0];
    const timer = window.setTimeout(() => {
      const reminder = takeBackupReminder(oldestDate);
      if (reminder) notify(reminder, 'info', { label: 'Back up', onClick: () => navigate('data-handling') });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []); // Once per app open.

  const weightTracking = Boolean(goal?.weightTracking);
  const workoutsEnabled = Boolean(goal?.workouts);
  useEffect(() => {
    if ((route !== 'scores' || scoring) && (route !== 'weight' || weightTracking) && (route !== 'workouts' || workoutsEnabled)) return;
    // Scoring is switched on from Goal; the other optional pages from Settings.
    const fallback = route === 'scores' ? 'goal' : 'settings';
    window.history.replaceState({}, '', routePaths[fallback]);
    setRoute(fallback);
  }, [route, scoring, weightTracking, workoutsEnabled]);

  function navigate(nextRoute, resetToToday = false) {
    const path = routePaths[nextRoute] || '/';
    window.history.pushState({}, '', path);
    if (resetToToday) setSelectedDate(dateKey(new Date()));
    setRoute(nextRoute);
    setMenuOpen(false);
  }

  // Keeps an unfinished draft when reopening, but a fresh one starts at the current hour.
  function openAddMeal() {
    if (!mealDraft.text.trim() && !mealDraft.items) setMealDraft((current) => ({ ...current, time: currentHour() }));
    setAddMealOpen(true);
  }

  function insertMeal(fields) {
    const newMeal = { id: crypto.randomUUID(), time: mealDraft.time, ...fields, estimating: false, error: '' };
    setMealsByDate((current) => ({ ...current, [selectedDate]: sortMeals([...(current[selectedDate] || []), newMeal]) }));
    setNewMealId(newMeal.id);
    setMealDraft(blankDraft());
    setAddMealOpen(false);
    return newMeal;
  }

  function addMeal(event) {
    event.preventDefault();
    const fields = mealFromDraft(mealDraft);
    if (!fields.text) return;
    insertMeal(fields);
  }

  // One-tap re-add from search; offers undo since it skips the form.
  function addPastMeal(meal) {
    const date = selectedDate;
    const { id } = insertMeal(mealFields(meal.items ? { items: withFreshIds(meal.items) } : meal));
    notify('Meal added.', 'info', { label: 'Undo', onClick: () => setMealsByDate((current) => ({ ...current, [date]: (current[date] || []).filter((item) => item.id !== id) })) });
  }

  // Each entry is a meal, or one item of a meal; all go out in a single request.
  async function requestEstimates(entries) {
    if (useProxy) return estimateViaProxy(entries, settings);
    if (entries.length === 1) {
      const result = await estimateLocally(entries[0].text, settings);
      return { nutritionById: { [entries[0].id]: result.nutrition }, usage: result.usage };
    }
    return estimateDayLocally(entries, settings);
  }

  function entriesToEstimate(meal, entries) {
    return entries.map((entry) => ({ id: entry.id, time: meal.time, text: entry.text }));
  }

  async function estimateMeal(meal) {
    const entries = reestimableEntries(meal);
    if (!entries.length) return;
    if (!aiConfigured) return promptForKey();
    if (quotaExhausted()) return;
    const { id } = meal;
    updateMeal(id, { estimating: true, error: '' });
    try {
      const result = await requestEstimates(entriesToEstimate(meal, entries));
      setMealsByDate((current) => ({
        ...current,
        [selectedDate]: (current[selectedDate] || []).map((item) => (item.id === id ? { ...applyEstimates(item, result.nutritionById), estimating: false, error: '' } : item)),
      }));
      trackUsage(result.usage, result.model || manualModel);
      if (result.quota) setProxyQuota(result.quota);
    } catch (error) {
      updateMeal(id, { estimating: false, error: error.message });
      if (error.quota) setProxyQuota(error.quota);
      notify(error.message);
    }
  }

  // Estimates only meals (or items) that have no values yet; ones already estimated or filled in by hand are left alone.
  async function estimateDay() {
    const pending = meals.filter((meal) => pendingEntries(meal).length);
    if (!pending.length || meals.some((meal) => meal.estimating)) return;
    if (!aiConfigured) return promptForKey();
    if (quotaExhausted()) return;

    updateMealEstimation(pending, { estimating: true, error: '' });
    try {
      const entries = pending.flatMap((meal) => entriesToEstimate(meal, pendingEntries(meal)));
      const result = useProxy ? await estimateViaProxy(entries, settings) : await estimateDayLocally(entries, settings);
      const ids = new Set(pending.map((meal) => meal.id));
      setMealsByDate((current) => ({
        ...current,
        [selectedDate]: (current[selectedDate] || []).map((meal) => (ids.has(meal.id) ? { ...applyEstimates(meal, result.nutritionById), estimating: false, error: '' } : meal)),
      }));
      trackUsage(result.usage, result.model || manualModel);
      if (result.quota) setProxyQuota(result.quota);
    } catch (error) {
      updateMealEstimation(pending, { estimating: false, error: error.message });
      if (error.quota) setProxyQuota(error.quota);
      notify(error.message);
    }
  }

  async function estimateGoal(profile) {
    if (!aiConfigured) {
      promptForKey();
      return null;
    }
    if (quotaExhausted()) return null;
    try {
      const result = useProxy ? await estimateGoalViaProxy(profile, settings) : await estimateGoalLocally(profile, settings);
      trackUsage(result.usage, result.model || manualModel);
      if (result.quota) setProxyQuota(result.quota);
      return result.targets;
    } catch (error) {
      if (error.quota) setProxyQuota(error.quota);
      notify(error.message);
      return null;
    }
  }

  function updateMealEstimation(dayMeals, changes) {
    const ids = new Set(dayMeals.map((meal) => meal.id));
    setMealsByDate((current) => ({
      ...current,
      [selectedDate]: (current[selectedDate] || []).map((meal) => (ids.has(meal.id) ? { ...meal, ...changes } : meal)),
    }));
  }

  async function updateMeal(id, changes, persist = false) {
    setMealsByDate((current) => ({
      ...current,
      [selectedDate]: (current[selectedDate] || []).map((meal) => (
        meal.id === id ? { ...meal, ...changes } : meal
      )),
    }));
    void persist;
  }

  // Deletes immediately and offers undo instead of asking for confirmation first.
  function removeMeal(meal) {
    const date = selectedDate;
    setMealsByDate((current) => ({ ...current, [date]: (current[date] || []).filter((item) => item.id !== meal.id) }));
    notify('Meal deleted.', 'info', {
      label: 'Undo',
      onClick: () => setMealsByDate((current) => ({ ...current, [date]: sortMeals([...(current[date] || []), { ...meal, estimating: false }]) })),
    });
  }

  function openEditMeal(meal) {
    setEditMeal({ id: meal.id, time: meal.time, ...draftFromMeal(meal) });
  }

  function saveMealEdit(event) {
    event.preventDefault();
    const fields = mealFromDraft(editMeal);
    const { text, nutrition } = fields;
    if (!text) return;
    const original = meals.find((meal) => meal.id === editMeal.id);
    const { id, time } = editMeal;
    setMealsByDate((current) => ({ ...current, [selectedDate]: sortMeals((current[selectedDate] || []).map((meal) => (meal.id === id ? { ...meal, ...fields, time } : meal))) }));
    setEditMeal(null);
    const nutritionUntouched = original && Object.keys(emptyNutrition).every((key) => cleanNutrition(original.nutrition)[key] === nutrition[key]);
    if (original && !original.items && !fields.items && original.text !== text && nutritionUntouched && Object.values(nutrition).some(Boolean)) {
      notify('Meal updated. Nutrition may be out of date.', 'info', { label: 'Re-estimate', onClick: () => estimateMeal({ ...original, text, time }) });
    }
  }

  // Saves the edit, then replaces the estimable values with a fresh AI estimate.
  function reestimateEdit() {
    const fields = editMeal && mealFromDraft(editMeal);
    const original = meals.find((meal) => meal.id === editMeal?.id);
    if (!fields?.text || !original) return;
    const saved = { ...original, ...fields, time: editMeal.time };
    setMealsByDate((current) => ({ ...current, [selectedDate]: sortMeals((current[selectedDate] || []).map((meal) => (meal.id === saved.id ? saved : meal))) }));
    setEditMeal(null);
    estimateMeal(saved);
  }

  function logout() { setMenuOpen(false); }

  if (route === 'reports') {
    return <ReportsView goal={goal} quota={useProxy ? proxyQuota : null} mealsByDate={mealsByDate} onOpenDay={(date) => { setSelectedDate(date); navigate('home'); }} report={report} period={reportPeriod} setPeriod={setReportPeriod} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} />;
  }
  if (route === 'scores' && scoring) {
    return <ScoresView goal={goal} quota={useProxy ? proxyQuota : null} mealsByDate={mealsByDate} onOpenDay={(date) => { setSelectedDate(date); navigate('home'); }} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} notify={notify} />;
  }
  if (route === 'weight' && weightTracking) {
    return <WeightView goal={goal} quota={useProxy ? proxyQuota : null} mealsByDate={mealsByDate} weights={weights} setWeights={setWeights} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} notify={notify} />;
  }
  if (route === 'workouts' && workoutsEnabled) {
    const chrome = <>
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => navigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button>
        <HeaderQuota quota={useProxy ? proxyQuota : null} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={navigate} onLogout={logout} username="Local device" goal={goal} />
      <Toast toast={toast} />
    </>;
    return <WorkoutsView chrome={chrome} templates={workoutTemplates} setTemplates={setWorkoutTemplates} logs={workoutLogs} setLogs={setWorkoutLogs} notify={notify} />;
  }
  if (route === 'goal') {
    return <GoalView goal={goal} quota={useProxy ? proxyQuota : null} setGoal={setGoal} onEstimateGoal={estimateGoal} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} notify={notify} />;
  }
  if (['settings', 'ai', 'usage', 'data-handling'].includes(route)) {
    return <SettingsView tab={route} goal={goal} setGoal={setGoal} proxyQuota={useProxy ? proxyQuota : null} settings={settings} setSettings={setSettings} usage={usage} setUsage={setUsage} mealsByDate={mealsByDate} setMealsByDate={setMealsByDate} weights={weights} setWeights={setWeights} workoutTemplates={workoutTemplates} setWorkoutTemplates={setWorkoutTemplates} workoutLogs={workoutLogs} setWorkoutLogs={setWorkoutLogs} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} notify={notify} />;
  }
  if (route === 'help') {
    return <HelpView goal={goal} quota={useProxy ? proxyQuota : null} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} />;
  }
  if (route === 'not-found') {
    return (
      <main className="app-shell not-found-page">
        <header className="topbar">
          <button className="brand" type="button" onClick={() => navigate('home')} aria-label="Daily Fuel home">
            <span className="brand-mark">DF</span>
            <span>Daily Fuel</span>
          </button>
          <HeaderQuota quota={useProxy ? proxyQuota : null} />
        </header>
        <section className="not-found-content">
          <p className="not-found-code">404</p>
          <h1>Page not found</h1>
          <p>This page may have moved or the address may be incorrect.</p>
          <button className="auth-submit" type="button" onClick={() => navigate('home')}><Home aria-hidden="true" />Back to today</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="home-header">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <section className="date-picker" aria-label="Choose a day">
          <button className="arrow-button" type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} aria-label="Previous day">&larr;</button>
          <div className="date-display">
            {selectedDate === dateKey(new Date())
              ? <span className="date-label">Today</span>
              : <button className="today-button" type="button" onClick={() => setSelectedDate(dateKey(new Date()))} title="Back to today"><Undo2 aria-hidden="true" />Back to today</button>}
            <label className="date-control">
              <strong>{formatDate(selectedDate)}</strong>
              <input aria-label="Select date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
          </div>
          <button className="arrow-button" type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} aria-label="Next day">&rarr;</button>
        </section>
        <HeaderQuota quota={useProxy ? proxyQuota : null} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={navigate} onLogout={logout} username="Local device" goal={goal} />
      <Toast toast={toast} />

      <div className="content-grid">
        <section className="journal-panel">
          <div className="section-heading">
            <h2>Meals</h2>
            <span className="meal-count">{meals.length}</span>
            {meals.length > 1 && (
              <button className="meal-sort" type="button" onClick={() => setSettings((current) => ({ ...current, mealOrder: current.mealOrder === 'desc' ? 'asc' : 'desc' }))} title={mealOrder === 'desc' ? 'Newest first' : 'Oldest first'} aria-label={`Sorted ${mealOrder === 'desc' ? 'newest' : 'oldest'} first. Change order`}>
                {mealOrder === 'desc' ? <ArrowDownWideNarrow aria-hidden="true" /> : <ArrowUpNarrowWide aria-hidden="true" />}{mealOrder === 'desc' ? 'Newest first' : 'Oldest first'}
              </button>
            )}
          </div>

          <div className="meal-list">
            {meals.length === 0 ? (
              <div className="empty-state">
                <p>No meals logged {selectedDate === dateKey(new Date()) ? 'today' : 'on this day'}</p>
                <button className="empty-add" type="button" onClick={openAddMeal}>Add a meal</button>
              </div>
            ) : shownMeals.map((meal) => (
              <article className={`meal-card${meal.id === newMealId ? ' is-new' : ''}`} data-estimating={meal.estimating || undefined} onAnimationEnd={(event) => { if (event.target === event.currentTarget) setNewMealId(null); }} key={meal.id}>
                <div className="meal-time">{meal.time}</div>
                <div className="meal-main">
                  <button className="meal-text" type="button" onClick={() => openEditMeal(meal)} title="Edit meal">
                    {meal.items ? <span className="meal-card-items">{meal.items.map((item) => <span key={item.id}><span>{item.text}</span><small>{hasNutrition(item) ? `${Math.round(item.nutrition.calories)} kcal` : '—'}</small></span>)}</span> : meal.text}
                  </button>
                </div>
                <div className="meal-actions">
                  {(() => {
                    const pending = pendingEntries(meal).length > 0;
                    const label = pending ? (meal.items && hasNutrition(meal) ? 'Estimate items without values' : 'Estimate with AI') : meal.items ? 'Re-estimate AI values (scanned and typed values are kept)' : 'Re-estimate with AI (replaces current values)';
                    return <button className={`estimate-button${pending ? '' : ' is-reestimate'}`} type="button" onClick={() => estimateMeal(meal)} disabled={meal.estimating || !reestimableEntries(meal).length} title={label}>
                      {meal.estimating ? <LoaderCircle className="ai-loading" aria-hidden="true" /> : pending ? <Sparkles className="ai-icon" aria-hidden="true" /> : <RefreshCw className="ai-icon" aria-hidden="true" />}
                      <span className="sr-only">{meal.estimating ? 'Estimating' : label}</span>
                    </button>;
                  })()}
                  <button className="remove-button" type="button" onClick={() => removeMeal(meal)} aria-label={`Delete ${meal.text}`} title="Delete meal"><Trash2 /></button>
                </div>
                <MealNutrition nutrition={meal.nutrition} />
              </article>
            ))}
          </div>
        </section>

        <aside className="summary-panel" data-estimating={meals.some((meal) => meal.estimating) || undefined}>
          <div className="summary-heading">
            <p className="eyebrow">Daily total</p>
            <span className="summary-date">{selectedDate === dateKey(new Date()) ? 'Today' : formatDate(selectedDate)}</span>
            {scoring && <DayScore total={total} goal={dayGoal} meals={meals} status={dayStatus(selectedDate, dateKey(now), now)} onOpen={() => setScoreOpen(true)} />}
            <button className="estimate-button daily-estimate-button" type="button" onClick={estimateDay} disabled={!pendingCount || meals.some((meal) => meal.estimating)} aria-label={dayEstimateLabel} title={dayEstimateLabel}>
              {meals.some((meal) => meal.estimating) ? <LoaderCircle className="ai-loading" aria-hidden="true" /> : <Sparkles className="ai-icon" aria-hidden="true" />}
              <span className="daily-estimate-label">{pendingCount ? 'Estimate all' : 'Up to date'}</span>
              {pendingCount > 0 && <span className="daily-estimate-count">{pendingCount}</span>}
            </button>
          </div>
          <div className="calorie-total"><div><strong>{Math.round(total.calories)}</strong><span>kcal</span></div>{dayGoal?.calories > 0 && <strong className="calorie-goal">/ {Math.round(dayGoal.calories)}<small> kcal</small></strong>}</div>
          {dayGoal?.calories > 0 && <GoalProgress value={total.calories} goal={dayGoal.calories} color="green" />}
          <div className="macro-grid">
            <Macro label="Protein" value={total.proteins} goal={dayGoal?.proteins} color="blue" />
            <Macro label="Carbs" value={total.carbs} goal={dayGoal?.carbs} color="yellow" />
            <Macro label="Fat" value={total.fats} goal={dayGoal?.fats} color="coral" />
          </div>
        </aside>
      </div>
      <button className="add-meal-fab" type="button" onClick={openAddMeal} aria-label="Add meal">+</button>
      <MealDialog
        draft={addMealOpen ? mealDraft : null}
        collapsibleNutrition
        suggestions={previousMeals}
        clearable
        scannable
        onQuickAdd={addPastMeal}
        title={selectedDate === dateKey(new Date()) ? 'Add meal' : `Add meal · ${loggedLabel(selectedDate)}`}
        submitLabel="Add meal"
        onChange={(patch) => setMealDraft((current) => mergeDraft(current, patch))}
        onClose={() => setAddMealOpen(false)}
        onSubmit={addMeal}
      />
      <ScoreDialog open={scoring && scoreOpen} total={total} goal={dayGoal} meals={meals} pendingCount={pendingCount} status={dayStatus(selectedDate, dateKey(now), now)} now={now} onClose={() => setScoreOpen(false)} />
      <MealDialog draft={editMeal} title="Edit meal" submitLabel="Save" onChange={(patch) => setEditMeal((current) => mergeDraft(current, patch))} onClose={() => setEditMeal(null)} onSubmit={saveMealEdit} onReestimate={reestimateEdit} />
    </main>
  );
}

function blankDraft() {
  return { text: '', time: currentHour(), nutrition: blankNutrition, portion: null, source: null, items: null };
}

// Editors send partial nutrition (one macro at a time), so it merges rather than replaces.
function mergeDraft(current, patch) {
  return { ...current, ...patch, nutrition: patch.nutrition ? { ...current.nutrition, ...patch.nutrition } : current.nutrition };
}
