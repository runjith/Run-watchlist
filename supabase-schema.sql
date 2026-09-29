-- ============================================================
-- RUN WATCHLIST — Research Workspace database  (schema v4)
--
-- HOW TO USE THIS FILE
--   1. Supabase Dashboard → your project → SQL Editor → "+ New query".
--   2. Paste this ENTIRE file and press "Run".
--   3. You should see "Success. No rows returned".
--
-- It is safe to run this file again later (for example after an
-- update). It never deletes your research.
--
-- WHAT IT CREATES
--   companies                  one row per company you follow
--   company_thesis             every saved version of your thesis
--   research_checklist_items   the research checklist per company
--   key_facts                  key facts / observations
--   valuation_snapshots        every saved valuation (never overwritten)
--   investment_decisions       every decision you record (never overwritten)
--   catalysts, risks, open_questions, tasks
--   company_reviews            scheduled and completed reviews
--   research_files             uploaded files AND saved links (e.g. Google Drive)
--   research_updates           the research history timeline
--   watchlists, watchlist_items  your named watchlists and their companies
--   transactions               every buy and sell (drives the Portfolio page)
--   portfolio_settings         cash balance and portfolio preferences
--   ipo_persons, ipo_categories, ipos, ipo_applications
--                              the IPO tracker (people, categories, IPOs, applications)
--   Storage bucket "research-files" (PRIVATE) for uploaded documents
--
-- SECURITY MODEL
--   * Nobody can read or change anything without signing in.
--   * Every row belongs to the signed-in user who created it
--     (owner_id). A signed-in user can only ever see their own rows.
--   * Uploaded files live in a private bucket, inside a folder named
--     after the owner's user id. Only that user can open them.
--   * History tables (thesis versions, valuation snapshots, decisions,
--     research updates) can be added to and deleted, never edited,
--     so your past thinking cannot be silently rewritten.
-- ============================================================


-- ------------------------------------------------------------
SET client_min_messages = warning;

-- PART 0 — Retire the first prototype table (if it exists)
-- The prototype used a text id and let ANYONE add or edit rows.
-- It is renamed to companies_v1_backup, fully locked, and its rows
-- are carried into the new structure in PART 5.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies'
      and column_name = 'id' and data_type = 'text'
  ) then
    alter table public.companies rename to companies_v1_backup;
    alter index if exists public.companies_pkey rename to companies_v1_backup_pkey;
    drop policy if exists "Public can view companies"   on public.companies_v1_backup;
    drop policy if exists "Public can add companies"    on public.companies_v1_backup;
    drop policy if exists "Public can update companies" on public.companies_v1_backup;
    alter table public.companies_v1_backup enable row level security;
    revoke all on public.companies_v1_backup from anon, authenticated;
  end if;
end $$;


-- ------------------------------------------------------------
-- PART 1 — Helper: keep updated_at current automatically
-- ------------------------------------------------------------
create or replace function public.run_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ------------------------------------------------------------
-- PART 2 — Tables
-- Every table has owner_id. Child tables point at their company
-- with a (company_id, owner_id) foreign key, so a row can never be
-- attached to somebody else's company, and deleting a company
-- removes all of its research rows with it.
-- ------------------------------------------------------------

-- 2.1 Companies --------------------------------------------------
create table if not exists public.companies (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug                   text not null,                     -- e.g. "mm-forgings" (used in links)
  name                   text not null,
  ticker                 text not null default '',
  exchange               text not null default '',
  sector                 text not null default '',
  description            text not null default '',
  summary                text,                               -- one-line takeaway for the archive
  research_file          text,                               -- e.g. "research/mm-forgings.html" (lives in GitHub)
  research_status        text not null default 'watch'
                         check (research_status in ('watch','researching','researched')),
  research_started_on    date,
  research_completed_on  date,
  decision               text
                         check (decision in ('researching','watch','wait','buy','hold','avoid','sold','archived')),
  decision_date          date,
  current_price          numeric(18,4) check (current_price is null or current_price >= 0),
  price_currency         text not null default 'INR',
  price_as_of            date,
  price_source           text not null default 'manual',     -- ready for a market-data feed later
  checklist_seeded       boolean not null default false,
  added_on               date not null default current_date,
  last_activity_at       timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint companies_owner_slug_key unique (owner_id, slug),
  constraint companies_id_owner_key   unique (id, owner_id)
);
create index if not exists companies_owner_idx on public.companies (owner_id);

