// Pages of models.wuhua.app, rendered at build time from content/*.json.
import katex from 'katex';
import { Marked } from 'marked';
import { escape, questionHtml } from '../public/quiz.mjs';
import { USES, bands, leadHtml } from '../public/list.mjs';
import { reportUrl, shell, tipAfter } from './shell.mjs';
import { figureHtml, figureProblems } from '../public/figure.mjs';

const md = new Marked({ gfm: true });
md.use({ renderer: { html: (token) => escape(token.text ?? '') } });
// CommonMark won't close ** after punctuation when a letter follows (“好。**判断”), which Chinese prose does all the time;
// pair the stars directly instead.
md.use({
  extensions: [{
    name: 'cjkStrong',
    level: 'inline',
    start: (src) => src.indexOf('**'),
    tokenizer(src) {
      const match = /^\*\*(?=\S)([\s\S]*?\S)\*\*/.exec(src);
      if (match) return { type: 'strong', raw: match[0], text: match[1], tokens: this.lexer.inlineTokens(match[1]) };
      return undefined;
    },
  }],
});

const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

// Markdown with $…$ and $$…$$ typeset by KaTeX; math is cut out before Markdown so underscores and stars survive.
export function markdown(text, { inline = false } = {}) {
  const pieces = [];
  const held = String(text).replace(MATH, (_, block, line) => {
    pieces.push(katex.renderToString(block ?? line, { displayMode: Boolean(block), throwOnError: false, strict: 'ignore', output: 'html' }));
    return `@@M${pieces.length - 1}@@`;
  });
  const html = inline ? md.parseInline(held) : md.parse(held);
  return html.replace(/@@M(\d+)@@/g, (_, n) => pieces[Number(n)]);
}

const USE_KEYS = USES.map(([key]) => key);
const USE_NAME = Object.fromEntries(USES);
const filled = (value) => typeof value === 'string' && value.trim() !== '';
const TEXTS = [['shallow', 'scene'], ['shallow', 'plain'], ['deep', 'mechanism'], ['deep', 'origin'], ['deep', 'limits']];

// The content schema (README, 卡片格式), checked by the build and by test/content.test.mjs.
export function validate(index, cards) {
  const errors = [];
  const listed = index.cards.map((c) => c.id);
  const entry = new Map(index.cards.map((c) => [c.id, c]));
  const disciplines = new Set(index.disciplines.map((d) => d.id));
  for (const id of listed) if (!cards[id]) errors.push(`${id}：索引里有，但没有卡片文件`);
  if (new Set(listed).size !== listed.length) errors.push('索引里有重复的 id');
  const ranks = index.cards.map((c) => c.rank).sort((a, b) => a - b);
  if (ranks.some((r, n) => r !== n + 1)) errors.push(`索引里的 rank 要从 1 到 ${listed.length} 各出现一次`);
  for (const [id, card] of Object.entries(cards)) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`${id}：id 只能用小写字母、数字和连字符`);
    if (card.id !== id) errors.push(`${id}：文件名和 id（${card.id}）不一致`);
    for (const key of ['name', 'en', 'discipline', 'one_line']) if (!filled(card[key])) errors.push(`${id}：缺 ${key}`);
    for (const [part, key] of TEXTS) if (!filled(card[part]?.[key])) errors.push(`${id}：缺 ${part}.${key}`);
    if (card.discipline && !disciplines.has(card.discipline)) errors.push(`${id}：学科 ${card.discipline} 不认识`);
    const listedAs = entry.get(id);
    if (!listedAs) errors.push(`${id}：有卡片文件，但索引里没有`);
    else for (const key of ['name', 'en', 'discipline', 'one_line']) if (listedAs[key] !== card[key]) errors.push(`${id}：索引里的 ${key} 和卡片不一致`);
    const use = card.use ?? {};
    const uses = use.uses ?? [];
    if (uses.length < 1 || uses.length > 4) errors.push(`${id}：use.uses 要 1–4 条`);
    for (const u of uses) {
      if (!USE_KEYS.includes(u?.use)) errors.push(`${id}：用途 ${u?.use} 不认识`);
      if (!filled(u?.text)) errors.push(`${id}：用途 ${u?.use} 缺 text`);
    }
    if (new Set(uses.map((u) => u?.use)).size !== uses.length) errors.push(`${id}：use.uses 有重复的用途`);
    if (use.examples?.length !== 3) errors.push(`${id}：use.examples 要恰好 3 个`);
    (use.examples ?? []).forEach((e, n) => { if (!filled(e?.field) || !filled(e?.title) || !filled(e?.text)) errors.push(`${id}：第 ${n + 1} 个例子缺 field、title 或 text`); });
    if (!Array.isArray(use.ask) || use.ask.length < 2 || use.ask.length > 4 || !use.ask.every(filled)) errors.push(`${id}：use.ask 要 2–4 句`);
    const withs = use.with ?? [];
    if (withs.length < 2 || withs.length > 4) errors.push(`${id}：use.with 要 2–4 张卡`);
    if (new Set(withs.map((w) => w?.id)).size !== withs.length) errors.push(`${id}：use.with 有重复`);
    for (const w of withs) {
      if (w?.id === id) errors.push(`${id}：use.with 指向自己`);
      else if (!cards[w?.id]) errors.push(`${id}：use.with 里的 ${w?.id} 不存在`);
      if (!filled(w?.sees)) errors.push(`${id}：use.with 里的 ${w?.id} 缺 sees`);
    }
    if (card.figure != null) for (const problem of figureProblems(card.figure)) errors.push(`${id}：${problem}`);
    const questions = use.questions ?? [];
    if (questions.length < 2) errors.push(`${id}：至少要 2 道题`);
    questions.forEach((q, n) => {
      if (q.options?.length !== 4 || q.options.filter((o) => o.correct === true).length !== 1) errors.push(`${id}：第 ${n + 1} 题要 4 个选项、恰好一个正确`);
      if (!filled(q.stem) || !filled(q.question) || !filled(q.explain)) errors.push(`${id}：第 ${n + 1} 题缺 stem、question 或 explain`);
      if ((q.options ?? []).some((o) => !filled(o.text) || !filled(o.feedback))) errors.push(`${id}：第 ${n + 1} 题有选项缺 text 或 feedback`);
    });
  }
  return errors;
}

