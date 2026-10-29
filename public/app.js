// The list's search and filters, answering, reading marks, the card's outline, today's card, random card, review and
// subscription. Everything works on the built HTML; progress lives in localStorage through progress.mjs, which swallows
// storage errors.
import { load, markRead, pickUnread, record, reviewQueue, save } from './progress.mjs';
import { escape, questionHtml } from './quiz.mjs';
import { act, keyAction } from './keys.mjs';
import { read as readDisplay, save as saveDisplay } from './display.mjs';
import { bands, leadHtml, dayLabel, matches } from './list.mjs';
import { EPOCH, addDays, dailyPick, isDate, recentDates, utcDate } from './daily.mjs';
import { T, href, pageLang } from './i18n.mjs';

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
// Phones (≤720px) get the bottom bar, a card's spine and outline sheet, the folding sieve and review one question at a
// time; wider screens never see any of it. `touch` is a phone in the hand, whose keyboard covers the bottom of the screen.
const phone = matchMedia('(max-width:720px)');
const touch = matchMedia('(max-width:720px) and (pointer:coarse)');
// The page's language: Chinese at /, English under /en; links and words follow it.
const lang = pageLang(document);
const t = T[lang];
const at = (path) => href(lang, path);
const firstSentence = (text) => (lang === 'en' ? (text.match(/^.*?[.!?](?=\s|$)/) ?? [text])[0].replace(/[.!?]$/, '') : (text.match(/^[^。！？]+/) ?? [text])[0]);

// A question: the reader picks until the right option; every pick shows that option's feedback. Only the first pick
// counts as the answer, so review brings back what was missed. `onDone` runs when the right option is found; a question
// answered right before opens already answered unless `restore` is false.
// Returns `reveal`, so another copy of the same question can be shown answered too.
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
  return reveal;
}

// The first tap on an option shows text the page hasn't set yet (its feedback, the explanation, ✓ or ✕), and setting it
// the first time is slow. While the page is idle, set the shown question's once, off screen, and throw it away.
function warm(q) {
  const run = () => {
    if (!q || q.hidden) return;
    const box = document.createElement('div');
    box.className = q.className;
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = `position:absolute;left:-10000px;top:0;width:${q.clientWidth || 340}px;visibility:hidden`;
    box.innerHTML = `<span class="st">✓✕</span>${[...q.querySelectorAll('.fb,.explain')].map((p) => `<p class="${p.className}">${p.innerHTML}</p>`).join('')}`;
    q.after(box);
    void box.offsetHeight;
    box.remove();
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 }); else setTimeout(run, 1500);
}

// Top bar: how many cards this reader has read, the theme switch (also in the footer on phones) and the random card.
function chrome() {
  const count = document.querySelector('[data-count]');
  const read = Object.keys(state.read).length;
  if (count && read) count.innerHTML = t.readCount(read);
  for (const toggle of document.querySelectorAll('[data-theme-toggle]')) toggle.addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const prefs = { ...readDisplay(store), theme: dark ? 'light' : 'dark' };
    root.dataset.theme = prefs.theme;
    saveDisplay(store, prefs);
  });
  for (const link of document.querySelectorAll('[data-random]')) link.addEventListener('click', (e) => { e.preventDefault(); goRandom(); });
  tabs();
}

// Phones: the bottom bar. 找 on a page with the sieve scrolls to it and opens the keyboard in the same tap (iOS only
// raises it from a tap); elsewhere it goes to /#sieve. 复习 counts the questions of read cards not yet answered right.
function tabs() {
  const bar = document.querySelector('.tabs');
  if (!bar || !phone.matches) return;
  bar.querySelector('[data-tab="find"]').addEventListener('click', (event) => {
    const sieve = document.getElementById('sieve');
    if (!sieve) return;
    event.preventDefault();
    findBox(sieve);
  });
  updateDue();
}

