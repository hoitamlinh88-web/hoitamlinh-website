-- Named member groups managed by admins. A member's groups are stored as
-- group names in members.tags, so one member can belong to many groups.
create table if not exists public.member_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table public.member_groups enable row level security;
grant select, insert, update, delete on public.member_groups to authenticated;

drop policy if exists "Admins can manage member groups" on public.member_groups;
create policy "Admins can manage member groups" on public.member_groups
for all to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

-- Keep any groups that were already typed into members.tags.
insert into public.member_groups (name)
select distinct trim(tag) from public.members, unnest(tags) as tag
where trim(tag) <> ''
on conflict (name) do nothing;
