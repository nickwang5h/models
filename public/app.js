// The list's search and filters, answering, reading marks, the card's outline, today's card, random card, review and
// subscription. Everything works on the built HTML; progress lives in localStorage through progress.mjs, which swallows
// storage errors.
import { load, markRead, pickUnread, record, reviewQueue, save } from './progress.mjs';
import { escape, questionHtml } from './quiz.mjs';
import { act, keyAction } from './keys.mjs';
import { read as readDisplay, save as saveDisplay } from './display.mjs';
import { bands, leadHtml, dayLabel, matches } from './list.mjs';
import { dailyPick, recentDates, utcDate } from './daily.mjs';

let storage = null;
try { storage = window.localStorage; } catch { /* no storage: progress stays in this page */ }
const memory = { getItem: () => null, setItem: () => {} };
const store = storage ?? memory;
let state = load(store);
const today = () => new Date().toISOString().slice(0, 10);
const commit = (next) => { state = next; save(store, state); };
const lastAnswer = (qid) => state.answers.filter((a) => a.q === qid).pop();
let ids = null;
const allIds = async () => ids ?? (ids = await (await fetch('/ids.json')).json());

// A question: the reader picks until the right option; every pick shows that option's feedback. Only the first pick
// counts as the answer, so review brings back what was missed. `onDone` runs when the right option is found; a question
// answered right before opens already answered unless `restore` is false.
function wire(q, onDone = () => {}, { restore = true } = {}) {
  const reveal = () => {
    q.classList.add('done');
    for (const li of q.querySelectorAll('.li')) {
      const right = li.querySelector('.opt').dataset.ok === '1';
      if (!li.classList.contains('picked')) li.classList.add('shown', right ? 'good' : 'dim');
      li.querySelector('.fb').hidden = false;
      li.querySelector('.opt').disabled = true;
    }
    q.querySelector('.explain').hidden = false;
  };
  if (restore && lastAnswer(q.dataset.q)?.ok) reveal();
  q.addEventListener('click', (event) => {
    const button = event.target.closest('button.opt');
    if (!button || button.disabled || q.classList.contains('done')) return;
    const ok = button.dataset.ok === '1';
    const li = button.closest('.li');
    li.classList.add('picked', ok ? 'good' : 'bad');
    button.querySelector('.st').textContent = ok ? '✓' : '✕';
    button.disabled = true;
    li.querySelector('.fb').hidden = false;
    if (!q.dataset.tried) {
      q.dataset.tried = '1';
      const card = q.dataset.q.replace(/-\d+$/, '');
      commit(record(markRead(state, card, today()), q.dataset.q, ok, Date.now()));
    }
    if (ok) { reveal(); onDone(); }
  });
}

// Top bar: how many cards this reader has read, the theme switch and the random card.
function chrome() {
  const count = document.querySelector('[data-count]');
  const read = Object.keys(state.read).length;
  if (count && read) count.innerHTML = `读过 <b>${read}</b>`;
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const prefs = { ...readDisplay(store), theme: dark ? 'light' : 'dark' };
    root.dataset.theme = prefs.theme;
    saveDisplay(store, prefs);
  });
  for (const link of document.querySelectorAll('[data-random]')) link.addEventListener('click', (e) => { e.preventDefault(); goRandom(); });
}

async function goRandom() {
  location.href = `/m/${pickUnread(state, await allIds())}`;
}

