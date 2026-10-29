// Pages of models.wuhua.app, rendered at build time from content/*.json.
import katex from 'katex';
import { Marked } from 'marked';
import { escape, questionHtml } from '../public/quiz.mjs';
import { USES, bands, leadHtml } from '../public/list.mjs';
import { T, href, uses } from '../public/i18n.mjs';
import { reportUrl, shell, subButton, tipAfter } from './shell.mjs';
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
export function storyYear(entry, lang = 'zh') {
  const label = yearOf(entry);
  return lang === 'en' ? label.replace(/^前 (\d+)$/, '$1 BC').replace(/^(\d)0 年代$/, '19$10s') : label;
}
function yearOf(entry) {
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
export function lede(scene, lang = 'zh') {
  let text = '';
  if (lang === 'en') {
    const flat = scene.replace(/\s*\n+\s*/g, ' ').replace(/\*+/g, '');   // shown as plain text: no *italics*
    for (const sentence of flat.match(/[^.!?]+[.!?]+["”’)]*\s*/g) ?? [flat]) {
      text += sentence;
      if (text.length > 160) break;
    }
    return text.trim();
  }
  const flat = scene.replace(/\s*\n\s*/g, '');
  for (const sentence of flat.match(/[^。！？]+[。！？]/g) ?? [flat]) {
    text += sentence;
    if (text.length > 70) break;
  }
  return text;
}
// A question's first sentence, for the list of three beside it (and the spine on phones).
export const firstSentence = (text, lang = 'zh') => (lang === 'en' ? (text.match(/^.*?[.!?](?=\s|$)/) ?? [text])[0].replace(/[.!?]$/, '') : (text.match(/^[^。！？]+/) ?? [text])[0]);

// What the browser needs for the list, search and today's card: one entry per card, in rank order.
export function listData(index, cards, lang = 'zh') {
  return [...index.cards].sort((a, b) => a.rank - b.rank).map((e) => ({
    id: e.id, name: e.name, en: e.en, discipline: e.discipline, one_line: e.one_line, rank: e.rank, story: e.story ?? '',
    uses: cards[e.id].use.uses.map((u) => u.use), lede: lede(cards[e.id].shallow.scene, lang), fig: cards[e.id].figure != null,
  }));
}

const md0 = (text) => markdown(text, { inline: true });
const toc = (target, html, cls = '') => `<li><a href="#${target}" data-t="${target}"${cls ? ` class="${cls}"` : ''}>${html}</a></li>`;

// `siblings` are the cards of the same discipline in rank order, for the previous and next links. An English page
// (`lang: 'en'`) takes the years from the Chinese card and index entry (`zh`), where they are written as dates.
export function cardPage(card, { cards, index, lang = 'zh', zh = null }) {
  const t = T[lang];
  const at = (path) => href(lang, path);
  const USE_NAME = Object.fromEntries(uses(lang));
  const discipline = index.disciplines.find((d) => d.id === card.discipline);
  const entry = index.cards.find((e) => e.id === card.id);
  const siblings = index.cards.filter((e) => e.discipline === card.discipline).sort((a, b) => a.rank - b.rank);
  const place = siblings.findIndex((e) => e.id === card.id);
  const prev = siblings[place - 1];
  const next = siblings[place + 1];
  const { shallow, deep, use } = card;

  const heads = [...deep.mechanism.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());
  let h = 0;
  const mechanism = markdown(deep.mechanism).replace(/<h3>/g, () => `<h3 id="m${h++}">`);
  const originYear = ((zh?.card ?? card).deep.origin.match(/(\d{3,4}) ?年/) ?? [])[1];
  const year = storyYear(zh?.entry ?? entry, lang);
  const after = cards[use.with[0].id] ?? cards[next?.id];

  const body = `<div class="page wrap" data-card="${escape(card.id)}">
<p class="crumbs"><a href="${at('/')}">${t.site}</a><span class="sep">/</span><a href="${at(`/d/${escape(discipline.id)}`)}">${escape(discipline.title)}</a><span class="day" data-day hidden></span></p>
<nav class="toc" aria-label="${t.outline}" data-toc><span class="grip" aria-hidden="true"></span><ol>
${toc('s-scene', `${year ? `<span class="ty">${escape(year)}</span>` : ''}<span class="ts">${escape(year ? storyRest(entry.story ?? '') : (entry.story || shallow.scene.slice(0, 40)))}</span>`)}
<li class="gap" aria-hidden="true"></li>
${heads.map((t, n) => toc(`m${n}`, md0(t))).join('\n')}
<li class="gap" aria-hidden="true"></li>
${toc('s-uses', use.uses.map((u) => USE_NAME[u.use]).join(' · '))}
${use.examples.map((e, n) => toc(`s-ex${n}`, escape(e.title))).join('\n')}
${use.with.map((w, n) => toc(`s-w${n}`, `<span class="tx">×</span>${escape(cards[w.id].name)}`)).join('\n')}
${toc('s-quiz', `<span class="tq" aria-label="${t.questionsCount(use.questions.length)}">${use.questions.map(() => '<i></i>').join('')}</span>`)}
<span class="ind"></span></ol></nav>
<div class="body">
<header class="head"><h1>${escape(card.name)}</h1><p class="en">${escape(card.en)}</p><p class="one">${escape(card.one_line)}</p>
<a class="hq" href="#s-quiz" aria-label="${t.toQuestions}"><span class="tq" aria-hidden="true">${use.questions.map(() => '<i></i>').join('')}</span></a></header>

<section class="story" id="s-scene">
<div class="col scene">${markdown(shallow.scene)}</div>
<div class="col plain">${markdown(shallow.plain)}</div>
${card.figure ? figureHtml(card.figure, { live: true, id: card.id, lang }) : ''}
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
<div class="blk ex3" data-ex3>${use.examples.map((e, n) => `<article id="s-ex${n}"><p class="f">${escape(e.field)}</p><h4>${escape(e.title)}</h4>${markdown(e.text)}</article>`).join('')}</div>
<div class="ex3dots" data-dots>${use.examples.map((e, n) => `<button type="button" data-ex="${n}" aria-label="${escape(e.title)}"${n ? '' : ' aria-current="true"'}><i></i></button>`).join('')}</div>
<div class="blk with">${use.with.map((w, n) => {
    const other = cards[w.id];
    return `<a class="w" id="s-w${n}" href="${at(`/m/${escape(w.id)}`)}"><span><span class="pair"><span class="me">${escape(card.name)}</span><span class="x" aria-hidden="true">×</span>`
      + `<span class="wn">${escape(other.name)}<span aria-hidden="true">→</span></span></span><span class="wo">${escape(other.one_line)}</span></span><span class="ws">${md0(w.sees)}</span></a>`;
  }).join('')}</div>
<div class="blk" id="s-quiz"><div class="quiz">
<div class="qmain" aria-live="polite">${use.questions.map((q, n) => questionHtml(q, `${card.id}-${n}`)
    + (n < use.questions.length - 1 ? `<button class="qnext" type="button" data-to="${n + 1}" hidden>${t.nextQuestion(n + 2)}</button>` : '')).join('')}</div>
<aside class="tasks"><ol>${use.questions.map((q, n) => `<li><button type="button" data-i="${n}"><span class="ti">${n + 1}</span><span class="tq">${escape(firstSentence(q.stem, lang))}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg></button></li>`).join('')}</ol>
${after ? `<a class="cont" href="${at(`/m/${escape(after.id)}`)}">${escape(after.name)} →</a>` : ''}</aside>
</div></div>
</section>

${tipAfter(lang)}
<nav class="pn" aria-label="${t.sameField}">
${prev ? `<a href="${at(`/m/${escape(prev.id)}`)}" rel="prev"><span>← ${escape(discipline.title)}</span><b>${escape(prev.name)}</b></a>` : ''}
${next ? `<a class="r" href="${at(`/m/${escape(next.id)}`)}" rel="next"><span>${escape(discipline.title)} →</span><b>${escape(next.name)}</b></a>` : ''}
</nav>
</div>
</div>
<div class="spine" data-spine><span class="prog" aria-hidden="true"><i></i></span>
<button class="back" type="button" aria-label="${t.back}" data-back><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
<button class="here" type="button" aria-label="${t.outlineButton}" aria-haspopup="dialog" aria-expanded="false" data-here><span class="hl"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14l5-5 5 5"/></svg></button>
<a class="sq" href="#s-quiz" aria-label="${t.toQuestions}"><span class="tq" aria-hidden="true">${use.questions.map(() => '<i></i>').join('')}</span></a></div>
<div class="scrim" data-scrim hidden></div>`;
  const math = /\$/.test([shallow.scene, shallow.plain, deep.mechanism, deep.origin, deep.limits, ...use.examples.map((e) => e.text), ...use.uses.map((u) => u.text), ...use.with.map((w) => w.sees)].join(''));
  const script = card.figure?.kind === 'demo' ? '<script type="module" src="/figs.js"></script>' : '';
  return shell({ title: t.cardTitle(card.name), description: card.one_line, body, total: index.cards.length, math, script, report: reportUrl(card.id), tab: null, lang, path: `/m/${card.id}` });
}

const DICE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".9"/><circle cx="15" cy="15" r=".9"/><circle cx="15" cy="9" r=".9"/><circle cx="9" cy="15" r=".9"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>';

// The home page: today's card, then every card by rank with search and filters. `discipline` pre-selects one (/d/<id>);
// `today` is {id, date} for the first paint, and `figure` today's figure, if the card has one.
export function homePage(index, list, { discipline = null, today, figure = null, random = false, lang = 'zh' } = {}) {
  const t = T[lang];
  const at = (path) => href(lang, path);
  const short = Object.fromEntries(index.disciplines.map((d) => [d.id, d.short]));
  const title = Object.fromEntries(index.disciplines.map((d) => [d.id, d.title]));
  const first = list.find((c) => c.id === today.id);
  const shown = discipline ? list.filter((c) => c.discipline === discipline) : list;
  const count = {};
  for (const c of list) count[c.discipline] = (count[c.discipline] ?? 0) + 1;
  const body = `<section class="lead wrap"${random ? ' data-go-random' : ''}>
<a class="today" href="${at(`/m/${escape(first.id)}`)}?day=${today.date}" data-lead>${leadHtml(first, today.date, title[first.discipline], figure ? figureHtml(figure, { lang }) : '', lang)}</a>
<aside class="sub">
${lang === 'zh' ? `<div data-mail hidden><h2>每天一张，发到邮箱</h2>
<form data-subscribe><input name="email" type="email" required maxlength="254" autocomplete="email" aria-label="邮箱" placeholder="you@example.com"><span class="trap" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></span>${subButton()}</form>
<p class="done" data-subscribe-status role="status" aria-live="polite"></p></div>
<p class="rss"><a href="/feed.xml">RSS</a><span class="td"> · <a href="/today">今天的题</a></span></p>
` : ''}<nav class="past" data-past aria-label="${t.pastDays}"></nav>
</aside>
</section>
<div class="sieve" id="sieve"><div class="wrap">
<label class="find">${SEARCH_ICON}<input type="search" aria-label="${t.findLabel}" autocomplete="off" data-q></label>
<div class="tg" data-tags>${index.disciplines.map((d) => `<button type="button" data-d="${d.id}" data-n="${count[d.id] ?? 0}" aria-pressed="${d.id === discipline}" title="${escape(d.title)}">${escape(d.short)}</button>`).join('')}<i aria-hidden="true"></i>${uses(lang).map(([u, n]) => `<button type="button" data-u="${u}" aria-pressed="false">${n}</button>`).join('')}</div>
<span class="tot" data-tot></span>
<a class="rand" href="${at('/random')}" data-random>${DICE}<span>${t.random}</span></a>
</div></div>
<section class="ranks wrap" data-ranks aria-label="${t.allCards}">${bands(shown, { short, today: today.id, lang })}</section>
<script type="application/json" id="cards">${JSON.stringify({ list, short, titles: title, discipline }).replace(/</g, '\\u003c')}</script>`;
  const what = discipline ? t.disciplineTitle(title[discipline]) : t.homeTitle;
  return shell({ title: what, description: t.homeDescription(list.length), body, total: list.length, tab: discipline ? 'find' : 'today', lang, path: random ? '/random' : discipline ? `/d/${discipline}` : '/' });
}

// `disciplines` name each question's discipline in the phone layout (one question a screen, app.js); `counts` is how
// many questions each card has, so the queue is known before any question is fetched.
export function reviewPage(total, disciplines = [], lang = 'zh', counts = {}) {
  const t = T[lang];
  const body = `<section class="plainpage wrap rv"><h1>${t.review}</h1>
<div id="review" class="qs"><p class="empty">${t.reviewEmpty}</p></div></section>
<script type="application/json" id="disciplines">${JSON.stringify(Object.fromEntries(disciplines.map((d) => [d.id, d.title]))).replace(/</g, '\\u003c')}</script>`;
  // The question counts, and a head start: the cards of the first questions in line (the order of reviewQueue in
  // progress.mjs: last answered wrong, then never answered, then right; older first; then by rank) start loading
  // while app.js and its modules do.
  const head = `<script type="application/json" id="counts">${JSON.stringify(counts)}</script>
<script>try { (function () { var n = JSON.parse(document.getElementById('counts').textContent), s = JSON.parse(localStorage.getItem('models-progress-v1') || '{}'), read = s.read || {}, last = {}, qs = [], o = 0;
(s.answers || []).forEach(function (a) { last[a.q] = a; });
Object.keys(n).forEach(function (id) { for (var k = 0; k < n[id]; k++, o++) if (read[id]) { var l = last[id + '-' + k]; qs.push({ id: id, rank: !l ? 1 : l.ok ? 2 : 0, at: l ? l.at : 0, o: o }); } });
qs.sort(function (x, y) { return x.rank - y.rank || x.at - y.at || x.o - y.o; });
var seen = {}; qs.forEach(function (q) { if (seen[q.id] || Object.keys(seen).length >= 3) return; seen[q.id] = 1; var l = document.createElement('link'); l.rel = 'preload'; l.as = 'fetch'; l.crossOrigin = 'anonymous'; l.href = '${href(lang, '/q/')}' + q.id + '.json'; document.head.appendChild(l); });
})(); } catch (e) {}</script>
`;
  return shell({ title: t.reviewTitle, description: t.reviewDescription, body, total, tab: 'review', lang, path: '/review', head });
}
