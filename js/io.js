/* ============================================================
   RUN WATCHLIST — js/io.js
   Import and export: CSV reading/writing, recognising broker
   files (Zerodha Console tradebook, Kite / Console holdings,
   generic templates), file downloads, and the Import dialog.
   ============================================================ */

const IO = (() => {

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';'
      : (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
    const rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(c => c.trim() !== '')) rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some(c => c.trim() !== '')) rows.push(row);
    return rows;
  }

  const cell = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  function toCSV(headers, rows) {
    return '﻿' + [headers.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\r\n') + '\r\n';
  }

  function download(filename, content, type = 'text/csv;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- value cleaning ---------- */
  const norm = h => String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const num = v => {
    if (v === null || v === undefined) return null;
    let s = String(v).trim().replace(/[₹$€£,\s]/g, '');
    if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
    if (s === '' || s === '-' || isNaN(Number(s))) return null;
    return Number(s);
  };
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const pad = x => String(x).padStart(2, '0');
  /* Dates: 2026-09-28, 28-09-2026, 28/09/2026, 28 Sep 2026, 28-Sep-26, 2026-09-28 10:15:00.
     Day-first is assumed for dd/mm/yyyy, as used in India. */
  function date(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
    m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]*(\d{2,4})/);
    if (m && MONTHS[m[2].toLowerCase()]) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`; }
    return null;
  }
  /* "NSE:MMFL", "MMFL-EQ", "MMFL.NS", "mmfl" → "MMFL" */
  function ticker(v) {
    return String(v || '').trim().toUpperCase()
      .replace(/^(NSE|BSE)\s*:\s*/, '').replace(/\.(NS|BO|NSE|BSE)$/, '').replace(/-(EQ|BE|BZ|SM|ST)$/, '').trim();
  }
  const exchangeOf = v => { const s = String(v || '').toUpperCase(); return s.includes('BSE') ? 'BSE' : s.includes('NSE') ? 'NSE' : ''; };

  /* ---------- column detection ---------- */
  const ALIASES = {
    name: ['name', 'company', 'company name', 'stock name', 'security name'],
    ticker: ['ticker', 'symbol', 'tradingsymbol', 'trading symbol', 'instrument', 'scrip', 'scrip code', 'stock', 'nse symbol', 'nse code', 'bse code'],
    exchange: ['exchange', 'exch', 'market'],
    sector: ['sector', 'industry'],
    description: ['description', 'about', 'notes on company'],
    status: ['status', 'research status'],
    currentPrice: ['current price', 'price now', 'ltp', 'last price', 'cmp', 'close', 'previous closing price', 'current_price'],
    date: ['date', 'trade date', 'trade_date', 'order execution time', 'execution date', 'transaction date', 'as of'],
    type: ['type', 'trade type', 'trade_type', 'side', 'buy sell', 'transaction type', 'action'],
    quantity: ['quantity', 'qty', 'shares', 'quantity available', 'units', 'qty.'],
    price: ['price', 'trade price', 'rate', 'buy price', 'avg price', 'average price', 'avg cost', 'avg. cost', 'average cost'],
    fees: ['fees', 'charges', 'brokerage', 'total charges'],
    notes: ['notes', 'note', 'remarks', 'comment'],
    tradeId: ['trade id', 'trade_id', 'order id', 'order_id', 'reference'],
    avg: ['avg cost', 'avg. cost', 'average price', 'avg price', 'average cost', 'buy average'],
    ltp: ['ltp', 'last price', 'current price', 'cmp', 'previous closing price', 'close price']
  };
  function columns(header) {
    const h = header.map(norm);
    const find = key => {
      for (const a of ALIASES[key]) { const i = h.indexOf(norm(a)); if (i >= 0) return i; }
      for (const a of ALIASES[key]) { const i = h.findIndex(x => x.startsWith(norm(a) + ' ')); if (i >= 0) return i; }
      return -1;
    };
    return Object.fromEntries(Object.keys(ALIASES).map(k => [k, find(k)]));
  }

  /* ---------- companies import ---------- */
  function readCompanies(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { error: 'The file needs a header row and at least one company.' };
    const c = columns(rows[0]);
    if (c.name < 0 && c.ticker < 0) return { error: 'Could not find a "name" or "ticker" column. Use the template.' };
    const out = [];
    for (const r of rows.slice(1)) {
      const get = k => c[k] >= 0 ? String(r[c[k]] ?? '').trim() : '';
      const t = ticker(get('ticker'));
      const name = get('name') || t;
      if (!name) continue;
      const st = get('status').toLowerCase();
      out.push({
        name, ticker: t, exchange: exchangeOf(get('exchange')) || get('exchange').toUpperCase(),
        sector: get('sector'), description: get('description'),
        researchStatus: st.startsWith('researched') || st === 'done' ? 'researched' : st.startsWith('research') ? 'researching' : 'watch',
        currentPrice: num(get('currentPrice'))
      });
    }
    return { format: 'companies', rows: out };
  }

  /* ---------- trades / holdings import ---------- */
  function readTrades(text, { asOf } = {}) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { error: 'The file needs a header row and at least one line.' };
    const header = rows[0], h = header.map(norm), c = columns(header);
    const has = k => c[k] >= 0;
    let format = null;
    if (h.includes('trade type') && h.includes('symbol') && (h.includes('trade id') || h.includes('order id'))) format = 'zerodha-tradebook';
    else if (has('type') && has('quantity') && has('price') && has('ticker')) format = 'trades';
    else if (has('ticker') && has('quantity') && has('avg')) format = 'holdings';
    if (!format) return { error: 'Could not recognise this file. Use the trades template, a Zerodha Console tradebook, or a Kite holdings export (saved as CSV).' };

    const out = [], skipped = [];
    rows.slice(1).forEach((r, i) => {
      const get = k => c[k] >= 0 ? String(r[c[k]] ?? '').trim() : '';
      const t = ticker(get('ticker'));
      if (!t) { skipped.push({ line: i + 2, reason: 'no symbol' }); return; }
      if (/^(total|grand total)$/i.test(t)) return;
      if (format === 'holdings') {
        const qty = num(get('quantity')), avg = num(get('avg'));
        if (!qty || qty <= 0 || avg == null) { skipped.push({ line: i + 2, reason: 'missing quantity or average cost' }); return; }
        out.push({ ticker: t, exchange: exchangeOf(get('exchange')), tradeDate: asOf, type: 'buy', quantity: qty, price: avg, fees: 0,
          notes: 'Opening position from holdings import', ltp: num(get('ltp')), externalId: `holding:${t}:${asOf}` });
        return;
      }
      const typeRaw = get('type').toLowerCase();
      const type = /^(b|buy|purchase)/.test(typeRaw) ? 'buy' : /^(s|sell|sale)/.test(typeRaw) ? 'sell' : null;
      const qty = num(get('quantity')), price = num(get('price')), d = date(get('date'));
      if (!type || !qty || qty <= 0 || price == null || !d) { skipped.push({ line: i + 2, reason: 'missing date, type, quantity or price' }); return; }
      const ex = exchangeOf(get('exchange'));
      const tid = get('tradeId');
      out.push({
        ticker: t, exchange: ex, tradeDate: d, type, quantity: qty, price, fees: num(get('fees')) || 0, notes: get('notes'),
        externalId: format === 'zerodha-tradebook' && tid ? `zerodha:${ex || 'X'}:${tid}` : (tid ? `import:${tid}` : null)
      });
    });
    return { format, rows: out, skipped };
  }

  /* ---------- IPO applications import ---------- */
  const IPO_ALIASES = {
    ipo: ['ipo', 'ipo name', 'issue', 'company', 'ipo company'],
    symbol: ['symbol', 'ticker'],
    person: ['person', 'name', 'applicant', 'account', 'account holder', 'holder', 'pan name'],
    category: ['category', 'quota', 'application type', 'type'],
    lots: ['lots', 'lot', 'no of lots', 'number of lots'],
    amount: ['amount', 'applied amount', 'application amount', 'blocked amount', 'amount applied'],
    funding: ['funding', 'money', 'money from', 'source', 'funded by', 'sent money', 'money sent'],
    outcome: ['allotted', 'allotment', 'outcome', 'status', 'result'],
    shares: ['shares', 'shares allotted', 'allotted shares', 'qty', 'quantity'],
    sellPrice: ['sell price', 'sold at', 'sale price', 'selling price', 'exit price'],
    sellDate: ['sell date', 'sold on', 'sale date'],
    charges: ['charges', 'brokerage', 'fees'],
    loanAmount: ['loan', 'loan amount'],
    loanInterest: ['interest', 'loan interest', 'interest paid', 'loan charges'],
    settled: ['settled', 'funds settled', 'money received', 'received back'],
    issuePrice: ['issue price', 'price', 'ipo price', 'offer price'],
    lotSize: ['lot size', 'shares per lot', 'market lot'],
    listingDate: ['listing date', 'listed on'],
    notes: ['notes', 'remarks', 'comment']
  };
  function readIpoApps(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { error: 'The file needs a header row and at least one application.' };
    const h = rows[0].map(norm);
    const col = {};
    for (const [k, al] of Object.entries(IPO_ALIASES)) {
      col[k] = -1;
      for (const a of al) { const i = h.indexOf(norm(a)); if (i >= 0) { col[k] = i; break; } }
    }
    if (col.ipo < 0 || col.person < 0) return { error: 'Could not find the “ipo” and “person” columns. Use the template.' };
    const yes = v => /^(y|yes|true|1|done|✓|✔|received|settled)$/i.test(String(v).trim());
    const out = [], skipped = [];
    rows.slice(1).forEach((r, i) => {
      const get = k => col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '';
      const ipo = get('ipo'), person = get('person');
      if (!ipo || !person) { skipped.push({ line: i + 2, reason: 'missing IPO or person' }); return; }
      const o = get('outcome').toLowerCase();
      const outcome = /^(y|yes|allotted|allot|1)$/.test(o) ? 'allotted' : /^(n|no|not ?allotted|0|rejected)$/.test(o) ? 'not_allotted'
        : /cancel|withdrawn/.test(o) ? 'cancelled' : 'pending';
      const f = get('funding').toLowerCase();
      const funding = /own|their|self ?funded/.test(f) ? 'own' : /main|self|mine|my a/.test(f) ? 'self' : 'sent';
      out.push({
        ipo, symbol: ticker(get('symbol')), person, category: get('category') || 'Retail',
        lots: num(get('lots')), amount: num(get('amount')), funding, outcome, shares: num(get('shares')),
        sellPrice: num(get('sellPrice')), sellDate: date(get('sellDate')), charges: num(get('charges')),
        loanAmount: num(get('loanAmount')), loanInterest: num(get('loanInterest')), settled: yes(get('settled')),
        issuePrice: num(get('issuePrice')), lotSize: num(get('lotSize')), listingDate: date(get('listingDate')), notes: get('notes')
      });
    });
    return { format: 'ipo', rows: out, skipped };
  }

  const FORMAT_LABEL = {
    'ipo': 'IPO applications',
    'companies': 'Company list', 'zerodha-tradebook': 'Zerodha Console tradebook',
    'trades': 'Trades (template format)', 'holdings': 'Holdings snapshot (e.g. Kite holdings export)'
  };

  const TEMPLATES = {
    companies: () => toCSV(['name', 'ticker', 'exchange', 'sector', 'description', 'status', 'current_price'],
      [['Acme Industries', 'ACME', 'NSE', 'Industrials', 'Precision components', 'watch', '1024.50']]),
    trades: () => toCSV(['date', 'ticker', 'exchange', 'type', 'quantity', 'price', 'fees', 'notes'],
      [['2026-04-15', 'ACME', 'NSE', 'buy', '50', '980', '25', 'First tranche'],
       ['2026-08-02', 'ACME', 'NSE', 'sell', '10', '1120', '12', 'Trimmed']]),
    ipo: () => toCSV(['ipo', 'issue_price', 'lot_size', 'listing_date', 'person', 'category', 'lots', 'amount', 'funding', 'allotted',
      'shares', 'sell_price', 'sell_date', 'charges', 'loan_amount', 'loan_interest', 'settled', 'notes'],
      [['Acme Tech IPO', '320', '46', '2026-07-15', 'Ravi', 'Retail', '1', '14720', 'sent', 'yes', '46', '402', '2026-07-15', '20', '', '', 'no', ''],
       ['Acme Tech IPO', '320', '46', '2026-07-15', 'Meena', 'Retail', '1', '14720', 'sent', 'no', '', '', '', '', '', '', 'yes', ''],
       ['Acme Tech IPO', '320', '46', '2026-07-15', 'Me', 'S-HNI', '14', '206080', 'main', 'no', '', '', '', '', '200000', '350', '', 'Loan for 3 days']])
  };

  /* ---------- the Import dialog ---------- */
  let dlg = null;
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement('div');
    dlg.className = 'modal';
    dlg.id = 'importModal';
    dlg.hidden = true;
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'importTitle');
    dlg.innerHTML = `<div class="modal__backdrop" data-close></div><div class="modal__dialog modal__dialog--wide" id="importBody"></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlg.hidden) close(); });
    return dlg;
  }
  function close() { if (dlg) { dlg.hidden = true; document.body.classList.remove('menu-open'); } }

  /* opts: { kind: 'companies'|'trades', title, target (text), onImport(parsed, extra) → summary text } */
  function openImport(opts) {
    ensureDialog();
    const body = dlg.querySelector('#importBody');
    let parsed = null, fileText = '';
    const isTrades = opts.kind === 'trades';
    const isIpo = opts.kind === 'ipo';
    const render = () => {
      const preview = parsed && parsed.rows ? parsed.rows.slice(0, 8) : [];
      body.innerHTML = `
        <header class="modal__head">
          <div><p class="act__kicker">Import</p><h2 class="modal__title" id="importTitle">${esc(opts.title)}</h2></div>
          <button class="modal__close" type="button" data-close aria-label="Close dialog">&times;</button>
        </header>
        <div class="imp">
          <p class="imp__lede">${isIpo
            ? 'Choose a CSV file with one application per line (for example your IPO sheet from Excel, saved as CSV). IPOs, people and categories that don\'t exist yet are created. An application already recorded for the same IPO, person and category is updated, not duplicated.'
            : isTrades
            ? 'Choose a CSV file: a <strong>Zerodha Console tradebook</strong>, a <strong>Kite holdings export</strong>, or the trades template. Excel files: use “Save as CSV” first.'
            : 'Choose a CSV file with one company per line. Companies already in your workspace are matched by ticker and not duplicated.'}
            ${opts.target ? `<br>Adding to: <strong>${esc(opts.target)}</strong>.` : ''}</p>
          <div class="imp__row">
            <label class="btn btn--sm imp__file"><input type="file" accept=".csv,.txt,text/csv" id="impFile" hidden><span>Choose CSV file</span></label>
            <button class="text-btn" type="button" id="impTemplate">Download template</button>
          </div>
          ${isTrades ? `<div class="nb-field imp__asof"><label class="nb-label" for="impAsOf">Date for holdings snapshots</label>
            <input class="nb-input" type="date" id="impAsOf" value="${esc(DataLayer.util.today())}">
            <p class="nb-hint">Used only for holdings files, which have no trade dates. Each holding is recorded as one buy at its average cost.</p></div>` : ''}
          ${parsed && parsed.error ? `<p class="imp__error" role="alert">${esc(parsed.error)}</p>` : ''}
          ${parsed && parsed.rows ? `
            <p class="imp__found"><span class="tag">${esc(FORMAT_LABEL[parsed.format] || parsed.format)}</span>
              ${parsed.rows.length} line${parsed.rows.length === 1 ? '' : 's'} ready${parsed.skipped && parsed.skipped.length ? ` · ${parsed.skipped.length} skipped` : ''}</p>
            <div class="imp__table"><table>
              <thead><tr>${isIpo ? '<th>IPO</th><th>Person</th><th>Category</th><th>Money</th><th>Allotted</th>' : isTrades ? '<th>Date</th><th>Symbol</th><th>Type</th><th>Qty</th><th>Price</th>' : '<th>Name</th><th>Ticker</th><th>Exchange</th><th>Sector</th><th>Status</th>'}</tr></thead>
              <tbody>${preview.map(r => isIpo
                ? `<tr><td>${esc(r.ipo)}</td><td>${esc(r.person)}</td><td>${esc(r.category)}</td><td>${esc(r.funding)}</td><td>${esc(r.outcome.replace('_', ' '))}</td></tr>`
                : isTrades
                ? `<tr><td>${esc(r.tradeDate || '')}</td><td>${esc(r.ticker)}</td><td>${esc(r.type)}</td><td>${esc(r.quantity)}</td><td>${esc(r.price)}</td></tr>`
                : `<tr><td>${esc(r.name)}</td><td>${esc(r.ticker)}</td><td>${esc(r.exchange)}</td><td>${esc(r.sector)}</td><td>${esc(r.researchStatus)}</td></tr>`).join('')}</tbody>
            </table></div>
            ${parsed.rows.length > preview.length ? `<p class="nb-hint">…and ${parsed.rows.length - preview.length} more.</p>` : ''}
            ${parsed.skipped && parsed.skipped.length ? `<p class="nb-hint">Skipped lines: ${parsed.skipped.slice(0, 6).map(s => `${s.line} (${esc(s.reason)})`).join(', ')}${parsed.skipped.length > 6 ? '…' : ''}</p>` : ''}` : ''}
          <p class="imp__result" id="impResult" role="status"></p>
        </div>
        <div class="modal__foot">
          <p class="modal__hint">${isTrades ? 'Trades already imported (same broker trade id) are skipped.' : 'Nothing is deleted by an import.'}</p>
          <div class="modal__actions">
            <button type="button" class="btn btn--sm" data-close>Close</button>
            <button type="button" class="btn btn--solid btn--sm" id="impGo"${parsed && parsed.rows && parsed.rows.length ? '' : ' disabled'}>Import</button>
          </div>
        </div>`;
      body.querySelector('#impFile').addEventListener('change', async e => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 10 * 1024 * 1024) { parsed = { error: 'That file is larger than 10 MB.' }; render(); return; }
        if (/\.xlsx?$/i.test(f.name)) { parsed = { error: 'This is an Excel file. Open it in Excel or Google Sheets and use “Save as / Download as CSV”, then choose the CSV here.' }; render(); return; }
        fileText = await f.text();
        reparse();
      });
      const asOf = body.querySelector('#impAsOf');
      if (asOf) asOf.addEventListener('change', () => { if (fileText) reparse(); });
      body.querySelector('#impTemplate').addEventListener('click', () =>
        download(isIpo ? 'run-ipo-template.csv' : isTrades ? 'run-trades-template.csv' : 'run-companies-template.csv', TEMPLATES[isIpo ? 'ipo' : isTrades ? 'trades' : 'companies']()));
      const go = body.querySelector('#impGo');
      go.addEventListener('click', () => UI.busy(go, async () => {
        const res = body.querySelector('#impResult');
        try {
          const summary = await opts.onImport(parsed);
          res.textContent = summary;
          res.className = 'imp__result is-ok';
          go.disabled = true;
        } catch (err) { res.textContent = err.message; res.className = 'imp__result is-error'; }
      }, 'Importing…'));
    };
    const reparse = () => {
      const asOf = body.querySelector('#impAsOf');
      parsed = isIpo ? readIpoApps(fileText) : isTrades ? readTrades(fileText, { asOf: asOf ? asOf.value || DataLayer.util.today() : DataLayer.util.today() }) : readCompanies(fileText);
      render();
    };
    render();
    dlg.hidden = false;
    document.body.classList.add('menu-open');
  }

  return { parseCSV, toCSV, download, readCompanies, readTrades, readIpoApps, ticker, date, num, TEMPLATES, openImport, closeImport: close };
})();
