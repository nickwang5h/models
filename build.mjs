// Build dist/ from content/: one page per card and discipline, the home page, review and random pages.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cardPage, disciplinePage, indexPage, reviewPage, validate } from './src/render.mjs';

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
await cp('public', DIST, { recursive: true });

const order = index.disciplines.flatMap((d) => d.models.map((m) => m.id));
for (const [n, id] of order.entries()) {
  await writeFile(join(DIST, 'm', `${id}.html`), cardPage(cards[id], { cards, index, prev: order[n - 1] ?? null, next: order[n + 1] ?? null }));
}
for (const discipline of index.disciplines.filter((d) => d.models.length)) {
  await writeFile(join(DIST, 'd', `${discipline.id}.html`), disciplinePage(discipline, { cards, index }));
}
await writeFile(join(DIST, 'index.html'), indexPage(index));
await writeFile(join(DIST, 'review.html'), reviewPage());
await writeFile(join(DIST, 'random.html'), indexPage(index).replace('<section class="home">', '<section class="home" data-go-random>'));
await writeFile(join(DIST, 'ids.json'), JSON.stringify(order));
await writeFile(join(DIST, 'questions.json'), JSON.stringify(Object.fromEntries(order.map((id) => [id, { name: cards[id].name, one_line: cards[id].one_line, questions: cards[id].questions }]))));
console.log(`构建 ${order.length} 张卡、${index.disciplines.filter((d) => d.models.length).length} 个学科到 ${DIST}/`);
