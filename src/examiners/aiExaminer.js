// AI examiner: prompt -> model -> validated result.
// The model's reply is never trusted as-is: questions are checked against
// the code they highlight (grounding.js), each question carries an answer key
// written before the student answers, the score is computed on the server
// from the key-point checklist, and follow-ups obey the one-per-question rule.
//
// options.grading: 'checklist' (default) or 'holistic' (the model picks the
// 0-10 score, as before the hackathon; kept so the evaluation can compare).

const { clampRange } = require('../code');
const { normaliseScore, normaliseStatus, scoreFromChecklist, verdictForScore } = require('../scoring');
const { questionPrompt, keyPointsPrompt, gradePrompt, reportPrompt, targetFor } = require('../prompts');
const { LlmError } = require('../llm/extractJson');
const { checkQuestion, overlapShare } = require('../grounding');

const FALLBACK_SCORE = { solid: 9, partial: 5, gap: 1 };
const MAX_QUESTION_ATTEMPTS = 2;
const MIN_KEY_POINTS = 2;
const MAX_KEY_POINTS = 4;
const MAX_WRONG_CLAIMS = 3;

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+\n/g, '\n').trim().slice(0, maxLength);
}

function cleanList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) {
    return [];
  }
  const result = [];
  for (const item of value) {
    const text = cleanText(typeof item === 'string' ? item : item && item.text, maxLength);
    if (text !== '' && result.length < maxItems) {
      result.push(text);
    }
  }
  return result;
}

function bestTurnPerQuestion(history) {
  const result = [];
  for (const turn of history) {
    if (turn.isFollowUp || !turn.verdict) {
      continue;
    }
    const followUp = history.find((t) => t.isFollowUp && t.parentId === turn.id && t.verdict);
    result.push({ turn, best: followUp && followUp.score > turn.score ? followUp : turn });
  }
  return result;
}

// A follow-up is marked against the points the first answer did not cover.
// (If every point was covered but a wrong claim pulled the score down, the
// follow-up is marked against all of them.)
function followUpKeyPoints(points) {
  const open = [];
  for (const point of points) {
    if (point.status !== 'covered') {
      open.push(point.text);
    }
  }
  if (open.length > 0) {
    return open;
  }
  return points.map((point) => point.text);
}

