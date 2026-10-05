// Reading and answering progress, kept in this browser only. Every storage call may throw (private windows, blocked
// site data), and a missing or broken record means no progress yet.
export const KEY = 'models-progress-v1';

const empty = () => ({ read: {}, answers: [] });

export function load(storage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY));
    if (saved && typeof saved.read === 'object' && Array.isArray(saved.answers)) return saved;
  } catch { /* no progress */ }
  return empty();
}

export function save(storage, state) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch { /* progress stays in this page only */ }
}

export function markRead(state, id, day) {
  return state.read[id] ? state : { ...state, read: { ...state.read, [id]: day } };
}

export function record(state, q, ok, at) {
  return { ...state, answers: [...state.answers, { q, ok, at }] };
}

function lastAnswers(state) {
  const last = new Map();
  for (const answer of state.answers) last.set(answer.q, answer);
  return last;
}

export function stats(state, ids) {
  const wanted = new Set(ids);
  const last = [...lastAnswers(state).values()].filter((a) => wanted.has(a.q.replace(/-\d+$/, '')));
  return { read: ids.filter((id) => state.read[id]).length, right: last.filter((a) => a.ok).length, answered: last.length };
}

// Questions of read cards: last answered wrong first, then never answered, then right ones, oldest first.
export function reviewQueue(state, cards) {
  const last = lastAnswers(state);
  const qs = cards.filter((c) => state.read[c.id]).flatMap((c) => c.questions);
  const rank = (q) => (!last.has(q) ? 1 : last.get(q).ok ? 2 : 0);
  return qs
    .map((q, order) => ({ q, order }))
    .sort((x, y) => rank(x.q) - rank(y.q) || (last.get(x.q)?.at ?? 0) - (last.get(y.q)?.at ?? 0) || x.order - y.order)
    .map((x) => x.q);
}

export function pickUnread(state, ids, random = Math.random) {
  const unread = ids.filter((id) => !state.read[id]);
  const pool = unread.length ? unread : ids;
  return pool[Math.floor(random() * pool.length)];
}
