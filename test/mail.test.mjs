import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  broadcastName, configured, createConfirmHandler, createDailyMailHandler, createSubscribeHandler, dailyMailHtml, dailyMailText,
  signToken, validEmail, verifyToken,
} from '../src/mail.mjs';
import { today } from '../src/daily.mjs';

const SECRET = 'test-secret-not-real';
const env = { RESEND_API_KEY: 're_test', RESEND_AUDIENCE_ID: 'seg_1', SUBSCRIBE_SECRET: SECRET, MAIL_FROM: '思维模型 <today@example.com>', CRON_SECRET: 'cron-test' };
const NOW = new Date('2026-11-05T15:30:00Z');
const now = () => NOW;
const SITE = 'https://models.wuhua.app';

// A fake fetch that records calls and answers from a script.
function fake(...answers) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    return Response.json(next?.body ?? {}, { status: next?.status ?? 200 });
  };
  return { fetcher, calls };
}

const post = (body, { origin = SITE, type = 'application/json' } = {}) => new Request(`${SITE}/api/subscribe`, {
  method: 'POST', headers: { origin, 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('email addresses and configuration', () => {
  assert.ok(validEmail('a@b.co'));
  assert.ok(validEmail(' Reader@Example.com '));
  for (const bad of ['', 'a@b', 'a b@c.d', `${'x'.repeat(250)}@b.co`, 42, null]) assert.equal(validEmail(bad), false);
  assert.ok(configured(env));
  for (const key of ['RESEND_API_KEY', 'RESEND_AUDIENCE_ID', 'SUBSCRIBE_SECRET', 'MAIL_FROM']) assert.equal(configured({ ...env, [key]: '' }), false, key);
  assert.equal(configured(undefined), false);
});

test('a confirmation token carries the address for 48 hours and nothing else verifies', async () => {
  const token = await signToken(' Reader@Example.com ', SECRET, NOW);
  assert.equal(await verifyToken(token, SECRET, NOW), 'reader@example.com');
  assert.equal(await verifyToken(token, SECRET, new Date(NOW.getTime() + 47 * 3600e3)), 'reader@example.com');
  assert.equal(await verifyToken(token, SECRET, new Date(NOW.getTime() + 49 * 3600e3)), undefined);
  assert.equal(await verifyToken(token, 'another-secret', NOW), undefined);
  const [payload, mac] = token.split('.');
  const forged = Buffer.from(Buffer.from(payload, 'base64url').toString().replace('reader', 'victim')).toString('base64url');
  assert.equal(await verifyToken(`${forged}.${mac}`, SECRET, NOW), undefined);
  assert.equal(await verifyToken(`${payload}.${mac.slice(0, -2)}AA`, SECRET, NOW), undefined);
  assert.equal(await verifyToken(`${payload}=.${mac}`, SECRET, NOW), undefined);
  for (const junk of ['', '.', 'a.b.c', '***.***', null]) assert.equal(await verifyToken(junk, SECRET, NOW), undefined);
});

test('subscribe refuses wrong methods, other origins, non-JSON and malformed input', async () => {
  const { fetcher, calls } = fake({ status: 200 });
  const handler = createSubscribeHandler({ env, fetcher, now });
  assert.equal((await handler(new Request(`${SITE}/api/subscribe`))).status, 405);
  assert.equal((await handler(post({ email: 'a@b.co', website: '' }, { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await handler(post({ email: 'a@b.co', website: '' }, { type: 'text/plain' }))).status, 415);
  assert.equal((await handler(post('{nope'))).status, 400);
  assert.equal((await handler(post([1]))).status, 400);
  assert.equal((await handler(post({ email: 'a@b.co' }))).status, 400);
  assert.equal((await handler(post({ email: 'not-an-address', website: '' }))).status, 400);
  assert.equal((await handler(post({ email: 'a@b.co', website: '', pad: 'x'.repeat(30000) }))).status, 413);
  assert.equal(calls.length, 0);
});

test('subscribe answers 503 with a friendly message until the variables are set', async () => {
  const { fetcher, calls } = fake({ status: 200 });
  const response = await createSubscribeHandler({ env: { ...env, SUBSCRIBE_SECRET: undefined }, fetcher, now })(post({ email: 'a@b.co', website: '' }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /还没有开通/);
  assert.equal(calls.length, 0);
});

test('a filled honeypot looks accepted and sends nothing', async () => {
  const { fetcher, calls } = fake({ status: 200 });
  const response = await createSubscribeHandler({ env, fetcher, now })(post({ email: 'a@b.co', website: 'http://spam' }));
  assert.equal(response.status, 202);
  assert.equal(calls.length, 0);
});

test('subscribe sends one identical, idempotent confirmation per address per day', async () => {
  const { fetcher, calls } = fake({ status: 200, body: { id: 'em_1' } });
  const handler = createSubscribeHandler({ env, fetcher, now });
  assert.equal((await handler(post({ email: 'Reader@Example.com', website: '' }))).status, 202);
  const later = createSubscribeHandler({ env, fetcher, now: () => new Date('2026-11-05T23:00:00Z') });
  assert.equal((await later(post({ email: 'reader@example.com ', website: '' }))).status, 202);
  assert.equal(calls.length, 2);
  const [first, second] = calls;
  assert.equal(first.url, 'https://api.resend.com/emails');
  assert.equal(first.headers.Authorization, 'Bearer re_test');
  assert.match(first.headers['Idempotency-Key'], /^models-subscribe-[0-9a-f]{64}$/);
  assert.equal(first.headers['Idempotency-Key'], second.headers['Idempotency-Key']);
  assert.equal(first.body, second.body);
  const mail = JSON.parse(first.body);
  assert.deepEqual(mail.to, ['reader@example.com']);
  assert.equal(mail.from, env.MAIL_FROM);
  const link = /https:\/\/models\.wuhua\.app\/api\/confirm\?t=([A-Za-z0-9_.-]+)/.exec(mail.text);
  assert.ok(link);
  assert.ok(mail.html.includes(link[0]));
  assert.equal(await verifyToken(link[1], SECRET, NOW), 'reader@example.com');
  // Signed from the start of the UTC day: valid until 48 hours after that midnight.
  assert.equal(await verifyToken(link[1], SECRET, new Date('2026-11-06T23:59:00Z')), 'reader@example.com');
  assert.equal(await verifyToken(link[1], SECRET, new Date('2026-11-07T00:00:01Z')), undefined);
});

test('subscribe passes on rate limits and reports provider failures without detail', async () => {
  const busy = await createSubscribeHandler({ env, fetcher: fake({ status: 429 }).fetcher, now })(post({ email: 'a@b.co', website: '' }));
  assert.equal(busy.status, 429);
  assert.equal(busy.headers.get('retry-after'), '60');
  assert.equal((await createSubscribeHandler({ env, fetcher: fake({ status: 500 }).fetcher, now })(post({ email: 'a@b.co', website: '' }))).status, 502);
  assert.equal((await createSubscribeHandler({ env, fetcher: fake(new Error('down')).fetcher, now })(post({ email: 'a@b.co', website: '' }))).status, 502);
});

test('confirm adds a valid address to the segment and sends the reader back to the page', async () => {
  const token = await signToken('reader@example.com', SECRET, NOW);
  const { fetcher, calls } = fake({ status: 201, body: { id: 'ct_1' } });
  const handler = createConfirmHandler({ env, fetcher, now });
  const response = await handler(new Request(`${SITE}/api/confirm?t=${token}`));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `${SITE}/subscribe?confirmed=1`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/contacts');
  assert.deepEqual(JSON.parse(calls[0].body), { email: 'reader@example.com', unsubscribed: false, segments: [{ id: 'seg_1' }] });

  const bad = await handler(new Request(`${SITE}/api/confirm?t=${token.slice(0, -3)}xyz`));
  assert.equal(bad.headers.get('location'), `${SITE}/subscribe?expired=1`);
  assert.equal((await handler(new Request(`${SITE}/api/confirm`, { method: 'POST' }))).status, 405);
  assert.equal((await createConfirmHandler({ env, fetcher: fake({ status: 500 }).fetcher, now })(new Request(`${SITE}/api/confirm?t=${token}`))).status, 502);
  const off = await createConfirmHandler({ env: {}, fetcher, now })(new Request(`${SITE}/api/confirm?t=${token}`));
  assert.equal(off.status, 503);
  assert.match(await off.text(), /还没有开通/);
  assert.equal(calls.length, 1);
});

// Daily mail ---------------------------------------------------------------------------------------------------

const question = { stem: '情境 <b>', question: '怎么办？', explain: '解析文字', options: [0, 1, 2, 3].map((k) => ({ text: `选项${k}`, correct: k === 2, feedback: `反馈${k}` })) };
const data = Object.fromEntries(['a', 'b', 'c'].map((id) => [id, { name: `卡${id}`, en: 'En', discipline: 'math', one_line: `一句 ${id}`, questions: [question, question] }]));
const load = async () => data;
const cron = (token = 'cron-test') => new Request(`${SITE}/api/daily-mail`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} });

test('daily mail needs its variables and the bearer token', async () => {
  const { fetcher, calls } = fake({ status: 200, body: { data: [] } });
  assert.equal((await createDailyMailHandler({ env: { ...env, CRON_SECRET: '' }, load, fetcher, now })(cron())).status, 503);
  const handler = createDailyMailHandler({ env, load, fetcher, now });
  assert.equal((await handler(cron(null))).status, 401);
  assert.equal((await handler(cron('cron-tes'))).status, 401);
  assert.equal((await handler(cron('cron-test2'))).status, 401);
  assert.equal((await handler(new Request(`${SITE}/api/daily-mail`, { method: 'PUT', headers: { authorization: 'Bearer cron-test' } }))).status, 405);
  assert.equal(calls.length, 0);
});

test('daily mail creates and sends one broadcast with today\'s card', async () => {
  const { fetcher, calls } = fake({ status: 200, body: { data: [{ id: 'old', name: 'today-2026-11-05', status: 'sent' }] } }, { status: 201, body: { id: 'bc_1' } }, { status: 200, body: { id: 'bc_1' } });
  const response = await createDailyMailHandler({ env, load, fetcher, now })(cron());
  const day = today(data, '2026-11-05');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, broadcast: 'bc_1', name: 'models-today-2026-11-05', card: day.id });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ['GET https://api.resend.com/broadcasts', 'POST https://api.resend.com/broadcasts', 'POST https://api.resend.com/broadcasts/bc_1/send']);
  const created = JSON.parse(calls[1].body);
  assert.equal(created.segment_id, 'seg_1');
  assert.equal(created.from, env.MAIL_FROM);
  assert.equal(created.name, broadcastName('2026-11-05'));
  assert.ok(created.subject.includes(day.card.name));
  for (const part of [created.html, created.text]) {
    assert.ok(part.includes('{{{RESEND_UNSUBSCRIBE_URL}}}'));
    assert.ok(part.includes(`${SITE}/m/${day.id}`));
    assert.ok(part.includes(`${SITE}/today?date=2026-11-05`));
    assert.ok(!part.includes('反馈') && !part.includes('解析文字'));
  }
  assert.ok(created.html.includes('情境 &lt;b&gt;'));
});

test('daily mail is idempotent: a sent broadcast is skipped, a stuck draft is sent', async () => {
  const sent = fake({ status: 200, body: { data: [{ id: 'bc_1', name: 'models-today-2026-11-05', status: 'sent' }] } });
  const skipped = await (await createDailyMailHandler({ env, load, fetcher: sent.fetcher, now })(cron())).json();
  assert.equal(skipped.skipped, true);
  assert.equal(sent.calls.length, 1);

  const draft = fake({ status: 200, body: { data: [{ id: 'bc_9', name: 'models-today-2026-11-05', status: 'draft' }] } }, { status: 200, body: {} });
  const resumed = await createDailyMailHandler({ env, load, fetcher: draft.fetcher, now })(cron());
  assert.equal(resumed.status, 200);
  assert.deepEqual(draft.calls.map((c) => `${c.method} ${c.url}`), ['GET https://api.resend.com/broadcasts', 'POST https://api.resend.com/broadcasts/bc_9/send']);

  assert.equal((await createDailyMailHandler({ env, load, fetcher: fake({ status: 500 }).fetcher, now })(cron())).status, 502);
  assert.equal((await createDailyMailHandler({ env, load, fetcher: fake(new Error('down')).fetcher, now })(cron())).status, 502);
});

test('the mail body reads well without HTML too', () => {
  const day = today(data, '2026-11-05');
  const text = dailyMailText(day);
  assert.match(text, /^思维模型 · 今日一卡 · 2026-11-05/);
  assert.match(text, /A\. 选项0\nB\. 选项1/);
  assert.match(dailyMailHtml(day), /<h1[^>]*>卡/);
});