// The year of the opening story: from index.json, or read from the story sentence when the index has none.
const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function storyYear(entry) {
  if (entry.year != null && entry.year !== '') return Number(entry.year) < 0 ? `前 ${-Number(entry.year)}` : String(entry.year);
  const story = entry.story ?? '';
  let m = story.match(/公元前\s*(\d+)\s*年/);
  if (m) return `前 ${m[1]}`;
  m = story.match(/(\d{4})\s*[–-]\s*\d{2}\s*年/) || story.match(/(\d{4})\s*年/);
  if (m) return m[1];
  m = story.match(/20\s*世纪\s*(\d)0\s*年代/);
  if (m) return `${m[1]}0 年代`;
  m = story.match(/20\s*世纪\s*([一二三四五六七八九]+)十年代/);
  if (m) return `${CN_DIGIT[m[1][0]]}0 年代`;
  return '';
}
// The story sentence without the year it opens with, when the year is shown on its own.
const storyRest = (story) => story.replace(/^\d{3,4}\s*年(?![起代间])\s*/, '').replace(/^[，、]/, '');

// The first sentences of the opening story, about 70 characters: the home page shows them under today's card.
export function lede(scene) {
  let text = '';
  const flat = scene.replace(/\s*\n\s*/g, '');
  for (const sentence of flat.match(/[^。！？]+[。！？]/g) ?? [flat]) {
    text += sentence;
    if (text.length > 70) break;
  }
  return text;
}

// What the browser needs for the list, search and today's card: one entry per card, in rank order.
export function listData(index, cards) {
  return [...index.cards].sort((a, b) => a.rank - b.rank).map((e) => ({
    id: e.id, name: e.name, en: e.en, discipline: e.discipline, one_line: e.one_line, rank: e.rank, story: e.story ?? '',
    uses: cards[e.id].use.uses.map((u) => u.use), lede: lede(cards[e.id].shallow.scene), fig: cards[e.id].figure != null,
  }));
}

const md0 = (text) => markdown(text, { inline: true });
const toc = (target, html, cls = '') => `<li><a href="#${target}" data-t="${target}"${cls ? ` class="${cls}"` : ''}>${html}</a></li>`;

