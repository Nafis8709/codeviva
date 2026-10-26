// The AI examiner with a fake model, to check that messy replies are repaired.
const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiExaminer } = require('../src/examiners/aiExaminer');
const { extractJson } = require('../src/llm/extractJson');
const { questionPrompt, gradePrompt } = require('../src/prompts');

const files = [{ name: 'src/list.c', content: Array.from({ length: 30 }, (_, i) => `line_${i + 1}();`).join('\n') }];
const settings = { language: 'en', style: 'friendly', totalQuestions: 5 };

function fakeLlm(reply) {
  const calls = [];
  return {
    name: 'fake',
    calls,
    async generateJson(prompt) {
      calls.push(prompt);
      return typeof reply === 'function' ? reply(prompt) : reply;
    },
  };
}

test('extractJson handles fences and surrounding chatter', () => {
  assert.deepEqual(extractJson('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! Here it is: {"a": {"b": 2}} Hope that helps.'), { a: { b: 2 } });
  assert.throws(() => extractJson('no json here'), /could not be read/);
});

test('questions with a wrong file name and out-of-range lines are repaired', async () => {
  const llm = fakeLlm({ file: 'LIST.C', startLine: 25, endLine: 400, topic: 'Cleanup', question: ' Why line 25? ' });
  const examiner = createAiExaminer(llm);
  const question = await examiner.askQuestion({ files, settings, history: [] });
  assert.deepEqual(
    { id: question.id, file: question.file, startLine: question.startLine, endLine: question.endLine, text: question.text },
    { id: 'q1', file: 'src/list.c', startLine: 25, endLine: 30, text: 'Why line 25?' },
  );
});

test('the prompt sends numbered code and forbids repeating examined lines', () => {
  const history = [{ id: 'q1', text: 'Q', topic: 'T', file: 'src/list.c', startLine: 3, endLine: 5, isFollowUp: false, answer: 'A', verdict: 'gap', score: 2 }];
  const prompt = questionPrompt({ files, settings, history });
  assert.match(prompt.user, /   7 \| line_7\(\);/);
  assert.match(prompt.user, /do NOT ask about these lines again: src\/list\.c lines 3-5/);
  assert.match(prompt.user, /question 2 of 5/);
});

test('Bangla setting asks the model to answer in Bangla', () => {
  const prompt = gradePrompt({ files, settings: { ...settings, language: 'bn' }, history: [], question: { id: 'q1', text: 'Q', file: 'src/list.c', startLine: 1, endLine: 2 }, answer: 'A', dontKnow: false, followUpAllowed: true });
  assert.match(prompt.system, /Bangla/);
});

test('the score decides the verdict, and follow-ups only appear for partial answers', async () => {
  const question = { id: 'q2', text: 'Q', topic: 'Loop', file: 'src/list.c', startLine: 10, endLine: 12, isFollowUp: false };

  const inconsistent = createAiExaminer(fakeLlm({ verdict: 'solid', score: 5, feedback: 'ok', modelAnswer: 'm', followUp: { question: 'Why?', startLine: 11, endLine: 11 } }));
  const partial = await inconsistent.grade({ files, settings, history: [], question, answer: 'x', dontKnow: false, followUpAllowed: true });
  assert.equal(partial.verdict, 'partial');
  assert.equal(partial.followUp.id, 'q2-f');
  assert.equal(partial.followUp.parentId, 'q2');
  assert.equal(partial.followUp.file, 'src/list.c');

  const notAllowed = await inconsistent.grade({ files, settings, history: [], question, answer: 'x', dontKnow: false, followUpAllowed: false });
  assert.equal(notAllowed.followUp, null);

  const solid = createAiExaminer(fakeLlm({ verdict: 'solid', score: '9', feedback: 'great', modelAnswer: 'ignored', followUp: { question: 'More?' } }));
  const solidGrade = await solid.grade({ files, settings, history: [], question, answer: 'x', dontKnow: false, followUpAllowed: true });
  assert.equal(solidGrade.verdict, 'solid');
  assert.equal(solidGrade.followUp, null);
  assert.equal(solidGrade.modelAnswer, '');
});

test("I don't know is always a gap with score 0", async () => {
  const examiner = createAiExaminer(fakeLlm({ verdict: 'solid', score: 10, feedback: 'Here is how it works…', modelAnswer: 'Here is how it works…', followUp: null }));
  const question = { id: 'q1', text: 'Q', topic: 'T', file: 'src/list.c', startLine: 1, endLine: 2, isFollowUp: false };
  const result = await examiner.grade({ files, settings, history: [], question, answer: '', dontKnow: true, followUpAllowed: true });
  assert.equal(result.verdict, 'gap');
  assert.equal(result.score, 0);
});

test('report lists come from the marked answers, not the model', async () => {
  const examiner = createAiExaminer(fakeLlm({ summary: 'Mixed.', revise: ['a', 'b', 'c', 'd'] }));
  const history = [
    { id: 'q1', topic: 'Insert', file: 'src/list.c', startLine: 1, endLine: 3, isFollowUp: false, verdict: 'partial', score: 5 },
    { id: 'q1-f', topic: 'Insert', file: 'src/list.c', startLine: 1, endLine: 3, isFollowUp: true, parentId: 'q1', verdict: 'solid', score: 9 },
    { id: 'q2', topic: 'Free', file: 'src/list.c', startLine: 20, endLine: 22, isFollowUp: false, verdict: 'gap', score: 1 },
  ];
  const report = await examiner.report({ files, settings, history });
  assert.deepEqual(report.strengths, ['Insert']);
  assert.deepEqual(report.gaps, [{ text: 'Free', file: 'src/list.c', startLine: 20, endLine: 22 }]);
  assert.equal(report.revise.length, 3);
  assert.equal(report.summary, 'Mixed.');
});
