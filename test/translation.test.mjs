import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkTranslation } from '../src/translation.mjs';
import { formatNumber } from '../public/figure.mjs';
import { dayLabel } from '../public/i18n.mjs';

const zh = JSON.parse(readFileSync('content/compounding.json', 'utf8'));
const en = JSON.parse(readFileSync('content/en/compounding.json', 'utf8'));

test('the reference English card matches its original', () => {
  assert.deepEqual(checkTranslation(zh, en).problems, []);
});

test('a translation that drops a paragraph, changes maths, moves the right answer or keeps Chinese is caught', () => {
  const bad = structuredClone(en);
  bad.shallow.scene = bad.shallow.scene.split('\n\n').slice(1).join('\n\n');
  bad.deep.mechanism = bad.deep.mechanism.replace('$$A_n=P(1+r)^n$$', '$$A_n=P(1+r)^{n}$$');
  bad.use.questions[0].options[0].correct = true;
  bad.use.questions[0].options[1].correct = false;
  bad.use.ask[0] = '还是中文';
  bad.figure.params[0].max = 30;
  const problems = checkTranslation(zh, bad).problems.join('\n');
  assert.match(problems, /shallow\.scene has 2 paragraphs, the original 3/);
  assert.match(problems, /deep\.mechanism maths differ/);
  assert.match(problems, /question 1: the right option moved/);
  assert.match(problems, /Chinese left in use\.ask\[0\]/);
  assert.match(problems, /the figure draws something different/);
});

test('English numbers and dates', () => {
  assert.equal(formatNumber(174494, { format: 'en' }), '174k');
  assert.equal(formatNumber(4061000, { format: 'en' }), '4.1M');
  assert.equal(formatNumber(950, { format: 'en' }), '950');
  assert.equal(dayLabel('2026-10-29', 'en'), 'Oct 29');
  assert.equal(dayLabel('2026-10-29'), '10 月 29 日');
});
