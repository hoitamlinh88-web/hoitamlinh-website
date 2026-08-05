alter table public.members
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists date_of_birth date,
  add column if not exists address text;

update public.members
set
  first_name = coalesce(first_name, split_part(trim(full_name), ' ', 1)),
  last_name = coalesce(last_name, nullif(trim(regexp_replace(trim(full_name), '^\S+\s*', '')), ''))
where first_name is null or last_name is null;

create index if not exists members_name_idx on public.members(last_name, first_name);
