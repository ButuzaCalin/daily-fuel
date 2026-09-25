# AI proxy (Supabase)

An edge function that estimates meal nutrition with OpenAI, so the API key stays on the server. Each user gets 7 AI requests per day (resets at midnight UTC). A failed estimate doesn't count against the limit.

## Setup

```sh
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                                   # creates proxy_users, ai_requests, claim_ai_request()
supabase secrets set OPENAI_API_KEY=<key> OPENAI_MODEL=gpt-4o-mini ALLOWED_ORIGIN=https://dailyfuel.shop
supabase functions deploy estimate --no-verify-jwt # the Authorization header carries the user's access key, not a Supabase JWT
```

`ALLOWED_ORIGIN` is the site allowed to call the function: scheme + host, no trailing slash. Separate several with commas, e.g. `https://dailyfuel.shop,https://www.dailyfuel.shop,http://localhost:5173`.

## Add a user

Run in the SQL editor. The access key is stored as a SHA-256 hash:

```sql
insert into public.proxy_users (username, access_key_hash)
values ('florin', encode(sha256('choose-a-long-random-key'::bytea), 'hex'));

-- Give one user a different limit:
update public.proxy_users set daily_limit = 20 where username = 'florin';
```

Leaving `access_key_hash` null means anyone who knows the username can use that user's requests, so always set a key.

## App settings

Settings → AI config → Proxy Config:

- **Proxy URL**: `https://<your-project-ref>.supabase.co/functions/v1/estimate`
- **Username**: the username from `proxy_users`
- **Access key**: the plain key you hashed above
