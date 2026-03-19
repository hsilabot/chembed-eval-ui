-- 002_reviews_unique_item_reviewer.sql
-- Ensure each reviewer has at most one review row per item.

with ranked as (
  select
    id,
    row_number() over (
      partition by item_id, reviewer_id
      order by created_at desc, id desc
    ) as rn
  from public.reviews
)
delete from public.reviews r
using ranked x
where r.id = x.id
  and x.rn > 1;

alter table public.reviews
  add constraint reviews_item_id_reviewer_id_key unique (item_id, reviewer_id);
