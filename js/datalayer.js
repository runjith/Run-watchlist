/* ============================================================
   RUN WATCHLIST — js/datalayer.js

   The ONLY place that talks to storage.

       UI (app.js, workspace.js, desk.js)
         ↓
       DataLayer  (this file)
         ↓
       Supabase (database + private file storage)
       — or, before Supabase is configured, this browser's
         localStorage + IndexedDB ("local mode").

   The views never call Supabase directly. To change where data
   lives, only this file changes.

   Structure
     1. Configuration & backend selection
     2. Storage adapters (Supabase / Local) — generic table API
     3. File adapters   (Supabase Storage / IndexedDB)
     4. Domain API      (companies, thesis, checklist, valuation,
                         decisions, catalysts, risks, questions,
                         tasks, reviews, files, history, desk)
     5. Auth
     6. Price provider hook (manual today; market data later)
   ============================================================ */

const DataLayer = (() => {

  /* ----------------------------------------------------------
     small utilities
     ---------------------------------------------------------- */
  const toCamel = s => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  const toSnake = s => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
  const rowIn = r => r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [toCamel(k), v])) : r;
  const rowOut = o => Object.fromEntries(Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [toSnake(k), v === '' && /(_date|_on|_for|_at)$/.test(toSnake(k)) ? null : v]));

  const pad = n => String(n).padStart(2, '0');
  const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => localDate(new Date());
  const nowISO = () => new Date().toISOString();
  const addDays = (dateStr, n) => {
    const d = new Date((dateStr || today()) + 'T00:00:00');
    d.setDate(d.getDate() + Number(n || 0));
    return localDate(d);
  };
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const tsToLocalDate = ts => ts ? localDate(new Date(ts)) : '';
  const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });

  const slugify = s => String(s || '').toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'company';

  function friendly(err) {
    if (!err) return new Error('Something went wrong.');
    if (err instanceof Error && err.friendly) return err;
    const msg = err.message || String(err);
    let text = msg;
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) text = 'Could not reach Supabase. Check your internet connection and try again.';
    else if (/JWT expired|invalid JWT|jwt/i.test(msg) || err.status === 401) text = 'Your session has expired. Please sign in again.';
    else if (err.code === '42501' || /row-level security|permission denied/i.test(msg)) text = 'Not allowed. Please make sure you are signed in.';
    else if (err.code === '23505' || /duplicate|already exists/i.test(msg)) text = 'That already exists.';
    else if (/Invalid login credentials/i.test(msg)) text = 'Email or password is incorrect.';
    else if (/exceeded the maximum allowed size|Payload too large|413/i.test(msg)) text = 'That file is too large (the limit is 50 MB per file).';
    const e = new Error(text);
    e.friendly = true; e.original = err;
    return e;
  }

  /* ----------------------------------------------------------
     1. CONFIGURATION & BACKEND SELECTION
     ---------------------------------------------------------- */
  const cfg = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG) || {};
  const cfgUrl = String(cfg.url || '').trim();
  const cfgKey = String(cfg.anonKey || cfg.publishableKey || '').trim();

  function isSecretKey(k) {
    if (/^sb_secret_/i.test(k)) return true;
    const parts = k.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.role === 'service_role';
      } catch (e) { /* not a JWT */ }
    }
    return false;
  }

  let mode = 'local';           // 'local' | 'supabase' | 'error'
  let configError = null;
  let client = null;

  if (cfgUrl || cfgKey) {
    if (!cfgUrl || !cfgKey) {
      configError = 'js/supabase-config.js needs both the Project URL and the publishable (anon) key.';
    } else if (isSecretKey(cfgKey)) {
      configError = 'js/supabase-config.js contains a SECRET (service_role) key. Remove it immediately and use the publishable / anon public key instead. Never put the secret key in the website.';
    } else if (!(window.supabase && typeof window.supabase.createClient === 'function')) {
      configError = 'The Supabase library could not be loaded. Check your internet connection and refresh.';
    } else {
      try {
        client = window.supabase.createClient(cfgUrl, cfgKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        mode = 'supabase';
      } catch (err) {
        configError = 'Supabase could not start: ' + (err.message || err);
      }
    }
    if (configError) mode = 'error';
  }

  /* ----------------------------------------------------------
     2. STORAGE ADAPTERS — same generic API for both backends
        list(table, {select, eq, neq, in, order, limit})
        insert(table, row) · insertMany(table, rows)
        update(table, id, patch) · remove(table, id)
     ---------------------------------------------------------- */
  const SupabaseStore = {
    async list(table, opts = {}) {
      let q = client.from(table).select(opts.select || '*');
      for (const [k, v] of Object.entries(opts.eq || {})) q = q.eq(k, v);
      for (const [k, v] of Object.entries(opts.neq || {})) q = q.neq(k, v);
      for (const [k, v] of Object.entries(opts.in || {})) q = q.in(k, v);
      for (const o of (opts.order || [])) q = q.order(o.col, { ascending: !!o.asc, nullsFirst: false });
      if (opts.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) throw friendly(error);
      return data || [];
    },
    async insert(table, row) {
      const { data, error } = await client.from(table).insert(row).select().single();
      if (error) throw friendly(error);
      return data;
    },
    async insertMany(table, rows) {
      if (!rows.length) return [];
      const { data, error } = await client.from(table).insert(rows).select();
      if (error) throw friendly(error);
      return data || [];
    },
    async update(table, id, patch) {
      const { data, error } = await client.from(table).update(patch).eq('id', id).select().single();
      if (error) throw friendly(error);
      return data;
    },
    async remove(table, id) {
      const { error } = await client.from(table).delete().eq('id', id);
      if (error) throw friendly(error);
    }
  };

  /* Local mode mirrors the database tables inside localStorage.
     Defaults match supabase-schema.sql so both backends behave alike. */
  const LOCAL_KEY = 'run.workspace.v2';
  const CHILD_TABLES = ['company_thesis', 'research_checklist_items', 'key_facts', 'valuation_snapshots',
    'investment_decisions', 'catalysts', 'risks', 'open_questions', 'tasks',
    'company_reviews', 'research_files', 'research_updates', 'watchlist_items', 'transactions'];
  const IPO_TABLES = ['ipo_persons', 'ipo_categories', 'ipos', 'ipo_applications'];
  const HAS_UPDATED_AT = ['companies', 'research_checklist_items', 'key_facts', 'catalysts', 'risks',
    'open_questions', 'tasks', 'company_reviews', 'research_files', 'watchlists', 'transactions', 'portfolio_settings',
    'ipo_persons', 'ipo_categories', 'ipos', 'ipo_applications'];
  const LOCAL_DEFAULTS = {
    companies: { ticker: '', exchange: '', sector: '', description: '', summary: null, research_file: null,
      research_status: 'watch', decision: null, decision_date: null, current_price: null,
      price_currency: 'INR', price_as_of: null, price_source: 'manual', checklist_seeded: false },
    company_thesis: { why_interested: '', thesis: '', what_needs_to_happen: '', key_assumptions: '',
      what_changes_mind: '', confidence: null, change_note: null },
    research_checklist_items: { is_default: false, sort_order: 0, completed: false, completed_on: null, notes: '' },
    valuation_snapshots: { currency: 'INR', methods: [], method_notes: '', assumptions: '', time_horizon: '' },
    investment_decisions: { rationale: '', time_horizon: '', holding_status: 'not_held' },
    key_facts: { detail: '', source: '', observed_on: null },
    catalysts: { description: '', importance: 'medium', status: 'expected', notes: '', expected_date: null },
    risks: { description: '', severity: 'medium', probability: 'medium', confirmation_signal: '', mitigation: '', status: 'monitoring' },
    open_questions: { why_it_matters: '', status: 'open', answer: '', source: '', resolved_on: null },
    tasks: { description: '', due_date: null, priority: 'normal', completed: false, completed_at: null },
    company_reviews: { trigger_type: 'date', trigger_note: '', catalyst_id: null, recurrence_days: null,
      status: 'scheduled', completed_on: null, review_notes: '' },
    research_files: { doc_type: 'other', doc_date: null, description: '', mime_type: '', source: 'upload', url: null, storage_path: null, size_bytes: null },
    watchlists: { description: '', sort_order: 0 },
    watchlist_items: { sort_order: 0, note: '' },
    transactions: { fees: 0, notes: '', source: 'manual', external_id: null },
    portfolio_settings: { cash_balance: null, base_currency: 'INR' },
    ipo_persons: { is_self: false, active: true, notes: '', sort_order: 0 },
    ipo_categories: { sort_order: 0 },
    ipos: { symbol: '', board: 'mainboard', open_date: null, close_date: null, allotment_date: null, listing_date: null,
      issue_price: null, lot_size: null, listing_price: null, notes: '' },
    ipo_applications: { category: 'Retail', lots: 1, amount: null, funding: 'sent', outcome: 'pending', shares_allotted: null,
      sell_price: null, sell_date: null, charges: 0, loan_amount: null, loan_interest: 0, settled: false, settled_on: null,
      application_no: '', notes: '' },
    research_updates: { update_type: 'note', note: '', field: null, previous_value: null, new_value: null }
  };

  const LocalStore = {
    db: null,
    load() {
      if (this.db) return;
      try { this.db = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { this.db = null; }
      if (!this.db || !this.db.tables) this.db = { tables: {}, seeded: false };
    },
    save() {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.db)); }
      catch (e) { console.warn('[RUN] Could not save to this browser:', e); }
    },
    t(name) { this.load(); return (this.db.tables[name] = this.db.tables[name] || []); },
    match(r, opts) {
      for (const [k, v] of Object.entries(opts.eq || {})) if (r[k] !== v) return false;
      for (const [k, v] of Object.entries(opts.neq || {})) if (r[k] === v) return false;
      for (const [k, v] of Object.entries(opts.in || {})) if (!v.includes(r[k])) return false;
      return true;
    },
    async list(table, opts = {}) {
      let rows = this.t(table).filter(r => this.match(r, opts));
      for (const o of [...(opts.order || [])].reverse()) {
        rows = rows.slice().sort((a, b) => {
          const x = a[o.col], y = b[o.col];
          if (x == null && y == null) return 0;
          if (x == null) return 1;
          if (y == null) return -1;
          const c = x < y ? -1 : x > y ? 1 : 0;
          return o.asc ? c : -c;
        });
      }
      if (opts.limit) rows = rows.slice(0, opts.limit);
      return JSON.parse(JSON.stringify(rows));
    },
    async insert(table, row) {
      const now = nowISO();
      const full = { ...(LOCAL_DEFAULTS[table] || {}), id: uuid(), created_at: now, ...row };
      if (HAS_UPDATED_AT.includes(table)) full.updated_at = now;
      if (table === 'companies') {
        full.added_on = full.added_on || today();
        full.last_activity_at = full.last_activity_at || now;
        if (this.t('companies').some(c => c.slug === full.slug)) throw friendly({ code: '23505', message: 'duplicate' });
      }
      if (table === 'research_files') full.uploaded_at = now;
      if (table === 'watchlist_items') full.added_at = now;
      const dup = (list, fn) => { if (this.t(list).some(fn)) throw friendly({ code: '23505', message: 'duplicate' }); };
      if (table === 'watchlists') dup('watchlists', r => r.name.trim().toLowerCase() === String(full.name).trim().toLowerCase());
      if (table === 'watchlist_items') dup('watchlist_items', r => r.watchlist_id === full.watchlist_id && r.company_id === full.company_id);
      if (table === 'transactions' && full.external_id) dup('transactions', r => r.external_id === full.external_id);
      if (table === 'ipo_persons') dup('ipo_persons', r => r.name.trim().toLowerCase() === String(full.name).trim().toLowerCase());
      if (table === 'ipo_categories') dup('ipo_categories', r => r.name.trim().toLowerCase() === String(full.name).trim().toLowerCase());
      if (table === 'ipo_applications') dup('ipo_applications', r => r.ipo_id === full.ipo_id && r.person_id === full.person_id && r.category === full.category);
      this.t(table).push(full);
      this.save();
      return JSON.parse(JSON.stringify(full));
    },
    async insertMany(table, rows) {
      const out = [];
      for (const r of rows) out.push(await this.insert(table, r));
      return out;
    },
    async update(table, id, patch) {
      const row = this.t(table).find(r => r.id === id);
      if (!row) throw friendly({ message: 'Not found.' });
      Object.assign(row, patch);
      if (HAS_UPDATED_AT.includes(table)) row.updated_at = nowISO();
      this.save();
      return JSON.parse(JSON.stringify(row));
    },
    async remove(table, id) {
      this.db.tables[table] = this.t(table).filter(r => r.id !== id);
      if (table === 'companies') {
        for (const t of CHILD_TABLES) this.db.tables[t] = this.t(t).filter(r => r.company_id !== id);
      }
      if (table === 'catalysts') {
        this.t('company_reviews').forEach(r => { if (r.catalyst_id === id) r.catalyst_id = null; });
      }
      if (table === 'watchlists') this.db.tables.watchlist_items = this.t('watchlist_items').filter(r => r.watchlist_id !== id);
      if (table === 'ipos') this.db.tables.ipo_applications = this.t('ipo_applications').filter(r => r.ipo_id !== id);
      this.save();
    }
  };

  /* ----------------------------------------------------------
     3. FILE ADAPTERS
     ---------------------------------------------------------- */
  const BUCKET = 'research-files';

  const SupabaseFiles = {
    async upload(path, file) {
      const { error } = await client.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream', upsert: false, cacheControl: '3600'
      });
      if (error) throw friendly(error);
    },
    async urls(paths, expiresIn = 3600) {
      if (!paths.length) return {};
      const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths, expiresIn);
      if (error) throw friendly(error);
      const out = {};
      (data || []).forEach(d => { if (d.signedUrl) out[d.path] = d.signedUrl; });
      return out;
    },
    async url(path, { download = false, fileName = null } = {}) {
      const opts = download ? { download: fileName || true } : undefined;
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600, opts);
      if (error) throw friendly(error);
      return data.signedUrl;
    },
    async remove(paths) {
      if (!paths.length) return;
      const { error } = await client.storage.from(BUCKET).remove(paths);
      if (error) throw friendly(error);
    }
  };

  const LocalFiles = {
    _db: null,
    open() {
      if (!this._db) {
        this._db = new Promise((resolve, reject) => {
          const req = indexedDB.open('run-research-files', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('files');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return this._db;
    },
    async tx(modeName, fn) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('files', modeName);
        const store = t.objectStore('files');
        const req = fn(store);
        t.oncomplete = () => resolve(req && req.result);
        t.onerror = () => reject(t.error);
      });
    },
    async upload(path, file) { await this.tx('readwrite', s => s.put(file, path)); },
    async blob(path) { return this.tx('readonly', s => s.get(path)); },
    async urls(paths) {
      const out = {};
      for (const p of paths) { const b = await this.blob(p); if (b) out[p] = URL.createObjectURL(b); }
      return out;
    },
    async url(path) {
      const b = await this.blob(path);
      if (!b) throw friendly({ message: 'File not found in this browser.' });
      return URL.createObjectURL(b);
    },
    async remove(paths) { for (const p of paths) await this.tx('readwrite', s => s.delete(p)); }
  };

  const store = () => (mode === 'supabase' ? SupabaseStore : LocalStore);
  const files = () => (mode === 'supabase' ? SupabaseFiles : LocalFiles);

  /* ----------------------------------------------------------
     4. DOMAIN API
     ---------------------------------------------------------- */
  let user = null;
  let cache = {};
  const invalidate = () => { cache = {}; };
  const cached = (key, fn) => {
    if (!(key in cache)) cache[key] = fn().catch(err => { delete cache[key]; throw err; });
    return cache[key];
  };

  function requireUser() {
    if (mode === 'error') throw friendly({ message: configError });
    if (!user) throw friendly({ message: 'Please sign in first.' });
  }

  async function list(table, opts) { requireUser(); return (await store().list(table, opts)).map(rowIn); }
  async function add(table, obj) {
    requireUser();
    return rowIn(await store().insert(table, rowOut({ ownerId: user.id, ...obj })));
  }
  async function addMany(table, objs) {
    requireUser();
    return (await store().insertMany(table, objs.map(o => rowOut({ ownerId: user.id, ...o })))).map(rowIn);
  }
  async function patch(table, id, obj) { requireUser(); return rowIn(await store().update(table, id, rowOut(obj))); }
  async function del(table, id) { requireUser(); await store().remove(table, id); }
  async function touch(companyId) {
    if (!companyId) return;
    try { await store().update('companies', companyId, { last_activity_at: nowISO() }); } catch (e) { /* non-critical */ }
  }
  async function done(companyId) { await touch(companyId); invalidate(); }

  /* Research history entry. */
  async function log(companyId, e) {
    return add('research_updates', {
      companyId,
      happenedOn: e.happenedOn || today(),
      updateType: e.type || 'note',
      title: e.title,
      note: e.note || '',
      field: e.field || null,
      previousValue: e.previous == null ? null : String(e.previous),
      newValue: e.next == null ? null : String(e.next)
    });
  }

  /* ---------- companies ---------- */
  async function companyBySlug(slug) {
    return (await list('companies', { eq: { slug } }))[0] || null;
  }
  async function companyById(id) {
    return (await list('companies', { eq: { id } }))[0] || null;
  }

  async function seedChecklist(companyId) {
    await addMany('research_checklist_items', RUN.CHECKLIST_TEMPLATE.map((title, i) => ({
      companyId, title, isDefault: true, sortOrder: (i + 1) * 10, completed: false
    })));
    await patch('companies', companyId, { checklistSeeded: true });
  }

  async function ensureChecklist(company) {
    if (company.checklistSeeded) return;
    const existing = await list('research_checklist_items', { select: 'id', eq: { company_id: company.id } });
    if (existing.length) await patch('companies', company.id, { checklistSeeded: true });
    else await seedChecklist(company.id);
    company.checklistSeeded = true;
  }

  async function createCompany(input) {
    requireUser();
    const name = String(input.name || '').trim();
    if (!name) throw friendly({ message: 'Company name is required.' });
    const taken = new Set((await list('companies', { select: 'slug' })).map(c => c.slug));
    let base = slugify(input.slug || name), slug = base, n = 2;
    while (taken.has(slug)) slug = `${base}-${n++}`;
    const status = ['watch', 'researching', 'researched'].includes(input.researchStatus) ? input.researchStatus : 'watch';
    const c = await add('companies', {
      slug, name,
      ticker: String(input.ticker || '').trim().toUpperCase(),
      exchange: String(input.exchange || '').trim(),
      sector: String(input.sector || '').trim() || 'Uncategorised',
      description: String(input.description || '').trim(),
      summary: String(input.summary || '').trim() || null,
      researchFile: String(input.researchFile || '').trim() || null,
      researchStatus: status,
      researchStartedOn: status !== 'watch' ? today() : null,
      researchCompletedOn: status === 'researched' ? today() : null,
      addedOn: input.addedOn || today(),
      lastActivityAt: nowISO()
    });
    await seedChecklist(c.id);
    await log(c.id, {
      type: 'status', title: input.importNote || 'Added to the watchlist',
      field: 'research_status', next: RUN.label('RESEARCH_STATUS', status)
    });
    invalidate();
    return c;
  }

  async function updateCompany(id, input) {
    const allowed = ['name', 'ticker', 'exchange', 'sector', 'description', 'summary', 'researchFile'];
    const fields = {};
    for (const k of allowed) if (k in input) {
      let v = input[k] == null ? '' : String(input[k]).trim();
      if (k === 'ticker') v = v.toUpperCase();
      fields[k] = (k === 'summary' || k === 'researchFile') ? (v || null) : v;
    }
    const c = await patch('companies', id, fields);
    await done(id);
    return c;
  }

  async function deleteCompany(id) {
    const rows = (await list('research_files', { select: 'storage_path', eq: { company_id: id } })).filter(r => r.storagePath);
    if (rows.length) await files().remove(rows.map(r => r.storagePath));
    await del('companies', id);
    invalidate();
  }

  async function setResearchStatus(id, status, note) {
    const c = await companyById(id);
    if (!c || c.researchStatus === status) return c;
    const fields = { researchStatus: status };
    if (status === 'researching' && !c.researchStartedOn) fields.researchStartedOn = today();
    if (status === 'researched') fields.researchCompletedOn = today();
    if (status !== 'researched') fields.researchCompletedOn = null;
    const updated = await patch('companies', id, fields);
    const titles = {
      researching: c.researchStatus === 'researched' ? 'Research reopened' : 'Research started',
      researched: 'Research completed',
      watch: 'Moved back to watching'
    };
    await log(id, {
      type: 'status', title: titles[status], note: note || '', field: 'research_status',
      previous: RUN.label('RESEARCH_STATUS', c.researchStatus), next: RUN.label('RESEARCH_STATUS', status)
    });
    await done(id);
    return updated;
  }

  async function importStarter() {
    requireUser();
    const have = new Set((await list('companies', { select: 'slug' })).map(c => c.slug));
    let added = 0;
    for (const s of STARTER_COMPANIES) {
      if (have.has(s.slug)) continue;
      await createCompany({ ...s, importNote: 'Imported from the starter list' });
      added++;
    }
    invalidate();
    return added;
  }

  /* ---------- overview: one object per company for lists ---------- */
  async function overview() {
    return cached('overview', async () => {
      const [companies, checklist, tasks, questions, reviews, valuations, cats, memberships, trades] = await Promise.all([
        list('companies', { order: [{ col: 'last_activity_at', asc: false }] }),
        list('research_checklist_items', { select: 'company_id,completed' }),
        list('tasks', { select: 'company_id,due_date', eq: { completed: false } }),
        list('open_questions', { select: 'company_id,status', neq: { status: 'resolved' } }),
        list('company_reviews', { select: 'id,company_id,scheduled_for,status,completed_on,trigger_type,trigger_note,recurrence_days,catalyst_id' }),
        list('valuation_snapshots', {
          select: 'company_id,created_at,currency,fair_value,base_target,bull_target,bear_target,entry_low,entry_high,stop_loss,invalidation_price',
          order: [{ col: 'created_at', asc: false }]
        }),
        list('catalysts', { select: 'id,title,status,expected_date,updated_at' }),
        list('watchlist_items', { select: 'watchlist_id,company_id' }),
        list('transactions', { select: 'company_id,trade_date,type,quantity,price,fees,created_at' })
      ]);

      const t = today();
      const catById = Object.fromEntries(cats.map(x => [x.id, x]));
      /* A review can be tied to a catalyst instead of (or as well as) a date:
         it becomes due on its date, or as soon as the catalyst is marked occurred,
         or on the catalyst's expected date — whichever applies first. */
      const effectiveDate = r => {
        const cat = r.catalystId ? catById[r.catalystId] : null;
        const cands = [r.scheduledFor];
        if (cat && cat.status === 'occurred') cands.push(tsToLocalDate(cat.updatedAt) || t);
        if (cat && !r.scheduledFor && cat.expectedDate) cands.push(cat.expectedDate);
        return cands.filter(Boolean).sort()[0] || null;
      };
      const group = (rows) => rows.reduce((m, r) => ((m[r.companyId] = m[r.companyId] || []).push(r), m), {});
      const cl = group(checklist), tk = group(tasks), qs = group(questions), rv = group(reviews), vl = group(valuations);
      const lists = group(memberships), tr = group(trades);
      const pos = {};
      let totalValue = 0;
      for (const c of companies) {
        if (!tr[c.id]) continue;
        const p = Portfolio.position(tr[c.id]);
        if (p.qty > 0) {
          const price = num(c.currentPrice) ?? p.avg;
          pos[c.id] = { qty: p.qty, avg: p.avg, invested: p.cost, value: p.qty * price };
          totalValue += p.qty * price;
        }
      }
      for (const k of Object.keys(pos)) pos[k].alloc = totalValue ? pos[k].value / totalValue * 100 : 0;
      return companies.map(c => {
        const items = cl[c.id] || [];
        const doneN = items.filter(i => i.completed).length;
        const open = (rv[c.id] || []).filter(r => r.status === 'scheduled')
          .map(r => ({ ...r, due: effectiveDate(r) }))
          .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0] || null;
        const cat = open && open.catalystId ? catById[open.catalystId] : null;
        const last = (rv[c.id] || []).filter(r => r.status === 'completed' && r.completedOn)
          .sort((a, b) => b.completedOn.localeCompare(a.completedOn))[0] || null;
        const v = (vl[c.id] || [])[0] || null;
        const ctasks = tk[c.id] || [];
        return {
          id: c.id, slug: c.slug, name: c.name, ticker: c.ticker, exchange: c.exchange,
          sector: c.sector || 'Uncategorised', description: c.description, summary: c.summary,
          researchFile: c.researchFile,
          status: c.researchStatus, researched: c.researchStatus === 'researched', watchlisted: true,
          researchStartedOn: c.researchStartedOn, researchCompletedOn: c.researchCompletedOn,
          decision: c.decision, decisionDate: c.decisionDate,
          currentPrice: num(c.currentPrice), priceCurrency: c.priceCurrency || 'INR', priceAsOf: c.priceAsOf,
          progress: { done: doneN, total: items.length, pct: items.length ? Math.round(doneN / items.length * 100) : 0 },
          openTasks: ctasks.length,
          overdueTasks: ctasks.filter(x => x.dueDate && x.dueDate < t).length,
          openQuestions: (qs[c.id] || []).length,
          nextReview: open ? {
            id: open.id, date: open.due, scheduledFor: open.scheduledFor,
            triggerType: open.triggerType, triggerNote: open.triggerNote, recurrenceDays: open.recurrenceDays,
            catalyst: cat ? { title: cat.title, status: cat.status } : null,
            daysUntil: open.due ? daysBetween(t, open.due) : null
          } : null,
          lastReviewed: last ? last.completedOn : null,
          valuation: v,
          lists: (lists[c.id] || []).map(m => m.watchlistId),
          position: pos[c.id] || null,
          lastActivityAt: c.lastActivityAt,
          lastUpdated: tsToLocalDate(c.lastActivityAt),
          added: c.addedOn
        };
      });
    });
  }

  /* ---------- everything for one company workspace ---------- */
  async function workspace(slug) {
    const company = await companyBySlug(slug);
    if (!company) return null;
    await ensureChecklist(company);
    const id = company.id;
    const byCompany = (table, order) => list(table, { eq: { company_id: id }, order });
    const [thesis, checklist, valuations, decisions, catalysts, risks, questions, tasks, reviews, docs, updates, facts] =
      await Promise.all([
        byCompany('company_thesis', [{ col: 'version', asc: false }]),
        byCompany('research_checklist_items', [{ col: 'sort_order', asc: true }, { col: 'created_at', asc: true }]),
        byCompany('valuation_snapshots', [{ col: 'created_at', asc: false }]),
        byCompany('investment_decisions', [{ col: 'created_at', asc: false }]),
        byCompany('catalysts', [{ col: 'expected_date', asc: true }, { col: 'created_at', asc: true }]),
        byCompany('risks', [{ col: 'created_at', asc: true }]),
        byCompany('open_questions', [{ col: 'created_at', asc: true }]),
        byCompany('tasks', [{ col: 'created_at', asc: true }]),
        byCompany('company_reviews', [{ col: 'created_at', asc: false }]),
        byCompany('research_files', [{ col: 'uploaded_at', asc: false }]),
        byCompany('research_updates', [{ col: 'happened_on', asc: false }, { col: 'created_at', asc: false }]),
        byCompany('key_facts', [{ col: 'created_at', asc: true }])
      ]);
    const [transactions, watchlists, memberships] = await Promise.all([
      byCompany('transactions', [{ col: 'trade_date', asc: false }, { col: 'created_at', asc: false }]),
      list('watchlists', { order: [{ col: 'sort_order', asc: true }, { col: 'name', asc: true }] }),
      byCompany('watchlist_items')
    ]);
    const lists = watchlists.map(w => ({ ...w, member: memberships.some(m => m.watchlistId === w.id) }));
    return { company, thesis, checklist, valuations, decisions, facts, catalysts, risks, questions, tasks, reviews, files: docs, updates, transactions, lists };
  }

  /* ---------- thesis (versioned) ---------- */
  const THESIS_FIELDS = [
    ['whyInterested', 'why I am interested'], ['thesis', 'thesis'],
    ['whatNeedsToHappen', 'what needs to happen'], ['keyAssumptions', 'key assumptions'],
    ['whatChangesMind', 'what would change my mind'], ['confidence', 'confidence']
  ];
  async function saveThesis(companyId, fields, changeNote) {
    const prev = (await list('company_thesis', { eq: { company_id: companyId }, order: [{ col: 'version', asc: false }], limit: 1 }))[0];
    const clean = {};
    for (const [k] of THESIS_FIELDS) clean[k] = k === 'confidence' ? (num(fields[k]) || null) : String(fields[k] || '');
    const changed = THESIS_FIELDS.filter(([k]) => String(prev ? (prev[k] ?? '') : '') !== String(clean[k] ?? ''));
    if (prev && !changed.length) return { unchanged: true, row: prev };
    const version = (prev ? prev.version : 0) + 1;
    const row = await add('company_thesis', { companyId, version, ...clean, changeNote: changeNote || null });
    const confChanged = changed.some(([k]) => k === 'confidence');
    await log(companyId, {
      type: 'thesis',
      title: prev ? `Thesis updated — version ${version}` : 'Thesis written',
      note: [changeNote, prev ? 'Changed: ' + changed.map(([, l]) => l).join(', ') : ''].filter(Boolean).join('\n'),
      field: confChanged ? 'confidence' : null,
      previous: confChanged && prev ? RUN.label('CONFIDENCE', prev.confidence, 'Not set') : null,
      next: confChanged ? RUN.label('CONFIDENCE', clean.confidence, 'Not set') : null
    });
    await done(companyId);
    return { row };
  }

  /* ---------- checklist ---------- */
  async function updateChecklistItem(id, companyId, input) {
    const fields = {};
    if ('title' in input) fields.title = String(input.title || '').trim() || 'Untitled item';
    if ('notes' in input) fields.notes = String(input.notes || '');
    if ('completed' in input) {
      fields.completed = !!input.completed;
      fields.completedOn = input.completed ? (input.completedOn || today()) : null;
    } else if ('completedOn' in input) fields.completedOn = input.completedOn || null;
    const row = await patch('research_checklist_items', id, fields);
    await done(companyId);
    return row;
  }
  async function addChecklistItem(companyId, title) {
    const items = await list('research_checklist_items', { select: 'sort_order', eq: { company_id: companyId } });
    const max = items.reduce((m, i) => Math.max(m, i.sortOrder || 0), 0);
    const row = await add('research_checklist_items', {
      companyId, title: String(title || '').trim(), isDefault: false, sortOrder: max + 10, completed: false
    });
    await done(companyId);
    return row;
  }
  async function deleteChecklistItem(id, companyId) {
    await del('research_checklist_items', id);
    await done(companyId);
  }

  /* ---------- valuation (append-only snapshots) ---------- */
  const VAL_KEYS = [
    ['baseTarget', 'Base-case target'], ['fairValue', 'Fair value'], ['bullTarget', 'Bull-case target'],
    ['bearTarget', 'Bear-case target'], ['entryLow', 'Entry range (low)'], ['entryHigh', 'Entry range (high)'],
    ['stopLoss', 'Stop-loss'], ['invalidationPrice', 'Invalidation price']
  ];
  async function saveValuation(companyId, snap, changeNote) {
    const company = await companyById(companyId);
    const prev = (await list('valuation_snapshots', { eq: { company_id: companyId }, order: [{ col: 'created_at', asc: false }], limit: 1 }))[0];
    const currency = snap.currency || company.priceCurrency || 'INR';
    const methods = (snap.methods || [])
      .map(m => ({ method: String(m.method || '').trim(), basis: String(m.basis || '').trim(), value: num(m.value) }))
      .filter(m => m.method || m.basis || m.value != null);
    const row = await add('valuation_snapshots', {
      companyId, asOf: snap.asOf || today(), currency,
      priceAtSnapshot: num(snap.priceAtSnapshot) ?? num(company.currentPrice),
      fairValue: num(snap.fairValue), baseTarget: num(snap.baseTarget), bullTarget: num(snap.bullTarget),
      bearTarget: num(snap.bearTarget), entryLow: num(snap.entryLow), entryHigh: num(snap.entryHigh),
      stopLoss: num(snap.stopLoss), invalidationPrice: num(snap.invalidationPrice),
      timeHorizon: String(snap.timeHorizon || ''), methods,
      methodNotes: String(snap.methodNotes || ''), assumptions: String(snap.assumptions || ''),
      changeNote: changeNote || null
    });
    const m = v => RUN.money(v, currency);
    if (!prev) {
      const bits = VAL_KEYS.filter(([k]) => row[k] != null).slice(0, 3).map(([k, l]) => `${l} ${m(row[k])}`);
      await log(companyId, {
        type: 'valuation', title: 'Initial valuation recorded', happenedOn: row.asOf,
        note: [bits.join(' · '), changeNote ? 'Reason: ' + changeNote : ''].filter(Boolean).join('\n'),
        field: row.baseTarget != null ? 'base_target' : null, next: row.baseTarget
      });
    } else {
      const changes = VAL_KEYS.filter(([k]) => num(prev[k]) !== num(row[k]));
      const main = changes[0];
      const others = changes.slice(1).map(([k, l]) => `${l} ${m(prev[k])} → ${m(row[k])}`);
      await log(companyId, {
        type: 'valuation', happenedOn: row.asOf,
        title: main ? `${main[1]} changed` : 'Valuation reviewed — numbers unchanged',
        note: [others.join('\n'), changeNote ? 'Reason: ' + changeNote : ''].filter(Boolean).join('\n'),
        field: main ? toSnake(main[0]) : null,
        previous: main ? prev[main[0]] : null, next: main ? row[main[0]] : null
      });
    }
    await done(companyId);
    return row;
  }
  async function deleteValuation(id, companyId) { await del('valuation_snapshots', id); await done(companyId); }

  /* ---------- price (manual today — see PriceProvider below) ---------- */
  async function setPrice(companyId, price, asOf, currency) {
    const fields = { currentPrice: num(price), priceAsOf: num(price) == null ? null : (asOf || today()), priceSource: 'manual' };
    if (currency) fields.priceCurrency = currency;
    const row = await patch('companies', companyId, fields);
    invalidate();
    return row;
  }

  /* ---------- decisions (append-only) ---------- */
  async function recordDecision(companyId, d) {
    const company = await companyById(companyId);
    if (!RUN.DECISIONS.some(x => x.value === d.decision)) throw friendly({ message: 'Choose a decision first.' });
    const row = await add('investment_decisions', {
      companyId, decision: d.decision, decidedOn: d.decidedOn || today(),
      rationale: String(d.rationale || ''), timeHorizon: String(d.timeHorizon || ''),
      positionSizePct: num(d.positionSizePct), maxAllocationPct: num(d.maxAllocationPct),
      holdingStatus: d.holdingStatus || 'not_held', priceAtDecision: num(company.currentPrice)
    });
    await patch('companies', companyId, { decision: d.decision, decisionDate: row.decidedOn });
    await log(companyId, {
      type: 'decision', happenedOn: row.decidedOn,
      title: company.decision && company.decision !== d.decision ? 'Decision changed'
        : company.decision ? 'Decision re-affirmed' : 'Decision recorded',
      note: d.rationale || '', field: 'decision',
      previous: company.decision ? RUN.label('DECISIONS', company.decision) : null,
      next: RUN.label('DECISIONS', d.decision)
    });
    await done(companyId);
    return row;
  }

  async function completeResearch(companyId, { decision, note } = {}) {
    if (decision && decision.decision) await recordDecision(companyId, decision);
    const c = await companyById(companyId);
    return setResearchStatus(companyId, 'researched',
      note || (c.decision ? 'Decision on record: ' + RUN.label('DECISIONS', c.decision) : ''));
  }

  /* ---------- simple collections: catalysts, risks, questions, tasks ---------- */
  function collection(table, hooks = {}) {
    return {
      async add(companyId, input) {
        const row = await add(table, { companyId, ...(hooks.clean ? hooks.clean(input, null) : input) });
        await done(companyId);
        return row;
      },
      async update(id, companyId, input, previous) {
        const fields = hooks.clean ? hooks.clean(input, previous) : input;
        const row = await patch(table, id, fields);
        if (hooks.afterUpdate) await hooks.afterUpdate(row, previous);
        await done(companyId);
        return row;
      },
      async remove(id, companyId) { await del(table, id); await done(companyId); }
    };
  }

  const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

  const facts = collection('key_facts', {
    clean: i => pick(i, ['fact', 'detail', 'source', 'observedOn'])
  });

  const catalysts = collection('catalysts', {
    clean: i => pick(i, ['title', 'description', 'expectedDate', 'importance', 'status', 'notes']),
    async afterUpdate(row, prev) {
      if (prev && prev.status !== row.status && ['occurred', 'cancelled', 'delayed'].includes(row.status)) {
        await log(row.companyId, {
          type: 'catalyst', title: `Catalyst ${RUN.label('CATALYST_STATUS', row.status).toLowerCase()}: ${row.title}`,
          note: row.notes || '', field: 'status',
          previous: RUN.label('CATALYST_STATUS', prev.status), next: RUN.label('CATALYST_STATUS', row.status)
        });
      }
    }
  });

  const risks = collection('risks', {
    clean: i => pick(i, ['title', 'description', 'severity', 'probability', 'confirmationSignal', 'mitigation', 'status']),
    async afterUpdate(row, prev) {
      if (prev && prev.status !== row.status) {
        await log(row.companyId, {
          type: 'risk', title: `Risk status changed: ${row.title}`, note: row.mitigation || '', field: 'status',
          previous: RUN.label('RISK_STATUS', prev.status), next: RUN.label('RISK_STATUS', row.status)
        });
      }
    }
  });

  const questions = collection('open_questions', {
    clean(i, prev) {
      const f = pick(i, ['question', 'whyItMatters', 'status', 'answer', 'source', 'resolvedOn']);
      if ('status' in f) {
        if (f.status === 'resolved' && !(f.resolvedOn || (prev && prev.resolvedOn))) f.resolvedOn = today();
        if (f.status !== 'resolved') f.resolvedOn = null;
      }
      return f;
    },
    async afterUpdate(row, prev) {
      if (prev && prev.status !== 'resolved' && row.status === 'resolved') {
        await log(row.companyId, {
          type: 'question', title: `Question resolved: ${row.question}`,
          note: [row.answer, row.source ? 'Source: ' + row.source : ''].filter(Boolean).join('\n'),
          happenedOn: row.resolvedOn || today()
        });
      }
    }
  });

  const tasks = collection('tasks', {
    clean(i) {
      const f = pick(i, ['title', 'description', 'dueDate', 'priority', 'completed']);
      if ('completed' in f) f.completedAt = f.completed ? nowISO() : null;
      return f;
    }
  });

  /* ---------- reviews ---------- */
  async function openReview(companyId) {
    const rows = await list('company_reviews', { eq: { company_id: companyId, status: 'scheduled' }, order: [{ col: 'scheduled_for', asc: true }] });
    return rows[0] || null;
  }
  async function scheduleReview(companyId, r) {
    const fields = {
      scheduledFor: r.scheduledFor || null,
      triggerType: r.triggerType || 'date',
      triggerNote: String(r.triggerNote || ''),
      catalystId: r.catalystId || null,
      recurrenceDays: num(r.recurrenceDays)
    };
    const open = await openReview(companyId);
    const row = open ? await patch('company_reviews', open.id, fields)
      : await add('company_reviews', { companyId, status: 'scheduled', ...fields });
    await done(companyId);
    return row;
  }
  async function cancelReview(companyId) {
    const open = await openReview(companyId);
    if (open) await patch('company_reviews', open.id, { status: 'cancelled' });
    await done(companyId);
  }
  async function completeReview(companyId, { notes = '', completedOn } = {}) {
    const on = completedOn || today();
    const open = await openReview(companyId);
    if (open) await patch('company_reviews', open.id, { status: 'completed', completedOn: on, reviewNotes: String(notes) });
    else await add('company_reviews', { companyId, status: 'completed', completedOn: on, reviewNotes: String(notes), triggerType: 'date' });
    let next = null;
    if (open && open.recurrenceDays) {
      next = await add('company_reviews', {
        companyId, status: 'scheduled', scheduledFor: addDays(on, open.recurrenceDays),
        triggerType: open.triggerType, triggerNote: open.triggerNote, recurrenceDays: open.recurrenceDays
      });
    }
    await log(companyId, {
      type: 'review', title: 'Review completed', happenedOn: on,
      note: [notes, next ? 'Next review scheduled for ' + next.scheduledFor : ''].filter(Boolean).join('\n')
    });
    await done(companyId);
    return next;
  }

  /* ---------- research files ---------- */
  function safeName(name) {
    const clean = String(name || 'file').normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/-\./g, '.').replace(/^-|-$/g, '');
    return (clean || 'file').slice(-120);
  }
  async function uploadFile(companyId, file, meta = {}) {
    requireUser();
    if (file.size > 50 * 1024 * 1024) throw friendly({ message: 'Payload too large' });
    const type = RUN.DOC_TYPES.find(d => d.value === meta.docType) || RUN.DOC_TYPES.find(d => d.value === 'other');
    const path = `${user.id}/${companyId}/${type.folder}/${Date.now()}-${safeName(file.name)}`;
    await files().upload(path, file);
    try {
      const row = await add('research_files', {
        companyId, fileName: file.name, docType: type.value, docDate: meta.docDate || null,
        description: String(meta.description || ''), storagePath: path,
        sizeBytes: file.size, mimeType: file.type || ''
      });
      await done(companyId);
      return row;
    } catch (err) {
      await files().remove([path]).catch(() => {});   // never leave an orphan file behind
      throw err;
    }
  }
  async function updateFile(id, companyId, input) {
    const row = await patch('research_files', id, pick(input, ['fileName', 'docType', 'docDate', 'description']));
    await done(companyId);
    return row;
  }
  async function deleteFile(fileRow) {
    if (fileRow.storagePath) await files().remove([fileRow.storagePath]);
    await del('research_files', fileRow.id);
    await done(fileRow.companyId);
  }
  const fileUrls = paths => files().urls(paths.filter(Boolean));
  const fileUrl = (path, opts) => files().url(path, opts);

  /* ---------- research history ---------- */
  async function addUpdate(companyId, u) {
    if (!String(u.title || '').trim()) throw friendly({ message: 'Give the update a title.' });
    const row = await log(companyId, {
      type: u.type || 'note', title: String(u.title).trim(), note: u.note || '', happenedOn: u.happenedOn || today(),
      field: u.field || null, previous: u.previous || null, next: u.next || null
    });
    await done(companyId);
    return row;
  }
  async function deleteUpdate(id, companyId) { await del('research_updates', id); await done(companyId); }

  /* ---------- saved links (Google Drive, exchange filings, company site) ---------- */
  async function addLink(companyId, meta = {}) {
    const url = String(meta.url || '').trim();
    if (!/^https:\/\/\S+$/i.test(url)) throw friendly({ message: 'Paste a full link starting with https:// (for example a Google Drive share link).' });
    let name = String(meta.fileName || '').trim();
    if (!name) {
      try {
        const u = new URL(url);
        name = /drive\.google|docs\.google/.test(u.hostname) ? 'Google Drive document'
          : decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname);
      } catch (e) { name = 'Link'; }
    }
    const type = RUN.DOC_TYPES.find(d => d.value === meta.docType) ? meta.docType : 'other';
    const row = await add('research_files', {
      companyId, source: 'link', url, fileName: name.slice(0, 200), docType: type, docDate: meta.docDate || null,
      description: String(meta.description || ''), storagePath: null, sizeBytes: null, mimeType: ''
    });
    await done(companyId);
    return row;
  }
  async function updateLink(id, companyId, input) {
    const f = pick(input, ['fileName', 'docType', 'docDate', 'description', 'url']);
    if ('url' in f && !/^https:\/\/\S+$/i.test(String(f.url).trim())) throw friendly({ message: 'Links must start with https://' });
    const row = await patch('research_files', id, f);
    await done(companyId);
    return row;
  }
  async function storageUsage() {
    const rows = await list('research_files', { select: 'size_bytes,source' });
    const used = rows.filter(r => r.source !== 'link').reduce((s, r) => s + (Number(r.sizeBytes) || 0), 0);
    return { used, limit: (RUN.STORAGE_LIMIT_MB || 1024) * 1024 * 1024, uploads: rows.filter(r => r.source !== 'link').length, links: rows.filter(r => r.source === 'link').length };
  }

  /* ---------- watchlists ---------- */
  const watchlists = {
    async list() {
      const [lists, items] = await Promise.all([
        list('watchlists', { order: [{ col: 'sort_order', asc: true }, { col: 'created_at', asc: true }] }),
        list('watchlist_items', { select: 'watchlist_id,company_id' })
      ]);
      return lists.map(w => ({ ...w, companyIds: items.filter(i => i.watchlistId === w.id).map(i => i.companyId) }));
    },
    async create(name, description = '') {
      name = String(name || '').trim();
      if (!name) throw friendly({ message: 'Give the list a name.' });
      const existing = await list('watchlists', { select: 'sort_order,name' });
      if (existing.some(w => w.name.toLowerCase() === name.toLowerCase())) throw friendly({ message: `You already have a list called “${name}”.` });
      const row = await add('watchlists', { name: name.slice(0, 80), description, sortOrder: existing.length * 10 });
      invalidate();
      return row;
    },
    async rename(id, name) {
      name = String(name || '').trim();
      if (!name) throw friendly({ message: 'Give the list a name.' });
      const existing = await list('watchlists', { select: 'id,name' });
      if (existing.some(w => w.id !== id && w.name.toLowerCase() === name.toLowerCase())) throw friendly({ message: `You already have a list called “${name}”.` });
      const row = await patch('watchlists', id, { name: name.slice(0, 80) });
      invalidate();
      return row;
    },
    async remove(id) { await del('watchlists', id); invalidate(); },
    async setMember(watchlistId, companyId, on) {
      const cur = await list('watchlist_items', { eq: { watchlist_id: watchlistId, company_id: companyId } });
      if (on && !cur.length) await add('watchlist_items', { watchlistId, companyId });
      if (!on) for (const r of cur) await del('watchlist_items', r.id);
      invalidate();
    },
    /* Make the list contain exactly these companies. */
    async setMembers(watchlistId, companyIds) {
      const cur = await list('watchlist_items', { eq: { watchlist_id: watchlistId } });
      const want = new Set(companyIds);
      const have = new Set(cur.map(r => r.companyId));
      for (const r of cur) if (!want.has(r.companyId)) await del('watchlist_items', r.id);
      const toAdd = [...want].filter(id => !have.has(id));
      if (toAdd.length) await addMany('watchlist_items', toAdd.map(companyId => ({ watchlistId, companyId })));
      invalidate();
      return { added: toAdd.length, removed: cur.filter(r => !want.has(r.companyId)).length };
    }
  };

  /* ---------- import companies from CSV rows ---------- */
  async function findOrCreateCompany(row, cache, createdList) {
    const t = String(row.ticker || '').toUpperCase();
    const ex = String(row.exchange || '').toUpperCase();
    let hit = null;
    if (t) hit = cache.find(c => (c.ticker || '').toUpperCase() === t && (!ex || !c.exchange || c.exchange.toUpperCase() === ex));
    if (!hit && row.name) hit = cache.find(c => c.name.toLowerCase() === String(row.name).toLowerCase());
    if (hit) return { company: hit, created: false };
    const c = await createCompany({
      name: row.name || t, ticker: t, exchange: ex, sector: row.sector || '', description: row.description || '',
      researchStatus: row.researchStatus || 'watch', importNote: row.importNote || 'Imported from a CSV file'
    });
    cache.push(c);
    if (createdList) createdList.push(c);
    return { company: c, created: true };
  }

  async function importCompanies(rows, watchlistId = null) {
    requireUser();
    const cache = await list('companies');
    let created = 0, matched = 0, priced = 0;
    const ids = [];
    for (const r of rows) {
      const { company, created: isNew } = await findOrCreateCompany(r, cache);
      if (isNew) created++; else matched++;
      ids.push(company.id);
      if (r.currentPrice != null) { await patch('companies', company.id, { currentPrice: r.currentPrice, priceAsOf: today(), priceSource: 'import' }); priced++; }
    }
    if (watchlistId) {
      const cur = await list('watchlist_items', { select: 'company_id', eq: { watchlist_id: watchlistId } });
      const have = new Set(cur.map(x => x.companyId));
      const toAdd = [...new Set(ids)].filter(id => !have.has(id));
      if (toAdd.length) await addMany('watchlist_items', toAdd.map(companyId => ({ watchlistId, companyId })));
    }
    invalidate();
    return { created, matched, priced };
  }

  /* ---------- transactions ---------- */
  function cleanTrade(t) {
    const type = t.type === 'sell' ? 'sell' : t.type === 'buy' ? 'buy' : null;
    const quantity = num(t.quantity), price = num(t.price), fees = num(t.fees) || 0;
    if (!type) throw friendly({ message: 'Choose Buy or Sell.' });
    if (!quantity || quantity <= 0) throw friendly({ message: 'Quantity must be more than zero.' });
    if (price == null || price < 0) throw friendly({ message: 'Enter the price per share.' });
    if (fees < 0) throw friendly({ message: 'Charges cannot be negative.' });
    return { type, quantity, price, fees, tradeDate: t.tradeDate || today(), notes: String(t.notes || '') };
  }
  const transactions = {
    async add(companyId, input) {
      const t = cleanTrade(input);
      const row = await add('transactions', { companyId, ...t, source: 'manual' });
      const c = await companyById(companyId);
      await log(companyId, {
        type: 'trade', happenedOn: t.tradeDate,
        title: `${t.type === 'buy' ? 'Bought' : 'Sold'} ${t.quantity} shares at ${RUN.money(t.price, c.priceCurrency)}`,
        note: [t.fees ? `Charges ${RUN.money(t.fees, c.priceCurrency)}` : '', t.notes].filter(Boolean).join(' · ')
      });
      await done(companyId);
      return row;
    },
    async update(id, companyId, input) {
      const row = await patch('transactions', id, cleanTrade(input));
      await done(companyId);
      return row;
    },
    async remove(id, companyId) { await del('transactions', id); await done(companyId); },

    /* rows from IO.readTrades(); creates missing companies, skips duplicates */
    async importMany(rows) {
      requireUser();
      const cache = await list('companies');
      const existing = new Set((await list('transactions', { select: 'external_id' })).map(r => r.externalId).filter(Boolean));
      const createdCos = [], touched = new Map();
      let added = 0, dupes = 0, priced = 0;
      const batch = [];
      for (const r of rows) {
        if (r.externalId && existing.has(r.externalId)) { dupes++; continue; }
        const { company } = await findOrCreateCompany({ ticker: r.ticker, exchange: r.exchange, name: r.name || r.ticker, importNote: 'Created by a trades import' }, cache, createdCos);
        const t = cleanTrade(r);
        batch.push({ companyId: company.id, ...t, source: 'import', externalId: r.externalId || null });
        if (r.externalId) existing.add(r.externalId);
        touched.set(company.id, (touched.get(company.id) || 0) + 1);
        if (r.ltp != null) { await patch('companies', company.id, { currentPrice: r.ltp, priceAsOf: today(), priceSource: 'import' }); priced++; }
      }
      for (let i = 0; i < batch.length; i += 200) {
        added += (await addMany('transactions', batch.slice(i, i + 200))).length;
      }
      for (const [companyId, n] of touched) {
        await log(companyId, { type: 'trade', title: `Imported ${n} trade${n === 1 ? '' : 's'}` });
        await touch(companyId);
      }
      invalidate();
      return { added, dupes, companiesCreated: createdCos.length, priced };
    }
  };

  /* ---------- portfolio settings ---------- */
  async function settings() {
    return (await list('portfolio_settings'))[0] || null;
  }
  async function setCash(amount) {
    const v = num(amount);
    if (v != null && v < 0) throw friendly({ message: 'Cash cannot be negative.' });
    const cur = await settings();
    const row = cur ? await patch('portfolio_settings', cur.id, { cashBalance: v }) : await add('portfolio_settings', { cashBalance: v });
    invalidate();
    return row;
  }

  /* ---------- portfolio (everything the Portfolio page needs) ---------- */
  async function portfolio() {
    return cached('portfolio', async () => {
      const [companies, txs, decisions, st] = await Promise.all([
        overview(),
        list('transactions', { order: [{ col: 'trade_date', asc: false }, { col: 'created_at', asc: false }] }),
        list('investment_decisions', { select: 'company_id,max_allocation_pct,position_size_pct,created_at', order: [{ col: 'created_at', asc: false }] }),
        settings()
      ]);
      const result = Portfolio.compute({ companies, transactions: txs, decisions, cash: st ? st.cashBalance : null, today: today() });
      const byId = Object.fromEntries(companies.map(c => [c.id, c]));
      result.transactions = txs.map(t => ({ ...t, company: byId[t.companyId] })).filter(t => t.company);
      result.companies = companies;
      return result;
    });
  }

  /* Update many prices at once: { companyId: price } */
  async function setPrices(map, asOf) {
    let n = 0;
    for (const [companyId, price] of Object.entries(map)) {
      const v = num(price);
      if (v == null || v < 0) continue;
      await patch('companies', companyId, { currentPrice: v, priceAsOf: asOf || today(), priceSource: 'manual' });
      n++;
    }
    invalidate();
    return n;
  }

  /* ---------- full backup ---------- */
  const BACKUP_TABLES = ['companies', 'company_thesis', 'research_checklist_items', 'key_facts', 'valuation_snapshots',
    'investment_decisions', 'catalysts', 'risks', 'open_questions', 'tasks', 'company_reviews', 'research_files',
    'research_updates', 'watchlists', 'watchlist_items', 'transactions', 'portfolio_settings',
    'ipo_persons', 'ipo_categories', 'ipos', 'ipo_applications'];
  async function backup() {
    requireUser();
    const out = { app: 'RUN Watchlist', version: 3, exportedAt: nowISO(), account: user.email || null, tables: {} };
    for (const t of BACKUP_TABLES) out.tables[t] = await store().list(t, {});
    return out;
  }

  /* ---------- IPO tracker ---------- */
  const ipoPick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));
  const numOrNull = v => num(v);
  const intOrNull = v => { const x = num(v); return x == null ? null : Math.round(x); };

  async function ipoData() {
    return cached('ipo', async () => {
      let [persons, categories, ipos, apps] = await Promise.all([
        list('ipo_persons', { order: [{ col: 'sort_order', asc: true }, { col: 'created_at', asc: true }] }),
        list('ipo_categories', { order: [{ col: 'sort_order', asc: true }, { col: 'created_at', asc: true }] }),
        list('ipos', { order: [{ col: 'created_at', asc: false }] }),
        list('ipo_applications', { order: [{ col: 'created_at', asc: true }] })
      ]);
      if (!categories.length) {
        categories = await addMany('ipo_categories', IPO.DEFAULT_CATEGORIES.map((name, i) => ({ name, sortOrder: i * 10 })));
      }
      return { persons, categories, ipos, apps };
    });
  }
  const ipoDone = () => { delete cache.ipo; };

  function cleanIpo(f) {
    const out = ipoPick(f, ['name', 'symbol', 'board', 'openDate', 'closeDate', 'allotmentDate', 'listingDate', 'issuePrice', 'lotSize', 'listingPrice', 'notes']);
    if ('name' in out) { out.name = String(out.name || '').trim(); if (!out.name) throw friendly({ message: 'Give the IPO a name.' }); }
    if ('symbol' in out) out.symbol = String(out.symbol || '').trim().toUpperCase();
    if ('board' in out) out.board = out.board === 'sme' ? 'sme' : 'mainboard';
    for (const k of ['issuePrice', 'listingPrice']) if (k in out) out[k] = numOrNull(out[k]);
    if ('lotSize' in out) { out.lotSize = intOrNull(out.lotSize); if (out.lotSize != null && out.lotSize <= 0) throw friendly({ message: 'Lot size must be more than zero.' }); }
    for (const k of ['openDate', 'closeDate', 'allotmentDate', 'listingDate']) if (k in out) out[k] = out[k] || null;
    return out;
  }
  function cleanApp(f) {
    const out = ipoPick(f, ['personId', 'category', 'lots', 'amount', 'funding', 'outcome', 'sharesAllotted', 'sellPrice', 'sellDate',
      'charges', 'loanAmount', 'loanInterest', 'settled', 'settledOn', 'applicationNo', 'notes']);
    if ('category' in out) { out.category = String(out.category || '').trim() || 'Retail'; }
    if ('lots' in out) { out.lots = intOrNull(out.lots) || 1; if (out.lots < 1) throw friendly({ message: 'Lots must be at least 1.' }); }
    if ('funding' in out && !['sent', 'self', 'own'].includes(out.funding)) out.funding = 'sent';
    if ('outcome' in out && !['pending', 'allotted', 'not_allotted', 'cancelled'].includes(out.outcome)) out.outcome = 'pending';
    for (const k of ['amount', 'sellPrice', 'loanAmount']) if (k in out) out[k] = numOrNull(out[k]);
    for (const k of ['charges', 'loanInterest']) if (k in out) out[k] = numOrNull(out[k]) || 0;
    if ('sharesAllotted' in out) out.sharesAllotted = intOrNull(out.sharesAllotted);
    if ('sellDate' in out) out.sellDate = out.sellDate || null;
    if ('settled' in out) { out.settled = !!out.settled; if (!('settledOn' in out)) out.settledOn = out.settled ? today() : null; }
    for (const k of ['amount', 'sellPrice', 'loanAmount', 'charges', 'loanInterest', 'sharesAllotted']) {
      if (out[k] != null && out[k] < 0) throw friendly({ message: 'Amounts cannot be negative.' });
    }
    return out;
  }

  const ipoApi = {
    data: ipoData,
    persons: {
      async add(name, extra = {}) {
        name = String(name || '').trim();
        if (!name) throw friendly({ message: 'Enter the person\'s name.' });
        const d = await ipoData();
        if (d.persons.some(p => p.name.toLowerCase() === name.toLowerCase())) throw friendly({ message: `${name} is already in your list.` });
        const row = await add('ipo_persons', { name: name.slice(0, 80), isSelf: !!extra.isSelf, notes: String(extra.notes || ''), sortOrder: d.persons.length * 10 });
        ipoDone(); return row;
      },
      async update(id, f) {
        const out = ipoPick(f, ['name', 'isSelf', 'active', 'notes']);
        if ('name' in out) { out.name = String(out.name).trim(); if (!out.name) throw friendly({ message: 'Enter a name.' }); }
        const row = await patch('ipo_persons', id, out); ipoDone(); return row;
      },
      async remove(id) {
        const d = await ipoData();
        const n = d.apps.filter(a => a.personId === id).length;
        if (n) throw friendly({ message: `This person has ${n} application${n === 1 ? '' : 's'}. Hide them instead, so the history stays correct.` });
        await del('ipo_persons', id); ipoDone();
      }
    },
    categories: {
      async add(name) {
        name = String(name || '').trim();
        if (!name) throw friendly({ message: 'Enter a category name.' });
        const d = await ipoData();
        if (d.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) throw friendly({ message: `“${name}” already exists.` });
        const row = await add('ipo_categories', { name: name.slice(0, 40), sortOrder: d.categories.length * 10 }); ipoDone(); return row;
      },
      async rename(id, name) {
        name = String(name || '').trim();
        if (!name) throw friendly({ message: 'Enter a category name.' });
        const d = await ipoData();
        const cat = d.categories.find(c => c.id === id);
        if (!cat) return;
        if (d.categories.some(c => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) throw friendly({ message: `“${name}” already exists.` });
        await patch('ipo_categories', id, { name });
        for (const a of d.apps.filter(a => a.category === cat.name)) await patch('ipo_applications', a.id, { category: name });
        ipoDone();
      },
      async remove(id) { await del('ipo_categories', id); ipoDone(); }
    },
    ipos: {
      async add(f) { const row = await add('ipos', cleanIpo({ name: '', ...f })); ipoDone(); return row; },
      async update(id, f) { const row = await patch('ipos', id, cleanIpo(f)); ipoDone(); return row; },
      async remove(id) { await del('ipos', id); ipoDone(); }
    },
    apps: {
      async add(ipoId, f) {
        const v = cleanApp({ category: 'Retail', lots: 1, funding: 'sent', ...f });
        if (!v.personId) throw friendly({ message: 'Choose a person.' });
        const d = await ipoData();
        if (d.apps.some(a => a.ipoId === ipoId && a.personId === v.personId && a.category === v.category)) {
          const p = d.persons.find(x => x.id === v.personId);
          throw friendly({ message: `${p ? p.name : 'This person'} already has a ${v.category} application in this IPO.` });
        }
        const row = await add('ipo_applications', { ipoId, ...v }); ipoDone(); return row;
      },
      /* One application for every active person who doesn't already have this category in the IPO. */
      async addForEveryone(ipoId, f) {
        const d = await ipoData();
        const v = cleanApp({ category: 'Retail', lots: 1, funding: 'sent', ...f });
        const have = new Set(d.apps.filter(a => a.ipoId === ipoId && a.category === v.category).map(a => a.personId));
        const people = d.persons.filter(p => p.active && !have.has(p.id));
        if (!people.length) return 0;
        await addMany('ipo_applications', people.map(p => ({ ipoId, ...v, personId: p.id, funding: p.isSelf ? 'self' : v.funding })));
        ipoDone(); return people.length;
      },
      async update(id, f, ipo) {
        const v = cleanApp(f);
        if (v.outcome === 'allotted' && !('sharesAllotted' in f) && ipo) {
          const d = await ipoData();
          const cur = d.apps.find(a => a.id === id);
          if (cur && cur.sharesAllotted == null) v.sharesAllotted = ipo.lotSize || null;
        }
        if (v.outcome && v.outcome !== 'allotted') { v.sharesAllotted = null; v.sellPrice = null; v.sellDate = null; }
        const row = await patch('ipo_applications', id, v); ipoDone(); return row;
      },
      async remove(id) { await del('ipo_applications', id); ipoDone(); },
      async applySellPrice(ipoId, price, date, { overwrite = false } = {}) {
        const p = num(price);
        if (p == null || p < 0) throw friendly({ message: 'Enter the sell price.' });
        const d = await ipoData();
        const targets = d.apps.filter(a => a.ipoId === ipoId && a.outcome === 'allotted' && (overwrite || a.sellPrice == null));
        for (const a of targets) await patch('ipo_applications', a.id, { sellPrice: p, sellDate: date || today() });
        const ipo = d.ipos.find(i => i.id === ipoId);
        if (ipo && ipo.listingPrice == null) await patch('ipos', ipoId, { listingPrice: p, listingDate: ipo.listingDate || date || today() });
        ipoDone(); return targets.length;
      },
      async settleAll(ipoId) {
        const d = await ipoData();
        const targets = d.apps.filter(a => a.ipoId === ipoId && a.funding === 'sent' && !a.settled && a.outcome !== 'pending');
        for (const a of targets) await patch('ipo_applications', a.id, { settled: true, settledOn: today() });
        ipoDone(); return targets.length;
      }
    },
    /* rows: [{ ipo, symbol, issuePrice, lotSize, listingDate, person, category, lots, amount, funding, outcome, shares,
                sellPrice, sellDate, charges, loanAmount, loanInterest, settled, notes }] */
    async importRows(rows) {
      requireUser();
      let d = await ipoData();
      const ipoByName = new Map(d.ipos.map(i => [i.name.toLowerCase(), i]));
      const personByName = new Map(d.persons.map(p => [p.name.toLowerCase(), p]));
      const catNames = new Set(d.categories.map(c => c.name.toLowerCase()));
      let created = 0, updated = 0, newIpos = 0, newPeople = 0;
      for (const r of rows) {
        let ipo = ipoByName.get(r.ipo.toLowerCase());
        if (!ipo) {
          ipo = await add('ipos', cleanIpo({ name: r.ipo, symbol: r.symbol || '', issuePrice: r.issuePrice, lotSize: r.lotSize, listingDate: r.listingDate || null, closeDate: r.closeDate || null }));
          ipoByName.set(r.ipo.toLowerCase(), ipo); newIpos++;
        }
        let person = personByName.get(r.person.toLowerCase());
        if (!person) {
          person = await add('ipo_persons', { name: r.person, sortOrder: personByName.size * 10 });
          personByName.set(r.person.toLowerCase(), person); newPeople++;
        }
        const category = r.category || 'Retail';
        if (!catNames.has(category.toLowerCase())) { await add('ipo_categories', { name: category, sortOrder: catNames.size * 10 }); catNames.add(category.toLowerCase()); }
        const v = cleanApp({ personId: person.id, category, lots: r.lots || 1, amount: r.amount, funding: r.funding || 'sent',
          outcome: r.outcome || 'pending', sharesAllotted: r.shares, sellPrice: r.sellPrice, sellDate: r.sellDate,
          charges: r.charges, loanAmount: r.loanAmount, loanInterest: r.loanInterest, settled: !!r.settled, notes: r.notes || '' });
        if (v.outcome !== 'allotted') { v.sharesAllotted = null; v.sellPrice = null; v.sellDate = null; }
        const existing = d.apps.find(a => a.ipoId === ipo.id && a.personId === person.id && a.category === category);
        if (existing) { await patch('ipo_applications', existing.id, v); updated++; }
        else { const row = await add('ipo_applications', { ipoId: ipo.id, ...v }); d.apps.push(row); created++; }
      }
      ipoDone();
      return { created, updated, newIpos, newPeople };
    }
  };

  /* ---------- global desk: open tasks, reviews due, recent updates ---------- */
  async function desk() {
    return cached('desk', async () => {
      const [companies, openTasks, updates] = await Promise.all([
        overview(),
        list('tasks', { eq: { completed: false }, order: [{ col: 'due_date', asc: true }, { col: 'created_at', asc: true }] }),
        list('research_updates', { order: [{ col: 'created_at', asc: false }], limit: 30 })
      ]);
      const byId = Object.fromEntries(companies.map(c => [c.id, c]));
      const t = today();
      const reviews = companies.filter(c => c.nextReview)
        .map(c => ({ company: c, ...c.nextReview }))
        .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
      return {
        today: t,
        companies,
        tasks: openTasks.map(x => ({ ...x, company: byId[x.companyId] })).filter(x => x.company),
        reviews,
        reviewsDue: reviews.filter(r => r.date && r.date <= addDays(t, 14)),
        updates: updates.map(u => ({ ...u, company: byId[u.companyId] })).filter(u => u.company)
      };
    });
  }

  async function stats() {
    const all = await overview();
    const t = today();
    return {
      tracked: all.length,
      researching: all.filter(c => c.status === 'researching').length,
      researched: all.filter(c => c.status === 'researched').length,
      watching: all.filter(c => c.status === 'watch').length,
      sectors: new Set(all.map(c => c.sector).filter(Boolean)).size,
      withOpenTasks: all.filter(c => c.openTasks > 0).length,
      openTasks: all.reduce((s, c) => s + c.openTasks, 0),
      openQuestions: all.reduce((s, c) => s + c.openQuestions, 0),
      reviewsDue: all.filter(c => c.nextReview && c.nextReview.date && c.nextReview.date <= t).length,
      reviewsSoon: all.filter(c => c.nextReview && c.nextReview.date && c.nextReview.date <= addDays(t, 14)).length,
      noDecision: all.filter(c => !c.decision).length
    };
  }

  /* ----------------------------------------------------------
     5. AUTH
     ---------------------------------------------------------- */
  const authListeners = new Set();
  let recovering = false;

  async function init() {
    if (mode === 'supabase') {
      try {
        const { data } = await client.auth.getSession();
        user = data && data.session ? data.session.user : null;
      } catch (e) { user = null; }
      client.auth.onAuthStateChange((event, session) => {
        const before = user ? user.id : null;
        user = session ? session.user : null;
        if (event === 'PASSWORD_RECOVERY') recovering = true;
        if (before !== (user ? user.id : null) || event === 'PASSWORD_RECOVERY' || event === 'SIGNED_OUT') {
          invalidate();
          // Run listeners outside the auth callback (Supabase recommends this).
          setTimeout(() => authListeners.forEach(fn => { try { fn(event, user); } catch (e) { console.error(e); } }), 0);
        }
      });
    } else if (mode === 'local') {
      user = { id: 'local', email: 'this browser' };
      LocalStore.load();
      if (!LocalStore.db.seeded) {
        LocalStore.db.seeded = true;
        LocalStore.save();
        try { await importStarter(); } catch (e) { console.warn(e); }
      }
    }
  }

  const auth = {
    mode: () => mode,
    configError: () => configError,
    user: () => user,
    isSignedIn: () => !!user,
    needsSignIn: () => mode === 'supabase' && !user,
    isRecovering: () => recovering,
    async signIn(email, password) {
      if (mode !== 'supabase') return user;
      const { data, error } = await client.auth.signInWithPassword({ email: String(email).trim(), password });
      if (error) throw friendly(error);
      user = data.user;
      invalidate();
      return user;
    },
    async signOut() {
      if (mode !== 'supabase') return;
      await client.auth.signOut();
      user = null;
      invalidate();
    },
    async sendPasswordReset(email) {
      if (mode !== 'supabase') return;
      const redirectTo = location.origin + location.pathname;
      const { error } = await client.auth.resetPasswordForEmail(String(email).trim(), { redirectTo });
      if (error) throw friendly(error);
    },
    async setNewPassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw friendly(error);
      recovering = false;
    },
    onChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); }
  };

  /* ----------------------------------------------------------
     6. PRICE PROVIDER HOOK
     Prices are typed in by hand today. To connect a market-data
     source later, register a function that returns prices:

       DataLayer.prices.register(async (companies) => {
         // return { [companyId]: { price: 1024.5, asOf: '2026-09-28' } }
       });
       await DataLayer.prices.refresh();

     Nothing else in the app needs to change.
     ---------------------------------------------------------- */
  let priceProvider = null;
  const prices = {
    register(fn) { priceProvider = typeof fn === 'function' ? fn : null; },
    hasProvider: () => !!priceProvider,
    async refresh() {
      if (!priceProvider) return 0;
      const all = await overview();
      const quotes = (await priceProvider(all)) || {};
      let n = 0;
      for (const [companyId, q] of Object.entries(quotes)) {
        if (q && num(q.price) != null) {
          await patch('companies', companyId, { currentPrice: num(q.price), priceAsOf: q.asOf || today(), priceSource: q.source || 'feed' });
          n++;
        }
      }
      invalidate();
      return n;
    }
  };

  /* ----------------------------------------------------------
     PUBLIC API
     (getAll / getById / getWatchlist / getResearched / getStats /
      addCompany are kept so the original views keep working.)
     ---------------------------------------------------------- */
  return {
    init, auth, prices, invalidate,
    isSupabase: () => mode === 'supabase',
    mode: () => mode,
    util: { today, addDays, daysBetween, tsToLocalDate, num, slugify },

    // original API
    getAll: () => overview(),
    async getById(idOrSlug) { return (await overview()).find(c => c.id === idOrSlug || c.slug === idOrSlug) || null; },
    getWatchlist: () => overview(),
    async getResearched() { return (await overview()).filter(c => c.researched); },
    getStats: () => stats(),
    addCompany: (c) => createCompany(c),

    // companies
    overview, workspace, createCompany, updateCompany, deleteCompany, importStarter,
    setResearchStatus, completeResearch, setPrice,

    // research
    saveThesis,
    checklist: { update: updateChecklistItem, add: addChecklistItem, remove: deleteChecklistItem },
    saveValuation, deleteValuation,
    recordDecision,
    facts, catalysts, risks, questions, tasks,
    reviews: { schedule: scheduleReview, cancel: cancelReview, complete: completeReview },
    files: { upload: uploadFile, update: updateFile, remove: deleteFile, urls: fileUrls, url: fileUrl },
    updates: { add: addUpdate, remove: deleteUpdate },
    links: { add: addLink, update: updateLink },
    storageUsage,
    watchlists, importCompanies,
    transactions, portfolio, setPrices, settings, setCash,
    backup,
    ipo: ipoApi,
    desk
  };
})();

/* Small helper used by the views to sort by most-recently-updated. */
const byLastUpdated = (a, b) => (b.lastActivityAt || b.lastUpdated || '').localeCompare(a.lastActivityAt || a.lastUpdated || '');
