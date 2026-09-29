/* ============================================================
   RUN WATCHLIST — js/app.js

   Contains:
     · the research opener (opens a research HTML file in a new tab)
     · the Views object — renders Home, Watchlist, Researched, Sectors
     · the hero constellation canvas
     · CompanyForm — the Add / Edit company dialog
     · the hash router, sign-in view, mobile menu, scroll progress

   Shared helpers live in js/ui.js, all data access in
   js/datalayer.js, the company workspace in js/workspace.js and
   the Desk in js/desk.js.
   ============================================================ */

/* ------------------------------------------------------------
   RESEARCH OPENER
   Research documents are standalone HTML files in research/.
   They are opened, never rewritten.
   ------------------------------------------------------------ */
function openResearch(path) {
  if (!path) return false;
  window.open(path, '_blank', 'noopener');
  return true;
}

/* ------------------------------------------------------------
   VIEWS
   ------------------------------------------------------------ */
const Views = (() => {

  const signedIn = () => DataLayer.auth.isSignedIn();

  function signinNotice(text) {
    return `
      <div class="locked">
        <span class="locked__mark" aria-hidden="true"></span>
        <p class="locked__text">${esc(text || 'This workspace is private.')}</p>
        <a class="arrow-link" href="#/signin">Sign in <span aria-hidden="true">→</span></a>
      </div>`;
  }

  /* Useful status facts under each company — kept to one quiet line. */
  function factsLine(c) {
    const facts = [];
    if (c.progress && c.progress.total) {
      facts.push(`<span class="fact fact--bar">${UI.bar(c.progress.pct, 'bar--xs')}<span>${c.progress.pct}%</span></span>`);
    }
    if (c.decision) facts.push(`<span class="fact">${esc(UI.decisionLabel(c.decision))}</span>`);
    if (c.position) facts.push(`<span class="fact fact--held">Held · ${c.position.alloc.toFixed(1)}%</span>`);
    if (c.currentPrice != null) facts.push(`<span class="fact">${esc(UI.money(c.currentPrice, c.priceCurrency))}</span>`);
    if (c.nextReview && c.nextReview.date) {
      const overdue = UI.isOverdue(c.nextReview.date);
      facts.push(`<span class="fact${overdue ? ' is-signal' : ''}">Review ${overdue ? 'overdue' : esc(fmtShortDate(c.nextReview.date))}</span>`);
    }
    if (c.overdueTasks) facts.push(`<span class="fact is-signal">${c.overdueTasks} task${c.overdueTasks === 1 ? '' : 's'} overdue</span>`);
    return facts.length ? `<p class="entry__facts">${facts.join('')}</p>` : '';
  }

  function entryRow(c) {
    return `
      <li class="entry" data-status="${esc(c.status)}">
        <a class="entry__link" href="#/company/${esc(c.slug)}">
          <span class="entry__rail"><span class="entry__node" aria-hidden="true"></span></span>
          <div class="entry__main">
            <div class="entry__title">
              <span class="entry__name">${esc(c.name)}</span>
              <span class="entry__ticker">${esc(c.ticker)}</span>
            </div>
            ${c.description ? `<p class="entry__desc">${esc(c.description)}</p>` : ''}
            ${factsLine(c)}
          </div>
          <div class="entry__meta">
            <span class="entry__sector">${esc(c.sector)}</span>
            <span class="entry__date">${esc(relativeDays(c.lastUpdated))}</span>
          </div>
          <span class="entry__action">Workspace <span aria-hidden="true">→</span></span>
        </a>
      </li>`;
  }

  async function renderHeroStats() {
    const el = document.getElementById('heroStats');
    if (!el) return;
    if (!signedIn()) {
      el.innerHTML = `
        <div><dt>Workspace</dt><dd>Private</dd></div>
        <div><dt>Access</dt><dd><a class="hero__signin" href="#/signin">Sign in</a></dd></div>`;
      return;
    }
    try {
      const s = await DataLayer.getStats();
      el.innerHTML = `
        <div><dt>Tracked</dt><dd>${UI.two(s.tracked)}</dd></div>
        <div><dt>Researched</dt><dd>${UI.two(s.researched)}</dd></div>
        <div><dt>Sectors</dt><dd>${UI.two(s.sectors)}</dd></div>`;
    } catch (err) { console.warn(err); }
  }

  async function renderHomeEntries() {
    const el = document.getElementById('homeEntries');
    if (!el) return;
    if (!signedIn()) { el.innerHTML = `<li class="entry entry--locked">${signinNotice('Sign in to see the companies you follow.')}</li>`; return; }
    try {
      const list = await DataLayer.getWatchlist();
      const order = { researching: 0, researched: 1, watch: 2 };
      const sorted = list.slice().sort((a, b) => {
        const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        return d !== 0 ? d : byLastUpdated(a, b);
      });
      el.innerHTML = sorted.length ? sorted.slice(0, 6).map(entryRow).join('')
        : `<li class="entry entry--locked"><div class="locked"><p class="locked__text">No companies yet.</p><a class="arrow-link" href="#/watchlist">Add the first one <span aria-hidden="true">→</span></a></div></li>`;
    } catch (err) { el.innerHTML = ''; console.warn(err); }
  }

  function researchButton(c, cls = 'feature__link') {
    return c.researchFile
      ? `<button class="${cls}" type="button" data-research="${esc(c.researchFile)}">Open research <span aria-hidden="true">→</span></button>`
      : '';
  }

  function featureHTML(kicker, c, tag = 'h3') {
    return `
      <p class="research-feature__kicker">${kicker}</p>
      <div>
        <${tag} class="research-feature__title">${esc(c.name)}</${tag}>
        <p class="research-feature__meta">
          ${esc(c.ticker)} <span>·</span> ${esc(c.sector)}
          <span>·</span> Updated ${esc(fmtDate(c.lastUpdated))}
          ${c.decision ? `<span>·</span> ${esc(UI.decisionLabel(c.decision))}` : ''}
        </p>
      </div>
      <div>
        <p class="research-feature__summary">${esc(c.summary || c.description)}</p>
        <div class="feature__links">
          ${researchButton(c)}
          <a class="feature__link feature__link--quiet" href="#/company/${esc(c.slug)}">Workspace <span aria-hidden="true">→</span></a>
        </div>
      </div>`;
  }

  function archiveRow(c, n) {
    const inner = `
      <span class="archive__num">${UI.two(n)}</span>
      <span class="archive__name">${esc(c.name)}<span class="archive__ticker">${esc(c.ticker)}</span></span>
      <span class="archive__sector">${esc(c.sector)}</span>
      <span class="archive__date">${esc(fmtDate(c.lastUpdated))}</span>`;
    return `
      <li class="archive__item">
        ${c.researchFile
          ? `<button class="archive__link" type="button" data-research="${esc(c.researchFile)}">${inner}</button>`
          : `<a class="archive__link" href="#/company/${esc(c.slug)}">${inner}</a>`}
      </li>`;
  }

  async function renderHomeResearch() {
    const featureEl = document.getElementById('homeFeature');
    const archiveEl = document.getElementById('homeArchive');
    if (!featureEl || !archiveEl) return;
    if (!signedIn()) {
      featureEl.innerHTML = `<p class="research-feature__kicker">Research archive</p>${signinNotice('Research notes and documents are visible after signing in.')}`;
      archiveEl.innerHTML = '';
      return;
    }
    let list = [];
    try { list = (await DataLayer.getResearched()).sort(byLastUpdated); } catch (err) { console.warn(err); }
    if (!list.length) {
      featureEl.innerHTML = `<p class="research-feature__kicker">No completed research yet</p>`;
      archiveEl.innerHTML = '';
      return;
    }
    const [feature, ...rest] = list;
    featureEl.innerHTML = featureHTML('Latest research', feature);
    archiveEl.innerHTML = rest.map((c, i) => archiveRow(c, i + 2)).join('');
    attachResearchHandlers(featureEl);
    attachResearchHandlers(archiveEl);
  }

  function attachResearchHandlers(root) {
    root.querySelectorAll('[data-research]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openResearch(el.dataset.research);
      });
    });
  }

  /* ---------- Watchlist ---------- */
  const filterState = { q: '', sector: null, statusRaw: null };
  let searchBound = false;

  /* ---------- named watchlists ---------- */
  const listState = { id: null, mode: null, loaded: false };
  const LIST_PREF = 'run.watchlist.current';
  function loadListPref() { try { return localStorage.getItem(LIST_PREF) || null; } catch (e) { return null; } }
  function saveListPref(id) { try { if (id) localStorage.setItem(LIST_PREF, id); else localStorage.removeItem(LIST_PREF); } catch (e) { /* optional */ } }
  let listCache = [];

  async function renderListBar() {
    const bar = document.getElementById('listBar');
    if (!bar) return;
    if (!listState.loaded) { listState.id = loadListPref(); listState.loaded = true; }
    const [lists, all] = await Promise.all([DataLayer.watchlists.list(), DataLayer.getWatchlist()]);
    listCache = lists;
    if (listState.id && !lists.some(l => l.id === listState.id)) { listState.id = null; saveListPref(null); }
    const cur = lists.find(l => l.id === listState.id);
    const nameForm = (kind, value, label) => `
      <form class="list-form" data-lform="${kind}">
        <input class="nb-input" data-f="name" value="${esc(value || '')}" placeholder="List name, e.g. Core ideas" aria-label="${label}" maxlength="80">
        <button class="btn btn--sm" type="submit">${kind === 'new' ? 'Create' : 'Save name'}</button>
        <button class="text-btn" type="button" data-lact="cancel">Cancel</button>
      </form>`;
    bar.innerHTML = `
      <div class="lists__row" role="tablist" aria-label="Watchlists">
        <button class="list-tab${!cur ? ' is-active' : ''}" type="button" role="tab" aria-selected="${!cur}" data-list="">All companies<em>${all.length}</em></button>
        ${lists.map(l => `<button class="list-tab${cur && cur.id === l.id ? ' is-active' : ''}" type="button" role="tab" aria-selected="${!!(cur && cur.id === l.id)}" data-list="${l.id}">${esc(l.name)}<em>${l.companyIds.length}</em></button>`).join('')}
        ${listState.mode === 'new' ? nameForm('new', '', 'New list name') : `<button class="list-tab list-tab--add" type="button" data-lact="new">+ New list</button>`}
      </div>
      <div class="lists__tools">
        ${cur ? (listState.mode === 'rename' ? nameForm('rename', cur.name, 'List name') : `
          <button class="text-btn" type="button" data-lact="choose">Choose companies</button>
          <button class="text-btn" type="button" data-lact="rename">Rename</button>
          <button class="text-btn text-btn--danger" type="button" data-lact="delete">Delete list</button>`) : ''}
        <button class="text-btn" type="button" data-lact="export">Export ${cur ? 'this list' : 'all'} (CSV)</button>
        <button class="text-btn" type="button" data-lact="import">Import (CSV)</button>
      </div>
      ${cur && listState.mode === 'choose' ? `
        <div class="chooser">
          <p class="nb-label">Companies in “${esc(cur.name)}”</p>
          <div class="chooser__grid">
            ${all.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => `<label class="pick"><input type="checkbox" value="${c.id}" ${cur.companyIds.includes(c.id) ? 'checked' : ''}><span>${esc(c.name)}${c.ticker ? `<em>${esc(c.ticker)}</em>` : ''}</span></label>`).join('')}
          </div>
          <div class="nb-actions">
            <button class="btn btn--solid btn--sm" type="button" data-lact="save-members">Save</button>
            <button class="text-btn" type="button" data-lact="cancel">Cancel</button>
          </div>
        </div>` : ''}`;
    if (listState.mode === 'new' || listState.mode === 'rename') {
      const i = bar.querySelector('[data-lform] [data-f="name"]');
      if (i) { i.focus(); i.select(); }
    }
    bar.onclick = async e => {
      const tab = e.target.closest('[data-list]');
      if (tab) {
        listState.id = tab.dataset.list || null; listState.mode = null; saveListPref(listState.id);
        await renderListBar(); await renderWatchlistEntries();
        return;
      }
      const b = e.target.closest('[data-lact]');
      if (!b) return;
      const act = b.dataset.lact;
      try {
        if (act === 'new' || act === 'rename' || act === 'choose') { listState.mode = act; await renderListBar(); }
        if (act === 'cancel') { listState.mode = null; await renderListBar(); }
        if (act === 'delete') {
          if (!(await UI.confirmInline(b, `Delete the list “${cur.name}”? The companies stay in your workspace.`))) return;
          await DataLayer.watchlists.remove(cur.id);
          listState.id = null; saveListPref(null);
          UI.toast('List deleted');
          await renderWatchlistView();
        }
        if (act === 'save-members') {
          const ids = [...bar.querySelectorAll('.chooser input:checked')].map(i => i.value);
          const r = await UI.busy(b, () => DataLayer.watchlists.setMembers(cur.id, ids));
          listState.mode = null;
          UI.toast(`${cur.name}: ${r.added} added, ${r.removed} removed`);
          await renderWatchlistView();
        }
        if (act === 'export') await exportList(cur);
        if (act === 'import') {
          IO.openImport({
            kind: 'companies', title: cur ? `Companies into “${cur.name}”` : 'Companies', target: cur ? cur.name : 'All companies',
            onImport: async parsed => {
              const r = await DataLayer.importCompanies(parsed.rows, cur ? cur.id : null);
              await renderWatchlistView();
              return `${r.created} new compan${r.created === 1 ? 'y' : 'ies'} added, ${r.matched} already in your workspace` +
                (cur ? ` (all now in “${cur.name}”)` : '') + (r.priced ? `, ${r.priced} price${r.priced === 1 ? '' : 's'} set` : '') + '.';
            }
          });
        }
      } catch (err) { UI.error(err); }
    };
    bar.onsubmit = async e => {
      const f = e.target.closest('[data-lform]');
      if (!f) return;
      e.preventDefault();
      const name = f.querySelector('[data-f="name"]').value.trim();
      if (!name) return;
      try {
        if (f.dataset.lform === 'new') {
          const l = await DataLayer.watchlists.create(name);
          listState.id = l.id; saveListPref(l.id);
          listState.mode = 'choose';
          UI.toast(`List “${name}” created. Choose its companies.`);
        } else {
          await DataLayer.watchlists.rename(listState.id, name);
          listState.mode = null;
          UI.toast('List renamed');
        }
        await renderWatchlistView();
      } catch (err) { UI.error(err); }
    };
  }

  async function exportList(cur) {
    const all = await DataLayer.getWatchlist();
    const rows = (cur ? all.filter(c => c.lists.includes(cur.id)) : all).slice().sort((a, b) => a.name.localeCompare(b.name));
    const names = Object.fromEntries(listCache.map(l => [l.id, l.name]));
    const v = c => c.valuation || {};
    const csv = IO.toCSV(
      ['name', 'ticker', 'exchange', 'sector', 'description', 'status', 'current_price', 'price_date', 'decision', 'research_progress_pct',
       'fair_value', 'base_target', 'bull_target', 'bear_target', 'entry_low', 'entry_high', 'stop_loss', 'invalidation_price',
       'next_review', 'open_tasks', 'open_questions', 'shares_held', 'watchlists', 'last_activity'],
      rows.map(c => [c.name, c.ticker, c.exchange, c.sector, c.description, c.status, c.currentPrice ?? '', c.priceAsOf || '',
        c.decision || '', c.progress.pct, v(c).fairValue ?? '', v(c).baseTarget ?? '', v(c).bullTarget ?? '', v(c).bearTarget ?? '',
        v(c).entryLow ?? '', v(c).entryHigh ?? '', v(c).stopLoss ?? '', v(c).invalidationPrice ?? '',
        c.nextReview && c.nextReview.date ? c.nextReview.date : '', c.openTasks, c.openQuestions,
        c.position ? c.position.qty : '', c.lists.map(id => names[id]).filter(Boolean).join('; '), c.lastUpdated]));
    const slug = cur ? DataLayer.util.slugify(cur.name) : 'all';
    IO.download(`run-watchlist-${slug}-${DataLayer.util.today()}.csv`, csv);
    UI.toast(`${rows.length} compan${rows.length === 1 ? 'y' : 'ies'} exported`);
  }

  function buildFilterChips(container, values, key, allLabel) {
    if (!container) return;
    const current = filterState[key];
    if (current && !values.includes(current)) filterState[key] = null;
    container.innerHTML =
      `<button class="filter-chip${!filterState[key] ? ' is-active' : ''}" type="button" data-key="${key}" data-value="">${allLabel}</button>` +
      values.map(v => `<button class="filter-chip${filterState[key] === v ? ' is-active' : ''}" type="button" data-key="${key}" data-value="${esc(v)}">${esc(v)}</button>`).join('');
    container.onclick = (e) => {
      const btn = e.target.closest('.filter-chip');
      if (!btn) return;
      filterState[key] = btn.dataset.value || null;
      [...container.children].forEach(c => c.classList.toggle('is-active', c === btn));
      renderWatchlistEntries();
    };
  }

  async function initWatchlistFilters() {
    const companies = await DataLayer.getWatchlist();
    const sectors = [...new Set(companies.map(c => c.sector))].sort();
    buildFilterChips(document.getElementById('sectorFilter'), sectors, 'sector', 'All sectors');
    buildFilterChips(document.getElementById('statusFilter'), ['Watching', 'Researching', 'Researched'], 'statusRaw', 'All statuses');

    const input = document.getElementById('searchInput');
    if (input && !searchBound) {
      searchBound = true;
      input.addEventListener('input', () => {
        filterState.q = input.value.trim().toLowerCase();
        renderWatchlistEntries();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== input &&
            !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) &&
            !document.querySelector('.view[data-view="watchlist"]').hidden) {
          e.preventDefault();
          input.focus();
        }
      });
    }
  }

  async function renderWatchlistEntries() {
    const el = document.getElementById('watchlistEntries');
    const emptyEl = document.getElementById('watchlistEmpty');
    const countEl = document.getElementById('watchlistCount');
    if (!el) return;

    const all = await DataLayer.getWatchlist();
    let list = all;
    if (filterState.q) {
      list = list.filter(c =>
        c.name.toLowerCase().includes(filterState.q) ||
        (c.ticker || '').toLowerCase().includes(filterState.q) ||
        (c.sector || '').toLowerCase().includes(filterState.q));
    }
    if (listState.id) list = list.filter(c => (c.lists || []).includes(listState.id));
    if (filterState.sector) list = list.filter(c => c.sector === filterState.sector);
    if (filterState.statusRaw) {
      const map = { 'Watching': 'watch', 'Researching': 'researching', 'Researched': 'researched' };
      list = list.filter(c => c.status === map[filterState.statusRaw]);
    }
    list = list.slice().sort(byLastUpdated);

    if (countEl) {
      const curList = listCache.find(l => l.id === listState.id);
      countEl.textContent = (list.length === 0 ? 'No companies' : `${UI.two(list.length)} ${list.length === 1 ? 'company' : 'companies'}`) +
        (curList ? ` in ${curList.name}` : '');
    }
    if (!list.length) {
      el.innerHTML = '';
      if (emptyEl) {
        emptyEl.hidden = false;
        const curList = listCache.find(l => l.id === listState.id);
        emptyEl.innerHTML = all.length && curList && !all.some(c => (c.lists || []).includes(curList.id))
          ? `<p class="empty__title">“${esc(curList.name)}” is empty.</p><p class="empty__text">Use <strong>Choose companies</strong> above, or add this list from a company's workspace (Lists).</p>`
          : all.length
          ? `<p class="empty__title">Nothing matches.</p><p class="empty__text">Try clearing the search or filters.</p>`
          : `<p class="empty__title">No companies yet.</p>
             <p class="empty__text">Add your first company, or bring in the starter list.</p>
             <div class="empty__actions">
               <button class="btn btn--solid btn--sm" type="button" data-open-add>+ Add Company</button>
               <button class="btn btn--sm" type="button" data-import-starter>Import starter companies</button>
             </div>`;
        const add = emptyEl.querySelector('[data-open-add]');
        if (add) add.onclick = () => CompanyForm.open();
        const imp = emptyEl.querySelector('[data-import-starter]');
        if (imp) imp.onclick = () => UI.busy(imp, async () => {
          try {
            const n = await DataLayer.importStarter();
            UI.toast(`${n} compan${n === 1 ? 'y' : 'ies'} imported`);
            await App.refreshSummaries();
            await renderWatchlistView();
          } catch (err) { UI.error(err); }
        }, 'Importing…');
      }
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    el.innerHTML = list.map(entryRow).join('');
  }

  async function renderWatchlistView() {
    await initWatchlistFilters();
    await renderListBar();
    await renderWatchlistEntries();
  }

  /* ---------- Researched ---------- */
  async function renderResearchedView() {
    const body = document.getElementById('researchedBody');
    if (!body) return;
    const list = (await DataLayer.getResearched()).sort(byLastUpdated);
    if (!list.length) {
      body.innerHTML = `<div class="empty"><p class="empty__title">No research yet.</p><p class="empty__text">Companies appear here when you mark their research complete.</p></div>`;
      return;
    }
    const [feature, ...rest] = list;
    body.innerHTML = `
      <div class="research-feature">${featureHTML('Most recent', feature, 'h2')}</div>
      <ol class="archive">${rest.map((c, i) => archiveRow(c, i + 1)).join('')}</ol>`;
    attachResearchHandlers(body);
  }

  /* ---------- Sectors ---------- */
  async function renderSectorsView() {
    const grid = document.getElementById('sectorGrid');
    const detail = document.getElementById('sectorDetail');
    if (!grid) return;

    const companies = await DataLayer.getAll();
    const map = new Map();
    for (const c of companies) {
      if (!map.has(c.sector)) map.set(c.sector, []);
      map.get(c.sector).push(c);
    }
    const rows = [...map.entries()].sort((a, b) => b[1].length - a[1].length);
    detail.hidden = true;

    grid.innerHTML = rows.length ? rows.map(([sector, list]) => {
      const total = list.length;
      const done = list.filter(c => c.researched).length;
      const inProg = list.filter(c => c.status === 'researching').length;
      const pct = Math.round((done / total) * 100);
      return `
        <button class="sector-card" type="button" data-sector="${esc(sector)}">
          <div class="sector-card__head">
            <span class="sector-card__count">${UI.two(total)}</span>
            <span class="sector-card__label">Compan${total === 1 ? 'y' : 'ies'}</span>
          </div>
          <h3 class="sector-card__name">${esc(sector)}</h3>
          <div class="sector-card__bar"><span style="width:${pct}%"></span></div>
          <p class="sector-card__meta">${done} researched · ${inProg} researching · ${total - done - inProg} watching</p>
        </button>`;
    }).join('') : `<div class="empty"><p class="empty__title">No sectors yet.</p></div>`;

    grid.onclick = (e) => {
      const btn = e.target.closest('.sector-card');
      if (!btn) return;
      const sector = btn.dataset.sector;
      [...grid.children].forEach(c => c.classList.toggle('is-active', c === btn));
      detail.hidden = false;
      detail.innerHTML = `
        <div class="sector-detail__head">
          <h2 class="sector-detail__title">${esc(sector)}</h2>
          <button class="sector-detail__close" type="button">Close</button>
        </div>
        <ul class="entries">${map.get(sector).map(entryRow).join('')}</ul>`;
      detail.querySelector('.sector-detail__close').addEventListener('click', () => {
        detail.hidden = true;
        [...grid.children].forEach(c => c.classList.remove('is-active'));
      });
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  function initDemo() {
    const demo = document.getElementById('demo');
    if (!demo) return;
    const row = document.getElementById('demoRow');
    const meta = document.getElementById('demoMeta');
    const status = document.getElementById('demoStatus');

    const states = {
      watch:       { meta: 'MRDP · Healthcare',                    status: 'Watching' },
      researching: { meta: 'MRDP · Healthcare · In progress',      status: 'Researching' },
      researched:  { meta: 'MRDP · Healthcare · 22 Aug 2026',      status: 'Researched' }
    };

    demo.querySelectorAll('[data-demo]').forEach(btn => {
      btn.addEventListener('click', () => {
        const state = btn.dataset.demo;
        demo.querySelectorAll('[data-demo]').forEach(b => {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', String(on));
        });
        row.dataset.state = state;
        meta.textContent = states[state].meta;
        status.textContent = states[state].status;
      });
    });
  }

  return {
    renderHeroStats, renderHomeEntries, renderHomeResearch,
    renderWatchlistView, renderResearchedView, renderSectorsView,
    initDemo, entryRow
  };
})();

/* ------------------------------------------------------------
   HERO FIELD — NIGHT SKY + LIVE CONSTELLATION

   Layers, back to front:
     1. a faint Milky Way band and thousands of distant stars
        (pre-rendered once, drifts with the pointer)
     2. twinkling mid-field stars with real star colours
     3. a few bright stars with soft glow and diffraction spikes
     4. occasional shooting stars
     5. the constellation — nodes and signal lines
     6. labels on the constellation: when signed in these are
        YOUR reviews due, open tasks and companies. Hover one to
        see more, click it to open that part of the workspace.
   Honours prefers-reduced-motion (draws one still frame).
   ------------------------------------------------------------ */

const HeroField = (function () {
  const canvas = document.getElementById('field');
  const gridEl = document.getElementById('heroGrid');
  const glowEl = document.getElementById('heroGlow');
  const hero = document.getElementById('hero');
  if (!canvas || !hero) return { refreshLabels() {} };

  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, cx = 0, cy = 0, DPR = 1;
  let nodes = [], edges = [], stars = [], brights = [], meteors = [], pulses = [];
  let skyLayer = null;
  const SKY_PAD = 48;
  let startTime = 0, lastTime = 0, rafId = null, running = false;
  let nextMeteor = 0, nextPulse = 0;

  let mx = 0, my = 0, tmx = 0, tmy = 0, pres = 0, hasPointer = false;
  let px = 0, py = 0;                 // pointer in canvas coords
  let hoverIdx = -1;

  const T = { nodeStart: 100, nodeEnd: 1000, edgeStart: 700, edgeEnd: 1700, labelStart: 1500, labelEnd: 2400, settled: 2600 };

  /* real star colours: blue-white (hot) → white → warm (cool stars) */
  const TINTS = [
    { c: [236, 233, 227], w: 44 },
    { c: [212, 224, 255], w: 22 },
    { c: [186, 206, 255], w: 12 },
    { c: [255, 240, 214], w: 14 },
    { c: [255, 214, 170], w: 8 }
  ];
  const TINT_TOTAL = TINTS.reduce((s, t) => s + t.w, 0);
  function tint() {
    let r = Math.random() * TINT_TOTAL;
    for (const t of TINTS) { if ((r -= t.w) <= 0) return t.c; }
    return TINTS[0].c;
  }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  /* ---------- label items ---------- */
  const TONES = {
    signal: [91, 141, 239], mark: [229, 177, 74], text: [236, 233, 227], dim: [180, 184, 191]
  };
  const FALLBACK = ['HELIO', 'NWFT', 'MRDP', 'KSTR', 'ATSM', 'CBRG', 'ORNC', 'VRDN', 'FY27', 'Q3', 'Δ', '↑']
    .map((t, i) => ({ kind: '', text: t, tone: 'dim', pri: i, generic: true }));
  let items = FALLBACK.slice();
  let placed = [];                    // { node, item, side, m, birthAt }

  /* ---------- sprites (pre-rendered soft glows) ---------- */
  const spriteCache = new Map();
  function glowSprite(c) {
    const key = c.join(',');
    if (spriteCache.has(key)) return spriteCache.get(key);
    const s = document.createElement('canvas');
    s.width = s.height = 64;
    const g = s.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, rgba(c, 0.9));
    grad.addColorStop(0.18, rgba(c, 0.35));
    grad.addColorStop(0.5, rgba(c, 0.08));
    grad.addColorStop(1, rgba(c, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    spriteCache.set(key, s);
    return s;
  }

  function inTitleZone(x, y) {
    const dx = x - cx, dy = y - cy;
    const rx = Math.min(W, H) * 0.30, ry = Math.min(W, H) * 0.22;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1;
  }

  /* ---------- 1. the distant sky, rendered once ---------- */
  function buildSky() {
    const w = W + SKY_PAD * 2, h = H + SKY_PAD * 2;
    skyLayer = document.createElement('canvas');
    skyLayer.width = Math.round(w * DPR);
    skyLayer.height = Math.round(h * DPR);
    const g = skyLayer.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Milky Way band: a soft diagonal haze, strongest away from the title.
    const angle = -0.42;
    const ux = Math.cos(angle), uy = Math.sin(angle);   // along the band
    const nx = -uy, ny = ux;                           // across the band
    const bx = w * 0.5, by = h * 0.56;
    const len = Math.hypot(w, h);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const s = (i / 25 - 0.5) * len;
      const off = gauss() * h * 0.05;
      const x = bx + ux * s + nx * off, y = by + uy * s + ny * off;
      const r = Math.min(w, h) * (0.16 + Math.random() * 0.14);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const warm = Math.random() < 0.35;
      grad.addColorStop(0, warm ? 'rgba(229,190,140,0.030)' : 'rgba(120,150,230,0.032)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Dust concentrated along the band
    const bandCount = Math.round((w * h) / (W < 640 ? 520 : 380));
    for (let i = 0; i < bandCount; i++) {
      const s = (Math.random() - 0.5) * len;
      const off = gauss() * h * 0.09;
      const x = bx + ux * s + nx * off, y = by + uy * s + ny * off;
      if (x < 0 || y < 0 || x > w || y > h) continue;
      if (inTitleZone(x - SKY_PAD, y - SKY_PAD) && Math.random() < 0.7) continue;
      const a = 0.05 + Math.random() * 0.22;
      g.fillStyle = rgba(tint(), a);
      const r = 0.25 + Math.random() * 0.45;
      g.fillRect(x, y, r * 2, r * 2);
    }
    // Distant stars everywhere
    const farCount = Math.round((w * h) / (W < 640 ? 1500 : 1100));
    for (let i = 0; i < farCount; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      if (inTitleZone(x - SKY_PAD, y - SKY_PAD) && Math.random() < 0.65) continue;
      const r = 0.3 + Math.pow(Math.random(), 3) * 0.9;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = rgba(tint(), 0.12 + Math.random() * 0.4);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  /* ---------- 2-5. animated layers ---------- */
  function build() {
    const density = W < 640 ? 22 : W < 1024 ? 34 : 50;
    const starCount = W < 640 ? 70 : W < 1024 ? 130 : 200;
    const brightCount = W < 640 ? 5 : W < 1024 ? 8 : 12;

    nodes = []; edges = []; stars = []; brights = []; meteors = []; pulses = [];

    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.65);
      nodes.push(makeNode(cx + Math.cos(angle) * W * 0.46 * radius, cy + Math.sin(angle) * H * 0.42 * radius * 0.9));
    }
    connectAll();

    for (let i = 0; i < starCount; i++) {
      let x, y, guard = 0;
      do { x = Math.random() * W; y = Math.random() * H; guard++; } while (inTitleZone(x, y) && Math.random() < 0.7 && guard < 6);
      stars.push({
        x, y, c: tint(),
        r: 0.45 + Math.pow(Math.random(), 2) * 0.95,
        a: 0.28 + Math.random() * 0.5,
        depth: 0.25 + Math.random() * 0.6,
        f1: 0.0006 + Math.random() * 0.0022, f2: 0.0017 + Math.random() * 0.004,
        p1: Math.random() * 6.3, p2: Math.random() * 6.3,
        vx: (Math.random() - 0.5) * 0.0035, vy: (Math.random() - 0.5) * 0.0035
      });
    }
    for (let i = 0; i < brightCount; i++) {
      let x, y, guard = 0;
      do { x = Math.random() * W; y = Math.random() * H; guard++; } while (inTitleZone(x, y) && guard < 20);
      brights.push({
        x, y, c: tint(),
        r: 1.1 + Math.random() * 1.1,
        a: 0.55 + Math.random() * 0.35,
        depth: 0.45 + Math.random() * 0.5,
        f1: 0.0005 + Math.random() * 0.0012, f2: 0.0021 + Math.random() * 0.003,
        p1: Math.random() * 6.3, p2: Math.random() * 6.3,
        spikes: Math.random() < 0.7
      });
    }
    buildSky();
    placeLabels(true);
  }

  function makeNode(x, y) {
    const big = Math.random() < 0.18;
    return {
      x, y, big,
      r: big ? (2.0 + Math.random() * 1.4) : (0.9 + Math.random() * 0.9),
      depth: 0.25 + Math.random() * 0.75,
      birth: T.nodeStart + Math.random() * (T.nodeEnd - T.nodeStart),
      phase: Math.random() * Math.PI * 2,
      item: null
    };
  }

  function connectAll() {
    edges = [];
    const maxDist = Math.min(W, H) * 0.30;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d < maxDist) edges.push({ a: i, b: j, birth: T.edgeStart + (d / maxDist) * (T.edgeEnd - T.edgeStart), strength: 1 - d / maxDist });
      }
    }
  }

  /* ---------- label placement: keep clear of every line of hero text ---------- */
  function exclusions() {
    const cr = canvas.getBoundingClientRect();
    const out = [{ x: 0, y: 0, w: W, h: 88 }];
    const push = (r, pad) => {
      if (r && r.width > 0 && r.height > 0) out.push({ x: r.left - cr.left - pad, y: r.top - cr.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 });
    };
    hero.querySelectorAll('.hero__eyebrow, .hero__row, .hero__tagline, .hero__lede').forEach(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      push(range.getBoundingClientRect(), el.classList.contains('hero__row') ? 36 : 26);
    });
    hero.querySelectorAll('.hero__actions .btn').forEach(el => push(el.getBoundingClientRect(), 22));
    hero.querySelectorAll('.hero__stats').forEach(el => push(el.getBoundingClientRect(), 22));
    hero.querySelectorAll('.hero__scroll').forEach(el => push(el.getBoundingClientRect(), 12));
    return out;
  }
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function setFont(kind) {
    ctx.font = kind ? '500 9px "JetBrains Mono", monospace' : '500 10px "JetBrains Mono", monospace';
    try { ctx.letterSpacing = kind ? '1.4px' : '0.6px'; } catch (e) { /* older browsers */ }
  }
  function measure(item) {
    setFont(true);
    const kw = item.kind ? ctx.measureText(item.kind.toUpperCase()).width + 8 : 0;
    setFont(false);
    const tw = ctx.measureText(item.text).width;
    return { kw, tw, w: kw + tw };
  }

  function boxFor(node, m, side) {
    const gap = 12;
    const x = side === 'left' ? node.x - gap - m.w : node.x + gap;
    return { x: x - 6, y: node.y - 10, w: m.w + 12, h: 20 };
  }

  function placeLabels(fresh) {
    const before = nodes.length;
    nodes.forEach(n => { if (n.item) { n.item = null; n.big = !!n.wasBig; n.r = n.wasR || n.r; } });
    nodes = nodes.filter(n => !n.synthetic);
    placed = [];
    hoverIdx = -1;
    pulses = [];
    if (!W) return;
    const ex = exclusions();
    const maxLabels = W < 640 ? 4 : W < 1024 ? 7 : 10;
    const margin = 10;
    const boxes = [];
    const fits = b => b.x >= margin && b.y >= margin && b.x + b.w <= W - margin && b.y + b.h <= H - margin &&
      !ex.some(e => hit(b, e)) && !boxes.some(o => hit(b, { x: o.x - 10, y: o.y - 6, w: o.w + 20, h: o.h + 12 }));
    const minR = Math.min(W, H);
    const idealR = minR * 0.42;
    let leftN = 0, rightN = 0;

    for (const item of items) {
      if (placed.length >= maxLabels) break;
      const m = measure(item);
      let best = null;
      // Prefer existing constellation nodes on a comfortable ring around the
      // title, alternating sides so the labels stay balanced.
      const preferLeft = leftN <= rightN;
      const cands = nodes.filter(n => !n.item).map(n => {
        const d = Math.hypot(n.x - cx, n.y - cy);
        return { n, d, s: Math.abs(d - idealR) + (((n.x < cx) !== preferLeft) ? minR * 0.22 : 0) };
      }).filter(o => o.d > minR * 0.12).sort((a, b) => a.s - b.s);
      for (const { n } of cands) {
        const pt = { x: n.x - 6, y: n.y - 6, w: 12, h: 12 };
        if (ex.some(e => hit(pt, e))) continue;
        const sides = n.x < cx ? ['left', 'right'] : ['right', 'left'];
        for (const side of sides) {
          const b = boxFor(n, m, side);
          if (fits(b)) { best = { n, side, b }; break; }
        }
        if (best) break;
      }
      // Otherwise add a new star where the label has room.
      if (!best) {
        for (let tries = 0; tries < 90 && !best; tries++) {
          const n = makeNode(margin + Math.random() * (W - margin * 2), 90 + Math.random() * (H - 150));
          const pt = { x: n.x - 6, y: n.y - 6, w: 12, h: 12 };
          if (ex.some(e => hit(pt, e))) continue;
          const side = n.x < cx ? 'left' : 'right';
          const b = boxFor(n, m, side);
          if (fits(b)) { n.synthetic = true; nodes.push(n); best = { n, side, b }; }
        }
      }
      if (!best) continue;
      if (best.n.x < cx) leftN++; else rightN++;
      best.n.item = item;
      best.n.wasBig = best.n.big;
      best.n.wasR = best.n.r;
      best.n.big = true;
      best.n.r = Math.max(best.n.r, 2.1);
      boxes.push(best.b);
      placed.push({ node: best.n, item, side: best.side, m, birth: fresh ? 0 : null });
    }
    if (nodes.length !== before || nodes.some(n => n.synthetic)) connectAll();
    const nowT = startTime ? performance.now() - startTime : 0;
    placed.forEach((p, k) => {
      const intro = T.labelStart + (k / Math.max(1, placed.length)) * (T.labelEnd - T.labelStart);
      p.birthAt = fresh ? intro : Math.max(intro, nowT + k * 90);
    });
  }

  function setItems(list) {
    items = list && list.length ? list : FALLBACK.slice();
    placeLabels(false);
    if (reduced) drawStatic();
  }

  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const smooth = (perFrame, dt) => 1 - Math.pow(1 - perFrame, dt / 16.67);

  /* ---------- frame ---------- */
  function draw(now) {
    if (!startTime) startTime = now;
    const t = now - startTime;
    const dt = lastTime ? Math.min(now - lastTime, 50) : 16.67;
    lastTime = now;

    mx += (tmx - mx) * smooth(0.055, dt);
    my += (tmy - my) * smooth(0.055, dt);
    pres += ((hasPointer ? 1 : 0) - pres) * smooth(0.06, dt);

    if (gridEl) gridEl.style.transform = `translate3d(${mx * 17 * pres}px, ${my * 17 * pres}px, 0)`;
    if (glowEl) {
      glowEl.style.setProperty('--gx', (50 + mx * 11 * pres) + '%');
      glowEl.style.setProperty('--gy', (45 + my * 11 * pres) + '%');
      glowEl.style.setProperty('--glow-a', String(0.08 + 0.05 * pres));
    }

    ctx.clearRect(0, 0, W, H);
    const skyIn = Math.min(1, t / 1400);

    // 1. distant sky (slow parallax + imperceptible drift)
    if (skyLayer) {
      ctx.globalAlpha = easeOut(skyIn);
      const drift = (t * 0.0012) % SKY_PAD;
      ctx.drawImage(skyLayer, -SKY_PAD + mx * 8 * pres + drift * 0.3, -SKY_PAD + my * 6 * pres, W + SKY_PAD * 2, H + SKY_PAD * 2);
      ctx.globalAlpha = 1;
    }

    // 2. twinkling stars
    for (const s of stars) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < -6) s.x = W + 6; else if (s.x > W + 6) s.x = -6;
      if (s.y < -6) s.y = H + 6; else if (s.y > H + 6) s.y = -6;
      const tw = 0.72 + 0.18 * Math.sin(t * s.f1 + s.p1) + 0.10 * Math.sin(t * s.f2 + s.p2);
      const a = s.a * tw * skyIn;
      const x = s.x + mx * 22 * s.depth * pres, y = s.y + my * 16 * s.depth * pres;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(s.c, a);
      ctx.fill();
    }

    // 3. bright stars with glow and spikes
    for (const b of brights) {
      const tw = 0.78 + 0.14 * Math.sin(t * b.f1 + b.p1) + 0.08 * Math.sin(t * b.f2 + b.p2);
      const a = b.a * tw * skyIn;
      const x = b.x + mx * 26 * b.depth * pres, y = b.y + my * 19 * b.depth * pres;
      const g = b.r * 10 * (0.9 + 0.1 * tw);
      ctx.globalAlpha = a * 0.55;
      ctx.drawImage(glowSprite(b.c), x - g / 2, y - g / 2, g, g);
      ctx.globalAlpha = 1;
      if (b.spikes) {
        const L = b.r * (5.5 + 2.5 * tw);
        const grad = ctx.createLinearGradient(x - L, y, x + L, y);
        grad.addColorStop(0, rgba(b.c, 0)); grad.addColorStop(0.5, rgba(b.c, a * 0.5)); grad.addColorStop(1, rgba(b.c, 0));
        ctx.strokeStyle = grad; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.stroke();
        const gradV = ctx.createLinearGradient(x, y - L, x, y + L);
        gradV.addColorStop(0, rgba(b.c, 0)); gradV.addColorStop(0.5, rgba(b.c, a * 0.5)); gradV.addColorStop(1, rgba(b.c, 0));
        ctx.strokeStyle = gradV;
        ctx.beginPath(); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, b.r * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = rgba([255, 255, 255], Math.min(1, a + 0.1));
      ctx.fill();
    }

    // 4. shooting stars
    if (t > T.settled + 1500 && now > nextMeteor) {
      nextMeteor = now + 7000 + Math.random() * 9000;
      const fromLeft = Math.random() < 0.5;
      const ang = (fromLeft ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.3;
      meteors.push({
        x: fromLeft ? Math.random() * W * 0.5 : W * 0.5 + Math.random() * W * 0.5,
        y: Math.random() * H * 0.35,
        vx: Math.cos(ang), vy: Math.sin(ang),
        speed: 0.55 + Math.random() * 0.35, len: 110 + Math.random() * 120, life: 0, max: 900 + Math.random() * 500
      });
    }
    meteors = meteors.filter(m => m.life < m.max);
    for (const m of meteors) {
      m.life += dt;
      const p = m.life / m.max;
      const fade = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      m.x += m.vx * m.speed * dt; m.y += m.vy * m.speed * dt;
      const tx = m.x - m.vx * m.len, ty = m.y - m.vy * m.len;
      const grad = ctx.createLinearGradient(tx, ty, m.x, m.y);
      grad.addColorStop(0, 'rgba(236,233,227,0)');
      grad.addColorStop(1, `rgba(236,233,227,${0.55 * fade})`);
      ctx.strokeStyle = grad; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(m.x, m.y); ctx.stroke();
      ctx.globalAlpha = 0.5 * fade;
      ctx.drawImage(glowSprite([212, 224, 255]), m.x - 7, m.y - 7, 14, 14);
      ctx.globalAlpha = 1;
    }

    // 5. constellation
    const ox = mx * 31 * pres, oy = my * 22 * pres;
    const offs = nodes.map(n => ({ x: n.x + ox * n.depth, y: n.y + oy * n.depth }));

    for (const e of edges) {
      const p = (t - e.birth) / 650;
      if (p <= 0) continue;
      const ep = easeOut(Math.min(p, 1));
      const a = offs[e.a], b = offs[e.b];
      const lit = hoverIdx >= 0 && (placed[hoverIdx].node === nodes[e.a] || placed[hoverIdx].node === nodes[e.b]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + (b.x - a.x) * ep, a.y + (b.y - a.y) * ep);
      ctx.strokeStyle = `rgba(91,141,239,${(lit ? 0.42 : 0.14) * e.strength * ep})`;
      ctx.lineWidth = lit ? 0.9 : 0.6;
      ctx.stroke();
    }

    // signal pulses travelling along the lines
    if (t > T.settled && now > nextPulse && edges.length) {
      nextPulse = now + 900 + Math.random() * 1600;
      const labelled = edges.filter(e => nodes[e.a].item || nodes[e.b].item);
      const pool = labelled.length && Math.random() < 0.7 ? labelled : edges;
      const e = pool[Math.floor(Math.random() * pool.length)];
      const forward = nodes[e.b].item ? true : nodes[e.a].item ? false : Math.random() < 0.5;
      pulses.push({ e, forward, life: 0, max: 1400 + Math.random() * 900 });
    }
    pulses = pulses.filter(p => p.life < p.max);
    for (const p of pulses) {
      p.life += dt;
      const k = easeOut(p.life / p.max);
      const a = offs[p.forward ? p.e.a : p.e.b], b = offs[p.forward ? p.e.b : p.e.a];
      const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
      const alpha = Math.sin(Math.PI * (p.life / p.max)) * 0.8 * p.e.strength;
      ctx.globalAlpha = alpha;
      ctx.drawImage(glowSprite([91, 141, 239]), x - 8, y - 8, 16, 16);
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const p = (t - n.birth) / 800;
      if (p <= 0) continue;
      const a = easeOut(Math.min(p, 1));
      const pos = offs[i];
      const pulse = t > T.settled ? Math.sin((t - T.settled) * 0.0011 + n.phase) * (n.big ? 0.45 : 0.3) : 0;
      const r = n.r * (0.55 + 0.45 * a) + pulse;
      const tone = n.item ? TONES[n.item.tone] || TONES.dim : [91, 141, 239];
      const isHover = hoverIdx >= 0 && placed[hoverIdx].node === n;

      const haloR = n.big ? r * 6.5 : r * 4.0;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, haloR * (isHover ? 1.35 : 1), 0, Math.PI * 2);
      ctx.fillStyle = rgba(n.item ? tone : [91, 141, 239], (n.big ? 0.10 : 0.05) * a * (isHover ? 1.8 : 1));
      ctx.fill();

      // attention ring for items that are due
      if (n.item && n.item.pulse && t > T.settled) {
        const k = ((t + n.phase * 400) % 2600) / 2600;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 3 + k * 16, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(tone, 0.45 * (1 - k));
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.item && n.item.tone === 'mark' ? rgba(TONES.mark, 0.95 * a)
        : rgba([236, 233, 227], (n.big ? 0.95 : 0.62) * a);
      ctx.fill();

      if (n.big) {
        const len = r * 3.2;
        ctx.strokeStyle = `rgba(236,233,227,${0.30 * a})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(pos.x - len, pos.y); ctx.lineTo(pos.x + len, pos.y);
        ctx.moveTo(pos.x, pos.y - len); ctx.lineTo(pos.x, pos.y + len);
        ctx.stroke();
      }
    }

    // 6. labels
    drawLabels(t, offs);

    rafId = requestAnimationFrame(draw);
  }

  function drawLabels(t, offs) {
    ctx.textBaseline = 'middle';
    placed.forEach((p, k) => {
      const i = nodes.indexOf(p.node);
      if (i < 0) return;
      const pr = (t - p.birthAt) / 750;
      if (pr <= 0) return;
      const a = easeOut(Math.min(pr, 1));
      const pos = offs ? offs[i] : p.node;
      const it = p.item, tone = TONES[it.tone] || TONES.dim;
      const hover = k === hoverIdx;
      const gap = 12;
      let x = p.side === 'left' ? pos.x - gap - p.m.w : pos.x + gap;
      const y = pos.y;
      if (it.kind) {
        setFont(true);
        ctx.fillStyle = rgba(hover ? tone : [118, 124, 134], (hover ? 1 : 0.9) * a);
        ctx.fillText(it.kind.toUpperCase(), x, y + 0.5);
        x += p.m.kw;
      }
      setFont(false);
      ctx.fillStyle = rgba(hover ? [255, 255, 255] : tone, (it.generic ? 0.85 : hover ? 1 : 0.92) * a);
      ctx.fillText(it.text, x, y);
      if (hover) {
        const lx = p.side === 'left' ? pos.x - gap - p.m.w : pos.x + gap;
        ctx.strokeStyle = rgba(tone, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lx, y + 9); ctx.lineTo(lx + p.m.w, y + 9); ctx.stroke();
        if (it.sub) {
          ctx.font = '400 11px Inter, -apple-system, sans-serif';
          try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
          const sw = ctx.measureText(it.sub).width;
          let sx = p.side === 'left' ? pos.x - gap - sw : pos.x + gap;
          sx = Math.max(10, Math.min(W - 10 - sw, sx));
          ctx.fillStyle = 'rgba(180,184,191,0.95)';
          ctx.fillText(it.sub, sx, y + 22);
        }
      }
    });
    try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
  }

  /* ---------- pointer: hover + click a label ---------- */
  function pick() {
    if (!placed.length) return -1;
    const ox = mx * 31 * pres, oy = my * 22 * pres;
    for (let k = 0; k < placed.length; k++) {
      const p = placed[k];
      if (!p.item.href) continue;
      const nx = p.node.x + ox * p.node.depth, ny = p.node.y + oy * p.node.depth;
      const x0 = p.side === 'left' ? nx - 12 - p.m.w - 6 : nx - 10;
      const x1 = p.side === 'left' ? nx + 10 : nx + 12 + p.m.w + 6;
      if (px >= x0 && px <= x1 && py >= ny - 13 && py <= ny + 13) return k;
    }
    return -1;
  }

  hero.addEventListener('pointerenter', () => { hasPointer = true; });
  hero.addEventListener('pointerleave', () => { hasPointer = false; tmx = 0; tmy = 0; hoverIdx = -1; hero.style.cursor = ''; });
  hero.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    px = e.clientX - rect.left; py = e.clientY - rect.top;
    tmx = Math.max(-1.2, Math.min(1.2, (px - rect.width / 2) / (rect.width / 2)));
    tmy = Math.max(-1.2, Math.min(1.2, (py - rect.height / 2) / (rect.height / 2)));
    const onControl = e.target.closest && e.target.closest('a, button');
    hoverIdx = onControl ? -1 : pick();
    hero.style.cursor = hoverIdx >= 0 ? 'pointer' : '';
    if (reduced) drawStatic();
  }, { passive: true });
  hero.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    const rect = canvas.getBoundingClientRect();
    px = e.clientX - rect.left; py = e.clientY - rect.top;
    let k = pick();
    if (k < 0) k = hoverIdx;
    if (k >= 0 && placed[k] && placed[k].item.href) location.hash = placed[k].item.href;
  });

  /* ---------- lifecycle ---------- */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W / 2; cy = H / 2;
    build();
  }

  function ensureSize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width && (Math.abs(rect.width - W) > 1 || Math.abs(rect.height - H) > 1)) resize();
  }
  function start() {
    ensureSize();
    if (running || reduced) return;
    running = true;
    if (!startTime) startTime = performance.now();
    lastTime = 0;
    rafId = requestAnimationFrame(draw);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    if (skyLayer) ctx.drawImage(skyLayer, -SKY_PAD, -SKY_PAD, W + SKY_PAD * 2, H + SKY_PAD * 2);
    for (const s of stars) { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = rgba(s.c, s.a); ctx.fill(); }
    for (const b of brights) {
      const g = b.r * 10;
      ctx.globalAlpha = b.a * 0.55; ctx.drawImage(glowSprite(b.c), b.x - g / 2, b.y - g / 2, g, g); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.62, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    }
    for (const e of edges) {
      const a = nodes[e.a], b = nodes[e.b];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(91,141,239,${0.10 * e.strength})`; ctx.lineWidth = 0.6; ctx.stroke();
    }
    for (const n of nodes) {
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.item && n.item.tone === 'mark' ? rgba(TONES.mark, 0.9) : n.big ? 'rgba(236,233,227,0.85)' : 'rgba(236,233,227,0.55)';
      ctx.fill();
    }
    placed.forEach(p => { p.birthAt = -1e9; });
    drawLabels(1e9, null);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting && !reduced) start(); else stop(); });
    }, { threshold: 0 }).observe(hero);
  } else {
    start();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (!reduced) {
      const r = hero.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) start();
    }
  });

  let rsz;
  window.addEventListener('resize', () => {
    clearTimeout(rsz);
    rsz = setTimeout(() => { resize(); if (reduced) drawStatic(); }, 180);
  });

  resize();
  if (reduced) drawStatic();
  // Re-place labels once the title has finished animating in and fonts are ready.
  setTimeout(() => { placeLabels(false); if (reduced) drawStatic(); }, 3300);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { placeLabels(false); if (reduced) drawStatic(); });

  /* ---------- live items from the workspace ---------- */
  const shortUntil = s => String(s)
    .replace(/^in (\d+) days?$/, '$1D').replace(/^(\d+) days? overdue$/, '$1D OVERDUE')
    .replace('tomorrow', '1D').replace('today', 'TODAY');
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const tick = c => (c.ticker || c.name).slice(0, 12).toUpperCase();

  async function refreshLabels() {
    ensureSize();
    try {
      if (!(typeof DataLayer !== "undefined" && DataLayer.auth.isSignedIn())) { setItems(FALLBACK); return; }
      const d = await DataLayer.desk();
      const t = d.today, soon = DataLayer.util.addDays(t, 14);
      const out = [];
      d.reviews.filter(r => r.date && r.date <= soon).forEach(r => {
        const due = r.date <= t;
        out.push({
          kind: 'Review', text: `${tick(r.company)} · ${shortUntil(UI.until(r.date))}`,
          sub: `${r.company.name}${r.triggerNote ? ' — ' + r.triggerNote : ''}`,
          href: `#/company/${r.company.slug}/review`, tone: due ? 'signal' : 'text', pri: due ? 0 : 2, pulse: due
        });
      });
      d.tasks.slice(0, 6).forEach(x => {
        const overdue = x.dueDate && x.dueDate < t;
        out.push({
          kind: 'Task', text: trunc(x.title, 24),
          sub: `${x.company.name}${x.dueDate ? ' · due ' + fmtShortDate(x.dueDate) : ''}`,
          href: `#/company/${x.company.slug}/tasks`, tone: overdue ? 'signal' : 'dim', pri: overdue ? 1 : 3, pulse: overdue
        });
      });
      d.companies.filter(c => c.status === 'researching').forEach(c => out.push({
        kind: tick(c), text: `${c.progress.pct}%`, sub: `${c.name} · research in progress`,
        href: `#/company/${c.slug}`, tone: 'signal', pri: 4
      }));
      d.companies.filter(c => c.status !== 'researching').forEach(c => out.push({
        kind: '', text: tick(c) + (c.decision ? ' · ' + UI.decisionLabel(c.decision).toUpperCase() : ''),
        sub: c.name + (c.status === 'researched' ? ' · researched' : ' · watching'),
        href: `#/company/${c.slug}`, tone: c.status === 'researched' ? 'mark' : 'dim', pri: 5
      }));
      try {
        const idata = await DataLayer.ipo.data();
        const sum = IPO.summarise({ ...idata, period: null });
        sum.toCollect.slice(0, 3).forEach(r => out.push({
          kind: 'Collect', text: `${trunc(r.person.name, 12)} · ${UI.money(Math.round(r.c.dueBack || 0), 'INR')}`,
          sub: `${r.ipo.name} · ${r.c.dueNote}`, href: '#/ipos', tone: 'signal', pri: 1.5, pulse: true
        }));
      } catch (e) { /* IPO tables may not exist yet */ }
      out.sort((a, b) => a.pri - b.pri);
      setItems(out.length ? out : FALLBACK);
    } catch (err) {
      console.warn('[RUN] hero labels:', err);
      setItems(FALLBACK);
    }
  }

  return { refreshLabels, setItems };
})();
window.HeroField = HeroField;


