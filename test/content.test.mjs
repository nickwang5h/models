// The real cards in content/ meet the schema the build enforces (src/render.mjs validate), so a pull request that
// breaks a card fails here with the card id and the problem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validate } from '../src/render.mjs';

const CONTENT = new URL('../content/', import.meta.url).pathname;

async function load() {
  const index = JSON.parse(await readFile(join(CONTENT, 'index.json'), 'utf8'));
  const cards = {};
  for (const name of await readdir(CONTENT)) {
    if (name.endsWith('.json') && name !== 'index.json') cards[name.slice(0, -5)] = JSON.parse(await readFile(join(CONTENT, name), 'utf8'));
  }
  return { index, cards };
}

test('every card in content/ passes the schema check', async () => {
  const { index, cards } = await load();
  assert.ok(Object.keys(cards).length > 0);
  assert.deepEqual(validate(index, cards), []);
});

test('every card is listed exactly once in index.json, and every related id names a model in the catalog', async () => {
  const { index, cards } = await load();
  const listed = index.disciplines.flatMap((d) => d.models.map((m) => m.id));
  assert.deepEqual([...listed].sort(), Object.keys(cards).sort());
  for (const card of Object.values(cards)) for (const link of card.related) assert.ok(cards[link.id] || index.names?.[link.id], `${card.id} → ${link.id}`);
});
