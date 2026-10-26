// Demo examiner: runs the whole viva WITHOUT any AI so the app works with no
// API key. It is always labelled "demo" in responses and in the page.
//
// - For the bundled sample project it uses five scripted questions. Lines are
//   found by searching for anchor text, so editing the sample can't silently
//   break the highlighting.
// - For any other code it picks functions / loops / conditions with simple
//   patterns and grades by how concrete the answer is.

const { splitLines, findFile, clampRange, getLines } = require('../code');
const { normaliseScore, verdictForScore } = require('../scoring');

// ---------------------------------------------------------------------------
// Scripted questions for public/samples/token_queue.c
// Each keyword group is one idea the answer should contain.
// ---------------------------------------------------------------------------
const SAMPLE_FILE = 'token_queue.c';

const SAMPLE_SCRIPT = [
  {
    topic: { en: 'Wait-time estimate' },
    anchor: 'int total_seconds = q->size * avg_service_seconds;',
    from: -1,
    to: 2,
    question: {
      en: '`estimate_wait` is called right after `enqueue`. Is the estimate it prints for the new customer actually correct? Think about the integer division and about who is counted in `q->size`.',
    },
    groups: [
      { words: ['integer', 'truncat', 'round', 'floor', 'decimal', 'fraction', '/ 60', '/60'], en: 'integer division drops the leftover seconds' },
      { words: ['itself', 'themsel', 'own', 'new customer', 'counted', 'includes', 'including', '+1', 'one extra', 'plus one'], en: 'the new customer is already counted in `q->size`' },
      { words: ['priority', 'ahead', 'front', 'position', 'skip'], en: 'priority customers do not wait behind everyone' },
    ],
    modelAnswer: {
      en: 'Not quite. `q->size` already includes the customer who just joined, so they are told to wait for their own service time. `total_seconds / 60` is integer division, so 150 s becomes 2 min and 50 s becomes 0. It also ignores position: a priority customer is placed near the front but gets an estimate as if they were last.',
    },
    followUp: {
      en: 'Make it concrete: the line is empty, service takes 150 seconds, and one normal customer joins. What does the program print, and what should it print?',
    },
    followUpGroups: [
      { words: ['2', 'two'], en: 'it prints 2 min (`1 * 150 / 60`)' },
      { words: ['0', 'zero', 'nobody', 'no one', 'none', 'immediately'], en: 'it should be 0 — nobody is ahead' },
    ],
    revise: {
      en: 'Trace `estimate_wait` by hand with size 1 and 150 s; decide whether the estimate should count people ahead of the customer only.',
    },
  },
  {
    topic: { en: 'Priority insertion' },
    anchor: 'while (cur->next != NULL && cur->next->is_priority) {',
    from: -1,
    to: 7,
    question: {
      en: 'Walk me through the priority branch of `enqueue`. Where exactly does a new priority customer end up, and why does the loop test `cur->next->is_priority` instead of `cur->is_priority`?',
    },
    groups: [
      { words: ['after', 'behind', 'last priority', 'end of the priority', 'other priority'], en: 'they go after the existing priority customers' },
      { words: ['before', 'ahead of', 'normal', 'regular', 'non-priority', 'everyone else', 'general'], en: 'but before all normal customers' },
      { words: ['insert after', 'previous', 'one step', 'look ahead', 'lookahead', 'singly', 'can\'t go back', 'cannot go back', 'before it', 'node before'], en: 'checking `next` lets you stop on the node BEFORE the insert point (singly linked list)' },
    ],
    modelAnswer: {
      en: 'The new customer goes after the last priority customer and before the first normal one, so priority customers are still first-come-first-served among themselves. The loop looks one node ahead because in a singly linked list you must stop on the node *before* the insertion point to set `cur->next = node`; you cannot step backwards.',
    },
    followUp: {
      en: 'Suppose every customer in the line is a priority customer. Which line keeps `q->tail` correct in that case, and what breaks without it?',
    },
    followUpGroups: [
      { words: ['node->next == null', 'next == null', 'next is null', 'if (node->next', 'last node', 'end of the list', 'end of list'], en: 'the `if (node->next == NULL)` check after insertion' },
      { words: ['tail', 'normal customer', 'lost', 'wrong', 'append', 'overwrit', 'skip'], en: 'otherwise `tail` points at the wrong node and the next normal customer is attached in the middle' },
    ],
    revise: {
      en: 'Draw the list on paper with [P1, P2, N1] and insert P3 step by step; then repeat with [P1, P2] only and watch `tail`.',
    },
  },
  {
    topic: { en: 'Tail pointer invariant' },
    anchor: 'q->tail->next = node;',
    from: -1,
    to: 1,
    question: {
      en: 'In the last branch of `enqueue` you write `q->tail->next = node;`. How do you know `q->tail` is not NULL at that point?',
    },
    groups: [
      { words: ['head', 'first branch', 'first if', 'first condition', 'checked', 'handled'], en: 'the empty-queue case is handled by the first branch' },
      { words: ['not empty', 'non-empty', 'at least one', 'has a node', 'someone', 'not null'], en: 'so the queue has at least one node here' },
      { words: ['dequeue', 'invariant', 'always', 'reset', 'kept', 'consistent', 'together'], en: '`head` and `tail` are kept in sync (`dequeue` resets `tail`)' },
    ],
    modelAnswer: {
      en: 'The code keeps an invariant: `head` is NULL exactly when `tail` is NULL. The first branch handles the empty queue, so in the last branch the queue has at least one node and `tail` points to it. `dequeue` preserves the invariant by setting `tail = NULL` when the last node leaves.',
    },
    followUp: {
      en: 'Which function keeps that true after the last customer is served? Point to the exact line.',
    },
    followUpGroups: [
      { words: ['dequeue'], en: '`dequeue`' },
      { words: ['tail = null', 'tail to null', 'tail null', 'q->tail = null', 'resets tail', 'reset tail'], en: 'sets `q->tail = NULL` when head becomes NULL' },
    ],
    revise: {
      en: 'Write down the head/tail invariant in one sentence, then check every branch of `enqueue` and `dequeue` against it.',
    },
  },
  {
    topic: { en: 'Input validation' },
    anchor: 'if (scanf("%d", &choice) != 1) {',
    from: 0,
    to: 4,
    question: {
      en: 'What happens if the user types `abc` at the menu? Why is the `while (getchar() != \'\\n\')` loop needed?',
    },
    groups: [
      { words: ['returns 0', 'return 0', 'fails', 'fail', '!= 1', 'not a number', 'does not match', "doesn't match", 'no match'], en: '`scanf` fails and returns 0' },
      { words: ['buffer', 'stays', 'left', 'remain', 'still there', 'not consumed', 'unread'], en: 'the bad input stays in the input buffer' },
      { words: ['infinite', 'forever', 'again and again', 'repeat', 'discard', 'flush', 'clear', 'consume', 'skip'], en: 'without clearing it the loop repeats forever' },
    ],
    modelAnswer: {
      en: '`scanf("%d")` cannot parse `abc`, returns 0, and leaves `abc\\n` in the input buffer. Without the `getchar` loop the next `scanf` reads the same `abc` again and fails again — an infinite loop printing the menu. The loop discards everything up to the newline.',
    },
    followUp: {
      en: 'Without the `getchar` loop, which exact call would run forever, and why does it never make progress?',
    },
    followUpGroups: [
      { words: ['scanf'], en: 'the same `scanf` call' },
      { words: ['same', 'abc', 'buffer', 'left', 'again', 'never consumed', 'not consumed'], en: 'it keeps reading the same unconsumed `abc`' },
    ],
    revise: {
      en: 'Run the program, type `abc`, and observe; then comment out the `getchar` loop and observe again.',
    },
  },
  {
    topic: { en: 'Freeing the list' },
    anchor: 'Node *next = cur->next;',
    from: -2,
    to: 4,
    question: {
      en: 'In `free_queue`, why do you save `cur->next` in a separate variable before calling `free(cur)`? And why call `init_queue(q)` at the end?',
    },
    groups: [
      { words: ['freed', 'after free', 'released', 'dealloc', 'gone'], en: 'after `free(cur)` the node is gone' },
      { words: ['use after free', 'use-after-free', 'dangling', 'undefined', 'invalid', 'access', 'read'], en: 'reading `cur->next` then would be use-after-free' },
      { words: ['init_queue', 'reset', 'null', 'reuse', 'head', 'dangling pointer', 'size'], en: '`init_queue` resets head/tail/size so the struct is not left dangling' },
    ],
    modelAnswer: {
      en: 'After `free(cur)` the memory belongs to the allocator, so reading `cur->next` would be use-after-free (undefined behaviour). Saving `next` first lets you continue down the list safely. `init_queue` then sets `head`/`tail` to NULL and `size` to 0 so the queue struct does not keep pointing at freed nodes and can be reused.',
    },
    followUp: {
      en: 'If you skipped `init_queue(q)` and later called `dequeue(&q, &t)`, what exactly would happen?',
    },
    followUpGroups: [
      { words: ['head', 'not null', 'non-null', 'still points', 'old'], en: '`head` still points at a freed node, so the empty check passes' },
      { words: ['freed', 'free', 'use after free', 'use-after-free', 'crash', 'undefined', 'double free', 'garbage', 'segfault'], en: 'it reads and frees freed memory (use-after-free / double free)' },
    ],
    revise: {
      en: 'Run the program under Valgrind or AddressSanitizer (`-fsanitize=address`) once with and once without the saved `next` pointer.',
    },
  },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
// The demo examiner is a fixed script, so it speaks English only.
// Other languages need the AI examiner.
function lang() {
  return 'en';
}

function isStrict(settings) {
  return settings && settings.style === 'strict';
}

function mainQuestions(history) {
  return (history || []).filter((turn) => !turn.isFollowUp);
}

function findAnchorLine(content, anchor) {
  const lines = splitLines(content);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(anchor)) {
      return i + 1;
    }
  }
  return -1;
}

