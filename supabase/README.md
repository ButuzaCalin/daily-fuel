# AI proxy (Supabase)

An edge function that estimates meal nutrition and daily goal targets with OpenAI, so the API key stays on the server. Each user gets 7 AI requests per day (resets at midnight UTC). A failed estimate doesn't count against the limit.

## Setup

```sh
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                                   # creates proxy_users, ai_requests, claim_ai_request()
supabase secrets set OPENAI_API_KEY=<key> OPENAI_MODEL=gpt-4o-mini ALLOWED_ORIGIN=https://dailyfuel.shop
supabase functions deploy estimate --no-verify-jwt # the Authorization header carries the user's access key, not a Supabase JWT
```

`ALLOWED_ORIGIN` is the site allowed to call the function: scheme + host, no trailing slash. Separate several with commas, e.g. `https://dailyfuel.shop,https://www.dailyfuel.shop,http://localhost:5173`.

The app sends meal estimates as `{ username, meals: [...] }` and goal suggestions as `{ username, goalProfile: { sex, age, height, weight, activity, objective } }`; goal-profile height is in cm and weight is in kg. Each call uses one daily request, regardless of the number of returned values. Quota checks use `{ username, action: "quota" }` and do not consume a request.

## Add a user

The easy way generates the key, the SQL and a one-tap setup link:

```sh
PROXY_URL=https://<your-project-ref>.supabase.co/functions/v1/estimate APP_URL=https://dailyfuel.shop \
  npm run proxy-user -- florin 20   # daily limit is optional (default 7)
```

Run the printed SQL in the SQL editor, then send the user the setup link. Running it again for the same username replaces their key.

By hand (the access key is stored as a SHA-256 hash):

```sql
insert into public.proxy_users (username, access_key_hash)
values ('florin', encode(sha256('choose-a-long-random-key'::bytea), 'hex'));

-- Give one user a different limit:
update public.proxy_users set daily_limit = 20 where username = 'florin';
```

The access key is required: `access_key_hash` can't be null, and the function rejects requests without a matching key.

## App settings

The user opens the setup link (`/#setup=DF1.…`). The app saves the proxy settings and checks them against the quota endpoint.

- **Android / desktop Chrome, Edge, Samsung Internet, Firefox**: the installed app shares the browser's storage, so it's already set up after install.
- **iPhone, iPad, Safari "Add to Dock"**: the Home Screen app has its own storage. The app shows a dialog to copy the setup code. After installing, the user taps **Paste setup code** on the home screen card or in Settings → AI.

Manual fallback: Settings → AI → Setup code → *Enter details manually*:

- **Proxy URL**: `https://<your-project-ref>.supabase.co/functions/v1/estimate`
- **Username**: the username from `proxy_users`
- **Access key**: the plain key you hashed above
