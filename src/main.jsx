import { StrictMode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Clock, Cpu, Database, Home, LoaderCircle, Menu as MenuIcon, Pencil, RefreshCw, Settings, Sparkles, Target, Trash2, Undo2, X } from 'lucide-react';
import './styles.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (import.meta.env.PROD) {
      await navigator.serviceWorker.register('/sw.js').catch(() => {});
      return;
    }
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  });
}

// Fetches the latest app files; only Cache Storage is cleared, so localStorage data is kept.
async function updateApp() {
  if (!navigator.onLine) throw new Error('You are offline. Connect to update the app.');
  const registration = await navigator.serviceWorker?.getRegistration();
  await registration?.update();
  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }
  window.location.replace('/');
}

document.addEventListener('gesturestart', (event) => event.preventDefault());

const emptyNutrition ={ calories: 0, proteins: 0, carbs: 0, fats: 0 };
const defaultSettings = { aiMode: 'manual', proxyUrl: '', proxyUsername: '', proxyKey: '', provider: 'google', googleKey: '', googleModel: 'gemini-3.5-flash-lite', openaiKey: '', openaiModel: 'gpt-4o-mini' };
const aiModeLabels = { manual: 'Manual Config', proxy: 'Proxy Config' };

// Only one AI config may hold credentials at a time: keep the active one, reset the other.
function exclusiveAiSettings(settings) {
  if (settings.aiMode === 'proxy') {
    return { ...settings, provider: defaultSettings.provider, googleKey: '', googleModel: defaultSettings.googleModel, openaiKey: '', openaiModel: defaultSettings.openaiModel };
  }
  return { ...settings, aiMode: 'manual', proxyUrl: '', proxyUsername: '', proxyKey: '' };
}

function isAiConfigured(settings) {
  if (settings.aiMode === 'proxy') return Boolean(settings.proxyUrl && settings.proxyUsername);
  return Boolean(settings.provider === 'openai' ? settings.openaiKey : settings.googleKey);
}

const reportMetrics = {
  calories: { label: 'Calories', suffix: 'kcal' },
  proteins: { label: 'Protein', suffix: 'g' },
  carbs: { label: 'Carbs', suffix: 'g' },
  fats: { label: 'Fat', suffix: 'g' },
};

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function shiftDate(value, amount) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function sortMeals(meals) {
  return [...meals].sort((first, second) => first.time.localeCompare(second.time));
}

function loadLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function clearEstimating(mealsByDate) {
  return Object.fromEntries(Object.entries(mealsByDate).map(([date, meals]) => [date, meals.map((meal) => (meal.estimating ? { ...meal, estimating: false } : meal))]));
}

function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Could not connect to the server.');
  }
  const body = await response.text();
  let result = {};
  try {
    result = body ? JSON.parse(body) : {};
  } catch {
    result = {};
  }
  if (!response.ok) throw new Error(result.error || 'Something went wrong.');
  return result;
}

// Some OpenAI models only accept the default temperature of 1.
function fetchOpenAI(settings, prompt) {
  const temperature = /luna|sol/i.test(settings.openaiModel || '') ? 1 : 0;
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.openaiKey}` },
    body: JSON.stringify({ model: settings.openaiModel, temperature, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
  });
}

function cleanNutrition(source) {
  return ['calories', 'proteins', 'carbs', 'fats'].reduce((nutrition, key) => {
    const value = Number(source?.[key]);
    nutrition[key] = Number.isFinite(value) ? Math.max(0, Math.round(value * 10) / 10) : 0;
    return nutrition;
  }, {});
}

// Proxy contract (see supabase/functions/estimate): POST { username, meals: [{ id, time, text }] }
// -> { meals: [{ id, calories, proteins, carbs, fats }], usage, model, quota }, or { username, action: 'quota' } -> { quota }.
// The proxy owns the prompt and the provider key, so neither lives on the device.
async function callProxy(settings, payload) {
  let response;
  try {
    response = await fetch(settings.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(settings.proxyKey ? { Authorization: `Bearer ${settings.proxyKey}` } : {}) },
      body: JSON.stringify({ username: settings.proxyUsername, ...payload }),
    });
  } catch {
    throw new Error('Could not reach the proxy.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The proxy request failed.');
    error.quota = result.quota;
    throw error;
  }
  return result;
}

async function fetchProxyQuota(settings) {
  const result = await callProxy(settings, { action: 'quota' });
  return result.quota || null;
}

async function estimateViaProxy(meals, settings) {
  const result = await callProxy(settings, { meals: meals.map(({ id, time, text }) => ({ id, time, text })) });
  if (!Array.isArray(result.meals)) throw new Error('The proxy returned an invalid response.');
  const nutritionById = Object.fromEntries(result.meals.map((estimate) => [String(estimate.id), cleanNutrition(estimate)]));
  if (meals.some((meal) => !nutritionById[meal.id])) throw new Error('The proxy did not return nutrition for every meal.');
  return { nutritionById, usage: result.usage || {}, model: result.model || 'proxy', quota: result.quota || null };
}

function formatResetTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function estimateLocally(meal, settings) {
  const prompt = `The meal description may be in English or Romanian. Return only a JSON object with numeric keys: calories, proteins, carbs, fats. Estimate the total for the meal.\ncalories, proteins, carbs and fats in this meal:\n${meal}`;
  let response;
  if (settings.provider === 'openai') {
    response = await fetchOpenAI(settings, prompt);
  } else {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.googleModel)}:generateContent?key=${encodeURIComponent(settings.googleKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
    });
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'The AI estimate failed.');
  const content = settings.provider === 'openai' ? result.choices?.[0]?.message?.content : result.candidates?.[0]?.content?.parts?.[0]?.text;
  return { nutrition: cleanNutrition(JSON.parse(content || '{}')), usage: result.usageMetadata || result.usage || {} };
}

async function estimateDayLocally(meals, settings) {
  const prompt = `The meal descriptions may be in English or Romanian. Return only a JSON object with a meals array containing one object for each meal, using the exact id provided. Each object must contain id, calories, proteins, carbs, and fats as numeric values. Estimate the total nutrition for each meal.