function createAiExaminer(llm, options = {}) {
  const grading = options.grading === 'holistic' ? 'holistic' : 'checklist';

  // Asks the model for a question and checks it against the real code.
  // A question that cannot be repaired is asked again once, with the reason.
  async function askQuestion({ files, settings, history }) {
    const question = await askGroundedQuestion({ files, settings, history });
    if (grading === 'checklist' && question.keyPoints.length < MIN_KEY_POINTS) {
      question.keyPoints = await makeKeyPoints({ files, settings, question });
    }
    return question;
  }

  // The answer key for a question, from a separate call. Used when the
  // question reply came without one, and by the evaluation for fixed questions.
  async function makeKeyPoints({ files, settings, question }) {
    const reply = await llm.generateJson(keyPointsPrompt({ files, settings, question }));
    return cleanList(reply.keyPoints, MAX_KEY_POINTS, 300);
  }

  async function askGroundedQuestion({ files, settings, history }) {
    const number = history.filter((turn) => !turn.isFollowUp).length + 1;
    const allProblems = [];
    let rejection = null;
    let lastReply = null;
    let lastText = '';

    for (let attempt = 1; attempt <= MAX_QUESTION_ATTEMPTS; attempt++) {
      const reply = await llm.generateJson(questionPrompt({ files, settings, history, rejection }));
      const text = cleanText(reply.question, 600);
      if (text === '') {
        allProblems.push('no question text came back');
        rejection = 'it contained no question';
        continue;
      }
      lastReply = reply;
      lastText = text;

      const target = targetFor(settings, history);
      const options = target ? { lockedFile: target.file, nearRange: target, allowRepeat: true } : {};
      const check = checkQuestion(files, { ...reply, question: text }, history, options);
      allProblems.push(...check.problems);
      if (check.status !== 'rejected') {
        let status = check.status;
        let range = check.range;
        if (target && overlapShare(range, target) === 0 && overlapShare(target, range) === 0) {
          // A re-test question must stay on the region being re-tested.
          allProblems.push(`moved back to the re-tested region ${target.file} lines ${target.startLine}-${target.endLine}`);
          range = clampRange(files, target.file, target.startLine, target.endLine);
          status = 'repaired';
        }
        if (attempt > 1) {
          status = 'regenerated';
        }
        // A re-test keeps the earlier topic, so before -> after lines up.
        const topicReply = target && target.topic ? { ...reply, topic: target.topic } : reply;
        return buildQuestion(number, topicReply, text, range, { status, attempts: attempt, problems: allProblems });
      }
      rejection = check.problems.join('; ');
    }

    if (!lastReply) {
      throw new LlmError('The examiner lost its place (no question came back). Please retry.');
    }
    // Both attempts failed the check: keep the last question on valid lines,
    // and say so, rather than stopping the viva.
    const range = clampRange(files, lastReply.file, lastReply.startLine, lastReply.endLine);
    return buildQuestion(number, lastReply, lastText, range, { status: 'unverified', attempts: MAX_QUESTION_ATTEMPTS, problems: allProblems });
  }

  function buildQuestion(number, reply, text, range, grounding) {
    return {
      id: `q${number}`,
      text,
      topic: cleanText(reply.topic, 60) || `Question ${number}`,
      ...range,
      isFollowUp: false,
      grounding,
      keyPoints: cleanList(reply.keyPoints, MAX_KEY_POINTS, 300),
    };
  }

  async function grade({ files, settings, history, question, answer, dontKnow, followUpAllowed }) {
    const keyPoints = cleanList(question.keyPoints, MAX_KEY_POINTS, 300);
    const useChecklist = grading === 'checklist' && keyPoints.length > 0;
    const reply = await llm.generateJson(gradePrompt({
      files, settings, history, question: { ...question, keyPoints }, answer, dontKnow, followUpAllowed,
      grading: useChecklist ? 'checklist' : 'holistic',
    }));

    // The score decides the verdict, so stamps, heatmap and total always agree.
    let score;
    let points = [];
    let wrongClaims = [];
    if (dontKnow) {
      score = 0;
      points = keyPoints.map((text) => ({ text, status: 'missing' }));
    } else if (useChecklist) {
      const marks = Array.isArray(reply.points) ? reply.points : [];
      points = keyPoints.map((text, i) => {
        const mark = marks[i];
        const status = normaliseStatus(mark && typeof mark === 'object' ? mark.status : mark);
        return { text, status };
      });
      wrongClaims = cleanList(reply.wrongClaims, MAX_WRONG_CLAIMS, 300);
      score = scoreFromChecklist(points.map((p) => p.status), wrongClaims.length);
    } else if (reply.score !== undefined && reply.score !== null && reply.score !== '') {
      score = normaliseScore(reply.score);
    } else {
      score = FALLBACK_SCORE[reply.verdict] !== undefined ? FALLBACK_SCORE[reply.verdict] : 1;
    }
    const verdict = verdictForScore(score);

    let followUp = null;
    const proposed = reply.followUp;
    if (followUpAllowed && verdict === 'partial' && proposed && cleanText(proposed.question, 600) !== '') {
      // Follow-ups stay in the same file as the question they push back on.
      const followUpText = cleanText(proposed.question, 600);
      const check = checkQuestion(files, {
        file: question.file,
        startLine: proposed.startLine || question.startLine,
        endLine: proposed.endLine || question.endLine,
        question: followUpText,
      }, history, { lockedFile: question.file, allowRepeat: true, nearRange: question });
      let range = check.range;
      let status = check.status;
      if (status === 'rejected' || !range) {
        // Not worth another model call: fall back to the parent question's lines.
        range = clampRange(files, question.file, question.startLine, question.endLine);
        status = 'unverified';
      }
      followUp = {
        id: `${question.id}-f`,
        text: followUpText,
        topic: question.topic,
        ...range,
        isFollowUp: true,
        parentId: question.id,
        grounding: { status, attempts: 1, problems: check.problems },
        // The follow-up is marked against what the first answer did not cover.
        keyPoints: followUpKeyPoints(points),
      };
    }

    const feedback = cleanText(reply.feedback, 1200);
    return {
      verdict,
      score,
      feedback,
      modelAnswer: verdict === 'solid' ? '' : cleanText(reply.modelAnswer, 1500) || feedback,
      followUp,
      grading: useChecklist ? 'checklist' : 'holistic',
      points,
      wrongClaims,
    };
  }

  async function report({ files, settings, history }) {
    // Strengths and gaps come straight from the marked answers, so the lists
    // always match the heatmap. The model writes the summary and revision plan.
    const strengths = [];
    const gaps = [];
    for (const { turn, best } of bestTurnPerQuestion(history)) {
      if (best.verdict === 'solid') {
        strengths.push(turn.topic);
      } else {
        gaps.push({ text: turn.topic, file: turn.file, startLine: turn.startLine, endLine: turn.endLine });
      }
    }

    const reply = await llm.generateJson(reportPrompt({ files, settings, history }));
    const revise = Array.isArray(reply.revise)
      ? reply.revise.map((item) => cleanText(item, 300)).filter(Boolean).slice(0, 3)
      : [];
    return {
      summary: cleanText(reply.summary, 900),
      strengths,
      gaps,
      revise,
    };
  }

  return { name: llm.name, grading, askQuestion, makeKeyPoints, grade, report };
}

module.exports = { createAiExaminer };
