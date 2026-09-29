/* ============================================================
   RUN WATCHLIST — js/desk.js
   The global views that surface work across all companies:
     · Home "Now" section (a short summary under the hero)
     · Desk page  #/desk  — Reviews due, Open tasks, Research in
       progress, Completed research, Recent updates.
   It never suggests decisions; it only shows what is pending.
   ============================================================ */

const Desk = (() => {

  let taskFilter = 'all';

  const companyLink = (c, sec) => `<a class="desk-co" href="#/company/${esc(c.slug)}${sec ? '/' + sec : ''}">${esc(c.name)}${c.ticker ? `<span>${esc(c.ticker)}</span>` : ''}</a>`;

  function reviewWhen(r) {
    if (!r.date) return r.catalyst ? 'When catalyst occurs' : 'No date';
    return fmtDate(r.date);
  }
  function reviewNote(r) {
    return [
      r.date ? UI.until(r.date) : null,
      r.catalyst ? `Catalyst: ${r.catalyst.title}${r.catalyst.status === 'occurred' ? ' (occurred)' : ''}` : null,
      r.triggerNote || null
    ].filter(Boolean).join(' · ');
  }

  function reviewRow(r) {
    const overdue = r.date && UI.isOverdue(r.date);
    return `
      <li class="desk-row${overdue ? ' is-signal' : ''}">
        <span class="desk-row__date">${esc(reviewWhen(r))}</span>
        <div class="desk-row__main">
          ${companyLink(r.company, 'review')}
          <p class="desk-row__note">${esc(reviewNote(r))}</p>
        </div>
        <a class="desk-row__go" href="#/company/${esc(r.company.slug)}/review">Review <span aria-hidden="true">→</span></a>
      </li>`;
  }

  function taskRow(t, { showCompany = true } = {}) {
    const overdue = t.dueDate && UI.isOverdue(t.dueDate);
    return `
      <li class="desk-row desk-row--task" data-task="${t.id}" data-company="${t.companyId}">
        <label class="check"><input type="checkbox" data-desk-check><span class="check__box" aria-hidden="true"></span><span class="sr-only">Complete “${esc(t.title)}”</span></label>
        <div class="desk-row__main">
          <p class="desk-row__title">${esc(t.title)}</p>
          <p class="desk-row__note">${[
            showCompany ? `<a href="#/company/${esc(t.company.slug)}/tasks">${esc(t.company.name)}</a>` : null,
            t.priority === 'high' ? 'High priority' : t.priority === 'low' ? 'Low priority' : null
          ].filter(Boolean).join(' · ')}</p>
        </div>
        <span class="desk-row__date${overdue ? ' is-signal' : ''}">${t.dueDate ? `${fmtShortDate(t.dueDate)}<em>${esc(UI.until(t.dueDate))}</em>` : 'No date'}</span>
      </li>`;
  }

  function companyRow(c) {
    const bits = [
      c.decision ? 'Decision · ' + UI.decisionLabel(c.decision) : 'No decision yet',
      c.openQuestions ? `${c.openQuestions} open question${c.openQuestions === 1 ? '' : 's'}` : null,
      c.openTasks ? `${c.openTasks} open task${c.openTasks === 1 ? '' : 's'}` : null,
      c.nextReview && c.nextReview.date ? 'Review ' + fmtShortDate(c.nextReview.date) : (c.status === 'researched' ? 'No review scheduled' : null)
    ].filter(Boolean);
    return `
      <li class="desk-row desk-row--co" data-status="${esc(c.status)}">
        <span class="node node--${esc(c.status)}" aria-hidden="true"></span>
        <div class="desk-row__main">
          ${companyLink(c)}
          <p class="desk-row__note">${esc(bits.join(' · '))}</p>
        </div>
        <span class="desk-row__prog">${UI.bar(c.progress.pct)}<em>${c.progress.pct}%</em></span>
      </li>`;
  }

  function figures(s, d, linkBase) {
    const coWithTasks = s.withOpenTasks;
    const figs = [
      { k: 'Researching', v: s.researching, href: linkBase + 'progress' },
      { k: 'Researched', v: s.researched, href: linkBase + 'done' },
      { k: 'Open tasks', v: s.openTasks, sub: coWithTasks ? `across ${coWithTasks} compan${coWithTasks === 1 ? 'y' : 'ies'}` : '', href: linkBase + 'tasks' },
      { k: 'Reviews due', v: d.reviews.filter(r => r.date && r.date <= d.today).length, sub: s.reviewsSoon ? `${s.reviewsSoon} in the next 14 days` : '', href: linkBase + 'reviews' },
      { k: 'Open questions', v: s.openQuestions, href: linkBase + 'progress' }
    ];
    return `<dl class="desk-figs">${figs.map(f => `
      <div><a href="${f.href}"><dt>${f.k}</dt><dd>${UI.two(f.v)}</dd>${f.sub ? `<span>${esc(f.sub)}</span>` : ''}</a></div>`).join('')}</dl>`;
  }

  /* ---------- HOME: the "Now" section ---------- */
  async function renderHome() {
    const sec = document.getElementById('act-now');
    const body = document.getElementById('homeDesk');
    if (!sec || !body) return;
    if (!DataLayer.auth.isSignedIn()) { sec.hidden = true; return; }
    let d, s;
    try { [d, s] = await Promise.all([DataLayer.desk(), DataLayer.getStats()]); }
    catch (err) { sec.hidden = true; console.warn(err); return; }
    sec.hidden = false;
    if (!d.companies.length) {
      body.innerHTML = `<p class="desk-empty">No companies yet. <a class="arrow-link" href="#/watchlist">Add your first company <span aria-hidden="true">→</span></a></p>`;
      return;
    }
    const due = d.reviewsDue.slice(0, 4);
    const tasks = d.tasks.slice(0, 5);
    const updates = d.updates.slice(0, 5);
    body.innerHTML = `
      ${figures(s, d, '#/desk/')}
      <div class="desk-cols">
        <div class="desk-col">
          <p class="desk-col__k">Reviews due <span>next 14 days</span></p>
          ${due.length ? `<ul class="desk-list">${due.map(reviewRow).join('')}</ul>` : `<p class="desk-empty">Nothing due.</p>`}
        </div>
        <div class="desk-col">
          <p class="desk-col__k">Open tasks <span>by due date</span></p>
          ${tasks.length ? `<ul class="desk-list">${tasks.map(t => taskRow(t)).join('')}</ul>` : `<p class="desk-empty">No open tasks.</p>`}
        </div>
        <div class="desk-col">
          <p class="desk-col__k">Recent updates</p>
          ${updates.length ? `<ul class="desk-list">${updates.map(u => `
            <li class="desk-row desk-row--upd">
              <span class="desk-row__date">${esc(fmtShortDate(u.happenedOn))}</span>
              <div class="desk-row__main">
                <p class="desk-row__title">${esc(u.title)}</p>
                <p class="desk-row__note"><a href="#/company/${esc(u.company.slug)}/history">${esc(u.company.name)}</a> · ${esc(RUN.label('UPDATE_TYPES', u.updateType))}</p>
              </div>
            </li>`).join('')}</ul>` : `<p class="desk-empty">No updates yet.</p>`}
        </div>
      </div>`;
    bindChecks(body, renderHome);
  }

  /* ---------- DESK PAGE ---------- */
  async function renderPage(focus) {
    const body = document.getElementById('deskBody');
    if (!body) return;
    let d, s;
    try { [d, s] = await Promise.all([DataLayer.desk(), DataLayer.getStats()]); }
    catch (err) { body.innerHTML = `<div class="empty"><p class="empty__title">Could not load the desk.</p><p class="empty__text">${esc(err.message)}</p></div>`; return; }

    const t = d.today, week = DataLayer.util.addDays(t, 7);
    const filters = {
      all: () => true,
      overdue: x => x.dueDate && x.dueDate < t,
      week: x => x.dueDate && x.dueDate <= week,
      high: x => x.priority === 'high',
      nodate: x => !x.dueDate
    };
    const taskList = d.tasks.filter(filters[taskFilter] || filters.all);
    const counts = Object.fromEntries(Object.keys(filters).map(k => [k, d.tasks.filter(filters[k]).length]));

    const due = d.reviews.filter(r => r.date && r.date <= DataLayer.util.addDays(t, 14));
    const later = d.reviews.filter(r => !(r.date && r.date <= DataLayer.util.addDays(t, 14)));
    const unscheduled = d.companies.filter(c => !c.nextReview && c.status !== 'watch');
    const inProgress = d.companies.filter(c => c.status === 'researching');
    const done = d.companies.filter(c => c.status === 'researched')
      .sort((a, b) => (b.researchCompletedOn || '').localeCompare(a.researchCompletedOn || ''));
    const watching = d.companies.filter(c => c.status === 'watch');
    let ipoCollect = [];
    try { ipoCollect = IPO.summarise({ ...(await DataLayer.ipo.data()), period: null }).toCollect; } catch (e) { /* optional */ }

    body.innerHTML = `
      ${figures(s, d, '#/desk/')}

      <section class="desk-sec" id="desk-reviews">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Reviews due</h2><p class="desk-sec__meta">Overdue and next 14 days</p></header>
        ${due.length ? `<ul class="desk-list">${due.map(reviewRow).join('')}</ul>` : `<p class="desk-empty">No reviews due in the next two weeks.</p>`}
        ${later.length ? `<details class="recs-done"><summary>Later · ${later.length}</summary><ul class="desk-list">${later.map(reviewRow).join('')}</ul></details>` : ''}
        ${unscheduled.length ? `<details class="recs-done"><summary>No review scheduled · ${unscheduled.length}</summary>
          <ul class="desk-list">${unscheduled.map(c => `
            <li class="desk-row"><span class="desk-row__date">Not scheduled</span>
              <div class="desk-row__main">${companyLink(c, 'review')}<p class="desk-row__note">${esc(UI.statusLabel(c.status))}${c.lastReviewed ? ' · last reviewed ' + fmtDate(c.lastReviewed) : ''}</p></div>
              <a class="desk-row__go" href="#/company/${esc(c.slug)}/review">Schedule <span aria-hidden="true">→</span></a></li>`).join('')}</ul></details>` : ''}
      </section>

      ${ipoCollect.length ? `
      <section class="desk-sec" id="desk-ipo">
        <header class="desk-sec__head"><h2 class="desk-sec__title">IPO money to collect</h2><p class="desk-sec__meta">${ipoCollect.length} not settled · <a href="#/ipos">open IPOs</a></p></header>
        <ul class="desk-list">${ipoCollect.map(r => `
          <li class="desk-row">
            <span class="desk-row__date">${UI.money(Math.round(r.c.dueBack || 0), 'INR')}</span>
            <div class="desk-row__main"><p class="desk-row__title">${esc(r.person.name)}</p>
              <p class="desk-row__note"><a href="#/ipo/${r.ipo.id}">${esc(r.ipo.name)}</a> · ${esc(r.c.dueNote)}</p></div>
            <a class="desk-row__go" href="#/ipo/${r.ipo.id}">Settle <span aria-hidden="true">→</span></a>
          </li>`).join('')}</ul>
      </section>` : ''}

      <section class="desk-sec" id="desk-tasks">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Open tasks</h2><p class="desk-sec__meta">${d.tasks.length} open across ${s.withOpenTasks} compan${s.withOpenTasks === 1 ? 'y' : 'ies'}</p></header>
        ${d.tasks.length ? `
          <div class="filter-row ws-filter" role="group" aria-label="Filter tasks">
            ${[['all', 'All'], ['overdue', 'Overdue'], ['week', 'Due within 7 days'], ['high', 'High priority'], ['nodate', 'No date']].map(([k, l]) =>
              `<button class="filter-chip${taskFilter === k ? ' is-active' : ''}" type="button" data-task-filter="${k}">${l} · ${counts[k]}</button>`).join('')}
          </div>
          ${taskList.length ? `<ul class="desk-list">${taskList.map(x => taskRow(x)).join('')}</ul>` : `<p class="desk-empty">No tasks match this filter.</p>`}`
        : `<p class="desk-empty">No open tasks. Add action items inside a company workspace.</p>`}
      </section>

      <section class="desk-sec" id="desk-progress">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Research in progress</h2><p class="desk-sec__meta">${inProgress.length} compan${inProgress.length === 1 ? 'y' : 'ies'}</p></header>
        ${inProgress.length ? `<ul class="desk-list">${inProgress.map(companyRow).join('')}</ul>` : `<p class="desk-empty">Nothing in progress.</p>`}
        ${watching.length ? `<details class="recs-done"><summary>Watching, not started · ${watching.length}</summary><ul class="desk-list">${watching.map(companyRow).join('')}</ul></details>` : ''}
      </section>

      <section class="desk-sec" id="desk-done">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Completed research</h2><p class="desk-sec__meta">${done.length} compan${done.length === 1 ? 'y' : 'ies'}</p></header>
        ${done.length ? `<ul class="desk-list">${done.map(companyRow).join('')}</ul>` : `<p class="desk-empty">No completed research yet.</p>`}
      </section>

      <section class="desk-sec" id="desk-updates">
        <header class="desk-sec__head"><h2 class="desk-sec__title">Recent research updates</h2><p class="desk-sec__meta">Latest ${d.updates.length}</p></header>
        ${d.updates.length ? Workspace.timeline(d.updates, 'INR', false, true) : `<p class="desk-empty">No updates yet.</p>`}
      </section>`;

    body.querySelectorAll('[data-task-filter]').forEach(b => b.addEventListener('click', () => {
      taskFilter = b.dataset.taskFilter;
      renderPage();
    }));
    body.querySelectorAll('.desk-figs a').forEach(a => a.addEventListener('click', e => {
      const target = document.getElementById('desk-' + a.getAttribute('href').split('/').pop());
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }));
    bindChecks(body, () => renderPage());
    if (focus) {
      const el = document.getElementById('desk-' + focus);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
    }
  }

  function bindChecks(root, rerender) {
    root.querySelectorAll('[data-desk-check]').forEach(cb => cb.addEventListener('change', async () => {
      const row = cb.closest('[data-task]');
      row.classList.add('is-leaving');
      try {
        await DataLayer.tasks.update(row.dataset.task, row.dataset.company, { completed: cb.checked });
        UI.toast('Task completed');
        await rerender();
        if (typeof App !== "undefined") App.refreshSummaries();
      } catch (err) { UI.error(err); row.classList.remove('is-leaving'); cb.checked = false; }
    }));
  }

  return { renderHome, renderPage };
})();
