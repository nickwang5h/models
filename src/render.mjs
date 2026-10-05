// Pages of models.wuhua.app, rendered at build time from content/*.json.
import katex from 'katex';
import { Marked } from 'marked';
import { escape, questionHtml } from '../public/quiz.mjs';

const md = new Marked({ gfm: true });
md.use({ renderer: { html: (token) => escape(token.text ?? '') } });

const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

// Markdown with $…$ and $$…$$ typeset by KaTeX; math is cut out before Markdown so underscores and stars survive.
export function markdown(text, { inline = false } = {}) {
  const pieces = [];
  const held = String(text).replace(MATH, (_, block, line) => {
    pieces.push(katex.renderToString(block ?? line, { displayMode: Boolean(block), throwOnError: false, output: 'html' }));
    return `@@M${pieces.length - 1}@@`;
  });
  const html = inline ? md.parseInline(held) : md.parse(held);
  return html.replace(/@@M(\d+)@@/g, (_, n) => pieces[Number(n)]);
}

const RELATIONS = ['互补', '相反', '常一起出现', '是它的特例', '是它的一般化'];

export function validate(index, cards) {
  const errors = [];
  const listed = index.disciplines.flatMap((d) => d.models.map((m) => m.id));
  for (const id of listed) if (!cards[id]) errors.push(`${id}：索引里有，但没有卡片文件`);
  for (const [id, card] of Object.entries(cards)) {
    for (const key of ['one_line', 'scene', 'mechanism', 'origin', 'examples', 'use', 'limits', 'related', 'questions']) {
      if (!card[key] || (Array.isArray(card[key]) && !card[key].length)) errors.push(`${id}：缺 ${key}`);
    }
    for (const link of card.related ?? []) {
      if (!cards[link.id] && !index.names?.[link.id]) errors.push(`${id}：相关模型 ${link.id} 不存在`);
      if (!RELATIONS.includes(link.relation)) errors.push(`${id}：关系 ${link.relation} 不认识`);
    }
    (card.questions ?? []).forEach((q, n) => {
      if (q.options?.length !== 4 || q.options.filter((o) => o.correct).length !== 1) errors.push(`${id}：第 ${n + 1} 题要 4 个选项、恰好一个正确`);
    });
  }
  return errors;
}

const HUES = { thinking: 260, math: 215, physics: 190, biology: 140, systems: 170, economics: 35, games: 10, psychology: 330,
  business: 55, investing: 95, society: 290, computing: 235 };

