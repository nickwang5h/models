// The home page's list of every card, shared by the build (the first paint) and the browser (search and filters).
// Cards run in rank order and fall into four bands; each band shows less of a card than the one before:
// the first 15 in three columns with the English name, one line and uses; the next 26 in four columns; then 53 one per
// line; the rest by name only.
import { escape } from './quiz.mjs';

// Scott Page's REDCAPE: what a model is good for.
export const USES = [['reason', '推理'], ['explain', '解释'], ['design', '设计'], ['communicate', '沟通'], ['act', '行动'], ['predict', '预测'], ['explore', '探索']];
const USE_NAME = Object.fromEntries(USES);

export const band = (rank) => (rank <= 15 ? 1 : rank <= 41 ? 2 : rank <= 94 ? 3 : 4);

const words = (q) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

// Search covers the name, the English name, the one line and the opening story.
export function matches(card, q) {
  const text = `${card.name} ${card.en} ${card.one_line} ${card.story ?? ''}`.toLowerCase();
  return words(q).every((w) => text.includes(w));
}

export function highlight(text, q) {
  let html = escape(text);
  for (const w of words(q)) html = html.replace(new RegExp(escape(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`);
  return html;
}

// `short` maps discipline ids to their one-word names; `read` is a Set of read ids; `today` is today's id.
export function entry(card, { q = '', read = new Set(), today = '', short = {} } = {}) {
  const cls = `e${read.has(card.id) ? ' is-read' : ''}${card.id === today ? ' is-today' : ''}`;
  const b = band(card.rank);
  const href = `/m/${escape(card.id)}`;
  const meta = `<span class="m"><span class="r">${card.rank}</span><span class="d">${escape(short[card.discipline] ?? '')}</span></span>`;
  const name = `<span class="n">${highlight(card.name, q)}</span>`;
  const line = `<span class="o">${highlight(card.one_line, q)}</span>`;
  if (b === 1) {
    return `<a class="${cls}" href="${href}" data-id="${escape(card.id)}">${meta}${name}<span class="en">${escape(card.en)}</span>${line}`
      + `<span class="us">${card.uses.map((u) => USE_NAME[u]).join(' · ')}</span></a>`;
  }
  if (b === 2) return `<a class="${cls}" href="${href}" data-id="${escape(card.id)}">${meta}${name}${line}</a>`;
  return `<a class="${cls}" href="${href}" data-id="${escape(card.id)}"${b === 4 ? ` title="${escape(card.one_line)}"` : ''}><span class="r">${card.rank}</span>${name}${line}</a>`;
}

// `cards` already filtered and in rank order.
export function bands(cards, options = {}) {
  if (!cards.length) return `<p class="none">没有找到${options.q?.trim() ? `「${escape(options.q.trim())}」` : ''}</p>`;
  return [1, 2, 3, 4].map((k) => {
    const these = cards.filter((card) => band(card.rank) === k);
    return these.length ? `<div class="band b${k}">${these.map((card) => entry(card, options)).join('')}</div>` : '';
  }).join('');
}

export const dayLabel = (date) => `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日`;

// Today's card at the top of the home page; app.js redraws it for the reader's own day. `fig` is the card's figure,
// drawn by figure.mjs.
export function leadHtml(card, date, discipline, fig = '') {
  return `<div class="date"><b>${dayLabel(date)}</b> · ${escape(discipline)}</div>
<h1><span class="nm">${escape(card.name)}</span><span class="en">${escape(card.en)}</span></h1>
<p class="one">${escape(card.one_line)}</p>${fig}<p class="ex">${escape(card.lede)}<span class="arr" aria-hidden="true">→</span></p>`;
}