// Phones: while a text box has the keyboard up, the bottom bar hides (iOS would lift it over the box), and when the
// keyboard opens the box moves to the middle of what is still visible.
function keyboard() {
  if (!phone.matches) return;
  const typing = (el) => el?.matches?.('input:not([type=range]):not([type=checkbox]):not([type=radio]),textarea');
  const center = () => {
    const vv = window.visualViewport;
    const box = document.activeElement;
    if (!vv || !typing(box)) return;
    const r = box.getBoundingClientRect();
    if (r.top < vv.offsetTop + 8 || r.bottom > vv.offsetTop + vv.height - 8) scrollBy({ top: r.top + r.height / 2 - (vv.offsetTop + vv.height / 2) });
  };
  addEventListener('focusin', (e) => {
    if (!typing(e.target)) return;
    if (touch.matches) document.documentElement.classList.add('kb');
    window.visualViewport?.addEventListener('resize', center);
  });
  addEventListener('focusout', () => {
    document.documentElement.classList.remove('kb');
    window.visualViewport?.removeEventListener('resize', center);
  });
}
function findBox(sieve) {
  const box = sieve.querySelector('.find');
  scrollTo({ top: box.getBoundingClientRect().top + scrollY - 12 });
  box.querySelector('input').focus({ preventScroll: true });
}
// How many questions each card has (inline on the review page, else /qn.json), and one card's questions (/q/<id>.json),
// each fetched once: the promise is kept, so callers at the same moment share one request.
let counts = null;
const questionCounts = () => counts ?? (counts = Promise.resolve().then(() => {
  const inline = document.getElementById('counts');
  return inline ? JSON.parse(inline.textContent) : fetch(at('/qn.json')).then((r) => r.json());
}));
const cardQuestions = new Map();
const questionsOf = (id) => cardQuestions.get(id) ?? cardQuestions.set(id, fetch(at(`/q/${id}.json`)).then((r) => r.json())).get(id);
async function updateDue() {
  const badge = document.querySelector('[data-due]');
  const read = Object.keys(state.read);
  if (!badge) return;
  if (!read.length) { badge.hidden = true; return; }
  const n = await questionCounts().catch(() => null);
  if (!n) return;
  let due = 0;
  for (const id of read) for (let k = 0; k < (n[id] ?? 0); k++) if (!lastAnswer(`${id}-${k}`)?.ok) due++;
  badge.textContent = Math.min(due, 10);
  badge.hidden = !due;
}

// Support pills: the dumpling hops when pressed and lets off steam when focused from the keyboard (hover is CSS). The one at
// the end of a card lets off steam once a session, when most of it is on screen. Reduced motion stops all of it in CSS.
function tips() {
  const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  for (const a of document.querySelectorAll('[data-tip]')) {
    a.addEventListener('pointerdown', () => replay(a, 'hop'));
    a.addEventListener('animationend', (e) => { if (e.animationName === 'tipHop') a.classList.remove('hop'); });
    a.addEventListener('focus', () => { replay(a, 'steam'); setTimeout(() => a.classList.remove('steam'), 1400); });
  }
  const after = document.querySelector('[data-tip-after]');
  if (!after || !('IntersectionObserver' in window)) return;
  const seen = new IntersectionObserver(([e]) => {
    if (e.intersectionRatio < 0.6) return;
    seen.disconnect();
    try { if (sessionStorage.getItem('models-tip')) return; sessionStorage.setItem('models-tip', '1'); } catch { /* no storage: play it */ }
    after.classList.add('play');
  }, { threshold: [0, 0.6, 1] });
  seen.observe(after);
}

async function goRandom() {
  location.href = at(`/m/${pickUnread(state, await allIds())}`);
}

