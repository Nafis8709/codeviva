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

// Checklist grading: the model only says, for each expected key point,
// whether the answer covered it; this function turns that into the score.
//   covered = 1, partial = 0.5, missing = 0  ->  share of points × 10
//   each technically wrong claim costs WRONG_CLAIM_PENALTY (a confident
//   wrong statement should never be "solid")
const POINT_VALUES = { covered: 1, partial: 0.5, missing: 0 };
const WRONG_CLAIM_PENALTY = 3;

function normaliseStatus(value) {
  const status = String(value || '').toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(POINT_VALUES, status) ? status : 'missing';
}

function scoreFromChecklist(statuses, wrongClaimCount) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return 0;
  }
  let earned = 0;
  for (const status of statuses) {
    earned += POINT_VALUES[normaliseStatus(status)];
  }
  const raw = (earned / statuses.length) * 10 - WRONG_CLAIM_PENALTY * (wrongClaimCount || 0);
  return normaliseScore(raw);
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

module.exports = {
  VERDICTS,
  POINT_VALUES,
  WRONG_CLAIM_PENALTY,
  verdictForScore,
  normaliseScore,
  normaliseStatus,
  scoreFromChecklist,
  bestScorePerQuestion,
  computeScore,
};
