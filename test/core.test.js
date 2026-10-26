const test = require('node:test');
const assert = require('node:assert/strict');

const { validateFiles, numberCode, clampRange, InputError } = require('../src/code');
const { computeScore, verdictForScore } = require('../src/scoring');

test('numberCode prefixes every line with its number and a file header', () => {
  const text = numberCode([{ name: 'a.c', content: 'int x;\nint y;' }]);
  assert.match(text, /=== FILE: a\.c \(2 lines\) ===/);
  assert.match(text, /   1 \| int x;/);
  assert.match(text, /   2 \| int y;/);
});

test('validateFiles rejects empty input and oversized code', () => {
  assert.throws(() => validateFiles([]), InputError);
  assert.throws(() => validateFiles([{ name: 'big.c', content: 'x'.repeat(60001) }]), /limit is 60,000/);
  assert.throws(() => validateFiles([{ name: 'a.c' }]), InputError);
});

test('validateFiles skips empty files and normalises Windows line endings', () => {
  const files = validateFiles([{ name: 'empty.c', content: '   ' }, { name: 'a.c', content: 'a\r\nb' }]);
  assert.equal(files.length, 1);
  assert.equal(files[0].content, 'a\nb');
});

test('clampRange snaps bad model output back onto real lines', () => {
  const files = [{ name: 'src/main.c', content: 'a\nb\nc\nd\ne' }];
  assert.deepEqual(clampRange(files, 'MAIN.C', 4, 99), { file: 'src/main.c', startLine: 4, endLine: 5 });
  assert.deepEqual(clampRange(files, 'unknown.py', -3, 2), { file: 'src/main.c', startLine: 1, endLine: 2 });
  assert.deepEqual(clampRange(files, 'src/main.c', 5, 2), { file: 'src/main.c', startLine: 2, endLine: 5 });
  assert.deepEqual(clampRange(files, 'src/main.c', 'three', undefined), { file: 'src/main.c', startLine: 1, endLine: 1 });
});

test('clampRange caps highlights at 15 lines', () => {
  const content = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n');
  const range = clampRange([{ name: 'a.c', content }], 'a.c', 3, 39);
  assert.equal(range.endLine - range.startLine + 1, 15);
});

test('computeScore averages questions and lets a follow-up recover the score', () => {
  const history = [
    { id: 'q1', score: 4, isFollowUp: false },
    { id: 'q1-f', parentId: 'q1', score: 9, isFollowUp: true },
    { id: 'q2', score: 2, isFollowUp: false },
  ];
  // q1 counts 9 (better attempt), q2 counts 2 -> (9 + 2) / 2 * 10 = 55
  assert.equal(computeScore(history), 55);
  assert.equal(computeScore([]), 0);
});

test('verdictForScore thresholds', () => {
  assert.equal(verdictForScore(9), 'solid');
  assert.equal(verdictForScore(8), 'solid');
  assert.equal(verdictForScore(5), 'partial');
  assert.equal(verdictForScore(1), 'gap');
});