-- 2.2 Thesis (append-only: each save is a new version) ------------
create table if not exists public.company_thesis (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  version                integer not null,
  why_interested         text not null default '',
  thesis                 text not null default '',
  what_needs_to_happen   text not null default '',
  key_assumptions        text not null default '',
  what_changes_mind      text not null default '',
  confidence             smallint check (confidence between 1 and 5),
  change_note            text,
  created_at             timestamptz not null default now(),
  constraint company_thesis_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade,
  constraint company_thesis_version_key unique (company_id, version)
);
create index if not exists company_thesis_company_idx on public.company_thesis (company_id, version desc);

-- 2.3 Research checklist ------------------------------------------
create table if not exists public.research_checklist_items (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  title                  text not null,
  is_default             boolean not null default false,
  sort_order             integer not null default 0,
  completed              boolean not null default false,
  completed_on           date,
  notes                  text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint checklist_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade
);
create index if not exists checklist_company_idx on public.research_checklist_items (company_id, sort_order);

-- 2.4 Valuation snapshots (append-only) ---------------------------
create table if not exists public.valuation_snapshots (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  as_of                  date not null default current_date,
  currency               text not null default 'INR',
  price_at_snapshot      numeric(18,4),
  fair_value             numeric(18,4),
  base_target            numeric(18,4),
  bull_target            numeric(18,4),
  bear_target            numeric(18,4),
  entry_low              numeric(18,4),
  entry_high             numeric(18,4),
  stop_loss              numeric(18,4),
  invalidation_price     numeric(18,4),
  time_horizon           text not null default '',
  methods                jsonb not null default '[]'::jsonb,  -- [{method, basis, value}]
  method_notes           text not null default '',
  assumptions            text not null default '',
  change_note            text,
  created_at             timestamptz not null default now(),
  constraint valuation_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade,
  constraint valuation_methods_is_array check (jsonb_typeof(methods) = 'array')
);
create index if not exists valuation_company_idx on public.valuation_snapshots (company_id, created_at desc);

-- 2.5 Investment decisions (append-only) --------------------------
create table if not exists public.investment_decisions (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  decision               text not null
                         check (decision in ('researching','watch','wait','buy','hold','avoid','sold','archived')),
  decided_on             date not null default current_date,
  rationale              text not null default '',
  time_horizon           text not null default '',
  position_size_pct      numeric(7,3) check (position_size_pct is null or position_size_pct between 0 and 100),
  max_allocation_pct     numeric(7,3) check (max_allocation_pct is null or max_allocation_pct between 0 and 100),
  holding_status         text not null default 'not_held'
                         check (holding_status in ('not_held','holding','partial','exited')),
  price_at_decision      numeric(18,4),
  created_at             timestamptz not null default now(),
  constraint decision_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade
);
create index if not exists decision_company_idx on public.investment_decisions (company_id, created_at desc);

-- 2.6 Key facts / observations -----------------------------------
create table if not exists public.key_facts (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  fact                   text not null,
  detail                 text not null default '',
  source                 text not null default '',
  observed_on            date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint fact_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade
);
create index if not exists fact_company_idx on public.key_facts (company_id);

-- 2.7 Catalysts ----------------------------------------------------
create table if not exists public.catalysts (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  title                  text not null,
  description            text not null default '',
  expected_date          date,
  importance             text not null default 'medium' check (importance in ('low','medium','high')),
  status                 text not null default 'expected'
                         check (status in ('expected','occurred','delayed','cancelled')),
  notes                  text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint catalyst_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade
);
create index if not exists catalyst_company_idx on public.catalysts (company_id);

