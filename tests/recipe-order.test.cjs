const test = require('node:test');
const assert = require('node:assert/strict');
const { placeRowAt, getInsertionIndex } = require('../public/recipe-order.js');
const fixture = () => ['packages', 'command', 'service', 'another-command'].map(id => ({ id }));
const ids = rows => rows.map(row => row.id);

test('moving down uses the final position after removal', () => {
  const rows = fixture();
  assert.deepEqual(ids(placeRowAt(rows, 'packages', 2)), ['command', 'service', 'packages', 'another-command']);
  assert.deepEqual(ids(rows), ['packages', 'command', 'service', 'another-command']);
});

test('moving up preserves the other rows and their identities', () => {
  const rows = fixture();
  const reordered = placeRowAt(rows, 'another-command', 0);
  assert.deepEqual(ids(reordered), ['another-command', 'packages', 'command', 'service']);
  assert.equal(reordered[0], rows[3]);
  assert.equal(reordered[1], rows[0]);
});

test('supports first-to-last and last-to-first drops', () => {
  const rows = fixture();
  const moved = placeRowAt(rows, 'packages', rows.length - 1);
  assert.deepEqual(ids(moved), ['command', 'service', 'another-command', 'packages']);
  assert.deepEqual(ids(placeRowAt(moved, 'packages', 0)), ids(rows));
});

test('same-position drops are no-ops', () => {
  const rows = fixture();
  assert.equal(placeRowAt(rows, 'command', 1), rows);
});

test('unknown rows and invalid positions cannot mutate the recipe', () => {
  const rows = fixture();
  assert.equal(placeRowAt(rows, 'missing', 0), rows);
  for (const position of [-1, rows.length, 1.5, NaN]) {
    assert.equal(placeRowAt(rows, 'command', position), rows);
  }
});

test('handles empty and single-row recipes', () => {
  const empty = [];
  const single = [{ id: 'only' }];
  assert.equal(placeRowAt(empty, 'missing', 0), empty);
  assert.equal(placeRowAt(single, 'only', 0), single);
  assert.equal(getInsertionIndex([], 100), 0);
});

test('insertion positions use midpoints and support variable-height rows', () => {
  const rects = [{ top: 100, height: 100 }, { top: 210, height: 200 }, { top: 420, height: 60 }];
  for (const [y, index] of [[0, 0], [149, 0], [150, 1], [309, 1], [310, 2], [449, 2], [450, 3], [1000, 3]]) {
    assert.equal(getInsertionIndex(rects, y), index);
  }
});
