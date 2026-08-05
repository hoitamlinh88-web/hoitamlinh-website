create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  phone text,
  role text not null default 'member' check (role in ('admin','monitor','member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.current_user_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active = true limit 1
$$;
revoke all on function private.current_user_role() from public;
grant execute on function private.current_user_role() to authenticated;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))
  ) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.protect_profile_privileges()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and coalesce(private.current_user_role(), '') <> 'admin' then
    raise exception 'Only administrators can change roles or account status';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.protect_profile_privileges() from public;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges before update on public.profiles
for each row execute function private.protect_profile_privileges();

alter table public.content_items
  add column if not exists author_id uuid references auth.users(id) on delete set null,
  add column if not exists status text not null default 'published',
  add column if not exists featured boolean not null default false,
  add column if not exists comments_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'content_items_status_check'
    and conrelid = 'public.content_items'::regclass
  ) then
    alter table public.content_items add constraint content_items_status_check
    check (status in ('draft','review','published'));
  end if;
end
$$;

create index if not exists content_items_author_id_idx on public.content_items(author_id);
create index if not exists content_items_status_idx on public.content_items(status);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  tags text[] not null default '{}',
  sms_opt_in boolean not null default false,
  email_opt_in boolean not null default true,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists members_phone_idx on public.members(phone);
create index if not exists members_email_idx on public.members(email);

create table if not exists public.message_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  channel text not null default 'sms' check (channel in ('sms','email')),
  audience_filter jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','queued','sending','sent','failed')),
  scheduled_at timestamptz,
  provider text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_campaigns_status_idx on public.message_campaigns(status);
create index if not exists message_campaigns_created_by_idx on public.message_campaigns(created_by);

create table if not exists public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.message_campaigns(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  destination text not null,
  status text not null default 'pending' check (status in ('pending','sent','delivered','failed','opted_out')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, member_id)
);
create index if not exists message_recipients_campaign_id_idx on public.message_recipients(campaign_id);
create index if not exists message_recipients_member_id_idx on public.message_recipients(member_id);

alter table public.profiles enable row level security;
alter table public.content_items enable row level security;
alter table public.members enable row level security;
alter table public.message_campaigns enable row level security;
alter table public.message_recipients enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.members from anon, authenticated;
revoke all on public.message_campaigns from anon, authenticated;
revoke all on public.message_recipients from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.message_campaigns to authenticated;
grant select, insert, update, delete on public.message_recipients to authenticated;
grant select on public.content_items to anon;
grant select, insert, update, delete on public.content_items to authenticated;

drop policy if exists "Public can read content" on public.content_items;
drop policy if exists "Anonymous can read published content" on public.content_items;
drop policy if exists "Authenticated content access" on public.content_items;
drop policy if exists "Staff can create content" on public.content_items;
drop policy if exists "Staff can update content" on public.content_items;
drop policy if exists "Staff can delete content" on public.content_items;

create policy "Anonymous can read published content" on public.content_items
for select to anon using (status = 'published');
create policy "Authenticated content access" on public.content_items
for select to authenticated using (
  status = 'published' or (select private.current_user_role()) in ('admin','monitor')
);
create policy "Staff can create content" on public.content_items
for insert to authenticated with check (
  (select private.current_user_role()) = 'admin'
  or ((select private.current_user_role()) = 'monitor' and author_id = (select auth.uid()))
);
create policy "Staff can update content" on public.content_items
for update to authenticated using (
  (select private.current_user_role()) = 'admin'
  or ((select private.current_user_role()) = 'monitor' and author_id = (select auth.uid()))
) with check (
  (select private.current_user_role()) = 'admin'
  or ((select private.current_user_role()) = 'monitor' and author_id = (select auth.uid()))
);
create policy "Staff can delete content" on public.content_items
for delete to authenticated using (
  (select private.current_user_role()) = 'admin'
  or ((select private.current_user_role()) = 'monitor' and author_id = (select auth.uid()))
);

drop policy if exists "Profile read access" on public.profiles;
drop policy if exists "Profile update access" on public.profiles;
create policy "Profile read access" on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.current_user_role()) = 'admin');
create policy "Profile update access" on public.profiles for update to authenticated
using (id = (select auth.uid()) or (select private.current_user_role()) = 'admin')
with check (id = (select auth.uid()) or (select private.current_user_role()) = 'admin');

drop policy if exists "Admins can manage members" on public.members;
create policy "Admins can manage members" on public.members for all to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can manage campaigns" on public.message_campaigns;
create policy "Admins can manage campaigns" on public.message_campaigns for all to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin' and created_by = (select auth.uid()));

drop policy if exists "Admins can manage recipients" on public.message_recipients;
create policy "Admins can manage recipients" on public.message_recipients for all to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images','post-images',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read post images" on storage.objects;
drop policy if exists "Staff can upload post images" on storage.objects;
drop policy if exists "Staff can update post images" on storage.objects;
drop policy if exists "Staff can delete post images" on storage.objects;
create policy "Public can read post images" on storage.objects for select to anon, authenticated
using (bucket_id = 'post-images');
create policy "Staff can upload post images" on storage.objects for insert to authenticated
with check (
  bucket_id = 'post-images'
  and (select private.current_user_role()) in ('admin','monitor')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Staff can update post images" on storage.objects for update to authenticated
using (
  bucket_id = 'post-images'
  and ((select private.current_user_role()) = 'admin' or owner_id = (select auth.uid())::text)
) with check (
  bucket_id = 'post-images'
  and ((select private.current_user_role()) = 'admin' or owner_id = (select auth.uid())::text)
);
create policy "Staff can delete post images" on storage.objects for delete to authenticated
using (
  bucket_id = 'post-images'
  and ((select private.current_user_role()) = 'admin' or owner_id = (select auth.uid())::text)
);