function shell({ title, description, body, hue = 215, math = false, script = '' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
${math ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.css">' : ''}
</head>
<body style="--hue:${hue}">
<header class="top"><a class="brand" href="/">思维模型<span>格栅</span></a>
<nav><a href="/random" data-random>随机一张</a><a href="/review">复习</a></nav></header>
<main>
${body}
</main>
<footer class="foot">芒格说：要掌握约一百个来自不同学科的重要模型，让它们互相支撑，形成一张格栅。<br>进度只保存在这个浏览器里。</footer>
<script type="module" src="/app.js"></script>
${script}
</body>
</html>
`;
}

function nameOf(cards, index, id) {
  return cards[id]?.name ?? index.names?.[id] ?? id;
}

export function cardPage(card, { cards, index, prev, next }) {
  const discipline = index.disciplines.find((d) => d.id === card.discipline);
  const order = discipline.models.findIndex((m) => m.id === card.id) + 1;
  const examples = card.examples.map((e) => `<article class="example"><p class="field">${escape(e.field)}</p>`
    + `<h3>${escape(e.title)}</h3>${markdown(e.text)}</article>`).join('');
  const related = card.related.map((link) => {
    const label = `<span class="rel">${escape(link.relation)}</span>${escape(nameOf(cards, index, link.id))}`;
    const head = cards[link.id] ? `<a href="/m/${escape(link.id)}">${label}</a>` : `<span class="soon">${label}</span>`;
    return `<li>${head}<p>${escape(link.why)}</p></li>`;
  }).join('');
  const questions = card.questions.map((q, n) => questionHtml(q, `${card.id}-${n}`)).join('');
  const step = (id, label) => (id ? `<a href="/m/${escape(id)}">${label}${escape(nameOf(cards, index, id))}</a>` : '<span></span>');
  const body = `<article class="card" data-card="${escape(card.id)}">
<p class="crumb"><a href="/d/${escape(discipline.id)}">${escape(discipline.title)}</a> · ${order}/${discipline.models.length}</p>
<h1>${escape(card.name)}<small>${escape(card.en)}</small></h1>
<p class="lead">${escape(card.one_line)}</p>
<section class="scene">${markdown(card.scene)}</section>
<section><h2>为什么成立</h2>${markdown(card.mechanism)}</section>
<section class="origin"><h2>出处</h2>${markdown(card.origin)}</section>
<section><h2>换个领域看</h2><div class="examples">${examples}</div></section>
<section class="use"><h2>遇事时问自己</h2><ol>${card.use.map((u) => `<li>${markdown(u, { inline: true })}</li>`).join('')}</ol></section>
<section class="limits"><h2>边界与误用</h2>${markdown(card.limits)}</section>
<section class="quiz" id="quiz"><h2>练一练</h2>${questions}</section>
<section class="related"><h2>格栅里的邻居</h2><ul>${related}</ul></section>
<nav class="steps">${step(prev, '← ')}${step(next, '')}</nav>
</article>`;
  const math = /\$/.test([card.scene, card.mechanism, card.origin, card.limits, ...card.examples.map((e) => e.text)].join(''));
  return shell({ title: `${card.name} · 思维模型`, description: card.one_line, body, hue: HUES[card.discipline], math });
}

function tile(model, read = '') {
  return `<li><a href="/m/${escape(model.id)}" data-id="${escape(model.id)}"><strong>${escape(model.name)}</strong>`
    + `<span>${escape(model.one_line)}</span>${read}</a></li>`;
}

export function disciplinePage(discipline, { index }) {
  const body = `<section class="discipline" data-ids="${discipline.models.map((m) => escape(m.id)).join(' ')}">
<p class="crumb"><a href="/">全部学科</a></p>
<h1>${escape(discipline.title)}</h1>
<p class="tally" data-tally></p>
<ul class="tiles">${discipline.models.map((m) => tile(m)).join('')}</ul>
</section>`;
  return shell({ title: `${discipline.title} · 思维模型`, description: `${discipline.title}里的 ${discipline.models.length} 个思维模型`, body, hue: HUES[discipline.id] });
}

export function indexPage(index) {
  const total = index.disciplines.reduce((n, d) => n + d.models.length, 0);
  const groups = index.disciplines.filter((d) => d.models.length).map((d) => `<li style="--hue:${HUES[d.id] ?? 215}">`
    + `<a href="/d/${escape(d.id)}" data-ids="${d.models.map((m) => escape(m.id)).join(' ')}"><strong>${escape(d.title)}</strong>`
    + `<span>${d.models.length} 张</span><span class="bar"><i data-bar></i></span>`
    + `<em>${d.models.slice(0, 4).map((m) => escape(m.name)).join(' · ')}${d.models.length > 4 ? ' …' : ''}</em></a></li>`).join('');
  const body = `<section class="home">
<h1>思维模型</h1>
<p class="lead">${total} 个来自不同学科的模型。每张卡讲透一个：一个真实的故事、它为什么成立、换个领域怎么用、什么时候会用错，最后做几道题。</p>
<p class="tally" data-tally></p>
<ul class="groups">${groups}</ul>
</section>`;
  return shell({ title: '思维模型', description: `${total} 张跨学科思维模型卡`, body });
}

export function reviewPage() {
  const body = `<section class="review"><h1>复习</h1>
<p class="lead">只出你读过的卡片的题，上次答错的排在最前。</p>
<div id="review"><p class="empty">还没有读过的卡片。先去读几张吧。</p></div></section>`;
  return shell({ title: '复习 · 思维模型', description: '复习读过的思维模型', body });
}
