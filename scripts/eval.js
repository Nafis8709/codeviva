// CodeViva evaluation runner. Calls the real model configured in .env.
//
//   npm run eval                                  default model, both grading modes, 3 repeats
//   npm run eval -- --models gemini-3.1-flash-lite,gemini-3-flash-preview
//   npm run eval -- --repeats 1 --modes checklist --only grading
//   npm run eval -- --fake                        offline dry run (fake model, not real results)
//
// What it measures, per model:
//   grading   - every answer in eval/cases.json, graded by the checklist examiner
//               (answer key first) and the holistic examiner (model picks the
//               score, the pre-hackathon behaviour), several times each;
//               compared with the reference labels in eval/labels.json
//   grounding - short vivas on each code bundle; how many questions were
//               correct first time, repaired, re-asked or left unverified
//
// Output: eval/results/<model>.json (raw) and eval/results/SUMMARY.md (tables).

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { createAiExaminer } = require('../src/examiners/aiExaminer');
const { createGeminiClient } = require('../src/llm/gemini');
const { createOpenAiClient } = require('../src/llm/openaiCompatible');
const { DEFAULT_GEMINI_MODEL } = require('../src/config');
const { agreement, consistency, groundingCounts, majorityVerdict, median } = require('../eval/metrics');

const EVAL_DIR = path.join(__dirname, '..', 'eval');
const SETTINGS = { language: 'en', style: 'friendly', totalQuestions: 5 };

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
function readArgs(argv) {
  const args = { models: [], modes: ['checklist', 'holistic'], repeats: 3, delay: 4000, questions: 4, only: null, fake: false };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    const value = argv[i + 1];
    if (name === '--models') { args.models = value.split(',').map((m) => m.trim()).filter(Boolean); i++; }
    else if (name === '--modes') { args.modes = value.split(',').map((m) => m.trim()); i++; }
    else if (name === '--repeats') { args.repeats = Math.max(1, Number(value) || 1); i++; }
    else if (name === '--delay') { args.delay = Math.max(0, Number(value) || 0); i++; }
    else if (name === '--questions') { args.questions = Math.max(1, Number(value) || 1); i++; }
    else if (name === '--only') { args.only = value; i++; }
    else if (name === '--fake') { args.fake = true; args.delay = 0; }
  }
  if (args.models.length === 0) {
    args.models = [args.fake ? 'fake' : (process.env.AI_PROVIDER === 'openai' ? process.env.OPENAI_MODEL : process.env.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL];
  }
  return args;
}

// ---------------------------------------------------------------------------
// Model client with throttling, retries and timing
// ---------------------------------------------------------------------------
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function baseClient(model, fake) {
  if (fake) {
    return createFakeClient();
  }
  if ((process.env.AI_PROVIDER || '').toLowerCase() === 'openai') {
    return createOpenAiClient({ apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', model });
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('No GEMINI_API_KEY in .env (or use --fake for a dry run).');
  }
  return createGeminiClient({ apiKey: process.env.GEMINI_API_KEY, model });
}

function measuredClient(client, delayMs, stats) {
  let lastCall = 0;
  async function generateJson(prompt) {
    for (let attempt = 1; ; attempt++) {
      const gap = Date.now() - lastCall;
      if (gap < delayMs) {
        await wait(delayMs - gap);
      }
      lastCall = Date.now();
      const started = Date.now();
      stats.calls++;
      try {
        const result = await client.generateJson(prompt);
        stats.latencies.push(Date.now() - started);
        return result;
      } catch (error) {
        const retryable = [429, 500, 502, 503, 504].includes(error.status);
        if (!retryable || attempt >= 4) {
          stats.errors++;
          throw error;
        }
        stats.retries++;
        const pause = error.status === 429 ? 20000 * attempt : 3000 * attempt;
        process.stdout.write(`\n  (${error.status}: waiting ${pause / 1000}s before retry ${attempt})`);
        await wait(pause);
      }
    }
  }
  return { name: client.name, model: client.model, generateJson };
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------
function loadCases() {
  const { cases } = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'cases.json'), 'utf8'));
  let labels = {};
  try {
    labels = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'labels.json'), 'utf8'));
  } catch (error) {
    labels = {};
  }
  for (const caseItem of cases) {
    caseItem.loadedFiles = caseItem.files.map((name) => ({
      name: path.basename(name),
      content: fs.readFileSync(path.join(EVAL_DIR, 'code', name), 'utf8').replace(/\r\n?/g, '\n'),
    }));
  }
  return { cases, labels };
}

