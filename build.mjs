// Build dist/ from content/: one page per card, the home page (and one per discipline), review, random and subscribe pages.
// /today, /today.json, /feed.xml and /api/* are Pages Functions (functions/) that read dist/questions.json.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cardPage, homePage, listData, reviewPage, validate } from './src/render.mjs';
import { subscribePage } from './src/today.mjs';
import { dailyPick, utcDate } from './src/daily.mjs';

const CONTENT = process.env.MODELS_CONTENT ?? 'content';
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
await writeFile(join(DIST, 'review.html'), reviewPage(total));
await writeFile(join(DIST, 'subscribe.html'), subscribePage(total));
await writeFile(join(DIST, 'ids.json'), JSON.stringify(order));
await writeFile(join(DIST, 'questions.json'), JSON.stringify(Object.fromEntries(order.map((id) => [id, { name: cards[id].name, en: cards[id].en, discipline: cards[id].discipline, one_line: cards[id].one_line, questions: cards[id].use.questions }]))));
console.log(`构建 ${total} 张卡、${index.disciplines.length} 个学科到 ${DIST}/`);
