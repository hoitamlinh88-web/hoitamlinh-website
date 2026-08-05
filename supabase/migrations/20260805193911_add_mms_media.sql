alter table public.message_campaigns add column if not exists media_url text;

alter table public.message_campaigns drop constraint if exists message_campaigns_channel_check;
alter table public.message_campaigns add constraint message_campaigns_channel_check
check (channel in ('sms', 'mms', 'email'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-media', 'message-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read message media" on storage.objects;
drop policy if exists "Admins can upload message media" on storage.objects;
drop policy if exists "Admins can update message media" on storage.objects;
drop policy if exists "Admins can delete message media" on storage.objects;

create policy "Public can read message media" on storage.objects for select to anon, authenticated
using (bucket_id = 'message-media');
create policy "Admins can upload message media" on storage.objects for insert to authenticated
with check (bucket_id = 'message-media' and (select private.current_user_role()) = 'admin');
create policy "Admins can update message media" on storage.objects for update to authenticated
using (bucket_id = 'message-media' and (select private.current_user_role()) = 'admin')
with check (bucket_id = 'message-media' and (select private.current_user_role()) = 'admin');
create policy "Admins can delete message media" on storage.objects for delete to authenticated
using (bucket_id = 'message-media' and (select private.current_user_role()) = 'admin');
