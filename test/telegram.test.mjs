// ops/models-daily.py sends the card that /today.json names: run its dry run against a local server answering with
// the real handler, and check it announces the same card and question.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createTodayJsonHandler } from '../src/handlers.mjs';
import { today } from '../src/daily.mjs';

const python = (() => { try { execFileSync('python3', ['--version']); return true; } catch { return false; } })();

const question = { stem: '情境', question: '怎么办？', explain: '解析', options: [0, 1, 2, 3].map((k) => ({ text: `选项${k}`, correct: k === 1, feedback: `反馈${k}` })) };
const data = Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, { name: `卡${id}`, en: 'En', discipline: 'math', one_line: `一句 ${id}`, questions: [question] }]));

test('the Telegram push announces the card of /today.json', { skip: !python && 'python3 not found' }, async () => {
  const handler = createTodayJsonHandler({ load: async () => data, site: 'https://models.wuhua.app' });
  const server = createServer(async (req, res) => {
    const response = await handler(new Request(`http://localhost${req.url}`));
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') });
    res.end(await response.text());
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const script = new URL('../ops/models-daily.py', import.meta.url).pathname;
    for (const date of ['2026-10-22', '2027-01-09']) {
      const out = await new Promise((resolve, reject) => execFile('python3', ['-I', script, '--dry-run', '--date', date],
        { env: { ...process.env, MODELS_SITE: `http://127.0.0.1:${port}` } }, (error, stdout) => (error ? reject(error) : resolve(stdout))));
      const day = today(data, date);
      assert.ok(out.startsWith(`${date} ${day.id}`), out);
      assert.ok(out.includes(`今日模型：${day.card.name}`));
      assert.ok(out.includes(`https://models.wuhua.app/m/${day.id}`));
      assert.match(out, /"correct_option_id": 1/);
    }
  } finally {
    server.close();
  }
});

test('the script reads its secrets from a file outside the repository and never embeds one', async () => {
  const source = await readFile(new URL('../ops/models-daily.py', import.meta.url), 'utf8');
  assert.match(source, /expanduser\('~\/vps-msg\.env'\)/);
  assert.doesNotMatch(source, /\d{8,}:[A-Za-z0-9_-]{30,}|re_[A-Za-z0-9]{16,}/);
});
