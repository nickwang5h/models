import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EPOCH, addDays, cycleOrder, dailyPick, dayNumber, isDate, recentDates, secondsLeft, today, todayJson, utcDate } from '../src/daily.mjs';
import { createFeedHandler, createTodayHandler, createTodayJsonHandler } from '../src/handlers.mjs';
import { atomFeed, entryHtml } from '../src/today.mjs';

const question = (n) => ({
  stem: `情境 ${n} <i>`, question: `问题 ${n}？`, explain: '解析',
  options: [0, 1, 2, 3].map((k) => ({ text: `选项 ${k}`, correct: k === n % 4, feedback: `反馈 ${k}` })),
});
const ids = ['anchoring', 'base-rate', 'compounding', 'inversion', 'entropy', 'moat', 'sunk-cost'];
const data = Object.fromEntries(ids.map((id, n) => [id, {
  name: `卡${n} & 名`, en: `Card ${n}`, discipline: 'math', one_line: `一句话 ${n}`, questions: [question(0), question(1), question(2)],
}]));
const at = (iso) => () => new Date(iso);
const load = async () => data;

test('dates: validation, arithmetic and the day count from the epoch', () => {
  assert.ok(isDate('2026-10-22'));
  for (const bad of ['2026-02-30', '2026-1-01', '20261022', '', null, '2026-10-22T00:00']) assert.equal(isDate(bad), false);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(dayNumber(EPOCH), 0);
  assert.equal(dayNumber(addDays(EPOCH, 400)), 400);
  assert.equal(dayNumber(addDays(EPOCH, -3)), -3);
  assert.equal(utcDate(new Date('2026-10-22T23:59:59-07:00')), '2026-10-23');
});

test('the pick is a pure function of the date and the set of ids', () => {
  for (let n = -20; n < 40; n++) {
    const date = addDays(EPOCH, n);
    assert.deepEqual(dailyPick(ids, date), dailyPick([...ids].reverse(), date));
    assert.deepEqual(dailyPick(ids, date), dailyPick([...ids, ids[0]], date));
  }
  assert.throws(() => dailyPick(ids, 'tomorrow'));
  assert.throws(() => dailyPick([], EPOCH));
});

test('each cycle shows every card exactly once, in a different order from the next cycle', () => {
  for (const cycle of [-1, 0, 1, 2, 5]) {
    const days = ids.map((_, n) => dailyPick(ids, addDays(EPOCH, cycle * ids.length + n)));
    assert.deepEqual(days.map((d) => d.id).sort(), [...ids].sort());
    assert.ok(days.every((d) => d.cycle === cycle));
  }
  assert.notDeepEqual(cycleOrder(ids, 0), cycleOrder(ids, 1));
});

test('the n-th pass through the deck asks each card its n-th question', () => {
  const first = today(data, EPOCH);
  const again = today(data, addDays(EPOCH, ids.length));
  assert.equal(first.questionIndex, 0);
  const cycles = [0, 1, 2, 3].map((c) => ids.map((_, n) => today(data, addDays(EPOCH, c * ids.length + n))));
  for (const [c, days] of cycles.entries()) for (const day of days) {
    assert.equal(day.questionIndex, c % 3);
    assert.deepEqual(day.question, data[day.id].questions[c % 3]);
  }
  assert.equal(again.questionIndex, 1);
  assert.equal(today(data, addDays(EPOCH, -1)).questionIndex, 2);   // cycle -1 wraps to the last question
});

test('recent dates are newest first and never reach before the epoch', () => {
  assert.deepEqual(recentDates('2026-11-10', 3), ['2026-11-10', '2026-11-09', '2026-11-08']);
  assert.equal(recentDates('2026-11-10', 14).length, 14);
  assert.deepEqual(recentDates(addDays(EPOCH, 2), 14), [addDays(EPOCH, 2), addDays(EPOCH, 1), EPOCH]);
});

test('a cached answer for today expires by UTC midnight', () => {
  assert.equal(secondsLeft(new Date('2026-10-22T23:59:00Z')), 60);
  assert.equal(secondsLeft(new Date('2026-10-22T00:00:00Z')), 86400);
});

