import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdown, validate, cardPage, homePage, listData, lede, reviewPage, storyYear } from '../src/render.mjs';
import { bands, band, matches } from '../public/list.mjs';

const question = (right = 0) => ({
  stem: '你把分红全部再投入。', question: '二十年后会怎样？', explain: '再投入的分红变成新本金。',
  options: [0, 1, 2, 3].map((n) => ({ text: `选项${n}`, correct: n === right, feedback: `反馈${n}` })),
});
// A card that meets the whole schema.
const card = (id, other, third = 'c') => ({
  id, name: id === 'a' ? '复利' : '基础比率', en: id === 'a' ? 'Compounding' : 'Base Rate', discipline: 'math', one_line: id === 'a' ? '一句话 <b>' : '另一句',
  shallow: { scene: '1790 年，富兰克林去世。他留下一笔钱。第三句话。', plain: '大白话。' },
  deep: { mechanism: '### 每期乘同一个倍数\n\n**机制** $P(1+r)^n$\n\n### 第二节\n\n正文', origin: '1626 年的出处。', limits: '边界' },
  use: {
    uses: [{ use: 'predict', text: '估一估' }, { use: 'act', text: '做一做' }],
    examples: ['投资', '生物', '工程'].map((field) => ({ field, title: `${field}的例子`, text: '正文' })),
    ask: ['问题一', '问题二'],
    with: [{ id: other, sees: '一起看' }, { id: third, sees: '再看' }],
    questions: [question(), question(2)],
  },
});
const cards = () => ({ a: card('a', 'b'), b: card('b', 'a'), c: { ...card('c', 'a', 'b'), name: '第三张', en: 'C', one_line: '第三句' } });
const index = {
  disciplines: [{ id: 'math', title: '数学与统计', short: '数学' }],
  cards: [
    { id: 'a', name: '复利', en: 'Compounding', discipline: 'math', one_line: '一句话 <b>', rank: 1, year: 1790, story: '1790 年，富兰克林留下遗嘱' },
    { id: 'b', name: '基础比率', en: 'Base Rate', discipline: 'math', one_line: '另一句', rank: 2, story: '20 世纪 70 年代的实验' },
    { id: 'c', name: '第三张', en: 'C', discipline: 'math', one_line: '第三句', rank: 3 },
  ],
};

test('markdown renders math with KaTeX and keeps bold', () => {
  const html = markdown('**重点** 和 $x^2$ 以及\n\n$$a+b$$');
  assert.match(html, /<strong>重点<\/strong>/);
  assert.match(html, /class="katex"/);
  assert.match(html, /katex-display/);
});

test('bold closes next to Chinese punctuation, which CommonMark flanking rules miss', () => {
  const html = markdown('先说一句。**对方过得更差，并不会让你更好。**判断下一步，看“**自己**”要什么。');
  assert.doesNotMatch(html, /\*\*/);
  assert.match(html, /<strong>对方过得更差，并不会让你更好。<\/strong>判断/);
  assert.match(html, /“<strong>自己<\/strong>”/);
  assert.match(markdown('前文。**$x^2$ 越大越好。**后文'), /<strong><span class="katex">/);
});

test('markdown escapes raw html', () => {
  assert.doesNotMatch(markdown('<script>x</script>'), /<script>/);
});

test('validate accepts a whole card and names each broken part', () => {
  assert.deepEqual(validate(index, cards()), []);
  const c = cards();
  c.a = { ...c.a, id: 'other', use: { ...c.a.use, examples: c.a.use.examples.slice(0, 2), with: [{ id: 'a', sees: '' }, { id: 'nowhere', sees: '…' }], uses: [{ use: 'guess', text: '…' }] } };
  c.b = { ...c.b, discipline: 'games', deep: { ...c.b.deep, limits: '' }, use: { ...c.b.use, ask: ['只一句'], questions: [{ ...question(), explain: '' }] } };
  const errors = validate(index, c).join('\n');
  for (const expected of ['文件名和 id', 'examples 要恰好 3 个', 'with 指向自己', 'nowhere 不存在', '缺 sees', '用途 guess', '学科 games', '缺 deep.limits', 'ask 要 2–4 句', '至少要 2 道题', 'explain']) {
    assert.ok(errors.includes(expected), expected);
  }
  const wrong = { ...c, b: { ...cards().b, use: { ...cards().b.use, questions: [question(), { ...question(), options: question().options.map((o) => ({ ...o, correct: true })) }] } } };
  assert.match(validate(index, wrong).join('\n'), /b：第 2 题要 4 个选项、恰好一个正确/);
  assert.match(validate({ ...index, cards: [...index.cards, { id: 'd', rank: 4 }] }, cards()).join('\n'), /d：索引里有，但没有卡片文件/);
  assert.match(validate({ ...index, cards: index.cards.map((e) => ({ ...e, rank: 1 })) }, cards()).join('\n'), /rank 要从 1 到 3/);
  assert.match(validate(index, { ...cards(), Bad_Id: card('b', 'a') }).join('\n'), /Bad_Id：id 只能用/);
});

