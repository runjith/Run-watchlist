-- Read-only checks. No portfolio numbers or research text are returned.
-- 1: 21 rows. All rls_enabled=true, anon_read=false, anon_write=false,
-- owner_boundary=true. A missing table must be investigated.
with private_tables(name) as (values
 ('companies'),('company_thesis'),('research_checklist_items'),('valuation_snapshots'),
 ('investment_decisions'),('key_facts'),('catalysts'),('risks'),('open_questions'),
 ('tasks'),('company_reviews'),('research_files'),('research_updates'),('watchlists'),
 ('watchlist_items'),('transactions'),('portfolio_settings'),('ipo_persons'),
 ('ipo_categories'),('ipos'),('ipo_applications'))
select p.name,c.relrowsecurity as rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') as anon_read,
 has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') as anon_write,
 exists(select 1 from pg_policies x where x.schemaname='public' and x.tablename=p.name
 and x.policyname='workspace_owner_boundary' and x.permissive='RESTRICTIVE') as owner_boundary
from private_tables p left join pg_class c on c.oid=to_regclass('public.'||p.name) order by p.name;

-- 2: Four rows, rls_enabled=true and anon_read=false.
select c.relname,c.relrowsecurity as rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') as anon_read
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('workspace_owners','guest_access','shared_companies','shared_research');

-- 3: Normally one owner. Zero = registration unfinished.
select count(*) as registered_owners from public.workspace_owners;
-- 4: public=false. Empty result means missing bucket.
select id,public from storage.buckets where id='research-files';
-- 5: Four original owner policies + both workspace_storage boundaries, which must
-- be RESTRICTIVE. Review additional policies before enabling guests.
select policyname,permissive,roles,cmd,qual,with_check from pg_policies
where schemaname='storage' and tablename='objects';
-- 6: Fixed empty search_path; anon_execute=false.
select p.proname,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='run_grant_guest';
-- 7: Inventory all public tables/views. Unexpected objects are NOT covered
-- by the source-code review. Views can bypass underlying table RLS.
select c.relname,c.relkind,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') as anon_read,
 has_table_privilege('authenticated',c.oid,'SELECT') as signed_in_read
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','v','m') order by c.relname;
-- 8: Inventory privileged functions, including ones created outside the repo.
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as signed_in_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef order by p.proname;