/* ------------------------------------------------------------
   COMPANY FORM — the Add / Edit company dialog
   ------------------------------------------------------------ */
const CompanyForm = (() => {
  let editing = null;
  const $ = id => document.getElementById(id);
  const modal = () => $('addCompanyModal');

  function open(company) {
    editing = company || null;
    const m = modal();
    if (!m) return;
    $('modalKicker').textContent = editing ? 'Company details' : 'New company';
    $('modalTitle').textContent = editing ? 'Edit company' : 'Add a company';
    $('modalSubmit').textContent = editing ? 'Save changes' : 'Add company';
    $('modalDelete').hidden = !editing;
    $('companyName').value = editing ? editing.name || '' : '';
    $('companyTicker').value = editing ? editing.ticker || '' : '';
    $('companyExchange').value = editing ? editing.exchange || '' : '';
    $('companySector').value = editing ? (editing.sector === 'Uncategorised' ? '' : editing.sector || '') : '';
    $('companyStatus').value = editing ? (editing.researchStatus || editing.status || 'watch') : 'watch';
    $('companyDesc').value = editing ? editing.description || '' : '';
    $('companyFile').value = editing ? editing.researchFile || '' : '';
    $('companySummary').value = editing ? editing.summary || '' : '';
    const hint = $('modalBackendHint');
    if (hint) hint.textContent = DataLayer.isSupabase() ? 'Saved privately to Supabase' : 'Local mode · saved in this browser only';
    DataLayer.overview().then(list => {
      const sectors = [...new Set(list.map(c => c.sector).filter(Boolean))].sort();
      $('sectorList').innerHTML = sectors.map(s => `<option value="${esc(s)}">`).join('');
    }).catch(() => { /* optional */ });
    m.hidden = false;
    m.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
    $('companyName').focus();
  }

  function close() {
    const m = modal();
    if (!m) return;
    m.hidden = true;
    m.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
    editing = null;
  }

  function init() {
    const form = $('addCompanyForm');
    if (!form) return;
    const openBtn = $('btnAddCompany');
    if (openBtn) openBtn.addEventListener('click', () => open());
    ['modalClose', 'modalCancel', 'modalBackdrop'].forEach(id => { const el = $(id); if (el) el.addEventListener('click', close); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal() && !modal().hidden) close(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = {
        name: $('companyName').value.trim(),
        ticker: $('companyTicker').value.trim(),
        exchange: $('companyExchange').value.trim(),
        sector: $('companySector').value.trim(),
        description: $('companyDesc').value.trim(),
        researchFile: $('companyFile').value.trim(),
        summary: $('companySummary').value.trim()
      };
      const status = $('companyStatus').value || 'watch';
      if (!input.name) { $('companyName').focus(); return; }
      if (input.researchFile && /^https?:|^\/\/|\.\./i.test(input.researchFile)) {
        UI.toast('Research file should be a path inside the project, e.g. research/acme.html', 'error');
        return;
      }
      const btn = $('modalSubmit');
      await UI.busy(btn, async () => {
        try {
          if (editing) {
            const id = editing.id;
            await DataLayer.updateCompany(id, { ...input, sector: input.sector || 'Uncategorised' });
            if (status !== (editing.researchStatus || editing.status)) await DataLayer.setResearchStatus(id, status);
            close();
            UI.toast('Company updated');
            await App.rerender();
          } else {
            const c = await DataLayer.createCompany({ ...input, researchStatus: status });
            form.reset();
            close();
            UI.toast('Company added');
            location.hash = '#/company/' + c.slug;
          }
        } catch (err) { UI.error(err); }
      });
    });

    const del = $('modalDelete');
    if (del) del.addEventListener('click', async () => {
      if (!editing) return;
      const ok = await UI.confirmInline(del, `Delete ${editing.name} and all its research, tasks and files?`);
      if (!ok) return;
      try {
        await DataLayer.deleteCompany(editing.id);
        const name = editing.name;
        close();
        if (typeof Workspace !== "undefined") Workspace.clearDirty();
        UI.toast(`${name} deleted`);
        location.hash = '#/watchlist';
      } catch (err) { UI.error(err); }
    });
  }

  return { open, close, init };
})();

