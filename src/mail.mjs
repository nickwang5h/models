// Email subscription to 今日一卡, ported from learn.wuhua.app (server/subscribe.ts, server/daily-mail.ts) to Cloudflare
// Pages Functions: Web Crypto instead of node:crypto, Chinese messages, the card of the day instead of a word.
//
// Two steps, so nobody can sign up an address that is not theirs: POST /api/subscribe sends a confirmation link
// (GET /api/subscribe says whether subscription is open, so pages show the form only then);
// GET /api/confirm adds the address to the Resend Segment (formerly Audience) the daily broadcast goes to.
// POST /api/daily-mail, called once a day with a bearer token, sends the day's card to that Segment as one Resend
// Broadcast named models-today-YYYY-MM-DD; a second call finds it by name and does nothing.
// Addresses are kept only with Resend; nothing here logs or stores them. See docs/email.md.
import { utcDate, today } from './daily.mjs';
import { SITE, entryHtml } from './today.mjs';
import { escape } from '../public/quiz.mjs';

const MAX_BYTES = 24 * 1024;
const TOKEN_LIFE = 48 * 60 * 60 * 1000;
const RESEND = 'https://api.resend.com';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UNAVAILABLE = '邮件订阅还没有开通。';

export function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL.test(value.trim());
}

// Every variable the subscription needs; without them the endpoints answer 503 and the page says so.
export function configured(env) {
  return Boolean(env?.RESEND_API_KEY && env.RESEND_AUDIENCE_ID && env.SUBSCRIBE_SECRET && env.MAIL_FROM);
}

function reply(status, error, headers = {}) {
  return Response.json(error ? { ok: false, error } : { ok: true }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return undefined;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { all.set(chunk, at); at += chunk.byteLength; }
  return new TextDecoder().decode(all);
}

// base64url without padding, over UTF-8.
function toBase64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
const utf8 = (text) => new TextEncoder().encode(text);

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sha256Hex(text) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// `base64url(email|expiresMs).base64url(hmac)`; the link stays valid for 48 hours from `now`.
export async function signToken(email, secret, now = new Date()) {
  const payload = `${email.trim().toLowerCase()}|${now.getTime() + TOKEN_LIFE}`;
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), utf8(payload)));
  return `${toBase64url(utf8(payload))}.${toBase64url(mac)}`;
}

// The address a valid, unexpired token stands for, or undefined.
export async function verifyToken(token, secret, now = new Date()) {
  if (typeof token !== 'string') return undefined;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return undefined;
  let payloadBytes;
  let given;
  try {
    payloadBytes = fromBase64url(parts[0]);
    given = fromBase64url(parts[1]);
  } catch {
    return undefined;
  }
  // Only the canonical spelling of the payload counts.
  if (toBase64url(payloadBytes) !== parts[0]) return undefined;
  // crypto.subtle.verify compares in constant time.
  if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), given, payloadBytes))) return undefined;
  const payload = new TextDecoder().decode(payloadBytes);
  const at = payload.lastIndexOf('|');
  if (at < 0) return undefined;
  const email = payload.slice(0, at);
  const expires = Number(payload.slice(at + 1));
  if (!validEmail(email) || !Number.isFinite(expires) || expires < now.getTime()) return undefined;
  return email;
}

const wrap = (inner) => `<!doctype html><html lang="zh-CN"><body style="margin:0;padding:32px 16px;background:#f3f0e9;color:#27241f;font:17px/1.8 -apple-system,'PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif">
<div style="max-width:560px;margin:0 auto">${inner}</div></body></html>`;