// Home: today's card for the reader's UTC day, the days before, and the list with search and filters.
function home(data) {
  const { list, short, titles } = data;
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  const order = list.map((c) => c.id);
  const date = utcDate();
  const todayId = dailyPick(order, date).id;
  const lead = document.querySelector('[data-lead]');
  // Today's card and the days before carry their date, so a phone shows that day's question inside the card.
  if (lead && (lead.getAttribute('href') !== at(`/m/${todayId}?day=${date}`) || lead.querySelector('.date b')?.textContent !== dayLabel(date, lang))) {
    lead.href = at(`/m/${todayId}?day=${date}`);
    lead.innerHTML = leadHtml(byId[todayId], date, titles[byId[todayId].discipline], '', lang);
    if (byId[todayId].fig) {
      Promise.all([fetch(at(`/fig/${todayId}.json`)).then((r) => r.json()), import('./figure.mjs')])
        .then(([spec, { figureHtml }]) => { lead.querySelector('.one')?.insertAdjacentHTML('afterend', figureHtml(spec, { lang })); })
        .catch(() => { /* offline or missing: the card reads fine without its figure */ });
    }
  }
  const past = document.querySelector('[data-past]');
  if (past) {
    past.innerHTML = recentDates(date, 4).slice(1).map((d) => {
      const card = byId[dailyPick(order, d).id];
      return `<a href="${at(`/m/${card.id}?day=${d}`)}"><span class="pd">${dayLabel(d, lang)}</span><span class="pname">${escape(card.name)}</span></a>`;
    }).join('');
  }

  const read = new Set(Object.keys(state.read));
  const hash = () => decodeURIComponent(location.hash.slice(1));
  let discipline = data.discipline ?? (titles[hash()] ? hash() : null);
  let use = null;
  let q = new URLSearchParams(location.search).get('q') ?? '';
  let onlyRead = hash() === 'read';
  const tags = document.querySelector('[data-tags]');
  const ranks = document.querySelector('[data-ranks]');
  const tot = document.querySelector('[data-tot]');
  const sieve = document.getElementById('sieve');
  const input = document.querySelector('[data-q]');
  if (q) input.value = q;
  const pass = (c) => (!discipline || c.discipline === discipline) && (!use || c.uses.includes(use)) && (!onlyRead || read.has(c.id)) && matches(c, q);
  const render = () => {
    for (const b of tags.querySelectorAll('button[data-d],button[data-u]')) b.setAttribute('aria-pressed', String(b.dataset.d ? b.dataset.d === discipline : b.dataset.u === use));
    const shown = list.filter(pass);
    ranks.classList.toggle('q', Boolean(q.trim()));
    ranks.innerHTML = bands(shown, { q, read, today: todayId, short, lang });
    tot.innerHTML = shown.length !== list.length ? `<button type="button">${shown.length} / ${list.length} <span aria-hidden="true">×</span></button>` : '';
    // Phones fold the grid of disciplines and uses to what was chosen.
    sieve.classList.toggle('on', Boolean(discipline || use || onlyRead || q.trim()));
  };
  // After a filter changes, the bar sits at the top and the results start right below it; on phones, where the bar
  // does not stick, the search box sits at the top.
  const jump = () => {
    const top = (phone.matches ? sieve.querySelector('.find') : sieve).getBoundingClientRect().top + scrollY - (phone.matches ? 12 : 0);
    if (Math.abs(scrollY - top) > 1) scrollTo({ top });
  };
  // Phones also keep the search words in the address, so coming back from a card finds them where they were.
  const url = () => history.replaceState(null, '', at(discipline ? `/d/${discipline}` : '/') + (phone.matches && q.trim() ? `?q=${encodeURIComponent(q)}` : ''));
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
  input.addEventListener('input', () => { q = input.value; render(); jump(); if (phone.matches) url(); });
  addEventListener('hashchange', () => {
    const h = hash();
    if (h === 'read') onlyRead = true; else if (titles[h]) discipline = h; else return;
    render(); sieve.scrollIntoView();
  });
  render();
  if (onlyRead || (discipline && !data.discipline) || (data.discipline && scrollY === 0)) sieve.scrollIntoView();
  // 找 from another page lands on /#sieve: put the search box at the top, ready to type.
  if (hash() === 'sieve' && phone.matches) findBox(sieve);
}