test('the story year comes from the index, or from the story sentence', () => {
  assert.equal(storyYear(index.cards[0]), '1790');
  assert.equal(storyYear(index.cards[1]), '70 年代');
  assert.equal(storyYear({ year: -399 }), '前 399');
  assert.equal(storyYear(index.cards[2]), '');
  assert.equal(lede('第一句话说得很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长。第二句。'), '第一句话说得很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长。');
});

test('a card page has no section labels: the outline is the card’s own content', () => {
  const all = cards();
  const html = cardPage(all.a, { cards: all, index });
  assert.match(html, /<span class="ty">1790<\/span><span class="ts">富兰克林留下遗嘱<\/span>/);
  assert.match(html, /<h3 id="m0">每期乘同一个倍数<\/h3>/);
  assert.match(html, /href="#m1" data-t="m1">第二节/);
  assert.match(html, /投资的例子/);
  for (const label of ['开场', '是什么', '拿来做什么', '换个领域', '遇事问自己', '格栅里的邻居', '练一练']) assert.doesNotMatch(html, new RegExp(label));
});

test('a card page links the cards it is read with, escapes text and carries the questions', () => {
  const all = cards();
  const html = cardPage(all.a, { cards: all, index });
  assert.match(html, /class="w" id="s-w0" href="\/m\/b"/);
  assert.match(html, /一起看/);
  assert.match(html, /一句话 &lt;b&gt;/);
  assert.match(html, /data-q="a-0"/);
  assert.equal((html.match(/data-ok="1"/g) || []).length, all.a.use.questions.length);
  assert.match(html, /katex/);
  assert.match(html, /rel="next"[^>]*>|href="\/m\/b" rel="next"/);
  assert.match(html, /<dt>预测<\/dt>/);
});