meals:
${JSON.stringify(meals.map((meal) => ({ id: meal.id, time: meal.time, description: meal.text })))} `;
  let response;
  if (settings.provider === 'openai') {
    response = await fetchOpenAI(settings, prompt);
  } else {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.googleModel)}:generateContent?key=${encodeURIComponent(settings.googleKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
    });
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'The AI estimate failed.');
  const content = settings.provider === 'openai' ? result.choices?.[0]?.message?.content : result.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = JSON.parse(content || '[]');
  const estimates = Array.isArray(parsed) ? parsed : parsed.meals;
  if (!Array.isArray(estimates)) throw new Error('The AI returned an invalid day estimate.');
  const nutritionById = Object.fromEntries(estimates.map((estimate) => [String(estimate.id), cleanNutrition(estimate)]));
  if (meals.some((meal) => !nutritionById[meal.id])) throw new Error('The AI did not return nutrition for every meal.');
  return { nutritionById, usage: result.usageMetadata || result.usage || {} };
}

function hasNutrition(meal) {
  return Object.values(meal.nutrition || {}).some((value) => Number(value) > 0);
}

function sumNutrition(meals) {
  return meals.reduce((sum, meal) => ({
    calories: sum.calories + (Number(meal.nutrition.calories) || 0),
    proteins: sum.proteins + (Number(meal.nutrition.proteins) || 0),
    carbs: sum.carbs + (Number(meal.nutrition.carbs) || 0),
    fats: sum.fats + (Number(meal.nutrition.fats) || 0),
  }), { ...emptyNutrition });
}

function reportDays(period) {
  const days = [];
  const count = period === 'month' ? 30 : 7;
  const today = new Date();
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    days.push(dateKey(date));
  }
  return days;
}

function shortDate(value, period) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en', period === 'month'
    ? { month: 'numeric', day: 'numeric' }
    : { weekday: 'short' }).format(date);
}

function chartNumber(value) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

function formatUsageDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

function currentHour() {
  return `${String(new Date().getHours()).padStart(2, '0')}:00`;
}

const usageRetentionMs = 7 * 24 * 60 * 60 * 1000;

function pruneUsage(value) {
  const cutoff = Date.now() - usageRetentionMs;
  const records = (value?.records || value?.recent || []).filter((item) => {
    const createdAt = new Date(item.created_at).getTime();
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
  const dailyByDate = records.reduce((result, item) => {
    const date = item.created_at.slice(0, 10);
    const current = result[date] || { date, tokens: 0, requests: 0 };
    current.tokens += Number(item.total_tokens) || 0;
    current.requests += 1;
    result[date] = current;
    return result;
  }, {});
  const summary = records.reduce((result, item) => ({
    requests: result.requests + 1,
    prompt_tokens: result.prompt_tokens + (Number(item.prompt_tokens) || 0),
    completion_tokens: result.completion_tokens + (Number(item.completion_tokens) || 0),
    total_tokens: result.total_tokens + (Number(item.total_tokens) || 0),
  }), { requests: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
  return { records, recent: records.slice(0, 20), daily: Object.values(dailyByDate).sort((first, second) => second.date.localeCompare(first.date)), summary };
}

function recordUsage(current, item) {
  return pruneUsage({ ...current, records: [item, ...(current.records || current.recent || [])] });
}

// Keeps an overlay mounted for `duration` ms after it closes so its exit animation can play.
function usePresence(value, duration) {
  const [rendered, setRendered] = useState(value);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (value) {
      setRendered(value);
      setClosing(false);
      return undefined;
    }
    if (!rendered) return undefined;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(null);
      setClosing(false);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [value, duration]);
  return [value || rendered, closing];
}

function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event) => { if (event.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, onEscape]);
}

function App() {
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [mealsByDate, setMealsByDate] = useState(() => clearEstimating(loadLocal('daily-fuel-meals', {})));
  const [mealText, setMealText] = useState('');
  const [mealTime, setMealTime] = useState(currentHour);
  const [editMeal, setEditMeal] = useState(null);
  const [addMealOpen, setAddMealOpen] = useState(false);
  const [goal, setGoal] = useState(() => loadLocal('daily-fuel-goal', null));
  const [settings, setSettings] = useState(() => exclusiveAiSettings({ ...defaultSettings, ...loadLocal('daily-fuel-settings', {}) }));
  const [usage, setUsage] = useState(() => pruneUsage(loadLocal('daily-fuel-usage', { records: [] })));
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [newMealId, setNewMealId] = useState(null);
  const [route, setRoute] = useState(() => window.location.pathname === '/reports' ? 'reports' : window.location.pathname === '/usage' ? 'usage' : window.location.pathname === '/goal' ? 'goal' : window.location.pathname === '/settings' ? 'settings' : window.location.pathname === '/clear-data' ? 'clear-data' : 'home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('week');
  const meals = sortMeals(mealsByDate[selectedDate] || []);

  useEffect(() => saveLocal('daily-fuel-meals', mealsByDate), [mealsByDate]);
  useEffect(() => saveLocal('daily-fuel-goal', goal), [goal]);
  useEffect(() => saveLocal('daily-fuel-settings', settings), [settings]);
  useEffect(() => {
    const pruned = pruneUsage(usage);
    saveLocal('daily-fuel-usage', pruned);
    if (pruned.records.length !== usage.records.length) setUsage(pruned);
  }, [usage]);

  const total = useMemo(() => sumNutrition(meals), [meals]);
  const pendingCount = meals.filter((meal) => !hasNutrition(meal)).length;
  const dayEstimateLabel = !meals.length ? 'No meals to estimate' : pendingCount ? `Estimate ${pendingCount} ${pendingCount === 1 ? 'meal' : 'meals'} without values` : 'All meals already have values';

  const report = useMemo(() => {
    const days = reportDays(reportPeriod);
    const daily = days.map((date) => ({
      date,
      meals: mealsByDate[date] || [],
      nutrition: sumNutrition(mealsByDate[date] || []),
    }));
    return { days: daily, total: sumNutrition(daily.flatMap((day) => day.meals)) };
  }, [mealsByDate, reportPeriod]);

  function notify(message, type = 'error', action = null) {
    window.clearTimeout(toastTimer.current);
    const toastAction = action && { label: action.label, onClick: () => { window.clearTimeout(toastTimer.current); setToast(null); action.onClick(); } };
    setToast({ id: Date.now(), message, type, action: toastAction });
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 6000 : 4200);
  }

  const useProxy = settings.aiMode === 'proxy';
  const aiConfigured = isAiConfigured(settings);

  function promptForKey() {
    notify(useProxy ? 'Add your proxy URL and username in Settings first.' : 'Add your AI key in Settings first.', 'error', { label: 'Open settings', onClick: () => navigate('settings') });
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
    const handlePopState = () => setRoute(window.location.pathname === '/reports' ? 'reports' : window.location.pathname === '/usage' ? 'usage' : window.location.pathname === '/goal' ? 'goal' : window.location.pathname === '/settings' ? 'settings' : window.location.pathname === '/clear-data' ? 'clear-data' : 'home');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(nextRoute, resetToToday = false) {
    const path = nextRoute === 'reports' ? '/reports' : nextRoute === 'usage' ? '/usage' : nextRoute === 'goal' ? '/goal' : nextRoute === 'settings' ? '/settings' : nextRoute === 'clear-data' ? '/clear-data' : '/';
    window.history.pushState({}, '', path);
    if (resetToToday) setSelectedDate(dateKey(new Date()));
    setRoute(nextRoute);
    setMenuOpen(false);
  }

  async function addMeal(event) {
    event.preventDefault();
    if (!mealText.trim()) return;
    try {
      const newMeal = { id: crypto.randomUUID(), time: mealTime, text: mealText.trim(), nutrition: { ...emptyNutrition }, estimating: false, error: '' };
      setMealsByDate((current) => ({ ...current, [selectedDate]: sortMeals([...(current[selectedDate] || []), newMeal]) }));
      setNewMealId(newMeal.id);
      setMealText('');
      setAddMealOpen(false);
    } catch (error) {
      notify(error.message);
    }
  }

  async function estimateMeal(meal) {
    if (!aiConfigured) return promptForKey();
    if (quotaExhausted()) return;
    const { id } = meal;
    updateMeal(id, { estimating: true, error: '' });
    try {
      if (useProxy) {
        const result = await estimateViaProxy([meal], settings);
        updateMeal(id, { nutrition: result.nutritionById[id], estimating: false });
        trackUsage(result.usage, result.model);
        if (result.quota) setProxyQuota(result.quota);
      } else {
        const result = await estimateLocally(meal.text, settings);
        updateMeal(id, { nutrition: result.nutrition, estimating: false });
        trackUsage(result.usage, manualModel);
      }
    } catch (error) {
      updateMeal(id, { estimating: false, error: error.message });
      if (error.quota) setProxyQuota(error.quota);
      notify(error.message);
    }
  }

  // Estimates only meals that have no values yet; meals already estimated or filled in by hand are left alone.
  async function estimateDay() {
    const pending = meals.filter((meal) => !hasNutrition(meal));
    if (!pending.length || meals.some((meal) => meal.estimating)) return;
    if (!aiConfigured) return promptForKey();
    if (quotaExhausted()) return;

    updateMealEstimation(pending, { estimating: true, error: '' });
    try {
      const result = useProxy ? await estimateViaProxy(pending, settings) : await estimateDayLocally(pending, settings);
      setMealsByDate((current) => ({
        ...current,
        [selectedDate]: (current[selectedDate] || []).map((meal) => (result.nutritionById[meal.id] ? { ...meal, nutrition: result.nutritionById[meal.id], estimating: false, error: '' } : meal)),
      }));
      trackUsage(result.usage, result.model || manualModel);
      if (result.quota) setProxyQuota(result.quota);
    } catch (error) {
      updateMealEstimation(pending, { estimating: false, error: error.message });
      if (error.quota) setProxyQuota(error.quota);
      notify(error.message);
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
    setEditMeal({ id: meal.id, text: meal.text, time: meal.time, nutrition: { ...meal.nutrition } });
  }

  function saveMealEdit(event) {
    event.preventDefault();
    const text = editMeal?.text.trim();
    if (!text) return;
    const original = meals.find((meal) => meal.id === editMeal.id);
    const { id, time } = editMeal;
    const nutrition = cleanNutrition(editMeal.nutrition);
    setMealsByDate((current) => ({ ...current, [selectedDate]: sortMeals((current[selectedDate] || []).map((meal) => (meal.id === id ? { ...meal, text, time, nutrition } : meal))) }));
    setEditMeal(null);
    const nutritionUntouched = original && Object.keys(emptyNutrition).every((key) => cleanNutrition(original.nutrition)[key] === nutrition[key]);
    if (original && original.text !== text && nutritionUntouched && Object.values(nutrition).some(Boolean)) {
      notify('Meal updated. Nutrition may be out of date.', 'info', { label: 'Re-estimate', onClick: () => estimateMeal({ ...original, text, time }) });
    }
  }

  function logout() { setMenuOpen(false); }

  if (route === 'reports') {
    return <ReportsView report={report} period={reportPeriod} setPeriod={setReportPeriod} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} />;
  }
  if (route === 'usage') {
    return <UsageView usage={usage} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} />;
  }
  if (route === 'goal') {
    return <GoalView goal={goal} setGoal={setGoal} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} notify={notify} />;
  }
  if (route === 'settings') {
    return <SettingsView proxyQuota={useProxy ? proxyQuota : null} settings={settings} setSettings={setSettings} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} notify={notify} />;
  }
  if (route === 'clear-data') {
    return <ClearDataView mealsByDate={mealsByDate} setMealsByDate={setMealsByDate} goal={goal} setGoal={setGoal} settings={settings} setSettings={setSettings} usage={usage} setUsage={setUsage} onNavigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} username="Local device" onLogout={logout} toast={toast} notify={notify} />;
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
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={navigate} onLogout={logout} username="Local device" />
      <Toast toast={toast} />

      <div className="content-grid">
        <section className="journal-panel">
          <div className="section-heading">
            <h2>Meals</h2>
            <span className="meal-count">{meals.length}</span>
          </div>

          <div className="meal-list">
            {meals.length === 0 ? (
              <div className="empty-state">
                <p>No meals logged {selectedDate === dateKey(new Date()) ? 'today' : 'on this day'}</p>
                <button className="empty-add" type="button" onClick={() => setAddMealOpen(true)}>Add a meal</button>
              </div>
            ) : meals.map((meal) => (
              <article className={`meal-card${meal.id === newMealId ? ' is-new' : ''}`} data-estimating={meal.estimating || undefined} onAnimationEnd={(event) => { if (event.target === event.currentTarget) setNewMealId(null); }} key={meal.id}>
                <div className="meal-time">{meal.time}</div>
                <div className="meal-main">
                  <button className="meal-text" type="button" onClick={() => openEditMeal(meal)} title="Edit meal">{meal.text}</button>
                </div>
                <div className="meal-actions">
                  <button className={`estimate-button${hasNutrition(meal) ? ' is-reestimate' : ''}`} type="button" onClick={() => estimateMeal(meal)} disabled={meal.estimating} title={hasNutrition(meal) ? 'Re-estimate with AI (replaces current values)' : 'Estimate with AI'}>
                    {meal.estimating ? <LoaderCircle className="ai-loading" aria-hidden="true" /> : hasNutrition(meal) ? <RefreshCw className="ai-icon" aria-hidden="true" /> : <Sparkles className="ai-icon" aria-hidden="true" />}
                    <span className="sr-only">{meal.estimating ? 'Estimating' : hasNutrition(meal) ? 'Re-estimate nutrition with AI' : 'Estimate nutrition with AI'}</span>
                  </button>
                  <button className="manual-button" type="button" onClick={() => openEditMeal(meal)} aria-label={`Edit ${meal.text}`} title="Edit meal"><Pencil /></button>
                </div>
                <button className="remove-button" type="button" onClick={() => removeMeal(meal)} aria-label={`Delete ${meal.text}`} title="Delete meal"><Trash2 /></button>
                <div className="meal-nutrition">
                  <NutritionItem label="kcal" value={meal.nutrition.calories} />
                  <NutritionItem label="protein" value={meal.nutrition.proteins} suffix="g" />
                  <NutritionItem label="carbs" value={meal.nutrition.carbs} suffix="g" />
                  <NutritionItem label="fat" value={meal.nutrition.fats} suffix="g" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="summary-panel" data-estimating={meals.some((meal) => meal.estimating) || undefined}>
          <div className="summary-heading">
            <p className="eyebrow">Daily total</p>
            <span className="summary-date">{selectedDate === dateKey(new Date()) ? 'Today' : formatDate(selectedDate)}</span>
            <button className="estimate-button daily-estimate-button" type="button" onClick={estimateDay} disabled={!pendingCount || meals.some((meal) => meal.estimating)} aria-label={dayEstimateLabel} title={dayEstimateLabel}>
              {meals.some((meal) => meal.estimating) ? <LoaderCircle className="ai-loading" aria-hidden="true" /> : <Sparkles className="ai-icon" aria-hidden="true" />}
            </button>
          </div>
          <div className="calorie-total"><div><strong>{Math.round(total.calories)}</strong><span>kcal</span></div>{goal?.calories > 0 && <strong className="calorie-goal">/ {Math.round(goal.calories)}<small> kcal</small></strong>}</div>
          {goal?.calories > 0 && <GoalProgress value={total.calories} goal={goal.calories} color="green" />}
          <div className="macro-grid">
            <Macro label="Protein" value={total.proteins} goal={goal?.proteins} color="green" />
            <Macro label="Carbs" value={total.carbs} goal={goal?.carbs} color="yellow" />
            <Macro label="Fat" value={total.fats} goal={goal?.fats} color="coral" />
          </div>
          {useProxy && <ProxyQuota quota={proxyQuota} />}
        </aside>
      </div>
      <button className="add-meal-fab" type="button" onClick={() => setAddMealOpen(true)} aria-label="Add meal">+</button>
      <MealDialog
        draft={addMealOpen ? { text: mealText, time: mealTime } : null}
        title="Add meal"
        submitLabel="Add meal"
        onChange={(patch) => { if ('text' in patch) setMealText(patch.text); if ('time' in patch) setMealTime(patch.time); }}
        onClose={() => setAddMealOpen(false)}
        onSubmit={addMeal}
      />
      <MealDialog draft={editMeal} title="Edit meal" submitLabel="Save" onChange={(patch) => setEditMeal((current) => ({ ...current, ...patch, nutrition: { ...current.nutrition, ...patch.nutrition } }))} onClose={() => setEditMeal(null)} onSubmit={saveMealEdit} />
    </main>
  );
}

// Progress fills slide via transform so value changes animate without layout work.
function fillStyle(percent) {
  return { transform: `translateX(${(Number.isFinite(percent) ? percent : 0) - 100}%)` };
}

function ProxyQuota({ quota }) {
  if (!quota) return null;
  const empty = quota.remaining === 0;
  return (
    <p className={`ai-quota${empty ? ' is-empty' : ''}`}>
      <Sparkles aria-hidden="true" />
      <span>{empty ? `No AI requests left today · resets at ${formatResetTime(quota.resetsAt)}` : `${quota.remaining} of ${quota.limit} AI requests left today`}</span>
    </p>
  );
}

function NutritionItem({ label, value, suffix = '' }) {
  return <span><strong>{value ? Math.round(value) : '—'}</strong> {suffix}<small>{label}</small></span>;
}

function ManualInput({ label, value, onChange }) {
  return <label className="manual-input">{label}<input type="number" min="0" step="any" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Macro({ label, value, goal, color }) {
  return <div className={`macro macro-${color}`}><span className="macro-bar" /><div className="macro-content"><div><strong>{value ? Math.round(value) : '—'}<small>g</small></strong><span>{label}{goal ? ` / ${Math.round(goal)}g` : ''}</span></div>{goal > 0 && <span className="progress-track"><i style={fillStyle(Math.min((value / goal) * 100, 100))} /></span>}</div></div>;
}

function GoalProgress({ value, goal, color }) {
  return <div className={`goal-progress goal-progress-${color}`}><span className="progress-track"><i style={fillStyle(Math.min((value / goal) * 100, 100))} /></span></div>;
}

function Menu({ open, onClose, onNavigate, onLogout, username }) {
  const [visible, closing] = usePresence(open, 200);
  useEscape(open, onClose);
  if (!visible) return null;
  return (
    <div className="menu-layer" data-closing={closing || undefined} role="presentation" onClick={onClose}>
      <aside className="menu-panel" role="dialog" aria-label="Navigation" onClick={(event) => event.stopPropagation()}>
        <div className="menu-header"><strong>Daily Fuel</strong><button type="button" onClick={onClose} aria-label="Close menu"><X /></button></div>
        <p className="menu-user">{username}</p>
        <nav className="menu-links">
          <div className="menu-group">
            <button type="button" onClick={() => onNavigate('home', true)}><span className="menu-link-label"><span className="menu-icon"><Home /></span>Today</span><span aria-hidden="true">&rarr;</span></button>
            <button type="button" onClick={() => onNavigate('goal')}><span className="menu-link-label"><span className="menu-icon"><Target /></span>Goal</span><span aria-hidden="true">&rarr;</span></button>
            <button type="button" onClick={() => onNavigate('reports')}><span className="menu-link-label"><span className="menu-icon"><BarChart3 /></span>Reports</span><span aria-hidden="true">&rarr;</span></button>
          </div>
          <div className="menu-group menu-group-secondary">
            <button type="button" onClick={() => onNavigate('settings')}><span className="menu-link-label"><span className="menu-icon"><Settings /></span>Settings</span><span aria-hidden="true">&rarr;</span></button>
            <button type="button" onClick={() => onNavigate('usage')}><span className="menu-link-label"><span className="menu-icon"><Cpu /></span>Tokens</span><span aria-hidden="true">&rarr;</span></button>
            <button type="button" onClick={() => onNavigate('clear-data')}><span className="menu-link-label"><span className="menu-icon"><Database /></span>Data handling</span><span aria-hidden="true">&rarr;</span></button>
          </div>
        </nav>
      </aside>
    </div>
  );
}

function ReportsView({ report, period, setPeriod, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast }) {
  const [metric, setMetric] = useState('calories');
  const metricInfo = reportMetrics[metric];
  const maxValue = Math.max(...report.days.map((day) => day.nutrition[metric]), 1);
  const chartValue = (day) => day.nutrition[metric];
  const chartPoints = report.days.map((day, index) => `${(index / Math.max(report.days.length - 1, 1)) * 100},${100 - (chartValue(day) / maxValue) * 82 - 9}`).join(' ');
  const chartDotPosition = (day, index) => ({
    left: `${(index / Math.max(report.days.length - 1, 1)) * 100}%`,
    top: `${((100 - (chartValue(day) / maxValue) * 82 - 9) / 100) * 180}px`,
  });
  const labelStep = period === 'month' ? 5 : 1;
  const loggedDays = report.days.filter((day) => day.meals.length).length;
  const average = loggedDays ? Object.fromEntries(Object.keys(emptyNutrition).map((key) => [key, report.total[key] / loggedDays])) : emptyNutrition;
  const averageMax = Math.max(average.proteins, average.carbs, average.fats, 1);

  return (
    <main className="app-shell reports-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home">
          <span className="brand-mark">DF</span>
          <span>Daily Fuel</span>
        </button>
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} />
      <Toast toast={toast} />

      <div className="reports-heading">
        <div><p className="eyebrow">Overview</p><h1>Reports</h1></div>
        <div className="period-toggle" role="group" aria-label="Report period">
          <button className={period === 'week' ? 'active' : ''} type="button" onClick={() => setPeriod('week')}>7 days</button>
          <button className={period === 'month' ? 'active' : ''} type="button" onClick={() => setPeriod('month')}>30 days</button>
        </div>
      </div>

      <section className="report-summary-grid">
        <ReportStat label="Calories" value={Math.round(report.total.calories)} suffix="kcal" />
        <ReportStat label="Protein" value={Math.round(report.total.proteins)} suffix="g" />
        <ReportStat label="Meals" value={report.days.reduce((sum, day) => sum + day.meals.length, 0)} />
      </section>

      <section className="chart-card">
        <div className="card-heading chart-heading"><div><h2>{metricInfo.label}</h2><span>{metricInfo.suffix} / day</span></div><div className="metric-toggle" role="group" aria-label="Chart metric">{Object.entries(reportMetrics).map(([key, item]) => <button className={metric === key ? 'active' : ''} type="button" onClick={() => setMetric(key)} key={key}>{item.label}</button>)}</div></div>
        <div className="line-chart">
          <div className="chart-scale" aria-hidden="true"><span>{chartNumber(maxValue)}</span><span>{chartNumber(maxValue / 2)}</span><span>0</span></div>
          <div className="chart-plot">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${metricInfo.label} per day line chart`}>
              <line x1="0" y1="91" x2="100" y2="91" className="chart-axis" />
              <polyline points={chartPoints} className="chart-line" />
            </svg>
            {report.days.map((day, index) => <span key={day.date} className="chart-dot" style={chartDotPosition(day, index)} />)}
            <div className="chart-labels">{report.days.map((day, index) => index % labelStep === 0 && <span key={day.date}>{shortDate(day.date, period)}</span>)}</div>
          </div>
        </div>
      </section>

      <section className="report-bottom-grid">
        <div className="chart-card macro-card"><div className="card-heading"><h2>Daily average</h2><span>{loggedDays} logged {loggedDays === 1 ? 'day' : 'days'}</span></div><MacroBar label="Protein" value={average.proteins} color="green" max={averageMax} /><MacroBar label="Carbs" value={average.carbs} color="yellow" max={averageMax} /><MacroBar label="Fat" value={average.fats} color="coral" max={averageMax} /></div>
        <div className="chart-card"><div className="card-heading"><h2>Active days</h2><span>{period === 'week' ? 'this week' : 'this month'}</span></div><div className="active-days">{report.days.map((day) => <span className={day.meals.length ? 'has-meal' : ''} title={`${day.date}: ${day.meals.length} meals`} key={day.date} />)}</div></div>
      </section>
    </main>
  );
}

