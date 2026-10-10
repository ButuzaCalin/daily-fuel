// Creates a proxy user's access key and prints the SQL to add them plus the setup link to send them.
// Usage: PROXY_URL=https://<ref>.supabase.co/functions/v1/estimate APP_URL=https://dailyfuel.shop npm run proxy-user -- <username> [daily limit]
import crypto from 'node:crypto';
import { encodeSetupCode } from '../src/features/ai/setupCode.js';

const [username, limit] = process.argv.slice(2);
const proxyUrl = process.env.PROXY_URL;
const appUrl = (process.env.APP_URL || 'https://dailyfuel.shop').replace(/\/+$/, '');
if (!username || !proxyUrl) {
  console.error('Usage: PROXY_URL=<estimate function URL> [APP_URL=<app URL>] npm run proxy-user -- <username> [daily limit]');
  process.exit(1);
}

const key = crypto.randomBytes(24).toString('base64url');
const hash = crypto.createHash('sha256').update(key).digest('hex');
const code = encodeSetupCode({ proxyUrl, proxyUsername: username, proxyKey: key });
const sqlName = username.replace(/'/g, "''");

console.log(`-- Run in the Supabase SQL editor:
insert into public.proxy_users (username, access_key_hash${limit ? ', daily_limit' : ''})
values ('${sqlName}', '${hash}'${limit ? `, ${Number(limit)}` : ''})
on conflict (username) do update set access_key_hash = excluded.access_key_hash${limit ? ', daily_limit = excluded.daily_limit' : ''};

Setup link (send this to ${username}):
${appUrl}/#setup=${code}

Setup code (if they need to paste it):
${code}`);
