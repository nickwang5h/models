import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('the cards export as an e-book and as Anki notes in both languages', async () => {
  const out = await mkdtemp(join(tmpdir(), 'models-book-'));
  try {
    await run(process.execPath, ['scripts/export-book.mjs', '--out', out, '--date', '2026-11-22']);
    const index = JSON.parse(await readFile('content/index.json', 'utf8'));
    for (const lang of ['zh', 'en']) {
      const epub = await readFile(join(out, `models-${lang}.epub`));
      // An EPUB is a ZIP whose first entry is the stored file `mimetype`.
      assert.equal(epub.readUInt32LE(0), 0x04034b50);
      assert.equal(epub.readUInt16LE(8), 0);
      assert.equal(epub.subarray(30, 38).toString(), 'mimetype');
      assert.equal(epub.subarray(38, 58).toString(), 'application/epub+zip');
      // title, about, one page per discipline and per card, then nav, the stylesheet, the package file and the container
      assert.equal(epub.readUInt16LE(epub.length - 12), 2 + index.disciplines.length + index.cards.length + 5);

      const rows = (await readFile(join(out, `models-${lang}.anki.txt`), 'utf8')).split('\n').filter((line) => line && !line.startsWith('#'));
      assert.equal(rows.length, index.cards.length * 4);   // the card itself and its three questions
      for (const row of rows) assert.equal(row.split('\t').length, 3);
    }
    // The same date gives the same bytes, so a rebuilt book can be compared with the last one.
    const first = await readFile(join(out, 'models-zh.epub'));
    await run(process.execPath, ['scripts/export-book.mjs', '--out', out, '--date', '2026-11-22']);
    assert.ok(first.equals(await readFile(join(out, 'models-zh.epub'))));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
