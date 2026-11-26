-- Comments on the static "Chia sẻ" article pages (e.g. diem-tua.html). Those pages
-- are plain HTML with no content_items row, so a comment points at either a
-- published post (content_id) or a static page (page_slug), never both.
alter table public.post_comments alter column content_id drop not null;
alter table public.post_comments add column if not exists page_slug text;

alter table public.post_comments drop constraint if exists post_comments_page_slug_format;
alter table public.post_comments add constraint post_comments_page_slug_format
  check (page_slug is null or page_slug ~ '^[a-z0-9-]{1,120}$');

alter table public.post_comments drop constraint if exists post_comments_one_target;
alter table public.post_comments add constraint post_comments_one_target
  check ((content_id is null) <> (page_slug is null));

create index if not exists post_comments_page_idx on public.post_comments(page_slug, created_at) where page_slug is not null;

drop policy if exists "Anyone can read comments on published posts" on public.post_comments;
create policy "Anyone can read comments on published posts" on public.post_comments
for select to anon, authenticated using (
  page_slug is not null
  or exists (select 1 from public.content_items c where c.id = content_id and c.status = 'published')
);

drop policy if exists "Active accounts can comment" on public.post_comments;
create policy "Active accounts can comment" on public.post_comments
for insert to authenticated with check (
  (select private.current_user_role()) is not null
  and (
    (content_id is null and page_slug is not null)
    or exists (select 1 from public.content_items c where c.id = content_id and c.status = 'published' and c.comments_enabled)
  )
);
