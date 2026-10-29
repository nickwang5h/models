// Build dist/ from content/: one page per card, the home page (and one per discipline), review, random and subscribe pages.
// /today, /today.json, /feed.xml and /api/* are Pages Functions (functions/) that read dist/questions.json.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cardPage, homePage, listData, reviewPage, validate } from './src/render.mjs';
import { subscribePage } from './src/today.mjs';
import { dailyPick, utcDate } from './src/daily.mjs';
import { checkTranslation } from './src/translation.mjs';
import { existsSync } from 'node:fs';

const CONTENT = process.env.MODELS_CONTENT ?? 'content';
const questionCounts = (set, ids) => Object.fromEntries(ids.map((id) => [id, set[id].use.questions.length]));
async function writeQuestions(dir, set, ids) {
  await mkdir(join(dir, 'q'), { recursive: true });
  for (const id of ids) await writeFile(join(dir, 'q', `${id}.json`), JSON.stringify({ name: set[id].name, en: set[id].en, discipline: set[id].discipline, one_line: set[id].one_line, questions: set[id].use.questions }));
}
const DIST = 'dist';

const index = JSON.parse(await readFile(join(CONTENT, 'index.json'), 'utf8'));
const cards = {};
for (const name of await readdir(CONTENT)) {
  if (name.endsWith('.json') && name !== 'index.json') cards[name.slice(0, -5)] = JSON.parse(await readFile(join(CONTENT, name), 'utf8'));
}
const errors = validate(index, cards);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, 'm'), { recursive: true });
await mkdir(join(DIST, 'd'), { recursive: true });
await mkdir(join(DIST, 'fig'), { recursive: true });
await cp('public', DIST, { recursive: true });
await cp('src/daily.mjs', join(DIST, 'daily.mjs'));   // the browser picks today's card the same way the Functions do

const list = listData(index, cards);
const order = list.map((c) => c.id);
const total = order.length;
// The first paint of the home page shows the build day's card; app.js redraws it for the reader's day.
const date = utcDate();
const today = { id: dailyPick(order, date).id, date };
for (const id of order) await writeFile(join(DIST, 'm', `${id}.html`), cardPage(cards[id], { cards, index }));
// Each figure on its own, for the home page when the reader's day has a different card than the build's.
for (const id of order) if (cards[id].figure) await writeFile(join(DIST, 'fig', `${id}.json`), JSON.stringify(cards[id].figure));
const figure = cards[today.id].figure ?? null;
for (const d of index.disciplines) await writeFile(join(DIST, 'd', `${d.id}.html`), homePage(index, list, { discipline: d.id, today, figure }));
await writeFile(join(DIST, 'index.html'), homePage(index, list, { today, figure }));
await writeFile(join(DIST, 'random.html'), homePage(index, list, { today, figure, random: true }));
await writeFile(join(DIST, 'review.html'), reviewPage(total, index.disciplines, 'zh', questionCounts(cards, order)));
await writeFile(join(DIST, 'subscribe.html'), subscribePage(total));
await writeFile(join(DIST, 'ids.json'), JSON.stringify(order));
await writeFile(join(DIST, 'questions.json'), JSON.stringify(Object.fromEntries(order.map((id) => [id, { name: cards[id].name, en: cards[id].en, discipline: cards[id].discipline, one_line: cards[id].one_line, questions: cards[id].use.questions }]))));
// The browser needs far less than questions.json (the Functions' copy): how many questions each card has (the review
// count, the review queue) and, for the questions it shows, one card's questions at a time.
await writeFile(join(DIST, 'qn.json'), JSON.stringify(questionCounts(cards, order)));
await writeQuestions(DIST, cards, order);
console.log(`构建 ${total} 张卡、${index.disciplines.length} 个学科到 ${DIST}/`);

// English under /en: content/en/<id>.json (the same cards, translated, each with its story line in `story`) and
// content/en/index.json (the disciplines' names). Every card must be there and match its original (src/translation.mjs);
// MODELS_EN_PARTIAL=1 builds a preview with the Chinese card standing in for any not yet translated.
const EN = join(CONTENT, 'en');
if (existsSync(join(EN, 'index.json'))) {
  const overlay = JSON.parse(await readFile(join(EN, 'index.json'), 'utf8'));
  const partial = process.env.MODELS_EN_PARTIAL === '1';
  const en = {};
  const problems = [];
  let stand = 0;
  for (const id of order) {
    const file = join(EN, `${id}.json`);
    if (!existsSync(file)) {
      if (partial) { en[id] = { ...cards[id], en: cards[id].name }; stand++; continue; }
      problems.push(`${id}: no English card`);
      continue;
    }
    let card = null;
    let found = [];
    try { card = JSON.parse(await readFile(file, 'utf8')); found = checkTranslation(cards[id], card).problems; } catch (error) { found = [`${id}: ${error.message}`]; }
    if (found.length && partial) { console.warn(`(preview) ${id} stays Chinese: ${found[0]}`); en[id] = { ...cards[id], en: cards[id].name }; stand++; continue; }
    en[id] = card;
    problems.push(...found);
  }
  const enIndex = {
    disciplines: index.disciplines.map((d) => ({ ...d, ...overlay.disciplines.find((o) => o.id === d.id) })),
    cards: index.cards.map((e) => ({ ...e, name: en[e.id]?.name, en: en[e.id]?.en, one_line: en[e.id]?.one_line, story: en[e.id]?.story ?? overlay.cards?.[e.id]?.story ?? (partial ? e.story : '') })),
  };
  if (!partial) for (const e of enIndex.cards) if (!e.story && index.cards.find((c) => c.id === e.id).story) problems.push(`${e.id}: no English story line in content/en/index.json`);
  problems.push(...validate(enIndex, en));
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const OUT = join(DIST, 'en');
  for (const dir of ['m', 'd', 'fig']) await mkdir(join(OUT, dir), { recursive: true });
  const enList = listData(enIndex, en, 'en');
  const zhEntry = Object.fromEntries(index.cards.map((e) => [e.id, e]));
  for (const id of order) await writeFile(join(OUT, 'm', `${id}.html`), cardPage(en[id], { cards: en, index: enIndex, lang: 'en', zh: { card: cards[id], entry: zhEntry[id] } }));
  for (const id of order) if (en[id].figure) await writeFile(join(OUT, 'fig', `${id}.json`), JSON.stringify(en[id].figure));
  const enFigure = en[today.id].figure ?? null;
  for (const d of enIndex.disciplines) await writeFile(join(OUT, 'd', `${d.id}.html`), homePage(enIndex, enList, { discipline: d.id, today, figure: enFigure, lang: 'en' }));
  await writeFile(join(OUT, 'index.html'), homePage(enIndex, enList, { today, figure: enFigure, lang: 'en' }));
  await writeFile(join(OUT, 'random.html'), homePage(enIndex, enList, { today, figure: enFigure, random: true, lang: 'en' }));
  await writeFile(join(OUT, 'review.html'), reviewPage(total, enIndex.disciplines, 'en', questionCounts(en, order)));
  await writeFile(join(OUT, 'qn.json'), JSON.stringify(questionCounts(en, order)));
  await writeQuestions(OUT, en, order);
  await writeFile(join(OUT, 'questions.json'), JSON.stringify(Object.fromEntries(order.map((id) => [id, { name: en[id].name, en: en[id].en, discipline: en[id].discipline, one_line: en[id].one_line, questions: en[id].use.questions }]))));
  console.log(`English: ${total - stand} cards${stand ? ` (${stand} still in Chinese)` : ''} to ${OUT}/`);
}