// A card: one question at a time beside the list of three, the outline that follows the reader, the reading mark.
// On phones also: the spine (back, the part being read, the question boxes), the outline as a sheet from the bottom, the
// day's question right after the opening when the card was opened for a day (?day=), and the examples as a swipe.
function card(root) {
  const id = root.dataset.card;
  const qs = [...root.querySelectorAll('.qmain .q')];
  const nexts = [...root.querySelectorAll('.qmain .qnext')];
  const tasks = [...root.querySelectorAll('.tasks button')];
  const rows = [...root.querySelectorAll('.toc .tq, .hq .tq')].map((row) => [...row.querySelectorAll('i')]);
  const spine = phone.matches ? document.querySelector('[data-spine]') : null;
  if (spine) rows.push([...spine.querySelectorAll('.sq i')]);
  const cont = root.querySelector('.tasks .cont');
  // The same question can be on the page twice (the day's copy); answered in one place, it shows answered in both.
  const pristine = qs.map((q) => q.cloneNode(true));
  const reveals = new Map();
  const answered = (qid) => { for (const reveal of reveals.get(qid) ?? []) reveal(); show(); };
  let dayBox = null;
  let current = 0;
  const show = () => {
    qs.forEach((q, n) => { q.hidden = n !== current; });
    nexts.forEach((b, n) => { b.hidden = n !== current || !qs[n].classList.contains('done'); });
    tasks.forEach((t, n) => {
      t.classList.toggle('cur', n === current);
      t.classList.toggle('ok', qs[n].classList.contains('done'));
      if (n === current) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current');
    });
    for (const boxes of rows) boxes.forEach((b, n) => b.classList.toggle('ok', qs[n]?.classList.contains('done')));
    if (dayBox) dayBox.box.classList.toggle('ok', qs[dayBox.n].classList.contains('done'));
    cont?.classList.toggle('on', qs.every((q) => q.classList.contains('done')));
    label();
  };
  qs.forEach((q) => reveals.set(q.dataset.q, [wire(q, () => answered(q.dataset.q))]));
  current = Math.max(0, qs.findIndex((q) => !q.classList.contains('done')));
  for (const b of nexts) b.addEventListener('click', () => { current = Number(b.dataset.to); show(); warm(qs[current]); qs[current].querySelector('.opt')?.focus({ preventScroll: true }); });
  for (const t of tasks) t.addEventListener('click', () => { current = Number(t.dataset.i); show(); warm(qs[current]); });

  const use = document.getElementById('s-use');
  if ('IntersectionObserver' in window && use) {
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { commit(markRead(state, id, today())); seen.disconnect(); }
    });
    seen.observe(use);
  }

  const toc = root.querySelector('[data-toc]');
  let links = [];
  let targets = [];
  let k = 0;
  const marker = root.querySelector('.toc .ind');
  const collect = () => { links = [...toc.querySelectorAll('a')]; targets = links.map((a) => document.getElementById(a.dataset.t)); };
  // What the spine says: the outline's own words for the part in view; in the questions, the current question.
  function label() {
    if (!spine || !links[k]) return;
    const a = links[k];
    let html = a.innerHTML;
    if (a.dataset.t === 's-quiz') html = `<b>${current + 1}</b>${escape(firstSentence(qs[current].querySelector('.stem').textContent))}`;
    else if (a.classList.contains('td')) html = `<b>${escape(a.querySelector('.tqd').textContent)}</b>${escape(firstSentence(document.querySelector('#s-day .stem').textContent))}`;
    else if (a.querySelector('.ty')) html = `<b>${a.querySelector('.ty').innerHTML}</b>${a.querySelector('.ts').innerHTML}`;
    spine.querySelector('.hl').innerHTML = html;
  }
  const follow = () => {
    k = 0;
    targets.forEach((el, n) => {
      const r = el?.getBoundingClientRect();
      // an example swiped out of view (phones) is not the one being read
      if (r && r.top < innerHeight * 0.3 && (!phone.matches || (r.right > 0 && r.left < innerWidth))) k = n;
    });
    links.forEach((a, n) => a.classList.toggle('on', n === k));
    if (links[k] && marker) { marker.style.top = `${links[k].offsetTop}px`; marker.style.height = `${links[k].offsetHeight}px`; }
    if (spine) {
      spine.querySelector('.prog i').style.width = `${(100 * scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)).toFixed(1)}%`;
      label();
    }
  };
  collect();
  addEventListener('scroll', follow, { passive: true });
  addEventListener('resize', follow);
  follow();
  show();
  warm(qs[current]);

  // The day: today's date beside the crumbs when this is today's card; on a phone opened for a day (?day= within the
  // last 30 days and that day's card), that date, and the day's question after the opening.
  const dayLabelEl = root.querySelector('[data-day]');
  const asked = new URLSearchParams(location.search).get('day');
  const now = utcDate();
  const forDay = phone.matches && isDate(asked) && asked <= now && asked >= addDays(now, -30) && asked >= EPOCH;
  allIds().then((order) => {
    const pick = forDay ? dailyPick(order, asked) : null;
    if (pick?.id === id) {
      dayLabelEl.textContent = dayLabel(asked, lang); dayLabelEl.hidden = false;
      insertDay(asked, ((pick.cycle % qs.length) + qs.length) % qs.length);
    } else if (dailyPick(order, now).id === id) { dayLabelEl.textContent = dayLabel(now, lang); dayLabelEl.hidden = false; }
  }).catch(() => {});
  function insertDay(date, n) {
    const qid = qs[n].dataset.q;
    const q = pristine[n];
    q.hidden = false;
    const block = document.createElement('section');
    block.className = 'dq'; block.id = 's-day';
    block.innerHTML = `<p class="when">${dayLabel(date, lang)}</p>`;
    block.append(q);
    root.querySelector('.story').after(block);
    reveals.get(qid).push(wire(q, () => answered(qid)));
    warm(q);
    // the outline gets the day too, after the story: its date and one box
    const item = document.createElement('li');
    item.innerHTML = `<a href="#s-day" data-t="s-day" class="td"><span class="tqd">${dayLabel(date, lang)}</span><span class="tq"><i></i></span></a>`;
    toc.querySelector('ol > li').after(item);
    dayBox = { box: item.querySelector('i'), n };
    collect(); follow(); show();
  }

  if (!spine) return;
  // The spine's back arrow: back where the reader came from on this site, else today.
  spine.querySelector('[data-back]').addEventListener('click', () => {
    let fromHere = false;
    try { fromHere = Boolean(document.referrer) && new URL(document.referrer).origin === location.origin; } catch { /* no referrer */ }
    if (fromHere && history.length > 1) history.back(); else location.href = at('/');
  });
  // The outline sheet. Opening it adds a history entry, so the phone's back button closes it without leaving the card;
  // closing it any other way goes back over that entry first, then jumps.
  const here = spine.querySelector('[data-here]');
  const scrim = document.querySelector('[data-scrim]');
  let open = false;
  let then = null;
  const openSheet = () => {
    if (open) return;
    open = true;
    document.documentElement.classList.add('sheet');
    scrim.hidden = false;
    toc.setAttribute('role', 'dialog'); toc.setAttribute('aria-modal', 'true');
    here.setAttribute('aria-expanded', 'true');
    history.pushState({ sheet: true }, '');
    const item = links[k] ?? links[0];
    if (item) {
      item.focus({ preventScroll: true });
      // only the sheet scrolls, so the item being read shows; the page behind stays where it is
      if (item.offsetTop + item.offsetHeight > toc.scrollTop + toc.clientHeight) toc.scrollTop = item.offsetTop - toc.clientHeight / 3;
    }
  };
  const closed = () => {
    open = false;
    document.documentElement.classList.remove('sheet');
    scrim.hidden = true;
    toc.removeAttribute('role'); toc.removeAttribute('aria-modal');
    here.setAttribute('aria-expanded', 'false');
    const next = then; then = null;
    if (next) requestAnimationFrame(next); else here.focus({ preventScroll: true });
  };
  const close = (action = null) => { if (!open) return; then = action; history.back(); };
  addEventListener('popstate', () => { if (open) closed(); });
  here.addEventListener('click', openSheet);
  scrim.addEventListener('click', () => close());
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(); });
  const ex3 = root.querySelector('[data-ex3]');
  const goTo = (t) => {
    const el = document.getElementById(t);
    if (!el) return;
    scrollTo({ top: el.getBoundingClientRect().top + scrollY - 16 });
    if (el.parentElement === ex3) ex3.scrollLeft += el.getBoundingClientRect().left - ex3.getBoundingClientRect().left - 16;
    here.focus({ preventScroll: true });
  };
  toc.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || !open) return;
    e.preventDefault();
    close(() => goTo(a.dataset.t));
  });
  // The examples: a swipe, with a button per example under it.
  const dots = [...root.querySelectorAll('[data-dots] button')];
  const articles = [...ex3.children];
  const at = () => articles.reduce((best, el, n) => (Math.abs(el.getBoundingClientRect().left - ex3.getBoundingClientRect().left - 16) < Math.abs(articles[best].getBoundingClientRect().left - ex3.getBoundingClientRect().left - 16) ? n : best), 0);
  const mark = () => { const n = at(); dots.forEach((d, i) => { if (i === n) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); }); };
  ex3.addEventListener('scroll', () => { mark(); follow(); }, { passive: true });
  dots.forEach((d, n) => d.addEventListener('click', () => { ex3.scrollTo({ left: ex3.scrollLeft + articles[n].getBoundingClientRect().left - ex3.getBoundingClientRect().left - 16, behavior: 'smooth' }); }));
}

