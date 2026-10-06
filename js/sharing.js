/* Read-only guest portal and owner-controlled published snapshots.
   Supabase RLS enforces access even if a visitor changes the page code. */
const Sharing = (() => {
  let generation = 0;
  const root = () => document.getElementById('sharingRoot');
  const field = (label, name, value = '', type = 'text') => `<label class="nb-field"><span class="nb-label">${esc(label)}</span><input class="nb-input" type="${type}" name="${name}" value="${esc(value)}"></label>`;
  const check = (name, label, on) => `<label class="pick"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  const opts = rows => rows.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  let refreshTimer = null;
  const stop = () => { generation++; clearTimeout(refreshTimer); refreshTimer = null; if (root()) root().replaceChildren(); };

  async function render() {
    const ticket = ++generation;
    clearTimeout(refreshTimer);
    const el = root();
    el.textContent = 'Loading shared research…';
    try {
      if (DataLayer.access.role() === 'error') throw new Error(DataLayer.access.error());
      if (!DataLayer.isSupabase()) { el.textContent = 'Guest access requires the connected workspace.'; return; }
      const owner = DataLayer.access.role() === 'owner';
      const data = owner ? await DataLayer.sharing.manage() : await DataLayer.sharing.read();
      if (ticket !== generation) return;
      if (owner) renderOwner(el, data); else renderGuest(el, data);
    } catch (err) {
      if (ticket === generation) { el.replaceChildren(); const p = document.createElement('p'); p.className = 'empty__text'; p.textContent = err.message; el.append(p); }
    }
  }

  function renderGuest(el, d) {
    el.innerHTML = `<header class="view__head"><p class="act__kicker">Guest access · Read only</p><h1 class="view__title">Shared research.</h1><p class="view__lede">Only the companies and research shared with your account appear here.</p></header>
      <button class="btn btn--sm" type="button" data-refresh>Refresh</button>
      ${!d.companies.length && !d.research.length ? '<p class="empty__text">Nothing is shared with this account right now. Access may not have been enabled, or may have expired.</p>' : ''}
      ${d.companies.length ? `<section class="desk-sec"><h2 class="desk-sec__title">Watchlist companies</h2><div class="guest-companies">${d.companies.map(c => `<article class="guest-card"><h3>${esc(c.name)}</h3><p>${esc([c.ticker,c.sector].filter(Boolean).join(' · '))}</p><p>${esc(RUN.label('RESEARCH_STATUS',c.researchStatus))}</p></article>`).join('')}</div></section>` : ''}
      ${d.research.length ? `<section class="desk-sec"><h2 class="desk-sec__title">Research</h2>${d.research.map(r => `<details class="guest-card"><summary>${esc(r.title)}</summary><p class="nb-hint">Updated ${esc(fmtDate(r.updatedAt))}</p><div class="shared-research-text">${esc(r.body)}</div></details>`).join('')}</section>` : ''}`;
    el.querySelector('[data-refresh]').onclick = render;
    // Remove revoked content on refresh. A reader can still retain what they read.
    refreshTimer = setTimeout(() => { if (!el.closest('.view').hidden) render(); }, 60000);
  }

  function renderOwner(el, d) {
    const companyOptions = opts(d.originals);
    el.innerHTML = `<header class="view__head"><p class="act__kicker">Owner controls</p><h1 class="view__title">Guest access.</h1><p class="view__lede">Publish only what you want to share. Every guest has their own login and permissions. Your portfolio, IPOs and private workspace stay private.</p></header>
      <section class="desk-sec"><h2 class="desk-sec__title">1. Add a guest</h2><p class="nb-hint">First create their individual account in Supabase Authentication → Users. Then add that email below. This does not send an invitation. New guests start with both permissions off.</p>
      <form class="sharing-form" data-share-form="guest">${field('Guest email','email','','email')}${field('Name for your reference','label')}<button class="btn btn--solid btn--sm" type="submit">Add guest</button></form>
      ${d.guests.map(g => `<form class="guest-card sharing-form" data-share-form="permissions" data-id="${esc(g.id)}"><h3>${esc(g.label || 'Guest')}</h3><div class="sharing-checks">${check('active','Access enabled',g.active)}${check('canWatchlist','Watchlist companies',g.canWatchlist)}${check('canResearch','Research',g.canResearch)}</div>${field('Expires at (your local time; blank = no expiry)','expiresAt',localDatetime(g.expiresAt),'datetime-local')}<div class="nb-actions"><button class="btn btn--sm" type="submit">Save permissions</button><button class="text-btn text-btn--danger" type="button" data-revoke="${esc(g.id)}">Remove access</button></div></form>`).join('') || '<p class="desk-empty">No guests added yet.</p>'}</section>
      <section class="desk-sec"><h2 class="desk-sec__title">2. Share watchlist companies</h2><p class="nb-hint">Guests with watchlist permission see the published name, ticker, sector and research status. Publishing copies the current details; use Update snapshot after changing them. All enabled guests see the same published collection.</p>
      <form class="sharing-form" data-share-form="company"><label class="nb-field"><span class="nb-label">Company</span><select class="nb-input" name="companyId" required><option value="">Choose a company</option>${companyOptions}</select></label><button class="btn btn--solid btn--sm" type="submit">Publish company</button></form>
      ${d.companies.map(c => `<div class="guest-card"><h3>${esc(c.name)}</h3><p>${esc(c.ticker)} · ${esc(c.sector)} · ${esc(RUN.label('RESEARCH_STATUS',c.researchStatus))}</p><div class="nb-actions"><button class="text-btn" type="button" data-update="${esc(c.companyId)}">Update snapshot</button><button class="text-btn text-btn--danger" type="button" data-unpublish="${esc(c.id)}" data-kind="company">Unpublish company</button></div></div>`).join('')}</section>
      <section class="desk-sec"><h2 class="desk-sec__title">3. Share research</h2><p class="nb-hint">Write or paste the text you want guests to read. Nothing from your private thesis, documents, decisions or portfolio is copied automatically. Review the text before publishing. Editing private research does not change this shared copy.</p>
      <form class="sharing-form" data-share-form="research"><label class="nb-field"><span class="nb-label">Company</span><select class="nb-input" name="companyId" required><option value="">Choose a company</option>${companyOptions}</select></label>${field('Title','title')}<label class="nb-field"><span class="nb-label">Research visible to guests (plain text)</span><textarea class="nb-input nb-text" name="body" rows="12" required maxlength="200000"></textarea></label><button class="btn btn--solid btn--sm" type="submit">Publish research</button></form>
      ${d.research.map(r => `<details class="guest-card"><summary>${esc(r.title)}</summary><form class="sharing-form" data-share-form="research" data-company="${esc(r.companyId)}">${field('Title','title',r.title)}<label class="nb-field"><span class="nb-label">Shared research</span><textarea class="nb-input nb-text" name="body" rows="10" required maxlength="200000">${esc(r.body)}</textarea></label><div class="nb-actions"><button class="btn btn--sm" type="submit">Update shared research</button><button class="text-btn text-btn--danger" type="button" data-unpublish="${esc(r.id)}" data-kind="research">Unpublish research</button></div></form></details>`).join('')}</section>
      <section class="desk-sec"><h2 class="desk-sec__title">Private research documents</h2><p class="nb-hint">Upload an HTML research document to your private archive and link it to a company. This does not share it with guests. HTML is displayed without scripts or external resources for safety.</p><form class="sharing-form" data-share-form="archive"><label class="nb-field"><span class="nb-label">Company</span><select class="nb-input" name="companyId" required><option value="">Choose a company</option>${companyOptions}</select></label><label class="nb-field"><span class="nb-label">Research document</span><input class="nb-input" name="document" type="file" accept=".html,.htm" required></label><button class="btn btn--sm" type="submit">Save private document</button></form></section>
      <p class="nb-hint">Revoking access blocks future reads. It cannot recall text someone already read, copied or saved.</p>`;
    el.onsubmit = async e => {
      const f = e.target.closest('[data-share-form]'); if (!f) return; e.preventDefault();
      const btn = f.querySelector('[type="submit"]');
      await UI.busy(btn, async () => {
        try {
          const v = new FormData(f), kind = f.dataset.shareForm;
          if (kind === 'guest') await DataLayer.sharing.grant(v.get('email'), v.get('label'));
          if (kind === 'permissions') await DataLayer.sharing.permissions(f.dataset.id, { active: v.has('active'), canWatchlist: v.has('canWatchlist'), canResearch: v.has('canResearch'), expiresAt: v.get('expiresAt') });
          if (kind === 'company') await DataLayer.sharing.publishCompany(v.get('companyId'));
          if (kind === 'research') {
            if (!(await UI.confirmInline(btn, 'Publish this text to guests with research permission?'))) return;
            await DataLayer.sharing.publishResearch(f.dataset.company || v.get('companyId'), v.get('title'), v.get('body'));
          }
          if (kind === 'archive') {
            const file = v.get('document');
            if (!/\.html?$/i.test(file.name)) throw new Error('Choose an HTML document.');
            const row = await DataLayer.files.upload(v.get('companyId'), file, { docType: 'notes' });
            await DataLayer.updateCompany(v.get('companyId'), { researchFile: 'private:' + row.id });
          }
          UI.toast('Saved'); await render();
        } catch (err) { UI.error(err); }
      });
    };
    el.onclick = async e => {
      const b = e.target.closest('[data-revoke],[data-unpublish],[data-update]'); if (!b) return;
      try {
        if (b.dataset.update) await UI.busy(b, () => DataLayer.sharing.publishCompany(b.dataset.update));
        else {
          if (!(await UI.confirmInline(b, b.dataset.revoke ? 'Remove this guest’s access?' : 'Remove this from the shared collection?'))) return;
          await UI.busy(b, () => b.dataset.revoke ? DataLayer.sharing.revoke(b.dataset.revoke) : DataLayer.sharing.unpublish(b.dataset.kind,b.dataset.unpublish));
        }
        UI.toast('Saved'); await render();
      } catch (err) { UI.error(err); }
    };
  }
  function localDatetime(value) {
    if (!value) return '';
    const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
  return { render, stop };
})();
