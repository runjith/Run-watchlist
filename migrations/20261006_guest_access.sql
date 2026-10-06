-- Run AFTER supabase-schema.sql, in the Supabase SQL Editor.
-- Then explicitly register YOUR existing auth user UUID using UPDATE_GUIDE.md.
-- Until registration, everyone is denied private workspace access (fail closed).
begin;

create table if not exists public.workspace_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.workspace_owners enable row level security;
revoke all on public.workspace_owners from public, anon, authenticated;
grant select on public.workspace_owners to authenticated;
drop policy if exists self_read on public.workspace_owners;
create policy self_read on public.workspace_owners for select to authenticated using (user_id = (select auth.uid()));

-- A restrictive policy intersects ALL existing permissive policies, including
-- obsolete policies from earlier versions. Guests cannot read OR write originals.
do $$
declare t text;
begin
  foreach t in array array['companies','company_thesis','research_checklist_items',
    'valuation_snapshots','investment_decisions','key_facts','catalysts','risks',
    'open_questions','tasks','company_reviews','research_files','research_updates',
    'watchlists','watchlist_items','transactions','portfolio_settings',
    'ipo_persons','ipo_categories','ipos','ipo_applications'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, delete on public.%I to authenticated', t);
    if t <> all(array['company_thesis','valuation_snapshots','investment_decisions','research_updates']) then
      execute format('grant update on public.%I to authenticated', t);
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists workspace_owner_boundary on public.%I', t);
    execute format('create policy workspace_owner_boundary on public.%I as restrictive for all to authenticated
      using (owner_id = (select auth.uid()) and exists (select 1 from public.workspace_owners where user_id = (select auth.uid())))
      with check (owner_id = (select auth.uid()) and exists (select 1 from public.workspace_owners where user_id = (select auth.uid())))', t);
  end loop;
  if to_regclass('public.companies_v1_backup') is not null then
    revoke all on public.companies_v1_backup from public, anon, authenticated;
    alter table public.companies_v1_backup enable row level security;
  end if;
end $$;

-- Keep other buckets unchanged. Research bucket requires a registered owner.
drop policy if exists workspace_storage_boundary on storage.objects;
create policy workspace_storage_boundary on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'research-files' or (
    (storage.foldername(name))[1] = (select auth.uid())::text and
    exists (select 1 from public.workspace_owners where user_id = (select auth.uid()))))
  with check (bucket_id <> 'research-files' or (
    (storage.foldername(name))[1] = (select auth.uid())::text and
    exists (select 1 from public.workspace_owners where user_id = (select auth.uid()))));
drop policy if exists workspace_storage_anon_boundary on storage.objects;
create policy workspace_storage_anon_boundary on storage.objects as restrictive for all to anon
  using (bucket_id <> 'research-files') with check (bucket_id <> 'research-files');
update storage.buckets set public = false where id = 'research-files';

create table if not exists public.guest_access (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.workspace_owners(user_id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '',
  can_watchlist boolean not null default false,
  can_research boolean not null default false,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner_id, guest_id),
  check(owner_id <> guest_id)
);
create table if not exists public.shared_companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.workspace_owners(user_id) on delete cascade,
  company_id uuid not null,
  name text not null check(length(btrim(name)) between 1 and 300),
  ticker text not null default '',
  sector text not null default '',
  research_status text not null default 'watch' check(research_status in ('watch','researching','researched')),
  updated_at timestamptz not null default now(),
  unique(owner_id, company_id),
  foreign key(company_id, owner_id) references public.companies(id, owner_id) on delete cascade
);
create table if not exists public.shared_research (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.workspace_owners(user_id) on delete cascade,
  company_id uuid not null,
  title text not null check(length(btrim(title)) between 1 and 300),
  body text not null check(length(btrim(body)) between 1 and 200000),
  updated_at timestamptz not null default now(),
  unique(owner_id, company_id),
  foreign key(company_id, owner_id) references public.companies(id, owner_id) on delete cascade
);

-- No public reads, no guest writes; each content type has its own permission.
do $$
declare t text;
begin
  foreach t in array array['guest_access','shared_companies','shared_research'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
    execute format('drop policy if exists owner_manage on public.%I',t);
    execute format('create policy owner_manage on public.%I for all to authenticated
      using (owner_id = (select auth.uid()) and exists (select 1 from public.workspace_owners where user_id = (select auth.uid())))
      with check (owner_id = (select auth.uid()) and exists (select 1 from public.workspace_owners where user_id = (select auth.uid())))',t);
    execute format('drop trigger if exists run_touch_updated_at on public.%I',t);
    if t <> 'guest_access' then
      execute format('create trigger run_touch_updated_at before update on public.%I for each row execute function public.run_touch_updated_at()',t);
    end if;
  end loop;
end $$;
drop policy if exists guest_self on public.guest_access;
create policy guest_self on public.guest_access for select to authenticated using (guest_id = (select auth.uid()));
drop policy if exists guest_read on public.shared_companies;
create policy guest_read on public.shared_companies for select to authenticated using (
  exists (select 1 from public.guest_access g where g.owner_id = shared_companies.owner_id
    and g.guest_id = (select auth.uid()) and g.active and g.can_watchlist
    and (g.expires_at is null or g.expires_at > now())));
drop policy if exists guest_read on public.shared_research;
create policy guest_read on public.shared_research for select to authenticated using (
  exists (select 1 from public.guest_access g where g.owner_id = shared_research.owner_id
    and g.guest_id = (select auth.uid()) and g.active and g.can_research
    and (g.expires_at is null or g.expires_at > now())));

-- The one privileged function resolves an EXISTING user's email. It cannot
-- create accounts, send invitations, set passwords, or grant owner privileges.
create or replace function public.run_grant_guest(guest_email text, display_label text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare gid uuid; result uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.workspace_owners where user_id = auth.uid()) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  select id into gid from auth.users where lower(email) = lower(btrim(guest_email));
  if gid is null then raise exception 'Create this guest account in Supabase Authentication first.'; end if;
  if gid = auth.uid() or exists(select 1 from public.workspace_owners where user_id = gid) then
    raise exception 'Choose a guest account, not an owner account.';
  end if;
  insert into public.guest_access(owner_id,guest_id,label,can_watchlist,can_research)
    values(auth.uid(),gid,left(coalesce(nullif(btrim(display_label),''),btrim(guest_email)),300),false,false)
    on conflict(owner_id,guest_id) do update set label=excluded.label
    returning id into result;
  return result;
end $$;
revoke all on function public.run_grant_guest(text,text) from public,anon,authenticated;
grant execute on function public.run_grant_guest(text,text) to authenticated;
commit;
