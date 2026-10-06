/* Run with Node and @electric-sql/pglite installed. No production connection. */
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 grant usage on schema public,auth,storage to anon,authenticated;
 grant select,insert,update,delete on storage.objects to anon,authenticated;`);
 await db.exec(fs.readFileSync('supabase-schema.sql','utf8'));
 await db.exec('grant truncate on public.companies to authenticated');
 const migration = fs.readFileSync('migrations/20261006_guest_access.sql','utf8');
 await db.exec(migration); await db.exec(migration);
 const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', guest='33333333-3333-4333-8333-333333333333', stranger='44444444-4444-4444-8444-444444444444';
 const company='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await db.exec(`insert into auth.users(id,email) values ('${owner}','owner@example.test'),('${other}','other@example.test'),('${guest}','guest@example.test'),('${stranger}','stranger@example.test');
 insert into public.workspace_owners values ('${owner}'),('${other}');
 insert into public.companies(id,owner_id,slug,name) values ('${company}','${owner}','private-company','Private company');
 insert into public.company_thesis(owner_id,company_id,version,thesis) values ('${owner}','${company}',1,'SECRET THESIS');
 insert into public.transactions(owner_id,company_id,trade_date,type,quantity,price) values ('${owner}','${company}',current_date,'buy',10,100);
 insert into storage.objects(bucket_id,name) values ('research-files','${owner}/${company}/secret.html');
 insert into public.shared_companies(owner_id,company_id,name) values ('${owner}','${company}','Shared company');
 insert into public.shared_research(owner_id,company_id,title,body) values ('${owner}','${company}','Shared title','Approved text');
 -- Simulate a dangerous leftover permissive policy; restrictive boundary wins.
 create policy legacy_allow_everyone on public.companies for all to authenticated using(true) with check(true);`);
 await db.exec("insert into storage.objects(bucket_id,name) values('public-assets','example.png'); create policy test_legacy_anon_storage on storage.objects for select to anon using(true);");
 let checks=0;
 assert.equal((await db.query("select has_table_privilege('authenticated','public.companies','TRUNCATE') as allowed")).rows[0].allowed,false);checks++;
 await db.exec(fs.readFileSync('migrations/20261006_verify.sql','utf8'));
 const register=fs.readFileSync('migrations/20261006_register_owner.sql','utf8').replaceAll('REPLACE_WITH_YOUR_OWNER_EMAIL','owner@example.test').replace("if owner_email = 'owner@example.test' then","if false then");
 await db.exec(register);
 async function as(id,fn,role='authenticated') {
   await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${id || ''}',false);`);
   try {return await fn();} finally {await db.exec('reset role');}
 }
 const rows = async t => (await db.query(`select * from public.${t}`)).rows;
 const empty = async t => {assert.equal((await rows(t)).length,0,t+' must be hidden'); checks++;};
 const denied = async sql => {await assert.rejects(()=>db.exec(sql));checks++;};
 await as(null,async()=>{for(const t of ['companies','shared_companies','shared_research','guest_access','workspace_owners'])await denied(`select * from public.${t}`);},'anon');
 await as(null,async()=>{
   const visible=(await db.query('select bucket_id from storage.objects')).rows;
   assert.equal(visible.length,1);assert.equal(visible[0].bucket_id,'public-assets');checks+=2;
 },'anon');
 await as(owner,async()=>{
   assert.equal((await rows('companies')).length,1);checks++;
   await db.query(`select public.run_grant_guest($1,$2)`,['guest@example.test','Reader']);
   await db.exec(`update public.guest_access set can_watchlist=true,can_research=true where guest_id='${guest}'`);
 });
 await as(guest,async()=>{
   for (const t of ['companies','company_thesis','transactions','portfolio_settings','ipo_applications','research_files','workspace_owners']) await empty(t);
   assert.equal((await rows('shared_companies')).length,1);checks++;
   assert.equal((await rows('shared_research')).length,1);checks++;
   assert.equal((await db.query('select * from storage.objects')).rows.length,0);checks++;
   await denied(`insert into public.workspace_owners values('${guest}')`);
   await denied(`insert into public.companies(owner_id,slug,name) values('${guest}','hacked','hacked')`);
   await denied(`insert into public.guest_access(owner_id,guest_id,can_research) values('${owner}','${stranger}',true)`);
   await denied(`select public.run_grant_guest('stranger@example.test','Bad')`);
   await denied(`insert into public.shared_research(owner_id,company_id,title,body) values('${owner}','${company}','Bad','Bad')`);
   await db.exec(`update public.shared_research set body='HACKED'; delete from public.shared_companies; update public.guest_access set active=false;`);
 });
 await as(owner,async()=>{
   assert.equal((await rows('shared_research'))[0].body,'Approved text');checks++;
   assert.equal((await rows('shared_companies')).length,1);checks++;
   assert.equal((await rows('guest_access'))[0].active,true);checks++;
   await db.exec('update public.guest_access set can_research=false');
 });
 await as(guest,async()=>{await empty('shared_research');assert.equal((await rows('shared_companies')).length,1);checks++;});
 await as(owner,async()=>{await db.exec('update public.guest_access set can_research=true,can_watchlist=false');});
 await as(guest,async()=>{await empty('shared_companies');assert.equal((await rows('shared_research')).length,1);checks++;});
 await as(other,async()=>{await empty('companies');await empty('shared_companies');await empty('shared_research');await empty('guest_access');});
 await as(stranger,async()=>{await empty('companies');await empty('shared_companies');await empty('shared_research');});
 await as(owner,async()=>{await db.exec("update public.guest_access set expires_at=now()-interval '1 minute'");});
 await as(guest,async()=>{await empty('shared_companies');await empty('shared_research');});
 await as(owner,async()=>{await db.exec('update public.guest_access set expires_at=null,active=false');});
 await as(guest,async()=>{await empty('shared_research');});
 await as(owner,async()=>{await db.exec('delete from public.guest_access');});
 await as(guest,async()=>{await empty('shared_research');});
 await db.exec(fs.readFileSync('supabase-schema.sql','utf8'));
 await as(guest,async()=>{await empty('companies');await empty('transactions');});
 console.log(`PASS: ${checks} database security assertions; migration rerun and base-schema rerun tested.`);
 await db.close();
})().catch(e=>{console.error(e);process.exit(1);});
