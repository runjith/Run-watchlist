/* ============================================================
   RUN WATCHLIST — js/portfolio.js
   Pure portfolio arithmetic. No storage, no screens.

   Method: average cost (what Indian brokers show as "Avg. cost").
     · A buy adds  quantity × price + charges  to the cost.
     · A sell removes  quantity × average cost  from the cost;
       realised P&L = sell value − charges − that cost.
   Allocation:
     · invested allocation = a holding's cost ÷ total cost
     · present allocation  = a holding's value ÷ total value
       (and ÷ value + cash, when a cash balance is entered)
   Nothing here recommends anything. It only does arithmetic.
   ============================================================ */

const Portfolio = (() => {

  const n = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
  const round = (v, d = 2) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;

  /* Walk a company's trades in date order. */
  function position(trades) {
    const list = trades.slice().sort((a, b) =>
      String(a.tradeDate).localeCompare(String(b.tradeDate)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    let qty = 0, cost = 0, realised = 0, fees = 0, oversold = 0;
    let firstDate = null, lastDate = null, bought = 0, sold = 0;
    const flows = [];
    for (const t of list) {
      const q = n(t.quantity) || 0, p = n(t.price) || 0, f = n(t.fees) || 0;
      if (q <= 0) continue;
      fees += f;
      if (t.type === 'buy') {
        if (qty <= 1e-9) firstDate = t.tradeDate;   // a new holding period starts
        qty += q; cost += q * p + f; bought += q;
        flows.push({ date: t.tradeDate, amount: -(q * p + f) });
      } else {
        const q2 = Math.min(q, qty);
        if (q > qty + 1e-9) oversold += q - qty;
        const avg = qty > 0 ? cost / qty : 0;
        realised += q2 * p - f * (q ? q2 / q : 0) - q2 * avg;
        cost -= q2 * avg; qty -= q2; sold += q2;
        flows.push({ date: t.tradeDate, amount: q2 * p - f * (q ? q2 / q : 0) });
        if (qty <= 1e-9) { qty = 0; cost = 0; }
      }
      lastDate = t.tradeDate;
    }
    return { qty, cost, avg: qty > 0 ? cost / qty : null, realised, fees, oversold, firstDate, lastDate, bought, sold, flows, trades: list.length };
  }

  /* Annualised return from dated cash flows (money out negative). */
  function xirr(flows) {
    const f = flows.filter(x => x.amount && x.date).map(x => ({ t: new Date(String(x.date).slice(0, 10) + 'T00:00:00').getTime(), a: x.amount }))
      .sort((a, b) => a.t - b.t);
    if (f.length < 2 || !f.some(x => x.a < 0) || !f.some(x => x.a > 0)) return null;
    const t0 = f[0].t;
    const years = x => (x.t - t0) / (365 * 86400000);
    if (years(f[f.length - 1]) < 1 / 365) return null;
    const npv = r => f.reduce((s, x) => s + x.a / Math.pow(1 + r, years(x)), 0);
    const dnpv = r => f.reduce((s, x) => s - years(x) * x.a / Math.pow(1 + r, years(x) + 1), 0);
    let r = 0.1;
    for (let i = 0; i < 60; i++) {
      const v = npv(r), d = dnpv(r);
      if (!isFinite(v) || !isFinite(d) || d === 0) break;
      const next = r - v / d;
      if (!isFinite(next) || next <= -0.9999) break;
      if (Math.abs(next - r) < 1e-9) return next;
      r = next;
    }
    // Fallback: bisection between −99.99% and +10,000%.
    let lo = -0.9999, hi = 100, vlo = npv(lo), vhi = npv(hi);
    if (!isFinite(vlo) || !isFinite(vhi) || vlo * vhi > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, vm = npv(mid);
      if (Math.abs(vm) < 1e-7) return mid;
      if (vlo * vm < 0) { hi = mid; vhi = vm; } else { lo = mid; vlo = vm; }
    }
    return (lo + hi) / 2;
  }

  /* Everything the Portfolio page shows.
     companies:   overview objects ({id, name, ticker, sector, currentPrice, valuation, ...})
     transactions: [{companyId, tradeDate, type, quantity, price, fees}]
     decisions:    latest first [{companyId, maxAllocationPct, positionSizePct}]
     cash:         number | null  */
  function compute({ companies, transactions, decisions = [], cash = null, today }) {
    const byCo = {};
    for (const t of transactions) (byCo[t.companyId] = byCo[t.companyId] || []).push(t);
    const latestDecision = {};
    for (const d of decisions) if (!latestDecision[d.companyId]) latestDecision[d.companyId] = d;
    const coById = Object.fromEntries(companies.map(c => [c.id, c]));

    const rows = [], closed = [], allFlows = [];
    let invested = 0, value = 0, realised = 0, fees = 0, missingPrices = 0;

    for (const [companyId, trades] of Object.entries(byCo)) {
      const company = coById[companyId];
      if (!company) continue;
      const p = position(trades);
      realised += p.realised; fees += p.fees;
      allFlows.push(...p.flows);
      if (p.qty <= 1e-9) {
        closed.push({ company, realised: p.realised, bought: p.bought, sold: p.sold, lastDate: p.lastDate, trades: p.trades });
        continue;
      }
      const price = n(company.currentPrice);
      const usePrice = price != null ? price : p.avg;
      if (price == null) missingPrices++;
      const val = p.qty * usePrice;
      invested += p.cost; value += val;
      const v = company.valuation || {};
      const stop = n(v.stopLoss) ?? n(v.invalidationPrice);
      const target = n(v.baseTarget);
      const dec = latestDecision[companyId] || {};
      rows.push({
        company, qty: p.qty, avg: p.avg, invested: p.cost, price, priceMissing: price == null, value: val,
        pnl: val - p.cost, pnlPct: p.cost ? (val - p.cost) / p.cost * 100 : null,
        realised: p.realised, firstDate: p.firstDate,
        holdingDays: p.firstDate && today ? Math.max(0, Math.round((new Date(today + 'T00:00:00') - new Date(p.firstDate + 'T00:00:00')) / 86400000)) : null,
        stop, belowStop: stop != null && usePrice <= stop,
        riskToStop: stop != null && usePrice > stop ? p.qty * (usePrice - stop) : 0,
        target, upside: target != null && usePrice ? (target - usePrice) / usePrice * 100 : null,
        maxAlloc: n(dec.maxAllocationPct), plannedAlloc: n(dec.positionSizePct),
        oversold: p.oversold,
        xirr: xirr([...p.flows, { date: today, amount: val }])
      });
    }

    const cashN = n(cash);
    const total = value + (cashN || 0);
    for (const r of rows) {
      r.investedAlloc = invested ? r.invested / invested * 100 : 0;
      r.presentAlloc = value ? r.value / value * 100 : 0;
      r.portfolioAlloc = total ? r.value / total * 100 : 0;          // includes cash when entered
      r.overMax = r.maxAlloc != null && r.portfolioAlloc > r.maxAlloc + 1e-9;
      r.allocDrift = r.presentAlloc - r.investedAlloc;
    }
    rows.sort((a, b) => b.value - a.value);

    const sectors = {};
    for (const r of rows) {
      const s = r.company.sector || 'Uncategorised';
      const x = sectors[s] = sectors[s] || { sector: s, invested: 0, value: 0, count: 0 };
      x.invested += r.invested; x.value += r.value; x.count++;
    }
    const sectorList = Object.values(sectors).map(s => ({
      ...s, investedAlloc: invested ? s.invested / invested * 100 : 0, presentAlloc: value ? s.value / value * 100 : 0
    })).sort((a, b) => b.value - a.value);

    const withTarget = rows.filter(r => r.upside != null);
    const risk = rows.reduce((s, r) => s + r.riskToStop, 0);
    return {
      rows, closed: closed.sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate))), sectors: sectorList,
      totals: {
        invested, value, pnl: value - invested, pnlPct: invested ? (value - invested) / invested * 100 : null,
        realised, fees, cash: cashN, total,
        cashAlloc: cashN && total ? cashN / total * 100 : null,
        holdings: rows.length, missingPrices,
        largest: rows[0] ? { company: rows[0].company, pct: rows[0].portfolioAlloc } : null,
        top5: rows.slice(0, 5).reduce((s, r) => s + r.portfolioAlloc, 0),
        riskToStop: risk, riskPct: total ? risk / total * 100 : null,
        withoutStop: rows.filter(r => r.stop == null).length,
        weightedUpside: withTarget.length ? withTarget.reduce((s, r) => s + r.value * r.upside, 0) / withTarget.reduce((s, r) => s + r.value, 0) : null,
        overMax: rows.filter(r => r.overMax).length,
        xirr: xirr([...allFlows, { date: today, amount: value }])
      }
    };
  }

  return { position, xirr, compute, round };
})();
