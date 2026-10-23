import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, figureHtml, figureProblems, figureSvg, formatNumber, runDemo, seeded } from '../public/figure.mjs';
import { leadHtml } from '../public/list.mjs';

const run = (src, env = {}) => compile(src)(env);

test('formulas: precedence, powers, comparisons, functions', () => {
  assert.equal(run('1 + 2 * 3'), 7);
  assert.equal(run('(1 + 2) * 3'), 9);
  assert.equal(run('2 ^ 3 ^ 2'), 512);
  assert.equal(run('-2 ^ 2'), -4);
  assert.equal(run('2 ^ -1'), 0.5);
  assert.equal(run('a * (1 - p/100)', { a: 1, p: 10 }), 0.9);
  assert.equal(run('3 > 2'), 1);
  assert.equal(run('x < 0 ? -x : x', { x: -4 }), 4);
  assert.equal(run('clamp(12, 0, 10) + if(0, 5, 1)'), 11);
  assert.equal(run('log(e)'), 1);
});

test('formulas: unknown names and functions are errors, not code', () => {
  assert.throws(() => compile('alert(1)'), /不认识/);
  assert.throws(() => compile('a.b'), /看不懂/);
  assert.throws(() => run('q + 1', {}), /没有定义/);
  assert.throws(() => compile('1 +'), /没写完/);
  assert.throws(() => run('constructor', {}), /没有定义/);
  assert.throws(() => compile('toString()'), /不认识/);
});

test('seeded random numbers repeat for the same seed', () => {
  const a = seeded(1); const b = seeded(1); const c = seeded(2);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notEqual(xs[0], c());
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('numbers: units, 万 and 亿, decimals from the tick step', () => {
  assert.equal(formatNumber(174494, { format: 'cn' }), '17.4 万');
  assert.equal(formatNumber(23456, { format: 'cn' }), '2.35 万');
  assert.equal(formatNumber(2.5e8, { format: 'cn' }), '2.5 亿');
  assert.equal(formatNumber(25, { unit: '%', step: 25 }), '25%');
  assert.equal(formatNumber(0.25, { step: 0.05 }), '0.25');
});

const demo = {
  kind: 'demo', title: '两种开局，一年后站到同一处', x: { label: '月' }, y: { unit: '%', min: 0, max: 100 },
  params: [{ id: 'p', label: '甲到乙', min: 5, max: 40, step: 5, value: 10, unit: '%' }],
  model: { steps: 12, init: { a: 1 }, next: { a: 'a*(1-p/100) + (1-a)*0.2' } },
  series: [{ name: '甲店份额', expr: 'a*100' }],
  readouts: [{ label: '长期份额', expr: '20/(p+20)*100', unit: '%', digits: 0 }],
};

test('demo: steps the state forward and reads out at the end', () => {
  const r = runDemo(demo);
  assert.equal(r.series[0].points.length, 13);
  assert.equal(r.series[0].points[1][1], 90);
  assert.equal(r.readouts[0].value, '67%');
  assert.equal(runDemo(demo, { p: 20 }).readouts[0].value, '50%');
});

test('demo: random runs are reproducible and differ by seed', () => {
  const coin = { ...demo, runs: 3, params: [{ id: 'q', label: '概率', min: 0, max: 1, step: 0.1, value: 0.5 }], model: { steps: 20, init: { h: 0 }, next: { h: 'h + flip(q)' } }, series: [{ name: '', expr: 'h/k', from: 1 }], readouts: [] };
  assert.equal(runDemo(coin).series.length, 3);
  assert.deepEqual(runDemo(coin, {}, 1).series[0].points, runDemo(coin, {}, 1).series[0].points);
  assert.notDeepEqual(runDemo(coin, {}, 1).series[0].points, runDemo(coin, {}, 2).series[0].points);
  assert.deepEqual(figureProblems(coin), []);
});

test('problems: a good figure has none; bad ones are named', () => {
  assert.deepEqual(figureProblems(demo), []);
  assert.match(figureProblems({ ...demo, kind: 'pie' })[0], /不认识/);
  assert.ok(figureProblems({ ...demo, title: '' }).some((p) => /title/.test(p)));
  assert.ok(figureProblems({ ...demo, params: [{ ...demo.params[0], id: 'n' }] }).some((p) => /不能用/.test(p)));
  assert.ok(figureProblems({ ...demo, series: [{ name: 'x', expr: 'log(p - 20)' }] }).some((p) => /非数/.test(p)));
  const flow = { kind: 'flow', title: '一条链', nodes: [{ id: 'a', label: '起点' }, { id: 'b', label: '终点' }], edges: [{ from: 'a', to: 'c' }] };
  assert.ok(figureProblems(flow).some((p) => /不存在/.test(p)));
  const wide = { kind: 'flow', title: '太宽', nodes: Array.from({ length: 9 }, (_, n) => ({ id: `n${n}`, label: '一个很长的节点名字' })), edges: Array.from({ length: 8 }, (_, n) => ({ from: `n${n}`, to: `n${n + 1}` })) };
  assert.ok(figureProblems(wide).some((p) => /超过 900/.test(p)));
  const grid = { kind: 'grid', title: '四格', rows: ['认真', '省力'], cols: ['认真', '省力'], cells: [['3，3', '0，5'], ['5，0']] };
  assert.ok(figureProblems(grid).some((p) => /一样大/.test(p)));
});

test('svg: escaped text, both widths, a flow back-edge drawn around the outside', () => {
  const flow = { kind: 'flow', title: '<回路>', nodes: [{ id: 'a', label: '甲 & 乙' }, { id: 'b', label: '下一步' }, { id: 'c', label: '回来' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a', dashed: true }] };
  assert.deepEqual(figureProblems(flow), []);
  const svg = figureSvg(flow);
  assert.match(svg, /甲 &amp; 乙/);
  assert.match(svg, /aria-label="&lt;回路&gt;"/);
  assert.match(svg, /class="fg-e fg-d"/);
  const html = figureHtml(flow);
  assert.match(html, /class="fw"[\s\S]*class="fn"/);
});

test('figure html: live demos carry sliders and their spec; elsewhere they are a still picture', () => {
  const live = figureHtml(demo, { live: true, id: 'markov-models' });
  assert.match(live, /type="range"/);
  assert.match(live, /data-spec/);
  assert.match(live, /data-r="0">67%/);
  const still = figureHtml(demo);
  assert.doesNotMatch(still, /type="range"|data-spec/);
  assert.match(leadHtml({ id: 'a', name: '名', en: 'N', one_line: '一句', lede: '开头' }, '2026-10-23', '数学', still), /<p class="one">一句<\/p><figure/);
});
