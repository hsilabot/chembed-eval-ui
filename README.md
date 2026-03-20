# chembed-eval-ui

Expert review UI for ChEmbed training and evaluation datasets.

## Quickstart

```bash
cp .env.example .env.local
# fill env vars
npm install
```

## Database setup

Run these in Supabase SQL editor:

1. `supabase/scripts/init.sql`
2. If you have an older DB shape, apply any one-off inline patches you still need

## Ingestion

Dry run first:

```bash
npm run ingest:dry
```

Ingest both files:

```bash
npm run ingest
```

Or ingest one side only:

```bash
npm run ingest -- --task training
npm run ingest -- --task evaluation
```

## Run locally

```bash
npm run dev
```

## Reviewer flow

1. Open `/login` and sign in with Supabase email/password.
2. Go to `/review`.
3. Use the sidebar buckets:
   - Training Data (Task A): `chemrxiv`, `dolma`
   - Evaluation Data (Task B): `Successful`, `Unsuccessful`
4. Reviews autosave only after all required fields for the current item are filled.
5. Open **Guide** for the review rubric.
6. Export produces two files:
   - Task A CSV
   - Task B CSV

## Permissions

- `/review` and `/guide` require authentication.
- Users with `profiles.can_review=false` can browse items in read-only mode.
- Read-only users cannot edit fields or save reviews.

## Current schema overview

Main tables:
- `public.review_items`
- `public.profiles`
- `public.training_reviews`
- `public.evaluation_reviews`

Notes:
- review tables use composite primary key: `(item_id, reviewer_id)`
- evaluation reviews store:
  - `near_miss_ranks` as JSONB array
  - `retrieved_relevance` as JSONB object by rank

## Reset helpers

Available SQL helpers:
- `supabase/scripts/reset_reviews.sql`
- `supabase/scripts/reset_review_items.sql`
