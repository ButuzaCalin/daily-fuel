import { goalTargetKeys } from '../goal/goal.js';
import { cleanNutrition } from '../meals/nutrition.js';

// Some OpenAI models only accept the default temperature of 1.
function fetchOpenAI(settings, prompt) {
  const temperature = /luna|sol/i.test(settings.openaiModel || '') ? 1 : 0;
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.openaiKey}` },
    body: JSON.stringify({ model: settings.openaiModel, temperature, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
  });
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

export async function estimateLocally(meal, settings) {
  const prompt = `The meal description may be in English or Romanian. Return only a JSON object with numeric keys: calories, proteins, carbs, fats. Estimate the total for the meal.\ncalories, proteins, carbs and fats in this meal:\n${meal}`;
  const result = await requestLocalAI(prompt, settings);
  return { nutrition: cleanNutrition(result.data), usage: result.usage };
}

export async function estimateDayLocally(meals, settings) {
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

export async function estimateGoalLocally(profile, settings) {
  const prompt = `Estimate daily nutrition targets for an adult. Use the person's weight in kilograms when estimating energy needs and protein. Return only a JSON object with numeric keys calories, proteins, carbs and fats. Values must be positive; calories are kcal and macros are grams. Use a sensible, sustainable estimate, not an extreme diet.\nProfile: ${JSON.stringify(profile)}`;
  const result = await requestLocalAI(prompt, settings);
  const targets = cleanNutrition(result.data);
  if (goalTargetKeys.some((key) => !(targets[key] > 0))) throw new Error('The AI returned invalid goal targets.');
  return { targets, usage: result.usage };
}
