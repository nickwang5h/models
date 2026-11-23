import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bump, confirmRow, counted, createChannelHandler, createCountsHandler, feedRow, isMachine, readerOf, sourceOf, subscribeRow, todayRow,
} from '../src/count.mjs';
import { today } from '../src/daily.mjs';
import { atomFeed, entryHtml, todayPage } from '../src/today.mjs';

const SITE = 'https://models.wuhua.app';
const NOW = new Date('2026-11-23T10:00:00Z');
const now = () => NOW;
const BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const data = Object.fromEntries(['a', 'b', 'c'].map((id) => [id, {
  name: id, en: id, discipline: 'math', one_line: id,
  questions: [{ stem: 's', question: 'q', explain: 'e', options: [0, 1, 2, 3].map((k) => ({ text: `o${k}`, correct: k === 0, feedback: 'f' })) }],
}]));

// A stand-in for D1 that keeps the rows the way the real table would.
function fakeDb({ broken = false } = {}) {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        bind: (...values) => ({
          async run() {
            if (broken) throw new Error('no such table: counts');
            const [day, kind, name, source, top] = values;
            const key = [day, kind, name, source].join('|');
            const row = rows.get(key) ?? { day, kind, name, source, n: 0, top: 0 };
            rows.set(key, { ...row, n: row.n + 1, top: Math.max(row.top, top) });
          },
          async all() {
            if (broken) throw new Error('no such table: counts');
            assert.match(sql, /^SELECT/);
            return { results: [...rows.values()].filter((row) => row.day >= values[0]) };
          },
        }),
      };
    },
  };
}
const get = (path, headers = {}) => new Request(`${SITE}${path}`, { headers: { 'user-agent': BROWSER, ...headers } });
const only = (db) => { assert.equal(db.rows.size, 1); return [...db.rows.values()][0]; };

test('where a reader came from is a host, never a full address, and our own pages count as nowhere', () => {
  assert.equal(sourceOf(get('/today', { referer: 'https://www.Example.com/a/b?c=1' })), 'www.example.com');
  assert.equal(sourceOf(get('/today', { referer: `${SITE}/m/a` })), '');
  assert.equal(sourceOf(get('/today')), '');
  assert.equal(sourceOf(get('/today', { referer: 'not a url' })), '');
});

