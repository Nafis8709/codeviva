// Numbers for the evaluation: how often the AI's verdict matches a human
// label, and how stable it is when the same answer is graded again.
// Plain functions, no model calls, so they can be unit-tested.

const ORDER = { gap: 0, partial: 1, solid: 2 };

function verdictDistance(a, b) {
  return Math.abs(ORDER[a] - ORDER[b]);
}

function percent(part, whole) {
  if (whole === 0) {
    return null;
  }
  return Math.round((part / whole) * 1000) / 10;
}

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((x, y) => x - y);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

// The verdict that appears most often across repeats (first one wins a tie).
function majorityVerdict(verdicts) {
  const counts = {};
  let best = null;
  for (const verdict of verdicts) {
    counts[verdict] = (counts[verdict] || 0) + 1;
    if (best === null || counts[verdict] > counts[best]) {
      best = verdict;
    }
  }
  return best;
}

// gradings: [{ answerId, label, runs: [{ verdict, score }] }]
// label may be null (not labelled yet) — those are left out of agreement.
function agreement(gradings) {
  let labelled = 0;
  let exact = 0;
  let withinOne = 0;
  let severe = 0;
  for (const grading of gradings) {
    if (!grading.label || grading.runs.length === 0) {
      continue;
    }
    labelled++;
    const verdict = majorityVerdict(grading.runs.map((run) => run.verdict));
    const distance = verdictDistance(verdict, grading.label);
    if (distance === 0) {
      exact++;
    }
    if (distance <= 1) {
      withinOne++;
    }
    if (distance === 2) {
      severe++;
    }
  }
  return {
    labelled,
    exactPercent: percent(exact, labelled),
    withinOnePercent: percent(withinOne, labelled),
    severe,
  };
}

// How stable grading is when the same answer is graded several times.
function consistency(gradings) {
  let measured = 0;
  let identical = 0;
  const spreads = [];
  for (const grading of gradings) {
    if (grading.runs.length < 2) {
      continue;
    }
    measured++;
    const verdicts = grading.runs.map((run) => run.verdict);
    if (verdicts.every((verdict) => verdict === verdicts[0])) {
      identical++;
    }
    const scores = grading.runs.map((run) => run.score);
    spreads.push(Math.max(...scores) - Math.min(...scores));
  }
  let spreadTotal = 0;
  for (const spread of spreads) {
    spreadTotal += spread;
  }
  return {
    measured,
    identicalPercent: percent(identical, measured),
    meanScoreSpread: spreads.length === 0 ? null : Math.round((spreadTotal / spreads.length) * 100) / 100,
    maxScoreSpread: spreads.length === 0 ? null : Math.max(...spreads),
  };
}

// statuses: grounding status of every question asked
function groundingCounts(statuses) {
  const counts = { total: statuses.length, grounded: 0, repaired: 0, regenerated: 0, unverified: 0 };
  for (const status of statuses) {
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status]++;
    }
  }
  counts.rawCorrectPercent = percent(counts.grounded, counts.total);
  counts.finalVerifiedPercent = percent(counts.total - counts.unverified, counts.total);
  return counts;
}

module.exports = { ORDER, verdictDistance, percent, median, majorityVerdict, agreement, consistency, groundingCounts };
