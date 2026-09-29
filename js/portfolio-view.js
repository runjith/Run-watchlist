/* ============================================================
   RUN WATCHLIST — js/portfolio-view.js
   The Portfolio page  #/portfolio
   Holdings, invested vs present allocation, P&L, XIRR, risk to
   stop-losses, sector split, closed positions and all trades.
   Everything is arithmetic on the trades you record.
   ============================================================ */

const PortfolioView = (() => {

  const S = { priceMode: false, showAdd: false, editCash: false, txCompany: 'all' };
  const body = () => document.getElementById('portfolioBody');
  const q = v => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });
  const m = v => v == null || !isFinite(v) ? '—' : UI.money(Math.round(v * 100) / 100, 'INR');
  const pct = (v, d = 1) => v == null || !isFinite(v) ? '—' : `${Number(v).toFixed(d)}%`;

  async function render() {
    const el = body();
    if (!el) return;
    let pf;
    try { pf = await DataLayer.portfolio(); }
    catch (err) { el.innerHTML = `<div class="empty"><p class="empty__title">Could not load the portfolio.</p><p class="empty__text">${esc(err.message)}</p></div>`; return; }
    const t = pf.totals;
    const actions = `
      <div class="pf-actions">
        <button class="btn btn--solid btn--sm" type="button" data-pf="toggle-add">${S.showAdd ? 'Close' : '+ Add trade'}</button>
        ${pf.rows.length ? `<button class="btn btn--sm" type="button" data-pf="price-mode">${S.priceMode ? 'Cancel price update' : 'Update prices'}</button>` : ''}
        <button class="btn btn--sm" type="button" data-pf="import">Import trades or holdings</button>
        ${pf.transactions.length ? `<button class="text-btn" type="button" data-pf="export-holdings">Export holdings (CSV)</button>
        <button class="text-btn" type="button" data-pf="export-trades">Export trades (CSV)</button>` : ''}
      </div>`;

    if (!pf.transactions.length) {
      el.innerHTML = `${actions}${S.showAdd ? addForm(pf) : ''}
        <div class="empty pf-empty">
          <p class="empty__title">No trades yet.</p>
          <p class="empty__text">Record a buy with <strong>+ Add trade</strong>, or import a Zerodha tradebook or holdings file.<br>
          Every figure on this page is worked out from those trades.</p>
        </div>`;
      bind(pf);
      return;
    }

    const first = pf.transactions.map(x => x.tradeDate).sort()[0];
    el.innerHTML = `
      ${actions}
      ${S.showAdd ? addForm(pf) : ''}

      <section class="ws-summary pf-summary" aria-label="Portfolio summary">
        <div class="ws-ledger">
          ${cell('Current value', m(t.value), t.cash ? `${m(t.total)} with cash` : (t.missingPrices ? `${t.missingPrices} holding${t.missingPrices === 1 ? '' : 's'} valued at cost (no price)` : 'at the prices you entered'))}
          ${cell('Invested', m(t.invested), 'cost of shares held now')}
          ${cell('Unrealised P&L', m(t.pnl), t.pnlPct != null ? UI.pct(t.pnlPct) + ' on cost' : '')}
          ${cell('Realised P&L', m(t.realised), 'from shares already sold')}
          ${cell('Annual return (XIRR)', t.xirr != null ? UI.pct(t.xirr * 100) : '—', first ? 'since ' + fmtDate(first) : '')}
          ${cell('Holdings', UI.two(t.holdings), pf.closed.length ? `${pf.closed.length} closed position${pf.closed.length === 1 ? '' : 's'}` : '')}
          ${cashCell(t)}
          ${cell('Largest position', t.largest ? pct(t.largest.pct) : '—', t.largest ? `${esc(t.largest.company.name)} · top 5 = ${pct(t.top5)}` : '', true)}
        </div>
      </section>

      <section class="desk-sec" id="pf-holdings">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Holdings</h2>
          <p class="desk-sec__meta">Allocation: invested = share of cost · present = share of value${t.cash ? ' · with cash = share of stocks + cash' : ''}</p></header>
        ${holdingsTable(pf)}
      </section>

      <section class="desk-sec" id="pf-allocation">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Allocation</h2><p class="desk-sec__meta">Invested vs present, to scale</p></header>
        ${allocation(pf)}
      </section>

      <section class="desk-sec" id="pf-risk">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Risk and targets</h2><p class="desk-sec__meta">From your latest valuation for each company</p></header>
        ${risk(pf)}
      </section>

      ${pf.closed.length ? `
      <section class="desk-sec" id="pf-closed">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Closed positions</h2><p class="desk-sec__meta">Fully sold</p></header>
        <div class="pf-table pf-table--closed">
          <div class="pf-row pf-row--head" aria-hidden="true"><span>Company</span><span>Bought</span><span>Sold</span><span>Realised P&L</span><span>Last trade</span></div>
          ${pf.closed.map(c => `<div class="pf-row">
            <span data-k="Company">${coLink(c.company, 'position')}</span>
            <span data-k="Bought">${q(c.bought)}</span><span data-k="Sold">${q(c.sold)}</span>
            <span data-k="Realised P&L">${m(c.realised)}</span><span data-k="Last trade">${fmtDate(c.lastDate)}</span>
          </div>`).join('')}
        </div>
      </section>` : ''}

      <section class="desk-sec" id="pf-trades">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Trades</h2><p class="desk-sec__meta">${pf.transactions.length} recorded</p></header>
        ${trades(pf)}
      </section>`;
    bind(pf);
  }

  function cell(k, v, sub, small) {
    return `<div class="ws-cell"><span class="ws-cell__k">${k}</span><span class="ws-cell__v${small ? ' ws-cell__v--sm' : ''}">${v}</span>${sub ? `<span class="ws-cell__sub">${sub}</span>` : ''}</div>`;
  }
  function cashCell(t) {
    if (S.editCash) {
      return `<div class="ws-cell"><span class="ws-cell__k">Cash</span>
        <form class="price-form" data-pf-form="cash">
          <input class="nb-input" data-f="cash" inputmode="decimal" value="${t.cash ?? ''}" placeholder="0" aria-label="Cash balance">
          <span class="price-form__actions"><button class="btn btn--solid btn--xs" type="submit">Save</button><button class="text-btn" type="button" data-pf="cash-cancel">Cancel</button></span>
        </form></div>`;
    }
    return cell('Cash', t.cash != null ? m(t.cash) : '—',
      `${t.cash != null ? pct(t.cashAlloc) + ' of total · ' : 'optional · '}<button class="text-btn" type="button" data-pf="cash-edit">${t.cash != null ? 'update' : 'enter cash'}</button>`);
  }
  const coLink = (c, sec) => `<a class="pf-co" href="#/company/${esc(c.slug)}${sec ? '/' + sec : ''}">${esc(c.name)}${c.ticker ? `<em>${esc(c.ticker)}</em>` : ''}</a>`;

  function addForm(pf) {
    const cos = pf.companies.slice().sort((a, b) => a.name.localeCompare(b.name));
    return `
      <form class="trade pf-add" data-pf-form="add">
        <label class="quick__opt pf-add__co"><span>Company</span>
          <select class="nb-input" data-f="companyId" required>
            <option value="">Choose a company</option>
            ${cos.map(c => `<option value="${c.id}">${esc(c.name)}${c.ticker ? ' · ' + esc(c.ticker) : ''}</option>`).join('')}
          </select></label>
        <div class="trade__side" role="radiogroup" aria-label="Buy or sell">
          <label><input type="radio" name="pfType" value="buy" checked><span>Buy</span></label>
          <label><input type="radio" name="pfType" value="sell"><span>Sell</span></label>
        </div>
        <label class="quick__opt"><span>Date</span><input class="nb-input" type="date" data-f="tradeDate" value="${esc(DataLayer.util.today())}"></label>
        <label class="quick__opt"><span>Shares</span><input class="nb-input nb-input--num" data-f="quantity" inputmode="decimal" placeholder="0"></label>
        <label class="quick__opt"><span>Price</span><input class="nb-input nb-input--num" data-f="price" inputmode="decimal" placeholder="0.00"></label>
        <label class="quick__opt"><span>Charges</span><input class="nb-input nb-input--num" data-f="fees" inputmode="decimal" placeholder="0"></label>
        <button class="btn btn--solid btn--sm" type="submit">Add trade</button>
        <p class="nb-hint pf-add__hint">Company not listed? Add it on the Watchlist first, or import a broker file and it is created for you.</p>
      </form>`;
  }

  function holdingsTable(pf) {
    const t = pf.totals;
    return `
      <div class="pf-table pf-table--hold${S.priceMode ? ' is-pricing' : ''}">
        <div class="pf-row pf-row--head" aria-hidden="true">
          <span>Company</span><span>Shares</span><span>Avg cost</span><span>Invested</span><span>Price</span><span>Value</span><span>P&L</span>
          <span>Invested %</span><span>Present %</span><span>${t.cash ? 'With cash %' : 'Max %'}</span>
        </div>
        ${pf.rows.map(r => `
          <div class="pf-row" data-company="${r.company.id}">
            <span data-k="Company">${coLink(r.company, 'position')}</span>
            <span data-k="Shares">${q(r.qty)}</span>
            <span data-k="Avg cost">${m(r.avg)}</span>
            <span data-k="Invested">${m(r.invested)}</span>
            <span data-k="Price">${S.priceMode
              ? `<input class="nb-input nb-input--num pf-price" data-price-for="${r.company.id}" inputmode="decimal" value="${r.price ?? ''}" placeholder="${r.avg ? r.avg.toFixed(2) : ''}" aria-label="Price for ${esc(r.company.name)}">`
              : (r.priceMissing ? `<span class="is-signal">not set</span>` : `${m(r.price)}<small>${r.company.priceAsOf ? fmtShortDate(r.company.priceAsOf) : ''}</small>`)}</span>
            <span data-k="Value">${m(r.value)}</span>
            <span data-k="P&L">${m(r.pnl)}<small>${UI.pct(r.pnlPct)}</small></span>
            <span data-k="Invested %">${pct(r.investedAlloc)}</span>
            <span data-k="Present %">${pct(r.presentAlloc)}</span>
            <span data-k="${t.cash ? 'With cash %' : 'Max %'}">${t.cash ? pct(r.portfolioAlloc) : ''}${r.maxAlloc != null ? `<small class="${r.overMax ? 'is-signal' : ''}">${r.overMax ? 'above ' : 'max '}${pct(r.maxAlloc, 0)}</small>` : (t.cash ? '' : '—')}</span>
          </div>`).join('')}
        ${t.cash ? `<div class="pf-row pf-row--cash"><span data-k="Company">Cash</span><span></span><span></span><span></span><span></span>
          <span data-k="Value">${m(t.cash)}</span><span></span><span></span><span></span><span data-k="With cash %">${pct(t.cashAlloc)}</span></div>` : ''}
        <div class="pf-row pf-row--total"><span data-k="Total">Total</span><span></span><span></span>
          <span data-k="Invested">${m(t.invested)}</span><span></span><span data-k="Value">${m(t.value)}</span>
          <span data-k="P&L">${m(t.pnl)}<small>${UI.pct(t.pnlPct)}</small></span><span data-k="Invested %">100%</span><span data-k="Present %">100%</span><span${t.cash ? ' data-k="With cash %"' : ''}>${t.cash ? '100%' : ''}</span></div>
      </div>
      ${S.priceMode ? `
        <div class="nb-actions pf-price-actions">
          <label class="quick__opt"><span>Prices as of</span><input class="nb-input" type="date" id="pfPriceDate" value="${esc(DataLayer.util.today())}"></label>
          <button class="btn btn--solid btn--sm" type="button" data-pf="save-prices">Save prices</button>
          <button class="text-btn" type="button" data-pf="price-mode">Cancel</button>
        </div>` : ''}
      ${t.overMax ? `<p class="nb-hint">${t.overMax} holding${t.overMax === 1 ? ' is' : 's are'} above the maximum allocation recorded in your decision.</p>` : ''}`;
  }

  function allocation(pf) {
    const t = pf.totals;
    const max = Math.max(1, ...pf.rows.map(r => Math.max(r.investedAlloc, r.presentAlloc)));
    const bar = (v, cls) => `<span class="alloc__bar ${cls}"><span style="width:${Math.max(0, v / max * 100)}%"></span></span>`;
    const smax = Math.max(1, ...pf.sectors.map(s => Math.max(s.investedAlloc, s.presentAlloc)));
    const sbar = (v, cls) => `<span class="alloc__bar ${cls}"><span style="width:${Math.max(0, v / smax * 100)}%"></span></span>`;
    return `
      <p class="alloc__legend"><span class="alloc__key alloc__key--inv"></span>Invested % <span class="alloc__key alloc__key--now"></span>Present %</p>
      <div class="alloc">
        ${pf.rows.map(r => `
          <div class="alloc__row">
            <span class="alloc__name">${esc(r.company.name)}</span>
            <span class="alloc__bars">${bar(r.investedAlloc, 'alloc__bar--inv')}${bar(r.presentAlloc, 'alloc__bar--now')}</span>
            <span class="alloc__nums">${pct(r.investedAlloc)} → ${pct(r.presentAlloc)}<em>${r.allocDrift >= 0 ? '+' : '−'}${Math.abs(r.allocDrift).toFixed(1)} pts</em></span>
          </div>`).join('')}
      </div>
      <p class="nb-label alloc__sub">By sector</p>
      <div class="alloc">
        ${pf.sectors.map(s => `
          <div class="alloc__row">
            <span class="alloc__name">${esc(s.sector)}<em>${s.count} holding${s.count === 1 ? '' : 's'}</em></span>
            <span class="alloc__bars">${sbar(s.investedAlloc, 'alloc__bar--inv')}${sbar(s.presentAlloc, 'alloc__bar--now')}</span>
            <span class="alloc__nums">${pct(s.investedAlloc)} → ${pct(s.presentAlloc)}</span>
          </div>`).join('')}
      </div>
      ${t.cash ? `<p class="nb-hint">Cash is ${pct(t.cashAlloc)} of stocks + cash.</p>` : ''}`;
  }

  function risk(pf) {
    const t = pf.totals;
    return `
      <dl class="desk-figs pf-risk-figs">
        <div><a href="#/portfolio"><dt>At risk if every stop is hit</dt><dd>${t.withoutStop === t.holdings ? '—' : m(t.riskToStop)}</dd><span>${t.withoutStop === t.holdings ? 'no stop levels set yet' : (t.riskPct != null ? pct(t.riskPct) + ' of the portfolio' + (t.withoutStop ? ` · ${t.withoutStop} without a stop` : '') : '')}</span></a></div>
        <div><a href="#/portfolio"><dt>Weighted upside to base targets</dt><dd>${t.weightedUpside != null ? UI.pct(t.weightedUpside) : '—'}</dd><span>weighted by present value</span></a></div>
        <div><a href="#/portfolio"><dt>Holdings without a stop level</dt><dd>${UI.two(t.withoutStop)}</dd><span>set one in Valuation</span></a></div>
      </dl>
      <div class="pf-table pf-table--risk">
        <div class="pf-row pf-row--head" aria-hidden="true"><span>Company</span><span>Price</span><span>Stop / invalidation</span><span>Distance</span><span>Amount at risk</span><span>Base target</span><span>Upside</span></div>
        ${pf.rows.map(r => `
          <div class="pf-row">
            <span data-k="Company">${coLink(r.company, 'valuation')}</span>
            <span data-k="Price">${r.priceMissing ? '—' : m(r.price)}</span>
            <span data-k="Stop / invalidation">${r.stop != null ? m(r.stop) : '—'}</span>
            <span data-k="Distance">${r.stop != null && !r.priceMissing ? (r.belowStop ? '<span class="is-signal">at or below stop</span>' : UI.pct((r.stop - r.price) / r.price * 100)) : '—'}</span>
            <span data-k="Amount at risk">${r.stop != null ? m(r.riskToStop) : '—'}</span>
            <span data-k="Base target">${r.target != null ? m(r.target) : '—'}</span>
            <span data-k="Upside">${r.upside != null ? UI.pct(r.upside) : '—'}</span>
          </div>`).join('')}
      </div>`;
  }

  function trades(pf) {
    const cos = [...new Map(pf.transactions.map(x => [x.companyId, x.company])).values()].sort((a, b) => a.name.localeCompare(b.name));
    const list = S.txCompany === 'all' ? pf.transactions : pf.transactions.filter(x => x.companyId === S.txCompany);
    return `
      <div class="pf-txfilter"><label class="quick__opt"><span>Company</span>
        <select class="nb-input" id="pfTxCompany"><option value="all">All companies</option>
          ${cos.map(c => `<option value="${c.id}"${S.txCompany === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></label></div>
      <div class="txs pf-txs">
        <div class="tx tx--head tx--wide" aria-hidden="true"><span>Date</span><span>Company</span><span>Type</span><span>Shares</span><span>Price</span><span>Charges</span><span>Amount</span><span></span></div>
        ${list.slice(0, 400).map(x => {
          const amt = x.quantity * x.price + (x.type === 'buy' ? 1 : -1) * (x.fees || 0);
          return `<div class="tx tx--wide" data-tx="${x.id}" data-company="${x.companyId}">
            <span data-k="Date">${fmtDate(x.tradeDate)}</span>
            <span data-k="Company">${coLink(x.company, 'position')}</span>
            <span data-k="Type" class="tx__type tx__type--${x.type}">${x.type === 'buy' ? 'Buy' : 'Sell'}${x.source === 'import' ? '<em>imported</em>' : ''}</span>
            <span data-k="Shares">${q(x.quantity)}</span>
            <span data-k="Price">${m(Number(x.price))}</span>
            <span data-k="Charges">${x.fees ? m(Number(x.fees)) : '—'}</span>
            <span data-k="Amount">${m(amt)}</span>
            <span class="tx__act"><button class="text-btn text-btn--danger" type="button" data-pf="tx-delete">Delete</button></span>
          </div>`;
        }).join('')}
      </div>
      ${list.length > 400 ? `<p class="nb-hint">Showing the latest 400 of ${list.length}. Export to see all.</p>` : ''}`;
  }

  /* ---------- exports ---------- */
  function exportHoldings(pf) {
    const rows = pf.rows.map(r => [
      r.company.name, r.company.ticker, r.company.exchange, r.company.sector, r.qty, Portfolio.round(r.avg, 4),
      Portfolio.round(r.invested), r.price ?? '', r.company.priceAsOf || '', Portfolio.round(r.value), Portfolio.round(r.pnl),
      Portfolio.round(r.pnlPct), Portfolio.round(r.investedAlloc), Portfolio.round(r.presentAlloc), Portfolio.round(r.portfolioAlloc),
      r.maxAlloc ?? '', r.stop ?? '', r.target ?? '', Portfolio.round(r.upside), r.firstDate || ''
    ]);
    IO.download(`run-holdings-${DataLayer.util.today()}.csv`, IO.toCSV(
      ['company', 'ticker', 'exchange', 'sector', 'shares', 'avg_cost', 'invested', 'current_price', 'price_date', 'current_value',
       'unrealised_pnl', 'unrealised_pnl_pct', 'invested_alloc_pct', 'present_alloc_pct', 'alloc_with_cash_pct', 'max_alloc_pct',
       'stop_loss', 'base_target', 'upside_pct', 'first_buy'], rows));
  }
  function exportTrades(pf) {
    const rows = pf.transactions.slice().reverse().map(x => [x.tradeDate, x.company.ticker || x.company.name, x.company.exchange || '',
      x.type, x.quantity, x.price, x.fees || 0, x.notes || '', x.company.name]);
    IO.download(`run-trades-${DataLayer.util.today()}.csv`, IO.toCSV(['date', 'ticker', 'exchange', 'type', 'quantity', 'price', 'fees', 'notes', 'company'], rows));
  }

  /* ---------- events ---------- */
  function bind(pf) {
    const el = body();
    el.onclick = async e => {
      const b = e.target.closest('[data-pf]');
      if (!b) return;
      const a = b.dataset.pf;
      try {
        if (a === 'toggle-add') { S.showAdd = !S.showAdd; await render(); if (S.showAdd) { const s = el.querySelector('[data-f="companyId"]'); if (s) s.focus(); } }
        if (a === 'price-mode') { S.priceMode = !S.priceMode; await render(); if (S.priceMode) { const i = el.querySelector('.pf-price'); if (i) i.focus(); } }
        if (a === 'save-prices') {
          const map = {};
          el.querySelectorAll('[data-price-for]').forEach(i => { if (i.value.trim() !== '') map[i.dataset.priceFor] = UI.num(i.value); });
          const n = await UI.busy(b, () => DataLayer.setPrices(map, el.querySelector('#pfPriceDate').value));
          S.priceMode = false;
          UI.toast(`${n} price${n === 1 ? '' : 's'} updated`);
          await render();
        }
        if (a === 'cash-edit') { S.editCash = true; await render(); const i = el.querySelector('[data-f="cash"]'); if (i) i.focus(); }
        if (a === 'cash-cancel') { S.editCash = false; await render(); }
        if (a === 'import') {
          IO.openImport({
            kind: 'trades', title: 'Trades or holdings',
            onImport: async parsed => {
              const r = await DataLayer.transactions.importMany(parsed.rows);
              await render();
              return `${r.added} trade${r.added === 1 ? '' : 's'} added` +
                (r.dupes ? `, ${r.dupes} already imported (skipped)` : '') +
                (r.companiesCreated ? `, ${r.companiesCreated} new compan${r.companiesCreated === 1 ? 'y' : 'ies'} created` : '') +
                (r.priced ? `, ${r.priced} price${r.priced === 1 ? '' : 's'} updated` : '') + '.';
            }
          });
        }
        if (a === 'export-holdings') exportHoldings(pf);
        if (a === 'export-trades') exportTrades(pf);
        if (a === 'tx-delete') {
          const row = b.closest('[data-tx]');
          if (!(await UI.confirmInline(b, 'Delete this trade?'))) return;
          await DataLayer.transactions.remove(row.dataset.tx, row.dataset.company);
          UI.toast('Trade deleted');
          await render();
        }
      } catch (err) { UI.error(err); }
    };
    el.onsubmit = async e => {
      const f = e.target.closest('[data-pf-form]');
      if (!f) return;
      e.preventDefault();
      const btn = f.querySelector('[type="submit"]');
      try {
        if (f.dataset.pfForm === 'cash') {
          const raw = f.querySelector('[data-f="cash"]').value.trim();
          if (raw !== '' && UI.num(raw) === null) return UI.toast('Enter cash as a number, e.g. 150000', 'error');
          await UI.busy(btn, () => DataLayer.setCash(raw === '' ? null : UI.num(raw)));
          S.editCash = false;
          UI.toast('Cash updated');
          await render();
        }
        if (f.dataset.pfForm === 'add') {
          const v = UI.read(f);
          if (!v.companyId) return UI.toast('Choose a company.', 'error');
          v.type = f.querySelector('input[name="pfType"]:checked').value;
          v.quantity = UI.num(v.quantity); v.price = UI.num(v.price); v.fees = UI.num(v.fees) || 0;
          await UI.busy(btn, () => DataLayer.transactions.add(v.companyId, v), 'Adding…');
          UI.toast(v.type === 'buy' ? 'Buy recorded' : 'Sell recorded');
          await render();
        }
      } catch (err) { UI.error(err); }
    };
    const sel = el.querySelector('#pfTxCompany');
    if (sel) sel.onchange = () => { S.txCompany = sel.value; render().then(() => { const s = document.getElementById('pf-trades'); if (s) s.scrollIntoView({ block: 'start' }); }); };
  }

  return { render };
})();
