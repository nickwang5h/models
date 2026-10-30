// The share images: scripts/og.html at 1200×630 in headless Chrome, into public/og.png and public/og-en.png.
//   node scripts/og.mjs        (CHROME=/path/to/chrome when it isn't in the usual place on a Mac)
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const page = pathToFileURL(resolve('scripts/og.html')).href;
for (const [lang, out] of [['zh', 'public/og.png'], ['en', 'public/og-en.png']]) {
  execFileSync(CHROME, ['--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1',
    '--window-size=1200,630', '--virtual-time-budget=3000', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'og-'))}`,
    `--screenshot=${resolve(out)}`, `${page}?lang=${lang}`], { stdio: 'ignore' });
  console.log(out);
}
