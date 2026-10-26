// The examiner's instructions. Every prompt sends the code with line numbers
// and asks for one JSON object in a fixed shape, which the server validates.

const { numberCode, getLines } = require('./code');

// Languages the examiner can use for its own sentences. Code stays as written.
const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
  hi: 'Hindi',
  ar: 'Arabic',
  zh: 'Simplified Chinese',
  id: 'Indonesian',
  bn: 'Bengali',
};

function languageInstruction(code) {
  const name = LANGUAGE_NAMES[code];
  if (!name || code === 'en') {
    return 'Write every sentence meant for the student in clear, simple English.';
  }
  return `Write every sentence meant for the student in ${name}. Keep code identifiers, keywords and widely used technical terms (pointer, loop, array, null, time complexity) in English, as programmers who speak ${name} usually do.`;
}

function systemPrompt(settings) {
  const style = settings.style === 'strict'
    ? 'You are a STRICT external examiner: terse, formal, no hints, and you demand precise answers. Vague answers get low marks.'
    : 'You are a FRIENDLY teaching assistant running a mock viva: warm and encouraging, but still honest — never mark a wrong answer as right. You may include a small hint in feedback.';

  const language = languageInstruction(settings.language);

  return [
    'You are CodeViva, an oral examiner (a viva, or project defense) for a software project — a university assignment, a bootcamp capstone, or a portfolio project the student will have to explain in a job interview.',
    'The student must prove they understand the code they submitted: what each part does, why it is written that way, and what happens in edge cases.',
    'Code comments are not proof of understanding — ask about behaviour and reasons.',
    style,
    language,
    'Wrap code identifiers and short code fragments in `backticks`. Use plain sentences: no markdown headings, no bullet lists.',
    'Reply with exactly ONE JSON object in the shape you are given, and nothing else.',
  ].join('\n');
}

function rangeLabel(turn) {
  return `${turn.file} lines ${turn.startLine}-${turn.endLine}`;
}

function historySummary(history) {
  if (!history || history.length === 0) {
    return 'No questions asked yet.';
  }
  const parts = [];
  for (const turn of history) {
    const kind = turn.isFollowUp ? 'Follow-up' : 'Question';
    parts.push(`${kind} (${rangeLabel(turn)}, topic: ${turn.topic}): ${turn.text}`);
    parts.push(`  Student: ${turn.dontKnow ? "(said: I don't know)" : turn.answer}`);
    if (turn.verdict) {
      parts.push(`  Marked: ${turn.verdict} (${turn.score}/10)`);
    }
  }
  return parts.join('\n');
}

function questionPrompt({ files, settings, history }) {
  const number = history.filter((turn) => !turn.isFollowUp).length + 1;
  const covered = history.filter((turn) => !turn.isFollowUp).map(rangeLabel);
  const user = [
    'CODE (every line starts with its line number):',
    numberCode(files),
    'VIVA SO FAR:',
    historySummary(history),
    '',
    covered.length > 0 ? `Already examined — do NOT ask about these lines again: ${covered.join('; ')}.` : '',
    '',
    `TASK: Ask question ${number} of ${settings.totalQuestions}.`,
    'Choose ONE specific region of 1 to 12 lines that a real examiner would probe and that has not been examined yet.',
    'Good targets, roughly in this order: core logic the project depends on; edge cases (empty input, boundaries, off-by-one, NULL/None, overflow); memory or resource handling; why this design or data structure was chosen; time complexity.',
    'Spread questions across different files and topics. Skip boilerplate (includes, imports, getters, print statements).',
    'Ask ONE clear question (at most 2 sentences) that can only be answered by understanding those exact lines — never a textbook definition. Refer to the code naturally, e.g. "On line 42, why…".',
    '',
    'Return JSON: {"file": "<exact file name from a FILE header>", "startLine": <integer>, "endLine": <integer>, "topic": "<2-5 word label>", "question": "<your question>"}',
  ].join('\n');
  return { system: systemPrompt(settings), user };
}

function gradePrompt({ files, settings, history, question, answer, dontKnow, followUpAllowed }) {
  const examined = getLines(files, question.file, question.startLine, question.endLine)
    .map((line, i) => `${String(question.startLine + i).padStart(4, ' ')} | ${line}`)
    .join('\n');

  let task;
  if (dontKnow) {
    task = [
      'The student said "I don\'t know — teach me".',
      'Set verdict "gap" and score 0. In "feedback", teach the answer kindly and concretely in 2-4 sentences, specific to these lines. Put the same explanation in "modelAnswer". Set "followUp" to null.',
    ].join('\n');
  } else {
    task = [
      'Grade the answer on technical correctness and understanding of THESE lines only — not on grammar, spelling or English fluency (the student may answer in their own language, in English, or a mix).',
      'Score rubric: 9-10 correct and complete including the key reason; 7-8 correct with a minor gap; 4-6 partly right, vague or hand-wavy; 1-3 mostly wrong or irrelevant; 0 no real attempt.',
      'verdict: "solid" if score >= 8, "partial" if 4-7, "gap" if 3 or less.',
      '"feedback": 1-2 sentences — first what was right, then exactly what was missing or wrong.',
      '"modelAnswer": what the examiner expected, 2-4 sentences, specific to this code. Empty string if the verdict is solid.',
      followUpAllowed
        ? '"followUp": ONLY if the verdict is "partial", ask ONE pointed follow-up question that targets exactly the missing piece — like a real examiner pushing back — about the same or directly related lines in the same file: {"question": "...", "startLine": <integer>, "endLine": <integer>}. Otherwise null.'
        : '"followUp": always null.',
    ].join('\n');
  }

  const user = [
    'CODE (every line starts with its line number):',
    numberCode(files),
    'VIVA SO FAR:',
    historySummary(history),
    '',
    `CURRENT QUESTION (about ${rangeLabel(question)}):`,
    question.text,
    '',
    'THOSE LINES:',
    examined,
    '',
    'STUDENT ANSWER:',
    dontKnow ? "(I don't know — teach me)" : answer,
    '',
    'TASK:',
    task,
    '',
    'Return JSON: {"verdict": "solid" | "partial" | "gap", "score": <integer 0-10>, "feedback": "...", "modelAnswer": "...", "followUp": null | {"question": "...", "startLine": <integer>, "endLine": <integer>}}',
  ].join('\n');
  return { system: systemPrompt(settings), user };
}

function reportPrompt({ files, settings, history }) {
  const user = [
    'CODE (every line starts with its line number):',
    numberCode(files),
    'FULL VIVA TRANSCRIPT:',
    historySummary(history),
    '',
    'TASK: Write the end-of-viva report for the student.',
    '"summary": 2-3 sentences — an honest verdict on how well the student owns this code, naming their strongest and weakest area.',
    '"revise": exactly 3 concrete things to do before the real viva, each specific to this code and to the weak answers above (for example: "Trace `dequeue` by hand when the queue has exactly one node and watch `tail`").',
    '',
    'Return JSON: {"summary": "...", "revise": ["...", "...", "..."]}',
  ].join('\n');
  return { system: systemPrompt(settings), user };
}

module.exports = { LANGUAGE_NAMES, systemPrompt, questionPrompt, gradePrompt, reportPrompt, historySummary };