// The page shows its footer (and the empty note) once the questions are in place: see reviewPage.
const settled = (box) => { box.dataset.ready = ''; document.documentElement.classList.remove('rvwait'); };
async function review(box) {
  const n = await questionCounts().catch(() => null);
  if (!n) { settled(box); return; }
  const cards = Object.entries(n).map(([id, k]) => ({ id, questions: Array.from({ length: k }, (_, j) => `${id}-${j}`) }));
  const queue = reviewQueue(state, cards).slice(0, 10);
  if (!queue.length) { settled(box); return; }
  const ids = [...new Set(queue.map((qid) => qid.replace(/-\d+$/, '')))];
  for (const id of ids) questionsOf(id);   // all at once, in parallel
  if (phone.matches) { reviewOne(box, queue); return; }
  const all = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await questionsOf(id)])));
  box.innerHTML = queue.map((qid) => {
    const id = qid.replace(/-\d+$/, '');
    return questionHtml(all[id].questions[Number(qid.split('-').pop())], qid, { id, name: all[id].name, href: at(`/m/${id}`) });
  }).join('') + `<p class="more"><a href="${at('/review')}">${t.reviewAgain}</a></p>`;
  settled(box);
  // Review asks again even when the last answer was right.
  for (const q of box.querySelectorAll('.q')) wire(q, undefined, { restore: false });
}

