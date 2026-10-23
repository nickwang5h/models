// Write a figure into a card: node scripts/set-figure.mjs <id> <figure.json | -> (stdin), or --remove.
// Checks the figure the same way the build does, and keeps the card file's layout (indent 1, newline at the end).
import { readFile, writeFile } from 'node:fs/promises';
import { figureProblems } from '../public/figure.mjs';

const [id, source] = process.argv.slice(2);
if (!id || !source) {
  console.error('用法：node scripts/set-figure.mjs <id> <figure.json | - | --remove>');
  process.exit(2);
}
const path = `content/${id}.json`;
const card = JSON.parse(await readFile(path, 'utf8'));
if (source === '--remove') delete card.figure;
else {
  const text = source === '-' ? await new Promise((done) => { let s = ''; process.stdin.on('data', (d) => { s += d; }).on('end', () => done(s)); }) : await readFile(source, 'utf8');
  const figure = JSON.parse(text);
  const problems = figureProblems(figure);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  card.figure = figure;
}
await writeFile(path, `${JSON.stringify(card, null, 1)}\n`);
console.log(source === '--remove' ? `${id}：已去掉 figure` : `${id}：figure 已写入（${card.figure.kind}）`);