// `siblings` are the cards of the same discipline in rank order, for the previous and next links.
export function cardPage(card, { cards, index }) {
  const discipline = index.disciplines.find((d) => d.id === card.discipline);
  const entry = index.cards.find((e) => e.id === card.id);
  const siblings = index.cards.filter((e) => e.discipline === card.discipline).sort((a, b) => a.rank - b.rank);
  const at = siblings.findIndex((e) => e.id === card.id);
  const prev = siblings[at - 1];
  const next = siblings[at + 1];
  const { shallow, deep, use } = card;

  const heads = [...deep.mechanism.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());
  let h = 0;
  const mechanism = markdown(deep.mechanism).replace(/<h3>/g, () => `<h3 id="m${h++}">`);
  const originYear = (deep.origin.match(/(\d{3,4}) ?年/) ?? [])[1];
  const year = storyYear(entry);
  const after = cards[use.with[0].id] ?? cards[next?.id];

  const body = `<div class="page wrap" data-card="${escape(card.id)}">
<p class="crumbs"><a href="/">思维模型</a><span class="sep">/</span><a href="/d/${escape(discipline.id)}">${escape(discipline.title)}</a><span class="day" data-day hidden></span></p>
<nav class="toc" aria-label="本页"><ol>
${toc('s-scene', `${year ? `<span class="ty">${escape(year)}</span>` : ''}<span class="ts">${escape(year ? storyRest(entry.story ?? '') : (entry.story || shallow.scene.slice(0, 40)))}</span>`)}
<li class="gap" aria-hidden="true"></li>
${heads.map((t, n) => toc(`m${n}`, md0(t))).join('\n')}
<li class="gap" aria-hidden="true"></li>
${toc('s-uses', use.uses.map((u) => USE_NAME[u.use]).join(' · '))}
${use.examples.map((e, n) => toc(`s-ex${n}`, escape(e.title))).join('\n')}
${use.with.map((w, n) => toc(`s-w${n}`, `<span class="tx">×</span>${escape(cards[w.id].name)}`)).join('\n')}
${toc('s-quiz', `<span class="tq" aria-label="${use.questions.length} 道题">${use.questions.map(() => '<i></i>').join('')}</span>`)}
<span class="ind"></span></ol></nav>
<div class="body">
<header class="head"><h1>${escape(card.name)}</h1><p class="en">${escape(card.en)}</p><p class="one">${escape(card.one_line)}</p></header>

<section class="story" id="s-scene">
<div class="col scene">${markdown(shallow.scene)}</div>
<div class="col plain">${markdown(shallow.plain)}</div>
${card.figure ? figureHtml(card.figure, { live: true, id: card.id }) : ''}
</section>

<section class="why">
<div class="main">${mechanism}<div class="limits">${markdown(deep.limits)}</div></div>
<aside class="origin">${originYear ? `<div class="yr">${originYear}</div>` : ''}${markdown(deep.origin)}</aside>
</section>

<section class="tools" id="s-use">
<div class="blk ua" id="s-uses">
<dl class="uses">${use.uses.map((u) => `<dt>${USE_NAME[u.use]}</dt><dd>${md0(u.text)}</dd>`).join('')}</dl>
<ol class="ask">${use.ask.map((a) => `<li><span>${md0(a)}</span></li>`).join('')}</ol>
</div>
<div class="blk ex3">${use.examples.map((e, n) => `<article id="s-ex${n}"><p class="f">${escape(e.field)}</p><h4>${escape(e.title)}</h4>${markdown(e.text)}</article>`).join('')}</div>
<div class="blk with">${use.with.map((w, n) => {
    const other = cards[w.id];
    return `<a class="w" id="s-w${n}" href="/m/${escape(w.id)}"><span><span class="pair"><span class="me">${escape(card.name)}</span><span class="x" aria-hidden="true">×</span>`
      + `<span class="wn">${escape(other.name)}<span aria-hidden="true">→</span></span></span><span class="wo">${escape(other.one_line)}</span></span><span class="ws">${md0(w.sees)}</span></a>`;
  }).join('')}</div>
<div class="blk" id="s-quiz"><div class="quiz">
<div class="qmain" aria-live="polite">${use.questions.map((q, n) => questionHtml(q, `${card.id}-${n}`)
    + (n < use.questions.length - 1 ? `<button class="qnext" type="button" data-to="${n + 1}" hidden>第 ${n + 2} 题</button>` : '')).join('')}</div>
<aside class="tasks"><ol>${use.questions.map((q, n) => `<li><button type="button" data-i="${n}"><span class="ti">${n + 1}</span><span class="tq">${escape((q.stem.match(/^[^。！？]+/) ?? [q.stem])[0])}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg></button></li>`).join('')}</ol>
${after ? `<a class="cont" href="/m/${escape(after.id)}">${escape(after.name)} →</a>` : ''}</aside>
</div></div>
</section>

${tipAfter()}
<nav class="pn" aria-label="同学科">
${prev ? `<a href="/m/${escape(prev.id)}" rel="prev"><span>← ${escape(discipline.title)}</span><b>${escape(prev.name)}</b></a>` : ''}
${next ? `<a class="r" href="/m/${escape(next.id)}" rel="next"><span>${escape(discipline.title)} →</span><b>${escape(next.name)}</b></a>` : ''}
</nav>
</div>
</div>`;
  const math = /\$/.test([shallow.scene, shallow.plain, deep.mechanism, deep.origin, deep.limits, ...use.examples.map((e) => e.text), ...use.uses.map((u) => u.text), ...use.with.map((w) => w.sees)].join(''));
  const script = card.figure?.kind === 'demo' ? '<script type="module" src="/figs.js"></script>' : '';
  return shell({ title: `${card.name} · 思维模型`, description: card.one_line, body, total: index.cards.length, math, script, report: reportUrl(card.id) });
}