function isSampleProject(files) {
  const sample = findFile(files, SAMPLE_FILE);
  if (!sample) {
    return false;
  }
  for (const step of SAMPLE_SCRIPT) {
    if (findAnchorLine(sample.content, step.anchor) === -1) {
      return false;
    }
  }
  return true;
}

function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Very short keywords ("0", "2") must stand alone, or "150" would count as "0".
function containsKeyword(text, word) {
  const lower = word.toLowerCase();
  if (lower.length <= 2) {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(lower)}([^\\p{L}\\p{N}]|$)`, 'u').test(text);
  }
  return text.includes(lower);
}

function matchGroups(answer, groups) {
  const text = String(answer || '').toLowerCase();
  const matched = [];
  const missed = [];
  for (const group of groups) {
    const hit = group.words.some((word) => containsKeyword(text, word));
    if (hit) {
      matched.push(group);
    } else {
      missed.push(group);
    }
  }
  return { matched, missed };
}

function scoreFromMatches(matchedCount, totalGroups, answer, strict) {
  if (countWords(answer) < 3) {
    return 1;
  }
  let score;
  if (matchedCount === totalGroups) {
    score = 9;
  } else if (matchedCount === totalGroups - 1) {
    score = 6;
  } else if (matchedCount > 0) {
    score = 4;
  } else {
    score = 1;
  }
  if (strict && score > 1) {
    score -= 1;
  }
  return normaliseScore(score);
}

function feedbackFromMatches(matched, missed, language, strict) {
  const pick = (group) => group[language];
  const parts = [];
  if (matched.length > 0) {
    parts.push(`You got: ${matched.map(pick).join('; ')}.`);
  }
  if (missed.length > 0) {
    parts.push(strict ? `Missing: ${missed.map(pick).join('; ')}.` : `Think again about: ${missed.map(pick).join('; ')}.`);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Generic (non-sample) code: pick regions with simple patterns
// ---------------------------------------------------------------------------
const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'return', 'int', 'char', 'void', 'const', 'struct', 'class', 'public',
  'private', 'static', 'new', 'null', 'true', 'false', 'function', 'def', 'self', 'this', 'let', 'var',
  'and', 'not', 'the', 'import', 'from', 'include', 'using', 'namespace', 'std', 'string', 'bool', 'double',
  'float', 'long', 'auto', 'print', 'printf', 'console', 'log', 'elif', 'try', 'catch', 'except', 'none',
]);

const PATTERNS = [
  { kind: 'function', regex: /^\s*(?:def\s+(\w+)\s*\(|(?:async\s+)?function\s+(\w+)\s*\(|(?:public|private|protected|static|\s)*[\w<>\[\],*&:]+\s+\**(\w+)\s*\([^;]*\)\s*(?:const\s*)?\{?\s*$|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/ },
  { kind: 'loop', regex: /^\s*(?:for|while)\b/ },
  { kind: 'condition', regex: /^\s*(?:if|elif|else\s+if)\b/ },
];

const GENERIC_TEXT = {
  function: {
    en: (name, line) => `Walk me through \`${name}\` (line ${line}). What does it take in, what does it return, and what happens if its input is empty or invalid?`,
    topic: { en: (name) => `Function ${name}` },
  },
  loop: {
    en: (name, line) => `Look at the loop on line ${line}. When exactly does it stop, and what is its time complexity in terms of the input size?`,
    topic: { en: () => 'Loop termination' },
  },
  condition: {
    en: (name, line) => `Why does line ${line} need this check? Give one concrete input where removing it would break the program.`,
    topic: { en: () => 'Edge-case check' },
  },
};