function ReportStat({ label, value, suffix = '' }) {
  return <div className="report-stat"><span>{label}</span><strong>{value.toLocaleString()}<small>{suffix}</small></strong></div>;
}

function MacroBar({ label, value, color, max }) {
  return <div className="macro-bar-row"><div><span>{label}</span><strong>{value ? Math.round(value) : '—'}g</strong></div><span className={`macro-track macro-track-${color}`}><i style={fillStyle(Math.max((value / max) * 100, value ? 4 : 0))} /></span></div>;
}

function GoalView({ goal, setGoal, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, notify }) {
  const [draft, setDraft] = useState(goal || { calories: '', proteins: '', carbs: '', fats: '' });

  useEffect(() => setDraft(goal || { calories: '', proteins: '', carbs: '', fats: '' }), [goal]);

  async function saveGoal(event) {
    event.preventDefault();
    try {
      const saved = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Math.max(0, Number(value) || 0)]));
      setGoal(saved);
      notify('Goal saved.', 'success');
    } catch (error) {
      notify(error.message);
    }
  }

  return (
    <main className="app-shell goal-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button>
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">Daily target</p><h1>Goal</h1></div></div>
      <form className="goal-form" onSubmit={saveGoal}>
        <p className="goal-form-copy">Set targets to see progress on your daily summary.</p>
        <ManualInput label="Calories (kcal)" value={draft.calories} onChange={(value) => setDraft((current) => ({ ...current, calories: value }))} />
        <ManualInput label="Protein (g)" value={draft.proteins} onChange={(value) => setDraft((current) => ({ ...current, proteins: value }))} />
        <ManualInput label="Carbs (g)" value={draft.carbs} onChange={(value) => setDraft((current) => ({ ...current, carbs: value }))} />
        <ManualInput label="Fat (g)" value={draft.fats} onChange={(value) => setDraft((current) => ({ ...current, fats: value }))} />
        <button className="auth-submit goal-save" type="submit">Save goal</button>
      </form>
    </main>
  );
}

