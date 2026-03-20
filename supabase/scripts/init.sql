-- init.sql
-- Fresh schema for chembed-eval-ui

create extension if not exists "pgcrypto";

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

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.training_reviews (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.review_items(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  answerability boolean,
  specificity int,
  query_quality int,
  standalone_clarity int,
  scientific_validity int,
  note text,
  unique (item_id, reviewer_id)
);

create table if not exists public.evaluation_reviews (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.review_items(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  answerability boolean,
  specificity int,
  query_quality int,
  standalone_clarity int,
  top10_relevance int,
  near_miss_ranks jsonb,
  retrieved_relevance jsonb,
  note text,
  unique (item_id, reviewer_id)
);

create index if not exists idx_review_items_task_subtask on public.review_items(task_type, subtask);
create index if not exists idx_training_reviews_item on public.training_reviews(item_id);
create index if not exists idx_training_reviews_reviewer on public.training_reviews(reviewer_id);
create index if not exists idx_evaluation_reviews_item on public.evaluation_reviews(item_id);
create index if not exists idx_evaluation_reviews_reviewer on public.evaluation_reviews(reviewer_id);

alter table public.review_items enable row level security;
alter table public.profiles enable row level security;
alter table public.training_reviews enable row level security;
alter table public.evaluation_reviews enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "review_items_select_authenticated" on public.review_items;
drop policy if exists "training_reviews_select_authenticated" on public.training_reviews;
drop policy if exists "training_reviews_insert_if_can_review" on public.training_reviews;
drop policy if exists "training_reviews_update_if_can_review" on public.training_reviews;
drop policy if exists "training_reviews_delete_if_can_review" on public.training_reviews;
drop policy if exists "evaluation_reviews_select_authenticated" on public.evaluation_reviews;
drop policy if exists "evaluation_reviews_insert_if_can_review" on public.evaluation_reviews;
drop policy if exists "evaluation_reviews_update_if_can_review" on public.evaluation_reviews;
drop policy if exists "evaluation_reviews_delete_if_can_review" on public.evaluation_reviews;

create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

create policy "review_items_select_authenticated"
on public.review_items
for select
to authenticated
using (true);

create policy "training_reviews_select_authenticated"
on public.training_reviews
for select
to authenticated
using (true);

create policy "training_reviews_insert_if_can_review"
on public.training_reviews
for insert
to authenticated
with check (
  auth.uid() = reviewer_id
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.can_review = true
  )
);

create policy "training_reviews_update_if_can_review"
on public.training_reviews
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

create policy "training_reviews_delete_if_can_review"
on public.training_reviews
for delete
to authenticated
using (
  auth.uid() = reviewer_id
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.can_review = true
  )
);

create policy "evaluation_reviews_select_authenticated"
on public.evaluation_reviews
for select
to authenticated
using (true);

create policy "evaluation_reviews_insert_if_can_review"
on public.evaluation_reviews
for insert
to authenticated
with check (
  auth.uid() = reviewer_id
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.can_review = true
  )
);

create policy "evaluation_reviews_update_if_can_review"
on public.evaluation_reviews
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

create policy "evaluation_reviews_delete_if_can_review"
on public.evaluation_reviews
for delete
to authenticated
using (
  auth.uid() = reviewer_id
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.can_review = true
  )
);