function findGenericRegions(files) {
  const regions = [];
  for (const file of files) {
    const lines = splitLines(file.content);
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of PATTERNS) {
        const match = lines[i].match(pattern.regex);
        if (!match) {
          continue;
        }
        const name = match.slice(1).find(Boolean) || '';
        if (pattern.kind === 'function' && (name === '' || KEYWORDS.has(name.toLowerCase()))) {
          continue;
        }
        regions.push({ kind: pattern.kind, name, file: file.name, line: i + 1 });
        break;
      }
    }
  }
  return regions;
}

function overlaps(a, b) {
  return a.file === b.file && a.startLine <= b.endLine && b.startLine <= a.endLine;
}

function pickGenericRegion(files, history) {
  const regions = findGenericRegions(files);
  const used = mainQuestions(history);
  const kindOrder = ['function', 'loop', 'condition'];
  const wantedKind = kindOrder[used.length % kindOrder.length];

  const candidates = regions
    .map((region) => ({ region, range: clampRange(files, region.file, region.line, region.line + (region.kind === 'function' ? 6 : 3)) }))
    .filter((c) => !used.some((turn) => overlaps(c.range, turn)));

  const sameKind = candidates.filter((c) => c.region.kind === wantedKind);
  if (sameKind.length > 0) {
    return sameKind[0];
  }
  if (candidates.length > 0) {
    return candidates[0];
  }
  // Nothing recognisable left: walk the files in 8-line chunks.
  const file = files[used.length % files.length];
  const lineCount = splitLines(file.content).length;
  const start = Math.min(1 + used.length * 8, lineCount);
  return { region: { kind: 'condition', name: '', file: file.name, line: start }, range: clampRange(files, file.name, start, start + 5) };
}

