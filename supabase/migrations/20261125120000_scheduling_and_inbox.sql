-- Scheduled sends can be canceled, and recipients can sit in "scheduled".
alter table public.message_campaigns drop constraint if exists message_campaigns_status_check;
alter table public.message_campaigns add constraint message_campaigns_status_check
check (status in ('draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'canceled'));

alter table public.message_recipients drop constraint if exists message_recipients_status_check;
alter table public.message_recipients add constraint message_recipients_status_check
check (status in ('pending', 'scheduled', 'sent', 'delivered', 'failed', 'opted_out', 'canceled'));

create index if not exists message_recipients_provider_id_idx on public.message_recipients(provider_message_id);

-- Inbox: texts members send to the Hội number (direction 'in') and the
-- one-off replies admins send back from the inbox (direction 'out').
create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')),
  phone text not null,              -- the member's number, E.164 (+1XXXXXXXXXX)
  body text not null default '',
  media_urls text[] not null default '{}',
  member_id uuid references public.members(id) on delete set null,
  provider_message_id text unique,
  status text,
  is_read boolean not null default false,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sms_messages_phone_idx on public.sms_messages(phone, created_at desc);
create index if not exists sms_messages_unread_idx on public.sms_messages(is_read) where direction = 'in';

alter table public.sms_messages enable row level security;
grant select, update, delete on public.sms_messages to authenticated;

drop policy if exists "Admins can read inbox" on public.sms_messages;
create policy "Admins can read inbox" on public.sms_messages
for select to authenticated using ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can mark inbox read" on public.sms_messages;
create policy "Admins can mark inbox read" on public.sms_messages
for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

drop policy if exists "Admins can delete inbox messages" on public.sms_messages;
create policy "Admins can delete inbox messages" on public.sms_messages
for delete to authenticated using ((select private.current_user_role()) = 'admin');
