/* ============================================================
   RUN WATCHLIST — js/ui.js
   Shared helpers used by every view: escaping, dates, money,
   percentages, small notices and inline confirmations.
   ============================================================ */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const fmtDate = s => {
  if (!s) return '';
  const d = new Date(String(s).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtShortDate = s => {
  if (!s) return '';
  const d = new Date(String(s).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return s;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', sameYear ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' });
};

const relativeDays = s => {
  if (!s) return '';
  const then = new Date(String(s).slice(0, 10) + 'T00:00:00').getTime();
  if (isNaN(then)) return '';
  const days = Math.round((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return days + ' days ago';
  if (days < 365) return Math.round(days / 30) + ' mo ago';
  return Math.round(days / 365) + ' yr ago';
};

const UI = {
  money: (v, cur) => RUN.money(v, cur),

  num(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).replace(/[,\s₹$€£%]/g, '');
    if (s === '' || isNaN(Number(s))) return null;
    return Number(s);
  },

  /* +18.4% / −6.2% (true minus sign) */
  pct(v, digits = 1) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    const r = Number(v).toFixed(digits);
    if (Number(r) === 0) return '0.' + '0'.repeat(digits) + '%';
    return (v > 0 ? '+' : '−') + Math.abs(Number(r)).toFixed(digits) + '%';
  },

  /* Percentage move from `from` to `to`. */
  move(from, to) {
    const a = UI.num(from), b = UI.num(to);
    if (a === null || b === null || a === 0) return null;
    return (b - a) / a * 100;
  },

  /* "in 5 days" / "today" / "3 days overdue" */
  until(dateStr) {
    if (!dateStr) return '';
    const n = DataLayer.util.daysBetween(DataLayer.util.today(), String(dateStr).slice(0, 10));
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n > 1) return `in ${n} days`;
    if (n === -1) return '1 day overdue';
    return `${Math.abs(n)} days overdue`;
  },
  isOverdue(dateStr) { return !!dateStr && String(dateStr).slice(0, 10) < DataLayer.util.today(); },

  bytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    const gb = n / 1024 / 1024 / 1024;
    return (Number.isInteger(gb) ? gb : gb.toFixed(2)) + ' GB';
  },

  two: n => String(n).padStart(2, '0'),

  options(listName, selected, { blank = null } = {}) {
    const list = RUN[listName] || [];
    return (blank !== null ? `<option value="">${esc(blank)}</option>` : '') +
      list.map(o => `<option value="${esc(o.value)}"${String(o.value) === String(selected ?? '') ? ' selected' : ''}>${esc(o.label || o.value)}</option>`).join('');
  },

  /* Grow a textarea with its content. */
  autosize(el) {
    if (!el) return;
    const fit = () => { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight + 2, 0) + 'px'; };
    if (!el.dataset.autosize) {
      el.dataset.autosize = '1';
      el.addEventListener('input', fit);
    }
    requestAnimationFrame(fit);
  },
  autosizeAll(root) { (root || document).querySelectorAll('textarea.nb-text').forEach(UI.autosize); },

  /* Quiet notice at the bottom of the screen. */
  toast(message, kind = 'ok') {
    let host = document.getElementById('toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toasts';
      host.className = 'toasts';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'toast toast--' + kind;
    t.textContent = message;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('is-in'));
    setTimeout(() => { t.classList.remove('is-in'); setTimeout(() => t.remove(), 400); }, kind === 'error' ? 6000 : 2600);
  },

  error(err) {
    console.error(err);
    UI.toast((err && err.message) || 'Something went wrong.', 'error');
  },

  /* Two-step confirm inside the button itself — no pop-up dialogs. */
  confirmInline(btn, question = 'Sure?') {
    return new Promise(resolve => {
      if (btn.dataset.confirming) return resolve(false);
      const original = btn.innerHTML;
      btn.dataset.confirming = '1';
      const wrap = document.createElement('span');
      wrap.className = 'confirm';
      wrap.innerHTML = `<span class="confirm__q">${esc(question)}</span>
        <button type="button" class="confirm__yes">Yes</button>
        <button type="button" class="confirm__no">No</button>`;
      btn.style.display = 'none';
      btn.after(wrap);
      const finish = ok => {
        wrap.remove();
        btn.style.display = '';
        btn.innerHTML = original;
        delete btn.dataset.confirming;
        resolve(ok);
      };
      wrap.querySelector('.confirm__yes').addEventListener('click', e => { e.stopPropagation(); finish(true); });
      wrap.querySelector('.confirm__no').addEventListener('click', e => { e.stopPropagation(); finish(false); });
      wrap.querySelector('.confirm__no').focus();
    });
  },

  /* Disable a button while an async action runs. */
  async busy(btn, fn, label = 'Saving…') {
    if (!btn) return fn();
    if (btn.disabled) return;
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-busy');
    if (label) btn.textContent = label;
    try { return await fn(); }
    finally { btn.disabled = false; btn.classList.remove('is-busy'); btn.innerHTML = html; }
  },

  /* Read the values of every [data-f] field inside a form-ish element. */
  read(root) {
    const out = {};
    root.querySelectorAll('[data-f]').forEach(el => {
      const k = el.dataset.f;
      if (el.type === 'checkbox') out[k] = el.checked;
      else out[k] = el.value;
    });
    return out;
  },

  /* A research-progress bar in the RUN style. */
  bar(pct, cls = '') {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    return `<span class="bar ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><span style="width:${p}%"></span></span>`;
  },

  statusLabel: s => RUN.label('RESEARCH_STATUS', s, 'Watching'),
  decisionLabel: d => d ? RUN.label('DECISIONS', d) : 'No decision'
};
