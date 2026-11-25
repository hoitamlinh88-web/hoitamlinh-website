-- member_groups already existed with a required, unique "slug" column that the
-- admin page does not send. Fill it in automatically, and let admins delete groups.
create or replace function private.member_groups_fill_slug()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := coalesce(nullif(btrim(regexp_replace(lower(new.name), '[^[:alnum:]]+', '-', 'g'), '-'), ''), 'group')
      || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  end if;
  return new;
end;
$$;

drop trigger if exists member_groups_fill_slug on public.member_groups;
create trigger member_groups_fill_slug
before insert on public.member_groups
for each row execute function private.member_groups_fill_slug();

grant delete on public.member_groups to authenticated;
