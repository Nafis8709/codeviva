// Grounding: a question must be about the lines it highlights.
const test = require('node:test');
const assert = require('node:assert/strict');

const { checkQuestion, identifiersInQuestion, lineNumbersInText } = require('../src/grounding');
const { createAiExaminer } = require('../src/examiners/aiExaminer');

const queue = [
  'struct node { int value; struct node *next; };',   // 1
  'struct node *head = NULL;',                         // 2
  'struct node *tail = NULL;',                         // 3
  '',                                                  // 4
  'void enqueue(int value) {',                         // 5
  '  struct node *n = malloc(sizeof *n);',             // 6
  '  n->value = value;',                               // 7
  '  n->next = NULL;',                                 // 8
  '  if (tail) tail->next = n; else head = n;',        // 9
  '  tail = n;',                                       // 10
  '}',                                                 // 11
  '',                                                  // 12
  'int dequeue(void) {',                               // 13
  '  struct node *old = head;',                        // 14
  '  int value = old->value;',                         // 15
  '  head = head->next;',                              // 16
  '  if (head == NULL) tail = NULL;',                  // 17
  '  free(old);',                                      // 18
  '  return value;',                                   // 19
  '}',                                                 // 20
].join('\n');
const helper = 'int helper(void) {\n  return 1;\n}';
const files = [{ name: 'src/queue.c', content: queue }, { name: 'src/helper.c', content: helper }];

test('identifiers come from backticks; keywords and plain prose are ignored', () => {
  assert.deepEqual(identifiersInQuestion('Why does `tail->next` change but not `head`? What if `NULL`?'), ['tail', 'next', 'head']);
  assert.deepEqual(identifiersInQuestion('No backticks here at all'), []);
});

test('line numbers mentioned in the text are found', () => {
  assert.deepEqual(lineNumbersInText('On line 17, why…'), [17]);
  assert.deepEqual(lineNumbersInText('Look at lines 14–18 and line 3'), [14, 18, 3]);
});

test('a correct question is grounded', () => {
  const check = checkQuestion(files, { file: 'src/queue.c', startLine: 16, endLine: 17, question: 'Why is `tail` reset when `head` becomes NULL?' }, []);
  assert.equal(check.status, 'grounded');
  assert.deepEqual(check.range, { file: 'src/queue.c', startLine: 16, endLine: 17 });
});

test('wrong lines are moved to where the named identifiers really are', () => {
  // The model points at helper.c, but asks about `free` and `old` in dequeue.
  const check = checkQuestion(files, { file: 'src/helper.c', startLine: 1, endLine: 3, question: 'Why is `old` passed to `free` only after `head` moves on?' }, []);
  assert.equal(check.status, 'repaired');
  assert.equal(check.range.file, 'src/queue.c');
  assert.ok(check.range.startLine <= 18 && check.range.endLine >= 14, `got ${JSON.stringify(check.range)}`);
});

test('re-anchoring prefers the window that holds all named identifiers together', () => {
  // `tail` alone appears early (line 3); with `dequeue` it must land in dequeue (13-17).
  const check = checkQuestion(files, { file: 'src/queue.c', startLine: 5, endLine: 6, question: 'Why does `dequeue` reset `tail`?' }, []);
  assert.equal(check.status, 'repaired');
  assert.deepEqual(check.range, { file: 'src/queue.c', startLine: 13, endLine: 17 });
});

test('the file the model named wins when it holds all identifiers', () => {
  const header = { name: 'src/queue.h', content: 'struct q { node *tail; };\nint dequeue(void);' };
  const both = [header, files[0]];
  const check = checkQuestion(both, { file: 'src/queue.c', startLine: 1, endLine: 2, question: 'Why does `dequeue` reset `tail`?' }, []);
  assert.equal(check.range.file, 'src/queue.c');
  assert.equal(check.range.startLine, 13);
});

test('an unknown file is no longer silently replaced by the first file', () => {
  const noClues = checkQuestion(files, { file: 'list.py', startLine: 2, endLine: 3, question: 'What does this function return?' }, []);
  assert.equal(noClues.status, 'rejected');
  const withClues = checkQuestion(files, { file: 'list.py', startLine: 2, endLine: 3, question: 'What does `helper` return?' }, []);
  assert.equal(withClues.status, 'repaired');
  assert.equal(withClues.range.file, 'src/helper.c');
});

test('text that mentions a line outside the highlight is rejected', () => {
  const check = checkQuestion(files, { file: 'src/queue.c', startLine: 5, endLine: 10, question: 'On line 17, why is `tail` set to NULL?' }, []);
  assert.equal(check.status, 'rejected');
  assert.match(check.problems.join(' '), /mentions line 17/);
});

test('re-examining an already examined region is rejected', () => {
  const history = [{ id: 'q1', file: 'src/queue.c', startLine: 14, endLine: 18, isFollowUp: false }];
  const check = checkQuestion(files, { file: 'src/queue.c', startLine: 15, endLine: 17, question: 'Why `free(old)`?' }, history);
  assert.equal(check.status, 'rejected');
  assert.match(check.problems.join(' '), /already examined/);
});

function scriptedLlm(replies) {
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

test('a rejected question is asked again once, with the reason in the prompt', async () => {
  const llm = scriptedLlm([
    { file: 'src/queue.c', startLine: 5, endLine: 10, topic: 'Reset', question: 'On line 17, why is `tail` set to NULL?' },
    { file: 'src/queue.c', startLine: 17, endLine: 17, topic: 'Reset', question: 'On line 17, why is `tail` set to NULL?' },
  ]);
  const question = await createAiExaminer(llm).askQuestion({ files, settings: { language: 'en', style: 'friendly', totalQuestions: 5 }, history: [] });
  assert.equal(llm.calls.length, 2);
  assert.match(llm.calls[1].user, /rejected by the line checker because the question mentions line 17/);
  assert.equal(question.grounding.status, 'regenerated');
  assert.equal(question.startLine, 17);
});

test('after two failed attempts the viva continues with an unverified question', async () => {
  const bad = { file: 'nowhere.c', startLine: 1, endLine: 2, topic: 'X', question: 'What does this do?' };
  const llm = scriptedLlm([bad, bad]);
  const question = await createAiExaminer(llm).askQuestion({ files, settings: { language: 'en', style: 'friendly', totalQuestions: 5 }, history: [] });
  assert.equal(llm.calls.length, 2);
  assert.equal(question.grounding.status, 'unverified');
  assert.equal(question.file, 'src/queue.c');
});

test('a follow-up stays in its parent file and is re-anchored inside it', async () => {
  const llm = scriptedLlm([{ verdict: 'partial', score: 5, feedback: 'f', modelAnswer: 'm', followUp: { question: 'And what does `free` do to `old`?', startLine: 1, endLine: 2 } }]);
  const parent = { id: 'q1', text: 'Q', topic: 'Dequeue', file: 'src/queue.c', startLine: 14, endLine: 19, isFollowUp: false };
  const grade = await createAiExaminer(llm).grade({ files, settings: { language: 'en', style: 'friendly', totalQuestions: 5 }, history: [], question: parent, answer: 'x', dontKnow: false, followUpAllowed: true });
  assert.equal(grade.followUp.file, 'src/queue.c');
  assert.equal(grade.followUp.grounding.status, 'repaired');
  assert.ok(grade.followUp.startLine >= 14 && grade.followUp.startLine <= 18);
});
