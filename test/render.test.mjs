import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdown, validate, cardPage, disciplinePage, indexPage } from '../src/render.mjs';

const question = (right = 0) => ({
  stem: '一位投资者把分红全部再投入。', question: '二十年后会怎样？', explain: '再投入的分红变成新本金。',
  options: [0, 1, 2, 3].map((n) => ({ text: `选项${n}`, correct: n === right, feedback: `反馈${n}` })),
});
const card = (id, related = []) => ({
  id, name: id === 'a' ? '复利' : '基础比率', en: 'X', discipline: 'math', one_line: '一句话 <b>', scene: '场景', mechanism: '**机制** $P(1+r)^n$',
  origin: '出处', examples: [{ field: '投资', title: '标题', text: '正文' }], use: ['问题一'], limits: '边界', related, questions: [question()],
});
const index = { names: { a: '复利', b: '基础比率', later: '以后才写' }, disciplines: [{ id: 'math', title: '数学与统计', models: [{ id: 'a', name: '复利', en: 'X', one_line: '一句话' }, { id: 'b', name: '基础比率', en: 'Y', one_line: '另一句' }] }] };

test('markdown renders math with KaTeX and keeps bold', () => {
  const html = markdown('**重点** 和 $x^2$ 以及\n\n$$a+b$$');
  assert.match(html, /<strong>重点<\/strong>/);
  assert.match(html, /class="katex"/);
  assert.match(html, /katex-display/);
});

test('markdown leaves currency-free text alone and escapes raw html', () => {
  assert.doesNotMatch(markdown('<script>x</script>'), /<script>/);
});

test('validate finds broken links, bad questions and missing cards', () => {
  const cards = { a: card('a', [{ id: 'nowhere', relation: '互补', why: '…' }]), b: { ...card('b'), questions: [question(), { ...question(), options: question().options.map((o) => ({ ...o, correct: true })) }] } };
  const errors = validate(index, cards);
  assert.ok(errors.some((e) => e.includes('nowhere')));
  assert.ok(errors.some((e) => e.includes('b') && e.includes('正确')));
  assert.ok(validate({ disciplines: [{ ...index.disciplines[0], models: [...index.disciplines[0].models, { id: 'c' }] }] }, { a: card('a'), b: card('b') }).some((e) => e.includes('c')));
  assert.deepEqual(validate(index, { a: card('a', [{ id: 'b', relation: '互补', why: '…' }]), b: card('b', [{ id: 'a', relation: '相反', why: '…' }]) }), []);
});

test('related models in the catalog but not built yet are named without a link', () => {
  const cards = { a: card('a', [{ id: 'later', relation: '互补', why: '…' }]), b: card('b', [{ id: 'a', relation: '相反', why: '…' }]) };
  assert.deepEqual(validate(index, cards), []);
  const html = cardPage(cards.a, { cards, index, prev: null, next: null });
  assert.match(html, /以后才写/);
  assert.doesNotMatch(html, /href="\/m\/later"/);
});

test('card page links related cards, escapes text and carries the questions', () => {
  const cards = { a: card('a', [{ id: 'b', relation: '互补', why: '先看同类' }]), b: card('b') };
  const html = cardPage(cards.a, { cards, index, prev: null, next: 'b' });
  assert.match(html, /href="\/m\/b"/);
  assert.match(html, /基础比率/);
  assert.match(html, /先看同类/);
  assert.match(html, /一句话 &lt;b&gt;/);
  assert.match(html, /data-q="a-0"/);
  assert.equal((html.match(/data-ok="1"/g) || []).length, 1);
  assert.match(html, /katex/);
});

test('discipline and index pages list every card', () => {
  const cards = { a: card('a'), b: card('b') };
  assert.match(disciplinePage(index.disciplines[0], { cards, index }), /href="\/m\/a"[\s\S]*href="\/m\/b"/);
  const home = indexPage(index);
  assert.match(home, /数学与统计/);
  assert.match(home, /href="\/d\/math"/);
  assert.match(home, /2 张/);
});