function SettingsView({ proxyQuota, settings, setSettings, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, notify }) {
  const [draft, setDraft] = useState(settings);
  const [updating, setUpdating] = useState(false);
  function update(key, value) { setDraft((current) => ({ ...current, [key]: value })); }
  const activeMode = settings.aiMode === 'proxy' ? 'proxy' : 'manual';
  const draftMode = draft.aiMode === 'proxy' ? 'proxy' : 'manual';
  const willReplace = draftMode !== activeMode && isAiConfigured(settings);
  function saveSettings(event) {
    event.preventDefault();
    if (draft.aiMode === 'proxy') {
      if (!draft.proxyUrl || !draft.proxyUsername) return notify('Enter the proxy URL and username.');
      if (!/^https?:\/\//.test(draft.proxyUrl)) return notify('The proxy URL must start with https://');
    } else if (!isAiConfigured(draft)) {
      return notify(`Enter your ${draft.provider === 'openai' ? 'OpenAI' : 'Google'} API key.`);
    }
    const next = exclusiveAiSettings(draft);
    const switched = next.aiMode !== settings.aiMode;
    setSettings(next);
    setDraft(next);
    notify(switched ? `Switched to ${aiModeLabels[next.aiMode]}.` : 'Settings saved.', 'success');
  }
  async function handleUpdate() {
    setUpdating(true);
    try {
      await updateApp();
    } catch (error) {
      setUpdating(false);
      notify(error.message || 'The update failed.', 'error');
    }
  }
  return (
    <main className="app-shell settings-page">
      <header className="topbar"><button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button><button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button></header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">On this device</p><h1>Settings</h1></div></div>
      <form className="settings-form" onSubmit={saveSettings}>
        <div className="settings-section-heading">
          <div>
            <h2>AI config</h2>
            <p className="ai-active">
              <span className={`ai-active-dot${isAiConfigured(settings) ? ' is-on' : ''}`} aria-hidden="true" />
              In use: <strong>{aiModeLabels[activeMode]}</strong>{!isAiConfigured(settings) && ' · not set up'}
            </p>
          </div>
          <div className="period-toggle" role="group" aria-label="AI configuration">
            {Object.entries(aiModeLabels).map(([mode, label]) => <button key={mode} className={draftMode === mode ? 'active' : ''} type="button" onClick={() => update('aiMode', mode)} aria-pressed={draftMode === mode}>{label}</button>)}
          </div>
        </div>
        {willReplace && <p className="settings-warning">Saving switches to {aiModeLabels[draftMode]} and removes your {aiModeLabels[activeMode]} details from this device.</p>}
        {draft.aiMode === 'proxy' ? <>
          <p className="settings-hint">Estimates are sent to your own endpoint, which holds the AI key. Only meal descriptions and times are sent.</p>
          {proxyQuota && <ProxyQuota quota={proxyQuota} />}
          <label>Proxy URL<input type="url" inputMode="url" placeholder="https://…" value={draft.proxyUrl} onChange={(event) => update('proxyUrl', event.target.value.trim())} autoComplete="off" /></label>
          <label>Username<input value={draft.proxyUsername} onChange={(event) => update('proxyUsername', event.target.value)} autoComplete="username" autoCapitalize="none" /></label>
          <label><span>Access key <span className="optional">(optional)</span></span><input type="password" value={draft.proxyKey} onChange={(event) => update('proxyKey', event.target.value)} autoComplete="off" /></label>
        </> : <>
          <label>Provider<select value={draft.provider} onChange={(event) => update('provider', event.target.value)}><option value="google">Google AI</option><option value="openai">OpenAI</option></select></label>
          {draft.provider === 'google' ? <>
            <label>Google API key<input type="password" value={draft.googleKey} onChange={(event) => update('googleKey', event.target.value)} autoComplete="off" /></label>
            <label>Google model<input value={draft.googleModel} onChange={(event) => update('googleModel', event.target.value)} /></label>
          </> : <>
            <label>OpenAI API key<input type="password" value={draft.openaiKey} onChange={(event) => update('openaiKey', event.target.value)} autoComplete="off" /></label>
            <label>OpenAI model<input value={draft.openaiModel} onChange={(event) => update('openaiModel', event.target.value)} /></label>
          </>}
        </>}
        <button className="auth-submit" type="submit">{willReplace ? `Switch to ${aiModeLabels[draftMode]}` : 'Save settings'}</button>
      </form>
      <section className="settings-form settings-update"><p className="goal-form-copy">Get the latest version of the app. Your meals, goals and settings stay on this device.</p><button className="auth-submit" type="button" onClick={handleUpdate} disabled={updating}>{updating ? 'Updating…' : 'Update app'}</button></section>
    </main>
  );
}

function ClearDataView({ mealsByDate, setMealsByDate, goal, setGoal, settings, setSettings, usage, setUsage, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, notify }) {
  const today = dateKey(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  function exportData() {
    const backup = {
      app: 'daily-fuel',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { mealsByDate, goal, settings, usage },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-fuel-backup-${dateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
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
          estimating: false,
          error: '',
        })).filter((meal) => meal.text)];
      }));
      setMealsByDate(importedMeals);
      setGoal(data.goal && typeof data.goal === 'object' ? data.goal : null);
      setSettings(exclusiveAiSettings({ ...defaultSettings, ...(data.settings || {}) }));
      if (data.usage && typeof data.usage === 'object') setUsage(data.usage);
      notify('Backup imported.', 'success');
    } catch (error) {
      notify(error.message || 'Could not import this backup.');
    }
  }

  function clearRange(event) {
    event.preventDefault();
    if (start > end) return notify('Choose a valid date range.');
    const next = Object.fromEntries(Object.entries(mealsByDate).filter(([date]) => date < start || date > end));
    setMealsByDate(next);
    notify('Data cleared.', 'success');
  }
  return <main className="app-shell settings-page"><header className="topbar"><button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button><button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button></header><Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} /><Toast toast={toast} /><div className="reports-heading"><div><p className="eyebrow">On this device</p><h1>Data handling</h1></div></div><section className="settings-form migration-form"><div><h2>Migrations</h2><p>Save your data before updating the app, or restore it from a previous backup.</p></div><div className="migration-actions"><button className="auth-submit" type="button" onClick={exportData}>Export</button><label className="import-button">Import<input type="file" accept="application/json,.json" onChange={importData} /></label></div></section><form className="settings-form clear-form" onSubmit={clearRange}><h2>Clear data</h2><p>Delete meals within a date range.</p><label>From<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>To<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label><button className="clear-data-button" type="submit">Clear range</button></form></main>;
}

