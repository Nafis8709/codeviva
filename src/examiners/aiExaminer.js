// AI examiner: prompt -> model -> validated result.
// The model's reply is never trusted as-is: file names and line numbers are
// snapped onto real code, verdicts follow the score, and follow-ups obey the
// one-per-question rule.

const { clampRange } = require('../code');
const { normaliseScore, verdictForScore } = require('../scoring');
const { questionPrompt, gradePrompt, reportPrompt } = require('../prompts');
const { LlmError } = require('../llm/extractJson');

const FALLBACK_SCORE = { solid: 9, partial: 5, gap: 1 };

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+\n/g, '\n').trim().slice(0, maxLength);
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

function createAiExaminer(llm) {
  async function askQuestion({ files, settings, history }) {
    const number = history.filter((turn) => !turn.isFollowUp).length + 1;
    const reply = await llm.generateJson(questionPrompt({ files, settings, history }));
    const text = cleanText(reply.question, 600);
    if (text === '') {
      throw new LlmError('The examiner lost its place (no question came back). Please retry.');
    }
    const range = clampRange(files, reply.file, reply.startLine, reply.endLine);
    return {
      id: `q${number}`,
      text,
      topic: cleanText(reply.topic, 60) || `Question ${number}`,
      ...range,
      isFollowUp: false,
    };
  }

  async function grade({ files, settings, history, question, answer, dontKnow, followUpAllowed }) {
    const reply = await llm.generateJson(gradePrompt({ files, settings, history, question, answer, dontKnow, followUpAllowed }));

    // The score decides the verdict, so stamps, heatmap and total always agree.
    let score;
    if (dontKnow) {
      score = 0;
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
      const range = clampRange(files, question.file, proposed.startLine || question.startLine, proposed.endLine || question.endLine);
      followUp = {
        id: `${question.id}-f`,
        text: cleanText(proposed.question, 600),
        topic: question.topic,
        ...range,
        isFollowUp: true,
        parentId: question.id,
      };
    }

    const feedback = cleanText(reply.feedback, 1200);
    return {
      verdict,
      score,
      feedback,
      modelAnswer: verdict === 'solid' ? '' : cleanText(reply.modelAnswer, 1500) || feedback,
      followUp,
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

  return { name: llm.name, askQuestion, grade, report };
}

module.exports = { createAiExaminer };
