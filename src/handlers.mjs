// Request handlers for /today, /today.json and /feed.xml, kept apart from functions/ so tests can call them with a
// fake clock and fake card data. `load()` returns questions.json, which the build writes into dist/.
import { EPOCH, addDays, isDate, secondsLeft, today, todayJson, utcDate } from './daily.mjs';
import { BACK_DAYS, SITE, atomFeed, feedDates, todayPage } from './today.mjs';

// Today's answer may be kept until UTC midnight at the latest; a past day never changes until the next deploy.
const fresh = (now) => `public, max-age=${Math.min(3600, secondsLeft(now))}`;
const settled = 'public, max-age=86400';

function guard(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  return new Response('Use GET.', { status: 405, headers: { Allow: 'GET, HEAD' } });
}

function send(request, body, type, cache, status = 200) {
  return new Response(request.method === 'HEAD' ? null : body, { status, headers: { 'Content-Type': type, 'Cache-Control': cache } });
}

function redirect(url, path) {
  return new Response(null, { status: 302, headers: { Location: new URL(path, url).toString(), 'Cache-Control': 'no-store' } });
}

export function createTodayHandler({ load, now = () => new Date() }) {
  return async (request) => {
    const refused = guard(request);
    if (refused) return refused;
    const clock = now();
    const current = utcDate(clock);
    const asked = new URL(request.url).searchParams.get('date');
    if (asked !== null && asked === current) return redirect(request.url, '/today');
    if (asked !== null && (!isDate(asked) || asked > current || asked < EPOCH || asked < addDays(current, -BACK_DAYS))) return redirect(request.url, '/today');
    const date = asked ?? current;
    const data = await load();
    const html = todayPage(today(data, date), current, Object.keys(data).length);
    return send(request, html, 'text/html; charset=utf-8', date === current ? fresh(clock) : settled);
  };
}

// For the Telegram push and anyone else: ?date= may be any day, past or future.
export function createTodayJsonHandler({ load, now = () => new Date(), site = SITE }) {
  return async (request) => {
    const refused = guard(request);
    if (refused) return refused;
    const clock = now();
    const asked = new URL(request.url).searchParams.get('date');
    if (asked !== null && !isDate(asked)) {
      return send(request, JSON.stringify({ ok: false, error: 'date must be YYYY-MM-DD' }), 'application/json; charset=utf-8', 'no-store', 400);
    }
    const date = asked ?? utcDate(clock);
    const body = JSON.stringify(todayJson(today(await load(), date), site));
    return send(request, body, 'application/json; charset=utf-8', date === utcDate(clock) ? fresh(clock) : settled);
  };
}

export function createFeedHandler({ load, now = () => new Date(), site = SITE }) {
  return async (request) => {
    const refused = guard(request);
    if (refused) return refused;
    const clock = now();
    const data = await load();
    const xml = atomFeed(feedDates(utcDate(clock)).map((date) => today(data, date)), site);
    return send(request, xml, 'application/atom+xml; charset=utf-8', fresh(clock));
  };
}

// questions.json from the deployment's own static files (Pages gives Functions an ASSETS binding).
export function assetLoader(env, request) {
  return async () => {
    const response = await env.ASSETS.fetch(new URL('/questions.json', request.url));
    if (!response.ok) throw new Error(`questions.json: ${response.status}`);
    return response.json();
  };
}
