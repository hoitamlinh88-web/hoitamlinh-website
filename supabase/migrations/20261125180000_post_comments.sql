-- Comments on published posts. Anyone can read them; any signed-in, active
-- account (member, monitor or admin) can comment when the post allows it.
-- People delete their own comments; admins can delete any comment.
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default '' check (char_length(author_name) <= 120),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_content_idx on public.post_comments(content_id, created_at);

-- The author name always comes from the commenter's own profile.
create or replace function private.post_comments_fill_author()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.author_id := auth.uid();
  select coalesce(nullif(btrim(p.display_name), ''), split_part(coalesce(p.email, ''), '@', 1), 'Hội viên')
    into new.author_name
    from public.profiles p where p.id = new.author_id;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function private.post_comments_fill_author() from public;

drop trigger if exists post_comments_fill_author on public.post_comments;
create trigger post_comments_fill_author before insert on public.post_comments
for each row execute function private.post_comments_fill_author();

alter table public.post_comments enable row level security;
grant select on public.post_comments to anon, authenticated;
grant insert, delete on public.post_comments to authenticated;

drop policy if exists "Anyone can read comments on published posts" on public.post_comments;
create policy "Anyone can read comments on published posts" on public.post_comments
for select to anon, authenticated using (
  exists (select 1 from public.content_items c where c.id = content_id and c.status = 'published')
);

drop policy if exists "Active accounts can comment" on public.post_comments;
create policy "Active accounts can comment" on public.post_comments
for insert to authenticated with check (
  (select private.current_user_role()) is not null
  and exists (select 1 from public.content_items c where c.id = content_id and c.status = 'published' and c.comments_enabled)
);

drop policy if exists "Authors and admins can delete comments" on public.post_comments;
create policy "Authors and admins can delete comments" on public.post_comments
for delete to authenticated using (
  author_id = (select auth.uid()) or (select private.current_user_role()) = 'admin'
);
