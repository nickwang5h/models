import test from 'node:test';
import assert from 'node:assert/strict';
import {apply, read, save} from '../public/display.mjs';

const storage = (seed = {}) => ({data: {...seed}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = String(v); }});
const root = () => ({dataset: {}, style: {values: {}, setProperty(k, v) { this.values[k] = v; }}});

test('display settings default to the system theme and normal size, and ignore junk', () => {
  assert.deepEqual(read(storage()), {theme: 'auto', size: 'normal'});
  assert.deepEqual(read(storage({'models-display': '{"theme":"neon","size":"huge"}'})), {theme: 'auto', size: 'normal'});
  assert.deepEqual(read(storage({'models-display': 'not json'})), {theme: 'auto', size: 'normal'});
  assert.deepEqual(read({getItem() { throw new Error('blocked'); }}), {theme: 'auto', size: 'normal'});
});

test('a saved choice comes back and is applied to the page', () => {
  const kept = storage();
  save(kept, {theme: 'dark', size: 'larger'});
  assert.deepEqual(read(kept), {theme: 'dark', size: 'larger'});
  const page = root();
  apply(page, read(kept));
  assert.equal(page.dataset.theme, 'dark');
  assert.equal(page.style.values['--zoom'], '1.2');
  apply(page, {theme: 'auto', size: 'normal'});
  assert.equal(page.dataset.theme, undefined);
  assert.equal(page.style.values['--zoom'], '1');
});
