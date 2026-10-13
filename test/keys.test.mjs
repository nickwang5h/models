import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, keyAction } from '../public/keys.mjs';

test('keys answer, move between cards and open a random one', () => {
  assert.deepEqual(['2', 'D', 'ArrowLeft', 'ArrowRight', 'r', 'x'].map(keyAction), ['pick1', 'pick3', 'previous', 'next', 'random', null]);
});

test('a number answers the first question still open, and does nothing once all are answered', () => {
  const clicked = [];
  const option = (name) => ({click: () => clicked.push(name)});
  const open = {querySelectorAll: () => [option('a'), option('b'), option('c'), option('d')]};
  const links = {'.steps a[rel="next"]': option('next'), '[data-random]': option('random')};
  const page = (question) => ({querySelector: (selector) => (selector === '.q:not(.done)' ? question : links[selector] ?? null)});
  assert.equal(act('pick2', page(open)), true);
  assert.equal(act('pick0', page(null)), false);
  assert.equal(act('next', page(null)), true);
  assert.equal(act('previous', page(null)), false);   // the first card has no previous one
  assert.deepEqual(clicked, ['c', 'next']);
});
