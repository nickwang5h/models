// node scripts/check-en.mjs [id …] — checks English cards (content/en/<id>.json) against their originals, as the build
// does (src/translation.mjs), plus the story line. With no ids, every English card there is. Exits 1 on any problem.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { checkTranslation } from '../src/translation.mjs';

const index = JSON.parse(readFileSync('content/index.json', 'utf8'));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync('content/en').filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -5));
let bad = 0;
for (const id of ids) {
  const file = `content/en/${id}.json`;
  if (!existsSync(file)) { console.log(`${id}: no English card yet`); bad++; continue; }
  let en;
  try { en = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { console.log(`${id}: not valid JSON: ${error.message}`); bad++; continue; }
  const zh = JSON.parse(readFileSync(`content/${id}.json`, 'utf8'));
  const { problems, notes } = checkTranslation(zh, en);
  const entry = index.cards.find((c) => c.id === id);
  if (entry?.story && !(typeof en.story === 'string' && en.story.trim())) problems.push(`${id}: story is missing (the opening story in one line)`);
  if (/^\d{3,4}\b/.test(en.story ?? '') && entry?.year) problems.push(`${id}: story should not start with the year; the year is shown on its own`);
  for (const p of problems) console.log(`PROBLEM ${p}`);
  for (const n of notes) console.log(`note    ${n}`);
  if (!problems.length) console.log(`ok      ${id}`);
  bad += problems.length ? 1 : 0;
}
process.exit(bad ? 1 : 0);
