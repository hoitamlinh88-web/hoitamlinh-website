-- Public SMS opt-in form (dang-ky-sms.html) writes here. Anyone can insert a
-- signup with consent; only admins can read or remove them.
create table if not exists public.sms_signups (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  phone text not null check (phone ~ '^\+1[0-9]{10}$'),
  consent boolean not null check (consent = true),
  consent_text text not null check (char_length(consent_text) <= 1000),
  source text not null default 'website' check (source in ('website', 'paper', 'admin')),
  page_url text check (char_length(page_url) <= 500),
  user_agent text check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);
create index if not exists sms_signups_phone_idx on public.sms_signups(phone);

alter table public.sms_signups enable row level security;

grant insert on public.sms_signups to anon, authenticated;
grant select, delete on public.sms_signups to authenticated;

drop policy if exists "Anyone can sign up with consent" on public.sms_signups;
create policy "Anyone can sign up with consent" on public.sms_signups
for insert to anon, authenticated
with check (consent = true);

drop policy if exists "Admins can read signups" on public.sms_signups;
create policy "Admins can read signups" on public.sms_signups
for select to authenticated
using ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can delete signups" on public.sms_signups;
create policy "Admins can delete signups" on public.sms_signups
for delete to authenticated
using ((select private.current_user_role()) = 'admin');