// Distinct code bundles (same set of files) for the grounding vivas.
function codeBundles(cases) {
  const bundles = [];
  for (const caseItem of cases) {
    const key = [...caseItem.files].sort().join('+');
    if (!bundles.some((b) => b.key === key)) {
      bundles.push({ key, files: caseItem.loadedFiles });
    }
  }
  // Use the largest bundle per folder so vivas have room for several questions.
  const byFolder = {};
  for (const bundle of bundles) {
    const folder = bundle.key.split('/')[0];
    const size = bundle.files.reduce((sum, f) => sum + f.content.length, 0);
    if (!byFolder[folder] || size > byFolder[folder].size) {
      byFolder[folder] = { ...bundle, size };
    }
  }
  return Object.values(byFolder);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------
async function runGrading(client, cases, labels, args, result) {
  const examiners = {
    checklist: createAiExaminer(client, { grading: 'checklist' }),
    holistic: createAiExaminer(client, { grading: 'holistic' }),
  };
  for (const caseItem of cases) {
    const files = caseItem.loadedFiles;
    const question = { id: 'q1', isFollowUp: false, ...caseItem.question };
    if (args.modes.includes('checklist')) {
      try {
        question.keyPoints = await examiners.checklist.makeKeyPoints({ files, settings: SETTINGS, question });
      } catch (error) {
        question.keyPoints = [];
        result.failures.push({ step: 'keyPoints', caseId: caseItem.id, error: error.message });
      }
      result.keyPoints[caseItem.id] = question.keyPoints;
    }
    for (const answer of caseItem.answers) {
      for (const mode of args.modes) {
        const grading = { answerId: answer.id, caseId: caseItem.id, label: labels[answer.id] || null, runs: [] };
        for (let r = 0; r < args.repeats; r++) {
          process.stdout.write(`\r  grading ${answer.id} · ${mode} · run ${r + 1}/${args.repeats}        `);
          try {
            const graded = await examiners[mode].grade({
              files, settings: SETTINGS, history: [], question, answer: answer.text, dontKnow: false, followUpAllowed: false,
            });
            grading.runs.push({ verdict: graded.verdict, score: graded.score, grading: graded.grading, points: graded.points, wrongClaims: graded.wrongClaims });
          } catch (error) {
            result.failures.push({ step: 'grade', answerId: answer.id, mode, error: error.message });
          }
        }
        result.gradings[mode].push(grading);
      }
    }
  }
  process.stdout.write('\n');
}

async function runGrounding(client, cases, args, result) {
  const examiner = createAiExaminer(client, { grading: 'checklist' });
  for (const bundle of codeBundles(cases)) {
    const history = [];
    for (let i = 0; i < args.questions; i++) {
      process.stdout.write(`\r  grounding ${bundle.key} · question ${i + 1}/${args.questions}        `);
      try {
        const question = await examiner.askQuestion({ files: bundle.files, settings: SETTINGS, history });
        result.grounding.push({ bundle: bundle.key, id: question.id, file: question.file, startLine: question.startLine, endLine: question.endLine, text: question.text, ...question.grounding });
        // Pretend it was answered so the next question moves on.
        history.push({ ...question, answer: '(skipped for evaluation)', verdict: 'partial', score: 5, feedback: '' });
      } catch (error) {
        result.failures.push({ step: 'question', bundle: bundle.key, error: error.message });
      }
    }
  }
  process.stdout.write('\n');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
function cell(value, suffix = '') {
  return value === null || value === undefined ? '–' : `${value}${suffix}`;
}

function summarise(results, labels, args) {
  const lines = [];
  const labelled = Object.keys(labels).length;
  lines.push('# CodeViva evaluation results');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} by \`npm run eval\` (${args.fake ? '**FAKE MODEL — dry run, not real results**' : 'real model calls'}).`);
  lines.push(`Evaluation set: ${results[0] ? results[0].answerCount : 0} answers to 5 questions on real student code (C, Python, Java; English, Bangla and Banglish answers). Reference labels: ${labelled} (written by Claude, the AI assistant used to build this project, and not checked by a person; see eval/README.md).`);
  lines.push('');

  lines.push('## 1. Agreement with the reference labels');
  lines.push('');
  lines.push('Verdict = the majority over the repeated runs. "Severe" = the AI said *solid* where the reference label is *gap*, or the reverse.');
  lines.push('');
  lines.push('| Model | Grading | Labelled answers | Exact agreement | Within one step | Severe disagreements |');
  lines.push('|---|---|---|---|---|---|');
  for (const result of results) {
    for (const mode of args.modes) {
      const a = agreement(result.gradings[mode]);
      lines.push(`| ${result.model} | ${mode === 'checklist' ? 'answer key (new)' : 'holistic (old)'} | ${a.labelled} | ${cell(a.exactPercent, '%')} | ${cell(a.withinOnePercent, '%')} | ${a.severe} |`);
    }
  }
  lines.push('');

  lines.push('## 2. Consistency when the same answer is graded again');
  lines.push('');
  lines.push(`Each answer graded ${args.repeats} times with the same question (and, for the answer key, the same key).`);
  lines.push('');
  lines.push('| Model | Grading | Answers | Same verdict every time | Mean score spread (0-10) | Largest spread |');
  lines.push('|---|---|---|---|---|---|');
  for (const result of results) {
    for (const mode of args.modes) {
      const c = consistency(result.gradings[mode]);
      lines.push(`| ${result.model} | ${mode === 'checklist' ? 'answer key (new)' : 'holistic (old)'} | ${c.measured} | ${cell(c.identicalPercent, '%')} | ${cell(c.meanScoreSpread)} | ${cell(c.maxScoreSpread)} |`);
    }
  }
  lines.push('');

  lines.push('## 3. Line checker (grounding)');
  lines.push('');
  lines.push('Questions asked in short vivas on each code bundle. "Correct first time" means the model\'s own file and lines already matched what the question talks about.');
  lines.push('');
  lines.push('| Model | Questions | Correct first time | Repaired by the checker | Re-asked once | Left unverified | Verified in the end |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const result of results) {
    const g = groundingCounts(result.grounding.map((q) => q.status));
    lines.push(`| ${result.model} | ${g.total} | ${g.grounded} (${cell(g.rawCorrectPercent, '%')}) | ${g.repaired} | ${g.regenerated} | ${g.unverified} | ${cell(g.finalVerifiedPercent, '%')} |`);
  }
  lines.push('');

  lines.push('## 4. Cost and speed');
  lines.push('');
  lines.push('| Model | Model calls | Retries | Failed calls | Median call time |');
  lines.push('|---|---|---|---|---|');
  for (const result of results) {
    lines.push(`| ${result.model} | ${result.stats.calls} | ${result.stats.retries} | ${result.stats.errors} | ${cell(median(result.stats.latencies), ' ms')} |`);
  }
  lines.push('');

  lines.push('## 5. Every answer');
  lines.push('');
  for (const result of results) {
    lines.push(`### ${result.model}`);
    lines.push('');
    lines.push(`| Answer | Reference | ${args.modes.map((m) => (m === 'checklist' ? 'Answer key (runs)' : 'Holistic (runs)')).join(' | ')} |`);
    lines.push(`|---|---|${args.modes.map(() => '---').join('|')}|`);
    const first = result.gradings[args.modes[0]];
    for (let i = 0; i < first.length; i++) {
      const id = first[i].answerId;
      const parts = args.modes.map((mode) => {
        const g = result.gradings[mode].find((x) => x.answerId === id);
        if (!g || g.runs.length === 0) {
          return 'failed';
        }
        const verdict = majorityVerdict(g.runs.map((r) => r.verdict));
        return `**${verdict}** (${g.runs.map((r) => r.score).join(', ')})`;
      });
      lines.push(`| ${id} | ${labels[id] || '–'} | ${parts.join(' | ')} |`);
    }
    lines.push('');
  }

  const failures = results.reduce((all, r) => all.concat(r.failures.map((f) => ({ model: r.model, ...f }))), []);
  if (failures.length > 0) {
    lines.push('## Failures during the run');
    lines.push('');
    for (const f of failures.slice(0, 30)) {
      lines.push(`- ${f.model} · ${f.step} · ${f.answerId || f.caseId || f.bundle || ''} · ${f.error}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Fake model for an offline dry run of this script (never used for results)
// ---------------------------------------------------------------------------
function createFakeClient() {
  let n = 0;
  return {
    name: 'fake',
    model: 'fake',
    async generateJson(prompt) {
      n++;
      const user = prompt.user;
      if (user.includes('Write the answer key')) {
        return { keyPoints: ['What the lines do.', 'Why they are written that way.', 'What happens in the edge case.'] };
      }
      if (user.includes('STUDENT ANSWER:')) {
        const answer = user.split('STUDENT ANSWER:')[1].split('TASK:')[0];
        const words = answer.trim().split(/\s+/).length;
        if (user.includes('KEY POINTS')) {
          const status = words > 40 ? 'covered' : words > 15 ? 'partial' : 'missing';
          return { points: [{ status }, { status }, { status: n % 3 === 0 ? 'missing' : status }], wrongClaims: [], feedback: 'f', modelAnswer: 'm', followUp: null };
        }
        return { score: Math.min(10, Math.round(words / 6) + (n % 3)), feedback: 'f', modelAnswer: 'm', followUp: null };
      }
      // A question: pick lines from the first file header and name one identifier on them.
      const match = user.match(/=== FILE: (.+?) \((\d+) lines\) ===/);
      const start = 3 + ((n * 7) % 20);
      const lineText = (user.split('\n').find((l) => l.startsWith(`${String(start).padStart(4, ' ')} | `)) || '').slice(7);
      const word = (lineText.match(/[A-Za-z_][A-Za-z0-9_]{2,}/) || ['value'])[0];
      return { file: match ? match[1] : 'x', startLine: n % 4 === 0 ? start + 30 : start, endLine: start + 2, topic: 'Fake', question: `Why is \`${word}\` used here?`, keyPoints: ['a', 'b'] };
    },
  };
}

