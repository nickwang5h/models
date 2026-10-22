// 今日一卡: one card per UTC date, the same on /today, /today.json, /feed.xml, the daily email and the Telegram push.
//
// The pick is a pure function of the date and the set of card ids. Days are counted from EPOCH; every run of
// `ids.length` days is one cycle, and each cycle walks all cards in an order shuffled by a hash of (cycle, id), so no
// card repeats until every card has had its day. The n-th cycle asks each card's n-th question (wrapping around).
// Adding or removing cards changes the length of a cycle and so reshuffles the days that follow; the days already
// published were the same for every reader, which is all that has to agree.
//
// No dependencies and no async: the build, the Pages Functions and the tests all import this file.

export const EPOCH = '2026-10-22';
const DAY = 86400000;

export function isDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text;
}

export function utcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function addDays(date, n) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

export function dayNumber(date) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${EPOCH}T00:00:00Z`)) / DAY);
}

// FNV-1a, 32 bits, over UTF-16 code units: small, synchronous and the same in every runtime.
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function cycleOrder(ids, cycle) {
  return [...new Set(ids)].sort((a, b) => hash(`${cycle}:${a}`) - hash(`${cycle}:${b}`) || (a < b ? -1 : a > b ? 1 : 0));
}

// { date, id, cycle } for a date, from the card ids (their order does not matter).
export function dailyPick(ids, date) {
  if (!isDate(date)) throw new Error(`not a date: ${date}`);
  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error('no cards');
  const n = dayNumber(date);
  const cycle = Math.floor(n / unique.length);
  const position = n - cycle * unique.length;
  return { date, id: cycleOrder(unique, cycle)[position], cycle };
}

// The whole day from questions.json ({id: {name, en, one_line, discipline, questions}}): the card and its question.
export function today(data, date) {
  const { id, cycle } = dailyPick(Object.keys(data), date);
  const card = data[id];
  const count = card.questions.length;
  const questionIndex = ((cycle % count) + count) % count;
  return { date, id, card, questionIndex, question: card.questions[questionIndex] };
}

// The last `days` dates up to and including `date`, newest first, never before EPOCH.
export function recentDates(date, days) {
  return Array.from({ length: days }, (_, n) => addDays(date, -n)).filter((d) => d >= EPOCH);
}

// The answer /today.json gives: everything the Telegram push and the email need, including the correct option.
export function todayJson(day, site) {
  const { date, id, card, questionIndex, question } = day;
  return {
    date, id, name: card.name, en: card.en ?? '', one_line: card.one_line, discipline: card.discipline ?? '',
    url: `${site}/m/${id}`, page: `${site}/today?date=${date}`, question_index: questionIndex, question,
  };
}

// Seconds until the next UTC midnight, so a cached answer never outlives its day.
export function secondsLeft(now = new Date()) {
  const next = Date.parse(`${addDays(utcDate(now), 1)}T00:00:00Z`);
  return Math.max(1, Math.floor((next - now.getTime()) / 1000));
}
