// A day's card as three pictures for a social post, with the words to post beside them:
//   out/share/<date>-<lang>-1.png   the card: its name, its one line, the opening story
//   out/share/<date>-<lang>-2.png   the day's question
//   out/share/<date>-<lang>-3.png   the answer and why
//   out/share/<date>-<lang>.txt     a caption with the link, ready to paste
// The card and question are the site's 今日一卡 for that UTC day (src/daily.mjs), so a post matches /today, the feed and
// the email. Pictures are 1080×1350, drawn by scripts/share.html in headless Chrome, like scripts/og.mjs.
//   node scripts/share.mjs [--date YYYY-MM-DD] [--days N] [--lang zh|en|both] [--out DIR]
//   (CHROME=/path/to/chrome when it isn't in the usual place on a Mac)
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addDays, isDate, today, utcDate } from '../src/daily.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = resolve(option('--out', 'out/share'));
const FIRST = option('--date', utcDate());
const DAYS = Number(option('--days', 1));
const LANGS = option('--lang', 'both') === 'both' ? ['zh', 'en'] : [option('--lang')];
const SITE = 'https://models.wuhua.app';
if (!isDate(FIRST) || !(DAYS >= 1) || LANGS.some((lang) => !['zh', 'en'].includes(lang))) throw new Error('usage: node scripts/share.mjs [--date YYYY-MM-DD] [--days N] [--lang zh|en|both] [--out DIR]');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const W = {
  zh: {
    kick: (date) => `思维模型 · 今日一卡 · ${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日`, site: 'models.wuhua.app',
    toQuestion: '下一张：一道题 →', toAnswer: '下一张：答案 →', read: (id) => `读整张卡：models.wuhua.app/m/${id}`, answer: '答案',
    caption: (day, url) => [`今日一卡：${day.card.name}`, '', day.card.one_line, '', `${day.question.stem}`, day.question.question, '',
      '答案在第三张图。整张卡讲它怎么起作用、什么时候不灵，还有两道题：', url, '', '每天一张，免费，不用注册。', '', '#思维模型 #每日一卡 #认知 #决策'].join('\n'),
  },
  en: {
    kick: (date) => `Mental Models · Card of the day · ${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`, site: 'models.wuhua.app/en',
    toQuestion: 'Next: a question →', toAnswer: 'Next: the answer →', read: (id) => `The whole card: models.wuhua.app/en/m/${id}`, answer: 'Answer',
    caption: (day, url) => [`Card of the day: ${day.card.name}`, '', day.card.one_line, '', day.question.stem, day.question.question, '',
      'The answer is in the third picture. The whole card explains how the model works and when it fails, with two more questions:', url, '', 'One card a day. Free, no account.', '', '#mentalmodels #decisionmaking #thinking'].join('\n'),
  },
};

async function load(lang) {
  const index = JSON.parse(await readFile('content/index.json', 'utf8'));
  const data = {};
  for (const entry of index.cards) {
    const card = JSON.parse(await readFile(join(lang === 'en' ? 'content/en' : 'content', `${entry.id}.json`), 'utf8'));
    data[entry.id] = { name: card.name, en: card.en, one_line: card.one_line, questions: card.use.questions, scene: card.shallow.scene };
  }
  return data;
}

// Markdown marks are not drawn on the picture: the words stay, the stars and brackets go.
const plain = (text) => String(text).replace(/\$\$?([^$]+)\$\$?/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s*\n+\s*/g, ' ').trim();

function slides(day, lang) {
  const t = W[lang];
  const base = { lang, kick: t.kick(day.date), site: t.site, count: 3 };
  const options = day.question.options.map((o) => ({ text: plain(o.text), correct: o.correct }));
  const right = day.question.options.find((o) => o.correct);
  return [
    { ...base, index: 1, kind: 'card', name: day.card.name, en: lang === 'zh' ? day.card.en : '', one: day.card.one_line, story: plain(day.card.scene), next: t.toQuestion },
    { ...base, index: 2, kind: 'question', stem: plain(day.question.stem), question: plain(day.question.question), options, next: t.toAnswer },
    { ...base, index: 3, kind: 'answer', label: t.answer, question: plain(day.question.question), options, feedback: plain(right.feedback), explain: plain(day.question.explain), next: t.read(day.id) },
  ];
}

await mkdir(OUT, { recursive: true });
const template = (await readFile('scripts/share.html', 'utf8')).replace('__FONT__', pathToFileURL(resolve('public/fonts/inter-latin.woff2')).href);
const work = await mkdtemp(join(tmpdir(), 'share-'));
for (const lang of LANGS) {
  const data = await load(lang);
  for (let n = 0; n < DAYS; n += 1) {
    const day = today(data, addDays(FIRST, n));
    for (const slide of slides(day, lang)) {
      const page = join(work, `${day.date}-${lang}-${slide.index}.html`);
      await writeFile(page, template.replace('__SLIDE__', () => JSON.stringify(slide).replace(/</g, '\\u003c')));
      const png = join(OUT, `${day.date}-${lang}-${slide.index}.png`);
      execFileSync(CHROME, ['--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1', '--window-size=1080,1350',
        '--virtual-time-budget=3000', `--user-data-dir=${join(work, 'profile')}`, `--screenshot=${png}`, pathToFileURL(page).href], { stdio: 'ignore' });
    }
    const url = `${SITE}${lang === 'en' ? '/en' : ''}/m/${day.id}?day=${day.date}`;
    await writeFile(join(OUT, `${day.date}-${lang}.txt`), `${W[lang].caption(day, url)}\n`);
    console.log(`${day.date} ${lang}: ${day.card.name} → ${join(OUT, `${day.date}-${lang}-{1,2,3}.png`)}`);
  }
}
