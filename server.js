import express from 'express';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Database from 'better-sqlite3';

const app = express();
const port = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DB_PATH || path.join(__dirname, 'data', 'food.db');
const sessionCookie = 'daily_fuel_session';
const sessionDays = 30;

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meal_date TEXT NOT NULL,
    meal_time TEXT NOT NULL,
    meal_text TEXT NOT NULL,
    calories REAL NOT NULL DEFAULT 0,
    proteins REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fats REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meal_id TEXT REFERENCES meals(id) ON DELETE SET NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS goals (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    calories REAL NOT NULL DEFAULT 0,
    proteins REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fats REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS meals_user_date ON meals(user_id, meal_date);
  CREATE INDEX IF NOT EXISTS token_usage_user_date ON token_usage(user_id, created_at);
`);

app.use(express.json({ limit: '20kb' }));

db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());

function getCookie(req, name) {
  const cookies = (req.headers.cookie || '').split(';');
  const cookie = cookies.find((value) => value.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : null;
}

function setSessionCookie(res, token) {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sessionDays * 86400}${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + sessionDays * 86400000;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  setSessionCookie(res, token);
}

function currentUser(req) {
  const token = getCookie(req, sessionCookie);
  if (!token) return null;
  return db.prepare(`
    SELECT users.id, users.username
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > ?
  `).get(token, Date.now()) || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please sign in.' });
  req.user = user;
  next();
}

function nutritionFromRow(row) {
  return {
    calories: row.calories,
    proteins: row.proteins,
    carbs: row.carbs,
    fats: row.fats,
  };
}

function mealFromRow(row) {
  return {
    id: row.id,
    time: row.meal_time,
    text: row.meal_text,
    nutrition: nutritionFromRow(row),
    estimating: false,
    error: '',
  };
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 letters, numbers, or underscores.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    createSession(result.lastInsertRowid, res);
    return res.status(201).json({ user: { id: result.lastInsertRowid, username } });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That username is already taken.' });
    console.error('Registration failed:', error.message);
    return res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  createSession(user.id, res);
  return res.json({ user: { id: user.id, username: user.username } });
});

app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req);
  return user ? res.json({ user }) : res.status(401).json({ error: 'Please sign in.' });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getCookie(req, sessionCookie);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  clearSessionCookie(res);
  return res.json({ ok: true });
});

app.get('/api/meals', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM meals WHERE user_id = ? ORDER BY meal_date, meal_time, created_at').all(req.user.id);
  const mealsByDate = rows.reduce((result, row) => {
    (result[row.meal_date] ||= []).push(mealFromRow(row));
    return result;
  }, {});
  return res.json(mealsByDate);
});

app.get('/api/goal', requireAuth, (req, res) => {
  const goal = db.prepare('SELECT calories, proteins, carbs, fats FROM goals WHERE user_id = ?').get(req.user.id);
  return res.json(goal || null);
});

app.put('/api/goal', requireAuth, (req, res) => {
  const values = ['calories', 'proteins', 'carbs', 'fats'].map((key) => {
    const value = req.body[key] === undefined || req.body[key] === '' ? 0 : Number(req.body[key]);
    return Number.isFinite(value) && value >= 0 ? value : null;
  });
  if (values.some((value) => value === null)) return res.status(400).json({ error: 'Goal values must be positive numbers.' });
  db.prepare(`
    INSERT INTO goals (user_id, calories, proteins, carbs, fats, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET calories = excluded.calories, proteins = excluded.proteins, carbs = excluded.carbs, fats = excluded.fats, updated_at = CURRENT_TIMESTAMP
  `).run(req.user.id, ...values);
  return res.json(db.prepare('SELECT calories, proteins, carbs, fats FROM goals WHERE user_id = ?').get(req.user.id));
});

app.get('/api/usage', requireAuth, (req, res) => {
  const summary = db.prepare(`
    SELECT COUNT(*) AS requests,
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens
    FROM token_usage WHERE user_id = ?
  `).get(req.user.id);
  const daily = db.prepare(`
    SELECT substr(created_at, 1, 10) AS date, SUM(total_tokens) AS tokens, COUNT(*) AS requests
    FROM token_usage WHERE user_id = ? GROUP BY date ORDER BY date DESC LIMIT 7
  `).all(req.user.id);
  const recent = db.prepare(`
    SELECT model, prompt_tokens, completion_tokens, total_tokens, created_at
    FROM token_usage WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.user.id);
  return res.json({ summary, daily, recent });
});

