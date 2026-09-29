/* ============================================================
   RUN WATCHLIST — js/ipo-view.js
   The IPO tracker:
     #/ipos        overview — period totals, money to collect,
                   every IPO, people, categories
     #/ipo/<id>    one IPO — all its applications, allotment,
                   sale, charges, loans and settlement
   Arithmetic lives in js/ipo.js, storage in js/datalayer.js.
   ============================================================ */

const IpoView = (() => {

  const S = { period: 'fy', newIpo: false, editPerson: null, editCat: null, openApp: new Set(), editIpo: false };
  const root = () => document.getElementById('ipoRoot');
  const m = v => v == null || !isFinite(v) ? '—' : UI.money(Math.round(v * 100) / 100, 'INR');
  const signed = v => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + UI.money(Math.abs(Math.round(v * 100) / 100), 'INR');
  const pct = v => v == null || !isFinite(v) ? '—' : `${Math.round(v)}%`;
  const fundLabel = v => (IPO.FUNDING.find(f => f.value === v) || IPO.FUNDING[0]).label;
  const fundShort = v => (IPO.FUNDING.find(f => f.value === v) || IPO.FUNDING[0]).short;
  const catOptions = (cats, sel) => cats.map(c => `<option value="${esc(c.name)}"${c.name === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  const fundOptions = sel => IPO.FUNDING.map(f => `<option value="${f.value}"${f.value === sel ? ' selected' : ''}>${f.label}</option>`).join('');

  async function render(ipoId) {
    const el = root();
    if (!el) return;
    let d;
    try { d = await DataLayer.ipo.data(); }
    catch (err) { el.innerHTML = `<div class="empty"><p class="empty__title">Could not load IPOs.</p><p class="empty__text">${esc(err.message)}</p></div>`; return; }
    if (ipoId) return renderIpo(el, d, ipoId);
    return renderOverview(el, d);
  }

  /* ==========================================================
     OVERVIEW
     ========================================================== */
  function renderOverview(el, d) {
    const periods = IPO.periods(DataLayer.util.today());
    const period = periods.find(p => p.value === S.period) || periods[0];
    const s = IPO.summarise({ ...d, period });
    const t = s.totals;
    const hasData = d.ipos.length || d.persons.length;

    el.innerHTML = `
      <header class="view__head">
        <p class="act__kicker">IPOs</p>
        <h1 class="view__title">Applications and allotments.</h1>
        <p class="view__lede">Every IPO, every account you apply from, what was allotted, what it sold for, and the money
          still to come back to you.</p>
      </header>

      <div class="pf-actions">
        <button class="btn btn--solid btn--sm" type="button" data-ia="new-ipo">${S.newIpo ? 'Close' : '+ New IPO'}</button>
        <button class="btn btn--sm" type="button" data-ia="import">Import (CSV)</button>
        ${d.apps.length ? `<button class="text-btn" type="button" data-ia="export">Export all applications (CSV)</button>` : ''}
      </div>
      ${S.newIpo ? ipoForm({}, 'new') : ''}

      ${!hasData ? `
        <div class="empty pf-empty">
          <p class="empty__title">Start with your people.</p>
          <p class="empty__text">Add each person whose account you apply from (yourself first, ticked as <strong>main account</strong>),
          then create an IPO and use <strong>Add for everyone</strong>.<br>Or import your existing IPO sheet from Excel as CSV.</p>
        </div>` : `
        <div class="filter-row ipo-periods" role="group" aria-label="Period">
          ${periods.map(p => `<button class="filter-chip${p.value === period.value ? ' is-active' : ''}" type="button" data-period="${p.value}">${esc(p.label)}</button>`).join('')}
        </div>
        <dl class="desk-figs">
          <div><a href="#/ipos"><dt>IPOs applied</dt><dd>${UI.two(t.ipos)}</dd><span>${t.applications} application${t.applications === 1 ? '' : 's'}</span></a></div>
          <div><a href="#/ipos"><dt>Allotted</dt><dd>${UI.two(t.allotted)}</dd><span>${t.decided ? `${pct(t.rate)} of ${t.decided} decided` : 'no results yet'}${t.pending ? ` · ${t.pending} pending` : ''}</span></a></div>
          <div><a href="#/ipos"><dt>My net P&L</dt><dd class="ipo-pl">${signed(t.net)}</dd><span>gain ${m(t.gain)} − costs ${m(t.charges + t.interest)}</span></a></div>
          <div><a href="#/ipos"><dt>Loan interest paid</dt><dd>${m(t.interest)}</dd><span>charges ${m(t.charges)}</span></a></div>
          <div><a href="#ipo-collect" data-scroll="ipo-collect"><dt>To collect</dt><dd>${m(s.toCollect.reduce((x, r) => x + (r.c.dueBack || 0), 0))}</dd><span>${s.toCollect.length} not settled</span></a></div>
        </dl>

        <section class="desk-sec" id="ipo-collect">
          <header class="desk-sec__head"><h2 class="desk-sec__title">Money to collect</h2>
            <p class="desk-sec__meta">Money you sent that hasn't come back · all periods</p></header>
          ${s.toCollect.length ? `<ul class="desk-list">${s.toCollect.map(collectRow).join('')}</ul>`
            : `<p class="desk-empty">Nothing to collect. Everything you sent has been settled.</p>`}
          ${s.waiting.length ? `<p class="nb-hint">${s.waiting.length} more application${s.waiting.length === 1 ? ' is' : 's are'} waiting for allotment
            (${m(s.waiting.reduce((x, r) => x + (r.c.amount || 0), 0))} sent).</p>` : ''}
        </section>

        <section class="desk-sec" id="ipo-list">
          <header class="desk-sec__head"><h2 class="desk-sec__title">IPOs</h2><p class="desk-sec__meta">${esc(period.label)} · newest first</p></header>
          ${s.perIpo.length ? `
            <div class="pf-table ipo-table">
              <div class="pf-row pf-row--head" aria-hidden="true"><span>IPO</span><span>Date</span><span>Price · lot</span><span>Applications</span><span>Allotted</span><span>My net P&L</span><span>To collect</span></div>
              ${s.perIpo.map(({ ipo, t: it }) => `
                <div class="pf-row">
                  <span data-k="IPO"><a class="pf-co" href="#/ipo/${ipo.id}">${esc(ipo.name)}${ipo.symbol ? `<em>${esc(ipo.symbol)}</em>` : ''}${ipo.board === 'sme' ? '<em>SME</em>' : ''}</a></span>
                  <span data-k="Date">${IPO.dateOf(ipo) ? fmtDate(IPO.dateOf(ipo)) : '—'}</span>
                  <span data-k="Price · lot">${ipo.issuePrice != null ? m(ipo.issuePrice) : '—'}${ipo.lotSize ? `<small>${ipo.lotSize} shares</small>` : ''}</span>
                  <span data-k="Applications">${it.applications}</span>
                  <span data-k="Allotted">${it.allotted}${it.decided ? `<small>${pct(it.rate)}</small>` : (it.pending ? '<small>pending</small>' : '')}</span>
                  <span data-k="My net P&L">${it.decided ? signed(it.net) : '—'}</span>
                  <span data-k="To collect">${it.dueBack ? m(it.dueBack) : (it.unsettled ? '<small>waiting</small>' : '—')}</span>
                </div>`).join('')}
            </div>` : `<p class="desk-empty">No IPOs in this period.</p>`}
        </section>`}

      <section class="desk-sec" id="ipo-people">
        <header class="desk-sec__head"><h2 class="desk-sec__title">People</h2><p class="desk-sec__meta">Accounts you apply from · figures for ${esc(period.label)}</p></header>
        <form class="quick" data-iform="person">
          <input class="nb-input quick__main" data-f="name" placeholder="Add a person, e.g. Father" aria-label="Person's name" maxlength="80">
          <label class="pick ipo-self"><input type="checkbox" data-f="isSelf"><span>Main account (mine)</span></label>
          <button class="btn btn--sm" type="submit">Add person</button>
        </form>
        ${d.persons.length ? `
          <div class="pf-table ipo-people">
            <div class="pf-row pf-row--head" aria-hidden="true"><span>Person</span><span>Applications</span><span>Allotted</span><span>Allotment rate</span><span>Net P&L</span><span>To collect</span><span></span></div>
            ${s.perPerson.map(({ person: p, t: pt }) => S.editPerson === p.id ? personEdit(p) : `
              <div class="pf-row${p.active ? '' : ' is-dim'}">
                <span data-k="Person"><span class="ipo-person">${esc(p.name)}</span>${p.isSelf ? '<span class="tag">Main account</span>' : ''}${p.active ? '' : '<span class="tag">Hidden</span>'}</span>
                <span data-k="Applications">${pt.applications}</span>
                <span data-k="Allotted">${pt.allotted}</span>
                <span data-k="Allotment rate">${pt.decided ? pct(pt.rate) : '—'}</span>
                <span data-k="Net P&L">${pt.decided ? signed(pt.netAll) : '—'}</span>
                <span data-k="To collect">${pt.dueBack ? m(pt.dueBack) : '—'}</span>
                <span class="tx__act"><button class="text-btn" type="button" data-ia="edit-person" data-id="${p.id}">Edit</button></span>
              </div>`).join('')}
          </div>` : ''}
      </section>

      ${Object.keys(s.perCategory).length ? `
      <section class="desk-sec" id="ipo-categories-stats">
        <header class="desk-sec__head"><h2 class="desk-sec__title">By category</h2><p class="desk-sec__meta">${esc(period.label)}</p></header>
        <div class="pf-table ipo-cat-table">
          <div class="pf-row pf-row--head" aria-hidden="true"><span>Category</span><span>Applications</span><span>Allotted</span><span>Allotment rate</span><span>My net P&L</span></div>
          ${Object.entries(s.perCategory).map(([name, ct]) => `
            <div class="pf-row"><span data-k="Category">${esc(name)}</span><span data-k="Applications">${ct.applications}</span>
              <span data-k="Allotted">${ct.allotted}</span><span data-k="Allotment rate">${ct.decided ? pct(ct.rate) : '—'}</span>
              <span data-k="My net P&L">${ct.decided ? signed(ct.net) : '—'}</span></div>`).join('')}
        </div>
      </section>` : ''}

      <section class="desk-sec" id="ipo-cats">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Categories</h2><p class="desk-sec__meta">Application types you can choose from</p></header>
        <div class="ipo-cats">
          ${d.categories.map(c => S.editCat === c.id ? `
            <form class="list-form" data-iform="cat-rename" data-id="${c.id}">
              <input class="nb-input" data-f="name" value="${esc(c.name)}" aria-label="Category name" maxlength="40">
              <button class="btn btn--sm" type="submit">Save</button>
              <button class="text-btn" type="button" data-ia="cat-cancel">Cancel</button>
              <button class="text-btn text-btn--danger" type="button" data-ia="cat-delete" data-id="${c.id}">Delete</button>
            </form>` : `<button class="filter-chip" type="button" data-ia="cat-edit" data-id="${c.id}" title="Rename or delete">${esc(c.name)}</button>`).join('')}
        </div>
        <form class="quick ipo-cat-add" data-iform="cat">
          <input class="nb-input quick__main" data-f="name" placeholder="New category, e.g. Policyholder" aria-label="New category" maxlength="40">
          <button class="btn btn--sm" type="submit">Add category</button>
        </form>
        <p class="nb-hint">Renaming a category also renames it on every application that uses it.</p>
      </section>`;
    bindOverview(el, d, s);
  }

  function collectRow(r) {
    return `
      <li class="desk-row desk-row--task ipo-collect" data-app="${r.app.id}">
        <label class="check"><input type="checkbox" data-settle="${r.app.id}"><span class="check__box" aria-hidden="true"></span><span class="sr-only">Mark settled</span></label>
        <div class="desk-row__main">
          <p class="desk-row__title">${esc(r.person.name)} <span class="ipo-collect__ipo">· <a href="#/ipo/${r.ipo.id}">${esc(r.ipo.name)}</a> · ${esc(r.app.category)}</span></p>
          <p class="desk-row__note">${esc(r.c.dueNote)}</p>
        </div>
        <span class="desk-row__date ipo-collect__amt">${m(r.c.dueBack)}<em>tick when received</em></span>
      </li>`;
  }

  function personEdit(p) {
    return `
      <form class="pf-row ipo-person-edit" data-iform="person-edit" data-id="${p.id}">
        <span class="ipo-person-edit__fields">
          <input class="nb-input" data-f="name" value="${esc(p.name)}" aria-label="Name" maxlength="80">
          <label class="pick"><input type="checkbox" data-f="isSelf" ${p.isSelf ? 'checked' : ''}><span>Main account</span></label>
          <label class="pick"><input type="checkbox" data-f="active" ${p.active ? 'checked' : ''}><span>Show in new IPOs</span></label>
          <input class="nb-input" data-f="notes" value="${esc(p.notes || '')}" placeholder="Notes (e.g. broker, UPI app)" aria-label="Notes">
        </span>
        <span class="ipo-person-edit__actions">
          <button class="btn btn--solid btn--sm" type="submit">Save</button>
          <button class="text-btn" type="button" data-ia="person-cancel">Cancel</button>
          <button class="text-btn text-btn--danger" type="button" data-ia="person-delete" data-id="${p.id}">Delete</button>
        </span>
      </form>`;
  }

  function ipoForm(ipo, kind) {
    const f = (k, label, type = 'text', ph = '') => `
      <div class="nb-field"><label class="nb-label" for="ipo-${kind}-${k}">${label}</label>
        <input class="nb-input${type === 'num' ? ' nb-input--num' : ''}" id="ipo-${kind}-${k}" data-f="${k}" ${type === 'date' ? 'type="date"' : 'type="text"'} ${type === 'num' ? 'inputmode="decimal"' : ''}
          value="${esc(ipo[k] ?? '')}" placeholder="${esc(ph)}"></div>`;
    return `
      <form class="ipo-form" data-iform="${kind === 'new' ? 'ipo-new' : 'ipo-edit'}">
        <div class="ipo-form__grid">
          <div class="nb-field ipo-form__name"><label class="nb-label" for="ipo-${kind}-name">IPO name *</label>
            <input class="nb-input" id="ipo-${kind}-name" data-f="name" value="${esc(ipo.name || '')}" placeholder="e.g. Orion Motors" required maxlength="120"></div>
          ${f('symbol', 'Symbol', 'text', 'e.g. ORION')}
          <div class="nb-field"><label class="nb-label" for="ipo-${kind}-board">Board</label>
            <select class="nb-input" id="ipo-${kind}-board" data-f="board"><option value="mainboard"${ipo.board !== 'sme' ? ' selected' : ''}>Mainboard</option><option value="sme"${ipo.board === 'sme' ? ' selected' : ''}>SME</option></select></div>
          ${f('issuePrice', 'Issue price (₹)', 'num', 'upper band')}
          ${f('lotSize', 'Lot size (shares)', 'num', 'e.g. 46')}
          ${f('openDate', 'Opens', 'date')}
          ${f('closeDate', 'Closes', 'date')}
          ${f('allotmentDate', 'Allotment', 'date')}
          ${f('listingDate', 'Listing', 'date')}
          ${kind === 'edit' ? f('listingPrice', 'Listing price (₹)', 'num') : ''}
          <div class="nb-field ipo-form__notes"><label class="nb-label" for="ipo-${kind}-notes">Notes</label>
            <input class="nb-input" id="ipo-${kind}-notes" data-f="notes" value="${esc(ipo.notes || '')}" placeholder="GMP, subscription, anything"></div>
        </div>
        <div class="nb-actions">
          <button class="btn btn--solid btn--sm" type="submit">${kind === 'new' ? 'Create IPO' : 'Save details'}</button>
          ${kind === 'edit' ? `<button class="text-btn" type="button" data-ia="ipo-edit-cancel">Cancel</button>
            <button class="text-btn text-btn--danger" type="button" data-ia="ipo-delete">Delete this IPO</button>` : ''}
        </div>
      </form>`;
  }

  function exportAll(d) {
    const ipoById = Object.fromEntries(d.ipos.map(i => [i.id, i]));
    const perById = Object.fromEntries(d.persons.map(p => [p.id, p]));
    const rows = d.apps.map(a => {
      const ipo = ipoById[a.ipoId], p = perById[a.personId];
      if (!ipo || !p) return null;
      const c = IPO.calc(a, ipo);
      return [ipo.name, ipo.issuePrice ?? '', ipo.lotSize ?? '', ipo.listingDate || '', p.name, a.category, a.lots, c.amount ?? '',
        a.funding === 'self' ? 'main' : a.funding, a.outcome === 'allotted' ? 'yes' : a.outcome === 'not_allotted' ? 'no' : a.outcome,
        a.outcome === 'allotted' ? c.shares : '', a.sellPrice ?? '', a.sellDate || '', a.charges || 0, a.loanAmount ?? '', a.loanInterest || 0,
        a.settled ? 'yes' : 'no', a.notes || '', c.net ?? '', c.dueBack ?? ''];
    }).filter(Boolean);
    IO.download(`run-ipo-applications-${DataLayer.util.today()}.csv`, IO.toCSV(
      ['ipo', 'issue_price', 'lot_size', 'listing_date', 'person', 'category', 'lots', 'amount', 'funding', 'allotted', 'shares',
       'sell_price', 'sell_date', 'charges', 'loan_amount', 'loan_interest', 'settled', 'notes', 'net_pnl', 'due_back'], rows));
    UI.toast(`${rows.length} application${rows.length === 1 ? '' : 's'} exported`);
  }

  function openImport() {
    IO.openImport({
      kind: 'ipo', title: 'IPO applications',
      onImport: async parsed => {
        const r = await DataLayer.ipo.importRows(parsed.rows);
        await render(currentId);
        return `${r.created} application${r.created === 1 ? '' : 's'} added, ${r.updated} updated` +
          (r.newIpos ? `, ${r.newIpos} new IPO${r.newIpos === 1 ? '' : 's'}` : '') +
          (r.newPeople ? `, ${r.newPeople} new ${r.newPeople === 1 ? 'person' : 'people'}` : '') + '.';
      }
    });
  }

  let currentId = null;

  function bindOverview(el, d, s) {
    el.onclick = async e => {
      const per = e.target.closest('[data-period]');
      if (per) { S.period = per.dataset.period; return render(); }
      const sc = e.target.closest('[data-scroll]');
      if (sc) { e.preventDefault(); const t = document.getElementById(sc.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const b = e.target.closest('[data-ia]');
      if (!b) return;
      const a = b.dataset.ia;
      try {
        if (a === 'new-ipo') { S.newIpo = !S.newIpo; await render(); if (S.newIpo) el.querySelector('#ipo-new-name').focus(); }
        if (a === 'import') openImport();
        if (a === 'export') exportAll(d);
        if (a === 'edit-person') { S.editPerson = b.dataset.id; await render(); }
        if (a === 'person-cancel') { S.editPerson = null; await render(); }
        if (a === 'person-delete') {
          if (!(await UI.confirmInline(b, 'Delete this person?'))) return;
          await DataLayer.ipo.persons.remove(b.dataset.id);
          S.editPerson = null; UI.toast('Person deleted'); await render();
        }
        if (a === 'cat-edit') { S.editCat = b.dataset.id; await render(); const i = el.querySelector('[data-iform="cat-rename"] [data-f="name"]'); if (i) { i.focus(); i.select(); } }
        if (a === 'cat-cancel') { S.editCat = null; await render(); }
        if (a === 'cat-delete') {
          if (!(await UI.confirmInline(b, 'Delete this category? Applications keep their text.'))) return;
          await DataLayer.ipo.categories.remove(b.dataset.id);
          S.editCat = null; await render();
        }
      } catch (err) { UI.error(err); }
    };
    el.onchange = async e => {
      const cb = e.target.closest('[data-settle]');
      if (!cb) return;
      const row = cb.closest('[data-app]');
      row.classList.add('is-leaving');
      try {
        await DataLayer.ipo.apps.update(cb.dataset.settle, { settled: true });
        UI.toast('Marked settled');
        await render();
      } catch (err) { UI.error(err); row.classList.remove('is-leaving'); cb.checked = false; }
    };
    el.onsubmit = async e => {
      const f = e.target.closest('[data-iform]');
      if (!f) return;
      e.preventDefault();
      const btn = f.querySelector('[type="submit"]');
      const v = UI.read(f);
      try {
        if (f.dataset.iform === 'ipo-new') {
          const ipo = await UI.busy(btn, () => DataLayer.ipo.ipos.add(v), 'Creating…');
          S.newIpo = false;
          UI.toast('IPO created');
          location.hash = '#/ipo/' + ipo.id;
        }
        if (f.dataset.iform === 'person') {
          if (!v.name.trim()) return f.querySelector('[data-f="name"]').focus();
          await UI.busy(btn, () => DataLayer.ipo.persons.add(v.name, { isSelf: v.isSelf }), 'Adding…');
          UI.toast(`${v.name.trim()} added`);
          await render();
          const i = root().querySelector('[data-iform="person"] [data-f="name"]'); if (i) i.focus();
        }
        if (f.dataset.iform === 'person-edit') {
          await UI.busy(btn, () => DataLayer.ipo.persons.update(f.dataset.id, v));
          S.editPerson = null; UI.toast('Saved'); await render();
        }
        if (f.dataset.iform === 'cat') {
          if (!v.name.trim()) return;
          await UI.busy(btn, () => DataLayer.ipo.categories.add(v.name), 'Adding…');
          UI.toast('Category added'); await render();
        }
        if (f.dataset.iform === 'cat-rename') {
          await UI.busy(btn, () => DataLayer.ipo.categories.rename(f.dataset.id, v.name));
          S.editCat = null; UI.toast('Category renamed'); await render();
        }
      } catch (err) { UI.error(err); }
    };
  }

  /* ==========================================================
     ONE IPO
     ========================================================== */
  function renderIpo(el, d, id) {
    const ipo = d.ipos.find(i => i.id === id);
    if (!ipo) {
      el.innerHTML = `<div class="empty"><p class="empty__title">IPO not found.</p><p class="empty__text"><a class="arrow-link" href="#/ipos">Back to IPOs <span aria-hidden="true">→</span></a></p></div>`;
      return;
    }
    const perById = Object.fromEntries(d.persons.map(p => [p.id, p]));
    const apps = d.apps.filter(a => a.ipoId === id && perById[a.personId])
      .sort((a, b) => perById[a.personId].name.localeCompare(perById[b.personId].name) || a.category.localeCompare(b.category));
    const { t, rows } = IPO.ipoSummary(ipo, apps);
    const active = d.persons.filter(p => p.active);
    const dates = [
      ipo.openDate && ipo.closeDate ? `Open ${fmtShortDate(ipo.openDate)}–${fmtShortDate(ipo.closeDate)}`
        : ipo.closeDate ? `Closes ${fmtShortDate(ipo.closeDate)}` : ipo.openDate ? `Opens ${fmtShortDate(ipo.openDate)}` : null,
      ipo.allotmentDate ? `Allotment ${fmtDate(ipo.allotmentDate)}` : null,
      ipo.listingDate ? `Listing ${fmtDate(ipo.listingDate)}` : null
    ].filter(Boolean).join(' · ');
    const perLot = ipo.issuePrice != null && ipo.lotSize ? ipo.issuePrice * ipo.lotSize : null;

    el.innerHTML = `
      <a class="ws-back" href="#/ipos"><span aria-hidden="true">←</span> IPOs</a>
      <header class="ws-head">
        <div class="ws-head__main">
          <p class="act__kicker"><em>IPO</em>${esc(ipo.symbol || 'No symbol')}<span class="ws-head__sep" aria-hidden="true">/</span>${ipo.board === 'sme' ? 'SME' : 'Mainboard'}</p>
          <h1 class="ws-title">${esc(ipo.name)}</h1>
          <p class="ws-meta">${esc([ipo.issuePrice != null ? `Issue price ${m(ipo.issuePrice)}` : null, ipo.lotSize ? `Lot ${ipo.lotSize} shares${perLot ? ' = ' + m(perLot) : ''}` : null, dates].filter(Boolean).join(' · ') || 'Add the price, lot size and dates with Edit details')}</p>
          ${ipo.notes ? `<p class="ws-desc">${esc(ipo.notes)}</p>` : ''}
        </div>
        <div class="ws-head__actions">
          <button class="text-btn" type="button" data-ia="ipo-edit">${S.editIpo ? 'Close' : 'Edit details'}</button>
        </div>
      </header>
      ${S.editIpo ? ipoForm(ipo, 'edit') : ''}

      <section class="ws-summary" aria-label="IPO summary">
        <div class="ws-ledger">
          ${cell('Applications', UI.two(t.applications), `${new Set(apps.map(a => a.personId)).size} people`)}
          ${cell('Allotted', UI.two(t.allotted), t.decided ? `${pct(t.rate)} of ${t.decided} decided${t.pending ? ` · ${t.pending} pending` : ''}` : (t.pending ? `${t.pending} waiting for results` : ''))}
          ${cell('Amount applied', m(t.amount), 'blocked across all accounts')}
          ${cell('Allotted value', m(t.allottedValue), t.holding ? `${t.holding} not sold yet` : '')}
          ${cell('Listing gain', t.sold ? signed(t.gain) : '—', t.unrealised ? `unsold at listing price: ${signed(t.unrealised)}` : 'your money only')}
          ${cell('Charges + loan interest', m(t.charges + t.interest), `charges ${m(t.charges)} · interest ${m(t.interest)}`)}
          ${cell('My net P&L', t.decided ? signed(t.net) : '—', t.netAll !== t.net && t.decided ? `all accounts ${signed(t.netAll)}` : '')}
          ${cell('To collect', m(t.dueBack), t.unsettled ? `${t.unsettled} not settled` : 'all settled')}
        </div>
      </section>

      <div class="ipo-tools">
        <form class="trade ipo-tool" data-iform="add-all">
          <p class="nb-label ipo-tool__k">Add for everyone</p>
          <label class="quick__opt"><span>Category</span><select class="nb-input" data-f="category">${catOptions(d.categories, 'Retail')}</select></label>
          <label class="quick__opt"><span>Lots</span><input class="nb-input nb-input--num" data-f="lots" inputmode="numeric" value="1"></label>
          <label class="quick__opt"><span>Money</span><select class="nb-input" data-f="funding">${fundOptions('sent')}</select></label>
          <button class="btn btn--solid btn--sm" type="submit">Add for ${active.length} ${active.length === 1 ? 'person' : 'people'}</button>
        </form>
        <form class="trade ipo-tool" data-iform="add-one">
          <p class="nb-label ipo-tool__k">Add one application</p>
          <label class="quick__opt"><span>Person</span><select class="nb-input" data-f="personId"><option value="">Choose</option>${active.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
          <label class="quick__opt"><span>Category</span><select class="nb-input" data-f="category">${catOptions(d.categories, 'Retail')}</select></label>
          <label class="quick__opt"><span>Lots</span><input class="nb-input nb-input--num" data-f="lots" inputmode="numeric" value="1"></label>
          <label class="quick__opt"><span>Money</span><select class="nb-input" data-f="funding">${fundOptions('sent')}</select></label>
          <button class="btn btn--sm" type="submit">Add</button>
        </form>
        ${t.allotted ? `
        <form class="trade ipo-tool" data-iform="sell-all">
          <p class="nb-label ipo-tool__k">Sold at listing?</p>
          <label class="quick__opt"><span>Sell price</span><input class="nb-input nb-input--num" data-f="price" inputmode="decimal" value="${ipo.listingPrice ?? ''}" placeholder="₹"></label>
          <label class="quick__opt"><span>Date</span><input class="nb-input" type="date" data-f="date" value="${esc(ipo.listingDate || DataLayer.util.today())}"></label>
          <button class="btn btn--sm" type="submit">Apply to allotted without a price</button>
        </form>` : ''}
      </div>
      ${!d.persons.length ? `<p class="nb-hint">No people yet. <a class="arrow-link" href="#/ipos">Add people on the IPOs page <span aria-hidden="true">→</span></a></p>` : ''}

      <section class="desk-sec ipo-apps-sec">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Applications</h2>
          <p class="desk-sec__meta">${t.unsettled ? `<button class="text-btn" type="button" data-ia="settle-all">Mark all decided as settled</button>` : 'Tap a result to record it'}</p></header>
        ${apps.length ? `
          <div class="pf-table ipo-apps">
            <div class="pf-row pf-row--head" aria-hidden="true"><span>Person</span><span>Amount</span><span>Money</span><span>Result</span><span>Shares</span><span>Sell price</span><span>Net P&L</span><span>Due back</span><span>Settled</span><span></span></div>
            ${rows.map(({ app: a, c }) => appRow(a, c, perById[a.personId], ipo, d)).join('')}
          </div>` : `<p class="desk-empty">No applications yet. Use <strong>Add for everyone</strong> above.</p>`}
      </section>`;
    bindIpo(el, d, ipo);
  }

  function cell(k, v, sub) {
    return `<div class="ws-cell"><span class="ws-cell__k">${k}</span><span class="ws-cell__v">${v}</span>${sub ? `<span class="ws-cell__sub">${sub}</span>` : ''}</div>`;
  }

  function appRow(a, c, p, ipo, d) {
    const open = S.openApp.has(a.id);
    const seg = IPO.OUTCOMES.filter(o => o.value !== 'cancelled').map(o =>
      `<button type="button" class="seg__btn${a.outcome === o.value ? ' is-on' : ''}" data-outcome="${o.value}" aria-pressed="${a.outcome === o.value}" title="${o.label}" aria-label="${o.label}">${o.value === 'not_allotted' ? 'No' : o.value === 'allotted' ? 'Yes' : '…'}</button>`).join('');
    return `
      <div class="pf-row ipo-app${open ? ' is-open' : ''}${a.settled ? ' is-settled' : ''}" data-app="${a.id}">
        <span data-k="Person"><span class="ipo-person">${esc(p.name)}</span><span class="tag">${esc(a.category)}</span>${a.lots > 1 ? `<small>${a.lots} lots</small>` : ''}</span>
        <span data-k="Amount">${m(c.amount)}${a.loanAmount ? `<small>loan ${m(a.loanAmount)}</small>` : ''}</span>
        <span data-k="Money">${esc(fundShort(a.funding))}</span>
        <span data-k="Result"><span class="seg" role="group" aria-label="Allotted?">${seg}</span>${a.outcome === 'cancelled' ? '<small>cancelled</small>' : ''}</span>
        <span data-k="Shares">${a.outcome === 'allotted' ? c.shares : '—'}</span>
        <span data-k="Sell price">${a.sellPrice != null ? m(a.sellPrice) : (a.outcome === 'allotted' ? '<small>not sold</small>' : '—')}</span>
        <span data-k="Net P&L">${c.net != null ? signed(c.net) : '—'}${!c.mine && c.net != null ? '<small>their money</small>' : ''}</span>
        <span data-k="Due back">${c.dueBack != null ? m(c.dueBack) : (a.funding === 'sent' && !a.settled && a.outcome === 'pending' ? '<small>waiting</small>' : '—')}</span>
        <span data-k="Settled">${a.funding === 'sent'
          ? `<label class="check"><input type="checkbox" data-app-settle ${a.settled ? 'checked' : ''}><span class="check__box" aria-hidden="true"></span><span class="sr-only">Settled</span></label>${a.settled && a.settledOn ? `<small>${fmtShortDate(a.settledOn)}</small>` : ''}`
          : '<small>n/a</small>'}</span>
        <span class="tx__act"><button class="text-btn" type="button" data-ia="app-edit">${open ? 'Close' : 'Edit'}</button></span>
        ${open ? `
          <div class="rec__edit ipo-app__edit" data-app-form>
            <div class="ipo-form__grid">
              <div class="nb-field"><label class="nb-label">Category</label><select class="nb-input" data-f="category">${catOptions(d.categories, a.category)}${d.categories.some(x => x.name === a.category) ? '' : `<option selected>${esc(a.category)}</option>`}</select></div>
              <div class="nb-field"><label class="nb-label">Lots</label><input class="nb-input nb-input--num" data-f="lots" inputmode="numeric" value="${a.lots}"></div>
              <div class="nb-field"><label class="nb-label">Amount applied (₹)</label><input class="nb-input nb-input--num" data-f="amount" inputmode="decimal" value="${a.amount ?? ''}" placeholder="${c.amount != null ? Math.round(c.amount) : ''}"></div>
              <div class="nb-field"><label class="nb-label">Money</label><select class="nb-input" data-f="funding">${fundOptions(a.funding)}</select></div>
              <div class="nb-field"><label class="nb-label">Result</label><select class="nb-input" data-f="outcome">${IPO.OUTCOMES.map(o => `<option value="${o.value}"${o.value === a.outcome ? ' selected' : ''}>${o.label}</option>`).join('')}</select></div>
              <div class="nb-field"><label class="nb-label">Shares allotted</label><input class="nb-input nb-input--num" data-f="sharesAllotted" inputmode="numeric" value="${a.sharesAllotted ?? ''}" placeholder="${ipo.lotSize || ''}"></div>
              <div class="nb-field"><label class="nb-label">Sell price (₹)</label><input class="nb-input nb-input--num" data-f="sellPrice" inputmode="decimal" value="${a.sellPrice ?? ''}"></div>
              <div class="nb-field"><label class="nb-label">Sell date</label><input class="nb-input" type="date" data-f="sellDate" value="${esc(a.sellDate || '')}"></div>
              <div class="nb-field"><label class="nb-label">Charges (₹)</label><input class="nb-input nb-input--num" data-f="charges" inputmode="decimal" value="${a.charges || ''}" placeholder="0"></div>
              <div class="nb-field"><label class="nb-label">Loan amount (₹)</label><input class="nb-input nb-input--num" data-f="loanAmount" inputmode="decimal" value="${a.loanAmount ?? ''}"></div>
              <div class="nb-field"><label class="nb-label">Loan interest (₹)</label><input class="nb-input nb-input--num" data-f="loanInterest" inputmode="decimal" value="${a.loanInterest || ''}" placeholder="0"></div>
              <div class="nb-field"><label class="nb-label">Application no.</label><input class="nb-input" data-f="applicationNo" value="${esc(a.applicationNo || '')}"></div>
              <div class="nb-field ipo-form__notes"><label class="nb-label">Notes</label><input class="nb-input" data-f="notes" value="${esc(a.notes || '')}"></div>
            </div>
            <p class="nb-hint">${esc(fundLabel(a.funding))}. ${c.dueNote ? esc(c.dueNote) + '.' : ''} Net P&L = listing gain − charges − loan interest.</p>
            <div class="nb-actions">
              <button class="btn btn--solid btn--sm" type="button" data-ia="app-save">Save</button>
              <button class="text-btn text-btn--danger" type="button" data-ia="app-delete">Delete application</button>
            </div>
          </div>` : ''}
      </div>`;
  }

  function bindIpo(el, d, ipo) {
    const appOf = node => node.closest('[data-app]');
    el.onclick = async e => {
      const seg = e.target.closest('[data-outcome]');
      if (seg) {
        const row = appOf(seg);
        try {
          await DataLayer.ipo.apps.update(row.dataset.app, { outcome: seg.dataset.outcome }, ipo);
          await render(ipo.id);
        } catch (err) { UI.error(err); }
        return;
      }
      const b = e.target.closest('[data-ia]');
      if (!b) return;
      const a = b.dataset.ia;
      try {
        if (a === 'ipo-edit') { S.editIpo = !S.editIpo; await render(ipo.id); }
        if (a === 'ipo-edit-cancel') { S.editIpo = false; await render(ipo.id); }
        if (a === 'ipo-delete') {
          if (!(await UI.confirmInline(b, `Delete ${ipo.name} and all its applications?`))) return;
          await DataLayer.ipo.ipos.remove(ipo.id);
          S.editIpo = false; UI.toast('IPO deleted'); location.hash = '#/ipos';
        }
        if (a === 'app-edit') { const id = appOf(b).dataset.app; if (S.openApp.has(id)) S.openApp.delete(id); else S.openApp.add(id); await render(ipo.id); }
        if (a === 'app-save') {
          const row = appOf(b);
          const v = UI.read(row.querySelector('[data-app-form]'));
          await UI.busy(b, () => DataLayer.ipo.apps.update(row.dataset.app, v, ipo));
          S.openApp.delete(row.dataset.app); UI.toast('Saved'); await render(ipo.id);
        }
        if (a === 'app-delete') {
          const row = appOf(b);
          if (!(await UI.confirmInline(b, 'Delete this application?'))) return;
          await DataLayer.ipo.apps.remove(row.dataset.app);
          S.openApp.delete(row.dataset.app); await render(ipo.id);
        }
        if (a === 'settle-all') {
          if (!(await UI.confirmInline(b, 'Mark every decided application you funded as settled?'))) return;
          const n = await DataLayer.ipo.apps.settleAll(ipo.id);
          UI.toast(`${n} marked settled`); await render(ipo.id);
        }
      } catch (err) { UI.error(err); }
    };
    el.onchange = async e => {
      const cb = e.target.closest('[data-app-settle]');
      if (!cb) return;
      try {
        await DataLayer.ipo.apps.update(appOf(cb).dataset.app, { settled: cb.checked });
        UI.toast(cb.checked ? 'Marked settled' : 'Marked not settled');
        await render(ipo.id);
      } catch (err) { UI.error(err); cb.checked = !cb.checked; }
    };
    el.onsubmit = async e => {
      const f = e.target.closest('[data-iform]');
      if (!f) return;
      e.preventDefault();
      const btn = f.querySelector('[type="submit"]');
      const v = UI.read(f);
      try {
        if (f.dataset.iform === 'ipo-edit') {
          await UI.busy(btn, () => DataLayer.ipo.ipos.update(ipo.id, v));
          S.editIpo = false; UI.toast('IPO details saved'); await render(ipo.id);
        }
        if (f.dataset.iform === 'add-all') {
          const n = await UI.busy(btn, () => DataLayer.ipo.apps.addForEveryone(ipo.id, v), 'Adding…');
          UI.toast(n ? `${n} application${n === 1 ? '' : 's'} added` : `Everyone already has a ${v.category} application`);
          await render(ipo.id);
        }
        if (f.dataset.iform === 'add-one') {
          if (!v.personId) return UI.toast('Choose a person.', 'error');
          await UI.busy(btn, () => DataLayer.ipo.apps.add(ipo.id, v), 'Adding…');
          UI.toast('Application added'); await render(ipo.id);
        }
        if (f.dataset.iform === 'sell-all') {
          const n = await UI.busy(btn, () => DataLayer.ipo.apps.applySellPrice(ipo.id, v.price, v.date), 'Applying…');
          UI.toast(n ? `Sell price set on ${n} application${n === 1 ? '' : 's'}` : 'Every allotted application already has a sell price');
          await render(ipo.id);
        }
      } catch (err) { UI.error(err); }
    };
  }

  return {
    render: async (ipoId) => { currentId = ipoId || null; if (!ipoId) S.editIpo = false; await render(ipoId); }
  };
})();
