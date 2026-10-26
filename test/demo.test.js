const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const demo = require('../src/examiners/demoExaminer');
const { getLines } = require('../src/code');

const SAMPLE_DIR = path.join(__dirname, '..', 'public', 'samples');
const files = ['token_queue.h', 'token_queue.c'].map((name) => ({
  name,
  content: fs.readFileSync(path.join(SAMPLE_DIR, name), 'utf8'),
}));
const settings = { language: 'en', style: 'friendly', totalQuestions: 5 };

test('every scripted question finds its anchor in the sample project', () => {
  assert.ok(demo.isSampleProject(files));
  const sample = files[1].content;
  for (const step of demo.SAMPLE_SCRIPT) {
    assert.notEqual(demo.findAnchorLine(sample, step.anchor), -1, `anchor missing: ${step.anchor}`);
  }
});

test('scripted questions highlight the lines they ask about', async () => {
  const history = [];
  for (let i = 0; i < demo.SAMPLE_SCRIPT.length; i++) {
    const question = await demo.askQuestion({ files, settings, history });
    const lines = getLines(files, question.file, question.startLine, question.endLine).join('\n');
    assert.ok(lines.includes(demo.SAMPLE_SCRIPT[i].anchor), `question ${question.id} does not cover its anchor`);
    assert.equal(question.demo, true);
    history.push({ ...question, verdict: 'gap', score: 1 });
  }
});

test('grading: wrong, partial and strong answers to the first question', async () => {
  const question = await demo.askQuestion({ files, settings, history: [] });

  const wrong = await demo.grade({ files, settings, question, answer: 'It prints the time for the customer.', followUpAllowed: true });
  assert.equal(wrong.verdict, 'gap');

  const partial = await demo.grade({ files, settings, question, answer: 'It uses integer division so the minutes are truncated.', followUpAllowed: true });
  assert.equal(partial.verdict, 'partial');
  assert.ok(partial.followUp, 'a partial answer should get a follow-up');
  assert.equal(partial.followUp.isFollowUp, true);
  assert.equal(partial.followUp.parentId, question.id);

  const noFollowUp = await demo.grade({ files, settings, question, answer: 'It uses integer division so the minutes are truncated.', followUpAllowed: false });
  assert.equal(noFollowUp.followUp, null);

  const strong = await demo.grade({
    files, settings, question, followUpAllowed: true,
    answer: 'No: integer division truncates, the new customer is already counted in size so they wait for themselves, and priority customers are not at the back.',
  });
  assert.equal(strong.verdict, 'solid');
  assert.equal(strong.followUp, null);
});

test('short numbers match only as whole words in follow-up answers', async () => {
  const question = await demo.askQuestion({ files, settings, history: [] });
  const partial = await demo.grade({ files, settings, question, answer: 'It uses integer division so the minutes are truncated.', followUpAllowed: true });
  const followUp = partial.followUp;
  const vague = await demo.grade({ files, settings, question: followUp, answer: 'It multiplies 150 by the size of the queue.', followUpAllowed: false });
  assert.equal(vague.verdict, 'gap', '"150" must not count as saying "0"');
  const right = await demo.grade({ files, settings, question: followUp, answer: 'It prints 2 minutes but should print 0 since nobody is ahead.', followUpAllowed: false });
  assert.equal(right.verdict, 'solid');
});

test("I don't know returns a gap with the model answer", async () => {
  const question = await demo.askQuestion({ files, settings, history: [] });
  const result = await demo.grade({ files, settings, question, answer: '', dontKnow: true, followUpAllowed: true });
  assert.equal(result.verdict, 'gap');
  assert.equal(result.score, 0);
  assert.ok(result.modelAnswer.length > 50);
});

test('Bangla settings return Bangla questions', async () => {
  const question = await demo.askQuestion({ files, settings: { ...settings, language: 'bn' }, history: [] });
  assert.match(question.text, /[ঀ-৿]/);
});

test('generic code gets questions about real functions and loops', async () => {
  const code = [
    'def average(values):',
    '    total = 0',
    '    for v in values:',
    '        total += v',
    '    if len(values) == 0:',
    '        return 0',
    '    return total / len(values)',
  ].join('\n');
  const own = [{ name: 'stats.py', content: code }];
  const first = await demo.askQuestion({ files: own, settings, history: [] });
  assert.match(first.text, /average/);
  assert.equal(first.startLine, 1);

  const second = await demo.askQuestion({ files: own, settings, history: [{ ...first, verdict: 'gap', score: 1 }] });
  assert.equal(second.file, 'stats.py');

  const graded = await demo.grade({
    files: own, settings, question: first, followUpAllowed: true,
    answer: 'average takes values, adds each v into total, and returns total divided by the length; an empty list would divide by zero.',
  });
  assert.ok(['solid', 'partial'].includes(graded.verdict));
});
