// Answer-key grading: the model marks key points, the server computes the score.
const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreFromChecklist, normaliseStatus } = require('../src/scoring');
const { createAiExaminer } = require('../src/examiners/aiExaminer');
const { gradePrompt, questionPrompt } = require('../src/prompts');

const files = [{ name: 'q.c', content: Array.from({ length: 20 }, (_, i) => `step_${i + 1}();`).join('\n') }];
const settings = { language: 'en', style: 'friendly', totalQuestions: 5 };
const keyPoints = ['Resets tail when the queue becomes empty.', 'Otherwise tail would point at freed memory.', 'The next enqueue would then write through it.'];
const question = { id: 'q1', text: 'Why `step_3`?', topic: 'Reset', file: 'q.c', startLine: 3, endLine: 4, isFollowUp: false, keyPoints };

function fakeLlm(replies) {
  const calls = [];
  return {
    name: 'fake',
    calls,
    async generateJson(prompt) {
      calls.push(prompt);
      return replies[Math.min(calls.length - 1, replies.length - 1)];
    },
  };
}

test('checklist score: covered 1, partial 0.5, missing 0, wrong claim -3', () => {
  assert.equal(scoreFromChecklist(['covered', 'covered', 'covered'], 0), 10);
  assert.equal(scoreFromChecklist(['covered', 'partial', 'missing'], 0), 5);
  assert.equal(scoreFromChecklist(['covered', 'covered', 'covered'], 1), 7); // never "solid" with a wrong claim
  assert.equal(scoreFromChecklist(['missing', 'missing'], 2), 0);
  assert.equal(scoreFromChecklist([], 0), 0);
  assert.equal(normaliseStatus('COVERED '), 'covered');
  assert.equal(normaliseStatus('kind of'), 'missing');
});

test('the same checklist always gives the same score, whatever score the model suggests', async () => {
  const reply = { points: [{ status: 'covered' }, { status: 'partial' }, { status: 'missing' }], wrongClaims: [], score: 10, verdict: 'solid', feedback: 'f', modelAnswer: 'm', followUp: null };
  const examiner = createAiExaminer(fakeLlm([reply]));
  const result = await examiner.grade({ files, settings, history: [], question, answer: 'it resets tail', dontKnow: false, followUpAllowed: false });
  assert.equal(result.grading, 'checklist');
  assert.equal(result.score, 5);
  assert.equal(result.verdict, 'partial');
  assert.deepEqual(result.points.map((p) => p.status), ['covered', 'partial', 'missing']);
  assert.equal(result.points[0].text, keyPoints[0]);
});

test('missing or malformed marks count as missing; wrong claims are kept and capped', async () => {
  const reply = { points: ['covered'], wrongClaims: ['a', 'b', 'c', 'd', ''], feedback: 'f', modelAnswer: 'm', followUp: null };
  const result = await createAiExaminer(fakeLlm([reply])).grade({ files, settings, history: [], question, answer: 'x', dontKnow: false, followUpAllowed: false });
  assert.deepEqual(result.points.map((p) => p.status), ['covered', 'missing', 'missing']);
  assert.equal(result.wrongClaims.length, 3);
  assert.equal(result.score, 0);
});

test('the grading prompt carries the key points and never asks the model for a score', () => {
  const prompt = gradePrompt({ files, settings, history: [], question, answer: 'A', dontKnow: false, followUpAllowed: true });
  assert.match(prompt.user, /KEY POINTS/);
  assert.match(prompt.user, /2\. Otherwise tail would point at freed memory\./);
  assert.doesNotMatch(prompt.user, /"score"/);
  const holistic = gradePrompt({ files, settings, history: [], question, answer: 'A', dontKnow: false, followUpAllowed: true, grading: 'holistic' });
  assert.match(holistic.user, /"score": <integer 0-10>/);
  assert.match(questionPrompt({ files, settings, history: [] }).user, /"keyPoints"/);
});

test('holistic mode keeps the old behaviour for comparison', async () => {
  const examiner = createAiExaminer(fakeLlm([{ verdict: 'partial', score: 6, feedback: 'f', modelAnswer: 'm', followUp: null }]), { grading: 'holistic' });
  const result = await examiner.grade({ files, settings, history: [], question, answer: 'x', dontKnow: false, followUpAllowed: false });
  assert.equal(result.grading, 'holistic');
  assert.equal(result.score, 6);
});

test('questions carry their key points; a missing key is fetched with one extra call', async () => {
  const withKey = fakeLlm([{ file: 'q.c', startLine: 3, endLine: 4, topic: 'T', question: 'Why `step_3`?', keyPoints: ['one', 'two', '', 'three', 'four', 'five'] }]);
  const q1 = await createAiExaminer(withKey).askQuestion({ files, settings, history: [] });
  assert.deepEqual(q1.keyPoints, ['one', 'two', 'three', 'four']);
  assert.equal(withKey.calls.length, 1);

  const withoutKey = fakeLlm([
    { file: 'q.c', startLine: 3, endLine: 4, topic: 'T', question: 'Why `step_3`?' },
    { keyPoints: ['alpha', 'beta'] },
  ]);
  const q2 = await createAiExaminer(withoutKey).askQuestion({ files, settings, history: [] });
  assert.equal(withoutKey.calls.length, 2);
  assert.match(withoutKey.calls[1].user, /Write the answer key/);
  assert.deepEqual(q2.keyPoints, ['alpha', 'beta']);
});

test('a follow-up is marked against the points the first answer missed', async () => {
  const reply = { points: [{ status: 'covered' }, { status: 'missing' }, { status: 'partial' }], wrongClaims: [], feedback: 'f', modelAnswer: 'm', followUp: { question: 'What would `step_4` then do?', startLine: 4, endLine: 4 } };
  const result = await createAiExaminer(fakeLlm([reply])).grade({ files, settings, history: [], question, answer: 'x', dontKnow: false, followUpAllowed: true });
  assert.equal(result.verdict, 'partial');
  assert.deepEqual(result.followUp.keyPoints, [keyPoints[1], keyPoints[2]]);
});

test("I don't know marks every key point missing", async () => {
  const result = await createAiExaminer(fakeLlm([{ feedback: 'Here is how…', modelAnswer: 'Here is how…' }])).grade({ files, settings, history: [], question, answer: '', dontKnow: true, followUpAllowed: true });
  assert.equal(result.score, 0);
  assert.deepEqual(result.points.map((p) => p.status), ['missing', 'missing', 'missing']);
});
