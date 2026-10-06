import { StrictMode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, BarChart3, ChevronDown, CircleHelp, Dumbbell, Eye, EyeOff, ShieldCheck, SlidersHorizontal, ChevronLeft, ChevronRight, Clock, Cpu, Database, Eraser, History, Home, Info, LoaderCircle, Medal, Menu as MenuIcon, Plus, RefreshCw, Scale, ScanBarcode, Settings, Share2, Sparkles, Target, Trash2, Undo2, X } from 'lucide-react';
import { toBlob } from 'html-to-image';
import { calculateScore, dayProgress, dayStatus, DAY_COMPLETE_HOUR, macroLabels, metrics, objectiveKey, objectives, scoreLabel, scoringAvailable } from './score.js';
import { BarcodeScanner } from './BarcodeScanner.jsx';
import { dateKey, decimalInput, formatDate, loadLocal, saveLocal, shiftDate, useEscape, usePresence } from './shared.js';
import { WorkoutsView } from './Workouts.jsx';
import { InstallPrompt } from './InstallPrompt.jsx';
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
const blankNutrition = { calories: '', proteins: '', carbs: '', fats: '' };
const mealTextMaxLength = 300;
const defaultSettings = { aiMode: 'manual', proxyUrl: '', proxyUsername: '', proxyKey: '', provider: 'google', googleKey: '', googleModel: 'gemini-3.5-flash-lite', openaiKey: '', openaiModel: 'gpt-4o-mini', mealOrder: 'asc' };
const aiModeLabels = { manual: 'Manual Config', proxy: 'Proxy Config' };

// Only one AI config may hold credentials at a time: keep the active one, reset the other.
function exclusiveAiSettings(settings) {
  if (settings.aiMode === 'proxy') {
    return { ...settings, provider: defaultSettings.provider, googleKey: '', googleModel: defaultSettings.googleModel, openaiKey: '', openaiModel: defaultSettings.openaiModel };
  }
  return { ...settings, aiMode: 'manual', proxyUrl: '', proxyUsername: '', proxyKey: '' };
}

function isAiConfigured(settings) {
  if (settings.aiMode === 'proxy') return Boolean(settings.proxyUrl && settings.proxyUsername && settings.proxyKey);
  return Boolean(settings.provider === 'openai' ? settings.openaiKey : settings.googleKey);
}

const reportMetrics = {
  calories: { label: 'Calories', suffix: 'kcal' },
  proteins: { label: 'Protein', suffix: 'g' },
  carbs: { label: 'Carbs', suffix: 'g' },
  fats: { label: 'Fat', suffix: 'g' },
};

function sortMeals(meals) {
  return [...meals].sort((first, second) => first.time.localeCompare(second.time));
}

function clearEstimating(mealsByDate) {
  return Object.fromEntries(Object.entries(mealsByDate).map(([date, meals]) => [date, Array.isArray(meals) ? meals.map((meal) => (meal?.estimating ? { ...meal, estimating: false } : meal)) : []]));
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

// Optional by-weight entry kept on a meal: grams eaten plus the label values per `base` grams.
function cleanPortion(source) {
  const grams = Number(source?.grams);
  const base = Number(source?.base);
  if (!(grams > 0) || !(base > 0)) return undefined;
  const serving = Number(source.serving);
  return { grams, base, per: cleanNutrition(source.per), ...(serving > 0 && { serving }) };
}

function portionFromPer(values, serving) {
  return cleanPortion({ grams: values.portion, base: values.base, per: values, serving }) ?? null;
}

function perFromPortion(portion) {
  return { base: String(portion.base), portion: String(portion.grams), ...Object.fromEntries(Object.entries(portion.per).map(([key, value]) => [key, String(value)])) };
}

function cleanNutrition(source) {
  return ['calories', 'proteins', 'carbs', 'fats'].reduce((nutrition, key) => {
    const value = Number(source?.[key]);
    nutrition[key] = Number.isFinite(value) ? Math.max(0, Math.round(value * 10) / 10) : 0;
    return nutrition;
  }, {});
}

// Proxy contract (see supabase/functions/estimate): POST { username, meals: [...] } or { username, goalProfile };
// both estimate requests use one quota slot. { username, action: 'quota' } reads the quota without using it.
// The proxy owns the prompt and the provider key, so neither lives on the device.
async function callProxy(settings, payload) {
  let response;
  try {
    response = await fetch(settings.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.proxyKey}` },
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

async function estimateGoalViaProxy(profile, settings) {
  const result = await callProxy(settings, { goalProfile: profile });
  if (!result.targets || goalTargetKeys.some((key) => !(Number(result.targets[key]) > 0))) throw new Error('The proxy returned invalid goal targets.');
  return { targets: cleanNutrition(result.targets), usage: result.usage || {}, model: result.model || 'proxy', quota: result.quota || null };
}

function formatResetTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function requestLocalAI(prompt, settings) {
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
  return { data: JSON.parse(content || '{}'), usage: result.usageMetadata || result.usage || {} };
}

async function estimateLocally(meal, settings) {
  const prompt = `The meal description may be in English or Romanian. Return only a JSON object with numeric keys: calories, proteins, carbs, fats. Estimate the total for the meal.\ncalories, proteins, carbs and fats in this meal:\n${meal}`;
  const result = await requestLocalAI(prompt, settings);
  return { nutrition: cleanNutrition(result.data), usage: result.usage };
}

async function estimateDayLocally(meals, settings) {
  const prompt = `The meal descriptions may be in English or Romanian. Return only a JSON object with a meals array containing one object for each meal, using the exact id provided. Each object must contain id, calories, proteins, carbs, and fats as numeric values. Estimate the total nutrition for each meal.
meals:
${JSON.stringify(meals.map((meal) => ({ id: meal.id, time: meal.time, description: meal.text })))} `;
  const result = await requestLocalAI(prompt, settings);
  const parsed = result.data;
  const estimates = Array.isArray(parsed) ? parsed : parsed.meals;
  if (!Array.isArray(estimates)) throw new Error('The AI returned an invalid day estimate.');
  const nutritionById = Object.fromEntries(estimates.map((estimate) => [String(estimate.id), cleanNutrition(estimate)]));
  if (meals.some((meal) => !nutritionById[meal.id])) throw new Error('The AI did not return nutrition for every meal.');
  return { nutritionById, usage: result.usage };
}

async function estimateGoalLocally(profile, settings) {
  const prompt = `Estimate daily nutrition targets for an adult. Use the person's weight in kilograms when estimating energy needs and protein. Return only a JSON object with numeric keys calories, proteins, carbs and fats. Values must be positive; calories are kcal and macros are grams. Use a sensible, sustainable estimate, not an extreme diet.\nProfile: ${JSON.stringify(profile)}`;
  const result = await requestLocalAI(prompt, settings);
  const targets = cleanNutrition(result.data);
  if (goalTargetKeys.some((key) => !(targets[key] > 0))) throw new Error('The AI returned invalid goal targets.');
  return { targets, usage: result.usage };
}

// Unique previously logged meals, most recent first, for searching and re-adding.
function pastMeals(mealsByDate) {
  const seen = new Map();
  Object.keys(mealsByDate).sort().reverse().forEach((date) => {
    // Old or imported entries may be malformed; skip anything without text rather than crash on startup.
    const dayMeals = Array.isArray(mealsByDate[date]) ? mealsByDate[date].filter((meal) => typeof meal?.text === 'string') : [];
    [...dayMeals].sort((first, second) => String(second.time ?? '').localeCompare(String(first.time ?? ''))).forEach((meal) => {
      const key = meal.text.trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) seen.get(key).count += 1;
      else seen.set(key, { text: meal.text.trim(), nutrition: cleanNutrition(meal.nutrition), portion: cleanPortion(meal.portion), date, time: meal.time, count: 1 });
    });
  });
  return [...seen.values()];
}

function matchMeals(meals, query, limit = 5) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (query.trim().length < 2) return [];
  return meals.filter((meal) => {
    const text = meal.text.toLowerCase();
    return text !== query.trim().toLowerCase() && words.every((word) => text.includes(word));
  }).slice(0, limit);
}

function loggedLabel(date) {
  const today = dateKey(new Date());
  if (date === today) return 'Today';
  if (date === shiftDate(today, -1)) return 'Yesterday';
  return formatDate(date);
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

// Final score for a completed day with logged values, otherwise null.
function scoreForDay(date, mealsByDate, goal, todayKey, now) {
  const meals = mealsByDate[date] || [];
  return meals.length && dayStatus(date, todayKey, now) === 'complete' ? calculateScore(sumNutrition(meals), goalOn(goal, date)).score : null;
}

// Completed days only: the range ends yesterday, or today once it is complete (after DAY_COMPLETE_HOUR).
function reportDays(period, includeToday) {
  const days = [];
  const count = { week: 7, month: 30, quarter: 90 }[period] || 7;
  const today = new Date();
  const last = includeToday ? 0 : 1;
  for (let index = count - 1 + last; index >= last; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    days.push(dateKey(date));
  }
  return days;
}

function shortDate(value, period) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en', period !== 'week'
    ? { month: 'numeric', day: 'numeric' }
    : { weekday: 'short' }).format(date);
}

function niceStep(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= value);
  return step * magnitude;
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
const routePaths = {
  home: '/',
  reports: '/reports',
  scores: '/scores',
  weight: '/weight',
  workouts: '/workouts',
  ai: '/settings/ai',
  usage: '/settings/tokens',
  goal: '/goal',
  settings: '/settings',
  'data-handling': '/settings/data',
  help: '/help',
};

// Tokens and Data handling used to be their own pages.
const legacyPaths = { '/usage': 'usage', '/data-handling': 'data-handling' };

function routeFromPath(pathname) {
  if (legacyPaths[pathname]) return legacyPaths[pathname];
  return Object.keys(routePaths).find((route) => routePaths[route] === pathname) || 'not-found';
}

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

