// Checks an English card (content/en/<id>.json) against its Chinese original: the same shape, the same maths, the
// figure drawing the same thing, and no Chinese left except the Chinese name in `en`. `problems` stop the build;
// `notes` (numbers that appear in one and not the other) are for a person to look at, since 10 万 becomes 100,000.
import { figureProblems } from '../public/figure.mjs';

const CJK = /[㐀-鿿豈-﫿　-〿＀-￯]/;
const MATH = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g;
const TEXTS = [['shallow', 'scene'], ['shallow', 'plain'], ['deep', 'mechanism'], ['deep', 'origin'], ['deep', 'limits']];
const paragraphs = (text) => String(text).split(/\n\s*\n/).filter((p) => p.trim()).length;
const maths = (text) => (String(text).match(MATH) ?? []).map((m) => m.replace(/\s+/g, ' ')).sort();
// Numbers as values, so 1,000 matches 1000, 13.1 万 matches 131,000 and 4.6 million matches 460 万.
const SCALE = { 万: 1e4, 亿: 1e8, thousand: 1e3, million: 1e6, billion: 1e9 };
const numbers = (text) => [...String(text).replace(MATH, ' ').replace(/(\d),(?=\d{3}\b)/g, '$1')
  .matchAll(/(\d+(?:\.\d+)?)\s*(万|亿|thousand|million|billion)?/g)]
  .map(([, n, unit]) => String(Math.round(Number(n) * (SCALE[unit] ?? 1) * 1000) / 1000));

// Every string in an object, with its path, except the ones listed in `skip`.
function strings(value, path = '', out = [], skip = new Set()) {
  if (typeof value === 'string') { if (!skip.has(path)) out.push([path, value]); }
  else if (Array.isArray(value)) value.forEach((v, n) => strings(v, `${path}[${n}]`, out, skip));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out, skip);
  return out;
}

// The parts of a figure that are drawing, not words: they must not change in translation.
const FIGURE_WORDS = new Set(['title', 'caption', 'label', 'sub', 'text', 'name', 'unit', 'rowLabel', 'colLabel', 'center', 'centerSub']);
function figureShape(value, key = '') {
  if (Array.isArray(value)) return value.map((v) => figureShape(v, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !FIGURE_WORDS.has(k) && k !== 'format').map(([k, v]) => [k, figureShape(v, k)]));
  if (typeof value === 'string' && ['rows', 'cols', 'categories', 'cells'].includes(key)) return '·';
  return value;
}

export function checkTranslation(zh, en) {
  const problems = [];
  const notes = [];
  const id = zh.id;
  if (en.id !== zh.id) problems.push(`${id}: id is ${en.id}`);
  if (en.discipline !== zh.discipline) problems.push(`${id}: discipline changed`);
  if (en.en !== zh.name) problems.push(`${id}: en should be the Chinese name 「${zh.name}」`);
  for (const [part, key] of TEXTS) {
    const a = zh[part]?.[key] ?? '';
    const b = en[part]?.[key] ?? '';
    if (paragraphs(a) !== paragraphs(b)) problems.push(`${id}: ${part}.${key} has ${paragraphs(b)} paragraphs, the original ${paragraphs(a)}`);
    if (JSON.stringify(maths(a)) !== JSON.stringify(maths(b))) problems.push(`${id}: ${part}.${key} maths differ: ${JSON.stringify(maths(a))} vs ${JSON.stringify(maths(b))}`);
  }
  const heads = (t) => (String(t).match(/^###\s/gm) ?? []).length;
  if (heads(zh.deep.mechanism) !== heads(en.deep?.mechanism ?? '')) problems.push(`${id}: deep.mechanism has ${heads(en.deep?.mechanism ?? '')} ### headings, the original ${heads(zh.deep.mechanism)}`);
  const u = zh.use;
  const v = en.use ?? {};
  if (JSON.stringify(u.uses.map((x) => x.use)) !== JSON.stringify((v.uses ?? []).map((x) => x.use))) problems.push(`${id}: use.uses keys or order changed`);
  if ((v.examples ?? []).length !== u.examples.length) problems.push(`${id}: use.examples count changed`);
  if ((v.ask ?? []).length !== u.ask.length) problems.push(`${id}: use.ask count changed`);
  if (JSON.stringify(u.with.map((x) => x.id)) !== JSON.stringify((v.with ?? []).map((x) => x.id))) problems.push(`${id}: use.with ids or order changed`);
  if ((v.questions ?? []).length !== u.questions.length) problems.push(`${id}: question count changed`);
  u.questions.forEach((q, n) => {
    const r = v.questions?.[n];
    if (!r) return;
    if (JSON.stringify(q.options.map((o) => o.correct)) !== JSON.stringify((r.options ?? []).map((o) => o.correct))) problems.push(`${id}: question ${n + 1}: the right option moved`);
  });
  const smallTexts = [...u.uses.map((x) => x.text), ...u.examples.map((e) => e.text), ...u.with.map((w) => w.sees), ...u.questions.flatMap((q) => [q.stem, q.question, q.explain, ...q.options.flatMap((o) => [o.text, o.feedback])])];
  const smallEn = [...(v.uses ?? []).map((x) => x.text), ...(v.examples ?? []).map((e) => e.text), ...(v.with ?? []).map((w) => w.sees), ...(v.questions ?? []).flatMap((q) => [q.stem, q.question, q.explain, ...(q.options ?? []).flatMap((o) => [o.text, o.feedback])])];
  smallTexts.forEach((t, n) => { if (JSON.stringify(maths(t)) !== JSON.stringify(maths(smallEn[n] ?? ''))) problems.push(`${id}: maths differ in ${t.slice(0, 20)}…`); });
  for (const [path, text] of strings(en, '', [], new Set(['en']))) if (CJK.test(text)) problems.push(`${id}: Chinese left in ${path}: ${text.match(/.{0,12}[㐀-鿿　-〿＀-￯].{0,12}/)?.[0]}`);
  if (Boolean(zh.figure) !== Boolean(en.figure)) problems.push(`${id}: figure added or dropped`);
  if (zh.figure && en.figure) {
    if (JSON.stringify(figureShape(zh.figure)) !== JSON.stringify(figureShape(en.figure))) problems.push(`${id}: the figure draws something different (only its words may change)`);
    for (const p of figureProblems(en.figure)) problems.push(`${id}: figure: ${p}`);
    if (zh.figure.y?.format === 'cn' && en.figure.y?.format !== 'en') notes.push(`${id}: figure y.format is cn in the original; use "en"`);
  }
  const all = (card) => strings(card).filter(([path]) => !path.startsWith('figure')).map(([, t]) => t).join(' ');
  const missing = [...new Set(numbers(all(zh)))].filter((n) => !numbers(all(en)).includes(n));
  if (missing.length) notes.push(`${id}: numbers in the original but not the translation: ${missing.join(', ')}`);
  return { problems, notes };
}
