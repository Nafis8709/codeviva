// The ownership score is computed here, not by the AI, so the number is
// reproducible: same answers in, same score out.

const VERDICTS = ['solid', 'partial', 'gap'];

function verdictForScore(score) {
  if (score >= 8) {
    return 'solid';
  }
  if (score >= 4) {
    return 'partial';
  }
  return 'gap';
}

function normaliseScore(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.min(10, Math.max(0, n));
}

// A follow-up belongs to its parent question. The question counts the better
// of the two attempts — recovering under questioning is rewarded.
function bestScorePerQuestion(history) {
  const best = new Map();
  for (const turn of history) {
    if (typeof turn.score !== 'number') {
      continue; // unanswered
    }
    const questionId = turn.isFollowUp && turn.parentId ? turn.parentId : turn.id;
    const previous = best.has(questionId) ? best.get(questionId) : -1;
    if (turn.score > previous) {
      best.set(questionId, turn.score);
    }
  }
  return best;
}

function computeScore(history) {
  const best = bestScorePerQuestion(history || []);
  if (best.size === 0) {
    return 0;
  }
  let total = 0;
  for (const score of best.values()) {
    total += score;
  }
  return Math.round((total / best.size) * 10);
}

module.exports = { VERDICTS, verdictForScore, normaliseScore, bestScorePerQuestion, computeScore };