// ---------------------------------------------------------------------------
async function main() {
  const args = readArgs(process.argv.slice(2));
  const { cases, labels } = loadCases();
  const answerCount = cases.reduce((sum, c) => sum + c.answers.length, 0);
  const outDir = path.join(EVAL_DIR, 'results', args.fake ? 'fake' : '');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`CodeViva evaluation · models: ${args.models.join(', ')} · modes: ${args.modes.join(', ')} · repeats: ${args.repeats}`);
  console.log(`${answerCount} answers, ${Object.keys(labels).length} reference labels${Object.keys(labels).length < answerCount ? ' (run `npm run label` first for agreement numbers)' : ''}.`);

  const results = [];
  for (const model of args.models) {
    console.log(`\n== ${model}`);
    const stats = { calls: 0, retries: 0, errors: 0, latencies: [] };
    const client = measuredClient(baseClient(model, args.fake), args.delay, stats);
    const result = { model, date: new Date().toISOString(), answerCount, args, keyPoints: {}, gradings: { checklist: [], holistic: [] }, grounding: [], failures: [], stats };
    if (args.only !== 'grounding') {
      await runGrading(client, cases, labels, args, result);
    }
    if (args.only !== 'grading') {
      await runGrounding(client, cases, args, result);
    }
    const safeName = model.replace(/[^A-Za-z0-9._-]/g, '_');
    fs.writeFileSync(path.join(outDir, `${safeName}.json`), `${JSON.stringify(result, null, 2)}\n`);
    results.push(result);
  }

  const summary = summarise(results, labels, args);
  fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), `${summary}\n`);
  console.log(`\nWrote ${path.relative(process.cwd(), path.join(outDir, 'SUMMARY.md'))}`);
}

main().catch((error) => {
  console.error(`\nEvaluation stopped: ${error.message}`);
  process.exit(1);
});