test('crawlers and link previews are told from readers', () => {
  for (const agent of ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'TelegramBot (like TwitterBot)', 'facebookexternalhit/1.1', 'WhatsApp/2.23', 'curl/8.7.1', '', null]) assert.ok(isMachine(agent), String(agent));
  for (const agent of [BROWSER, 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36 MicroMessenger/8.0']) assert.ok(!isMachine(agent), agent);
});

test('a feed reader is known by its name and the subscribers it reports', () => {
  assert.deepEqual(readerOf('Feedly/1.0 (+http://www.feedly.com/fetcher.html; 12 subscribers; like FeedFetcher-Google)'), { name: 'Feedly', subscribers: 12 });
  assert.deepEqual(readerOf('Mozilla/5.0 (compatible; Inoreader/1.0; +http://www.inoreader.com/feed-fetcher; 15 subscribers; )'), { name: 'Inoreader', subscribers: 15 });
  assert.deepEqual(readerOf('Feedbin feed-id:1457348 - 8 subscribers'), { name: 'Feedbin', subscribers: 8 });
  assert.deepEqual(readerOf('NetNewsWire (RSS Reader; https://netnewswire.com/)'), { name: 'NetNewsWire', subscribers: 0 });
  assert.deepEqual(readerOf(BROWSER), { name: 'other', subscribers: 0 });
  assert.deepEqual(readerOf('SomeReader/2.1'), { name: 'SomeReader', subscribers: 0 });
});

test('a count adds up by day, kind, name and source, and keeps the largest subscriber figure', async () => {
  const db = fakeDb();
  await bump(db, { day: '2026-11-23', kind: 'feed', name: 'Feedly', top: 12 });
  await bump(db, { day: '2026-11-23', kind: 'feed', name: 'Feedly', top: 9 });
  assert.deepEqual(only(db), { day: '2026-11-23', kind: 'feed', name: 'Feedly', source: '', n: 2, top: 12 });
});

test('a page is served the same with no database, and when the database fails', async () => {
  const handler = async () => new Response('page');
  assert.equal(await (await counted(handler, { db: undefined, describe: todayRow })(get('/today'))).text(), 'page');
  const waited = [];
  const response = await counted(handler, { db: fakeDb({ broken: true }), later: (work) => waited.push(work), now, describe: todayRow })(get('/today'));
  assert.equal(await response.text(), 'page');
  await Promise.all(waited);   // does not reject
});

test('/today counts a reader once, with the host they came from, and never a crawler or a redirect', async () => {
  const db = fakeDb();
  const page = counted(async () => new Response('ok'), { db, now, describe: todayRow });
  await page(get('/today', { referer: 'https://t.co/abc' }));
  await page(get('/today', { 'user-agent': 'Mozilla/5.0 (compatible; bingbot/2.0)' }));
  await counted(async () => new Response(null, { status: 302 }), { db, now, describe: todayRow })(get('/today?date=2026-11-23'));
  assert.deepEqual(only(db), { day: '2026-11-23', kind: 'page', name: '/today', source: 't.co', n: 1, top: 0 });
});

test('the feed counts every fetch under its reader', async () => {
  const db = fakeDb();
  const feed = counted(async () => new Response('<feed/>'), { db, now, describe: feedRow });
  await feed(get('/feed.xml', { 'user-agent': 'Feedly/1.0 (+http://www.feedly.com/fetcher.html; 3 subscribers)' }));
  assert.deepEqual(only(db), { day: '2026-11-23', kind: 'feed', name: 'Feedly', source: '', n: 1, top: 3 });
});

test('a subscription request counts only when a confirmation was sent, under the place of its form', async () => {
  const post = (body) => new Request(`${SITE}/api/subscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const db = fakeDb();
  let seen = null;
  const sent = counted(async (request) => { seen = await request.json(); return new Response(null, { status: 202 }); }, { db, now, describe: subscribeRow });
  await sent(post({ email: 'a@example.com', website: '', place: 'card' }));
  assert.equal(seen.email, 'a@example.com');   // the handler still gets the body
  await sent(post({ email: 'bot@example.com', website: 'http://spam', place: 'card' }));   // the honeypot's pretend 202
  await counted(async () => new Response(null, { status: 502 }), { db, now, describe: subscribeRow })(post({ email: 'a@example.com', website: '', place: 'card' }));
  assert.deepEqual(only(db), { day: '2026-11-23', kind: 'subscribe', name: 'request', source: 'card', n: 1, top: 0 });
  await sent(post({ email: 'a@example.com', website: '', place: '<script>' }));
  assert.ok(db.rows.has('2026-11-23|subscribe|request|other'));
  assert.ok(![...db.rows.values()].some((row) => JSON.stringify(row).includes('example.com')));   // no address is kept
});

test('a confirmation counts when the link was good', async () => {
  const db = fakeDb();
  const to = (location) => counted(async () => new Response(null, { status: 302, headers: { location } }), { db, now, describe: confirmRow })(get('/api/confirm?t=x'));
  await to(`${SITE}/subscribe?expired=1`);
  assert.equal(db.rows.size, 0);
  await to(`${SITE}/subscribe?confirmed=1`);
  assert.deepEqual(only(db), { day: '2026-11-23', kind: 'subscribe', name: 'confirm', source: '', n: 1, top: 0 });
});

test('a channel link counts the visit and leads only to the day, whatever else the link says', async () => {
  const db = fakeDb();
  const load = async () => data;
  const go = (name, path, headers) => createChannelHandler({ db, load, name, now })(get(path, headers));
  const where = async (response) => { assert.equal(response.status, 302); return (await response).headers.get('location'); };
  assert.equal(await where(await go('x', '/x', { referer: 'https://www.xiaohongshu.com/explore/1' })), `${SITE}/today`);
  assert.equal(await where(await go('mail', '/c/mail?d=2026-11-20')), `${SITE}/today?date=2026-11-20`);
  assert.equal(await where(await go('mail', '/c/mail?d=2026-11-20&to=card')), `${SITE}/m/${today(data, '2026-11-20').id}?day=2026-11-20`);
  assert.equal(await where(await go('mail', '/c/mail?d=2026-11-23')), `${SITE}/today`);
  // A date still to come, a broken date, an address smuggled in: all lead to today.
  for (const path of ['/c/mail?d=2027-01-01', '/c/mail?d=nope', '/c/mail?to=https://evil.example', '/c/mail?d=//evil.example']) assert.equal(await where(await go('mail', path)), `${SITE}/today`);
  assert.equal(db.rows.get('2026-11-23|channel|x|www.xiaohongshu.com').n, 1);
  assert.equal(db.rows.get('2026-11-23|channel|mail|').n, 7);
  // An unknown name and a link preview still arrive, uncounted.
  const before = db.rows.size;
  assert.equal(await where(await go('whatever', '/c/whatever')), `${SITE}/today`);
  assert.equal(await where(await go('tg', '/c/tg', { 'user-agent': 'TelegramBot (like TwitterBot)' })), `${SITE}/today`);
  assert.equal(db.rows.size, before);
  assert.equal((await createChannelHandler({ db, load, name: 'x', now })(new Request(`${SITE}/x`, { method: 'POST' }))).status, 405);
});

test('the counts are read with the cron token only', async () => {
  const db = fakeDb();
  await bump(db, { day: '2026-11-23', kind: 'page', name: '/today' });
  await bump(db, { day: '2026-09-01', kind: 'page', name: '/today' });
  const env = { CRON_SECRET: 'cron-test', COUNTS: db };
  const ask = (headers, e = env) => createCountsHandler({ env: e, now })(new Request(`${SITE}/api/counts?days=30`, { headers }));
  assert.equal((await ask({})).status, 401);
  assert.equal((await ask({ authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await ask({ authorization: 'Bearer undefined' }, { COUNTS: db })).status, 401);
  assert.equal((await ask({ authorization: 'Bearer cron-test' }, { CRON_SECRET: 'cron-test' })).status, 503);
  const answer = await (await ask({ authorization: 'Bearer cron-test' })).json();
  assert.equal(answer.since, '2026-10-25');
  assert.deepEqual(answer.rows.map((row) => row.day), ['2026-11-23']);
});

test('the day offers the mail under its question; the feed keeps its direct links', () => {
  const day = today(data, '2026-11-23');
  const page = todayPage(day, '2026-11-23', 3);
  assert.match(page, /<aside class="sub after"[^>]* data-mail data-lazy hidden>[\s\S]*<form data-subscribe data-place="today">/);
  assert.ok(entryHtml(day).includes(`${SITE}/m/${day.id}?day=2026-11-23`));
  assert.ok(!atomFeed([day]).includes('/c/'));
});