function UsageView({ usage, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast }) {

  const daily = usage?.daily || [];
  const maxDaily = Math.max(...daily.map((day) => day.tokens), 1);

  return (
    <main className="app-shell usage-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home">
          <span className="brand-mark">DF</span>
          <span>Daily Fuel</span>
        </button>
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} />
      <Toast toast={toast} />

      <div className="reports-heading"><div><p className="eyebrow">AI requests</p><h1>Token usage</h1></div></div>
      {usage && <>
        <section className="report-summary-grid usage-summary">
          <ReportStat label="Total tokens" value={usage.summary.total_tokens} />
          <ReportStat label="Requests" value={usage.summary.requests} />
          <ReportStat label="Output tokens" value={usage.summary.completion_tokens} />
        </section>
        <section className="chart-card usage-chart-card">
          <div className="card-heading"><h2>Daily usage</h2><span>last 7 days</span></div>
          {daily.length === 0 ? <p className="usage-empty">No estimates yet.</p> : <div className="usage-bars">{daily.slice().reverse().map((day) => <div className="usage-bar-column" key={day.date} title={`${day.date}: ${day.tokens.toLocaleString()} tokens`}><i style={{ height: `${Math.max((day.tokens / maxDaily) * 100, 4)}%` }} /><span>{day.date.slice(5)}</span></div>)}</div>}
        </section>
        <section className="chart-card recent-usage"><div className="card-heading"><h2>Recent requests</h2><span>model / tokens</span></div>{usage.recent.length === 0 ? <p className="usage-empty">No requests yet.</p> : <div className="usage-list">{usage.recent.map((item, index) => <div className="usage-row" key={`${item.created_at}-${index}`}><span>{item.model}</span><strong>{item.total_tokens.toLocaleString()}</strong><small>{formatUsageDate(item.created_at)}</small></div>)}</div>}</section>
      </>}
    </main>
  );
}

