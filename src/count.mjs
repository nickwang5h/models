// Counting without following anyone: one row per UTC day × kind × name × source, and a number. No address, no IP, no
// cookie, and of the user agent only a feed reader's name. Kept in D1 (binding COUNTS, table in ops/counts.sql);
// without the binding everything here does nothing. See docs/counts.md.
//
//   page       name: the path (/today)                source: the host the reader came from, '' when unknown or our own
//   channel    name: the channel of a /c/<name> link  source: as above
//   feed       name: the feed reader                   top: the most subscribers it reported that day
//   subscribe  name: request | confirm                 source: where the form was (requests only)
import { isDate, today, utcDate } from './daily.mjs';
import { sameText } from './mail.mjs';

// The links handed out, one per place they are posted: /c/<name>, and /x for the one printed on pictures.
export const CHANNELS = ['x', 'mail', 'tg', 'wx', 'jk', 'v2', 'gh', 'hn', 'rd', 'sspai', 'douban', 'zhihu'];
export const PLACES = ['home', 'card', 'today', 'page'];

// Programs that open a link on nobody's behalf: crawlers, uptime checks, and the previews chat apps make of a link.
const MACHINE = /bot\b|bot\/|crawl|spider|slurp|preview|monitor|uptime|headless|facebookexternalhit|whatsapp|curl\/|wget\/|python-|go-http|okhttp|^$/i;
export const isMachine = (agent) => MACHINE.test(agent ?? '');

// The host a reader came from, lower-cased; '' for no Referer, a broken one, or our own pages.
export function sourceOf(request) {
  try {
    const from = new URL(request.headers.get('referer') ?? '');
    return from.host === new URL(request.url).host ? '' : from.host.toLowerCase().slice(0, 80);
  } catch {
    return '';
  }
}

const READERS = ['Feedly', 'Inoreader', 'Feedbin', 'NewsBlur', 'Miniflux', 'FreshRSS', 'Tiny Tiny RSS', 'The Old Reader', 'BazQux', 'Feeder', 'Readwise',
  'NetNewsWire', 'Reeder', 'Folo', 'Follow', 'Readly', 'Feedspot', 'Bloglovin', 'Slackbot', 'Thunderbird', 'RSSOwl', 'Liferea', 'Akregator', 'NextCloud-News', 'Unread', 'Fiery Feeds', 'lire'];

// Hosted readers fetch once for everybody and say how many: "Feedly/1.0 (+http://…; 12 subscribers)".
export function readerOf(agent) {
  const text = String(agent ?? '');
  const known = READERS.find((name) => text.toLowerCase().includes(name.toLowerCase()));
  const first = /^([A-Za-z][\w .-]{0,30}?)(?:\/|\s|$)/.exec(text)?.[1];
  const name = known ?? (first && first !== 'Mozilla' ? first : 'other');
  const subscribers = Number(/(\d{1,7})\s+subscribers?/i.exec(text)?.[1] ?? 0);
  return { name, subscribers };
}

// Add one to a row. Never throws: a page must not fail because its count did.
export async function bump(db, { day, kind, name, source = '', top = 0 }) {
  if (!db) return;
  try {
    await db.prepare('INSERT INTO counts (day, kind, name, source, n, top) VALUES (?1, ?2, ?3, ?4, 1, ?5) '
      + 'ON CONFLICT (day, kind, name, source) DO UPDATE SET n = n + 1, top = max(top, excluded.top)').bind(day, kind, name, source, top).run();
  } catch { /* no table yet, or D1 is away: the reader still gets the page */ }
}

// Wrap a handler: after it answers, `describe(request, response, input)` names the row to add, or nothing.
// `later` is the Function's waitUntil, so the reader is not kept waiting for the count.
export function counted(handler, { db, later = (work) => work, now = () => new Date(), describe }) {
  return async (request) => {
    if (!db) return handler(request);
    // The handler reads the body itself, so look at a copy first.
    const input = request.method === 'POST' ? await request.clone().json().catch(() => null) : null;
    const response = await handler(request);
    const row = describe(request, response, input);
    if (row) later(bump(db, { day: utcDate(now()), ...row }));
    return response;
  };
}

const read = (request) => (request.method === 'GET' && !isMachine(request.headers.get('user-agent')));

export const todayRow = (request, response) => (read(request) && response.status === 200 ? { kind: 'page', name: '/today', source: sourceOf(request) } : null);

export function feedRow(request, response) {
  if (request.method !== 'GET' || response.status !== 200) return null;
  const { name, subscribers } = readerOf(request.headers.get('user-agent'));
  return { kind: 'feed', name, top: subscribers };
}

// A request counts when a confirmation was really sent: 202, and not the honeypot's pretend 202.
export function subscribeRow(request, response, input) {
  if (request.method !== 'POST' || response.status !== 202 || !input || input.website !== '') return null;
  return { kind: 'subscribe', name: 'request', source: PLACES.includes(input.place) ? input.place : 'other' };
}

export function confirmRow(request, response) {
  return (response.headers.get('location') ?? '').includes('confirmed=1') ? { kind: 'subscribe', name: 'confirm' } : null;
}

// GET /c/<name>[?d=YYYY-MM-DD][&to=card] — a link posted in one place. Counts the visit and sends the reader on to
// the day: /today, or with to=card the day's card. Where it leads comes from the date alone, never from the link.
export function createChannelHandler({ db, load, name, later = (work) => work, now = () => new Date() }) {
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Use GET.', { status: 405, headers: { Allow: 'GET, HEAD' } });
    const url = new URL(request.url);
    const current = utcDate(now());
    const asked = url.searchParams.get('d');
    const date = asked && isDate(asked) && asked <= current ? asked : null;
    let path = date && date !== current ? `/today?date=${date}` : '/today';
    if (url.searchParams.get('to') === 'card') {
      try { path = `/m/${today(await load(), date ?? current).id}?day=${date ?? current}`; } catch { /* keep /today */ }
    }
    if (CHANNELS.includes(name) && read(request)) later(bump(db, { day: current, kind: 'channel', name, source: sourceOf(request) }));
    return new Response(null, { status: 302, headers: { Location: new URL(path, url).toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  };
}

// GET /api/counts?days=30 with Authorization: Bearer $CRON_SECRET — the rows of the last days, newest first.
export function createCountsHandler({ env, now = () => new Date() }) {
  return async (request) => {
    const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    if (request.method !== 'GET') return json(405, { ok: false, error: 'Use GET.' });
    if (!env?.CRON_SECRET || !sameText(request.headers.get('authorization') ?? '', `Bearer ${env.CRON_SECRET}`)) return json(401, { ok: false, error: 'Unauthorized.' });
    if (!env.COUNTS) return json(503, { ok: false, error: 'No COUNTS binding.' });
    const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get('days')) || 30, 1), 400);
    const since = new Date(now().getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
    try {
      const { results } = await env.COUNTS.prepare('SELECT day, kind, name, source, n, top FROM counts WHERE day >= ?1 ORDER BY day DESC, kind, n DESC').bind(since).all();
      return json(200, { ok: true, since, rows: results });
    } catch (error) {
      return json(500, { ok: false, error: String(error?.message ?? error).slice(0, 200) });
    }
  };
}
