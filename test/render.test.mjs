import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdown, validate, cardPage, disciplinePage, indexPage } from '../src/render.mjs';

const question = (right = 0) => ({
  stem: '一位投资者把分红全部再投入。', question: '二十年后会怎样？', explain: '再投入的分红变成新本金。',
  options: [0, 1, 2, 3].map((n) => ({ text: `选项${n}`, correct: n === right, feedback: `反馈${n}` })),
});
// A card that meets the whole schema; `related` is topped up to three with catalog names that have no card yet.
const card = (id, related = []) => ({
  id, name: id === 'a' ? '复利' : '基础比率', en: 'X', discipline: 'math', one_line: id === 'a' ? '一句话 <b>' : '另一句', scene: '场景', mechanism: '**机制** $P(1+r)^n$',
  origin: '出处', examples: ['投资', '生物', '工程'].map((field) => ({ field, title: '标题', text: '正文' })), use: ['问题一', '问题二', '问题三'], limits: '边界',
  related: [...related, ...['soon1', 'soon2', 'soon3'].map((s) => ({ id: s, relation: '互补', why: '…' }))].slice(0, Math.max(3, related.length)),
  questions: [question(), question(2)],
});
const index = { names: { a: '复利', b: '基础比率', later: '以后才写', soon1: '甲', soon2: '乙', soon3: '丙' }, disciplines: [{ id: 'math', title: '数学与统计', models: [{ id: 'a', name: '复利', en: 'X', one_line: '一句话 <b>' }, { id: 'b', name: '基础比率', en: 'Y', one_line: '另一句' }] }] };

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

test('validate holds every card to the full schema', () => {
  const good = { a: card('a', [{ id: 'b', relation: '互补', why: '…' }]), b: card('b') };
  assert.deepEqual(validate(index, good), []);
  const broken = {
    a: { ...good.a, id: 'other', examples: good.a.examples.slice(0, 2), related: [...good.a.related, { id: 'a', relation: '互补', why: '' }] },
    b: { ...good.b, discipline: 'games', questions: [{ ...question(), explain: '' }], use: ['只一个'] },
  };
  const errors = validate(index, broken).join('\n');
  for (const expected of ['文件名和 id', 'examples 要恰好 3 个', 'related 指向自己', '缺 why', '学科 games', '至少要 2 道题', 'explain', 'use 要 3–5 个']) {
    assert.ok(errors.includes(expected), expected);
  }
  assert.match(validate(index, { ...good, 'Bad_Id': card('b') }).join('\n'), /Bad_Id：id 只能用/);
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
  assert.equal((html.match(/data-ok="1"/g) || []).length, cards.a.questions.length);
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

test('every page can be installed: it links the manifest and the touch icon', () => {
  const html = indexPage(index);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(html, /apple-touch-icon/);
});

test('every page states both licenses, and a card page reports errors against that card', () => {
  const cards = { a: card('a', [{ id: 'b', relation: '互补', why: '…' }]), b: card('b') };
  const html = cardPage(cards.a, { cards, index, prev: null, next: 'b' });
  assert.match(html, /MIT/);
  assert.match(html, /CC BY-NC-SA 4\.0/);
  assert.match(html, /issues\/new\?template=content-error\.yml&amp;card=a&amp;title=/);
  assert.match(indexPage(index), /issues\/new\?template=content-error\.yml"/);
});
