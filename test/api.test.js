// Runs a whole viva through the HTTP API with the demo examiner.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createApp } = require('../server');
const demo = require('../src/examiners/demoExaminer');

const files = ['token_queue.h', 'token_queue.c'].map((name) => ({
  name,
  content: fs.readFileSync(path.join(__dirname, '..', 'public', 'samples', name), 'utf8'),
}));

let server;
let base;

test.before(async () => {
  const { app } = createApp({ examiner: demo, status: { mode: 'demo', model: null, label: 'Demo' } });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function post(route, body) {
  const response = await fetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('status route reports the examiner', async () => {
  const response = await fetch(`${base}/api/status`);
  assert.equal((await response.json()).mode, 'demo');
});

test('a full 3-question viva ends in a report with a server-computed score', async () => {
  const settings = { language: 'en', style: 'friendly', totalQuestions: 3 };
  const history = [];
  for (let i = 0; i < 3; i++) {
    const asked = await post('/api/viva/question', { files, settings, history });
    assert.equal(asked.status, 200);
    const question = asked.body.question;
    const lastQuestion = i === 2;
    const graded = await post('/api/viva/grade', {
      files, settings, history, question,
      answer: lastQuestion ? '' : 'I think it handles the case correctly somehow.',
      dontKnow: lastQuestion,
    });
    assert.equal(graded.status, 200);
    history.push({ ...question, ...graded.body.grade });
  }
  const reported = await post('/api/viva/report', { files, settings, history });
  assert.equal(reported.status, 200);
  assert.equal(typeof reported.body.report.score, 'number');
  assert.ok(reported.body.report.gaps.length >= 1);
  assert.equal(reported.body.report.revise.length, 3);
});

test('follow-ups never get their own follow-up', async () => {
  const settings = { language: 'en', style: 'friendly', totalQuestions: 5 };
  const { body } = await post('/api/viva/question', { files, settings, history: [] });
  const followUpQuestion = { ...body.question, id: 'q1-f', isFollowUp: true, parentId: 'q1' };
  const graded = await post('/api/viva/grade', { files, settings, history: [], question: followUpQuestion, answer: 'it prints 2 minutes I think' });
  assert.equal(graded.body.grade.followUp, null);
});

test('bad input gives readable 400 errors', async () => {
  const settings = { language: 'en' };
  const noFiles = await post('/api/viva/question', { files: [], settings, history: [] });
  assert.equal(noFiles.status, 400);
  assert.match(noFiles.body.error, /Load at least one/);

  const tooBig = await post('/api/viva/question', { files: [{ name: 'big.c', content: 'x'.repeat(61000) }], settings, history: [] });
  assert.equal(tooBig.status, 400);

  const { body } = await post('/api/viva/question', { files, settings, history: [] });
  const emptyAnswer = await post('/api/viva/grade', { files, settings, history: [], question: body.question, answer: '   ' });
  assert.equal(emptyAnswer.status, 400);
});
