// Answering, reading marks, tallies, random card and review. Everything works on the built HTML; progress lives in
// localStorage through progress.mjs, which swallows storage errors.
import { load, markRead, pickUnread, record, reviewQueue, save, stats } from './progress.mjs';
import { questionHtml } from './quiz.mjs';
import { act, keyAction } from './keys.mjs';
import { SIZES, THEMES, apply, read as readDisplay, save as saveDisplay } from './display.mjs';

let storage = null;
try { storage = window.localStorage; } catch { /* no storage: progress stays in this page */ }
const memory = { getItem: () => null, setItem: () => {} };
const store = storage ?? memory;
let state = load(store);
const today = () => new Date().toISOString().slice(0, 10);
const commit = (next) => { state = next; save(store, state); };

function wire(root) {
  for (const q of root.querySelectorAll('.q')) {
    q.addEventListener('click', (event) => {
      const button = event.target.closest('button.opt');
      if (!button || q.classList.contains('done')) return;
      q.classList.add('done');
      const ok = button.dataset.ok === '1';
      button.classList.add(ok ? 'right' : 'wrong');
      button.nextElementSibling.hidden = false;
      for (const other of q.querySelectorAll('button.opt')) {
        other.disabled = true;
        if (other.dataset.ok === '1') other.classList.add('right');
      }
      q.querySelector('.explain').hidden = false;
      const card = q.dataset.q.replace(/-\d+$/, '');
      commit(record(markRead(state, card, today()), q.dataset.q, ok, Date.now()));
    });
  }
}

function tally() {
  for (const node of document.querySelectorAll('[data-ids]')) {
    const ids = node.dataset.ids.split(' ').filter(Boolean);
    const s = stats(state, ids);
    const bar = node.querySelector('[data-bar]');
    if (bar) bar.style.width = `${(100 * s.read) / ids.length}%`;
  }
  const scope = document.querySelector('.discipline[data-ids]')?.dataset.ids.split(' ')
    ?? [...document.querySelectorAll('[data-ids]')].flatMap((n) => n.dataset.ids.split(' '));
  const shown = document.querySelector('[data-tally]');
  if (shown && scope.length) {
    const s = stats(state, scope);
    shown.textContent = s.read ? `已读 ${s.read}/${scope.length} 张 · 做过 ${s.answered} 题，答对 ${s.right} 题` : `共 ${scope.length} 张，还没有开始读。`;
  }
  for (const link of document.querySelectorAll('.tiles a[data-id]')) link.classList.toggle('read', Boolean(state.read[link.dataset.id]));
}

async function goRandom() {
  const ids = await (await fetch('/ids.json')).json();
  location.href = `/m/${pickUnread(state, ids)}`;
}

async function review(box) {
  const all = await (await fetch('/questions.json')).json();
  const cards = Object.entries(all).map(([id, card]) => ({ id, questions: card.questions.map((_, n) => `${id}-${n}`) }));
  const queue = reviewQueue(state, cards).slice(0, 10);
  if (!queue.length) return;
  box.innerHTML = queue.map((qid) => {
    const id = qid.replace(/-\d+$/, '');
    return questionHtml(all[id].questions[Number(qid.split('-').pop())], qid, { id, name: all[id].name });
  }).join('') + '<p class="more"><a href="/review">再来一组</a></p>';
  wire(box);
}

const card = document.querySelector('[data-card]');
if (card) {
  wire(card);
  const quiz = document.getElementById('quiz');
  if ('IntersectionObserver' in window && quiz) {
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { commit(markRead(state, card.dataset.card, today())); seen.disconnect(); }
    });
    seen.observe(quiz);
  }
}
tally();
for (const link of document.querySelectorAll('[data-random]')) link.addEventListener('click', (e) => { e.preventDefault(); goRandom(); });
if (document.querySelector('[data-go-random]')) goRandom();
const todayQuiz = document.querySelector('[data-today-quiz]');
if (todayQuiz) wire(todayQuiz);
// The home page names today's card (see functions/today.json.js); without it the tile still links to /today.
const todayLine = document.querySelector('[data-today]');
if (todayLine) {
  fetch('/today.json').then((r) => (r.ok ? r.json() : null)).then((day) => {
    if (day?.name) todayLine.textContent = `${day.name}：${day.one_line}`;
  }).catch(() => {});
}
const box = document.getElementById('review');
if (box) review(box);

// Theme and size, in the footer of every page: the page restyles at once and the choice stays in this browser.
function display(root) {
  const prefs = readDisplay(store);
  const group = (label, key, choices) => `<span>${label}${Object.entries(choices).map(([value, name]) =>
    `<button data-key="${key}" data-value="${value}" aria-pressed="${prefs[key] === value}">${name}</button>`).join('')}</span>`;
  root.innerHTML = group('明暗', 'theme', THEMES) + group('字号', 'size', SIZES);
}
const displayRoot = document.querySelector('[data-display]');
if (displayRoot) {
  display(displayRoot);
  displayRoot.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-key]');
    if (!button) return;
    const next = { ...readDisplay(store), [button.dataset.key]: button.dataset.value };
    saveDisplay(store, next);
    apply(document.documentElement, next);
    display(displayRoot);
  });
}

// Offline use and install: see sw.js.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

// Keyboard: see keys.mjs.
document.addEventListener('keydown', (event) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? '') || event.metaKey || event.ctrlKey || event.altKey) return;
  const action = keyAction(event.key);
  if (action && act(action, document)) event.preventDefault();
});