-- 2.8 Risks --------------------------------------------------------
create table if not exists public.risks (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  title                  text not null,
  description            text not null default '',
  severity               text not null default 'medium' check (severity in ('low','medium','high')),
  probability            text not null default 'medium' check (probability in ('low','medium','high')),
  confirmation_signal    text not null default '',   -- what would confirm the risk
  mitigation             text not null default '',   -- mitigation / my response
  status                 text not null default 'monitoring'
                         check (status in ('monitoring','emerging','materialised','retired')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint risk_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade
);
create index if not exists risk_company_idx on public.risks (company_id);

-- 2.9 Open questions -----------------------------------------------
create table if not exists public.open_questions (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  question               text not null,
  why_it_matters         text not null default '',
  status                 text not null default 'open' check (status in ('open','investigating','resolved')),
  answer                 text not null default '',
  source                 text not null default '',
  resolved_on            date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint question_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade
);
create index if not exists question_company_idx on public.open_questions (company_id, status);

-- 2.10 Tasks / action items -----------------------------------------
create table if not exists public.tasks (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  title                  text not null,
  description            text not null default '',
  due_date               date,
  priority               text not null default 'normal' check (priority in ('low','normal','high')),
  completed              boolean not null default false,
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint task_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade
);
create index if not exists task_company_idx on public.tasks (company_id);
create index if not exists task_open_idx on public.tasks (owner_id, completed, due_date);

-- 2.11 Reviews (scheduled and completed) ---------------------------
create table if not exists public.company_reviews (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  scheduled_for          date,
  trigger_type           text not null default 'date'
                         check (trigger_type in ('date','in_days','monthly','quarterly','next_results','catalyst')),
  trigger_note           text not null default '',
  catalyst_id            uuid references public.catalysts (id) on delete set null,
  recurrence_days        integer check (recurrence_days is null or recurrence_days between 1 and 730),
  status                 text not null default 'scheduled'
                         check (status in ('scheduled','completed','cancelled')),
  completed_on           date,
  review_notes           text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint review_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade
);
create index if not exists review_company_idx on public.company_reviews (company_id, status);
create index if not exists review_due_idx on public.company_reviews (owner_id, status, scheduled_for);

-- 2.12 Research files (metadata; the file itself is in Storage) ----
create table if not exists public.research_files (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  file_name              text not null,
  doc_type               text not null default 'other'
                         check (doc_type in ('annual_report','quarterly_results','concall','presentation',
                                             'filing','broker_report','screenshot','notes','other')),
  doc_date               date,
  description            text not null default '',
  source                 text not null default 'upload' check (source in ('upload','link')),
  storage_path           text unique,                 -- uploads: <owner_id>/<company_id>/<folder>/<file>
  url                    text,                        -- links: e.g. a Google Drive share link
  size_bytes             bigint,
  mime_type              text not null default '',
  uploaded_at            timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint file_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade,
  constraint file_path_in_owner_folder check (storage_path is null or split_part(storage_path, '/', 1) = owner_id::text),
  constraint file_has_location check (
    (source = 'upload' and storage_path is not null) or
    (source = 'link' and url is not null and url ~* '^https://'))
);
create index if not exists file_company_idx on public.research_files (company_id, doc_type);

-- Upgrade older installs of research_files to support saved links.
alter table public.research_files add column if not exists source text not null default 'upload';
alter table public.research_files add column if not exists url text;
alter table public.research_files alter column storage_path drop not null;
alter table public.research_files drop constraint if exists file_path_in_owner_folder;
alter table public.research_files add constraint file_path_in_owner_folder
  check (storage_path is null or split_part(storage_path, '/', 1) = owner_id::text);
alter table public.research_files drop constraint if exists research_files_source_check;
alter table public.research_files add constraint research_files_source_check check (source in ('upload','link'));
alter table public.research_files drop constraint if exists file_has_location;
alter table public.research_files add constraint file_has_location check (
  (source = 'upload' and storage_path is not null) or
  (source = 'link' and url is not null and url ~* '^https://'));

-- 2.13 Research history / updates (append-only) --------------------
create table if not exists public.research_updates (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  happened_on            date not null default current_date,
  update_type            text not null default 'note'
                         check (update_type in ('note','thesis','valuation','decision','status','review','price',
                                                'checklist','file','question','catalyst','risk','task',
                                                'result','news','trade','other')),
  title                  text not null,
  note                   text not null default '',
  field                  text,              -- which value changed, e.g. "base_target"
  previous_value         text,
  new_value              text,
  created_at             timestamptz not null default now(),
  constraint update_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade
);
-- Upgrade older installs: allow the 'trade' history type.
alter table public.research_updates drop constraint if exists research_updates_update_type_check;
alter table public.research_updates add constraint research_updates_update_type_check
  check (update_type in ('note','thesis','valuation','decision','status','review','price','checklist','file',
                         'question','catalyst','risk','task','result','news','trade','other'));
create index if not exists update_company_idx on public.research_updates (company_id, happened_on desc, created_at desc);
create index if not exists update_recent_idx  on public.research_updates (owner_id, created_at desc);

-- 2.14 Watchlists (named lists; a company can be in several) --------
create table if not exists public.watchlists (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                   text not null check (length(btrim(name)) > 0),
  description            text not null default '',
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint watchlists_owner_name_key unique (owner_id, name),
  constraint watchlists_id_owner_key unique (id, owner_id)
);

create table if not exists public.watchlist_items (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  watchlist_id           uuid not null,
  company_id             uuid not null,
  sort_order             integer not null default 0,
  note                   text not null default '',
  added_at               timestamptz not null default now(),
  constraint watchlist_item_list_fk foreign key (watchlist_id, owner_id)
    references public.watchlists (id, owner_id) on delete cascade,
  constraint watchlist_item_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade,
  constraint watchlist_items_unique unique (watchlist_id, company_id)
);
create index if not exists watchlist_items_company_idx on public.watchlist_items (company_id);

-- 2.15 Transactions (buys and sells) --------------------------------
create table if not exists public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  company_id             uuid not null,
  trade_date             date not null default current_date,
  type                   text not null check (type in ('buy','sell')),
  quantity               numeric(20,6) not null check (quantity > 0),
  price                  numeric(18,4) not null check (price >= 0),
  fees                   numeric(18,4) not null default 0 check (fees >= 0),
  notes                  text not null default '',
  source                 text not null default 'manual' check (source in ('manual','import')),
  external_id            text,                          -- broker trade id, prevents double imports
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint transaction_company_fk foreign key (company_id, owner_id)
    references public.companies (id, owner_id) on delete cascade
);
create index if not exists transactions_company_idx on public.transactions (company_id, trade_date);
create unique index if not exists transactions_external_idx on public.transactions (owner_id, external_id)
  where external_id is not null;

