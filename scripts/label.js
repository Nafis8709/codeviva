// Human labelling for the evaluation set: shows each answer with its code
// and question, and records your verdict in eval/labels.json.
//
//   npm run label            label answers that have no label yet
//   npm run label -- --all   go through every answer again
//
// Label the answers BEFORE running the evaluation, without looking at what
// the AI said, so the comparison is fair.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const EVAL_DIR = path.join(__dirname, '..', 'eval');
const LABELS_FILE = path.join(EVAL_DIR, 'labels.json');
const CONTEXT_LINES = 4;

const GUIDE = [
  'How to label (same rubric as CodeViva):',
  '  s = solid    correct and complete, including the key reason',
  '  p = partial  partly right, vague, or missing an important piece',
  '  g = gap      mostly wrong, off-topic, or no real answer',
  'Judge the meaning, not the English: Bangla and Banglish answers count the same.',
  'Other keys: k = skip, b = back, q = save and quit',
].join('\n');

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function saveLabels(labels) {
  fs.writeFileSync(LABELS_FILE, `${JSON.stringify(labels, null, 2)}\n`);
}

function showCode(caseItem) {
  const question = caseItem.question;
  const filePath = caseItem.files.find((name) => path.basename(name) === question.file);
  const lines = fs.readFileSync(path.join(EVAL_DIR, 'code', filePath), 'utf8').replace(/\r\n?/g, '\n').split('\n');
  const from = Math.max(1, question.startLine - CONTEXT_LINES);
  const to = Math.min(lines.length, question.endLine + CONTEXT_LINES);
  const out = [`--- ${question.file} ---`];
  for (let n = from; n <= to; n++) {
    const marker = n >= question.startLine && n <= question.endLine ? '>>' : '  ';
    out.push(`${marker}${String(n).padStart(4, ' ')} | ${lines[n - 1]}`);
  }
  return out.join('\n');
}

// Reads one line at a time from a buffered iterator, so keys typed (or
// pasted) faster than the prompts appear are not lost.
async function ask(lines, prompt) {
  process.stdout.write(prompt);
  const next = await lines.next();
  if (next.done) {
    return 'q';
  }
  return String(next.value).trim().toLowerCase();
}

async function main() {
  const { cases } = loadJson(path.join(EVAL_DIR, 'cases.json'), { cases: [] });
  const labels = loadJson(LABELS_FILE, {});
  const relabelAll = process.argv.includes('--all');

  const queue = [];
  for (const caseItem of cases) {
    for (const answer of caseItem.answers) {
      if (relabelAll || !labels[answer.id]) {
        queue.push({ caseItem, answer });
      }
    }
  }
  const total = cases.reduce((sum, c) => sum + c.answers.length, 0);
  console.log(`\n${GUIDE}\n`);
  console.log(`${total - queue.length} of ${total} answers already labelled; ${queue.length} to go.\n`);

  const rl = readline.createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const keys = { s: 'solid', p: 'partial', g: 'gap' };
  let i = 0;
  while (i < queue.length) {
    const { caseItem, answer } = queue[i];
    console.log('\n'.repeat(2) + '='.repeat(70));
    console.log(`[${i + 1}/${queue.length}] ${caseItem.id} (${caseItem.language})`);
    console.log(showCode(caseItem));
    console.log(`\nQUESTION: ${caseItem.question.text}`);
    console.log(`\nANSWER ${answer.id}: ${answer.text}`);
    if (labels[answer.id]) {
      console.log(`(current label: ${labels[answer.id]})`);
    }
    const key = await ask(lines, '\n[s]olid  [p]artial  [g]ap  [k] skip  [b] back  [q] quit > ');
    if (key === 'q') {
      break;
    }
    if (key === 'b') {
      i = Math.max(0, i - 1);
      continue;
    }
    if (key === 'k') {
      i++;
      continue;
    }
    if (!keys[key]) {
      console.log('Please press s, p, g, k, b or q.');
      continue;
    }
    labels[answer.id] = keys[key];
    saveLabels(labels);
    i++;
  }
  rl.close();
  const done = Object.keys(labels).length;
  console.log(`\nSaved ${done} of ${total} labels to eval/labels.json.`);
}

main();