app.post('/api/meals', requireAuth, (req, res) => {
  const date = String(req.body.date || '');
  const time = String(req.body.time || '');
  const text = String(req.body.text || '').trim();
  if (!validDate(date) || !validTime(time) || !text) return res.status(400).json({ error: 'Date, time, and meal text are required.' });
  const nutrition = req.body.nutrition || {};
  const nutritionValues = ['calories', 'proteins', 'carbs', 'fats'].map((key) => {
    const value = nutrition[key] === undefined || nutrition[key] === '' ? 0 : Number(nutrition[key]);
    return Number.isFinite(value) && value >= 0 ? value : null;
  });
  if (nutritionValues.some((value) => value === null)) return res.status(400).json({ error: 'Nutrition values must be positive numbers.' });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO meals (id, user_id, meal_date, meal_time, meal_text, calories, proteins, carbs, fats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id, date, time, text, ...nutritionValues);
  return res.status(201).json(mealFromRow(db.prepare('SELECT * FROM meals WHERE id = ?').get(id)));
});

app.patch('/api/meals/:id', requireAuth, (req, res) => {
  const nutrition = req.body.nutrition || {};
  const values = ['calories', 'proteins', 'carbs', 'fats'].map((key) => Number(nutrition[key]));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return res.status(400).json({ error: 'Nutrition values are invalid.' });
  const result = db.prepare(`UPDATE meals SET calories = ?, proteins = ?, carbs = ?, fats = ? WHERE id = ? AND user_id = ?`).run(...values, req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Meal not found.' });
  return res.json(mealFromRow(db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id)));
});

app.delete('/api/meals/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM meals WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return res.json({ ok: true });
});

const nutritionPrompt = (meal) => `calories, proteins, carbs and fats in this meal:\n${meal.trim()}`;

function normalizeNutrition(value) {
  return ['calories', 'proteins', 'carbs', 'fats'].reduce((result, key) => {
    const amount = Number(value[key]);
    result[key] = Number.isFinite(amount) ? Math.max(0, Math.round(amount * 10) / 10) : 0;
    return result;
  }, {});
}

async function retryTransient(request, attempts = 2) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      const transient = /429|500|503|high demand|temporarily unavailable/i.test(error.message || '');
      if (!transient || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
}

// Some OpenAI models only accept the default temperature of 1.
function openAITemperature(model) {
  return /luna|sol/i.test(model || '') ? 1 : 0;
}

async function estimateWithProvider(meal) {
  const provider = (process.env.AI_PROVIDER || 'google').toLowerCase();
  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model,
      temperature: openAITemperature(model),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'The meal description may be in English or Romanian. Return only a JSON object with numeric keys: calories, proteins, carbs, fats. Estimate the total for the meal.' },
        { role: 'user', content: nutritionPrompt(meal) },
      ],
    });
    return {
      model,
      nutrition: normalizeNutrition(JSON.parse(completion.choices[0]?.message?.content || '{}')),
      usage: completion.usage || {},
    };
  }

  if (provider === 'google') {
    if (!process.env.GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY is not configured.');
    const model = process.env.GOOGLE_AI_MODEL || 'gemini-3.5-flash-lite';
    const client = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const generativeModel = client.getGenerativeModel({
      model,
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    });
    const result = await retryTransient(() => generativeModel.generateContent([
      'The meal description may be in English or Romanian. Return only a JSON object with numeric keys: calories, proteins, carbs, fats. Estimate the total for the meal.',
      nutritionPrompt(meal),
    ]));
    const response = result.response;
    const usage = response.usageMetadata || {};
    return {
      model,
      nutrition: normalizeNutrition(JSON.parse(response.text() || '{}')),
      usage: {
        prompt_tokens: usage.promptTokenCount || 0,
        completion_tokens: usage.candidatesTokenCount || 0,
        total_tokens: usage.totalTokenCount || 0,
      },
    };
  }

  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

app.post('/api/estimate', requireAuth, async (req, res) => {
  const { meal, mealId } = req.body;
  if (!meal || typeof meal !== 'string' || !meal.trim()) return res.status(400).json({ error: 'Add some food before estimating.' });

  try {
    const result = await estimateWithProvider(meal);
    const ownedMeal = mealId && db.prepare('SELECT id FROM meals WHERE id = ? AND user_id = ?').get(mealId, req.user.id);
    db.prepare(`
      INSERT INTO token_usage (user_id, meal_id, model, prompt_tokens, completion_tokens, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      ownedMeal ? mealId : null,
      result.model,
      Number(result.usage.prompt_tokens) || 0,
      Number(result.usage.completion_tokens) || 0,
      Number(result.usage.total_tokens) || 0,
    );
    return res.json(result.nutrition);
  } catch (error) {
    console.error('Estimate failed:', error.message);
    const transient = /429|500|503|high demand|temporarily unavailable/i.test(error.message || '');
    return res.status(transient ? 503 : 500).json({ error: transient ? 'The AI service is busy. Please try again in a moment.' : 'The estimate could not be completed.' });
  }
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => res.sendFile(path.join(distPath, 'index.html')));

app.listen(port, () => console.log(`API server listening on http://localhost:${port}`));
