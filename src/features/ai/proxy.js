import { goalTargetKeys } from '../goal/goal.js';
import { cleanNutrition } from '../meals/nutrition.js';

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

export async function fetchProxyQuota(settings) {
  const result = await callProxy(settings, { action: 'quota' });
  return result.quota || null;
}

export async function estimateViaProxy(meals, settings) {
  const result = await callProxy(settings, { meals: meals.map(({ id, time, text }) => ({ id, time, text })) });
  if (!Array.isArray(result.meals)) throw new Error('The proxy returned an invalid response.');
  const nutritionById = Object.fromEntries(result.meals.map((estimate) => [String(estimate.id), cleanNutrition(estimate)]));
  if (meals.some((meal) => !nutritionById[meal.id])) throw new Error('The proxy did not return nutrition for every meal.');
  return { nutritionById, usage: result.usage || {}, model: result.model || 'proxy', quota: result.quota || null };
}

export async function estimateGoalViaProxy(profile, settings) {
  const result = await callProxy(settings, { goalProfile: profile });
  if (!result.targets || goalTargetKeys.some((key) => !(Number(result.targets[key]) > 0))) throw new Error('The proxy returned invalid goal targets.');
  return { targets: cleanNutrition(result.targets), usage: result.usage || {}, model: result.model || 'proxy', quota: result.quota || null };
}

export function formatResetTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