/* ------------------------------------------------------------
   SIGN-IN VIEW
   ------------------------------------------------------------ */
const SignIn = (() => {
  let returnTo = null;
  let mode = 'signin';   // 'signin' | 'reset' | 'sent'

  function render() {
    const el = document.getElementById('signinBody');
    if (!el) return;
    const A = DataLayer.auth;
    const head = (kicker, title, lede) => `
      <header class="view__head">
        <p class="act__kicker">${kicker}</p>
        <h1 class="view__title">${title}</h1>
        ${lede ? `<p class="view__lede">${lede}</p>` : ''}
      </header>`;

    if (A.mode() === 'error') {
      el.innerHTML = head('Setup needed', 'Supabase is not connected.', '') + `
        <div class="about__note signin__note"><p><strong>Configuration problem.</strong> ${esc(A.configError())}</p>
        <p>Open <code>js/supabase-config.js</code>, fix it, upload it again and refresh. SETUP_GUIDE.md walks through it step by step.</p></div>`;
      return;
    }
    if (A.mode() === 'local') {
      el.innerHTML = head('Local mode', 'No sign-in needed yet.', 'Supabase is not configured, so everything you enter is kept in this browser only. Connect Supabase (see SETUP_GUIDE.md) to make the workspace private, backed up and available on every device.') +
        `<a class="btn btn--solid" href="#/watchlist"><span>Open Watchlist</span></a>` + backupBlock();
      bindBackup();
      return;
    }
    if (A.isRecovering()) {
      el.innerHTML = head('Private workspace', 'Choose a new password.', '') + `
        <form class="signin__form" id="pwForm">
          <div class="form-group"><label for="newPw">New password</label><input type="password" id="newPw" autocomplete="new-password" minlength="8" required></div>
          <div class="form-group"><label for="newPw2">Repeat new password</label><input type="password" id="newPw2" autocomplete="new-password" minlength="8" required></div>
          <p class="signin__msg" id="signinMsg" role="alert"></p>
          <button class="btn btn--solid" type="submit" id="pwSubmit"><span>Save password</span></button>
        </form>`;
      document.getElementById('pwForm').addEventListener('submit', async e => {
        e.preventDefault();
        const a = document.getElementById('newPw').value, b = document.getElementById('newPw2').value;
        const msg = document.getElementById('signinMsg');
        if (a !== b) { msg.textContent = 'The two passwords do not match.'; return; }
        await UI.busy(document.getElementById('pwSubmit'), async () => {
          try { await A.setNewPassword(a); UI.toast('Password updated'); location.hash = '#/desk'; }
          catch (err) { msg.textContent = err.message; }
        });
      });
      return;
    }
    if (A.isSignedIn()) {
      const u = A.user();
      el.innerHTML = head('Account', 'You are signed in.', `Signed in as <strong>${esc(u.email || '')}</strong>.`) + `
        <div class="signin__row">
          <a class="btn btn--solid" href="#/desk"><span>Open the Desk</span></a>
          <button class="btn" type="button" id="signOutBtn"><span>Sign out</span></button>
        </div>
        ${backupBlock()}`;
      document.getElementById('signOutBtn').addEventListener('click', () => App.signOut());
      bindBackup();
      return;
    }
    if (mode === 'sent') {
      el.innerHTML = head('Private workspace', 'Check your email.', 'If that address has an account, a link to set a new password is on its way. Open it on this device.') +
        `<button class="text-btn" type="button" id="backToSignin">Back to sign in</button>`;
      document.getElementById('backToSignin').addEventListener('click', () => { mode = 'signin'; render(); });
      return;
    }
    if (mode === 'reset') {
      el.innerHTML = head('Private workspace', 'Reset your password.', 'Enter your email and Supabase will send you a reset link.') + `
        <form class="signin__form" id="resetForm">
          <div class="form-group"><label for="resetEmail">Email</label><input type="email" id="resetEmail" autocomplete="email" required></div>
          <p class="signin__msg" id="signinMsg" role="alert"></p>
          <div class="signin__row">
            <button class="btn btn--solid" type="submit" id="resetSubmit"><span>Send reset link</span></button>
            <button class="text-btn" type="button" id="backToSignin">Back to sign in</button>
          </div>
        </form>`;
      document.getElementById('backToSignin').addEventListener('click', () => { mode = 'signin'; render(); });
      document.getElementById('resetForm').addEventListener('submit', async e => {
        e.preventDefault();
        await UI.busy(document.getElementById('resetSubmit'), async () => {
          try { await A.sendPasswordReset(document.getElementById('resetEmail').value); mode = 'sent'; render(); }
          catch (err) { document.getElementById('signinMsg').textContent = err.message; }
        }, 'Sending…');
      });
      return;
    }
    el.innerHTML = head('Private workspace', 'Sign in.', 'Your research, valuations, decisions and documents are private. Only you can read or change them.') + `
      <form class="signin__form" id="signinForm">
        <div class="form-group"><label for="signinEmail">Email</label><input type="email" id="signinEmail" autocomplete="username" required></div>
        <div class="form-group"><label for="signinPw">Password</label><input type="password" id="signinPw" autocomplete="current-password" required></div>
        <p class="signin__msg" id="signinMsg" role="alert"></p>
        <div class="signin__row">
          <button class="btn btn--solid" type="submit" id="signinSubmit"><span>Sign in</span></button>
          <button class="text-btn" type="button" id="forgotPw">Forgot password?</button>
        </div>
      </form>`;
    document.getElementById('forgotPw').addEventListener('click', () => { mode = 'reset'; render(); });
    document.getElementById('signinForm').addEventListener('submit', async e => {
      e.preventDefault();
      const msg = document.getElementById('signinMsg');
      msg.textContent = '';
      await UI.busy(document.getElementById('signinSubmit'), async () => {
        try {
          await A.signIn(document.getElementById('signinEmail').value, document.getElementById('signinPw').value);
          const to = returnTo && returnTo !== '#/signin' ? returnTo : '#/';
          returnTo = null;
          await App.afterAuthChange();
          if (location.hash === to) await App.rerender(); else location.hash = to;
        } catch (err) { msg.textContent = err.message; }
      }, 'Signing in…');
    });
    setTimeout(() => { const i = document.getElementById('signinEmail'); if (i) i.focus(); }, 50);
  }

  function backupBlock() {
    return `
      <div class="backup">
        <p class="nb-label">Your data</p>
        <p class="backup__text">Download everything (companies, research, valuations, decisions, tasks, watchlists, trades and file details) as one file. Keep it somewhere safe. Uploaded PDFs themselves stay in storage and are not inside this file.</p>
        <button class="btn btn--sm" type="button" id="backupBtn"><span>Download full backup (JSON)</span></button>
      </div>`;
  }
  function bindBackup() {
    const b = document.getElementById('backupBtn');
    if (!b) return;
    b.addEventListener('click', () => UI.busy(b, async () => {
      try {
        const data = await DataLayer.backup();
        const n = Object.values(data.tables).reduce((s, t) => s + t.length, 0);
        IO.download(`run-backup-${DataLayer.util.today()}.json`, JSON.stringify(data, null, 2), 'application/json');
        UI.toast(`Backup downloaded · ${n} records`);
      } catch (err) { UI.error(err); }
    }, 'Preparing…'));
  }

  return {
    render,
    setReturn(h) { returnTo = h; },
    reset() { mode = 'signin'; }
  };
})();

