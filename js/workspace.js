/* ============================================================
   RUN WATCHLIST — js/workspace.js
   The company research workspace:  #/company/<slug>

   RESEARCH → THINK → VALUE → DECIDE → ACT → REVIEW

   Everything is read and written through DataLayer. Nothing in
   this file talks to Supabase directly, and nothing here ever
   recommends a decision — it records yours and does arithmetic.
   ============================================================ */

const Workspace = (() => {

  let W = null;
  const root = () => document.getElementById('wsRoot');
  const U = () => DataLayer.util;

  const PHASES = [
    { n: 'I',   name: 'Research', secs: ['files', 'checklist', 'facts'] },
    { n: 'II',  name: 'Think',    secs: ['thesis', 'catalysts', 'risks', 'questions'] },
    { n: 'III', name: 'Value',    secs: ['valuation'] },
    { n: 'IV',  name: 'Decide',   secs: ['decision', 'position'] },
    { n: 'V',   name: 'Act',      secs: ['tasks'] },
    { n: 'VI',  name: 'Review',   secs: ['review', 'history'] }
  ];
  const TITLES = {
    files: 'Research files', checklist: 'Research checklist', facts: 'Key facts & observations',
    thesis: 'Investment thesis', catalysts: 'Catalysts', risks: 'Risks', questions: 'Open questions',
    valuation: 'Valuation & price levels', decision: 'Investment decision', position: 'Position & transactions', tasks: 'Action items',
    review: 'Review & monitoring', history: 'Research history'
  };
  const SHORT = {
    files: 'Files', checklist: 'Checklist', facts: 'Key facts', thesis: 'Thesis', catalysts: 'Catalysts',
    risks: 'Risks', questions: 'Questions', valuation: 'Valuation', decision: 'Decision', position: 'Position', tasks: 'Actions',
    review: 'Review', history: 'History'
  };
  const ORDER = PHASES.flatMap(p => p.secs);
  const num = key => UI.two(ORDER.indexOf(key) + 1);
  const PRICE_FIELDS = ['base_target', 'fair_value', 'bull_target', 'bear_target', 'entry_low', 'entry_high',
    'stop_loss', 'invalidation_price', 'current_price'];

  /* ==========================================================
     ENTRY POINT
     ========================================================== */
  async function render(slug, focus) {
    const el = root();
    if (!el) return;
    if (!W || W.slug !== slug) {
      W = { slug, data: null, fileUrls: {}, fileUrlsAt: 0, fileFilter: 'all', histFilter: 'all',
            dirty: new Set(), open: new Set(), pending: [], reviewPreset: null, editPrice: false, completing: false };
    }
    el.innerHTML = `<p class="ws-loading">Opening workspace…</p>`;
    try {
      W.data = await DataLayer.workspace(slug);
    } catch (err) {
      el.innerHTML = `<div class="empty"><p class="empty__title">Could not open this workspace.</p><p class="empty__text">${esc(err.message)}</p></div>`;
      return;
    }
    if (!W.data) {
      el.innerHTML = `<div class="empty"><p class="empty__title">No company here.</p>
        <p class="empty__text">It may have been renamed or deleted. <a class="arrow-link" href="#/watchlist">Back to the watchlist <span aria-hidden="true">→</span></a></p></div>`;
      return;
    }
    W.dirty.clear();
    el.innerHTML = shell();
    bind();
    renderHead(); renderSummary(); renderIndex();
    ORDER.forEach(renderSection);
    if (W.completing) renderComplete();
    watchIndex();
    if (focus && ORDER.includes(focus)) {
      requestAnimationFrame(() => {
        const s = document.getElementById('ws-' + focus);
        if (s) window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 90, behavior: 'auto' });
      });
    }
  }

  function shell() {
    return `
      <a class="ws-back" href="#/watchlist"><span aria-hidden="true">←</span> Watchlist</a>
      <header class="ws-head" id="wsHead"></header>
      <div class="ws-complete" id="wsComplete" hidden></div>
      <section class="ws-summary" id="wsSummary" aria-label="Company summary"></section>
      <div class="ws-body">
        <nav class="ws-index" id="wsIndex" aria-label="Workspace sections"></nav>
        <div class="ws-content">
          ${PHASES.map(p => `
            <div class="ws-phase"><span>${p.n}</span>${p.name}</div>
            ${p.secs.map(s => `
              <section class="ws-sec" id="ws-${s}" data-sec="${s}">
                <header class="ws-sec__head">
                  <span class="ws-sec__num">${num(s)}</span>
                  <div class="ws-sec__titles">
                    <h2 class="ws-sec__title">${TITLES[s]}</h2>
                    <p class="ws-sec__meta" data-meta="${s}"></p>
                  </div>
                </header>
                <div class="ws-sec__body" data-body="${s}"></div>
              </section>`).join('')}
          `).join('')}
        </div>
      </div>`;
  }

  /* Re-read everything, then redraw the given sections (skipping any
     section with unsaved typing unless it is in `force`). */
  async function refresh(secs = [], force = []) {
    try {
      W.data = await DataLayer.workspace(W.slug);
    } catch (err) { UI.error(err); return; }
    if (!W.data) return;
    renderHead(); renderSummary(); renderIndex();
    const set = new Set([...secs, 'history']);
    set.forEach(s => { if (!W.dirty.has(s) || force.includes(s)) renderSection(s); });
    if (W.completing) renderComplete();
  }

  function renderSection(s) {
    const body = root() && root().querySelector(`[data-body="${s}"]`);
    if (!body) return;
    const fn = SECTIONS[s];
    body.innerHTML = fn ? fn() : '';
    const meta = root().querySelector(`[data-meta="${s}"]`);
    if (meta) meta.textContent = (META[s] && META[s]()) || '';
    UI.autosizeAll(body);
    if (s === 'files') loadFileUrls();
    if (s === 'valuation') updateCalc();
  }

  /* ==========================================================
     DERIVED FIGURES (objective arithmetic only)
     ========================================================== */
  function derived() {
    const d = W.data, c = d.company;
    const checklist = d.checklist;
    const doneN = checklist.filter(i => i.completed).length;
    const openQ = d.questions.filter(q => q.status !== 'resolved');
    const openT = d.tasks.filter(t => !t.completed);
    const overdueT = openT.filter(t => UI.isOverdue(t.dueDate));
    const dueOf = r => {
      const cat = r.catalystId ? d.catalysts.find(x => x.id === r.catalystId) : null;
      const cands = [r.scheduledFor];
      if (cat && cat.status === 'occurred') cands.push(U().tsToLocalDate(cat.updatedAt) || U().today());
      if (cat && !r.scheduledFor && cat.expectedDate) cands.push(cat.expectedDate);
      return cands.filter(Boolean).sort()[0] || null;
    };
    const nextReview = d.reviews.filter(r => r.status === 'scheduled')
      .map(r => ({ ...r, scheduledFor: dueOf(r), setFor: r.scheduledFor }))
      .sort((a, b) => (a.scheduledFor || '9999').localeCompare(b.scheduledFor || '9999'))[0] || null;
    const lastReview = d.reviews.filter(r => r.status === 'completed' && r.completedOn)
      .sort((a, b) => b.completedOn.localeCompare(a.completedOn))[0] || null;
    return {
      c, v: d.valuations[0] || null, thesis: d.thesis[0] || null, decision: d.decisions[0] || null,
      price: UI.num(c.currentPrice), cur: c.priceCurrency || 'INR',
      progress: { done: doneN, total: checklist.length, pct: checklist.length ? Math.round(doneN / checklist.length * 100) : 0 },
      openQ, openT, overdueT, nextReview, lastReview
    };
  }

  function entryPosition(price, low, high) {
    const p = UI.num(price), lo = UI.num(low), hi = UI.num(high);
    if (p === null || (lo === null && hi === null)) return '';
    const L = lo ?? hi, H = hi ?? lo;
    if (p < L) return `Price is ${Math.abs(UI.move(L, p)).toFixed(1)}% below the entry range`;
    if (p > H) return `Price is ${UI.move(H, p).toFixed(1)}% above the entry range`;
    return 'Price is inside the entry range';
  }

  /* ==========================================================
     HEADER
     ========================================================== */
  function renderHead() {
    const c = W.data.company;
    const el = document.getElementById('wsHead');
    if (!el) return;
    const statusBtn = c.researchStatus === 'watch'
      ? `<button class="btn btn--solid btn--sm" type="button" data-act="start-research">Start research</button>`
      : c.researchStatus === 'researching'
        ? `<button class="btn btn--solid btn--sm" type="button" data-act="open-complete">Mark research complete</button>`
        : `<button class="btn btn--sm" type="button" data-act="reopen-research">Reopen research</button>`;
    const ids = [c.ticker, c.exchange].filter(Boolean).join(' · ') || 'No ticker';
    const meta = [
      `Added ${fmtDate(c.addedOn)}`,
      c.researchStartedOn ? `Research started ${fmtDate(c.researchStartedOn)}` : null,
      c.researchCompletedOn && c.researchStatus === 'researched' ? `Research completed ${fmtDate(c.researchCompletedOn)}` : null,
      `Last activity ${relativeDays(U().tsToLocalDate(c.lastActivityAt))}`
    ].filter(Boolean).join(' · ');
    el.innerHTML = `
      <div class="ws-head__main">
        <p class="act__kicker"><em>Workspace</em>${esc(ids)}<span class="ws-head__sep" aria-hidden="true">/</span>${esc(c.sector)}</p>
        <h1 class="ws-title" data-status="${esc(c.researchStatus)}">${esc(c.name)}</h1>
        ${c.description ? `<p class="ws-desc">${esc(c.description)}</p>` : ''}
        <p class="ws-meta">${esc(meta)}</p>
      </div>
      <div class="ws-head__actions">
        ${c.researchFile ? `<a class="btn btn--sm" href="${esc(c.researchFile)}" target="_blank" rel="noopener">Open research <span aria-hidden="true">↗</span></a>` : ''}
        ${statusBtn}
        <button class="text-btn" type="button" data-act="toggle-lists" aria-expanded="${!!W.showLists}">Lists${(W.data.lists || []).filter(l => l.member).length ? ' · ' + W.data.lists.filter(l => l.member).length : ''}</button>
        <button class="text-btn" type="button" data-act="edit-company">Edit details</button>
      </div>
      ${W.showLists ? `
        <div class="ws-lists">
          <p class="nb-label">Watchlists this company is in</p>
          <div class="ws-lists__items">
            ${(W.data.lists || []).map(l => `<label class="pick"><input type="checkbox" data-change="list-member" value="${l.id}" ${l.member ? 'checked' : ''}><span>${esc(l.name)}</span></label>`).join('') || '<span class="nb-hint">No watchlists yet.</span>'}
          </div>
          <form class="quick ws-lists__new" data-form="list-new">
            <input class="nb-input quick__main" data-f="name" placeholder="New list name, e.g. Core ideas" aria-label="New list name">
            <button class="btn btn--sm" type="submit">Create and add</button>
          </form>
        </div>` : ''}`;
  }

  /* ==========================================================
     SUMMARY (the few-seconds view)
     ========================================================== */
  function renderSummary() {
    const el = document.getElementById('wsSummary');
    if (!el) return;
    const x = derived(), c = x.c, v = x.v || {}, cur = x.cur, m = val => UI.money(val, cur);
    const up = UI.move(x.price, v.baseTarget);
    const toFair = UI.move(x.price, v.fairValue);
    const toStop = UI.move(x.price, v.stopLoss);
    const entry = (v.entryLow != null || v.entryHigh != null)
      ? `${v.entryLow != null ? m(v.entryLow) : '…'}–${v.entryHigh != null ? m(v.entryHigh) : '…'}` : '—';
    const stopTxt = (v.stopLoss != null || v.invalidationPrice != null)
      ? [v.stopLoss != null ? m(v.stopLoss) : null, v.invalidationPrice != null ? m(v.invalidationPrice) : null].filter(Boolean).join(' / ') : '—';

    const priceCell = W.editPrice ? `
      <form class="price-form" data-form="price">
        <input class="nb-input" data-f="price" inputmode="decimal" aria-label="Current price" value="${x.price ?? ''}" placeholder="Price">
        <input class="nb-input" data-f="asOf" type="date" aria-label="Price date" value="${esc(U().today())}">
        <select class="nb-input" data-f="currency" aria-label="Currency">${RUN.CURRENCIES.map(o => `<option value="${o.value}"${o.value === cur ? ' selected' : ''}>${o.symbol} ${o.value}</option>`).join('')}</select>
        <span class="price-form__actions">
          <button class="btn btn--solid btn--xs" type="submit">Save</button>
          <button class="text-btn" type="button" data-act="cancel-price">Cancel</button>
        </span>
      </form>` : `
      <span class="ws-cell__v">${x.price != null ? m(x.price) : '—'}</span>
      <span class="ws-cell__sub">${c.priceAsOf ? 'as of ' + fmtDate(c.priceAsOf) + ' · ' : ''}<button class="text-btn" type="button" data-act="edit-price">${x.price != null ? 'update' : 'enter price'}</button></span>`;

    const cells = [
      { k: 'Status', v: `<span class="node node--${esc(c.researchStatus)}" aria-hidden="true"></span>${esc(UI.statusLabel(c.researchStatus))}`, sm: true },
      { k: 'Decision', v: esc(UI.decisionLabel(c.decision)), sub: c.decisionDate ? 'since ' + fmtDate(c.decisionDate) : 'not recorded yet', sm: true },
      { k: 'Current price', raw: priceCell, cls: 'ws-cell--price' + (W.editPrice ? ' is-editing' : '') },
      { k: 'Fair value', v: m(v.fairValue), sub: toFair != null ? UI.pct(toFair) + ' vs price' : '' },
      { k: 'Target · base case', v: m(v.baseTarget), sub: up != null ? 'Upside ' + UI.pct(up) : (v.bearTarget != null || v.bullTarget != null ? '' : '') },
      { k: 'Entry range', v: entry, sub: entryPosition(x.price, v.entryLow, v.entryHigh) },
      { k: 'Stop / invalidation', v: stopTxt, sub: toStop != null ? 'Downside ' + UI.pct(toStop) + ' to stop' : '' },
      { k: 'Research progress', v: `${x.progress.pct}%`, sub: `${UI.bar(x.progress.pct)}<span class="ws-cell__subtext">${x.progress.done} of ${x.progress.total}</span>` },
      { k: 'Open questions', v: UI.two(x.openQ.length), sub: d => '' },
      { k: 'Open tasks', v: UI.two(x.openT.length), sub: x.overdueT.length ? `${x.overdueT.length} overdue` : '' , signal: x.overdueT.length > 0 },
      { k: 'Last reviewed', v: x.lastReview ? fmtDate(x.lastReview.completedOn) : 'Never', sm: true },
      { k: 'Next review', v: x.nextReview && x.nextReview.scheduledFor ? fmtDate(x.nextReview.scheduledFor) : (x.nextReview ? 'Scheduled' : 'Not scheduled'),
        sub: x.nextReview && x.nextReview.scheduledFor ? UI.until(x.nextReview.scheduledFor) : '', sm: true,
        signal: x.nextReview && UI.isOverdue(x.nextReview.scheduledFor) }
    ];

    el.innerHTML = `
      <div class="ws-ledger">
        ${cells.map(cell => `
          <div class="ws-cell ${cell.cls || ''}">
            <span class="ws-cell__k">${cell.k}</span>
            ${cell.raw || `<span class="ws-cell__v${cell.sm ? ' ws-cell__v--sm' : ''}">${cell.v}</span>
            ${typeof cell.sub === 'string' && cell.sub ? `<span class="ws-cell__sub${cell.signal ? ' is-signal' : ''}">${cell.sub}</span>` : ''}`}
          </div>`).join('')}
      </div>
      ${pathHTML(x)}`;
  }

  /* Where the research stands: six objective steps. */
  function pathHTML(x) {
    const d = W.data;
    const st = (done, started) => done ? 'researched' : started ? 'researching' : 'watch';
    const steps = [
      { name: 'Research', sec: 'checklist', s: st(x.progress.total && x.progress.done === x.progress.total, x.progress.done > 0 || d.files.length > 0),
        note: `${x.progress.pct}% of checklist` },
      { name: 'Think', sec: 'thesis', s: st(!!(x.thesis && x.thesis.thesis), !!x.thesis), note: x.thesis ? `Thesis v${x.thesis.version}` : 'No thesis yet' },
      { name: 'Value', sec: 'valuation', s: st(!!(x.v && x.v.baseTarget != null), !!x.v), note: x.v ? `${d.valuations.length} snapshot${d.valuations.length === 1 ? '' : 's'}` : 'No valuation yet' },
      { name: 'Decide', sec: 'decision', s: st(!!(x.c.decision && x.c.decision !== 'researching'), x.c.decision === 'researching'), note: UI.decisionLabel(x.c.decision) },
      { name: 'Act', sec: 'tasks', s: st(d.tasks.length > 0 && x.openT.length === 0, x.openT.length > 0), note: d.tasks.length ? `${x.openT.length} open` : 'No actions yet' },
      { name: 'Review', sec: 'review', s: st(!!x.nextReview, !!x.lastReview), note: x.nextReview && x.nextReview.scheduledFor ? 'Next ' + fmtShortDate(x.nextReview.scheduledFor) : 'Not scheduled' }
    ];
    return `
      <ol class="ws-path" aria-label="Research path">
        ${steps.map((p, i) => `
          <li class="ws-path__step" data-state="${p.s}">
            <a href="#/company/${esc(W.slug)}/${p.sec}" data-act="jump" data-sec="${p.sec}">
              <span class="node node--${p.s}" aria-hidden="true"></span>
              <span class="ws-path__name"><em>${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}</em>${p.name}</span>
              <span class="ws-path__note">${esc(p.note)}</span>
            </a>
          </li>`).join('')}
      </ol>`;
  }

  /* ==========================================================
     SECTION INDEX (sticky rail on desktop, strip on mobile)
     ========================================================== */
  function renderIndex() {
    const el = document.getElementById('wsIndex');
    if (!el) return;
    const d = W.data, x = derived();
    const count = {
      files: d.files.length, checklist: `${x.progress.pct}%`, facts: d.facts.length,
      catalysts: d.catalysts.filter(c => c.status === 'expected' || c.status === 'delayed').length,
      risks: d.risks.filter(r => r.status !== 'retired').length, questions: x.openQ.length,
      tasks: x.openT.length, history: d.updates.length, valuation: d.valuations.length || '', thesis: d.thesis.length ? 'v' + d.thesis[0].version : '',
      position: positionNow().qty > 0 ? 'held' : ''
    };
    const active = el.querySelector('.is-active');
    const activeSec = active ? active.dataset.sec : null;
    el.innerHTML = PHASES.map(p => `
      <div class="ws-index__group">
        <p class="ws-index__phase"><span>${p.n}</span>${p.name}</p>
        ${p.secs.map(s => `
          <a class="ws-index__link${s === activeSec ? ' is-active' : ''}" href="#/company/${esc(W.slug)}/${s}" data-act="jump" data-sec="${s}">
            <span class="ws-index__num">${num(s)}</span>
            <span class="ws-index__name">${SHORT[s]}</span>
            <span class="ws-index__count">${count[s] === 0 ? '' : esc(count[s] ?? '')}</span>
          </a>`).join('')}
      </div>`).join('');
  }

  let indexObserver = null;
  function watchIndex() {
    if (indexObserver) indexObserver.disconnect();
    if (!('IntersectionObserver' in window)) return;
    indexObserver = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const s = en.target.dataset.sec;
        document.querySelectorAll('.ws-index__link').forEach(a => a.classList.toggle('is-active', a.dataset.sec === s));
        const link = document.querySelector(`.ws-index__link[data-sec="${s}"]`);
        const idx = document.getElementById('wsIndex');
        if (link && idx && idx.scrollWidth > idx.clientWidth) {
          idx.scrollTo({ left: link.offsetLeft - 16, behavior: 'smooth' });
        }
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    document.querySelectorAll('.ws-sec').forEach(s => indexObserver.observe(s));
  }

  /* ==========================================================
     SECTION RENDERERS
     ========================================================== */
  const META = {
    files: () => `${W.data.files.length} file${W.data.files.length === 1 ? '' : 's'} · private storage`,
    checklist: () => { const p = derived().progress; return `${p.done} of ${p.total} complete`; },
    facts: () => W.data.facts.length ? `${W.data.facts.length} recorded` : '',
    thesis: () => { const t = W.data.thesis[0]; return t ? `Version ${t.version} · updated ${fmtDate(U().tsToLocalDate(t.createdAt))}` : 'Not written yet'; },
    catalysts: () => W.data.catalysts.length ? `${W.data.catalysts.length} recorded` : '',
    risks: () => W.data.risks.length ? `${W.data.risks.length} recorded` : '',
    questions: () => { const o = derived().openQ.length; return W.data.questions.length ? `${o} unresolved of ${W.data.questions.length}` : ''; },
    valuation: () => { const v = W.data.valuations[0]; return v ? `Latest snapshot ${fmtDate(v.asOf)} · ${W.data.valuations.length} kept` : 'No valuation yet'; },
    decision: () => { const c = W.data.company; return c.decision ? `${UI.decisionLabel(c.decision)} since ${fmtDate(c.decisionDate)}` : 'No decision recorded'; },
    position: () => { const p = positionNow(); return p.qty > 0 ? `${fmtQty(p.qty)} shares held · ${W.data.transactions.length} trade${W.data.transactions.length === 1 ? '' : 's'}` : (W.data.transactions.length ? 'No shares held now' : 'Not held'); },
    tasks: () => { const o = derived().openT.length; return W.data.tasks.length ? `${o} open · ${W.data.tasks.length - o} done` : ''; },
    review: () => { const x = derived(); return x.nextReview && x.nextReview.scheduledFor ? `Next ${fmtDate(x.nextReview.scheduledFor)} · ${UI.until(x.nextReview.scheduledFor)}` : 'No review scheduled'; },
    history: () => `${W.data.updates.length} entr${W.data.updates.length === 1 ? 'y' : 'ies'}`
  };

  const SECTIONS = {
    files: renderFiles,
    checklist: renderChecklist,
    facts: () => renderList('facts'),
    thesis: renderThesis,
    catalysts: () => renderList('catalysts'),
    risks: () => renderList('risks'),
    questions: () => renderList('questions'),
    valuation: renderValuation,
    decision: renderDecision,
    position: renderPosition,
    tasks: () => renderList('tasks'),
    review: renderReview,
    history: renderHistory
  };

  /* ---------- generic field ---------- */
  let fid = 0;
  function field(d, value) {
    const id = 'wsf' + (++fid);
    const v = value ?? d.def ?? '';
    let ctl;
    if (d.type === 'textarea') ctl = `<textarea class="nb-text nb-text--sm" id="${id}" data-f="${d.f}" rows="${d.rows || 2}" placeholder="${esc(d.ph || '')}">${esc(v)}</textarea>`;
    else if (d.type === 'select') ctl = `<select class="nb-input" id="${id}" data-f="${d.f}">${UI.options(d.list, v, d.blank != null ? { blank: d.blank } : {})}</select>`;
    else if (d.type === 'date') ctl = `<input class="nb-input" type="date" id="${id}" data-f="${d.f}" value="${esc(v || '')}">`;
    else if (d.type === 'number') ctl = `<input class="nb-input" type="text" inputmode="decimal" id="${id}" data-f="${d.f}" value="${v === null ? '' : esc(v)}" placeholder="${esc(d.ph || '')}">`;
    else ctl = `<input class="nb-input" type="text" id="${id}" data-f="${d.f}" value="${esc(v)}" placeholder="${esc(d.ph || '')}">`;
    const wide = d.type === 'textarea' || d.wide;
    return `<div class="nb-field${wide ? ' nb-field--wide' : ''}"><label class="nb-label" for="${id}">${esc(d.label)}</label>${ctl}${d.hint ? `<p class="nb-hint">${esc(d.hint)}</p>` : ''}</div>`;
  }

  /* ---------- FILES ---------- */
  function renderFiles() {
    const d = W.data;
    const counts = {};
    d.files.forEach(f => { counts[f.docType] = (counts[f.docType] || 0) + 1; });
    const types = RUN.DOC_TYPES.filter(t => counts[t.value]);
    const shown = W.fileFilter === 'all' ? d.files : d.files.filter(f => f.docType === W.fileFilter);
    const localNote = DataLayer.mode() === 'local'
      ? `<p class="nb-hint">Local mode: files are kept in this browser only. Connect Supabase to store them privately in the cloud.</p>` : '';
    const pending = W.pending;
    return `
      <div class="drop" data-drop>
        <input type="file" id="wsFileInput" multiple hidden>
        <div class="drop__zone">
          <p class="drop__title">Drop annual reports, results, concall transcripts, presentations or screenshots here</p>
          <p class="drop__sub">or <button class="text-btn" type="button" data-act="choose-files">choose files</button> · up to 50 MB each · stored privately</p>
        </div>
        ${pending.length ? `
          <div class="drop__meta">
            <ul class="drop__list">${pending.map((f, i) => `<li><span>${esc(f.name)}</span><span class="drop__size">${UI.bytes(f.size)}</span><button class="text-btn" type="button" data-act="unpick-file" data-i="${i}" aria-label="Remove ${esc(f.name)}">remove</button></li>`).join('')}</ul>
            <div class="nb-grid">
              ${field({ f: 'docType', label: 'Document type', type: 'select', list: 'DOC_TYPES' }, guessType(pending[0]))}
              ${field({ f: 'docDate', label: 'Document date', type: 'date' }, '')}
              ${field({ f: 'description', label: 'Description / notes', type: 'text', ph: 'e.g. FY26 annual report', wide: true }, '')}
            </div>
            <div class="nb-actions">
              <button class="btn btn--solid btn--sm" type="button" data-act="upload-files">Upload ${pending.length} file${pending.length === 1 ? '' : 's'}</button>
              <button class="text-btn" type="button" data-act="clear-files">Clear</button>
              <span class="nb-status" data-upload-status></span>
            </div>
          </div>` : ''}
      </div>
      <form class="quick quick--link" data-form="link-add">
        <input class="nb-input quick__main" data-f="url" type="url" inputmode="url" placeholder="Or paste a link: Google Drive, NSE / BSE filing, company website (https://…)" aria-label="Link to a document">
        <input class="nb-input quick__side" data-f="fileName" placeholder="Name (optional)" aria-label="Link name">
        <label class="quick__opt"><span>Type</span><select class="nb-input" data-f="docType">${UI.options('DOC_TYPES', 'annual_report')}</select></label>
        <button class="btn btn--sm" type="submit">Add link</button>
      </form>
      <p class="nb-hint files__hint">Links use no storage space. For Google Drive files, keep sharing on “Restricted” so only you can open them.</p>
      <div class="meter" data-storage-meter></div>
      ${localNote}
      ${d.files.length ? `
        <div class="filter-row ws-filter" role="group" aria-label="Filter files by type">
          <button class="filter-chip${W.fileFilter === 'all' ? ' is-active' : ''}" type="button" data-act="file-filter" data-v="all">All · ${d.files.length}</button>
          ${types.map(t => `<button class="filter-chip${W.fileFilter === t.value ? ' is-active' : ''}" type="button" data-act="file-filter" data-v="${t.value}">${esc(t.label)} · ${counts[t.value]}</button>`).join('')}
        </div>
        <ul class="files">
          ${shown.map(f => fileRow(f)).join('')}
        </ul>` : `<p class="ws-empty">No documents yet. Start by adding the latest annual report, results and conference call.</p>`}`;
  }

  function guessType(file) {
    const n = (file && file.name || '').toLowerCase();
    if (/annual|ar[\s_-]?\d{2}|\bar\b/.test(n)) return 'annual_report';
    if (/concall|con-call|transcript|earnings[\s_-]?call/.test(n)) return 'concall';
    if (/presentation|investor|ppt/.test(n)) return 'presentation';
    if (/q[1-4]|quarter|results/.test(n)) return 'quarterly_results';
    if (/\.(png|jpe?g|gif|webp)$/.test(n)) return 'screenshot';
    if (/filing|bse|nse|disclosure/.test(n)) return 'filing';
    return 'other';
  }

  function hostLabel(url) {
    try {
      const h = new URL(url).hostname.replace(/^www\./, '');
      if (/drive\.google|docs\.google/.test(h)) return 'Google Drive';
      if (/nseindia/.test(h)) return 'NSE';
      if (/bseindia/.test(h)) return 'BSE';
      if (/dropbox/.test(h)) return 'Dropbox';
      if (/onedrive|sharepoint|1drv/.test(h)) return 'OneDrive';
      return h;
    } catch (e) { return 'Link'; }
  }

  function linkRow(f) {
    const open = W.open.has(f.id);
    return `
      <li class="file file--link${open ? ' is-open' : ''}" data-id="${f.id}">
        <div class="file__line">
          <span class="file__type">${esc(RUN.label('DOC_TYPES', f.docType))}</span>
          <div class="file__main">
            <a class="file__name" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.fileName)} <span aria-hidden="true">↗</span></a>
            ${f.description ? `<p class="file__desc">${esc(f.description)}</p>` : ''}
          </div>
          <span class="file__date">${f.docDate ? fmtDate(f.docDate) : 'Added ' + fmtDate(U().tsToLocalDate(f.uploadedAt))}</span>
          <span class="file__size file__host">${esc(hostLabel(f.url))}</span>
          <span class="file__actions">
            <a class="text-btn" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">Open</a>
            <button class="text-btn" type="button" data-act="file-edit" aria-expanded="${open}">${open ? 'Close' : 'Edit'}</button>
          </span>
        </div>
        ${open ? `
          <div class="rec__edit">
            <div class="nb-grid">
              ${field({ f: 'fileName', label: 'Name', type: 'text', wide: true }, f.fileName)}
              ${field({ f: 'url', label: 'Link', type: 'text', wide: true }, f.url)}
              ${field({ f: 'docType', label: 'Document type', type: 'select', list: 'DOC_TYPES' }, f.docType)}
              ${field({ f: 'docDate', label: 'Document date', type: 'date' }, f.docDate)}
              ${field({ f: 'description', label: 'Description / notes', type: 'textarea' }, f.description)}
            </div>
            <div class="nb-actions">
              <button class="btn btn--solid btn--sm" type="button" data-act="file-save">Save</button>
              <button class="text-btn text-btn--danger" type="button" data-act="file-delete">Remove link</button>
            </div>
          </div>` : ''}
      </li>`;
  }

  function fileRow(f) {
    if (f.source === 'link') return linkRow(f);
    const open = W.open.has(f.id);
    return `
      <li class="file${open ? ' is-open' : ''}" data-id="${f.id}">
        <div class="file__line">
          <span class="file__type">${esc(RUN.label('DOC_TYPES', f.docType))}</span>
          <div class="file__main">
            <a class="file__name" data-file-open="${esc(f.storagePath)}" href="${esc(W.fileUrls[f.storagePath] || '#')}" target="_blank" rel="noopener">${esc(f.fileName)}</a>
            ${f.description ? `<p class="file__desc">${esc(f.description)}</p>` : ''}
          </div>
          <span class="file__date">${f.docDate ? fmtDate(f.docDate) : 'Uploaded ' + fmtDate(U().tsToLocalDate(f.uploadedAt))}</span>
          <span class="file__size">${UI.bytes(f.sizeBytes)}</span>
          <span class="file__actions">
            <a class="text-btn" data-file-open="${esc(f.storagePath)}" href="${esc(W.fileUrls[f.storagePath] || '#')}" target="_blank" rel="noopener">Open</a>
            <button class="text-btn" type="button" data-act="file-download">Download</button>
            <button class="text-btn" type="button" data-act="file-edit" aria-expanded="${open}">${open ? 'Close' : 'Edit'}</button>
          </span>
        </div>
        ${open ? `
          <div class="rec__edit">
            <div class="nb-grid">
              ${field({ f: 'fileName', label: 'Name', type: 'text', wide: true }, f.fileName)}
              ${field({ f: 'docType', label: 'Document type', type: 'select', list: 'DOC_TYPES' }, f.docType)}
              ${field({ f: 'docDate', label: 'Document date', type: 'date' }, f.docDate)}
              ${field({ f: 'description', label: 'Description / notes', type: 'textarea' }, f.description)}
            </div>
            <div class="nb-actions">
              <button class="btn btn--solid btn--sm" type="button" data-act="file-save">Save</button>
              <button class="text-btn text-btn--danger" type="button" data-act="file-delete">Delete file</button>
              <span class="nb-hint">Uploaded ${fmtDate(U().tsToLocalDate(f.uploadedAt))}${f.mimeType ? ' · ' + esc(f.mimeType) : ''}</span>
            </div>
          </div>` : ''}
      </li>`;
  }

  async function loadFileUrls() {
    DataLayer.storageUsage().then(u => {
      const el = root() && root().querySelector('[data-storage-meter]');
      if (!el) return;
      const pct = u.limit ? Math.min(100, u.used / u.limit * 100) : 0;
      el.innerHTML = `<span class="meter__k">Private uploads, all companies</span>${UI.bar(pct, pct > 85 ? 'bar--warn' : '')}<span class="meter__v">${UI.bytes(u.used) || '0 B'} of ${UI.bytes(u.limit)}${u.links ? ` · ${u.links} saved link${u.links === 1 ? '' : 's'}` : ''}</span>`;
    }).catch(() => {});
    const paths = W.data.files.map(f => f.storagePath).filter(Boolean);
    if (!paths.length) return;
    try {
      const fresh = await DataLayer.files.urls(paths);
      W.fileUrls = { ...W.fileUrls, ...fresh };
      W.fileUrlsAt = Date.now();
      document.querySelectorAll('[data-file-open]').forEach(a => {
        const u = W.fileUrls[a.dataset.fileOpen];
        if (u) a.href = u;
      });
    } catch (err) { console.warn('[RUN] Could not prepare file links:', err); }
  }

  /* ---------- CHECKLIST ---------- */
  function renderChecklist() {
    const d = W.data, p = derived().progress;
    return `
      <div class="progress-line">
        <span class="progress-line__k">Research progress</span>
        ${UI.bar(p.pct, 'bar--lg')}
        <span class="progress-line__v">${p.pct}%<em>${p.done} of ${p.total}</em></span>
      </div>
      <ul class="cl">
        ${d.checklist.map(i => {
          const open = W.open.has(i.id);
          return `
          <li class="cl-item${i.completed ? ' is-done' : ''}${open ? ' is-open' : ''}" data-id="${i.id}">
            <div class="cl-item__line">
              <label class="check"><input type="checkbox" data-change="cl-check" ${i.completed ? 'checked' : ''}><span class="check__box" aria-hidden="true"></span><span class="sr-only">Mark “${esc(i.title)}” complete</span></label>
              <button class="cl-item__title" type="button" data-act="cl-toggle" aria-expanded="${open}">${esc(i.title)}</button>
              ${i.notes ? `<span class="tag">Note</span>` : ''}
              <span class="cl-item__date">${i.completed && i.completedOn ? fmtDate(i.completedOn) : ''}</span>
            </div>
            ${open ? `
              <div class="rec__edit">
                <div class="nb-grid">
                  ${field({ f: 'title', label: 'Item', type: 'text', wide: true }, i.title)}
                  ${field({ f: 'completedOn', label: 'Date completed', type: 'date' }, i.completedOn)}
                  ${field({ f: 'notes', label: 'Notes', type: 'textarea', ph: 'What you found, where, page numbers…' }, i.notes)}
                </div>
                <div class="nb-actions">
                  <button class="btn btn--solid btn--sm" type="button" data-act="cl-save">Save</button>
                  <button class="text-btn text-btn--danger" type="button" data-act="cl-delete">Remove item</button>
                </div>
              </div>` : ''}
          </li>`;
        }).join('')}
      </ul>
      <form class="quick" data-form="cl-add">
        <input class="nb-input quick__main" data-f="title" placeholder="Add a checklist item — e.g. Channel checks with dealers" aria-label="New checklist item">
        <button class="btn btn--sm" type="submit">Add item</button>
      </form>`;
  }

  /* ---------- THESIS ---------- */
  const THESIS_FIELDS = [
    { f: 'whyInterested', label: 'Why am I interested in this company?', rows: 3, ph: 'What caught your attention — and why now.' },
    { f: 'thesis', label: 'Investment thesis', rows: 7, ph: 'The core argument, in your own words.', big: true },
    { f: 'whatNeedsToHappen', label: 'What needs to happen for the thesis to work?', rows: 4, ph: 'Milestones, numbers, events that must play out.' },
    { f: 'keyAssumptions', label: 'Key assumptions', rows: 4, ph: 'Growth, margins, capital needs, market conditions…' },
    { f: 'whatChangesMind', label: 'What would change my mind?', rows: 4, ph: 'Specific evidence that would make you drop or reverse this view.' }
  ];

  function renderThesis() {
    const t = W.data.thesis[0] || {};
    const older = W.data.thesis.slice(1);
    return `
      <div class="nb" data-form="thesis">
        ${THESIS_FIELDS.map(f => `
          <div class="nb-field nb-field--wide">
            <label class="nb-label" for="th-${f.f}">${f.label}</label>
            <textarea class="nb-text${f.big ? ' nb-text--lg' : ''}" id="th-${f.f}" data-f="${f.f}" rows="${f.rows}" placeholder="${esc(f.ph)}">${esc(t[f.f] || '')}</textarea>
          </div>`).join('')}
        <div class="nb-field nb-field--wide">
          <span class="nb-label">Thesis confidence</span>
          <div class="scale" role="radiogroup" aria-label="Thesis confidence">
            ${RUN.CONFIDENCE.map(o => `
              <button type="button" class="scale__step${Number(t.confidence) >= o.value ? ' is-on' : ''}${Number(t.confidence) === o.value ? ' is-current' : ''}"
                role="radio" aria-checked="${Number(t.confidence) === o.value}" data-act="confidence" data-v="${o.value}">
                <span class="scale__bar"></span><span class="scale__label">${o.label}</span>
              </button>`).join('')}
            <input type="hidden" data-f="confidence" value="${t.confidence || ''}">
          </div>
        </div>
        <div class="nb-save">
          <input class="nb-input" data-f="changeNote" placeholder="What changed and why? (optional — kept in history)" aria-label="What changed">
          <span class="nb-dirty" hidden>Unsaved changes</span>
          <button class="btn btn--solid btn--sm" type="button" data-act="save-thesis">${W.data.thesis.length ? 'Save new version' : 'Save thesis'}</button>
        </div>
        <p class="nb-hint">Saving never overwrites: each save becomes a new version, so you can always read what you thought before.</p>
      </div>
      ${older.length ? `
        <details class="versions">
          <summary>Earlier versions · ${older.length}</summary>
          <ol class="versions__list">
            ${older.map(o => `
              <li>
                <details class="version">
                  <summary><span class="version__n">v${o.version}</span><span>${fmtDate(U().tsToLocalDate(o.createdAt))}</span>${o.changeNote ? `<span class="version__note">${esc(o.changeNote)}</span>` : ''}</summary>
                  <dl class="version__body">
                    ${THESIS_FIELDS.map(f => o[f.f] ? `<dt>${f.label}</dt><dd>${esc(o[f.f])}</dd>` : '').join('')}
                    <dt>Confidence</dt><dd>${esc(RUN.label('CONFIDENCE', o.confidence, 'Not set'))}</dd>
                  </dl>
                </details>
              </li>`).join('')}
          </ol>
        </details>` : ''}`;
  }

  /* ---------- GENERIC RECORD LISTS ---------- */
  const LISTS = {
    facts: {
      api: () => DataLayer.facts, rows: () => W.data.facts, titleField: 'fact',
      quick: [
        { f: 'fact', ph: 'Add a key fact or observation — e.g. Net cash of ₹120 cr at FY26 end', main: true, label: 'New fact' },
        { f: 'source', ph: 'Source', label: 'Source' }
      ],
      fields: [
        { f: 'fact', label: 'Fact / observation', type: 'textarea' },
        { f: 'detail', label: 'Detail', type: 'textarea', ph: 'Context, numbers, why it matters' },
        { f: 'source', label: 'Source', type: 'text', ph: 'e.g. AR FY26 p.114' },
        { f: 'observedOn', label: 'Date observed', type: 'date' }
      ],
      chips: r => [r.source ? 'Source · ' + r.source : null, r.observedOn ? fmtDate(r.observedOn) : null],
      empty: 'No facts recorded yet. Capture the numbers and observations the thesis rests on.'
    },
    catalysts: {
      api: () => DataLayer.catalysts, rows: () => W.data.catalysts, titleField: 'title',
      quick: [
        { f: 'title', ph: 'Add a catalyst — e.g. Q2 results, capacity expansion', main: true, label: 'New catalyst' },
        { f: 'expectedDate', type: 'date', label: 'Expected date' },
        { f: 'importance', type: 'select', list: 'LEVELS', def: 'medium', label: 'Importance' }
      ],
      fields: [
        { f: 'title', label: 'Catalyst', type: 'text', wide: true },
        { f: 'expectedDate', label: 'Expected date', type: 'date' },
        { f: 'importance', label: 'Importance', type: 'select', list: 'LEVELS' },
        { f: 'status', label: 'Status', type: 'select', list: 'CATALYST_STATUS' },
        { f: 'description', label: 'Description', type: 'textarea' },
        { f: 'notes', label: 'Notes', type: 'textarea' }
      ],
      chips: r => [
        r.expectedDate ? (fmtDate(r.expectedDate) + (r.status === 'expected' ? ' · ' + UI.until(r.expectedDate) : '')) : 'No date',
        'Importance · ' + RUN.label('LEVELS', r.importance), RUN.label('CATALYST_STATUS', r.status)
      ],
      dim: r => r.status === 'cancelled',
      empty: 'No catalysts yet. Record the events that could move the thesis — results, orders, capacity, debt.'
    },
    risks: {
      api: () => DataLayer.risks, rows: () => W.data.risks, titleField: 'title',
      quick: [
        { f: 'title', ph: 'Add a risk — e.g. Customer concentration', main: true, label: 'New risk' },
        { f: 'severity', type: 'select', list: 'LEVELS', def: 'medium', label: 'Severity' },
        { f: 'probability', type: 'select', list: 'LEVELS', def: 'medium', label: 'Probability' }
      ],
      fields: [
        { f: 'title', label: 'Risk', type: 'text', wide: true },
        { f: 'severity', label: 'Severity', type: 'select', list: 'LEVELS' },
        { f: 'probability', label: 'Probability (my assessment)', type: 'select', list: 'LEVELS' },
        { f: 'status', label: 'Status', type: 'select', list: 'RISK_STATUS' },
        { f: 'description', label: 'Description', type: 'textarea' },
        { f: 'confirmationSignal', label: 'What would confirm this risk?', type: 'textarea' },
        { f: 'mitigation', label: 'Mitigation / my response', type: 'textarea' }
      ],
      chips: r => ['Severity · ' + RUN.label('LEVELS', r.severity), 'Probability · ' + RUN.label('LEVELS', r.probability), RUN.label('RISK_STATUS', r.status)],
      dim: r => r.status === 'retired',
      empty: 'No risks recorded yet.'
    },
    questions: {
      api: () => DataLayer.questions, rows: () => W.data.questions, titleField: 'question',
      quick: [
        { f: 'question', ph: 'Add an open question — e.g. How is the new capacity being funded?', main: true, label: 'New question' },
        { f: 'whyItMatters', ph: 'Why it matters', label: 'Why it matters' }
      ],
      fields: [
        { f: 'question', label: 'Question', type: 'textarea' },
        { f: 'whyItMatters', label: 'Why it matters', type: 'textarea' },
        { f: 'status', label: 'Status', type: 'select', list: 'QUESTION_STATUS' },
        { f: 'source', label: 'Source', type: 'text', ph: 'Where the answer came from' },
        { f: 'resolvedOn', label: 'Date resolved', type: 'date' },
        { f: 'answer', label: 'Answer / notes', type: 'textarea' }
      ],
      chips: r => [RUN.label('QUESTION_STATUS', r.status), r.status === 'resolved' && r.resolvedOn ? 'Resolved ' + fmtDate(r.resolvedOn) : null],
      done: r => r.status === 'resolved', doneLabel: 'Resolved',
      empty: 'No open questions. Research is rarely complete — write down what you still need to know.'
    },
    tasks: {
      api: () => DataLayer.tasks, rows: () => W.data.tasks, titleField: 'title', check: true,
      quick: [
        { f: 'title', ph: 'Add a task — e.g. Recalculate fair value after Q2 results', main: true, label: 'New task' },
        { f: 'dueDate', type: 'date', label: 'Due date' },
        { f: 'priority', type: 'select', list: 'TASK_PRIORITY', def: 'normal', label: 'Priority' }
      ],
      fields: [
        { f: 'title', label: 'Task', type: 'text', wide: true },
        { f: 'dueDate', label: 'Due date', type: 'date' },
        { f: 'priority', label: 'Priority', type: 'select', list: 'TASK_PRIORITY' },
        { f: 'description', label: 'Description', type: 'textarea' }
      ],
      chips: r => [
        r.dueDate ? { t: 'Due ' + fmtDate(r.dueDate) + (!r.completed ? ' · ' + UI.until(r.dueDate) : ''), signal: !r.completed && UI.isOverdue(r.dueDate) } : null,
        r.priority !== 'normal' ? 'Priority · ' + RUN.label('TASK_PRIORITY', r.priority) : null,
        r.completed && r.completedAt ? 'Done ' + fmtDate(U().tsToLocalDate(r.completedAt)) : 'Added ' + fmtDate(U().tsToLocalDate(r.createdAt))
      ],
      done: r => r.completed, doneLabel: 'Completed',
      sort: (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority]),
      empty: 'No action items yet. Turn open work into tasks so it shows up on the Desk.'
    }
  };

  function renderList(key) {
    const L = LISTS[key];
    let rows = L.rows().slice();
    if (L.sort) rows.sort(L.sort);
    const open = L.done ? rows.filter(r => !L.done(r)) : rows;
    const done = L.done ? rows.filter(L.done) : [];
    const quick = `
      <form class="quick" data-form="list-add" data-list="${key}">
        ${L.quick.map(q => q.main
          ? `<input class="nb-input quick__main" data-f="${q.f}" placeholder="${esc(q.ph)}" aria-label="${esc(q.label)}">`
          : q.type === 'date'
            ? `<label class="quick__opt"><span>${esc(q.label)}</span><input class="nb-input" type="date" data-f="${q.f}"></label>`
            : q.type === 'select'
              ? `<label class="quick__opt"><span>${esc(q.label)}</span><select class="nb-input" data-f="${q.f}">${UI.options(q.list, q.def)}</select></label>`
              : `<input class="nb-input quick__side" data-f="${q.f}" placeholder="${esc(q.ph)}" aria-label="${esc(q.label)}">`).join('')}
        <button class="btn btn--sm" type="submit">Add</button>
      </form>`;
    const list = arr => `<ul class="recs">${arr.map(r => recRow(key, r)).join('')}</ul>`;
    return `
      ${quick}
      ${rows.length ? '' : `<p class="ws-empty">${esc(L.empty)}</p>`}
      ${open.length ? list(open) : ''}
      ${done.length ? `<details class="recs-done"${done.some(r => W.open.has(r.id)) ? ' open' : ''}><summary>${L.doneLabel} · ${done.length}</summary>${list(done)}</details>` : ''}`;
  }

  function recRow(key, r) {
    const L = LISTS[key];
    const open = W.open.has(r.id);
    const isDone = L.done ? L.done(r) : false;
    const chips = (L.chips(r) || []).filter(Boolean).map(c => typeof c === 'string'
      ? `<span class="tag">${esc(c)}</span>` : `<span class="tag${c.signal ? ' tag--signal' : ''}">${esc(c.t)}</span>`).join('');
    return `
      <li class="rec${isDone ? ' is-done' : ''}${L.dim && L.dim(r) ? ' is-dim' : ''}${open ? ' is-open' : ''}" data-id="${r.id}" data-list="${key}">
        <div class="rec__line">
          ${L.check ? `<label class="check"><input type="checkbox" data-change="rec-check" ${r.completed ? 'checked' : ''}><span class="check__box" aria-hidden="true"></span><span class="sr-only">Mark complete</span></label>`
                    : `<span class="rec__mark" aria-hidden="true"></span>`}
          <button class="rec__title" type="button" data-act="rec-toggle" aria-expanded="${open}">${esc(r[L.titleField])}</button>
          <span class="rec__chips">${chips}</span>
        </div>
        ${open ? `
          <div class="rec__edit">
            <div class="nb-grid">${L.fields.map(f => field(f, r[f.f])).join('')}</div>
            <div class="nb-actions">
              <button class="btn btn--solid btn--sm" type="button" data-act="rec-save">Save</button>
              <button class="text-btn" type="button" data-act="rec-toggle">Close</button>
              <button class="text-btn text-btn--danger" type="button" data-act="rec-delete">Delete</button>
            </div>
          </div>` : ''}
      </li>`;
  }

  /* ---------- VALUATION ---------- */
  const VAL_FIELDS = [
    { f: 'fairValue', label: 'Fair value' },
    { f: 'bearTarget', label: 'Bear-case target' },
    { f: 'baseTarget', label: 'Base-case target' },
    { f: 'bullTarget', label: 'Bull-case target' },
    { f: 'entryLow', label: 'Preferred entry — low' },
    { f: 'entryHigh', label: 'Preferred entry — high' },
    { f: 'stopLoss', label: 'Stop-loss' },
    { f: 'invalidationPrice', label: 'Invalidation price' }
  ];

  function renderValuation() {
    const x = derived(), v = x.v || {}, cur = v.currency || x.cur;
    const methods = (v.methods && v.methods.length) ? v.methods : [{ method: '', basis: '', value: null }];
    return `
      <div class="val" data-form="valuation">
        <div class="val-top">
          <div class="val-price">
            <span class="nb-label">Current price</span>
            <span class="val-price__v" data-price-now>${x.price != null ? UI.money(x.price, x.cur) : '—'}</span>
            <span class="val-price__sub">${x.c.priceAsOf ? 'as of ' + fmtDate(x.c.priceAsOf) + ' · ' : ''}<button class="text-btn" type="button" data-act="edit-price">${x.price != null ? 'update price' : 'enter price'}</button></span>
          </div>
          <div class="nb-field"><label class="nb-label" for="val-cur">Currency</label>
            <select class="nb-input" id="val-cur" data-f="currency">${RUN.CURRENCIES.map(o => `<option value="${o.value}"${o.value === cur ? ' selected' : ''}>${o.symbol} ${o.value}</option>`).join('')}</select></div>
          <div class="nb-field"><label class="nb-label" for="val-asof">Valuation date</label>
            <input class="nb-input" id="val-asof" type="date" data-f="asOf" value="${esc(U().today())}"></div>
          <div class="nb-field"><label class="nb-label" for="val-hz">Time horizon</label>
            <input class="nb-input" id="val-hz" data-f="timeHorizon" value="${esc(v.timeHorizon || '')}" placeholder="e.g. 18–24 months"></div>
        </div>

        <div class="val-grid">
          <p class="val-grid__k">Value</p>
          ${VAL_FIELDS.slice(0, 4).map(f => valInput(f, v)).join('')}
          <p class="val-grid__k">Price levels</p>
          ${VAL_FIELDS.slice(4).map(f => valInput(f, v)).join('')}
        </div>

        <div class="val-calc" data-calc aria-live="polite"></div>

        <div class="val-methods">
          <span class="nb-label">Valuation methods</span>
          <p class="nb-hint">One line per method you used — none is assumed. Pick from the list or type your own.</p>
          <div class="vm-rows">
            ${methods.map(mm => vmRow(mm)).join('')}
          </div>
          <datalist id="vmList">${RUN.VALUATION_METHODS.map(mm => `<option value="${esc(mm)}">`).join('')}</datalist>
          <button class="text-btn" type="button" data-act="vm-add">+ Add method</button>
        </div>

        <div class="nb-field nb-field--wide">
          <label class="nb-label" for="val-mn">How I'm valuing it</label>
          <textarea class="nb-text" id="val-mn" data-f="methodNotes" rows="3" placeholder="Which method matters most here and why.">${esc(v.methodNotes || '')}</textarea>
        </div>
        <div class="nb-field nb-field--wide">
          <label class="nb-label" for="val-as">Key valuation assumptions</label>
          <textarea class="nb-text" id="val-as" data-f="assumptions" rows="4" placeholder="Revenue growth, margins, multiple, discount rate, terminal growth…">${esc(v.assumptions || '')}</textarea>
        </div>

        <div class="nb-save">
          <input class="nb-input" data-f="changeNote" placeholder="Reason for this valuation / what changed (kept in history)" aria-label="Reason">
          <span class="nb-dirty" hidden>Unsaved changes</span>
          <button class="btn btn--solid btn--sm" type="button" data-act="save-valuation">Save valuation snapshot</button>
        </div>
        <p class="nb-hint">Every save is stored as a new snapshot. Earlier valuations are never overwritten.</p>
      </div>
      ${valHistory()}`;
  }

  function valInput(f, v) {
    const val = v[f.f];
    return `<div class="nb-field"><label class="nb-label" for="val-${f.f}">${f.label}</label>
      <input class="nb-input nb-input--num" id="val-${f.f}" data-f="${f.f}" inputmode="decimal" value="${val == null ? '' : esc(val)}" data-was="${val == null ? '' : esc(val)}" placeholder="—"></div>`;
  }

  function vmRow(mm) {
    return `<div class="vm-row">
      <input class="nb-input" data-m="method" list="vmList" value="${esc(mm.method || '')}" placeholder="Method" aria-label="Method">
      <input class="nb-input" data-m="basis" value="${esc(mm.basis || '')}" placeholder="Basis — e.g. 18× FY27E EPS of ₹52" aria-label="Basis">
      <input class="nb-input nb-input--num" data-m="value" inputmode="decimal" value="${mm.value == null ? '' : esc(mm.value)}" placeholder="Implied value" aria-label="Implied value">
      <button class="text-btn" type="button" data-act="vm-remove" aria-label="Remove method">×</button>
    </div>`;
  }

  function readValuation() {
    const form = root().querySelector('[data-form="valuation"]');
    if (!form) return null;
    const out = UI.read(form);
    VAL_FIELDS.forEach(f => { out[f.f] = UI.num(out[f.f]); });
    out.methods = [...form.querySelectorAll('.vm-row')].map(r => ({
      method: r.querySelector('[data-m="method"]').value,
      basis: r.querySelector('[data-m="basis"]').value,
      value: UI.num(r.querySelector('[data-m="value"]').value)
    }));
    return out;
  }

  function updateCalc() {
    const el = root() && root().querySelector('[data-calc]');
    if (!el) return;
    const v = readValuation(), x = derived(), P = x.price, cur = v.currency || x.cur;
    if (P == null) {
      el.innerHTML = `<p class="nb-hint">Enter the current price to see upside, downside and where the price sits against your entry range.</p>`;
      return;
    }
    const rows = [
      ['Upside to base target', UI.move(P, v.baseTarget)],
      ['Upside to bull target', UI.move(P, v.bullTarget)],
      ['Move to fair value', UI.move(P, v.fairValue)],
      ['Move to bear target', UI.move(P, v.bearTarget)],
      ['Downside to stop-loss', UI.move(P, v.stopLoss)],
      ['Downside to invalidation', UI.move(P, v.invalidationPrice)]
    ].filter(r => r[1] != null);
    const upside = UI.move(P, v.baseTarget), downside = UI.move(P, v.stopLoss ?? v.invalidationPrice);
    const ratio = upside != null && downside != null && downside < 0 ? (upside / Math.abs(downside)) : null;
    const mv = v.methods.map(m => m.value).filter(n => n != null);
    const avg = mv.length >= 2 ? mv.reduce((a, b) => a + b, 0) / mv.length : null;
    const pos = entryPosition(P, v.entryLow, v.entryHigh);
    el.innerHTML = `
      <p class="val-calc__k">Calculated from ${UI.money(P, cur)}</p>
      <dl class="val-calc__grid">
        ${rows.map(([k, n]) => `<div><dt>${k}</dt><dd>${UI.pct(n)}</dd></div>`).join('')}
        ${ratio != null ? `<div><dt>Upside ÷ downside</dt><dd>${ratio.toFixed(2)}×</dd></div>` : ''}
        ${avg != null ? `<div><dt>Average of method values</dt><dd>${UI.money(Math.round(avg * 100) / 100, cur)}</dd></div>` : ''}
      </dl>
      ${pos ? `<p class="val-calc__pos">${esc(pos)}</p>` : ''}
      ${!rows.length && !pos ? `<p class="nb-hint">Enter targets and levels to see the arithmetic.</p>` : ''}`;
  }

  function valHistory() {
    const list = W.data.valuations;
    if (!list.length) return '';
    const m = (n, c) => n == null ? '—' : UI.money(n, c);
    return `
      <div class="val-history">
        <p class="nb-label">Valuation history · ${list.length} snapshot${list.length === 1 ? '' : 's'}</p>
        <div class="vh">
          <div class="vh__row vh__row--head" aria-hidden="true">
            <span>Date</span><span>Price then</span><span>Fair value</span><span>Bear · Base · Bull</span><span>Entry</span><span>Stop · Invalidation</span><span></span>
          </div>
          ${list.map((s, i) => {
            const older = list[i + 1];
            const ch = k => older && Number(older[k]) !== Number(s[k]) ? ' is-changed' : '';
            const c = s.currency;
            const methods = (s.methods || []).map(x => x.method).filter(Boolean).join(', ');
            return `
            <div class="vh__row${i === 0 ? ' is-latest' : ''}" data-id="${s.id}">
              <span data-k="Date">${fmtDate(s.asOf)}${i === 0 ? '<em>Latest</em>' : ''}</span>
              <span data-k="Price then">${m(s.priceAtSnapshot, c)}</span>
              <span data-k="Fair value" class="${ch('fairValue')}">${m(s.fairValue, c)}</span>
              <span data-k="Bear · Base · Bull"><i class="${ch('bearTarget')}">${m(s.bearTarget, c)}</i> · <b class="${ch('baseTarget')}">${m(s.baseTarget, c)}</b> · <i class="${ch('bullTarget')}">${m(s.bullTarget, c)}</i></span>
              <span data-k="Entry" class="${ch('entryLow') || ch('entryHigh')}">${s.entryLow != null || s.entryHigh != null ? `${m(s.entryLow, c)}–${m(s.entryHigh, c)}` : '—'}</span>
              <span data-k="Stop · Invalidation" class="${ch('stopLoss') || ch('invalidationPrice')}">${m(s.stopLoss, c)} · ${m(s.invalidationPrice, c)}</span>
              <span class="vh__act"><button class="text-btn text-btn--danger" type="button" data-act="val-delete" aria-label="Delete snapshot">Delete</button></span>
              <span data-k="Method / reason" class="vh__note">${esc([methods, s.changeNote].filter(Boolean).join(' — '))}</span>
            </div>`;
          }).join('')}
        </div>
        <p class="nb-hint">Values that changed from the snapshot before are marked <span class="is-changed">like this</span>.</p>
      </div>`;
  }

  /* ---------- DECISION ---------- */
  function renderDecision() {
    const d = W.data, c = d.company, last = d.decisions[0] || {};
    const sel = W.pickDecision || c.decision || '';
    return `
      <div class="dec-now">
        <span class="nb-label">Current decision</span>
        <p class="dec-now__v">${esc(UI.decisionLabel(c.decision))}</p>
        <p class="dec-now__sub">${c.decision ? [
          'Recorded ' + fmtDate(c.decisionDate),
          last.holdingStatus ? RUN.label('HOLDING_STATUS', last.holdingStatus) : null,
          last.positionSizePct != null ? `Position ${Number(last.positionSizePct)}%` : null,
          last.maxAllocationPct != null ? `max ${Number(last.maxAllocationPct)}%` : null,
          last.timeHorizon ? 'Horizon ' + esc(last.timeHorizon) : null
        ].filter(Boolean).join(' · ') : 'Finish research with an explicit decision — not just “researched”.'}</p>
      </div>
      <div class="nb" data-form="decision">
        <div class="nb-field nb-field--wide">
          <span class="nb-label">Record a decision</span>
          <div class="chips" role="radiogroup" aria-label="Decision">
            ${RUN.DECISIONS.map(o => `<button type="button" class="chip${sel === o.value ? ' is-active' : ''}" role="radio" aria-checked="${sel === o.value}" data-act="pick-decision" data-v="${o.value}">${o.label}</button>`).join('')}
          </div>
          <input type="hidden" data-f="decision" value="${esc(sel)}">
        </div>
        <div class="nb-grid">
          ${field({ f: 'decidedOn', label: 'Decision date', type: 'date' }, U().today())}
          ${field({ f: 'timeHorizon', label: 'Time horizon', type: 'text', ph: 'e.g. 2–3 years' }, last.timeHorizon || (d.valuations[0] && d.valuations[0].timeHorizon) || '')}
          ${field({ f: 'holdingStatus', label: 'Current holding status', type: 'select', list: 'HOLDING_STATUS' }, last.holdingStatus || 'not_held')}
          ${field({ f: 'positionSizePct', label: 'Position size %', type: 'number', ph: 'e.g. 3' }, last.positionSizePct ?? '')}
          ${field({ f: 'maxAllocationPct', label: 'Maximum intended allocation %', type: 'number', ph: 'e.g. 6' }, last.maxAllocationPct ?? '')}
          ${field({ f: 'rationale', label: 'Decision rationale', type: 'textarea', rows: 4, ph: 'Why this decision, at this price, now.' }, '')}
        </div>
        <div class="nb-save">
          <span class="nb-dirty" hidden>Unsaved changes</span>
          <button class="btn btn--solid btn--sm" type="button" data-act="save-decision">Record decision</button>
        </div>
        <p class="nb-hint">This records your own decision. The app does not suggest, rank or judge decisions.</p>
      </div>
      ${d.decisions.length ? `
        <div class="dec-log">
          <p class="nb-label">Decision log · ${d.decisions.length}</p>
          <ol class="log">
            ${d.decisions.map(x => `
              <li class="log__item">
                <span class="log__date">${fmtDate(x.decidedOn)}</span>
                <div class="log__body">
                  <p class="log__title">${esc(UI.decisionLabel(x.decision))}
                    <span class="log__meta">${[
                      RUN.label('HOLDING_STATUS', x.holdingStatus),
                      x.positionSizePct != null ? `position ${Number(x.positionSizePct)}%` : null,
                      x.maxAllocationPct != null ? `max ${Number(x.maxAllocationPct)}%` : null,
                      x.priceAtDecision != null ? 'price ' + UI.money(x.priceAtDecision, W.data.company.priceCurrency) : null,
                      x.timeHorizon ? esc(x.timeHorizon) : null
                    ].filter(Boolean).join(' · ')}</span></p>
                  ${x.rationale ? `<p class="log__note">${esc(x.rationale)}</p>` : ''}
                </div>
              </li>`).join('')}
          </ol>
        </div>` : ''}`;
  }

  /* ---------- POSITION & TRANSACTIONS ---------- */
  const fmtQty = q => Number(q).toLocaleString('en-IN', { maximumFractionDigits: 4 });
  function positionNow() {
    return Portfolio.position(W.data.transactions || []);
  }

  function renderPosition() {
    const c = W.data.company, cur = c.priceCurrency || 'INR', m = v => UI.money(v == null ? null : Math.round(v * 100) / 100, cur);
    const p = positionNow();
    const price = UI.num(c.currentPrice);
    const usePrice = price ?? p.avg;
    const value = p.qty > 0 && usePrice != null ? p.qty * usePrice : null;
    const pnl = value != null ? value - p.cost : null;
    const lastDec = W.data.decisions[0] || {};
    const txs = W.data.transactions;
    const cells = [
      ['Shares held', p.qty > 0 ? fmtQty(p.qty) : '—', p.firstDate && p.qty > 0 ? 'since ' + fmtDate(p.firstDate) : ''],
      ['Average cost', p.qty > 0 ? m(p.avg) : '—', 'includes charges'],
      ['Invested', p.qty > 0 ? m(p.cost) : '—', ''],
      ['Current value', value != null ? m(value) : '—', price == null && p.qty > 0 ? 'no price entered: using cost' : (c.priceAsOf ? 'at ' + m(price) + ' · ' + fmtShortDate(c.priceAsOf) : '')],
      ['Unrealised P&L', pnl != null ? m(pnl) : '—', pnl != null && p.cost ? UI.pct(pnl / p.cost * 100) : ''],
      ['Realised P&L', txs.some(t => t.type === 'sell') ? m(p.realised) : '—', ''],
      ['Portfolio allocation', p.qty > 0 ? '<span data-alloc>…</span>' : '—', '<span data-alloc-sub></span>'],
      ['Max allocation', lastDec.maxAllocationPct != null ? Number(lastDec.maxAllocationPct) + '%' : '—', lastDec.maxAllocationPct != null ? 'from your decision' : 'set it in Decision']
    ];
    setTimeout(fillAllocation, 0);
    return `
      <div class="ws-ledger ws-ledger--pos">
        ${cells.map(([k, v, sub]) => `<div class="ws-cell"><span class="ws-cell__k">${k}</span><span class="ws-cell__v ws-cell__v--sm">${v}</span>${sub ? `<span class="ws-cell__sub">${sub}</span>` : ''}</div>`).join('')}
      </div>
      ${p.oversold ? `<p class="nb-hint is-signal">The sells add up to ${fmtQty(p.oversold)} more shares than were bought. Check the trades below.</p>` : ''}
      <form class="trade" data-form="trade-add">
        <div class="trade__side" role="radiogroup" aria-label="Buy or sell">
          <label><input type="radio" name="tradeType" value="buy" data-f="type" checked><span>Buy</span></label>
          <label><input type="radio" name="tradeType" value="sell"><span>Sell</span></label>
        </div>
        <label class="quick__opt"><span>Date</span><input class="nb-input" type="date" data-f="tradeDate" value="${esc(U().today())}"></label>
        <label class="quick__opt"><span>Shares</span><input class="nb-input nb-input--num" data-f="quantity" inputmode="decimal" placeholder="0"></label>
        <label class="quick__opt"><span>Price</span><input class="nb-input nb-input--num" data-f="price" inputmode="decimal" value="${price ?? ''}" placeholder="0.00"></label>
        <label class="quick__opt"><span>Charges</span><input class="nb-input nb-input--num" data-f="fees" inputmode="decimal" placeholder="0"></label>
        <input class="nb-input quick__side" data-f="notes" placeholder="Note (optional)" aria-label="Note">
        <button class="btn btn--sm" type="submit">Add trade</button>
      </form>
      ${txs.length ? `
        <div class="txs">
          <div class="tx tx--head" aria-hidden="true"><span>Date</span><span>Type</span><span>Shares</span><span>Price</span><span>Charges</span><span>Amount</span><span></span></div>
          ${txs.map(t => {
            const amt = t.quantity * t.price + (t.type === 'buy' ? 1 : -1) * (t.fees || 0);
            return `<div class="tx" data-id="${t.id}">
              <span data-k="Date">${fmtDate(t.tradeDate)}</span>
              <span data-k="Type" class="tx__type tx__type--${t.type}">${t.type === 'buy' ? 'Buy' : 'Sell'}${t.source === 'import' ? '<em>imported</em>' : ''}</span>
              <span data-k="Shares">${fmtQty(t.quantity)}</span>
              <span data-k="Price">${UI.money(Number(t.price), cur)}</span>
              <span data-k="Charges">${t.fees ? UI.money(Number(t.fees), cur) : '—'}</span>
              <span data-k="Amount">${UI.money(Math.round(amt * 100) / 100, cur)}</span>
              <span class="tx__act"><button class="text-btn text-btn--danger" type="button" data-act="trade-delete">Delete</button></span>
              ${t.notes ? `<span class="tx__note">${esc(t.notes)}</span>` : ''}
            </div>`;
          }).join('')}
        </div>` : `<p class="ws-empty">No trades recorded. Add a buy above when you take a position; the Portfolio page is built from these.</p>`}
      <p class="nb-hint">Average-cost method. <a class="arrow-link" href="#/portfolio">Open the portfolio <span aria-hidden="true">→</span></a></p>`;
  }

  async function fillAllocation() {
    try {
      const pf = await DataLayer.portfolio();
      const r = pf.rows.find(x => x.company.id === W.data.company.id);
      const a = root() && root().querySelector('[data-alloc]');
      const sub = root() && root().querySelector('[data-alloc-sub]');
      if (!a || !r) return;
      a.textContent = r.portfolioAlloc.toFixed(1) + '%';
      if (sub) sub.innerHTML = pf.totals.cash ? 'of stocks + cash' : 'of your holdings';
      if (r.overMax && sub) sub.innerHTML += ' · <span class="is-signal">above your max</span>';
    } catch (e) { /* not critical */ }
  }

  /* ---------- REVIEW ---------- */
  function renderReview() {
    const x = derived(), d = W.data;
    const nr = x.nextReview;
    const preset = W.reviewPreset;
    const pr = RUN.REVIEW_PRESETS.find(p => p.value === preset);
    const upcoming = d.catalysts.filter(c => c.status === 'expected' || c.status === 'delayed');
    let dateVal = '';
    if (pr && pr.days) dateVal = U().addDays(U().today(), pr.days);
    if (pr && pr.value === 'catalyst' && W.reviewCatalyst) {
      const cat = d.catalysts.find(c => c.id === W.reviewCatalyst);
      if (cat && cat.expectedDate) dateVal = cat.expectedDate;
    }
    const noteDefault = pr ? ({ next_results: 'After next quarterly results', monthly: 'Monthly review', quarterly: 'Quarterly review' }[pr.value] || '') : '';
    const completed = d.reviews.filter(r => r.status === 'completed').sort((a, b) => (b.completedOn || '').localeCompare(a.completedOn || ''));
    const cat = nr && nr.catalystId ? d.catalysts.find(c => c.id === nr.catalystId) : null;
    return `
      <div class="rev-now">
        <div class="rev-now__cell">
          <span class="nb-label">Next review</span>
          <p class="rev-now__v${nr && UI.isOverdue(nr.scheduledFor) ? ' is-signal' : ''}">${nr ? (nr.scheduledFor ? fmtDate(nr.scheduledFor) : 'When the catalyst occurs') : 'Not scheduled'}</p>
          ${nr ? `<p class="rev-now__sub">${[nr.scheduledFor ? UI.until(nr.scheduledFor) : null, nr.triggerNote || null, cat ? 'Catalyst: ' + cat.title : null, nr.recurrenceDays ? `repeats every ${nr.recurrenceDays} days` : null].filter(Boolean).map(esc).join(' · ')}
            · <button class="text-btn" type="button" data-act="review-cancel">cancel</button></p>` : ''}
        </div>
        <div class="rev-now__cell">
          <span class="nb-label">Last reviewed</span>
          <p class="rev-now__v">${x.lastReview ? fmtDate(x.lastReview.completedOn) : 'Never'}</p>
          ${x.lastReview ? `<p class="rev-now__sub">${esc(relativeDays(x.lastReview.completedOn))}</p>` : ''}
        </div>
      </div>

      <div class="nb rev-block" data-form="review-schedule">
        <span class="nb-label">${nr ? 'Reschedule the next review' : 'Schedule the next review'}</span>
        <div class="chips" role="radiogroup" aria-label="When to review">
          ${RUN.REVIEW_PRESETS.map(p => `<button type="button" class="chip${preset === p.value ? ' is-active' : ''}" data-act="review-preset" data-v="${p.value}" role="radio" aria-checked="${preset === p.value}">${p.label}</button>`).join('')}
        </div>
        ${pr ? `
          <div class="nb-grid">
            ${pr.value === 'catalyst' ? `
              <div class="nb-field"><label class="nb-label" for="rev-cat">Catalyst</label>
                <select class="nb-input" id="rev-cat" data-f="catalystId" data-change="review-catalyst">
                  <option value="">${upcoming.length ? 'Choose a catalyst' : 'No upcoming catalysts recorded'}</option>
                  ${upcoming.map(c => `<option value="${c.id}"${W.reviewCatalyst === c.id ? ' selected' : ''}>${esc(c.title)}${c.expectedDate ? ' · ' + fmtDate(c.expectedDate) : ''}</option>`).join('')}
                </select></div>` : ''}
            ${field({ f: 'scheduledFor', label: pr.value === 'catalyst' ? 'Review date (optional)' : 'Review date', type: 'date' }, dateVal)}
            ${field({ f: 'triggerNote', label: 'Note', type: 'text', ph: 'e.g. Check margins after Q2', wide: true }, noteDefault)}
          </div>
          ${pr.recurring ? `<p class="nb-hint">Repeats automatically: when you mark it reviewed, the next one is scheduled ${pr.recurring} days later.</p>` : ''}
          <div class="nb-actions"><button class="btn btn--solid btn--sm" type="button" data-act="review-save">Schedule review</button></div>` : ''}
      </div>

      <div class="nb rev-block" data-form="review-complete">
        <span class="nb-label">Record a review</span>
        <textarea class="nb-text" data-f="notes" rows="3" placeholder="What did you check? Did anything change in the thesis, valuation or decision?"></textarea>
        <div class="nb-actions">
          ${field({ f: 'completedOn', label: 'Reviewed on', type: 'date' }, U().today())}
          <button class="btn btn--sm" type="button" data-act="review-complete">Mark reviewed</button>
        </div>
      </div>

      ${completed.length ? `
        <div class="rev-log">
          <p class="nb-label">Review log · ${completed.length}</p>
          <ol class="log">
            ${completed.map(r => `
              <li class="log__item">
                <span class="log__date">${fmtDate(r.completedOn)}</span>
                <div class="log__body">
                  <p class="log__title">Reviewed${r.triggerNote ? ` <span class="log__meta">${esc(r.triggerNote)}</span>` : ''}</p>
                  ${r.reviewNotes ? `<p class="log__note">${esc(r.reviewNotes)}</p>` : ''}
                </div>
              </li>`).join('')}
          </ol>
        </div>` : ''}`;
  }

  /* ---------- HISTORY ---------- */
  function renderHistory() {
    const d = W.data;
    const types = [...new Set(d.updates.map(u => u.updateType))];
    const shown = W.histFilter === 'all' ? d.updates : d.updates.filter(u => u.updateType === W.histFilter);
    return `
      <details class="upd-add"${W.addingUpdate ? ' open' : ''}>
        <summary class="btn btn--sm">+ Add research update</summary>
        <div class="nb" data-form="update">
          <div class="nb-grid">
            ${field({ f: 'happenedOn', label: 'Date', type: 'date' }, U().today())}
            ${field({ f: 'type', label: 'Type', type: 'select', list: 'UPDATE_TYPES' }, 'note')}
            ${field({ f: 'title', label: 'Title', type: 'text', ph: 'e.g. Q2 results — margins ahead of my assumption', wide: true }, '')}
            ${field({ f: 'previous', label: 'Previous value (optional)', type: 'text', ph: 'e.g. ₹850' }, '')}
            ${field({ f: 'next', label: 'New value (optional)', type: 'text', ph: 'e.g. ₹920' }, '')}
            ${field({ f: 'note', label: 'Note', type: 'textarea', rows: 3, ph: 'What happened and what it means for the thesis.' }, '')}
          </div>
          <div class="nb-actions"><button class="btn btn--solid btn--sm" type="button" data-act="update-save">Save update</button></div>
        </div>
      </details>
      ${types.length > 1 ? `
        <div class="filter-row ws-filter" role="group" aria-label="Filter history">
          <button class="filter-chip${W.histFilter === 'all' ? ' is-active' : ''}" type="button" data-act="hist-filter" data-v="all">All</button>
          ${types.map(t => `<button class="filter-chip${W.histFilter === t ? ' is-active' : ''}" type="button" data-act="hist-filter" data-v="${t}">${esc(RUN.label('UPDATE_TYPES', t))}</button>`).join('')}
        </div>` : ''}
      ${shown.length ? timeline(shown, W.data.company.priceCurrency, true) : `<p class="ws-empty">No history yet. Thesis, valuation, decision and status changes are recorded here automatically.</p>`}`;
  }

  /* Shared with the Desk. */
  function timeline(items, currency, deletable, withCompany = false) {
    const fmtVal = (u, v) => v == null ? '' : (PRICE_FIELDS.includes(u.field) && !isNaN(Number(v)) ? UI.money(Number(v), (u.company && u.company.priceCurrency) || currency) : v);
    return `
      <ol class="timeline">
        ${items.map(u => `
          <li class="tl" data-id="${u.id}" data-company="${esc(u.companyId)}" data-type="${esc(u.updateType)}"${u.updateType === 'status' && u.newValue === 'Researched' ? ' data-done="1"' : ''}>
            <span class="tl__node" aria-hidden="true"></span>
            <div class="tl__head">
              <span class="tl__date">${fmtDate(u.happenedOn)}</span>
              <span class="tl__type">${esc(RUN.label('UPDATE_TYPES', u.updateType))}</span>
              ${withCompany && u.company ? `<a class="tl__company" href="#/company/${esc(u.company.slug)}/history">${esc(u.company.name)}</a>` : ''}
            </div>
            <p class="tl__title">${esc(u.title)}</p>
            ${u.previousValue != null || u.newValue != null ? `<p class="tl__change">${u.field === 'confidence' ? '<em>Confidence</em> ' : ''}${u.previousValue != null ? `<s>${esc(fmtVal(u, u.previousValue))}</s> → ` : ''}<span>${esc(fmtVal(u, u.newValue))}</span></p>` : ''}
            ${u.note ? `<p class="tl__note">${esc(u.note)}</p>` : ''}
            ${deletable ? `<button class="text-btn text-btn--danger tl__del" type="button" data-act="update-delete">Delete entry</button>` : ''}
          </li>`).join('')}
      </ol>`;
  }

  /* ---------- RESEARCH COMPLETION PANEL ---------- */
  function renderComplete() {
    const el = document.getElementById('wsComplete');
    if (!el) return;
    if (!W.completing) { el.hidden = true; el.innerHTML = ''; return; }
    const x = derived(), c = x.c;
    const sel = W.completeDecision ?? (c.decision && c.decision !== 'researching' ? c.decision : '');
    const checks = [
      { ok: x.progress.total > 0 && x.progress.done === x.progress.total, t: `Checklist ${x.progress.done} of ${x.progress.total} complete (${x.progress.pct}%)` },
      { ok: !!(x.thesis && x.thesis.thesis), t: x.thesis ? `Thesis written — version ${x.thesis.version}` : 'No thesis written' },
      { ok: !!(x.v && x.v.baseTarget != null), t: x.v ? `Valuation recorded${x.v.baseTarget != null ? ' — base target ' + UI.money(x.v.baseTarget, x.v.currency) : ' (no base target)'}` : 'No valuation recorded' },
      { ok: x.v && (x.v.stopLoss != null || x.v.invalidationPrice != null), t: x.v && (x.v.stopLoss != null || x.v.invalidationPrice != null) ? 'Stop / invalidation level set' : 'No stop / invalidation level' },
      { ok: x.openQ.length === 0, t: x.openQ.length ? `${x.openQ.length} open question${x.openQ.length === 1 ? '' : 's'} still unresolved` : 'No unresolved questions' },
      { ok: !!x.nextReview, t: x.nextReview ? `Next review ${x.nextReview.scheduledFor ? fmtDate(x.nextReview.scheduledFor) : 'scheduled'}` : 'No review scheduled' }
    ];
    el.hidden = false;
    el.innerHTML = `
      <div class="ws-complete__inner">
        <p class="act__kicker"><em>Close research</em>${esc(c.name)}</p>
        <h2 class="ws-complete__title">Finish with a decision.</h2>
        <ul class="ws-complete__checks">
          ${checks.map(k => `<li data-ok="${k.ok ? 'yes' : 'no'}"><span class="node node--${k.ok ? 'researched' : 'watch'}" aria-hidden="true"></span>${esc(k.t)}</li>`).join('')}
        </ul>
        <p class="nb-hint">These are facts about your notes, not requirements — you can complete research with gaps. A decision is the one thing required.</p>
        <div class="nb" data-form="complete">
          <span class="nb-label">Your decision</span>
          <div class="chips" role="radiogroup" aria-label="Decision">
            ${RUN.DECISIONS.filter(o => o.value !== 'researching').map(o => `<button type="button" class="chip${sel === o.value ? ' is-active' : ''}" role="radio" aria-checked="${sel === o.value}" data-act="complete-pick" data-v="${o.value}">${o.label}</button>`).join('')}
          </div>
          ${field({ f: 'rationale', label: 'Decision rationale', type: 'textarea', rows: 3, ph: 'Why this decision, in a few sentences.' }, W.completeRationale || '')}
          <div class="nb-actions">
            <button class="btn btn--solid btn--sm" type="button" data-act="complete-confirm">Complete research</button>
            <button class="text-btn" type="button" data-act="complete-cancel">Not yet</button>
            <span class="nb-status" data-complete-status></span>
          </div>
        </div>
      </div>`;
  }

  /* ==========================================================
     EVENTS (one delegated handler per event type)
     ========================================================== */
  function bind() {
    const el = root();
    el.onclick = onClick;
    el.onchange = onChange;
    el.oninput = onInput;
    el.onsubmit = onSubmit;
    el.ondragover = e => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('is-over'); } };
    el.ondragleave = e => { const z = e.target.closest('[data-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('is-over'); };
    el.ondrop = e => {
      const z = e.target.closest('[data-drop]');
      if (!z) return;
      e.preventDefault();
      z.classList.remove('is-over');
      pickFiles(e.dataTransfer.files);
    };
  }

  const company = () => W.data.company;
  const rowOf = t => t.closest('[data-id]');

  function markDirty(sec, on = true) {
    if (on) W.dirty.add(sec); else W.dirty.delete(sec);
    const body = root() && root().querySelector(`[data-body="${sec}"]`);
    const flag = body && body.querySelector('.nb-dirty');
    if (flag) flag.hidden = !on;
  }

  function onInput(e) {
    const t = e.target;
    const form = t.closest('[data-form]');
    if (!form) return;
    const f = form.dataset.form;
    if (f === 'thesis') markDirty('thesis');
    if (f === 'valuation') {
      markDirty('valuation');
      if (t.dataset.was !== undefined) t.classList.toggle('is-edited', t.value.trim() !== t.dataset.was);
      updateCalc();
    }
    if (f === 'decision') markDirty('decision');
  }

  async function onChange(e) {
    const t = e.target;
    if (t.id === 'wsFileInput') { pickFiles(t.files); t.value = ''; return; }
    const act = t.dataset.change;
    if (act === 'cl-check') {
      const li = rowOf(t), id = li.dataset.id;
      const item = W.data.checklist.find(i => i.id === id);
      item.completed = t.checked;
      item.completedOn = t.checked ? U().today() : null;
      li.classList.toggle('is-done', t.checked);
      const date = li.querySelector('.cl-item__date');
      if (date) date.textContent = t.checked ? fmtDate(item.completedOn) : '';
      renderSummary(); renderIndex();
      const meta = root().querySelector('[data-meta="checklist"]');
      if (meta) meta.textContent = META.checklist();
      const pl = root().querySelector('[data-body="checklist"] .progress-line');
      if (pl) { const p = derived().progress; pl.outerHTML = `<div class="progress-line"><span class="progress-line__k">Research progress</span>${UI.bar(p.pct, 'bar--lg')}<span class="progress-line__v">${p.pct}%<em>${p.done} of ${p.total}</em></span></div>`; }
      try { await DataLayer.checklist.update(id, company().id, { completed: t.checked }); }
      catch (err) { UI.error(err); refresh(['checklist'], ['checklist']); }
      return;
    }
    if (act === 'rec-check') {
      const li = rowOf(t), id = li.dataset.id;
      try {
        li.classList.add('is-leaving');
        await DataLayer.tasks.update(id, company().id, { completed: t.checked });
        UI.toast(t.checked ? 'Task completed' : 'Task reopened');
        await refresh(['tasks']);
      } catch (err) { UI.error(err); refresh(['tasks'], ['tasks']); }
      return;
    }
    if (act === 'list-member') {
      try {
        await DataLayer.watchlists.setMember(t.value, company().id, t.checked);
        const l = W.data.lists.find(x => x.id === t.value);
        if (l) l.member = t.checked;
        UI.toast(t.checked ? `Added to ${l ? l.name : 'list'}` : `Removed from ${l ? l.name : 'list'}`);
        const b = root().querySelector('[data-act="toggle-lists"]');
        const n = W.data.lists.filter(x => x.member).length;
        if (b) b.textContent = 'Lists' + (n ? ' · ' + n : '');
      } catch (err) { UI.error(err); t.checked = !t.checked; }
      return;
    }
    if (act === 'review-catalyst') { W.reviewCatalyst = t.value || null; renderSection('review'); return; }
    const form = t.closest('[data-form]');
    if (form && form.dataset.form === 'valuation') { markDirty('valuation'); updateCalc(); }
    if (form && form.dataset.form === 'decision') markDirty('decision');
  }

  async function onSubmit(e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const btn = form.querySelector('[type="submit"]');
    try {
      if (kind === 'price') {
        const v = UI.read(form);
        const n = UI.num(v.price);
        if (v.price.trim() !== '' && n === null) return UI.toast('Enter the price as a number, e.g. 1024.50', 'error');
        await UI.busy(btn, () => DataLayer.setPrice(company().id, n, v.asOf, v.currency));
        W.editPrice = false;
        UI.toast('Price updated');
        await refresh(['valuation'].filter(s => !W.dirty.has(s)));
        if (W.dirty.has('valuation')) {
          const now = root().querySelector('[data-price-now]');
          if (now) now.textContent = UI.money(UI.num(company().currentPrice), company().priceCurrency);
          updateCalc();
        }
      }
      if (kind === 'cl-add') {
        const title = form.querySelector('[data-f="title"]').value.trim();
        if (!title) return;
        await UI.busy(btn, () => DataLayer.checklist.add(company().id, title), 'Adding…');
        await refresh(['checklist']);
        const inp = root().querySelector('[data-form="cl-add"] [data-f="title"]');
        if (inp) inp.focus();
      }
      if (kind === 'link-add') {
        const v = UI.read(form);
        if (!v.url.trim()) return form.querySelector('[data-f="url"]').focus();
        await UI.busy(btn, () => DataLayer.links.add(company().id, v), 'Adding…');
        UI.toast('Link added');
        await refresh(['files']);
      }
      if (kind === 'trade-add') {
        const v = UI.read(form);
        v.type = form.querySelector('input[name="tradeType"]:checked').value;
        v.quantity = UI.num(v.quantity); v.price = UI.num(v.price); v.fees = UI.num(v.fees) || 0;
        await UI.busy(btn, () => DataLayer.transactions.add(company().id, v), 'Adding…');
        UI.toast(v.type === 'buy' ? 'Buy recorded' : 'Sell recorded');
        await refresh(['position']);
      }
      if (kind === 'list-new') {
        const name = form.querySelector('[data-f="name"]').value.trim();
        if (!name) return;
        const l = await UI.busy(btn, () => DataLayer.watchlists.create(name), 'Creating…');
        await DataLayer.watchlists.setMember(l.id, company().id, true);
        UI.toast(`Added to ${name}`);
        await refresh([]);
      }
      if (kind === 'list-add') {
        const key = form.dataset.list, L = LISTS[key];
        const values = UI.read(form);
        const main = L.quick.find(q => q.main).f;
        if (!String(values[main] || '').trim()) return form.querySelector(`[data-f="${main}"]`).focus();
        values[main] = values[main].trim();
        await UI.busy(btn, () => L.api().add(company().id, values), 'Adding…');
        await refresh([key]);
        const inp = root().querySelector(`[data-form="list-add"][data-list="${key}"] [data-f="${main}"]`);
        if (inp) inp.focus();
      }
    } catch (err) { UI.error(err); }
  }

  async function onClick(e) {
    const t = e.target.closest('[data-act], [data-file-open]');
    if (!t || !root().contains(t)) return;

    // Open a private file: refresh the signed link if it is getting old.
    if (t.dataset.fileOpen !== undefined && !t.dataset.act) {
      const stale = !W.fileUrls[t.dataset.fileOpen] || Date.now() - W.fileUrlsAt > 45 * 60 * 1000;
      if (stale) {
        e.preventDefault();
        const win = window.open('', '_blank');
        try {
          const url = await DataLayer.files.url(t.dataset.fileOpen);
          if (win) { win.opener = null; win.location = url; } else location.href = url;
        } catch (err) { if (win) win.close(); UI.error(err); }
      }
      return;
    }

    const act = t.dataset.act;
    const c = company();
    const H = HANDLERS[act];
    if (!H) return;
    if (t.tagName === 'A') e.preventDefault();
    try { await H(t, c, e); } catch (err) { UI.error(err); }
  }

  const HANDLERS = {
    jump(t) {
      const s = document.getElementById('ws-' + t.dataset.sec);
      if (s) window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
      history.replaceState(null, '', `#/company/${W.slug}/${t.dataset.sec}`);
    },

    /* status */
    async 'start-research'(t, c) {
      await UI.busy(t, () => DataLayer.setResearchStatus(c.id, 'researching'), 'Starting…');
      UI.toast('Research started');
      await refresh([]);
    },
    'open-complete'() { W.completing = true; W.completeDecision = null; renderComplete(); document.getElementById('wsComplete').scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    'complete-cancel'() { W.completing = false; renderComplete(); },
    'complete-pick'(t) {
      W.completeDecision = t.dataset.v;
      const r = root().querySelector('[data-form="complete"] [data-f="rationale"]');
      W.completeRationale = r ? r.value : '';
      renderComplete();
    },
    async 'complete-confirm'(t, c) {
      const form = root().querySelector('[data-form="complete"]');
      const rationale = form.querySelector('[data-f="rationale"]').value.trim();
      const sel = W.completeDecision ?? (c.decision && c.decision !== 'researching' ? c.decision : '');
      if (!sel) {
        const s = form.querySelector('[data-complete-status]');
        s.textContent = 'Choose a decision first.';
        return;
      }
      const needNew = sel !== c.decision || rationale;
      const last = W.data.decisions[0] || {};
      await UI.busy(t, () => DataLayer.completeResearch(c.id, {
        decision: needNew ? {
          decision: sel, rationale, holdingStatus: last.holdingStatus, positionSizePct: last.positionSizePct,
          maxAllocationPct: last.maxAllocationPct, timeHorizon: last.timeHorizon
        } : null
      }), 'Completing…');
      W.completing = false; W.completeDecision = null; W.completeRationale = '';
      renderComplete();
      UI.toast('Research marked complete');
      await refresh(['decision']);
    },
    async 'reopen-research'(t, c) {
      await UI.busy(t, () => DataLayer.setResearchStatus(c.id, 'researching'), 'Reopening…');
      UI.toast('Research reopened');
      await refresh([]);
    },
    'edit-company'() { CompanyForm.open(W.data.company); },
    'toggle-lists'() { W.showLists = !W.showLists; renderHead(); },
    async 'trade-delete'(t, c) {
      if (!(await UI.confirmInline(t, 'Delete this trade?'))) return;
      await DataLayer.transactions.remove(rowOf(t).dataset.id, c.id);
      UI.toast('Trade deleted');
      await refresh(['position']);
    },

    /* price */
    'edit-price'() {
      W.editPrice = true; renderSummary();
      const s = document.getElementById('wsSummary');
      s.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const i = s.querySelector('[data-f="price"]'); if (i) { i.focus(); i.select(); }
    },
    'cancel-price'() { W.editPrice = false; renderSummary(); },

    /* files */
    'choose-files'() { document.getElementById('wsFileInput').click(); },
    'unpick-file'(t) { W.pending.splice(Number(t.dataset.i), 1); renderSection('files'); },
    'clear-files'() { W.pending = []; renderSection('files'); },
    async 'upload-files'(t, c) {
      const box = t.closest('.drop');
      const meta = UI.read(box.querySelector('.drop__meta'));
      const status = box.querySelector('[data-upload-status]');
      const list = W.pending.slice();
      let ok = 0;
      await UI.busy(t, async () => {
        for (let i = 0; i < list.length; i++) {
          status.textContent = `Uploading ${i + 1} of ${list.length}…`;
          try { await DataLayer.files.upload(c.id, list[i], meta); ok++; }
          catch (err) { UI.error(new Error(`${list[i].name}: ${err.message}`)); }
        }
      }, 'Uploading…');
      W.pending = [];
      if (ok) UI.toast(`${ok} file${ok === 1 ? '' : 's'} uploaded`);
      await refresh(['files']);
    },
    'file-filter'(t) { W.fileFilter = t.dataset.v; renderSection('files'); },
    'file-edit'(t) { toggleOpen(rowOf(t).dataset.id); renderSection('files'); },
    async 'file-save'(t, c) {
      const li = rowOf(t);
      const f = W.data.files.find(x => x.id === li.dataset.id);
      const vals = UI.read(li.querySelector('.rec__edit'));
      await UI.busy(t, () => f.source === 'link' ? DataLayer.links.update(f.id, c.id, vals) : DataLayer.files.update(f.id, c.id, vals));
      W.open.delete(f.id);
      UI.toast('File details saved');
      await refresh(['files']);
    },
    async 'file-delete'(t) {
      const li = rowOf(t);
      const f = W.data.files.find(x => x.id === li.dataset.id);
      if (!(await UI.confirmInline(t, f.source === 'link' ? `Remove the link “${f.fileName}”?` : `Delete “${f.fileName}” permanently?`))) return;
      await DataLayer.files.remove(f);
      W.open.delete(f.id);
      UI.toast(f.source === 'link' ? 'Link removed' : 'File deleted');
      await refresh(['files']);
    },
    async 'file-download'(t) {
      const f = W.data.files.find(x => x.id === rowOf(t).dataset.id);
      const url = await DataLayer.files.url(f.storagePath, { download: true, fileName: f.fileName });
      const a = document.createElement('a');
      a.href = url; a.download = f.fileName; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    },

    /* checklist */
    'cl-toggle'(t) { toggleOpen(rowOf(t).dataset.id); renderSection('checklist'); },
    async 'cl-save'(t, c) {
      const li = rowOf(t);
      const v = UI.read(li.querySelector('.rec__edit'));
      const item = W.data.checklist.find(i => i.id === li.dataset.id);
      const input = { title: v.title, notes: v.notes };
      if (item.completed) input.completedOn = v.completedOn;
      else if (v.completedOn) { input.completed = true; input.completedOn = v.completedOn; }
      await UI.busy(t, () => DataLayer.checklist.update(item.id, c.id, input));
      W.open.delete(item.id);
      await refresh(['checklist']);
    },
    async 'cl-delete'(t, c) {
      const li = rowOf(t);
      if (!(await UI.confirmInline(t, 'Remove this item from the checklist?'))) return;
      await DataLayer.checklist.remove(li.dataset.id, c.id);
      await refresh(['checklist']);
    },

    /* generic lists */
    'rec-toggle'(t) { const li = rowOf(t); toggleOpen(li.dataset.id); renderSection(li.dataset.list); },
    async 'rec-save'(t, c) {
      const li = rowOf(t), key = li.dataset.list, L = LISTS[key];
      const prev = L.rows().find(r => r.id === li.dataset.id);
      const values = UI.read(li.querySelector('.rec__edit'));
      if (!String(values[L.titleField] || '').trim()) return UI.toast('This needs a title.', 'error');
      await UI.busy(t, () => L.api().update(prev.id, c.id, values, prev));
      W.open.delete(prev.id);
      UI.toast('Saved');
      await refresh([key]);
    },
    async 'rec-delete'(t, c) {
      const li = rowOf(t), key = li.dataset.list, L = LISTS[key];
      if (!(await UI.confirmInline(t, 'Delete permanently?'))) return;
      await L.api().remove(li.dataset.id, c.id);
      W.open.delete(li.dataset.id);
      await refresh([key]);
    },

    /* thesis */
    confidence(t) {
      const box = t.closest('.scale');
      const v = Number(t.dataset.v);
      const hidden = box.querySelector('[data-f="confidence"]');
      const next = Number(hidden.value) === v ? '' : String(v);
      hidden.value = next;
      box.querySelectorAll('.scale__step').forEach(b => {
        const bv = Number(b.dataset.v);
        b.classList.toggle('is-on', next !== '' && bv <= Number(next));
        b.classList.toggle('is-current', String(bv) === next);
        b.setAttribute('aria-checked', String(String(bv) === next));
      });
      markDirty('thesis');
    },
    async 'save-thesis'(t, c) {
      const v = UI.read(root().querySelector('[data-form="thesis"]'));
      const res = await UI.busy(t, () => DataLayer.saveThesis(c.id, v, v.changeNote.trim()));
      markDirty('thesis', false);
      UI.toast(res && res.unchanged ? 'No changes to save' : 'Thesis saved');
      await refresh(['thesis'], ['thesis']);
    },

    /* valuation */
    'vm-add'() {
      const rows = root().querySelector('.vm-rows');
      rows.insertAdjacentHTML('beforeend', vmRow({}));
      rows.lastElementChild.querySelector('input').focus();
      markDirty('valuation');
    },
    'vm-remove'(t) {
      const rows = root().querySelector('.vm-rows');
      if (rows.children.length > 1) t.closest('.vm-row').remove();
      else t.closest('.vm-row').querySelectorAll('input').forEach(i => { i.value = ''; });
      markDirty('valuation'); updateCalc();
    },
    async 'save-valuation'(t, c) {
      const v = readValuation();
      const any = VAL_FIELDS.some(f => v[f.f] != null) || v.methods.some(m => m.value != null);
      if (!any) return UI.toast('Enter at least one value before saving a snapshot.', 'error');
      await UI.busy(t, () => DataLayer.saveValuation(c.id, v, v.changeNote.trim()));
      markDirty('valuation', false);
      UI.toast('Valuation snapshot saved');
      await refresh(['valuation'], ['valuation']);
    },
    async 'val-delete'(t, c) {
      if (!(await UI.confirmInline(t, 'Delete this snapshot?'))) return;
      await DataLayer.deleteValuation(rowOf(t).dataset.id, c.id);
      await refresh(['valuation'], W.dirty.has('valuation') ? [] : ['valuation']);
    },

    /* decision */
    'pick-decision'(t) {
      const box = t.closest('[data-form="decision"]');
      box.querySelector('[data-f="decision"]').value = t.dataset.v;
      box.querySelectorAll('[data-act="pick-decision"]').forEach(b => {
        const on = b === t; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', String(on));
      });
      W.pickDecision = t.dataset.v;
      markDirty('decision');
    },
    async 'save-decision'(t, c) {
      const v = UI.read(root().querySelector('[data-form="decision"]'));
      if (!v.decision) return UI.toast('Choose a decision first.', 'error');
      for (const k of ['positionSizePct', 'maxAllocationPct']) {
        if (v[k] !== '' && (UI.num(v[k]) === null || UI.num(v[k]) < 0 || UI.num(v[k]) > 100)) return UI.toast('Percentages must be between 0 and 100.', 'error');
        v[k] = UI.num(v[k]);
      }
      await UI.busy(t, () => DataLayer.recordDecision(c.id, v), 'Recording…');
      W.pickDecision = null;
      markDirty('decision', false);
      UI.toast('Decision recorded');
      await refresh(['decision'], ['decision']);
    },

    /* review */
    'review-preset'(t) { W.reviewPreset = W.reviewPreset === t.dataset.v ? null : t.dataset.v; renderSection('review'); },
    async 'review-save'(t, c) {
      const pr = RUN.REVIEW_PRESETS.find(p => p.value === W.reviewPreset);
      const v = UI.read(root().querySelector('[data-form="review-schedule"]'));
      if (!v.scheduledFor && pr.value !== 'catalyst') return UI.toast('Pick a review date.', 'error');
      if (pr.value === 'catalyst' && !v.catalystId && !v.scheduledFor) return UI.toast('Choose a catalyst or a date.', 'error');
      await UI.busy(t, () => DataLayer.reviews.schedule(c.id, {
        scheduledFor: v.scheduledFor || null, triggerType: pr.trigger, triggerNote: v.triggerNote,
        catalystId: v.catalystId || null, recurrenceDays: pr.recurring || null
      }));
      W.reviewPreset = null; W.reviewCatalyst = null;
      UI.toast('Review scheduled');
      await refresh(['review']);
    },
    async 'review-cancel'(t, c) {
      if (!(await UI.confirmInline(t, 'Cancel the scheduled review?'))) return;
      await DataLayer.reviews.cancel(c.id);
      await refresh(['review']);
    },
    async 'review-complete'(t, c) {
      const v = UI.read(root().querySelector('[data-form="review-complete"]'));
      const next = await UI.busy(t, () => DataLayer.reviews.complete(c.id, { notes: v.notes.trim(), completedOn: v.completedOn }));
      UI.toast(next ? `Reviewed — next review ${fmtDate(next.scheduledFor)}` : 'Review recorded');
      await refresh(['review']);
    },

    /* history */
    'hist-filter'(t) { W.histFilter = t.dataset.v; renderSection('history'); },
    async 'update-save'(t, c) {
      const v = UI.read(root().querySelector('[data-form="update"]'));
      if (!v.title.trim()) return UI.toast('Give the update a title.', 'error');
      await UI.busy(t, () => DataLayer.updates.add(c.id, v));
      W.addingUpdate = false;
      UI.toast('Update added to history');
      await refresh(['history']);
    },
    async 'update-delete'(t, c) {
      if (!(await UI.confirmInline(t, 'Delete this history entry?'))) return;
      await DataLayer.updates.remove(rowOf(t).dataset.id, c.id);
      await refresh(['history']);
    }
  };

  function toggleOpen(id) { if (W.open.has(id)) W.open.delete(id); else W.open.add(id); }

  function pickFiles(fileList) {
    const arr = [...(fileList || [])];
    const tooBig = arr.filter(f => f.size > 50 * 1024 * 1024);
    if (tooBig.length) UI.toast(`${tooBig.map(f => f.name).join(', ')}: larger than 50 MB`, 'error');
    W.pending = W.pending.concat(arr.filter(f => f.size <= 50 * 1024 * 1024));
    renderSection('files');
  }

  /* ==========================================================
     PUBLIC
     ========================================================== */
  return {
    render,
    timeline,
    reload: () => W && refresh(ORDER),
    canLeave() {
      if (!W || !W.dirty.size) return true;
      const names = [...W.dirty].map(s => TITLES[s].toLowerCase()).join(', ');
      return window.confirm(`You have unsaved changes in ${names}. Leave without saving?`);
    },
    canLeaveQuietly: () => !W || !W.dirty.size,
    clearDirty() { if (W) W.dirty.clear(); },
    current: () => W && W.data ? W.data.company : null
  };
})();
