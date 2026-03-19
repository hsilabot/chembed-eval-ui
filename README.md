# chembed-eval-ui

Expert review UI for ChEmbed datasets.

## Quickstart

```bash
cp .env.example .env.local
# fill env vars
npm install

# local one-time ingestion (uses SUPABASE_SERVICE_ROLE_KEY)
npm run ingest

npm run dev
```

## Notes
- Frontend-only: the app talks directly to Supabase via `@supabase/supabase-js`.
- Use Supabase Auth (email/password) + Row Level Security (RLS) on tables.