/* ------------------------------------------------------------
   ROUTER, ACCOUNT, MENU, SCROLL
   ------------------------------------------------------------ */
const App = (() => {
  const STATIC = {
    '': 'home', '/': 'home',
    '/watchlist': 'watchlist',
    '/desk': 'desk',
    '/portfolio': 'portfolio',
    '/ipos': 'ipos',
    '/researched': 'researched',
    '/sectors': 'sectors',
    '/about': 'about',
    '/signin': 'signin'
  };
  const PRIVATE = ['watchlist', 'desk', 'portfolio', 'ipos', 'researched', 'sectors', 'company'];
  const TITLES = {
    home: 'RUN WATCHLIST — Track what matters. Research what changes.',
    watchlist: 'Watchlist — RUN Watchlist', desk: 'Desk — RUN Watchlist', portfolio: 'Portfolio — RUN Watchlist', ipos: 'IPOs — RUN Watchlist', researched: 'Researched — RUN Watchlist',
    sectors: 'Sectors — RUN Watchlist', about: 'About — RUN Watchlist', signin: 'Sign in — RUN Watchlist'
  };

  function parse() {
    const h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
    if (STATIC[h] !== undefined) return { view: STATIC[h], key: h || '/' };
    let m = h.match(/^\/company\/([^/]+)(?:\/([a-z]+))?\/?$/);
    if (m) return { view: 'company', slug: m[1], sec: m[2] || null, key: '/company/' + m[1] };
    m = h.match(/^\/ipo\/([0-9a-f-]{8,})\/?$/i);
    if (m) return { view: 'ipos', ipoId: m[1], key: '/ipo/' + m[1] };
    m = h.match(/^\/desk\/([a-z]+)$/);
    if (m) return { view: 'desk', focus: m[1], key: '/desk' };
    return { view: 'home', key: '/' };
  }

  let current = null;
  let lastHash = location.hash;
  let firstLoad = true;

  async function navigate(force = false) {
    const r = parse();

    // Leaving a workspace that has unsaved typing?
    if (!force && current && current.view === 'company' && r.key !== current.key && !Workspace.canLeave()) {
      history.replaceState(null, '', lastHash || '#/');
      return;
    }
    lastHash = location.hash;

    let view = r.view;
    if (PRIVATE.includes(view) && !DataLayer.auth.isSignedIn()) {
      SignIn.setReturn(location.hash);
      view = 'signin';
    }
    const key = view === r.view ? r.key : '/signin';

    document.querySelectorAll('[data-nav]').forEach(a => {
      const nav = view === 'company' ? 'watchlist' : view;
      a.classList.toggle('is-active', a.dataset.nav === nav);
    });

    // Same page, new section inside the workspace: just scroll.
    if (!force && !firstLoad && current && current.key === key) {
      if (view === 'company' && r.sec) {
        const s = document.getElementById('ws-' + r.sec);
        if (s) window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
      }
      if (view === 'desk' && r.focus) {
        const s = document.getElementById('desk-' + r.focus);
        if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    const sameKey = current && current.key === key;
    current = { view, key };

    document.querySelectorAll('.view').forEach(v => {
      const on = v.dataset.view === view;
      v.hidden = !on;
      v.classList.toggle('is-active', on);
    });
    document.title = TITLES[view] || TITLES.home;

    try {
      if (view === 'home') await renderHome();
      if (view === 'watchlist') { updateBadge(); await Views.renderWatchlistView(); }
      if (view === 'desk') await Desk.renderPage(r.focus);
      if (view === 'portfolio') await PortfolioView.render();
      if (view === 'ipos') await IpoView.render(r.ipoId);
      if (view === 'researched') await Views.renderResearchedView();
      if (view === 'sectors') await Views.renderSectorsView();
      if (view === 'signin') SignIn.render();
      if (view === 'company') {
        await Workspace.render(r.slug, r.sec);
        const c = Workspace.current();
        if (c) document.title = `${c.name} — RUN Watchlist`;
      }
    } catch (err) { console.error('View render error:', err); UI.error(err); }

    if (!firstLoad && !(view === 'company' && r.sec) && !(view === 'desk' && r.focus) && !sameKey) window.scrollTo({ top: 0, behavior: 'auto' });
    firstLoad = false;
    observeReveals();
  }

  async function renderHome() {
    await Promise.all([
      Views.renderHeroStats(),
      Views.renderHomeEntries(),
      Views.renderHomeResearch(),
      Desk.renderHome()
    ]);
    if (window.HeroField && HeroField.refreshLabels) HeroField.refreshLabels();
  }

  function updateBadge() {
    const badge = document.getElementById('backendBadge');
    if (!badge) return;
    const m = DataLayer.mode();
    const u = DataLayer.auth.user();
    badge.textContent = m === 'supabase' ? 'Private · Supabase' : m === 'local' ? 'Local mode · this browser' : 'Setup needed';
    badge.title = m === 'supabase' && u ? 'Signed in as ' + u.email : '';
    badge.className = 'backend-badge ' + (m === 'supabase' ? 'backend-badge--live' : 'backend-badge--local');
  }

  function renderAccount() {
    const A = DataLayer.auth;
    document.querySelectorAll('[data-account]').forEach(el => {
      if (A.mode() === 'local') { el.hidden = true; return; }
      el.hidden = false;
      if (A.isSignedIn()) {
        el.textContent = 'Account';
        el.setAttribute('href', '#/signin');
        delete el.dataset.signedIn;
        el.title = 'Signed in as ' + (A.user().email || '');
      } else {
        el.textContent = 'Sign in';
        el.setAttribute('href', '#/signin');
        delete el.dataset.signedIn;
        el.title = '';
      }
    });
  }

  async function signOut() {
    if (typeof Workspace !== "undefined") Workspace.clearDirty();
    await DataLayer.auth.signOut();
    SignIn.reset();
    await afterAuthChange();
    UI.toast('Signed out');
    if (location.hash === '#/' || location.hash === '') await navigate(true);
    else location.hash = '#/';
  }

  async function afterAuthChange() {
    DataLayer.invalidate();
    renderAccount();
  }

  let revealObserver = null;
  function observeReveals() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-in'));
      return;
    }
    if (revealObserver) revealObserver.disconnect();
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          revealObserver.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    document.querySelectorAll('.reveal:not(.is-in)').forEach(el => revealObserver.observe(el));
  }

  const header = document.getElementById('header');
  function onScroll() {
    const y = window.scrollY || document.documentElement.scrollTop;
    if (header) header.classList.toggle('is-scrolled', y > 24);
    const bar = document.getElementById('progressBar');
    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + '%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  const menuToggle = document.getElementById('menuToggle');
  const mobileMenu = document.getElementById('mobileMenu');
  function closeMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('menu-open');
    setTimeout(() => { mobileMenu.hidden = true; }, 320);
  }
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const open = menuToggle.getAttribute('aria-expanded') === 'true';
      if (open) closeMenu();
      else {
        mobileMenu.hidden = false;
        requestAnimationFrame(() => mobileMenu.classList.add('is-open'));
        menuToggle.setAttribute('aria-expanded', 'true');
        menuToggle.setAttribute('aria-label', 'Close menu');
        document.body.classList.add('menu-open');
      }
    });
    mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') closeMenu();
    });
  }

  // "Sign out" links in the header and mobile menu
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-account]');
    if (a && a.dataset.signedIn) { e.preventDefault(); signOut(); }
  });

  window.addEventListener('beforeunload', (e) => {
    if (current && current.view === 'company' && !Workspace.canLeaveQuietly()) { e.preventDefault(); e.returnValue = ''; }
  });

  document.querySelectorAll('.js-year').forEach(el => { el.textContent = String(new Date().getFullYear()); });

  document.addEventListener('DOMContentLoaded', async () => {
    await DataLayer.init();
    renderAccount();
    Views.initDemo();
    CompanyForm.init();
    DataLayer.auth.onChange(async (event) => {
      await afterAuthChange();
      if (event === 'PASSWORD_RECOVERY') { location.hash = '#/signin'; return; }
      await navigate(true);
    });
    window.addEventListener('hashchange', () => navigate());
    await navigate();
    onScroll();
    observeReveals();
  });

  return {
    rerender: () => navigate(true),
    refreshSummaries: async () => { if (current && current.view === 'home') await renderHome(); },
    afterAuthChange, signOut
  };
})();