test('the home page lists every card by rank, in bands that show less as the rank falls', () => {
  const all = cards();
  const list = listData(index, all);
  assert.deepEqual(list.map((c) => c.id), ['a', 'b', 'c']);
  assert.deepEqual(list[0].uses, ['predict', 'act']);
  const html = homePage(index, list, { today: { id: 'b', date: '2026-10-23' } });
  assert.match(html, /10 月 23 日/);
  assert.match(html, /<a class="today" href="\/m\/b\?day=2026-10-23"/);
  assert.match(html, /href="\/m\/a"[\s\S]*href="\/m\/b"[\s\S]*href="\/m\/c"/);
  assert.match(html, /<script type="application\/json" id="cards">/);
  assert.doesNotMatch(html.split('id="cards">')[1], /<b>/);   // the data can't close its own script
  assert.deepEqual([1, 15, 16, 41, 42, 94, 95, 204].map(band), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.match(bands([{ ...list[0], rank: 100 }]), /class="band b4"[\s\S]*title=/);
  assert.match(bands([]), /没有找到/);
  assert.ok(matches(list[0], '富兰克林 compounding'));
  assert.ok(!matches(list[0], '富兰克林 熵'));
});

test('a discipline page is the home page with that discipline chosen', () => {
  const html = homePage(index, listData(index, cards()), { discipline: 'math', today: { id: 'a', date: '2026-10-23' } });
  assert.match(html, /<title>数学与统计 · 思维模型<\/title>/);
  assert.match(html, /data-d="math" data-n="3" aria-pressed="true"/);
});

test('every page can be installed and states both licenses; a card page reports errors against that card', () => {
  const all = cards();
  const home = homePage(index, listData(index, all), { today: { id: 'a', date: '2026-10-23' } });
  assert.match(home, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(home, /apple-touch-icon/);
  const html = cardPage(all.a, { cards: all, index });
  assert.match(html, /MIT/);
  assert.match(html, /CC BY-NC-SA 4\.0/);
  assert.match(html, /issues\/new\?template=content-error\.yml&amp;card=a&amp;title=/);
  assert.match(home, /issues\/new\?template=content-error\.yml"/);
});

test('every page has one support pill in the top bar; a card page ends with the support line once, before its neighbours', () => {
  const all = cards();
  const home = homePage(index, listData(index, all), { today: { id: 'a', date: '2026-10-23' } });
  const html = cardPage(all.a, { cards: all, index });
  for (const page of [home, html]) {
    const bar = page.split('</header>')[0];
    assert.equal(bar.match(/data-tip>/g).length, 1);
    assert.match(bar, /data-tip>[\s\S]*data-theme-toggle/);
    assert.match(bar, /href="https:\/\/ko-fi\.com\/nickwang5h" target="_blank" rel="noopener noreferrer"/);
  }
  assert.doesNotMatch(home, /data-tip-after/);
  assert.equal(html.match(/data-tip-after/g).length, 1);
  // after the questions: the next card, then the dumpling, last; app.js shows it once a session and on a field's last card
  assert.match(html, /id="s-quiz"[\s\S]*<nav class="pn"[^>]*>\n<a class="nx" href="\/m\/[^"]+" rel="next"><span>[^<]+ · 下一张<\/span><b>[\s\S]*<\/nav>\n<aside class="tip-after"[^>]* data-tip-after hidden>[\s\S]*这张卡读完了。/);
  const field = index.cards.filter((e) => e.discipline === all.a.discipline).sort((x, y) => x.rank - y.rank);
  const last = cardPage(all[field.at(-1).id], { cards: all, index });
  assert.match(last, /<a class="nx" href="\/d\/[^"]+"><span>回到<\/span>/);
  assert.match(last, /data-tip-after data-last hidden>/);
});

test('the home page subscribe form submits with the envelope pill', () => {
  const home = homePage(index, listData(index, cards()), { today: { id: 'a', date: '2026-10-23' } });
  assert.match(home, /<form data-subscribe>[\s\S]*<button class="letter" type="submit">[\s\S]*<span>订阅<\/span><\/button><\/form>/);
});

test('a card page carries its question boxes under the name, as one wordless link to the questions', () => {
  const all = cards();
  const html = cardPage(all.a, { cards: all, index });
  const row = html.match(/<a class="hq" href="#s-quiz" aria-label="去答题">([\s\S]*?)<\/a>/);
  assert.ok(row);
  assert.equal(row[1].replace(/<[^>]+>/g, ''), '');
  assert.equal(row[1].match(/<i><\/i>/g).length, all.a.use.questions.length);
  assert.match(html, /<p class="one">[^<]*<\/p>\n<a class="hq"/);
});

test('phones get a bottom bar on every page but a card, which has its spine and outline sheet instead', () => {
  const all = cards();
  const home = homePage(index, listData(index, all), { today: { id: 'a', date: '2026-10-23' } });
  const disc = homePage(index, listData(index, all), { today: { id: 'a', date: '2026-10-23' }, discipline: 'math' });
  const card = cardPage(all.a, { cards: all, index });
  assert.match(home, /<nav class="tabs" aria-label="主导航"><a href="\/" data-tab="today" class="on" aria-current="page">/);
  assert.match(disc, /<a href="\/#sieve" data-tab="find" class="on" aria-current="page">/);
  assert.match(reviewPage(3, index.disciplines), /data-tab="review" class="on"[\s\S]*<b class="due" data-due hidden><\/b>/);
  assert.doesNotMatch(card, /class="tabs"/);
  assert.match(card, /<div class="spine" data-spine>[\s\S]*data-back[\s\S]*data-here[\s\S]*<a class="sq" href="#s-quiz" aria-label="去答题">/);
  assert.match(card, /<div class="scrim" data-scrim hidden><\/div>/);
  // the sheet starts with the way out: the site, then the card's discipline
  assert.match(card, /<nav class="toc" aria-label="本页" data-toc><span class="grip" aria-hidden="true"><\/span>\n<p class="up"><a href="\/">思维模型<\/a><span class="sep">\/<\/span><a href="\/d\/math">[^<]+<\/a><\/p><ol>/);
  for (const page of [home, card]) assert.match(page, /<button class="theme ft" type="button" data-theme-toggle>/);
});

test('the sieve lists each discipline with its number of cards and ends with a random card', () => {
  const home = homePage(index, listData(index, cards()), { today: { id: 'a', date: '2026-10-23' } });
  assert.match(home, /<button type="button" data-d="math" data-n="3"/);
  assert.match(home, /<a class="rand" href="\/random" data-random>/);
  assert.doesNotMatch(home, /data-look/);
});

test('a card page shows which of its three examples is in view, one button each', () => {
  const all = cards();
  const html = cardPage(all.a, { cards: all, index });
  assert.equal(html.match(/<div class="ex3dots" data-dots>([\s\S]*?)<\/div>/)[1].match(/<button type="button" data-ex="\d"/g).length, 3);
});

test('an English page is the same frame in English, every link under /en, each page linking its other half', () => {
  const all = cards();
  const enIndex = { ...index, disciplines: [{ id: 'math', title: 'Mathematics & Statistics', short: 'Math' }] };
  const html = cardPage(all.a, { cards: all, index: enIndex, lang: 'en', zh: { card: all.a, entry: index.cards[0] } });
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<a class="mark" href="\/en\/">Mental Models<small>3 cards · 12 fields<\/small><\/a>/);
  assert.match(html, /<a href="\/en\/d\/math">Mathematics &amp; Statistics<\/a>/);
  assert.match(html, /<a class="w" id="s-w0" href="\/en\/m\/b">/);
  assert.match(html, /<link rel="alternate" hreflang="zh" href="https:\/\/models.wuhua.app\/m\/a"><link rel="alternate" hreflang="en" href="https:\/\/models.wuhua.app\/en\/m\/a">/);
  assert.match(html, /<a href="\/m\/a" hreflang="zh" lang="zh-CN">中文<\/a>/);
  assert.match(html, /<span class="ty">1790<\/span>/);
  assert.doesNotMatch(html, /feed\.xml|data-subscribe|今日一卡/);
  const home = homePage(enIndex, listData(enIndex, all, 'en'), { today: { id: 'a', date: '2026-10-23' }, lang: 'en' });
  assert.match(home, /<a class="today" href="\/en\/m\/a\?day=2026-10-23" data-lead><div class="date"><b>Oct 23<\/b>/);
  assert.match(home, /<a href="\/en\/#sieve" data-tab="find">/);
  assert.match(home, /data-u="predict" aria-pressed="false">Predict<\/button>/);
  assert.doesNotMatch(home, /data-mail|feed\.xml/);
  const zh = cardPage(all.a, { cards: all, index });
  assert.match(zh, /<a href="\/en\/m\/a" hreflang="en" lang="en">English<\/a>/);
});

test('the story year reads as English on an English page', () => {
  assert.equal(storyYear({ year: -45 }, 'en'), '45 BC');
  assert.equal(storyYear({ story: '20 世纪 70 年代的实验' }, 'en'), '1970s');
  assert.equal(storyYear({ year: 1790 }, 'en'), '1790');
});

test('every page says what it is when shared: canonical address, Open Graph and a large image', () => {
  const all = cards();
  const card = cardPage(all.a, { cards: all, index });
  assert.match(card, /<link rel="canonical" href="https:\/\/models\.wuhua\.app\/m\/a">/);
  assert.match(card, /<meta property="og:type" content="article">/);
  assert.match(card, /<meta property="og:url" content="https:\/\/models\.wuhua\.app\/m\/a">/);
  assert.match(card, /<meta property="og:image" content="https:\/\/models\.wuhua\.app\/og\.png">/);
  assert.match(card, /<meta name="twitter:card" content="summary_large_image">/);
  const review = reviewPage(3, index.disciplines, 'en');
  assert.match(review, /<meta property="og:type" content="website">/);
  assert.match(review, /<meta property="og:image" content="https:\/\/models\.wuhua\.app\/og-en\.png">/);
  assert.match(review, /<meta property="og:locale" content="en_US">/);
});
