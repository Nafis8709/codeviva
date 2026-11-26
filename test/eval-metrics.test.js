// The evaluation's arithmetic.
const test = require('node:test');
const assert = require('node:assert/strict');

const { agreement, consistency, groundingCounts, majorityVerdict, median } = require('../eval/metrics');

test('majority verdict and median', () => {
  assert.equal(majorityVerdict(['partial', 'solid', 'partial']), 'partial');
  assert.equal(majorityVerdict(['gap', 'solid']), 'gap');
  assert.equal(median([300, 100, 200]), 200);
  assert.equal(median([100, 200]), 150);
  assert.equal(median([]), null);
});

test('agreement uses the majority verdict and skips unlabelled answers', () => {
  const gradings = [
    { answerId: 'a', label: 'solid', runs: [{ verdict: 'solid' }, { verdict: 'solid' }, { verdict: 'partial' }] }, // exact
    { answerId: 'b', label: 'gap', runs: [{ verdict: 'partial' }] },                                           // off by one
    { answerId: 'c', label: 'gap', runs: [{ verdict: 'solid' }] },                                             // severe
    { answerId: 'd', label: null, runs: [{ verdict: 'solid' }] },                                              // skipped
  ];
  assert.deepEqual(agreement(gradings), { labelled: 3, exactPercent: 33.3, withinOnePercent: 66.7, severe: 1 });
});

test('consistency counts identical verdicts and score spread across repeats', () => {
  const gradings = [
    { runs: [{ verdict: 'solid', score: 9 }, { verdict: 'solid', score: 10 }, { verdict: 'solid', score: 9 }] },
    { runs: [{ verdict: 'partial', score: 5 }, { verdict: 'gap', score: 3 }, { verdict: 'partial', score: 5 }] },
    { runs: [{ verdict: 'gap', score: 0 }] }, // one run: not measurable
  ];
  assert.deepEqual(consistency(gradings), { measured: 2, identicalPercent: 50, meanScoreSpread: 1.5, maxScoreSpread: 2 });
});

test('grounding counts', () => {
  const counts = groundingCounts(['grounded', 'grounded', 'repaired', 'regenerated', 'unverified']);
  assert.equal(counts.total, 5);
  assert.equal(counts.rawCorrectPercent, 40);
  assert.equal(counts.finalVerifiedPercent, 80);
});