// Home: today's card for the reader's UTC day, the days before, and the list with search and filters.
function home(data) {
  const { list, short, titles } = data;
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  const order = list.map((c) => c.id);
  const date = utcDate();
  const todayId = dailyPick(order, date).id;
  const lead = document.querySelector('[data-lead]');
  if (lead && (lead.getAttribute('href') !== `/m/${todayId}` || lead.querySelector('.date b')?.textContent !== dayLabel(date))) {
    lead.href = `/m/${todayId}`;
    lead.innerHTML = leadHtml(byId[todayId], date, titles[byId[todayId].discipline]);
    if (byId[todayId].fig) {
      Promise.all([fetch(`/fig/${todayId}.json`).then((r) => r.json()), import('./figure.mjs')])
        .then(([spec, { figureHtml }]) => { lead.querySelector('.one')?.insertAdjacentHTML('afterend', figureHtml(spec)); })
        .catch(() => { /* offline or missing: the card reads fine without its figure */ });
    }
  }
  const past = document.querySelector('[data-past]');
  if (past) {
    past.innerHTML = recentDates(date, 4).slice(1).map((d) => {
      const card = byId[dailyPick(order, d).id];
      return `<a href="/m/${card.id}"><span class="pd">${dayLabel(d)}</span><span class="pname">${escape(card.name)}</span></a>`;
    }).join('');
  }

  const read = new Set(Object.keys(state.read));
  const hash = () => decodeURIComponent(location.hash.slice(1));
  let discipline = data.discipline ?? (titles[hash()] ? hash() : null);
  let use = null;
  let q = '';
  let onlyRead = hash() === 'read';
  const tags = document.querySelector('[data-tags]');
  const ranks = document.querySelector('[data-ranks]');
  const tot = document.querySelector('[data-tot]');
  const sieve = document.getElementById('sieve');
  const input = document.querySelector('[data-q]');
  const pass = (c) => (!discipline || c.discipline === discipline) && (!use || c.uses.includes(use)) && (!onlyRead || read.has(c.id)) && matches(c, q);
  const render = () => {
    for (const b of tags.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.d ? b.dataset.d === discipline : b.dataset.u === use));
    const shown = list.filter(pass);
    ranks.classList.toggle('q', Boolean(q.trim()));
    ranks.innerHTML = bands(shown, { q, read, today: todayId, short });
    tot.innerHTML = shown.length !== list.length ? `<button type="button">${shown.length} / ${list.length} <span aria-hidden="true">×</span></button>` : '';
  };
  // After a filter changes, the bar sits at the top and the results start right below it.
  const jump = () => { const top = sieve.getBoundingClientRect().top + scrollY; if (Math.abs(scrollY - top) > 1) scrollTo({ top }); };
  const url = () => history.replaceState(null, '', discipline ? `/d/${discipline}` : '/');
  tags.addEventListener('click', (event) => {
    const b = event.target.closest('button');
    if (!b) return;
    if (b.dataset.d) { discipline = discipline === b.dataset.d ? null : b.dataset.d; url(); }
    else use = use === b.dataset.u ? null : b.dataset.u;
    render(); jump();
  });
  tot.addEventListener('click', (event) => {
    if (!event.target.closest('button')) return;
    discipline = use = null; onlyRead = false; q = ''; input.value = '';
    url(); render();
  });
  input.addEventListener('input', () => { q = input.value; render(); jump(); });
  addEventListener('hashchange', () => {
    const h = hash();
    if (h === 'read') onlyRead = true; else if (titles[h]) discipline = h; else return;
    render(); sieve.scrollIntoView();
  });
  render();
  if (onlyRead || (discipline && !data.discipline) || (data.discipline && scrollY === 0)) sieve.scrollIntoView();
}

// A card: one question at a time beside the list of three, the outline that follows the reader, the reading mark.
function card(root) {
  const id = root.dataset.card;
  const qs = [...root.querySelectorAll('.qmain .q')];
  const nexts = [...root.querySelectorAll('.qmain .qnext')];
  const tasks = [...root.querySelectorAll('.tasks button')];
  const boxes = [...root.querySelectorAll('.toc .tq i')];
  const cont = root.querySelector('.tasks .cont');
  let current = 0;
  const show = () => {
    qs.forEach((q, n) => { q.hidden = n !== current; });
    nexts.forEach((b, n) => { b.hidden = n !== current || !qs[n].classList.contains('done'); });
    tasks.forEach((t, n) => {
      t.classList.toggle('cur', n === current);
      t.classList.toggle('ok', qs[n].classList.contains('done'));
      if (n === current) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current');
    });
    boxes.forEach((b, n) => b.classList.toggle('ok', qs[n]?.classList.contains('done')));
    cont?.classList.toggle('on', qs.every((q) => q.classList.contains('done')));
  };
  qs.forEach((q) => wire(q, show));
  current = Math.max(0, qs.findIndex((q) => !q.classList.contains('done')));
  for (const b of nexts) b.addEventListener('click', () => { current = Number(b.dataset.to); show(); qs[current].querySelector('.opt')?.focus({ preventScroll: true }); });
  for (const t of tasks) t.addEventListener('click', () => { current = Number(t.dataset.i); show(); });
  show();

  const use = document.getElementById('s-use');
  if ('IntersectionObserver' in window && use) {
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { commit(markRead(state, id, today())); seen.disconnect(); }
    });
    seen.observe(use);
  }

  const links = [...root.querySelectorAll('.toc a')];
  const marker = root.querySelector('.toc .ind');
  const targets = links.map((a) => document.getElementById(a.dataset.t));
  const follow = () => {
    let k = 0;
    targets.forEach((el, n) => { if (el && el.getBoundingClientRect().top < innerHeight * 0.3) k = n; });
    links.forEach((a, n) => a.classList.toggle('on', n === k));
    if (links[k] && marker) { marker.style.top = `${links[k].offsetTop}px`; marker.style.height = `${links[k].offsetHeight}px`; }
  };
  addEventListener('scroll', follow, { passive: true });
  addEventListener('resize', follow);
  follow();

  const day = root.querySelector('[data-day]');
  allIds().then((order) => {
    const date = utcDate();
    if (dailyPick(order, date).id === id) { day.textContent = dayLabel(date); day.hidden = false; }
  }).catch(() => {});
}