export function confirmationMail(from, email, link) {
  const text = [
    '你好，',
    '',
    '有人（希望是你）在 models.wuhua.app 申请订阅「今日一卡」：每天一封邮件，一张思维模型卡和一道题。',
    '',
    `确认订阅请打开这个链接（48 小时内有效，过期了就重新申请一次）：\n${link}`,
    '',
    '如果不是你，忽略这封信即可，什么都不会发。地址只保存在发信服务 Resend，每封信都有退订链接。',
    '',
    '思维模型 · models.wuhua.app',
  ].join('\n');
  const html = wrap(`<p style="margin:0 0 16px;color:#847e74;font-size:13px;letter-spacing:.2em">思维模型 · 今日一卡</p>
<p>有人（希望是你）在 models.wuhua.app 申请订阅「今日一卡」：每天一封邮件，一张思维模型卡和一道题。</p>
<p style="margin:28px 0"><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;background:#2b4c7e;color:#fbf8f1;text-decoration:none;border-radius:8px">确认订阅</a></p>
<p style="color:#5c574f;font-size:15px">链接 48 小时内有效，过期了就重新申请一次。如果不是你，忽略这封信即可，什么都不会发。地址只保存在发信服务 Resend，每封信都有退订链接。</p>
<p style="color:#5c574f;font-size:15px">按钮打不开时，复制这个地址：<br><a href="${escape(link)}" style="color:#2b4c7e;word-break:break-all">${escape(link)}</a></p>`);
  return { from, to: [email], subject: '确认订阅：思维模型 · 今日一卡', text, html };
}

export function createSubscribeHandler({ env, fetcher = fetch, now = () => new Date() }) {
  return async (request) => {
    // GET tells the page whether to show the form at all.
    if (request.method === 'GET') return Response.json({ ok: true, open: configured(env) }, { headers: { 'Cache-Control': 'no-store' } });
    if (request.method !== 'POST') return reply(405, '请用 POST。', { Allow: 'GET, POST' });
    const origin = new URL(request.url).origin;
    if (request.headers.get('origin') !== origin) return reply(403, '请在网站上提交。');
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, '请用 JSON。');
    let input;
    try {
      const body = await readBody(request);
      if (body === undefined) return reply(413, '请求太大。');
      input = JSON.parse(body);
    } catch {
      return reply(400, '请求无效。');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(400, '请求无效。');
    if (typeof input.email !== 'string' || typeof input.website !== 'string') return reply(400, '请求无效。');
    if (!validEmail(input.email)) return reply(400, '请填一个有效的邮箱地址。');
    if (!configured(env)) return reply(503, UNAVAILABLE);
    // A filled honeypot is a bot: answer as if it worked and send nothing.
    if (input.website !== '') return reply(202);
    const email = input.email.trim().toLowerCase();
    // The link is signed from the start of the UTC day, so every retry that day sends the identical mail, which
    // Resend requires for requests sharing an idempotency key.
    const day = utcDate(now());
    const link = `${origin}/api/confirm?t=${await signToken(email, env.SUBSCRIBE_SECRET, new Date(`${day}T00:00:00Z`))}`;
    const message = confirmationMail(env.MAIL_FROM, email, link);
    // One confirmation per address per day, however often the button is pressed.
    const key = await sha256Hex(`${email}|${day}`);
    try {
      const response = await fetcher(`${RESEND}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `models-subscribe-${key}` },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 429) return reply(429, '太频繁了，请稍后再试。', { 'Retry-After': '60' });
      if (!response.ok) return reply(502, '确认信没有发出去，请稍后再试。');
      return reply(202);
    } catch {
      return reply(502, '确认信没有发出去，请稍后再试。');
    }
  };
}

function redirect(origin, path) {
  return new Response(null, { status: 303, headers: { Location: origin + path, 'Cache-Control': 'no-store' } });
}

const failed = () => new Response('订阅没能保存，请稍后再打开一次确认链接。', {
  status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
});

export function createConfirmHandler({ env, fetcher = fetch, now = () => new Date() }) {
  return async (request) => {
    const url = new URL(request.url);
    if (request.method !== 'GET') return reply(405, '请用 GET。', { Allow: 'GET' });
    if (!configured(env)) {
      return new Response(`${UNAVAILABLE}可以先用阅读器订阅 ${url.origin}/feed.xml。`, {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    const email = await verifyToken(url.searchParams.get('t') || '', env.SUBSCRIBE_SECRET, now());
    if (!email) return redirect(url.origin, '/subscribe?expired=1');
    try {
      const response = await fetcher(`${RESEND}/contacts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, unsubscribed: false, segments: [{ id: env.RESEND_AUDIENCE_ID }] }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return failed();
      return redirect(url.origin, '/subscribe?confirmed=1');
    } catch {
      return failed();
    }
  };
}