function AuthView({ onAuthenticated, onNotify }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { user } = await requestJson(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      await onAuthenticated(user);
    } catch (requestError) {
      setError(requestError.message);
      onNotify(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Toast toast={error ? { message: error, type: 'error' } : null} />
      <section className="auth-card">
        <div className="brand auth-brand"><span className="brand-mark">DF</span><span>Daily Fuel</span></div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="auth-subtitle">Your meals, saved privately.</p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="username">Username</label>
          <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required minLength="3" />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength="8" />
          {error && <small className="form-error">{error}</small>}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="auth-switch" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Create an account' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  );
}

function Toast({ toast }) {
  const [shown, closing] = usePresence(toast, 180);
  if (!shown) return null;
  return (
    <div className={`toast toast-${shown.type}`} data-closing={closing || undefined} role={shown.type === 'error' ? 'alert' : 'status'} key={shown.id}>
      <span>{shown.message}</span>
      {shown.action && <button className="toast-action" type="button" onClick={shown.action.onClick}>{shown.action.label}</button>}
    </div>
  );
}

function MealDialog({ draft, title, submitLabel, onChange, onClose, onSubmit }) {
  const [shown, closing] = usePresence(draft, 150);
  const id = useId();
  useEscape(Boolean(draft), onClose);
  if (!shown) return null;
  function submitOnShortcut(event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form.requestSubmit();
    }
  }
  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading"><h2 id={`${id}-title`}>{title}</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        <form className="add-meal-form" onSubmit={onSubmit}>
          <div className="form-topline"><label>When</label><TimePicker value={shown.time} onChange={(time) => onChange({ time })} /></div>
          <label className="sr-only" htmlFor={`${id}-text`}>What did you eat?</label>
          <textarea id={`${id}-text`} value={shown.text} onChange={(event) => onChange({ text: event.target.value })} onKeyDown={submitOnShortcut} placeholder="What did you eat?" rows="4" autoFocus />
          {shown.nutrition && <fieldset className="meal-dialog-nutrition">
            <legend>Nutrition</legend>
            <ManualInput label="Calories" value={shown.nutrition.calories} onChange={(value) => onChange({ nutrition: { calories: value } })} />
            <ManualInput label="Protein (g)" value={shown.nutrition.proteins} onChange={(value) => onChange({ nutrition: { proteins: value } })} />
            <ManualInput label="Carbs (g)" value={shown.nutrition.carbs} onChange={(value) => onChange({ nutrition: { carbs: value } })} />
            <ManualInput label="Fat (g)" value={shown.nutrition.fats} onChange={(value) => onChange({ nutrition: { fats: value } })} />
          </fieldset>}
          <div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="confirm-add" type="submit" disabled={!shown.text.trim()}>{submitLabel}</button></div>
        </form>
      </section>
    </div>
  );
}

function TimePicker({ value, onChange }) {
  return <div className="time-picker"><Clock aria-hidden="true" /><strong>{value}</strong><input aria-label="Meal time" type="time" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