// Re-renders once a minute so time-based UI (day completion) stays current.
function useNow(active) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function App() {
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [mealsByDate, setMealsByDate] = useState(() => clearEstimating(loadLocal('daily-fuel-meals', {})));
  const [mealText, setMealText] = useState('');
  const [mealTime, setMealTime] = useState(currentHour);
  const [mealNutrition, setMealNutrition] = useState(blankNutrition);
  const [mealPortion, setMealPortion] = useState(null);
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
  const pendingCount = meals.filter((meal) => !hasNutrition(meal)).length;
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
    if (!mealText.trim()) setMealTime(currentHour());
    setAddMealOpen(true);
  }

  function insertMeal(text, nutrition, portion) {
    const newMeal = { id: crypto.randomUUID(), time: mealTime, text: text.trim(), nutrition: cleanNutrition(nutrition), portion: cleanPortion(portion), estimating: false, error: '' };
    setMealsByDate((current) => ({ ...current, [selectedDate]: sortMeals([...(current[selectedDate] || []), newMeal]) }));
    setNewMealId(newMeal.id);
    setMealText('');
    setMealTime(currentHour());
    setMealNutrition(blankNutrition);
    setMealPortion(null);
    setAddMealOpen(false);
    return newMeal;
  }

  function addMeal(event) {
    event.preventDefault();
    if (!mealText.trim()) return;
    insertMeal(mealText, mealNutrition, mealPortion);
  }

  // One-tap re-add from search; offers undo since it skips the form.
  function addPastMeal(meal) {
    const date = selectedDate;
    const { id } = insertMeal(meal.text, meal.nutrition, meal.portion);
    notify('Meal added.', 'info', { label: 'Undo', onClick: () => setMealsByDate((current) => ({ ...current, [date]: (current[date] || []).filter((item) => item.id !== id) })) });
  }

  async function estimateMeal(meal) {
    if (!aiConfigured) return promptForKey();
    if (quotaExhausted()) return;
    const { id } = meal;
    updateMeal(id, { estimating: true, error: '' });
    try {
      if (useProxy) {
        const result = await estimateViaProxy([meal], settings);
        updateMeal(id, { nutrition: result.nutritionById[id], portion: undefined, estimating: false });
        trackUsage(result.usage, result.model);
        if (result.quota) setProxyQuota(result.quota);
      } else {
        const result = await estimateLocally(meal.text, settings);
        updateMeal(id, { nutrition: result.nutrition, portion: undefined, estimating: false });
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
    setEditMeal({ id: meal.id, text: meal.text, time: meal.time, nutrition: { ...meal.nutrition }, portion: meal.portion ?? null });
  }

  function saveMealEdit(event) {
    event.preventDefault();
    const text = editMeal?.text.trim();
    if (!text) return;
    const original = meals.find((meal) => meal.id === editMeal.id);
    const { id, time } = editMeal;
    const nutrition = cleanNutrition(editMeal.nutrition);
    const portion = cleanPortion(editMeal.portion);
    setMealsByDate((current) => ({ ...current, [selectedDate]: sortMeals((current[selectedDate] || []).map((meal) => (meal.id === id ? { ...meal, text, time, nutrition, portion } : meal))) }));
    setEditMeal(null);
    const nutritionUntouched = original && Object.keys(emptyNutrition).every((key) => cleanNutrition(original.nutrition)[key] === nutrition[key]);
    if (original && original.text !== text && nutritionUntouched && Object.values(nutrition).some(Boolean)) {
      notify('Meal updated. Nutrition may be out of date.', 'info', { label: 'Re-estimate', onClick: () => estimateMeal({ ...original, text, time }) });
    }
  }

  // Saves the edited text/time, then replaces the nutrition with a fresh AI estimate.
  function reestimateEdit() {
    const text = editMeal?.text.trim();
    const original = meals.find((meal) => meal.id === editMeal?.id);
    if (!text || !original) return;
    const { id, time } = editMeal;
    setMealsByDate((current) => ({ ...current, [selectedDate]: sortMeals((current[selectedDate] || []).map((meal) => (meal.id === id ? { ...meal, text, time } : meal))) }));
    setEditMeal(null);
    estimateMeal({ ...original, text, time });
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
                  <button className="meal-text" type="button" onClick={() => openEditMeal(meal)} title="Edit meal">{meal.text}</button>
                </div>
                <div className="meal-actions">
                  <button className={`estimate-button${hasNutrition(meal) ? ' is-reestimate' : ''}`} type="button" onClick={() => estimateMeal(meal)} disabled={meal.estimating} title={hasNutrition(meal) ? 'Re-estimate with AI (replaces current values)' : 'Estimate with AI'}>
                    {meal.estimating ? <LoaderCircle className="ai-loading" aria-hidden="true" /> : hasNutrition(meal) ? <RefreshCw className="ai-icon" aria-hidden="true" /> : <Sparkles className="ai-icon" aria-hidden="true" />}
                    <span className="sr-only">{meal.estimating ? 'Estimating' : hasNutrition(meal) ? 'Re-estimate nutrition with AI' : 'Estimate nutrition with AI'}</span>
                  </button>
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
            <Macro label="Protein" value={total.proteins} goal={dayGoal?.proteins} color="green" />
            <Macro label="Carbs" value={total.carbs} goal={dayGoal?.carbs} color="yellow" />
            <Macro label="Fat" value={total.fats} goal={dayGoal?.fats} color="coral" />
          </div>
        </aside>
      </div>
      <button className="add-meal-fab" type="button" onClick={openAddMeal} aria-label="Add meal">+</button>
      <MealDialog
        draft={addMealOpen ? { text: mealText, time: mealTime, nutrition: mealNutrition, portion: mealPortion } : null}
        collapsibleNutrition
        suggestions={previousMeals}
        clearable
        scannable
        onQuickAdd={addPastMeal}
        title={selectedDate === dateKey(new Date()) ? 'Add meal' : `Add meal · ${loggedLabel(selectedDate)}`}
        submitLabel="Add meal"
        onChange={(patch) => { if ('text' in patch) setMealText(patch.text); if ('time' in patch) setMealTime(patch.time); if (patch.nutrition) setMealNutrition((current) => ({ ...current, ...patch.nutrition })); if ('portion' in patch) setMealPortion(patch.portion); }}
        onClose={() => setAddMealOpen(false)}
        onSubmit={addMeal}
      />
      <ScoreDialog open={scoring && scoreOpen} total={total} goal={dayGoal} meals={meals} pendingCount={pendingCount} status={dayStatus(selectedDate, dateKey(now), now)} now={now} onClose={() => setScoreOpen(false)} />
      <MealDialog draft={editMeal} title="Edit meal" submitLabel="Save" onChange={(patch) => setEditMeal((current) => ({ ...current, ...patch, nutrition: { ...current.nutrition, ...patch.nutrition } }))} onClose={() => setEditMeal(null)} onSubmit={saveMealEdit} onReestimate={reestimateEdit} />
    </main>
  );
}

// Progress fills slide via transform so value changes animate without layout work.
function fillStyle(percent) {
  return { transform: `translateX(${(Number.isFinite(percent) ? percent : 0) - 100}%)` };
}

function HeaderQuota({ quota }) {
  if (!quota) return null;
  const empty = quota.remaining === 0;
  const description = `${quota.remaining} of ${quota.limit} AI requests left today. Resets at ${formatResetTime(quota.resetsAt)}.`;
  return (
    <div className={`header-ai-quota${empty ? ' is-empty' : ''}`} role="status" aria-label={description} title={description}>
      <Sparkles aria-hidden="true" />
      <strong>{quota.remaining}</strong><span className="header-quota-label">left</span>
    </div>
  );
}
function MealNutrition({ nutrition }) {
  if (!hasNutrition({ nutrition })) return <div className="meal-nutrition is-empty">Not estimated</div>;
  const grams = (value) => Math.round(Number(value) || 0);
  return (
    <div className="meal-nutrition">
      <span className="meal-stat is-kcal"><strong>{grams(nutrition.calories)}</strong><small>kcal</small></span>
      <span className="meal-stat macro-green"><strong>{grams(nutrition.proteins)}g</strong><small>protein</small></span>
      <span className="meal-stat macro-yellow"><strong>{grams(nutrition.carbs)}g</strong><small>carbs</small></span>
      <span className="meal-stat macro-coral"><strong>{grams(nutrition.fats)}g</strong><small>fat</small></span>
    </div>
  );
}

function ManualInput({ label, value, onChange }) {
  return <label className="manual-input">{label}<input type="text" inputMode="decimal" value={value} onChange={(event) => onChange(decimalInput(event.target.value))} /></label>;
}

function Macro({ label, value, goal, color }) {
  return <div className={`macro macro-${color}`}><span className="macro-bar" /><div className="macro-content"><div><strong>{value ? Math.round(value) : '—'}<small>g</small></strong><span>{label}{goal ? ` / ${Math.round(goal)}g` : ''}</span></div>{goal > 0 && <span className="progress-track"><i style={fillStyle(Math.min((value / goal) * 100, 100))} /></span>}</div></div>;
}

// Small score badge next to the AI button; the score stays hidden until the day is complete.
function DayScore({ total, goal, meals, status, onOpen }) {
  if (status === 'future') return null;
  const score = status === 'complete' && meals.length ? calculateScore(total, goal).score : null;
  const caption = score !== null ? `${score}/100 · ${scoreLabel(score)}` : status === 'in-progress' ? `Score ready at ${DAY_COMPLETE_HOUR}:00` : meals.length ? 'No values yet' : 'No meals logged';
  return (
    <button className={`day-score${score !== null ? ` day-score-${scoreTone(score)}` : ''}`} type="button" onClick={onOpen} aria-label={`Daily score: ${caption}. Show details`} title={caption}>
      {score !== null ? score : status === 'in-progress' ? <Clock aria-hidden="true" /> : '—'}
    </button>
  );
}

function scoreTone(score) {
  return score >= 90 ? 'great' : score >= 70 ? 'good' : score >= 60 ? 'fair' : 'low';
}

function ScoreDialog({ open, total, goal, meals, pendingCount, status, now, onClose }) {
  const [shown, closing] = usePresence(open ? { total, goal, meals, pendingCount, status, now } : null, 150);
  const id = useId();
  useEscape(open, onClose);
  if (!shown) return null;
  const objective = objectives[objectiveKey(shown.goal.objective)];
  const result = shown.meals.length && shown.status === 'complete' ? calculateScore(shown.total, shown.goal) : null;
  const scored = result?.score != null;
  const final = scored;
  const hasValues = shown.meals.length > shown.pendingCount;
  const progress = shown.status === 'in-progress' ? dayProgress(shown.total, shown.goal, shown.now) : null;
  const weighted = result ? result.metrics.filter((metric) => metric.scored) : [];
  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog score-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading"><h2 id={`${id}-title`}>Daily Score</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        {scored ? (
          <>
            <div className={`score-hero${final ? ` day-score-${scoreTone(result.score)}` : ''}`}><strong>{result.score}<small> / 100</small></strong><span>{final ? result.label : 'So far'}</span></div>
            {final
              ? <p className="score-summary">{result.summary}</p>
              : <p className="score-summary">Based on today's logged food so far. The final score is set once the day is complete (after {DAY_COMPLETE_HOUR}:00).</p>}
            <table className="score-table">
              <thead><tr><th>Target</th><th>Eaten / target</th><th>Score</th><th>Weight</th><th>Points</th></tr></thead>
              <tbody>
                {weighted.map((metric) => (
                  <tr key={metric.key}>
                    <th scope="row">{metric.label}</th>
                    <td>{Math.round(metric.value)} / {Math.round(metric.target)}{metric.unit === 'kcal' ? '' : 'g'}</td>
                    <td>{Math.round(metric.score)}</td>
                    <td>× {Math.round(metric.weight * 100)}%</td>
                    <td>{metric.points.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row" colSpan="4">Total</th><td>{result.score}</td></tr></tfoot>
            </table>
          </>
        ) : progress ? (
          <>
            <div className="score-hero"><strong>—<small> / 100</small></strong><span>Day in progress</span></div>
            <p className="score-summary">Your score appears once the day is complete (after {DAY_COMPLETE_HOUR}:00).</p>
          </>
        ) : (
          <p className="score-summary">{shown.meals.length ? 'Add or estimate values for your meals to get a score.' : 'Log meals for this day to get a score.'}</p>
        )}
        {progress && hasValues && (
          <div className="day-progress">
            <div><span>Day progress</span><strong>{progress.status}</strong></div>
            <p>{progress.message}</p>
            {Object.entries(macroLabels).filter(([key]) => progress.pace[key] !== null).map(([key, label]) => (
              <div className="day-progress-row" key={key}>
                <span>{label}</span>
                <span className="progress-track"><i style={fillStyle(Math.min(progress.pace[key] * 100, 100))} /><b style={{ left: `${progress.expected * 100}%` }} /></span>
                <span>{Math.round(shown.total[key] || 0)} / {Math.round(shown.goal[key])}g</span>
              </div>
            ))}
            <small>Marker shows about {Math.round(progress.expected * 100)}% — where you'd typically be by now.</small>
          </div>
        )}
        {scored && shown.pendingCount > 0 && <p className="score-note">{shown.pendingCount} {shown.pendingCount === 1 ? 'meal has' : 'meals have'} no values yet and {shown.pendingCount === 1 ? 'is' : 'are'} not counted.</p>}
        <details className="score-method">
          <summary>How it's calculated</summary>
          <p>Each target you've set gets a 0–100 score for how closely you followed it, weighted for your objective (<strong>{objective.label}</strong>: {metrics.map((metric) => `${metric.label.toLowerCase()} ${Math.round(objective.weights[metric.key] * 100)}%`).join(', ')}).</p>
          <ul>
            <li><strong>Calories</strong>: {objective.calorieNote}</li>
            <li><strong>Protein</strong> eases down the further you fall below your target (90% → ~90, 75% → ~65); going a little over isn't penalised.</li>
            <li><strong>Carbs</strong> and <strong>fat</strong> have some room either side of your target before the score drops.</li>
          </ul>
          <p>When one macro explains most of a calorie difference, part of its penalty is forgiven so the same food isn't counted twice. Targets you haven't set aren't scored, and their weight goes to the others.</p>
        </details>
      </section>
    </div>
  );
}

function GoalProgress({ value, goal, color }) {
  return <div className={`goal-progress goal-progress-${color}`}><span className="progress-track"><i style={fillStyle(Math.min((value / goal) * 100, 100))} /></span></div>;
}

function Menu({ open, onClose, onNavigate, onLogout, username, goal }) {
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
            <button type="button" onClick={() => onNavigate('reports')}><span className="menu-link-label"><span className="menu-icon"><BarChart3 /></span>Reports</span><span aria-hidden="true">&rarr;</span></button>
            <button type="button" onClick={() => onNavigate('goal')}><span className="menu-link-label"><span className="menu-icon"><Target /></span>Goal</span><span aria-hidden="true">&rarr;</span></button>
          </div>
          {(scoringAvailable(goal) || goal?.weightTracking || goal?.workouts) && (
            <div className="menu-group menu-group-secondary">
              {scoringAvailable(goal) && <button type="button" onClick={() => onNavigate('scores')}><span className="menu-link-label"><span className="menu-icon"><Medal /></span>Scores</span><span aria-hidden="true">&rarr;</span></button>}
              {goal?.weightTracking && <button type="button" onClick={() => onNavigate('weight')}><span className="menu-link-label"><span className="menu-icon"><Scale /></span>Weight</span><span aria-hidden="true">&rarr;</span></button>}
              {goal?.workouts && <button type="button" onClick={() => onNavigate('workouts')}><span className="menu-link-label"><span className="menu-icon"><Dumbbell /></span>Workouts</span><span aria-hidden="true">&rarr;</span></button>}
            </div>
          )}
          <div className="menu-group menu-group-secondary">
            <button type="button" onClick={() => onNavigate('settings')}><span className="menu-link-label"><span className="menu-icon"><Settings /></span>Settings</span><span aria-hidden="true">&rarr;</span></button>
            <button type="button" onClick={() => onNavigate('help')}><span className="menu-link-label"><span className="menu-icon"><CircleHelp /></span>How to use</span><span aria-hidden="true">&rarr;</span></button>
          </div>
        </nav>
      </aside>
    </div>
  );
}

function ReportsView({ goal, quota, mealsByDate, onOpenDay, report, period, setPeriod, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast }) {
  const [metric, setMetric] = useState('calories');
  const metricInfo = reportMetrics[metric];
  const goalValue = goal?.[metric] || 0;
  const chartPeak = Math.max(...report.days.map((day) => day.nutrition[metric]), goalValue, 1);
  const chartStep = niceStep(chartPeak / 4);
  const tickCount = Math.max(Math.ceil(chartPeak / chartStep), 1);
  const maxValue = chartStep * tickCount;
  const chartTicks = Array.from({ length: tickCount + 1 }, (_, index) => (tickCount - index) * chartStep);
  const percentOf = (value) => `${(value / maxValue) * 100}%`;
  const labelStep = { month: 5, quarter: 15 }[period] || 1;
  const loggedDays = report.days.filter((day) => day.meals.length).length;
  const average = loggedDays ? Object.fromEntries(Object.keys(emptyNutrition).map((key) => [key, report.total[key] / loggedDays])) : emptyNutrition;
  const averageMax = Math.max(average.proteins, average.carbs, average.fats, 1);
  const mealCount = report.days.reduce((sum, day) => sum + day.meals.length, 0);
  const calorieGoal = goal?.calories || 0;
  const onTargetDays = report.days.filter((day) => day.meals.length && goalTone(day.nutrition.calories, goalOn(goal, day.date)?.calories) === 'on').length;
  const stats = [
    { label: 'Days logged', value: loggedDays, suffix: `/ ${report.days.length}` },
    calorieGoal > 0 && { label: 'On target', value: onTargetDays, suffix: `/ ${loggedDays}` },
    { label: 'Meals per day', value: loggedDays ? Math.round((mealCount / loggedDays) * 10) / 10 : 0 },
  ].filter(Boolean);

  return (
    <main className="app-shell reports-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home">
          <span className="brand-mark">DF</span>
          <span>Daily Fuel</span>
        </button>
        <HeaderQuota quota={quota} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />

      <div className="reports-heading">
        <div><p className="eyebrow">Overview · {new Date().getHours() >= DAY_COMPLETE_HOUR ? 'up to today' : `up to yesterday · today will be added at ${DAY_COMPLETE_HOUR}:00`}</p><h1>Reports</h1></div>
        <div className="period-toggle" role="group" aria-label="Report period">
          <button className={period === 'week' ? 'active' : ''} type="button" onClick={() => setPeriod('week')}>7 days</button>
          <button className={period === 'month' ? 'active' : ''} type="button" onClick={() => setPeriod('month')}>30 days</button>
          <button className={period === 'quarter' ? 'active' : ''} type="button" onClick={() => setPeriod('quarter')}>3 months</button>
        </div>
      </div>

      <section className="report-summary-grid" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((stat) => <ReportStat key={stat.label} {...stat} />)}
      </section>

      <section className="chart-card macro-card"><div className="card-heading"><h2>Daily average</h2><span>per logged day</span></div><AverageCalories value={average.calories} goal={goal?.calories} /><MacroBar label="Protein" value={average.proteins} goal={goal?.proteins} color="green" max={averageMax} /><MacroBar label="Carbs" value={average.carbs} goal={goal?.carbs} color="yellow" max={averageMax} /><MacroBar label="Fat" value={average.fats} goal={goal?.fats} color="coral" max={averageMax} /></section>

      <section className="chart-card report-chart-card">
        <div className="card-heading chart-heading"><h2>{metricInfo.label} per day</h2><div className="metric-toggle" role="group" aria-label="Chart metric">{Object.entries(reportMetrics).map(([key, item]) => <button className={metric === key ? 'active' : ''} type="button" onClick={() => setMetric(key)} key={key}>{item.label}</button>)}</div></div>
        {goalValue > 0 && <div className="bar-legend" aria-hidden="true"><span><i className="tone-under" />Under</span><span><i className="tone-on" />{metric === 'proteins' ? 'Goal reached' : 'On target'}</span>{metric !== 'proteins' && <span><i className="tone-over" />Over</span>}<span><b />Goal {chartNumber(goalValue)} {metricInfo.suffix}</span></div>}
        <div className="bar-chart" data-period={period}>
          <div className="bar-scale" aria-hidden="true">{chartTicks.map((tick) => <span key={tick} style={{ bottom: percentOf(tick) }}>{chartNumber(tick)}</span>)}</div>
          <div className="bar-plot">
            {chartTicks.map((tick) => <i key={tick} className="bar-grid" style={{ bottom: percentOf(tick) }} />)}
            {goalValue > 0 && <i className="bar-goal" style={{ bottom: percentOf(goalValue) }} />}
            {report.days.map((day) => {
              const value = day.nutrition[metric];
              const logged = day.meals.length > 0;
              const label = `${formatDate(day.date)}: ${logged ? `${Math.round(value).toLocaleString()} ${metricInfo.suffix}` : 'nothing logged'}`;
              return (
                <button key={day.date} className="bar-column" type="button" onClick={() => onOpenDay(day.date)} aria-label={`${label}. Open day`} title={label}>
                  {logged ? <i className={`tone-${goalTone(value, goalOn(goal, day.date)?.[metric], metric)}`} style={{ height: percentOf(value) }} /> : <i className="bar-empty" />}
                  {period === 'week' && logged && <small style={{ bottom: percentOf(value) }}>{compactNumber(value)}</small>}
                </button>
              );
            })}
          </div>
          <div className="bar-labels" aria-hidden="true">{report.days.map((day, index) => <span key={day.date} data-muted={!day.meals.length || undefined}>{index % labelStep === 0 ? shortDate(day.date, period) : ''}</span>)}</div>
        </div>
        <p className="bar-hint">Tap a day to open it.</p>
      </section>

      <MealTimeHeatmap days={report.days} />
    </main>
  );
}

const heatmapWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Meal counts per weekday × hour; the hour range covers 06–23 and stretches to any earlier or later meal.
function MealTimeHeatmap({ days }) {
  const grid = heatmapWeekdays.map(() => Array(24).fill(0));
  const byHour = Array(24).fill(0);
  for (const day of days) {
    const weekday = (new Date(`${day.date}T12:00:00`).getDay() + 6) % 7;
    for (const meal of day.meals) {
      const hour = Number.parseInt(meal.time, 10);
      if (!(hour >= 0 && hour < 24)) continue;
      grid[weekday][hour] += 1;
      byHour[hour] += 1;
    }
  }
  const logged = byHour.map((count, hour) => (count ? hour : null)).filter((hour) => hour !== null);
  if (!logged.length) return null;
  const firstHour = Math.min(6, ...logged);
  const lastHour = Math.max(23, ...logged);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const peak = Math.max(...grid.flat());
  const busiest = byHour.indexOf(Math.max(...byHour));
  const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

  return (
    <section className="chart-card report-chart-card">
      <div className="card-heading"><h2>Logged meal times</h2><span>most logged around {hourLabel(busiest)}</span></div>
      <div className="heatmap" style={{ '--hours': hours.length }}>
        {grid.map((row, weekday) => (
          <div className="heatmap-row" key={heatmapWeekdays[weekday]}>
            <span>{heatmapWeekdays[weekday]}</span>
            {hours.map((hour) => {
              const count = row[hour];
              return <i key={hour} title={`${heatmapWeekdays[weekday]} ${hourLabel(hour)}: ${count} ${count === 1 ? 'meal' : 'meals'}`} style={count ? { opacity: 0.25 + (count / peak) * 0.75 } : undefined} data-empty={!count || undefined} />;
            })}
          </div>
        ))}
        <div className="heatmap-row heatmap-hours" aria-hidden="true">
          <span />
          {hours.map((hour) => <small key={hour}>{hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</small>)}
        </div>
      </div>
      <p className="bar-hint">Darker cells mean more meals logged at that hour.</p>
      <MealTimeInsights days={days} />
    </section>
  );
}

function mealMinutes(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return Number.isFinite(hours) ? hours * 60 + (minutes || 0) : null;
}

function clockLabel(minutes) {
  const rounded = Math.round(minutes / 15) * 15;
  return `${String(Math.floor(rounded / 60) % 24).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function durationLabel(minutes) {
  const hours = Math.round(minutes / 30) / 2;
  return `${hours}h`;
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

// Plain-language takeaways from meal times; each one needs at least 3 logged days to be shown.
function MealTimeInsights({ days }) {
  const [collapsed, setCollapsed] = useState(() => loadLocal('daily-fuel-insights-collapsed', false));
  const logged = days
    .map((day) => ({ date: day.date, times: day.meals.map((meal) => mealMinutes(meal.time)).filter((value) => value !== null).sort((a, b) => a - b) }))
    .filter((day) => day.times.length);
  if (logged.length < 3) return null;

  const firsts = logged.map((day) => day.times[0]);
  const lasts = logged.map((day) => day.times.at(-1));
  const insights = [];

  const window = mean(lasts) - mean(firsts);
  insights.push(`Logged meals usually fall between ${clockLabel(mean(firsts))} and ${clockLabel(mean(lasts))}, a ${durationLabel(window)} window.`);

  const fasts = [];
  for (let index = 1; index < logged.length; index += 1) {
    const previous = new Date(`${logged[index - 1].date}T12:00:00`);
    previous.setDate(previous.getDate() + 1);
    if (dateKey(previous) === logged[index].date) fasts.push(24 * 60 - logged[index - 1].times.at(-1) + logged[index].times[0]);
  }
  if (fasts.length >= 2) insights.push(`About ${durationLabel(mean(fasts))} usually pass between the last logged meal and the next day's first.`);

  const spread = Math.sqrt(mean(firsts.map((value) => (value - mean(firsts)) ** 2)));
  insights.push(spread <= 45 ? 'The first logged meal is at a similar time each day, within about 45 min.' : `The first logged meal varies by about ±${durationLabel(spread)} from day to day.`);

  const allTimes = logged.flatMap((day) => day.times);
  const late = allTimes.filter((value) => value >= 21 * 60).length / allTimes.length;
  if (late >= 0.15) insights.push(`${Math.round(late * 100)}% of logged meals are at 21:00 or later.`);

  const isWeekend = (date) => [0, 6].includes(new Date(`${date}T12:00:00`).getDay());
  const weekendFirsts = logged.filter((day) => isWeekend(day.date)).map((day) => day.times[0]);
  const weekdayFirsts = logged.filter((day) => !isWeekend(day.date)).map((day) => day.times[0]);
  if (weekendFirsts.length && weekdayFirsts.length) {
    const shift = mean(weekendFirsts) - mean(weekdayFirsts);
    if (Math.abs(shift) >= 45) insights.push(`On weekends the first logged meal is ${durationLabel(Math.abs(shift))} ${shift > 0 ? 'later' : 'earlier'} than on weekdays.`);
  }

  function toggle() {
    setCollapsed((current) => {
      saveLocal('daily-fuel-insights-collapsed', !current);
      return !current;
    });
  }

  return (
    <div className="heatmap-insights">
      <button className="insights-toggle" type="button" onClick={toggle} aria-expanded={!collapsed}>
        From your log<ChevronDown aria-hidden="true" data-collapsed={collapsed || undefined} />
      </button>
      {!collapsed && <ul>{insights.map((text) => <li key={text}>{text}</li>)}</ul>}
    </div>
  );
}

function compactNumber(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

// Within 10% of the goal counts as on target; extra protein is never "over", matching the scoring.
function goalTone(value, goal, metric) {
  if (!(goal > 0)) return 'none';
  if (value < goal * 0.9) return 'under';
  if (value > goal * 1.1 && metric !== 'proteins') return 'over';
  return 'on';
}

function ScoresView({ goal, quota, mealsByDate, onOpenDay, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, notify }) {
  return (
    <main className="app-shell reports-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home">
          <span className="brand-mark">DF</span>
          <span>Daily Fuel</span>
        </button>
        <HeaderQuota quota={quota} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">Daily score history</p><h1>Scores</h1></div></div>
      <ScoreCalendar goal={goal} mealsByDate={mealsByDate} onOpenDay={onOpenDay} notify={notify} />
    </main>
  );
}

// Month grid (Monday first) with each completed day's score; tapping a day opens it.
function ScoreCalendar({ goal, mealsByDate, onOpenDay, notify }) {
  const posterRef = useRef(null);
  const now = useNow(true);
  const todayKey = dateKey(now);
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [sharing, setSharing] = useState(false);
  const isCurrentMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = (month.getDay() + 6) % 7;
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const date = dateKey(new Date(month.getFullYear(), month.getMonth(), index + 1));
    return { date, day: index + 1, score: scoreForDay(date, mealsByDate, goal, todayKey, now), isToday: date === todayKey, inProgress: dayStatus(date, todayKey, now) === 'in-progress' };
  });
  const scores = days.filter((day) => day.score !== null).map((day) => day.score);
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  const shiftMonth = (amount) => setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1));

  async function shareCalendar() {
    if (!posterRef.current || sharing) return;
    setSharing(true);
    try {
      const blob = await toBlob(posterRef.current, { width: 1080, height: 1920, pixelRatio: 1 });
      if (!blob) throw new Error('Could not create the calendar image.');
      const filename = `daily-fuel-scores-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}.png`;
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        notify('Calendar image downloaded.', 'success');
      }
    } catch (error) {
      if (error.name !== 'AbortError') notify(error.message || 'Could not share the calendar image.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="chart-card score-calendar">
      <div className="share-poster-stage" aria-hidden="true"><SharePoster ref={posterRef} month={month} days={days} leading={leading} scores={scores} average={average} /></div>
      <div className="card-heading scores-card-heading">
        <div><h2>Daily score</h2><span>{average === null ? 'No scored days' : `avg ${average} · ${scores.length} ${scores.length === 1 ? 'day' : 'days'}`}</span></div>
        <button className="calendar-share-button" type="button" onClick={shareCalendar} disabled={sharing} aria-label="Share scores calendar">
          {sharing ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Share2 aria-hidden="true" />}
          {sharing ? 'Creating…' : 'Share'}
        </button>
      </div>
      <div className="calendar-nav">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft /></button>
        <strong>{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(month)}</strong>
        <button type="button" onClick={() => shiftMonth(1)} disabled={isCurrentMonth} aria-label="Next month"><ChevronRight /></button>
      </div>
      <div className="calendar-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span className="calendar-weekday" key={index}>{label}</span>)}
        {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}
        {days.map((day) => (
          <button className={`calendar-day${day.score !== null ? ` day-score-${scoreTone(day.score)}` : ''}${day.isToday ? ' is-today' : ''}${day.inProgress ? ' is-in-progress' : ''}`} type="button" disabled={day.date > todayKey} onClick={() => onOpenDay(day.date)} title={day.inProgress ? `Today's score is available after ${DAY_COMPLETE_HOUR}:00` : day.score !== null ? `${day.date}: ${day.score}/100 · ${scoreLabel(day.score)}` : day.date} aria-label={day.inProgress ? `${day.date}: score available after ${DAY_COMPLETE_HOUR}:00` : undefined} key={day.date}>
            <small className="calendar-day-date">{day.day}</small>
            <strong>{day.inProgress ? <Clock className="calendar-pending-icon" aria-hidden="true" /> : day.score ?? ''}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

// Literal colors for the poster's SVG ring, which the image export can't style through CSS.
const toneColors = { great: '#34704d', good: '#4f8a3c', fair: '#b58a1d', low: '#c66b59', none: '#747b76' };

// Story-sized (1080×1920) image of a month's scores, rendered off-screen and captured by the share button.
function SharePoster({ ref, month, days, leading, scores, average }) {
  const tone = average === null ? 'none' : scoreTone(average);
  const ring = 2 * Math.PI * 250;
  const best = scores.length ? Math.max(...scores) : null;
  const greatDays = scores.filter((score) => score >= 90).length;
  let streak = 0;
  let run = 0;
  days.forEach((day) => { run = day.score !== null && day.score >= 75 ? run + 1 : 0; streak = Math.max(streak, run); });
  return (
    <div className={`share-poster day-score-${tone}`} ref={ref}>
      <header className="poster-brand"><span className="brand-mark">DF</span><span>Daily Fuel</span></header>
      <div className="poster-title"><p>Daily score</p><h2>{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(month)}</h2></div>
      <div className="poster-hero">
        <svg viewBox="0 0 560 560" aria-hidden="true">
          <circle cx="280" cy="280" r="250" fill="none" stroke={toneColors[tone]} strokeOpacity="0.16" strokeWidth="34" />
          <circle cx="280" cy="280" r="250" fill="none" stroke={toneColors[tone]} strokeWidth="34" strokeLinecap="round" strokeDasharray={`${ring * (average ?? 0) / 100} ${ring}`} transform="rotate(-90 280 280)" />
        </svg>
        <div className="poster-average">
          <small>Monthly average</small>
          <strong>{average ?? '–'}</strong>
          <span>{average === null ? 'No scored days' : scoreLabel(average)}</span>
        </div>
      </div>
      <div className="poster-stats">
        <div><strong>{scores.length}</strong><span>{scores.length === 1 ? 'day scored' : 'days scored'}</span></div>
        <div><strong>{best ?? '–'}</strong><span>best day</span></div>
        <div><strong>{greatDays}</strong><span>{greatDays === 1 ? 'great day' : 'great days'}</span></div>
        <div><strong>{streak}</strong><span>best streak 75+</span></div>
      </div>
      <div className="poster-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span className="poster-weekday" key={index}>{label}</span>)}
        {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}
        {days.map((day) => (
          <div className={`poster-day${day.score !== null ? ` day-score-${scoreTone(day.score)}` : ''}`} key={day.date}>
            <small>{day.day}</small>
            <strong>{day.score ?? ''}</strong>
          </div>
        ))}
      </div>
      <footer className="poster-legend">
        <span className="day-score-great">90+ great</span>
        <span className="day-score-good">75+ good</span>
        <span className="day-score-fair">60+ fair</span>
        <span className="day-score-low">below 60</span>
      </footer>
    </div>
  );
}

function formatWeight(value) {
  return (Math.round(value * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatWeightChange(value) {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? '±0.0' : `${rounded > 0 ? '+' : '−'}${formatWeight(Math.abs(rounded))}`;
}

// A weigh-in covers the days from the previous weigh-in up to the day before it; only completed, logged days count.
function WeightView({ goal, quota, mealsByDate, weights, setWeights, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, notify }) {
  const now = new Date();
  const todayKey = dateKey(now);
  const [date, setDate] = useState(todayKey);
  const [weight, setWeight] = useState('');
  const entries = [...weights].sort((first, second) => first.date.localeCompare(second.date));
  const last = entries.at(-1);

  function averageMacros(start, end) {
    const days = [];
    for (let day = start; day < end; day = shiftDate(day, 1)) {
      const meals = mealsByDate[day] || [];
      if (meals.length && dayStatus(day, todayKey, now) === 'complete') days.push(sumNutrition(meals));
    }
    const total = days.reduce((sum, nutrition) => Object.fromEntries(Object.keys(emptyNutrition).map((key) => [key, sum[key] + nutrition[key]])), { ...emptyNutrition });
    return { average: Object.fromEntries(Object.keys(emptyNutrition).map((key) => [key, days.length ? total[key] / days.length : 0])), days: days.length };
  }

  const sinceLast = last ? averageMacros(last.date, shiftDate(todayKey, 1)) : null;
  const history = entries.map((entry, index) => {
    const previous = entries[index - 1];
    return { ...entry, change: previous ? entry.weight - previous.weight : null, macros: previous ? averageMacros(previous.date, entry.date) : null };
  }).reverse();

  function logWeight(event) {
    event.preventDefault();
    const value = Math.round(Number(weight) * 10) / 10;
    if (!(value > 0)) return notify('Enter your weight.');
    if (!date || date > todayKey) return notify('Choose a date up to today.');
    setWeights((current) => [...current.filter((entry) => entry.date !== date), { date, weight: value }]);
    setWeight('');
    notify('Weight logged.', 'success');
  }

  function removeWeight(entry) {
    setWeights((current) => current.filter((item) => item.date !== entry.date));
    notify('Weigh-in deleted.', 'info', { label: 'Undo', onClick: () => setWeights((current) => [...current.filter((item) => item.date !== entry.date), entry]) });
  }

  return (
    <main className="app-shell reports-page weight-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button>
        <HeaderQuota quota={quota} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">Weigh-ins</p><h1>Weight</h1></div></div>

      {last && (
        <section className="chart-card weight-card weight-trend">
          <div className="weight-current">
            <div>
              <span>Current weight</span>
              <strong>{formatWeight(last.weight)}<small> kg</small></strong>
              <small>{formatDate(last.date)}</small>
            </div>
            {entries.length >= 2 && (
              <dl className="weight-deltas">
                <div><dt>Last change</dt><dd>{formatWeightChange(last.weight - entries.at(-2).weight)}<small> kg</small></dd></div>
                <div><dt>Since {formatDate(entries[0].date)}</dt><dd>{formatWeightChange(last.weight - entries[0].weight)}<small> kg</small></dd></div>
              </dl>
            )}
          </div>
          {entries.length >= 2 ? <WeightChart entries={entries} /> : <p className="usage-empty">Log another weigh-in to see your trend.</p>}
        </section>
      )}

      <form className="settings-form weight-form" onSubmit={logWeight}>
        <h2>Log weight</h2>
        <div className="weight-inputs">
          <label>Date<input type="date" value={date} max={todayKey} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Weight (kg)<input type="text" inputMode="decimal" value={weight} onChange={(event) => setWeight(decimalInput(event.target.value))} /></label>
        </div>
        <button className="auth-submit" type="submit">Log weight</button>
      </form>

      {last && (
        <section className="chart-card weight-card">
          <div className="card-heading"><h2>Average daily macros</h2><span>since {formatDate(last.date)}{sinceLast.days ? ` · ${sinceLast.days} ${sinceLast.days === 1 ? 'day' : 'days'}` : ''}</span></div>
          {sinceLast.days ? (
            <div className="weight-averages">
              {Object.entries(reportMetrics).map(([key, metric]) => <div key={key}><span>{metric.label}</span><strong>{Math.round(sinceLast.average[key]).toLocaleString()}<small>{metric.suffix}</small></strong></div>)}
            </div>
          ) : <p className="usage-empty">No completed days logged since then yet.</p>}
        </section>
      )}

      <section className="chart-card weight-card">
        <div className="card-heading"><h2>History</h2><span>{entries.length} {entries.length === 1 ? 'weigh-in' : 'weigh-ins'}</span></div>
        {history.length === 0 ? <p className="usage-empty">No weigh-ins yet.</p> : (
          <div className="weight-list">
            {history.map((entry) => (
              <div className="weight-row" key={entry.date}>
                <div className="weight-row-main">
                  <span>{formatDate(entry.date)}</span>
                  <strong>{formatWeight(entry.weight)}<small> kg</small></strong>
                  {entry.change !== null && <small className="weight-change">{formatWeightChange(entry.change)} kg</small>}
                </div>
                {entry.change === null ? <small className="weight-row-note">First weigh-in</small> : <WeightMacros result={entry.macros} />}
                <button className="remove-button" type="button" onClick={() => removeWeight(entry)} aria-label={`Delete weigh-in on ${formatDate(entry.date)}`} title="Delete weigh-in"><Trash2 /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

// Line chart with x spaced by date (weigh-ins are irregular) and y fitted tightly to the weight range instead of starting at 0.
function WeightChart({ entries }) {
  const gradientId = `weight-fill-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const values = entries.map((entry) => entry.weight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = niceStep(Math.max(max - min, 0.6) / 3);
  const low = Math.floor((min - step / 4) / step) * step;
  const high = Math.ceil((max + step / 4) / step) * step;
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => Math.round((high - index * step) * 10) / 10);
  const time = (date) => new Date(`${date}T12:00:00`).getTime();
  const start = time(entries[0].date);
  const span = Math.max(time(entries.at(-1).date) - start, 1);
  // Inset the ends so the first and last dots are not clipped by the plot edges.
  const chartX = (date) => 3 + ((time(date) - start) / span) * 94;
  const chartY = (value) => 6 + (1 - (value - low) / (high - low)) * 88;
  const chartPx = (value) => `${(chartY(value) / 100) * 168}px`;
  const points = entries.map((entry) => `${chartX(entry.date)},${chartY(entry.weight)}`);
  const latest = entries.at(-1);
  const labelDate = (value) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
  const labels = entries.length > 2 ? [start, start + span / 2, start + span] : [start, start + span];
  return (
    <div className="line-chart weight-chart">
      <div className="chart-scale" aria-hidden="true">{ticks.map((tick) => <span key={tick} style={{ top: chartPx(tick) }}>{chartNumber(tick)}</span>)}</div>
      <div className="chart-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Weight over time line chart">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--green)" stopOpacity=".18" />
              <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => <line key={tick} x1="0" y1={chartY(tick)} x2="100" y2={chartY(tick)} className={tick === ticks.at(-1) ? 'chart-axis' : 'chart-grid'} />)}
          <polygon points={`${chartX(entries[0].date)},${chartY(low)} ${points.join(' ')} ${chartX(latest.date)},${chartY(low)}`} fill={`url(#${gradientId})`} />
          <polyline points={points.join(' ')} className="chart-line" />
        </svg>
        {entries.map((entry) => <span key={entry.date} className={`chart-dot${entry === latest ? ' is-latest' : ''}`} style={{ left: `${chartX(entry.date)}%`, top: chartPx(entry.weight) }} title={`${formatDate(entry.date)}: ${formatWeight(entry.weight)} kg`} />)}
        <div className="chart-labels">{labels.map((value, index) => <span key={index}>{labelDate(value)}</span>)}</div>
      </div>
    </div>
  );
}

function WeightMacros({ result }) {
  if (!result?.days) return <small className="weight-row-note">No logged days</small>;
  const { calories, proteins, carbs, fats } = result.average;
  return (
    <div className="weight-macros">
      <strong>{Math.round(calories).toLocaleString()}<small> kcal/day</small></strong>
      <span>P {Math.round(proteins)} · C {Math.round(carbs)} · F {Math.round(fats)}g</span>
      <span>avg over {result.days} {result.days === 1 ? 'day' : 'days'}</span>
    </div>
  );
}

function ReportStat({ label, value, suffix = '' }) {
  return <div className="report-stat"><span>{label}</span><strong>{value.toLocaleString()}<small>{suffix}</small></strong></div>;
}

function AverageCalories({ value, goal }) {
  return (
    <div className="average-calories">
      <div>
        <strong>{value ? Math.round(value).toLocaleString() : '—'}<small>kcal</small></strong>
        {goal > 0 && <span>of {Math.round(goal).toLocaleString()} goal</span>}
      </div>
      {goal > 0 && <span className="progress-track"><i style={fillStyle(Math.min((value / goal) * 100, 100))} /></span>}
    </div>
  );
}

// With a goal the bar shows progress toward it; without one it compares the macros to each other.
function MacroBar({ label, value, goal, color, max }) {
  const percent = goal > 0 ? Math.min((value / goal) * 100, 100) : (value / max) * 100;
  return <div className="macro-bar-row"><div><span>{label}</span><strong>{value ? Math.round(value) : '—'}{goal > 0 ? <small> / {Math.round(goal)}g</small> : 'g'}</strong></div><span className={`macro-track macro-track-${color}`}><i style={fillStyle(Math.max(percent, value ? 4 : 0))} /></span></div>;
}

const goalTargetKeys = ['calories', 'proteins', 'carbs', 'fats'];

function goalTargets(value) {
  return { ...Object.fromEntries(goalTargetKeys.map((key) => [key, Math.max(0, Number(value?.[key]) || 0)])), objective: objectiveKey(value?.objective) };
}

// Goals are kept as periods, each used from its `from` date until the next one starts; the oldest also covers
// earlier days. Goals saved before periods existed become a single period starting today.
function goalPeriods(value) {
  const saved = Array.isArray(value?.periods) ? value.periods : null;
  const periods = saved
    ? saved.filter((period) => /^\d{4}-\d{2}-\d{2}$/.test(period?.from)).map((period) => ({ from: period.from, ...goalTargets(period) }))
    : goalTargetKeys.some((key) => Number(value?.[key]) > 0) ? [{ from: dateKey(new Date()), ...goalTargets(value) }] : [];
  return [...new Map(periods.map((period) => [period.from, period])).values()].sort((first, second) => first.from.localeCompare(second.from));
}

// The period in effect on `date`; days before the oldest period use the oldest.
function activePeriod(periods, date) {
  return periods.findLast((item) => item.from <= date) || periods[0];
}

// The top-level targets mirror today's period. Goals can start in the future, so App re-derives them with goalOn
// on every render and a goal starting tomorrow takes over without a save.
// Scoring can only stay on while at least one target is set.
function normalizeGoal(value) {
  const periods = goalPeriods(value);
  const targets = goalTargets(activePeriod(periods, dateKey(new Date())));
  const anyTarget = goalTargetKeys.some((key) => targets[key] > 0);
  return { ...targets, periods, scoring: Boolean(value?.scoring && anyTarget), weightTracking: Boolean(value?.weightTracking), workouts: Boolean(value?.workouts) };
}

// The goal with the targets and objective that applied on `date`.
function goalOn(goal, date) {
  if (!goal?.periods?.length) return goal;
  return { ...goal, ...goalTargets(activePeriod(goal.periods, date)) };
}

// Goal edits are held in a draft until saved from the save bar.
function GoalView({ goal, quota, setGoal, onEstimateGoal, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, notify }) {
  const current = normalizeGoal(goal);
  const toDraft = (value) => Object.fromEntries(goalTargetKeys.map((key) => [key, value[key] ? String(value[key]) : '']));
  const [draft, setDraft] = useState(() => toDraft(current));
  const [draftObjective, setDraftObjective] = useState(current.objective);
  const targets = normalizeGoal(draft);
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
          <ManualInput label="Calories (kcal)" value={draft.calories} onChange={(value) => setDraft((current) => ({ ...current, calories: value }))} />
          <ManualInput label="Protein (g)" value={draft.proteins} onChange={(value) => setDraft((current) => ({ ...current, proteins: value }))} />
          <ManualInput label="Carbs (g)" value={draft.carbs} onChange={(value) => setDraft((current) => ({ ...current, carbs: value }))} />
          <ManualInput label="Fat (g)" value={draft.fats} onChange={(value) => setDraft((current) => ({ ...current, fats: value }))} />
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

// The oldest goal also covers the days before its start, so it reads "Until …".
function periodRange(period, next, oldest, today) {
  if (!next) return oldest ? 'All days' : `${period.from > today ? 'From' : 'Since'} ${formatDate(period.from)}`;
  return oldest ? `Until ${formatDate(shiftDate(next.from, -1))}` : `${formatDate(period.from)} – ${formatDate(shiftDate(next.from, -1))}`;
}

function goalSummary(period) {
  const parts = [period.calories > 0 && `${Math.round(period.calories)} kcal`, ...metrics.slice(1).filter(({ key }) => period[key] > 0).map(({ key, label }) => `${label} ${Math.round(period[key])}g`)].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No targets';
}

// Adds a goal starting on a chosen day, or edits/deletes an existing one; `period.isNew` marks a new goal.
function GoalPeriodDialog({ period, periods, active, showObjective, onSave, onDelete, onClose }) {
  const [shown, closing] = usePresence(period, 150);
  const id = useId();
  const [draft, setDraft] = useState(null);
  useEscape(Boolean(period), onClose);

  useLayoutEffect(() => {
    if (period) setDraft({ from: period.from, objective: period.objective, ...Object.fromEntries(goalTargetKeys.map((key) => [key, period[key] ? String(period[key]) : ''])) });
  }, [period]);

  if (!shown || !draft) return null;
  const originalFrom = shown.isNew ? null : shown.from;
  const today = dateKey(new Date());
  const targets = goalTargets(draft);
  const error = !/^\d{4}-\d{2}-\d{2}$/.test(draft.from) ? 'Choose a start date.'
    : draft.from !== originalFrom && periods.some((item) => item.from === draft.from) && !(shown.isNew && draft.from === active?.from) ? `Another goal already starts on ${formatDate(draft.from)}.`
    : !goalTargetKeys.some((key) => targets[key] > 0) ? 'Set at least one target.' : '';
  // A new goal starting on the current goal's start day moves the current goal back a day so earlier days keep it;
  // only when that day already belongs to the previous goal (the current one began today) is it replaced.
  const takesCurrentDay = shown.isNew && draft.from === active?.from;
  const movedFrom = takesCurrentDay && shiftDate(active.from, -1);
  const moved = takesCurrentDay && !(periods[periods.indexOf(active) - 1]?.from >= movedFrom) ? { ...active, from: movedFrom } : null;
  const replacesCurrent = takesCurrentDay && !moved;
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));

  function submit(event) {
    event.preventDefault();
    if (error) return;
    onSave({ from: draft.from, ...targets }, takesCurrentDay ? draft.from : originalFrom, moved);
  }

  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading"><h2 id={`${id}-title`}>{shown.isNew ? 'New goal' : 'Edit goal'}</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        <form className="meal-form goal-period-form" onSubmit={submit}>
          <label className="manual-input goal-period-date">Starts on<input type="date" value={draft.from} onChange={(event) => set({ from: event.target.value })} /></label>
          <ManualInput label="Calories (kcal)" value={draft.calories} onChange={(value) => set({ calories: value })} />
          <ManualInput label="Protein (g)" value={draft.proteins} onChange={(value) => set({ proteins: value })} />
          <ManualInput label="Carbs (g)" value={draft.carbs} onChange={(value) => set({ carbs: value })} />
          <ManualInput label="Fat (g)" value={draft.fats} onChange={(value) => set({ fats: value })} />
          {showObjective && (
            <div className="goal-objective goal-period-objective" role="radiogroup" aria-label="Objective">
              <span>Objective</span>
              <div className="objective-toggle">{Object.entries(objectives).map(([key, objective]) => <button className={draft.objective === key ? 'active' : ''} type="button" role="radio" aria-checked={draft.objective === key} onClick={() => set({ objective: key })} key={key}>{objective.label}</button>)}</div>
            </div>
          )}
          <p className="goal-period-hint" data-error={error || undefined}>{error || (replacesCurrent ? 'This replaces the current goal, which also started on this day.' : moved ? `Used from this day on. Your current goal stays on days up to ${formatDate(movedFrom)}.` : draft.from > today ? `Starts automatically on ${formatDate(draft.from)}; until then your current goal stays in use.` : 'Used from this day until the next goal starts.')}</p>
          <div className="dialog-actions">
            {!shown.isNew && periods.length > 1 && <button className="clear-meal-form" type="button" onClick={() => onDelete(shown.from)}><Trash2 aria-hidden="true" />Delete</button>}
            <button type="button" onClick={onClose}>Cancel</button>
            <button className="confirm-add" type="submit" disabled={Boolean(error)}>Save</button>
          </div>
        </form>
      </section>
    </div>
  );
}

const goalActivityOptions = [
  ['sedentary', 'Sedentary', 'Mostly sitting'],
  ['light', 'Light', 'Some walking or light exercise'],
  ['moderate', 'Moderate', 'Regular exercise'],
  ['high', 'High', 'Hard training most days'],
  ['very_high', 'Very high', 'Intense training or physical work'],
];

function GoalWizardDialog({ open, selected, onClose, onGenerate, onApply }) {
  const [shown, closing] = usePresence(open || null, 150);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({ sex: '', age: '', height: '', weight: '', activity: '', objective: selected });
  const [generating, setGenerating] = useState(false);
  useEscape(open && !generating, onClose);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setProfile({ sex: '', age: '', height: '', weight: '', activity: '', objective: selected });
  }, [open, selected]);

  if (!shown) return null;

  const valid = [
    Boolean(profile.sex),
    Number.isInteger(Number(profile.age)) && Number(profile.age) >= 18 && Number(profile.age) <= 100,
    Number.isFinite(Number(profile.height)) && Number(profile.height) >= 100 && Number(profile.height) <= 250 && Number.isFinite(Number(profile.weight)) && Number(profile.weight) >= 30 && Number(profile.weight) <= 300,
    Boolean(profile.activity),
    Boolean(profile.objective),
  ][step];

  async function submit(event) {
    event.preventDefault();
    if (!valid || generating) return;
    if (step < 4) {
      setStep((current) => current + 1);
      return;
    }
    setGenerating(true);
    const targets = await onGenerate({ ...profile, age: Number(profile.age), height: Number(profile.height), weight: Number(profile.weight) });
    setGenerating(false);
    if (!targets) return;
    onApply(targets, profile.objective);
    onClose();
  }

  const select = (key, value) => setProfile((current) => ({ ...current, [key]: value }));

  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (!generating && event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog goal-wizard" role="dialog" aria-modal="true" aria-labelledby="goal-wizard-title">
        <div className="dialog-heading"><div><p className="eyebrow">Personalized targets · step {step + 1} of 5</p><h2 id="goal-wizard-title">Build your daily goal</h2></div><button type="button" onClick={onClose} disabled={generating} aria-label="Close"><X /></button></div>
        <div className="goal-wizard-progress" role="progressbar" aria-label="Wizard progress" aria-valuemin="1" aria-valuemax="5" aria-valuenow={step + 1}><i style={{ width: `${((step + 1) / 5) * 100}%` }} /></div>
        <form onSubmit={submit}>
          <div className="goal-wizard-question">
            {step === 0 && <><h3>Which sex should the estimate use?</h3><div className="goal-wizard-options" role="radiogroup" aria-label="Sex">{[['female', 'Female'], ['male', 'Male']].map(([value, label]) => <button type="button" role="radio" aria-checked={profile.sex === value} className={profile.sex === value ? 'active' : ''} onClick={() => select('sex', value)} key={value}>{label}</button>)}</div></>}
            {step === 1 && <><h3>How old are you?</h3><label className="goal-wizard-field">Age<input type="number" min="18" max="100" step="1" inputMode="numeric" value={profile.age} onChange={(event) => select('age', event.target.value)} placeholder="18–100" /></label></>}
            {step === 2 && <><h3>What are your height and weight?</h3><label className="goal-wizard-field">Height (cm)<input type="number" min="100" max="250" step="1" inputMode="numeric" value={profile.height} onChange={(event) => select('height', event.target.value)} placeholder="100–250 cm" /></label><label className="goal-wizard-field">Weight (kg)<input type="text" inputMode="decimal" value={profile.weight} onChange={(event) => select('weight', decimalInput(event.target.value))} placeholder="30–300 kg" /></label></>}
            {step === 3 && <><h3>How active are you most weeks?</h3><div className="goal-wizard-options goal-wizard-list" role="radiogroup" aria-label="Activity level">{goalActivityOptions.map(([value, label, description]) => <button type="button" role="radio" aria-checked={profile.activity === value} className={profile.activity === value ? 'active' : ''} onClick={() => select('activity', value)} key={value}><strong>{label}</strong><small>{description}</small></button>)}</div></>}
            {step === 4 && <><h3>What is your main purpose?</h3><div className="goal-wizard-options goal-wizard-list" role="radiogroup" aria-label="Goal purpose">{Object.entries(objectives).map(([value, objective]) => <button type="button" role="radio" aria-checked={profile.objective === value} className={profile.objective === value ? 'active' : ''} onClick={() => select('objective', value)} key={value}><strong>{objective.label}</strong><small>{objective.description}</small></button>)}</div></>}
          </div>
          <p className="goal-wizard-note">For adults 18+. Estimates are informational, not medical advice.</p>
          <div className="goal-wizard-actions">
            {step > 0 && <button type="button" className="wizard-back" onClick={() => setStep((current) => current - 1)} disabled={generating}><ChevronLeft aria-hidden="true" />Back</button>}
            <button type="submit" className="wizard-next" disabled={!valid || generating}>{generating ? <><LoaderCircle className="is-spinning" aria-hidden="true" />Thinking…</> : step === 4 ? <><Sparkles aria-hidden="true" />Generate targets</> : <>Continue<ChevronRight aria-hidden="true" /></>}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

// Explains every objective; picking one here selects it.
function ObjectiveInfoDialog({ open, selected, onSelect, onClose }) {
  const [shown, closing] = usePresence(open || null, 150);
  const id = useId();
  useEscape(open, onClose);
  if (!shown) return null;
  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog objective-info" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading"><h2 id={`${id}-title`}>Objectives</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        <p>Your targets stay the same. The objective only changes how going over or under them affects your score.</p>
        <ul>
          {Object.entries(objectives).map(([key, objective]) => (
            <li key={key}>
              <button className={selected === key ? 'active' : ''} type="button" onClick={() => onSelect(key)} aria-pressed={selected === key}>
                <strong>{objective.label}{selected === key && <small>Selected</small>}</strong>
                <span>{objective.description}</span>
                <small>{metrics.map((metric) => `${metric.label} ${Math.round(objective.weights[metric.key] * 100)}%`).join(' · ')}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const settingsTabs = [
  { route: 'settings', label: 'General', icon: SlidersHorizontal },
  { route: 'ai', label: 'AI', icon: Sparkles },
  { route: 'usage', label: 'Tokens', icon: Cpu },
  { route: 'data-handling', label: 'Data', icon: Database },
];

function SettingsView({ tab, goal, proxyQuota, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, ...props }) {
  return (
    <main className="app-shell settings-page">
      <header className="topbar"><button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button><button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button><HeaderQuota quota={proxyQuota} /></header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">On this device</p><h1>Settings</h1></div></div>
      <nav className="settings-tabs" aria-label="Settings sections">
        {settingsTabs.map(({ route, label, icon: Icon }) => (
          <button key={route} className={tab === route ? 'active' : ''} type="button" onClick={() => tab !== route && onNavigate(route)} aria-current={tab === route ? 'page' : undefined}><Icon aria-hidden="true" />{label}</button>
        ))}
      </nav>
      <div className="settings-panel">
        {tab === 'ai' ? <AiPanel {...props} /> : tab === 'usage' ? <TokensPanel usage={props.usage} /> : tab === 'data-handling' ? <DataPanel goal={goal} {...props} /> : <GeneralPanel goal={goal} {...props} />}
      </div>
    </main>
  );
}

function SecretInput({ label, value, onChange }) {
  const [shown, setShown] = useState(false);
  return (
    <label>{label}
      <span className="secret-input">
        <input type={shown ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck="false" />
        <button type="button" onClick={() => setShown((current) => !current)} aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} title={shown ? 'Hide' : 'Show'}>{shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
      </span>
    </label>
  );
}

function AiPanel({ settings, setSettings, notify }) {
  const [draft, setDraft] = useState(settings);
  function update(key, value) { setDraft((current) => ({ ...current, [key]: value })); }
  const activeMode = settings.aiMode === 'proxy' ? 'proxy' : 'manual';
  const draftMode = draft.aiMode === 'proxy' ? 'proxy' : 'manual';
  const willReplace = draftMode !== activeMode && isAiConfigured(settings);
  const changed = Object.keys(draft).some((key) => draft[key] !== settings[key]);
  function saveSettings(event) {
    event.preventDefault();
    if (draft.aiMode === 'proxy') {
      if (!draft.proxyUrl || !draft.proxyUsername || !draft.proxyKey) return notify('Enter the proxy URL, username and access key.');
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
  return (
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
        <p className="settings-hint">Estimates are sent to your own endpoint, which holds the AI key. Meal details or profile answers for goal suggestions are sent.</p>
        <label>Proxy URL<input type="url" inputMode="url" placeholder="https://…" value={draft.proxyUrl} onChange={(event) => update('proxyUrl', event.target.value.trim())} autoComplete="off" /></label>
        <label>Username<input value={draft.proxyUsername} onChange={(event) => update('proxyUsername', event.target.value)} autoComplete="username" autoCapitalize="none" /></label>
        <SecretInput label="Access key" value={draft.proxyKey} onChange={(value) => update('proxyKey', value)} />
      </> : <>
        <label>Provider<select value={draft.provider} onChange={(event) => update('provider', event.target.value)}><option value="google">Google AI</option><option value="openai">OpenAI</option></select></label>
        {draft.provider === 'google' ? <div className="settings-pair">
          <SecretInput label="API key" value={draft.googleKey} onChange={(value) => update('googleKey', value)} />
          <label>Model<input value={draft.googleModel} onChange={(event) => update('googleModel', event.target.value)} autoCapitalize="none" spellCheck="false" /></label>
        </div> : <div className="settings-pair">
          <SecretInput label="API key" value={draft.openaiKey} onChange={(value) => update('openaiKey', value)} />
          <label>Model<input value={draft.openaiModel} onChange={(event) => update('openaiModel', event.target.value)} autoCapitalize="none" spellCheck="false" /></label>
        </div>}
      </>}
      <div className="settings-actions">
        {changed && <button className="settings-discard" type="button" onClick={() => setDraft(settings)}>Discard</button>}
        <button className="auth-submit" type="submit" disabled={!changed}>{willReplace ? `Switch to ${aiModeLabels[draftMode]}` : changed ? 'Save settings' : 'Saved'}</button>
      </div>
    </form>
  );
}

function GeneralPanel({ goal, setGoal, settings, setSettings, notify }) {
  const [updating, setUpdating] = useState(false);
  // Menu switches live on the goal so existing data and backups keep working.
  const menus = normalizeGoal(goal);
  const toggleMenu = (patch) => setGoal(normalizeGoal({ ...menus, ...patch }));
  async function handleUpdate() {
    setUpdating(true);
    try {
      await updateApp();
    } catch (error) {
      setUpdating(false);
      notify(error.message || 'The update failed.', 'error');
    }
  }
  return <>
    <section className="settings-form settings-menus">
      <div className="goal-section-heading"><h2>Menus</h2><p>Turn on extra pages in the menu.</p></div>
      <label className="scoring-toggle">
        <input type="checkbox" role="switch" checked={menus.weightTracking} onChange={(event) => toggleMenu({ weightTracking: event.target.checked })} />
        <span><strong>Weight track</strong><small>Log your weight and see your average daily macros between weigh-ins.</small></span>
      </label>
      <label className="scoring-toggle">
        <input type="checkbox" role="switch" checked={menus.workouts} onChange={(event) => toggleMenu({ workouts: event.target.checked })} />
        <span><strong>Workouts</strong><small>Save workouts and log your sets and reps on a calendar.</small></span>
      </label>
    </section>
    <section className="settings-form settings-menus">
      <div className="goal-section-heading"><h2>Meals</h2><p>Order of meals in the day list.</p></div>
      <div className="objective-toggle" role="radiogroup" aria-label="Meal order">
        {[['asc', 'Oldest first'], ['desc', 'Newest first']].map(([key, label]) => <button className={settings.mealOrder === key ? 'active' : ''} type="button" role="radio" aria-checked={settings.mealOrder === key} onClick={() => setSettings((current) => ({ ...current, mealOrder: key }))} key={key}>{label}</button>)}
      </div>
    </section>
    <section className="settings-form settings-update">
      <div className="goal-section-heading"><h2>App</h2><p>Get the latest version. Your meals, goals and settings stay on this device.</p></div>
      <button className="auth-submit" type="button" onClick={handleUpdate} disabled={updating}><RefreshCw className={updating ? 'is-spinning' : undefined} aria-hidden="true" />{updating ? 'Updating…' : 'Update app'}</button>
    </section>
  </>;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

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

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

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

function DataPanel({ mealsByDate, setMealsByDate, goal, setGoal, weights, setWeights, workoutTemplates, setWorkoutTemplates, workoutLogs, setWorkoutLogs, settings, setSettings, usage, setUsage, notify }) {
  const today = dateKey(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [clearKinds, setClearKinds] = useState({ meals: true, weights: false, workoutLogs: false });
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
  return <><section className="settings-form storage-form"><div className="storage-heading"><h2>Storage</h2><strong>{formatBytes(storage.total)}</strong></div><div className="storage-list">{storage.items.map((item) => <div key={item.key}><span>{item.label}</span><strong>{formatBytes(item.bytes)}</strong></div>)}</div></section><section className="settings-form migration-form"><div><h2>Backup</h2><p>Save your data before updating the app or switching devices, or restore it from a previous backup.</p></div><div className="migration-actions"><button className="auth-submit" type="button" onClick={exportData}>Export</button><label className="import-button">Import<input type="file" accept="application/json,.json" onChange={importData} /></label></div></section><form className="settings-form clear-form" onSubmit={clearRange}>
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

// Usage guide in Romanian, one drawer per menu page; button names stay as they appear in the app.
const helpSections = [
  { icon: Home, title: 'Today', items: [
    'Aici vezi mesele zilei. Folosește săgețile din antet sau apasă pe dată ca să alegi altă zi; „Back to today” te readuce la ziua curentă.',
    'Apasă butonul + ca să adaugi o masă: descrie ce ai mâncat și alege ora. Poți scana codul de bare al unui produs („Scan barcode”) sau poți alege rapid o masă introdusă anterior din sugestii.',
    'Valorile nutriționale pot fi completate manual („Add values”), fie ca total, fie după gramaj („By weight”), pe baza etichetei produsului.',
    'Butonul ✨ de pe o masă estimează caloriile și macronutrienții cu AI. „Estimate all” estimează dintr-o dată toate mesele fără valori.',
    'Apasă pe textul unei mese ca să o editezi, iar coșul de gunoi o șterge (poți anula din notificare).',
    'Panoul „Daily total” arată totalul zilei față de obiectivele tale. Dacă scorul este activ, insigna de lângă el se completează după ora 21:00.',
  ] },
  { icon: BarChart3, title: 'Reports', items: [
    'Alege perioada: 7 zile, 30 de zile sau 3 luni. Ziua de azi este inclusă după ora 21:00.',
    'Vezi câte zile ai înregistrat, câte au fost în țintă și media meselor pe zi.',
    '„Daily average” arată media de calorii și macronutrienți pe zi înregistrată.',
    'În graficul pe zile poți schimba indicatorul (calorii, proteine etc.). Culorile arată dacă ai fost sub, în țintă sau peste ținta din ziua respectivă; linia de țintă și „Daily average” folosesc obiectivul curent. Apasă pe o coloană ca să deschizi ziua respectivă.',
  ] },
  { icon: Target, title: 'Goal', items: [
    'Setează țintele zilnice pentru calorii, proteine, carbohidrați și grăsimi, apoi apasă „Save”. Modificările se aplică obiectivului curent.',
    '„Suggest with AI” te ghidează în 5 pași (sex, vârstă, înălțime și greutate, nivel de activitate, scop) și propune ținte. Le poți ajusta înainte de salvare.',
    'După ce ai salvat cel puțin o țintă, poți activa „Scoring”, care adaugă pagina Scores în meniu.',
    'Alege obiectivul (slăbire, menținere, creștere în greutate, masă musculară, recompoziție). Ținta rămâne aceeași; obiectivul schimbă doar cum este punctat surplusul sau deficitul. Butonul ⓘ explică fiecare variantă.',
    'Ca să schimbi ținta fără să afectezi zilele trecute, apasă „New goal” în „Goal history” și alege data de la care se aplică (implicit azi). Poți alege și o dată din viitor: obiectivul apare ca „Upcoming” și intră în vigoare singur în ziua respectivă. Fiecare zi este punctată și raportată după obiectivul pe care îl avea atunci.',
    'Un obiectiv se aplică de la data lui de start până când începe următorul. Cel mai vechi obiectiv se aplică și zilelor dinaintea lui.',
    'Apasă pe un obiectiv din „Goal history” ca să-i modifici data de start, țintele sau obiectivul, ori ca să-l ștergi (cu Undo).',
  ] },
  { icon: Medal, title: 'Scores', items: [
    'Apare în meniu doar când scorul este activ din Goal.',
    'Fiecare zi primește un scor de la 0 la 100, în funcție de cât de aproape ai fost de ținte. Scorul unei zile se stabilește după ora 21:00.',
    'Calendarul arată scorurile pe lună și media lunară. Îl poți partaja ca imagine.',
    'Fiecare zi este punctată după obiectivul activ în ziua respectivă, deci un obiectiv nou nu schimbă scorurile trecute.',
    'Apasă pe o zi ca să o deschizi. Pe pagina Today, insigna de scor arată detaliile și modul de calcul.',
  ] },
  { icon: Scale, title: 'Weight', items: [
    'Se activează din Settings › Menus › „Weight track”.',
    'Introdu greutatea și data cântăririi. O singură înregistrare pe zi; una nouă o înlocuiește pe cea veche.',
    'Între două cântăriri vezi diferența de greutate și media zilnică a macronutrienților, calculată doar din zilele complete cu mese înregistrate.',
  ] },
  { icon: Dumbbell, title: 'Workouts', items: [
    'Se activează din Settings › Menus › „Workouts”.',
    'Creează antrenamente („Create a workout”) cu nume, iconiță, exerciții (pe repetări sau pe timp) și notițe.',
    'În calendar alegi ziua și apeși „Start a workout” ca să înregistrezi seturile, repetările și kilogramele. Vezi și ce ai făcut data trecută.',
    'Cu „Select” poți exporta sau șterge mai multe antrenamente; „Import” le aduce înapoi dintr-un fișier.',
  ] },
  { icon: Settings, title: 'Settings › General', items: [
    'Setările sunt împărțite în patru taburi: General, AI, Tokens și Data.',
    'Menus: activează paginile opționale Weight și Workouts.',
    '„Update app” descarcă ultima versiune a aplicației. Datele rămân pe dispozitiv.',
  ] },
  { icon: Sparkles, title: 'Settings › AI', items: [
    'AI config: alege între cheia ta proprie (Google AI sau OpenAI, cu modelul dorit) și un proxy (URL, utilizator și cheie de acces). Doar una dintre variante este folosită.',
    'Când folosești proxy, în antet vezi câte cereri AI mai ai azi.',
    'Butonul 👁 din dreptul cheilor le afișează sau le ascunde. „Save settings” se activează doar când ai modificat ceva.',
  ] },
  { icon: Cpu, title: 'Settings › Tokens', items: [
    'Arată consumul de tokeni AI: total, număr de cereri și tokeni generați.',
    'Vezi consumul pe ultimele 7 zile și lista cererilor recente, cu modelul folosit.',
  ] },
  { icon: Database, title: 'Settings › Data', items: [
    'Toate datele sunt salvate doar pe acest dispozitiv. Aici vezi cât spațiu ocupă fiecare tip de date.',
    '„Export” salvează un fișier de backup cu toate datele; „Import” le restaurează. Fă un export înainte de a schimba telefonul sau browserul.',
    'Poți șterge mese, cântăriri și antrenamente dintr-un interval de date. Înainte de confirmare vezi exact ce va fi șters.',
  ] },
];

function HelpView({ goal, quota, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast }) {
  return (
    <main className="app-shell help-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span className="brand-mark">DF</span><span>Daily Fuel</span></button>
        <HeaderQuota quota={quota} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">Ghid</p><h1>Cum se folosește</h1></div></div>
      <p className="help-intro">Deschide meniul din stânga sus ca să ajungi la oricare dintre paginile de mai jos.</p>
      <p className="help-privacy"><ShieldCheck aria-hidden="true" /><span>Toate datele tale sunt salvate doar pe acest dispozitiv. Nimeni, nici măcar dezvoltatorul, nu le poate vedea. </span></p>
      <div className="help-sections">
        {helpSections.map(({ icon: Icon, title, items }) => (
          <details className="help-section" key={title}>
            <summary><span className="menu-icon"><Icon aria-hidden="true" /></span>{title}<ChevronDown className="help-chevron" aria-hidden="true" /></summary>
            <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
        ))}
      </div>
    </main>
  );
}

function TokensPanel({ usage }) {
  const daily = usage?.daily || [];
  const maxDaily = Math.max(...daily.map((day) => day.tokens), 1);
  if (!usage) return null;
  return <>
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
  </>;
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

function MealDialog({ draft, title, submitLabel, collapsibleNutrition = false, suggestions, clearable = false, scannable = false, onQuickAdd, onReestimate, onChange, onClose, onSubmit }) {
  const [shown, closing] = usePresence(draft, 150);
  const id = useId();
  const open = Boolean(draft);
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [entryMode, setEntryMode] = useState('total');
  const [perValues, setPerValues] = useState(blankPerValues);
  // What the draft looked like before a previous meal was picked, so the pick can be undone.
  const [beforePick, setBeforePick] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [serving, setServing] = useState(null);
  // Name of the scanned product, so the portion can be kept in the text as it changes.
  const [product, setProduct] = useState(null);
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(() => loadLocal('daily-fuel-suggestions-collapsed', false));
  useEffect(() => saveLocal('daily-fuel-suggestions-collapsed', suggestionsCollapsed), [suggestionsCollapsed]);
  // Each time the dialog opens, start collapsed unless the draft already has values.
  useEffect(() => {
    if (open) setNutritionOpen(!collapsibleNutrition || Object.values(draft.nutrition || {}).some((value) => value !== '' && Number(value) !== 0));
    if (open) {
      // A meal saved by weight reopens by weight, so changing the grams still rescales from the label.
      const saved = draft.portion;
      setEntryMode(saved ? 'per' : 'total');
      setPerValues(saved ? perFromPortion(saved) : blankPerValues);
      setServing(saved?.serving ?? null);
      setProduct(saved ? productNameIn(draft.text, saved) : null);
      setBeforePick(null);
    }
    if (!open) setScanning(false);
  }, [open]);
  // Per-amount values are kept locally; the draft always holds the scaled totals.
  function updatePer(patch) {
    const next = { ...perValues, ...patch };
    setPerValues(next);
    const keepText = product && 'portion' in patch && shown.text === productText(product, perValues.portion);
    onChange({ nutrition: scaleNutrition(next), portion: portionFromPer(next, serving), ...(keepText && { text: productText(product, next.portion) }) });
  }
  function changeMode(mode) {
    setEntryMode(mode);
    onChange({ portion: mode === 'per' ? portionFromPer(perValues, serving) : null });
  }
  const textRef = useRef(null);
  // Grow with the text; CSS max-height caps it, after which it scrolls.
  useLayoutEffect(() => {
    const textarea = textRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [shown?.text]);
  useEscape(Boolean(draft), onClose);
  if (!shown) return null;
  const matches = suggestions ? matchMeals(suggestions, shown.text) : [];
  function snapshot(source) {
    return { source, text: shown.text, nutrition: shown.nutrition, portion: shown.portion ?? null, nutritionOpen, entryMode, perValues, serving, product };
  }
  function pickSuggestion(meal) {
    setBeforePick(snapshot('a previous meal'));
    onChange({ text: meal.text, nutrition: Object.fromEntries(Object.entries(meal.nutrition).map(([key, value]) => [key, value ? String(value) : ''])), portion: meal.portion ?? null });
    setEntryMode(meal.portion ? 'per' : 'total');
    setPerValues(meal.portion ? perFromPortion(meal.portion) : blankPerValues);
    setServing(meal.portion?.serving ?? null);
    setProduct(meal.portion ? productNameIn(meal.text, meal.portion) : null);
    if (hasNutrition(meal)) setNutritionOpen(true);
  }
  const hasInput = shown.text.trim() || Object.values(shown.nutrition || {}).some((value) => value !== '') || Object.entries(perValues).some(([key, value]) => key !== 'base' && value !== '');
  // Scanned products fill the per-100g form so changing the portion rescales the totals.
  function fillFromProduct(product) {
    setBeforePick(snapshot(product.per100 ? 'a barcode' : 'a barcode · no nutrition data'));
    setScanning(false);
    const name = product.name.slice(0, mealTextMaxLength - 12);
    setProduct(null);
    if (!product.per100) {
      onChange({ text: name, portion: null });
      return;
    }
    const next = { base: '100', portion: product.servingGrams ? String(product.servingGrams) : '', ...Object.fromEntries(Object.entries(product.per100).map(([key, value]) => [key, String(value)])) };
    const text = productText(name, next.portion);
    setProduct(name);
    setPerValues(next);
    setServing(product.servingGrams);
    setEntryMode('per');
    setNutritionOpen(true);
    onChange({ text, nutrition: scaleNutrition(next), portion: portionFromPer(next, product.servingGrams) });
  }
  function clearForm() {
    onChange({ text: '', time: currentHour(), nutrition: blankNutrition, portion: null });
    setPerValues(blankPerValues);
    setServing(null);
    setProduct(null);
    setEntryMode('total');
    setNutritionOpen(!collapsibleNutrition);
    setBeforePick(null);
    setScanning(false);
  }
  function undoPick() {
    onChange({ text: beforePick.text, nutrition: beforePick.nutrition, portion: beforePick.portion });
    setNutritionOpen(beforePick.nutritionOpen);
    setEntryMode(beforePick.entryMode);
    setPerValues(beforePick.perValues);
    setServing(beforePick.serving);
    setProduct(beforePick.product);
    setBeforePick(null);
  }
  function submitOnShortcut(event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form.requestSubmit();
    }
  }
  const showTools = scannable || (shown.nutrition && !nutritionOpen);
  const hasPortion = perValues.portion !== '' && Number(perValues.base) > 0;
  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="dialog-heading">
          <h2 id={`${id}-title`}>{title}</h2>
          <div className="dialog-heading-actions"><TimePicker value={shown.time} onChange={(time) => onChange({ time })} /><button type="button" onClick={onClose} aria-label="Close"><X /></button></div>
        </div>
        <form className="meal-form" onSubmit={onSubmit}>
          <div className="meal-input">
            <label className="sr-only" htmlFor={`${id}-text`}>What did you eat?</label>
            <textarea ref={textRef} id={`${id}-text`} value={shown.text} onChange={(event) => { setBeforePick(null); onChange({ text: event.target.value }); }} onKeyDown={submitOnShortcut} placeholder="What did you eat?" maxLength={mealTextMaxLength} rows="2" autoFocus />
            {showTools && <div className="meal-tools">
              {scannable && <button className="tool-chip" type="button" onClick={() => setScanning((current) => !current)} aria-pressed={scanning}><ScanBarcode aria-hidden="true" />Scan barcode</button>}
              {shown.nutrition && !nutritionOpen && <button className="tool-chip" type="button" onClick={() => setNutritionOpen(true)}><Plus aria-hidden="true" />Add values</button>}
            </div>}
          </div>
          {scanning && <BarcodeScanner onProduct={fillFromProduct} onClose={() => setScanning(false)} />}
          {beforePick && <div className="suggestion-undo"><span>Filled from {beforePick.source}</span><button type="button" onClick={undoPick}><Undo2 aria-hidden="true" />Undo</button></div>}
          {!beforePick && matches.length > 0 && <div className="meal-suggestions" role="group" aria-label="Previously logged meals">
            <button className="suggestions-toggle" type="button" onClick={() => setSuggestionsCollapsed((current) => !current)} aria-expanded={!suggestionsCollapsed}>
              Previously logged ({matches.length})<ChevronDown aria-hidden="true" data-collapsed={suggestionsCollapsed || undefined} />
            </button>
            {!suggestionsCollapsed && matches.map((meal) => (
              <div className="suggestion-row" key={meal.text}>
                <button type="button" onClick={() => pickSuggestion(meal)} title="Fill the form to edit before adding">
                  <History aria-hidden="true" />
                  <span className="suggestion-main">
                    <span>{meal.text}</span>
                    <small>{loggedLabel(meal.date)} · {meal.time}{meal.count > 1 && ` · ${meal.count}× logged`}</small>
                  </span>
                  {hasNutrition(meal) && <small>{Math.round(meal.nutrition.calories)} kcal</small>}
                </button>
                {onQuickAdd && <button className="suggestion-add" type="button" onClick={() => onQuickAdd(meal)} aria-label={`Add ${meal.text} at ${shown.time}`} title={`Add now at ${shown.time}`}><Plus aria-hidden="true" /></button>}
              </div>
            ))}
          </div>}
          {shown.nutrition && nutritionOpen && <fieldset className="nutrition-panel" aria-labelledby={`${id}-nutrition`}>
            <div className="nutrition-head">
              <h3 id={`${id}-nutrition`}>Nutrition</h3>
              <div className="period-toggle" role="group" aria-label="How to enter values">
                <button className={entryMode === 'total' ? 'active' : ''} type="button" onClick={() => changeMode('total')} aria-pressed={entryMode === 'total'}>Total</button>
                <button className={entryMode === 'per' ? 'active' : ''} type="button" onClick={() => changeMode('per')} aria-pressed={entryMode === 'per'}>By weight</button>
              </div>
            </div>
            {entryMode === 'total' ? <div className="macro-inputs">
              {macroFields.map((field) => <MacroInput key={field.key} {...field} value={shown.nutrition[field.key]} onChange={(value) => onChange({ nutrition: { [field.key]: value } })} />)}
            </div> : <>
              <p className="per-base"><label htmlFor={`${id}-base`}>Values on the label, per</label><input id={`${id}-base`} type="text" inputMode="decimal" value={perValues.base} onChange={(event) => updatePer({ base: decimalInput(event.target.value) })} />g</p>
              <div className="macro-inputs">
                {macroFields.map((field) => <MacroInput key={field.key} {...field} value={perValues[field.key]} onChange={(value) => updatePer({ [field.key]: value })} />)}
              </div>
              <div className="portion-card">
                <label htmlFor={`${id}-portion`}>Portion eaten<small>How much you had</small></label>
                <span className="portion-field"><input id={`${id}-portion`} type="text" inputMode="decimal" value={perValues.portion} onChange={(event) => updatePer({ portion: decimalInput(event.target.value) })} placeholder="0" /><span>g</span></span>
                {serving && <div className="portion-chips">
                  {[[0.5, '½ serving'], [1, '1 serving'], [2, '2 servings']].map(([count, label]) => {
                    const grams = String(Math.round(serving * count * 10) / 10);
                    return <button key={count} className="portion-chip" type="button" onClick={() => updatePer({ portion: grams })} aria-pressed={perValues.portion === grams} aria-label={`${label}, ${grams} g`}>{label}</button>;
                  })}
                </div>}
                {hasPortion ? <dl className="portion-result">{macroFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{shown.nutrition[field.key] || 0}<small>{field.unit}</small></dd></div>)}</dl> : <p className="portion-empty">Enter a portion to see the totals</p>}
              </div>
            </>}
          </fieldset>}
          <div className="dialog-actions">
            {clearable && <button className="clear-meal-form" type="button" onClick={clearForm} disabled={!hasInput}><Eraser aria-hidden="true" />Clear</button>}
            {onReestimate && <button className="reestimate-meal" type="button" onClick={onReestimate} disabled={!shown.text.trim()} title="Replace values with a new AI estimate" aria-label={hasNutrition(shown) ? 'Re-estimate with AI' : 'Estimate with AI'}><Sparkles aria-hidden="true" />{hasNutrition(shown) ? 'Re-estimate' : 'Estimate'}</button>}
            <button className="confirm-add" type="submit" disabled={!shown.text.trim()}>{submitLabel}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

const macroFields = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'proteins', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fats', label: 'Fat', unit: 'g' },
];

function MacroInput({ label, unit, value, onChange }) {
  return <label className="macro-input">{label}<span className="macro-field"><input type="text" inputMode="decimal" value={value} onChange={(event) => onChange(decimalInput(event.target.value))} placeholder="0" /><small>{unit}</small></span></label>;
}

// Keeps the amount in the meal text, so a later edit or AI re-estimate still knows the portion.
function productText(name, portion) {
  return Number(portion) > 0 ? `${name} (${portion} g)` : name;
}

// Recovers the product name from text written by productText, so the grams keep syncing on edit.
function productNameIn(text, portion) {
  const suffix = ` (${portion.grams} g)`;
  return text.endsWith(suffix) ? text.slice(0, -suffix.length) : null;
}

const blankPerValues = { base: '100', portion: '', ...blankNutrition };

function scaleNutrition({ base, portion, ...values }) {
  const factor = Number(portion) / Number(base);
  const valid = portion !== '' && Number(base) > 0 && Number.isFinite(factor);
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, valid && value !== '' ? String(Math.round(Number(value) * factor * 10) / 10) : '']));
}

function TimePicker({ value, onChange }) {
  return <div className="time-picker"><Clock aria-hidden="true" /><strong>{value}</strong><input aria-label="Meal time" type="time" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
createRoot(document.getElementById('root')).render(<StrictMode><App /><InstallPrompt /></StrictMode>);