function identifiersIn(lines) {
  const found = new Set();
  for (const line of lines) {
    const words = line.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || [];
    for (const word of words) {
      if (!KEYWORDS.has(word.toLowerCase())) {
        found.add(word.toLowerCase());
      }
    }
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// The three examiner functions (same interface as the AI examiner)
// ---------------------------------------------------------------------------
async function askQuestion({ files, settings, history }) {
  const language = lang(settings);
  const number = mainQuestions(history).length + 1;

  if (isSampleProject(files)) {
    const step = SAMPLE_SCRIPT[(number - 1) % SAMPLE_SCRIPT.length];
    const sample = findFile(files, SAMPLE_FILE);
    const line = findAnchorLine(sample.content, step.anchor);
    const range = clampRange(files, sample.name, line + step.from, line + step.to);
    return { id: `q${number}`, text: step.question[language], topic: step.topic[language], ...range, isFollowUp: false, demo: true };
  }

  const picked = pickGenericRegion(files, history);
  const template = GENERIC_TEXT[picked.region.kind];
  return {
    id: `q${number}`,
    text: template[language](picked.region.name, picked.range.startLine),
    topic: template.topic[language](picked.region.name),
    ...picked.range,
    isFollowUp: false,
    demo: true,
  };
}

function sampleStepFor(files, question) {
  if (!isSampleProject(files)) {
    return null;
  }
  const parentId = question.isFollowUp ? question.parentId : question.id;
  const index = parseInt(String(parentId).replace(/\D/g, ''), 10) - 1;
  if (!Number.isFinite(index) || index < 0) {
    return null;
  }
  return SAMPLE_SCRIPT[index % SAMPLE_SCRIPT.length];
}

async function grade({ files, settings, question, answer, dontKnow, followUpAllowed }) {
  const language = lang(settings);
  const strict = isStrict(settings);
  const step = sampleStepFor(files, question);

  if (step) {
    if (dontKnow) {
      return { verdict: 'gap', score: 0, feedback: step.modelAnswer[language], modelAnswer: step.modelAnswer[language], followUp: null, demo: true };
    }
    const groups = question.isFollowUp ? step.followUpGroups : step.groups;
    const { matched, missed } = matchGroups(answer, groups);
    const score = scoreFromMatches(matched.length, groups.length, answer, strict);
    const verdict = verdictForScore(score);
    let followUp = null;
    if (verdict === 'partial' && followUpAllowed) {
      followUp = {
        id: `${question.id}-f`,
        text: step.followUp[language],
        topic: question.topic,
        file: question.file,
        startLine: question.startLine,
        endLine: question.endLine,
        isFollowUp: true,
        parentId: question.id,
        demo: true,
      };
    }
    return {
      verdict,
      score,
      feedback: feedbackFromMatches(matched, missed, language, strict),
      modelAnswer: verdict === 'solid' ? '' : step.modelAnswer[language],
      followUp,
      demo: true,
    };
  }

  // Generic code: judge how concrete the answer is.
  const lines = getLines(files, question.file, question.startLine, question.endLine);
  const ids = identifiersIn(lines);
  const text = String(answer || '').toLowerCase();
  const mentioned = ids.filter((id) => text.includes(id));
  const words = countWords(answer);

  let score;
  if (dontKnow || words < 3) {
    score = dontKnow ? 0 : 1;
  } else if (mentioned.length >= 2 && words >= 20) {
    score = 8;
  } else if (mentioned.length >= 1 && words >= 10) {
    score = 6;
  } else {
    score = 4;
  }
  if (strict && score > 1) {
    score -= 1;
  }
  const verdict = verdictForScore(score);
  const lineRef = `${question.file}:${question.startLine}-${question.endLine}`;
  const feedback = verdict === 'solid'
    ? `Good — you explained it using the actual names in the code (${mentioned.slice(0, 3).join(', ')}).`
    : `Be more specific: refer to the variables on ${lineRef} by name and walk through one example input and its result.`;
  const note = 'Demo mode: with an AI key, the examiner writes the correct answer for your code here.';

  let followUp = null;
  if (verdict === 'partial' && followUpAllowed) {
    followUp = {
      id: `${question.id}-f`,
      text: `Let's go deeper: pick one concrete input for lines ${question.startLine}-${question.endLine} and trace, step by step, what value each variable takes.`,
      topic: question.topic,
      file: question.file,
      startLine: question.startLine,
      endLine: question.endLine,
      isFollowUp: true,
      parentId: question.id,
      demo: true,
    };
  }
  return { verdict, score, feedback: dontKnow ? note : feedback, modelAnswer: verdict === 'solid' ? '' : note, followUp, demo: true };
}

async function report({ files, settings, history }) {
  const language = lang(settings);
  const answered = (history || []).filter((turn) => turn.verdict);
  const strengths = [];
  const gaps = [];
  const revise = [];

  for (const turn of answered) {
    if (turn.isFollowUp) {
      continue;
    }
    const followUp = answered.find((t) => t.isFollowUp && t.parentId === turn.id);
    const best = followUp && followUp.score > turn.score ? followUp : turn;
    if (best.verdict === 'solid') {
      strengths.push(turn.topic);
    } else {
      gaps.push({ text: turn.topic, file: turn.file, startLine: turn.startLine, endLine: turn.endLine });
      const step = sampleStepFor(files, turn);
      if (step) {
        revise.push(step.revise[language]);
      }
    }
  }

  const fallbackRevise = [
    'Explain each red region out loud in your own words.',
    'Trace the code by hand with one small example input.',
    'Run one more CodeViva session the night before, on the red regions only.',
  ];
  for (const tip of fallbackRevise) {
    if (revise.length < 3) {
      revise.push(tip);
    }
  }

  const solidCount = strengths.length;
  const total = solidCount + gaps.length;
  const summary = `You confidently defended ${solidCount} of ${total} areas. ${gaps.length > 0 ? 'Revisit the red and amber lines before the real viva.' : 'Excellent — you clearly own this code.'} (Demo mode: scripted examiner.)`;

  return { summary, strengths, gaps, revise: revise.slice(0, 3), demo: true };
}

module.exports = {
  name: 'demo',
  askQuestion,
  grade,
  report,
  // exported for tests
  SAMPLE_SCRIPT,
  isSampleProject,
  findAnchorLine,
  findGenericRegions,
};