test('/today shows the card summary, a link to the card and the day\'s question', async () => {
  const handler = createTodayHandler({ load, now: at('2026-11-05T08:00:00Z') });
  const response = await handler(new Request('https://models.wuhua.app/today'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.headers.get('cache-control'), /max-age=3600/);
  const html = await response.text();
  const day = today(data, '2026-11-05');
  assert.ok(html.includes(`卡${ids.indexOf(day.id)} &amp; 名`));
  assert.ok(html.includes(`href="/m/${day.id}"`));
  assert.ok(html.includes(`data-q="${day.id}-${day.questionIndex}"`));
  assert.equal((html.match(/data-ok="1"/g) || []).length, 1);
  assert.match(html, /情境 \d &lt;i&gt;/);
  assert.match(html, /rel="prev"/);
  assert.doesNotMatch(html, /rel="next"/);
});

test('/today?date= reaches back 30 days and sends everything else to today', async () => {
  const handler = createTodayHandler({ load, now: at('2026-12-20T08:00:00Z') });
  const past = await handler(new Request('https://models.wuhua.app/today?date=2026-12-01'));
  assert.equal(past.status, 200);
  const html = await past.text();
  assert.ok(html.includes(`data-q="${today(data, '2026-12-01').id}-`));
  assert.match(html, /href="\/today\?date=2026-12-02" rel="next"/);
  assert.match(past.headers.get('cache-control'), /max-age=86400/);
  for (const date of ['2026-12-21', '2026-11-01', 'nope', '2026-12-20']) {
    const response = await handler(new Request(`https://models.wuhua.app/today?date=${date}`));
    assert.equal(response.status, 302, date);
    assert.equal(response.headers.get('location'), 'https://models.wuhua.app/today');
  }
  assert.equal((await handler(new Request('https://models.wuhua.app/today', { method: 'POST' }))).status, 405);
  const head = await handler(new Request('https://models.wuhua.app/today', { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('/today.json carries what the Telegram push and the email need, for any date', async () => {
  const handler = createTodayJsonHandler({ load, now: at('2026-11-05T08:00:00Z') });
  const body = await (await handler(new Request('https://models.wuhua.app/today.json'))).json();
  const day = today(data, '2026-11-05');
  assert.deepEqual(body, todayJson(day, 'https://models.wuhua.app'));
  assert.equal(body.id, day.id);
  assert.equal(body.url, `https://models.wuhua.app/m/${day.id}`);
  assert.equal(body.question.options.filter((o) => o.correct).length, 1);
  const later = await (await handler(new Request('https://models.wuhua.app/today.json?date=2027-03-01'))).json();
  assert.equal(later.id, dailyPick(ids, '2027-03-01').id);
  assert.equal((await handler(new Request('https://models.wuhua.app/today.json?date=x'))).status, 400);
});

test('the feed is Atom with one entry per day for the last 14 days, newest first, matching /today', async () => {
  const handler = createFeedHandler({ load, now: at('2026-12-20T08:00:00Z') });
  const response = await handler(new Request('https://models.wuhua.app/feed.xml'));
  assert.match(response.headers.get('content-type'), /application\/atom\+xml/);
  const xml = await response.text();
  assert.match(xml, /^<\?xml version="1.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www.w3.org\/2005\/Atom"/);
  const entries = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map((m) => m[0]);
  assert.equal(entries.length, 14);
  entries.forEach((entry, n) => {
    const date = addDays('2026-12-20', -n);
    assert.ok(entry.includes(`<id>tag:models.wuhua.app,2026:today/${date}</id>`));
    assert.ok(entry.includes(`href="https://models.wuhua.app/today?date=${date}"`));
    assert.ok(entry.includes(`/m/${today(data, date).id}`));
  });
  assert.match(xml, /<updated>2026-12-20T00:00:00Z<\/updated>/);
  // Text is escaped once for HTML and once more for XML; no raw markup leaks into the feed.
  assert.ok(xml.includes('&amp;amp;'));
  assert.ok(xml.includes('&amp;lt;i&amp;gt;'));
  assert.doesNotMatch(xml.replace(/<\/?(feed|entry|id|title|link|updated|published|summary|content|subtitle|author|name|uri|rights)\b[^>]*>/g, ''), /<(?!\?xml)/);
});

test('the feed starts at the epoch, and entry html never gives the answer away', () => {
  const xml = atomFeed([today(data, EPOCH)]);
  assert.equal((xml.match(/<entry>/g) || []).length, 1);
  const html = entryHtml(today(data, EPOCH));
  assert.doesNotMatch(html, /反馈 \d|>解析<|correct/);
  assert.match(html, /A\. 选项 0/);
});