export function broadcastName(date) {
  return `models-today-${date}`;
}

export function dailySubject(day) {
  return `今日一卡：${day.card.name} · 思维模型`;
}

export function dailyMailHtml(day, site = SITE) {
  const footer = `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e0d9cd;color:#847e74;font-size:14px">每天一封。网页版在 <a href="${site}/today" style="color:#2b4c7e">${site.replace(/^https?:\/\//, '')}/today</a>。<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#847e74">退订</a></p>`;
  return wrap(`<p style="margin:0 0 8px;color:#847e74;font-size:13px;letter-spacing:.2em">思维模型 · 今日一卡 · ${escape(day.date)}</p>
<h1 style="margin:0 0 4px;font:700 30px/1.3 'Songti SC','Noto Serif SC',serif">${escape(day.card.name)}</h1>
<p style="margin:0 0 16px;color:#847e74;font-size:14px">${escape(day.card.en ?? '')}</p>
${entryHtml(day, site)}
${footer}`);
}

export function dailyMailText(day, site = SITE) {
  const { date, id, card, question } = day;
  return [
    `思维模型 · 今日一卡 · ${date}`,
    '',
    `${card.name}（${card.en ?? ''}）`,
    card.one_line,
    `读整张卡：${site}/m/${id}`,
    '',
    question.stem,
    question.question,
    ...question.options.map((option, n) => `${'ABCD'[n]}. ${option.text}`),
    '',
    `去网页作答，看解析：${site}/today?date=${date}`,
    '',
    '每天一封。退订：{{{RESEND_UNSUBSCRIBE_URL}}}',
  ].join('\n');
}

// Constant-time string comparison for the bearer token.
function sameText(a, b) {
  const x = utf8(a);
  const y = utf8(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function createDailyMailHandler({ env, load, fetcher = fetch, now = () => new Date(), site = SITE }) {
  return async (request) => {
    if (request.method !== 'POST' && request.method !== 'GET') return json(405, { ok: false, error: 'Use POST.' });
    if (!env?.CRON_SECRET || !env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID || !env.MAIL_FROM) {
      return json(503, { ok: false, error: 'The daily mail is not configured.' });
    }
    if (!sameText(request.headers.get('authorization') ?? '', `Bearer ${env.CRON_SECRET}`)) return json(401, { ok: false, error: 'Unauthorized.' });
    const day = today(await load(), utcDate(now()));
    const name = broadcastName(day.date);
    const headers = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
    const timeout = () => AbortSignal.timeout(15000);
    try {
      // Without `limit`, Resend returns every broadcast of the account (learn.wuhua.app's too) in one response.
      const listed = await fetcher(`${RESEND}/broadcasts`, { headers, signal: timeout() });
      if (!listed.ok) return json(502, { ok: false, error: 'Could not list broadcasts.' });
      const existing = await listed.json();
      const items = Array.isArray(existing?.data) ? existing.data : [];
      const previous = items.find((b) => b?.name === name);
      if (previous && previous.status !== 'draft') return json(200, { ok: true, skipped: true, name, card: day.id });
      let id = previous?.id;
      if (!id) {
        const created = await fetcher(`${RESEND}/broadcasts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            segment_id: env.RESEND_AUDIENCE_ID, from: env.MAIL_FROM, subject: dailySubject(day),
            html: dailyMailHtml(day, site), text: dailyMailText(day, site), name,
          }),
          signal: timeout(),
        });
        if (!created.ok) return json(502, { ok: false, error: 'Could not create the broadcast.' });
        const broadcast = await created.json();
        id = typeof broadcast?.id === 'string' ? broadcast.id : undefined;
        if (!id) return json(502, { ok: false, error: 'Could not create the broadcast.' });
      }
      const sent = await fetcher(`${RESEND}/broadcasts/${encodeURIComponent(id)}/send`, { method: 'POST', headers, body: '{}', signal: timeout() });
      if (!sent.ok) return json(502, { ok: false, error: 'Could not send the broadcast.', broadcast: id });
      return json(200, { ok: true, broadcast: id, name, card: day.id });
    } catch {
      return json(502, { ok: false, error: 'The mail provider did not answer.' });
    }
  };
}
