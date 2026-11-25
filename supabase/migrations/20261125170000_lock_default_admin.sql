-- The default account always stays an active admin: nobody (not even another
-- admin) can change its role, deactivate it, change its email, or delete it.
create or replace function private.is_default_admin_email(value text)
returns boolean language sql immutable set search_path = '' as $$
  select lower(coalesce(value, '')) = 'ryantranusvn@gmail.com'
$$;

create or replace function private.protect_profile_privileges()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_default_admin_email(old.email)
     and (new.role is distinct from 'admin'
          or new.is_active is distinct from true
          or not private.is_default_admin_email(new.email)) then
    raise exception 'Tài khoản mặc định không thể đổi vai trò, trạng thái hoặc email.';
  end if;
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and coalesce(private.current_user_role(), '') <> 'admin' then
    raise exception 'Only administrators can change roles or account status';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.protect_default_admin_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_default_admin_email(old.email) then
    raise exception 'Tài khoản mặc định không thể xóa.';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_default_admin_delete on public.profiles;
create trigger protect_default_admin_delete before delete on public.profiles
for each row execute function private.protect_default_admin_delete();
