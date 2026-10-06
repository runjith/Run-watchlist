-- Run AFTER 20261006_guest_access.sql. Edit the email ONLY in SQL Editor.
-- Never commit the edited copy containing your email to the public repository.
begin;
do $$
declare
  owner_email text := 'REPLACE_WITH_YOUR_OWNER_EMAIL';
  owner_user uuid;
begin
  if owner_email = 'REPLACE_WITH_YOUR_OWNER_EMAIL' then
    raise exception 'Replace the placeholder with your existing owner login email.';
  end if;
  select id into owner_user from auth.users where lower(email) = lower(btrim(owner_email));
  if owner_user is null then raise exception 'Account not found. Check Authentication > Users.'; end if;
  if exists(select 1 from public.guest_access where guest_id = owner_user) then
    raise exception 'That account is a guest. Choose your original owner login.';
  end if;
  insert into public.workspace_owners(user_id) values(owner_user) on conflict do nothing;
end $$;
commit;
