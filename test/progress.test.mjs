import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, save, markRead, record, stats, reviewQueue, pickUnread, KEY } from '../public/progress.mjs';

const memory = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};

test('empty or broken storage gives empty progress', () => {
  assert.deepEqual(load(memory()), { read: {}, answers: [] });
  assert.deepEqual(load(memory({ [KEY]: '{not json' })), { read: {}, answers: [] });
  assert.deepEqual(load({ getItem() { throw new Error('blocked'); } }), { read: {}, answers: [] });
});

test('save survives a storage that throws', () => {
  assert.doesNotThrow(() => save({ setItem() { throw new Error('full'); } }, { read: {}, answers: [] }));
});

test('progress round-trips', () => {
  const store = memory();
  const state = record(markRead(load(store), 'compounding', '2026-10-05'), 'compounding-0', true, 1);
  save(store, state);
  assert.deepEqual(load(store), state);
});

test('stats count read cards and questions whose last answer was right', () => {
  let state = markRead({ read: {}, answers: [] }, 'a', 'd');
  state = record(state, 'a-0', false, 1);
  state = record(state, 'a-0', true, 2);
  state = record(state, 'a-1', false, 3);
  assert.deepEqual(stats(state, ['a', 'b']), { read: 1, right: 1, answered: 2 });
  assert.deepEqual(stats(state, ['b']), { read: 0, right: 0, answered: 0 });
});

test('review asks only read cards, wrong ones first, then unanswered, then the oldest', () => {
  let state = { read: {}, answers: [] };
  for (const id of ['a', 'b']) state = markRead(state, id, 'd');
  state = record(state, 'a-0', true, 1);
  state = record(state, 'b-0', false, 2);
  state = record(state, 'a-1', true, 3);
  const cards = [{ id: 'a', questions: ['a-0', 'a-1', 'a-2'] }, { id: 'b', questions: ['b-0'] }, { id: 'c', questions: ['c-0'] }];
  assert.deepEqual(reviewQueue(state, cards), ['b-0', 'a-2', 'a-0', 'a-1']);
});

test('random card prefers unread ones', () => {
  const state = markRead({ read: {}, answers: [] }, 'a', 'd');
  assert.equal(pickUnread(state, ['a', 'b'], () => 0), 'b');
  assert.equal(pickUnread(markRead(state, 'b', 'd'), ['a', 'b'], () => 0.99), 'b');
});
