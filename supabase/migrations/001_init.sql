-- 001_init.sql
-- Minimal schema for chembed-eval-ui
-- Apply in Supabase SQL editor (or via supabase CLI if you use it).

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- review_items: stores the raw JSONL row in payload
create table if not exists public.review_items (
  id uuid primary key default gen_random_uuid(),
  task_type text not null check (task_type in ('training','evaluation')),
  subtask text not null,
  source_file text,
  payload jsonb not null,
  order_index int not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- profiles: gate who can submit reviews (and future admin roles)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_review boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- reviews: expert feedback
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.review_items(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  -- common
  answerability boolean,
  query_quality int,
  standalone_clarity int,
  note text,

  -- task A
  scientific_validity int,

  -- task B
  top10_relevance int,
  near_miss boolean
);

create index if not exists idx_review_items_task_subtask on public.review_items(task_type, subtask);
create index if not exists idx_reviews_item on public.reviews(item_id);
create index if not exists idx_reviews_reviewer on public.reviews(reviewer_id);

-- RLS
alter table public.review_items enable row level security;
alter table public.profiles enable row level security;
alter table public.reviews enable row level security;

-- Policies (tight, safe defaults)
-- profiles
-- - Anyone logged in can see profiles (needed to show role badges later).
create policy if not exists "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

-- review_items: any authenticated user can read
create policy if not exists "review_items_select_authenticated"
on public.review_items
for select
to authenticated
using (true);

-- reviews:
-- - Any authenticated user can READ all reviews ("public")
-- - Only users with profiles.can_review=true can WRITE reviews
create policy if not exists "reviews_select_authenticated"
on public.reviews
for select
to authenticated
using (true);

create policy if not exists "reviews_insert_if_can_review"
on public.reviews
for insert
to authenticated
with check (
  auth.uid() = reviewer_id
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.can_review = true
  )
);

create policy if not exists "reviews_update_if_can_review"
on public.reviews
for update
to authenticated
using (
  auth.uid() = reviewer_id
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.can_review = true
  )
)
with check (
  auth.uid() = reviewer_id
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.can_review = true
  )
);

create policy if not exists "reviews_delete_if_can_review"
on public.reviews
for delete
to authenticated
using (
  auth.uid() = reviewer_id
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.can_review = true
  )
);