-- 2.16 Portfolio settings (one row per user) ------------------------
create table if not exists public.portfolio_settings (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid() unique references auth.users(id) on delete cascade,
  cash_balance           numeric(20,4) check (cash_balance is null or cash_balance >= 0),
  base_currency          text not null default 'INR',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 2.17 IPO tracker ---------------------------------------------------
create table if not exists public.ipo_persons (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                   text not null check (length(btrim(name)) > 0),
  is_self                boolean not null default false,     -- your own main account
  active                 boolean not null default true,      -- hide without losing history
  notes                  text not null default '',
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint ipo_persons_owner_name_key unique (owner_id, name),
  constraint ipo_persons_id_owner_key unique (id, owner_id)
);

create table if not exists public.ipo_categories (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                   text not null check (length(btrim(name)) > 0),
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint ipo_categories_owner_name_key unique (owner_id, name)
);

create table if not exists public.ipos (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                   text not null check (length(btrim(name)) > 0),
  symbol                 text not null default '',
  board                  text not null default 'mainboard' check (board in ('mainboard','sme')),
  open_date              date,
  close_date             date,
  allotment_date         date,
  listing_date           date,
  issue_price            numeric(18,4) check (issue_price is null or issue_price >= 0),
  lot_size               integer check (lot_size is null or lot_size > 0),
  listing_price          numeric(18,4) check (listing_price is null or listing_price >= 0),
  notes                  text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint ipos_id_owner_key unique (id, owner_id)
);

create table if not exists public.ipo_applications (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid(),
  ipo_id                 uuid not null,
  person_id              uuid not null,
  category               text not null default 'Retail',
  lots                   integer not null default 1 check (lots > 0),
  amount                 numeric(18,2) check (amount is null or amount >= 0),   -- amount applied / blocked
  funding                text not null default 'sent' check (funding in ('sent','self','own')),
                         -- sent = I sent money to this person · self = my main account · own = their own money
  outcome                text not null default 'pending'
                         check (outcome in ('pending','allotted','not_allotted','cancelled')),
  shares_allotted        integer check (shares_allotted is null or shares_allotted >= 0),
  sell_price             numeric(18,4) check (sell_price is null or sell_price >= 0),
  sell_date              date,
  charges                numeric(18,2) not null default 0 check (charges >= 0),
  loan_amount            numeric(18,2) check (loan_amount is null or loan_amount >= 0),
  loan_interest          numeric(18,2) not null default 0 check (loan_interest >= 0),
  settled                boolean not null default false,
  settled_on             date,
  application_no         text not null default '',
  notes                  text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint ipo_app_ipo_fk foreign key (ipo_id, owner_id)
    references public.ipos (id, owner_id) on delete cascade,
  constraint ipo_app_person_fk foreign key (person_id, owner_id)
    references public.ipo_persons (id, owner_id),                 -- a person with applications cannot be deleted (hide instead)
  constraint ipo_app_unique unique (ipo_id, person_id, category)
);
create index if not exists ipo_app_ipo_idx on public.ipo_applications (ipo_id);
create index if not exists ipo_app_person_idx on public.ipo_applications (person_id);

-- updated_at triggers for the tables whose rows can be edited
do $$
declare t text;
begin
  foreach t in array array['companies','research_checklist_items','key_facts','catalysts','risks',
                           'open_questions','tasks','company_reviews','research_files',
                           'watchlists','transactions','portfolio_settings',
                           'ipo_persons','ipo_categories','ipos','ipo_applications']
  loop
    execute format('drop trigger if exists run_touch_updated_at on public.%I', t);
    execute format('create trigger run_touch_updated_at before update on public.%I
                    for each row execute function public.run_touch_updated_at()', t);
  end loop;
end $$;


-- ------------------------------------------------------------
-- PART 3 — Row Level Security (who can see and change what)
--   anon          (not signed in)  → nothing at all
--   authenticated (signed in)      → only rows where owner_id = their id
-- ------------------------------------------------------------
do $$
declare
  t text;
  editable text[] := array['companies','research_checklist_items','key_facts','catalysts','risks',
                           'open_questions','tasks','company_reviews','research_files',
                           'watchlists','watchlist_items','transactions','portfolio_settings',
                           'ipo_persons','ipo_categories','ipos','ipo_applications'];
  append_only text[] := array['company_thesis','valuation_snapshots','investment_decisions','research_updates'];
begin
  foreach t in array editable || append_only
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Visitors who are not signed in get no access of any kind.
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists "owner can read" on public.%I', t);
    execute format('create policy "owner can read" on public.%I for select to authenticated
                    using (owner_id = (select auth.uid()))', t);

    execute format('drop policy if exists "owner can add" on public.%I', t);
    execute format('create policy "owner can add" on public.%I for insert to authenticated
                    with check (owner_id = (select auth.uid()))', t);

    execute format('drop policy if exists "owner can delete" on public.%I', t);
    execute format('create policy "owner can delete" on public.%I for delete to authenticated
                    using (owner_id = (select auth.uid()))', t);

    execute format('drop policy if exists "owner can edit" on public.%I', t);
    if t = any (editable) then
      execute format('create policy "owner can edit" on public.%I for update to authenticated
                      using (owner_id = (select auth.uid()))
                      with check (owner_id = (select auth.uid()))', t);
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------
-- PART 4 — Private file storage for PDFs, screenshots, notes
-- Files are stored as:
--   research-files/<your user id>/<company id>/<folder>/<file>
-- Only the signed-in owner of that first folder can read, add,
-- replace or delete files. The bucket is NOT public.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('research-files', 'research-files', false, 52428800)          -- 50 MB per file
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "run: owner can read research files"   on storage.objects;
drop policy if exists "run: owner can upload research files" on storage.objects;
drop policy if exists "run: owner can update research files" on storage.objects;
drop policy if exists "run: owner can delete research files" on storage.objects;

create policy "run: owner can read research files" on storage.objects
  for select to authenticated
  using (bucket_id = 'research-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "run: owner can upload research files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'research-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "run: owner can update research files" on storage.objects
  for update to authenticated
  using (bucket_id = 'research-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'research-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "run: owner can delete research files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'research-files' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- ------------------------------------------------------------
-- PART 5 — Carry prototype companies into the new structure
-- Runs only if the old prototype table exists AND you have already
-- created your user (Authentication → Users). If you have not, don't
-- worry: after signing in, the website offers a one-click
-- "Import starter companies" button that does the same thing.
-- ------------------------------------------------------------
do $$
declare v_owner uuid;
begin
  if to_regclass('public.companies_v1_backup') is null then
    return;
  end if;
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then
    return;
  end if;
  execute $sql$
    insert into public.companies
      (owner_id, slug, name, ticker, sector, description, summary, research_file,
       research_status, added_on, created_at, last_activity_at)
    select $1, b.id, b.name, coalesce(b.ticker, ''), coalesce(b.sector, ''), coalesce(b.description, ''),
           b.summary, b.research_file,
           case when b.status in ('watch','researching','researched') then b.status else 'watch' end,
           coalesce(b.added, current_date), coalesce(b.created_at, now()),
           coalesce(b.last_updated::timestamptz, now())
    from public.companies_v1_backup b
    on conflict (owner_id, slug) do nothing
  $sql$ using v_owner;
end $$;

-- Done. Next: create your user (Authentication → Users → Add user),
-- then put your Project URL and publishable/anon key in js/supabase-config.js.