const SEARCH_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>';

// The home page: today's card, then every card by rank with search and filters. `discipline` pre-selects one (/d/<id>);
// `today` is {id, date} for the first paint, and `figure` today's figure, if the card has one.
export function homePage(index, list, { discipline = null, today, figure = null, random = false } = {}) {
  const short = Object.fromEntries(index.disciplines.map((d) => [d.id, d.short]));
  const title = Object.fromEntries(index.disciplines.map((d) => [d.id, d.title]));
  const first = list.find((c) => c.id === today.id);
  const shown = discipline ? list.filter((c) => c.discipline === discipline) : list;
  const body = `<section class="lead wrap"${random ? ' data-go-random' : ''}>
<a class="today" href="/m/${escape(first.id)}" data-lead>${leadHtml(first, today.date, title[first.discipline], figure ? figureHtml(figure) : '')}</a>
<aside class="sub">
<div data-mail hidden><h2>每天一张，发到邮箱</h2>
<form data-subscribe><input name="email" type="email" required maxlength="254" autocomplete="email" aria-label="邮箱" placeholder="you@example.com"><span class="trap" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></span><button type="submit">订阅</button></form>
<p class="done" data-subscribe-status role="status" aria-live="polite"></p></div>
<p class="rss"><a href="/feed.xml">RSS</a> · <a href="/today">今天的题</a></p>
<nav class="past" data-past aria-label="前几天"></nav>
</aside>
</section>
<div class="sieve" id="sieve"><div class="wrap">
<label class="find">${SEARCH_ICON}<input type="search" aria-label="找一张卡" autocomplete="off" data-q></label>
<div class="tg" data-tags>${index.disciplines.map((d) => `<button type="button" data-d="${d.id}" aria-pressed="${d.id === discipline}" title="${escape(d.title)}">${escape(d.short)}</button>`).join('')}<i aria-hidden="true"></i>${USES.map(([u, n]) => `<button type="button" data-u="${u}" aria-pressed="false">${n}</button>`).join('')}</div>
<span class="tot" data-tot></span>
</div></div>
<section class="ranks wrap" data-ranks aria-label="全部卡片">${bands(shown, { short, today: today.id })}</section>
<script type="application/json" id="cards">${JSON.stringify({ list, short, titles: title, discipline }).replace(/</g, '\\u003c')}</script>`;
  const what = discipline ? `${title[discipline]} · 思维模型` : '思维模型';
  return shell({ title: what, description: `${list.length} 张跨学科思维模型卡，按重要程度排列`, body, total: list.length });
}

export function reviewPage(total) {
  const body = `<section class="plainpage wrap"><h1>复习</h1>
<div id="review" class="qs"><p class="empty">还没有读过的卡片。</p></div></section>`;
  return shell({ title: '复习 · 思维模型', description: '复习读过的思维模型', body, total });
}
