/* ============================================================
   RUN WATCHLIST — js/ipo.js
   IPO tracker arithmetic. No storage, no screens.

   For one application:
     amount          = amount applied / blocked (defaults to lots × lot size × issue price)
     allotted value  = shares allotted × issue price
     listing gain    = shares × (sell price − issue price)      (once sold)
     net P&L         = listing gain − charges − loan interest   (sold)
                     = − charges − loan interest                (not allotted / cancelled)
     due back        (only when you sent the money and it is not settled)
                     = amount                                   (not allotted / cancelled)
                     = amount + listing gain − charges          (sold)
                     = amount − allotted value, plus the shares (allotted, not sold yet)
   "My P&L" counts applications made with your money
   (money you sent, or your main account).
   ============================================================ */

const IPO = (() => {
  const n = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);

  const FUNDING = [
    { value: 'sent', label: 'I sent money', short: 'Sent' },
    { value: 'self', label: 'My main account', short: 'Main a/c' },
    { value: 'own', label: 'Their own money', short: 'Own' }
  ];
  const OUTCOMES = [
    { value: 'pending', label: 'Pending' },
    { value: 'allotted', label: 'Allotted' },
    { value: 'not_allotted', label: 'Not allotted' },
    { value: 'cancelled', label: 'Cancelled' }
  ];
  const DEFAULT_CATEGORIES = ['Retail', 'S-HNI', 'B-HNI', 'Shareholder', 'Employee'];

  function amountOf(app, ipo) {
    const a = n(app.amount);
    if (a != null) return a;
    const p = n(ipo && ipo.issuePrice), lot = n(ipo && ipo.lotSize);
    return p != null && lot != null ? (n(app.lots) || 1) * lot * p : null;
  }

  function calc(app, ipo) {
    const price = n(ipo && ipo.issuePrice);
    const amount = amountOf(app, ipo);
    const allotted = app.outcome === 'allotted';
    const shares = allotted ? (n(app.sharesAllotted) ?? (n(ipo && ipo.lotSize) || 0)) : 0;
    const allottedValue = allotted && price != null ? shares * price : 0;
    const sellPrice = n(app.sellPrice);
    const sold = allotted && sellPrice != null;
    const charges = n(app.charges) || 0, interest = n(app.loanInterest) || 0;
    const costs = charges + interest;
    const gain = sold && price != null ? shares * (sellPrice - price) : null;
    const listing = n(ipo && ipo.listingPrice);
    const unrealised = allotted && !sold && listing != null && price != null ? shares * (listing - price) : null;
    let net = null;
    if (app.outcome === 'not_allotted' || app.outcome === 'cancelled') net = -costs;
    else if (sold) net = gain - costs;
    const mine = app.funding !== 'own';

    let dueBack = null, dueNote = '';
    if (app.funding === 'sent' && !app.settled) {
      if (app.outcome === 'pending') { dueNote = 'Waiting for allotment'; }
      else if (app.outcome === 'not_allotted' || app.outcome === 'cancelled') { dueBack = amount; dueNote = 'Refund of the money you sent'; }
      else if (sold) { dueBack = amount != null ? amount + gain - charges : null; dueNote = 'Money sent + sale gain − charges'; }
      else if (allotted) { dueBack = amount != null ? amount - allottedValue : null; dueNote = `Refund now, plus ${shares} shares still to sell`; }
    }
    const state = app.outcome === 'pending' ? 'pending'
      : app.outcome === 'allotted' ? (sold ? 'sold' : 'holding')
      : app.outcome;
    return { amount, shares, allottedValue, sold, gain, unrealised, charges, interest, costs, net, mine, dueBack, dueNote, state };
  }

  /* Date an IPO belongs to, for period filters. */
  const dateOf = ipo => ipo.listingDate || ipo.allotmentDate || ipo.closeDate || ipo.openDate || (ipo.createdAt ? String(ipo.createdAt).slice(0, 10) : null);

  function periods(today) {
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
    const fyStart = m >= 4 ? y : y - 1;
    const fy = s => `FY ${s}–${String((s + 1) % 100).padStart(2, '0')}`;
    return [
      { value: 'fy', label: `This FY (${fy(fyStart)})`, from: `${fyStart}-04-01`, to: `${fyStart + 1}-03-31` },
      { value: 'lastfy', label: `Last FY (${fy(fyStart - 1)})`, from: `${fyStart - 1}-04-01`, to: `${fyStart}-03-31` },
      { value: 'year', label: `${y}`, from: `${y}-01-01`, to: `${y}-12-31` },
      { value: 'all', label: 'All time', from: null, to: null }
    ];
  }
  const inPeriod = (ipo, p) => {
    if (!p || (!p.from && !p.to)) return true;
    const d = dateOf(ipo);
    if (!d) return false;
    return (!p.from || d >= p.from) && (!p.to || d <= p.to);
  };

  function blank() {
    return { applications: 0, decided: 0, allotted: 0, pending: 0, amount: 0, allottedValue: 0, gain: 0, charges: 0, interest: 0,
      net: 0, netAll: 0, unrealised: 0, dueBack: 0, dueCount: 0, unsettled: 0, sold: 0, holding: 0 };
  }
  function add(t, c, app) {
    t.applications++;
    if (app.outcome !== 'pending') t.decided++; else t.pending++;
    if (app.outcome === 'allotted') t.allotted++;
    if (c.state === 'sold') t.sold++;
    if (c.state === 'holding') t.holding++;
    t.amount += c.amount || 0;
    t.allottedValue += c.allottedValue;
    if (c.gain != null && c.mine) t.gain += c.gain;
    if (c.mine) { t.charges += c.charges; t.interest += c.interest; }
    if (c.net != null) { t.netAll += c.net; if (c.mine) t.net += c.net; }
    if (c.unrealised != null && c.mine) t.unrealised += c.unrealised;
    if (c.dueBack != null) { t.dueBack += c.dueBack; t.dueCount++; }
    if (app.funding === 'sent' && !app.settled) t.unsettled++;
  }
  const rate = t => t.decided ? t.allotted / t.decided * 100 : null;

  /* Everything the IPO pages need, for one period. */
  function summarise({ ipos, apps, persons, period }) {
    const ipoById = Object.fromEntries(ipos.map(i => [i.id, i]));
    const personById = Object.fromEntries(persons.map(p => [p.id, p]));
    const rows = apps.map(a => ({ app: a, ipo: ipoById[a.ipoId], person: personById[a.personId] })).filter(r => r.ipo && r.person)
      .map(r => ({ ...r, c: calc(r.app, r.ipo) }));
    const visibleIpos = ipos.filter(i => inPeriod(i, period));
    const vis = new Set(visibleIpos.map(i => i.id));
    const inRange = rows.filter(r => vis.has(r.ipo.id));

    const totals = blank();
    inRange.forEach(r => add(totals, r.c, r.app));
    totals.rate = rate(totals);
    totals.ipos = visibleIpos.filter(i => inRange.some(r => r.ipo.id === i.id)).length;

    const perIpo = visibleIpos.map(i => {
      const t = blank();
      inRange.filter(r => r.ipo.id === i.id).forEach(r => add(t, r.c, r.app));
      t.rate = rate(t);
      return { ipo: i, t };
    }).sort((a, b) => String(dateOf(b.ipo) || '').localeCompare(String(dateOf(a.ipo) || '')));

    const perPerson = persons.map(p => {
      const t = blank();
      inRange.filter(r => r.person.id === p.id).forEach(r => add(t, r.c, r.app));
      t.rate = rate(t);
      return { person: p, t };
    });

    const perCategory = {};
    inRange.forEach(r => {
      const t = perCategory[r.app.category] = perCategory[r.app.category] || blank();
      add(t, r.c, r.app);
    });
    Object.values(perCategory).forEach(t => { t.rate = rate(t); });

    // Money to collect is shown for every period (it is still owed).
    const toCollect = rows.filter(r => r.app.funding === 'sent' && !r.app.settled && r.app.outcome !== 'pending')
      .sort((a, b) => String(dateOf(a.ipo) || '').localeCompare(String(dateOf(b.ipo) || '')));
    const waiting = rows.filter(r => r.app.funding === 'sent' && !r.app.settled && r.app.outcome === 'pending');

    return { totals, perIpo, perPerson, perCategory, toCollect, waiting, rows };
  }

  function ipoSummary(ipo, apps) {
    const t = blank();
    const rows = apps.map(a => ({ app: a, c: calc(a, ipo) }));
    rows.forEach(r => add(t, r.c, r.app));
    t.rate = rate(t);
    return { t, rows };
  }

  return { FUNDING, OUTCOMES, DEFAULT_CATEGORIES, calc, amountOf, summarise, ipoSummary, periods, dateOf, inPeriod };
})();