async function review(box) {
  const all = await (await fetch('/questions.json')).json();
  const cards = Object.entries(all).map(([id, c]) => ({ id, questions: c.questions.map((_, n) => `${id}-${n}`) }));
  const queue = reviewQueue(state, cards).slice(0, 10);
  if (!queue.length) return;
  box.innerHTML = queue.map((qid) => {
    const id = qid.replace(/-\d+$/, '');
    return questionHtml(all[id].questions[Number(qid.split('-').pop())], qid, { id, name: all[id].name });
  }).join('') + '<p class="more"><a href="/review">再来一组</a></p>';
  // Review asks again even when the last answer was right.
  for (const q of box.querySelectorAll('.q')) wire(q, undefined, { restore: false });
}

// Email: the form shows only when the site can send (GET /api/subscribe).
const NOTES = {
  confirmed: '订阅成功。明天起每天一封。',
  expired: '确认链接已经失效，请重新填一次邮箱。',
  sent: '确认信已经发出。请到邮箱里点开链接（48 小时内有效），没收到就看看垃圾邮件。',
  off: '邮件订阅还没有开通。可以先用 RSS 订阅，或者每天打开今日一卡。',
};
function subscribe(form, note, box) {
  const query = new URLSearchParams(location.search);
  if (query.has('confirmed')) note.textContent = NOTES.confirmed;
  else if (query.has('expired')) note.textContent = NOTES.expired;
  fetch('/api/subscribe').then((r) => (r.ok ? r.json() : null)).then((answer) => {
    if (answer?.open) { if (box) box.hidden = false; return; }
    if (!box) { form.hidden = true; note.textContent = NOTES.off; }
  }).catch(() => {});
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    note.textContent = '正在发送……';
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.value, website: form.website.value }),
      });
      const answer = await response.json().catch(() => ({}));
      if (response.ok) { note.textContent = NOTES.sent; form.reset(); }
      else if (response.status === 503) note.textContent = NOTES.off;
      else note.textContent = answer.error || '没能发出确认信，请稍后再试。';
    } catch {
      note.textContent = '网络不通，请稍后再试。';
    }
    button.disabled = false;
  });
}

chrome();
const data = document.getElementById('cards');
if (data) home(JSON.parse(data.textContent));
if (document.querySelector('[data-go-random]')) goRandom();
const page = document.querySelector('[data-card]');
if (page) card(page);
for (const q of document.querySelectorAll('[data-today-quiz] .q')) wire(q);
const box = document.getElementById('review');
if (box) review(box);
const form = document.querySelector('[data-subscribe]');
if (form) subscribe(form, document.querySelector('[data-subscribe-status]'), document.querySelector('[data-mail]'));

// Offline use and install: see sw.js.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

// Keyboard: see keys.mjs.
document.addEventListener('keydown', (event) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? '') || event.metaKey || event.ctrlKey || event.altKey) return;
  const action = keyAction(event.key);
  if (action && act(action, document)) event.preventDefault();
});