// Review on a phone: one question a screen. Once the right option is found, 下一题 (做完了 on the last) waits above the
// bottom bar; at the end, how many were right at the first pick, each card marked ✓ or ✗ and linked.
// The page's own heading stays where it is (nothing above the question moves); the count sits beside it.
function reviewOne(box, queue) {
  const section = box.closest('.plainpage');
  section.classList.add('rvmode');
  const heading = section.querySelector('h1');
  const count = document.createElement('small');
  count.className = 'rvn';
  heading.append(count);
  const titles = JSON.parse(document.getElementById('disciplines')?.textContent || '{}');
  const all = {};
  const right = [];
  let i = 0;
  const top = () => `<div class="segs" aria-hidden="true">${queue.map((_, n) => `<i class="${n < right.length ? (right[n] ? 'ok' : 'miss') : n === i ? 'cur' : ''}"></i>`).join('')}</div>`;
  const render = async () => {
    for (const id of i >= queue.length ? new Set(queue.map((q) => q.replace(/-\d+$/, ''))) : [queue[i].replace(/-\d+$/, '')]) all[id] ??= await questionsOf(id);
    count.textContent = i < queue.length ? `${i + 1} / ${queue.length}` : '';
    if (i >= queue.length) {
      const score = right.filter(Boolean).length;
      box.innerHTML = `${top()}<div class="sum"><p class="big">${score}<small>/ ${queue.length}</small></p><ul>${queue.map((qid, n) => {
        const id = qid.replace(/-\d+$/, '');
        return `<li><a href="${at(`/m/${escape(id)}`)}"><b class="${right[n] ? 'y' : 'n'}">${right[n] ? '✓' : '✗'}</b> <b>${escape(all[id].name)}</b><span>${escape(all[id].one_line)}</span></a></li>`;
      }).join('')}</ul><a class="again" href="${at('/review')}">${t.reviewAgain}</a></div>`;
      return;
    }
    const qid = queue[i];
    const id = qid.replace(/-\d+$/, '');
    box.innerHTML = `${top()}<div class="rvq"><p class="src"><a href="${at(`/m/${escape(id)}`)}">${escape(all[id].name)}</a><span>${escape(titles[all[id].discipline] ?? '')}</span></p>`
      + `${questionHtml(all[id].questions[Number(qid.split('-').pop())], qid)}<button class="rnext" type="button" hidden>${i < queue.length - 1 ? t.reviewNext : t.reviewDone}</button></div>`;
    const next = box.querySelector('.rnext');
    const q = box.querySelector('.q');
    wire(q, () => {
      right[i] = Boolean(lastAnswer(qid)?.ok);
      next.hidden = false;
      updateDue();
    }, { restore: false });
    warm(q);
    next.addEventListener('click', () => { i += 1; render(); scrollTo({ top: 0 }); });
  };
  render().then(() => settled(box), () => settled(box));
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
tips();
keyboard();
const data = document.getElementById('cards');
if (data) home(JSON.parse(data.textContent));
if (document.querySelector('[data-go-random]')) goRandom();
const page = document.querySelector('[data-card]');
if (page) card(page);
for (const q of document.querySelectorAll('[data-today-quiz] .q')) { wire(q); warm(q); }
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
