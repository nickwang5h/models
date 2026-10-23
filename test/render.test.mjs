import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdown, validate, cardPage, homePage, listData, lede, storyYear } from '../src/render.mjs';
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
  assert.match(html, /<a class="today" href="\/m\/b"/);
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
  assert.match(html, /data-d="math" aria-pressed="true"/);
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
