// CodeViva page logic.
// One `state` object holds the whole session; small render functions draw it.
// Everything the examiner writes is inserted with textContent, never innerHTML.

'use strict';

const MAX_TOTAL_CHARS = 60000;
const SAMPLE_FILES = ['token_queue.h', 'token_queue.c'];
const BINARY_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'pdf', 'zip', 'exe', 'o', 'class', 'jar', 'dll', 'so', 'bin', 'mp4', 'mp3', 'docx', 'xlsx', 'pptx', 'ico'];

const state = {
  files: [],                 // [{ name, content }]
  settings: { language: 'en', style: 'friendly', totalQuestions: 5 },
  history: [],               // answered turns
  current: null,             // the question being asked
  activeFile: { viva: null, report: null },
  report: null,
  status: null,
  busy: false,
  retryAction: null,
};

// ---------------------------------------------------------------------------
// Interface text. The interface stays in English; the examiner's own text
// comes from the server in the language the student chose.
// ---------------------------------------------------------------------------
const STRINGS = {
  en: {
    quit: 'End viva', legendNow: 'being asked', legendSolid: 'solid', legendPartial: 'partial', legendGap: 'gap',
    retry: 'Retry', speak: 'Speak', listening: 'Listening… tap to stop', dontKnow: "I don't know — teach me",
    submit: 'Submit answer', hint: 'Ctrl + Enter to submit', reportEyebrow: 'Viva report · ownership score',
    copy: 'Copy as Markdown', restart: 'New viva', copied: 'Copied', heatmap: 'Ownership heatmap',
    owns: 'What you clearly own', gaps: "What you couldn't defend yet", revise: 'Revise before the real viva',
    transcript: 'The full viva', question: 'Question', of: 'of', followUp: 'follow-up', lines: 'lines', line: 'line',
    reading: 'The examiner is reading your code…', grading: 'The examiner is marking your answer…',
    writingReport: 'The examiner is writing your report…', placeholder: 'Answer as you would in the viva…',
    dontKnowAnswer: "(I don't know — teach me)", showAnswer: 'Show a model answer', nothingSolid: 'Nothing fully solid yet — that is what practice is for.',
    nothingGaps: 'No gaps found. Well defended.', examiner: 'Examiner', yourAnswer: 'Your answer', feedbackLabel: 'Feedback',
    headlineHigh: 'You own this code.', headlineMid: 'You own most of this code.', headlineLow: 'Some of this code still owns you.',
    jump: 'show lines', quitConfirm: 'End the viva now and see the report for the questions answered so far?',
  },
};

function t(key) {
  return STRINGS.en[key] || key;
}

// Browser speech-recognition locale for each examiner language.
const SPEECH_LOCALES = {
  en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE',
  hi: 'hi-IN', ar: 'ar-SA', zh: 'zh-CN', id: 'id-ID', bn: 'bn-BD',
};

// ---------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined && text !== null) {
    node.textContent = text;
  }
  return node;
}

// Renders `backtick` spans as <code> while keeping everything as text nodes.
function richText(tag, className, text) {
  const node = el(tag, className);
  const parts = String(text || '').split('`');
  parts.forEach((part, index) => {
    if (part === '') {
      return;
    }
    if (index % 2 === 1) {
      node.appendChild(el('code', null, part));
    } else {
      node.appendChild(document.createTextNode(part));
    }
  });
  // Examiner and student text is in the chosen language: tell the browser,
  // so fonts and right-to-left scripts (Arabic) render correctly.
  node.lang = state.settings.language;
  node.dir = 'auto';
  return node;
}

function splitLines(content) {
  return content.replace(/\r\n?/g, '\n').split('\n');
}

function showScreen(name) {
  for (const screen of ['setup', 'viva', 'report']) {
    $(`screen-${screen}`).hidden = screen !== name;
  }
  window.scrollTo({ top: 0 });
}

function applyLanguage() {
  // The answer box takes the examiner's language too.
  $('answer-box').lang = state.settings.language;
  $('answer-box').dir = 'auto';
}

// ---------------------------------------------------------------------------
// Server calls
// ---------------------------------------------------------------------------
async function postJson(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    throw new Error('Could not reach the CodeViva server. Is it still running?');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `The server answered with an error (${response.status}).`);
  }
  return data;
}

function sessionPayload() {
  return { files: state.files, settings: state.settings, history: state.history };
}

async function loadStatus() {
  const pill = $('status-pill');
  try {
    const response = await fetch('/api/status');
    state.status = await response.json();
    pill.textContent = state.status.label;
    pill.classList.toggle('is-demo', state.status.mode === 'demo');
    pill.classList.toggle('is-ai', state.status.mode !== 'demo');
    $('demo-notice').hidden = state.status.mode !== 'demo';
  } catch (error) {
    pill.textContent = 'Server not reachable';
  }
}

// ---------------------------------------------------------------------------
// Setup screen: loading files
// ---------------------------------------------------------------------------
function totalChars(files) {
  let total = 0;
  for (const file of files) {
    total += file.content.length;
  }
  return total;
}

function showLoadNotice(message) {
  const notice = $('load-notice');
  notice.textContent = message || '';
  notice.hidden = !message;
}

function addFile(name, content) {
  const clean = content.replace(/\r\n?/g, '\n');
  if (clean.trim() === '') {
    showLoadNotice(`${name} is empty — skipped.`);
    return;
  }
  const others = state.files.filter((file) => file.name !== name);
  if (totalChars(others) + clean.length > MAX_TOTAL_CHARS) {
    showLoadNotice(`Adding ${name} would go over ${MAX_TOTAL_CHARS.toLocaleString('en-US')} characters. Load only the files your viva covers.`);
    return;
  }
  state.files = [...others, { name, content: clean }];
}

function looksBinary(name, content) {
  const extension = name.split('.').pop().toLowerCase();
  if (BINARY_EXTENSIONS.includes(extension)) {
    return true;
  }
  // A NUL character almost never appears in source code.
  return content.slice(0, 2000).includes('\u0000');
}

async function addFilesFromInput(fileList) {
  showLoadNotice('');
  const skipped = [];
  for (const file of fileList) {
    if (file.size > MAX_TOTAL_CHARS * 2) {
      skipped.push(`${file.name} (too large)`);
      continue;
    }
    const content = await file.text();
    if (looksBinary(file.name, content)) {
      skipped.push(`${file.name} (not a text/code file)`);
      continue;
    }
    addFile(file.webkitRelativePath || file.name, content);
  }
  if (skipped.length > 0) {
    showLoadNotice(`Skipped: ${skipped.join(', ')}.`);
  }
  renderFileList();
}

async function loadSample() {
  showLoadNotice('');
  try {
    for (const name of SAMPLE_FILES) {
      const response = await fetch(`samples/${name}`);
      addFile(name, await response.text());
    }
  } catch (error) {
    showLoadNotice('Could not load the sample project.');
  }
  renderFileList();
}

function addPasted() {
  const content = $('paste-box').value;
  const name = $('paste-name').value.trim() || 'pasted-code.txt';
  showLoadNotice('');
  addFile(name, content);
  $('paste-box').value = '';
  renderFileList();
}

function renderFileList() {
  const list = $('file-list');
  list.replaceChildren();
  for (const file of state.files) {
    const item = el('li');
    item.appendChild(el('span', 'file-name', file.name));
    item.appendChild(el('span', 'file-lines', `${splitLines(file.content).length} lines`));
    const remove = el('button', null, '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.addEventListener('click', () => {
      state.files = state.files.filter((f) => f.name !== file.name);
      renderFileList();
    });
    item.appendChild(remove);
    list.appendChild(item);
  }
  $('start-btn').disabled = state.files.length === 0;
}

function readSettings() {
  state.settings = {
    language: $('language').value,
    style: document.querySelector('input[name="style"]:checked').value,
    totalQuestions: Number(document.querySelector('input[name="total"]:checked').value),
  };
}

// ---------------------------------------------------------------------------
// Code viewer (used on the viva screen and as the report heatmap)
// ---------------------------------------------------------------------------

// Final verdict per examined region: a follow-up's better result wins.
function heatRegions() {
  const regions = [];
  for (const turn of state.history) {
    if (turn.isFollowUp) {
      continue;
    }
    const followUp = state.history.find((t2) => t2.isFollowUp && t2.parentId === turn.id);
    const best = followUp && followUp.score > turn.score ? followUp : turn;
    regions.push({ file: turn.file, startLine: turn.startLine, endLine: turn.endLine, verdict: best.verdict });
  }
  return regions;
}

function renderTabs(where) {
  const tabs = $(`${where}-tabs`);
  tabs.replaceChildren();
  if (state.files.length < 2) {
    tabs.hidden = true;
    return;
  }
  tabs.hidden = false;
  for (const file of state.files) {
    const tab = el('button', null, file.name);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.classList.toggle('is-active', file.name === state.activeFile[where]);
    if (where === 'viva' && state.current && state.current.file === file.name && file.name !== state.activeFile.viva) {
      tab.classList.add('has-question');
    }
    tab.addEventListener('click', () => {
      state.activeFile[where] = file.name;
      renderCode(where);
    });
    tabs.appendChild(tab);
  }
}

function renderCode(where) {
  const view = $(`${where}-code`);
  if (!state.activeFile[where] && state.files.length > 0) {
    state.activeFile[where] = state.files[0].name;
  }
  const file = state.files.find((f) => f.name === state.activeFile[where]) || state.files[0];
  if (!file) {
    return;
  }
  renderTabs(where);

  const regions = heatRegions().filter((region) => region.file === file.name);
  const current = where === 'viva' && state.current && state.current.file === file.name ? state.current : null;

  const fragment = document.createDocumentFragment();
  splitLines(file.content).forEach((text, index) => {
    const number = index + 1;
    const line = el('div', 'code-line');
    line.dataset.line = String(number);
    for (const region of regions) {
      if (number >= region.startLine && number <= region.endLine) {
        line.classList.add(`heat-${region.verdict}`);
      }
    }
    if (current && number >= current.startLine && number <= current.endLine) {
      line.classList.add('is-current');
    }
    line.appendChild(el('span', 'ln', String(number)));
    line.appendChild(el('span', 'lc', text === '' ? ' ' : text));
    fragment.appendChild(line);
  });
  view.replaceChildren(fragment);
}

// Scrolls the code panel (not the page) so the lines sit near the middle.
function scrollToLines(where, startLine, flash) {
  const view = $(`${where}-code`);
  const target = view.querySelector(`[data-line="${startLine}"]`);
  if (!target) {
    return;
  }
  const offset = target.offsetTop - view.clientHeight / 3;
  view.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  if (flash) {
    view.querySelectorAll('.is-current').forEach((line) => {
      line.classList.remove('flash');
      void line.offsetWidth; // restart the animation
      line.classList.add('flash');
    });
  }
}

function showLinesOf(where, region) {
  state.activeFile[where] = region.file;
  renderCode(where);
  scrollToLines(where, region.startLine, where === 'viva');
}

// ---------------------------------------------------------------------------
// Viva screen
// ---------------------------------------------------------------------------
function mainCount() {
  return state.history.filter((turn) => !turn.isFollowUp).length;
}

function questionNumber(question) {
  const parentId = question.isFollowUp ? question.parentId : question.id;
  const number = parseInt(String(parentId).replace(/\D/g, ''), 10);
  return Number.isFinite(number) ? number : mainCount() + 1;
}

function lineRef(turn) {
  if (turn.startLine === turn.endLine) {
    return `${turn.file} · ${t('line')} ${turn.startLine}`;
  }
  return `${turn.file} · ${t('lines')} ${turn.startLine}–${turn.endLine}`;
}

function renderProgress() {
  const total = state.settings.totalQuestions;
  const question = state.current;
  const number = question ? questionNumber(question) : mainCount();
  let label = `${t('question')} ${number} ${t('of')} ${total}`;
  if (question && question.isFollowUp) {
    label += ` · ${t('followUp')}`;
  }
  $('progress-label').textContent = label;
  $('progress-topic').textContent = question ? question.topic : '';

  const dots = $('progress-dots');
  dots.replaceChildren();
  const regions = heatRegions();
  for (let i = 0; i < total; i++) {
    const dot = el('i');
    if (regions[i]) {
      dot.classList.add(regions[i].verdict);
    } else if (i === number - 1) {
      dot.classList.add('is-current');
    }
    dots.appendChild(dot);
  }
}

function renderQuestionTurn(question) {
  const item = el('li', 'turn-question');
  const meta = el('div', 'turn-meta', question.isFollowUp ? `${t('examiner')} · ${t('followUp')}` : `${t('examiner')} · ${t('question')} ${questionNumber(question)}`);
  const jump = el('button', null, lineRef(question));
  jump.type = 'button';
  jump.title = t('jump');
  jump.addEventListener('click', () => showLinesOf('viva', question));
  meta.appendChild(jump);
  item.appendChild(meta);
  item.appendChild(richText('p', 'examiner-text', question.text));
  $('transcript').appendChild(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderAnswerTurn(turn) {
  const answer = el('li', `turn-answer${turn.dontKnow ? ' is-dontknow' : ''}`, turn.dontKnow ? t('dontKnowAnswer') : turn.answer);
  answer.dir = 'auto';
  $('transcript').appendChild(answer);

  const grade = el('li', 'turn-grade');
  grade.appendChild(el('span', `stamp ${turn.verdict}`, t(`legend${turn.verdict[0].toUpperCase()}${turn.verdict.slice(1)}`)));
  grade.appendChild(el('span', 'score-small', `${turn.score}/10`));
  if (turn.feedback) {
    grade.appendChild(richText('p', 'feedback', turn.feedback));
  }
  if (turn.modelAnswer && turn.modelAnswer !== turn.feedback) {
    const details = el('details', 'model-answer');
    details.appendChild(el('summary', null, t('showAnswer')));
    details.appendChild(richText('p', null, turn.modelAnswer));
    details.open = turn.verdict === 'gap';
    grade.appendChild(details);
  }
  $('transcript').appendChild(grade);
  grade.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setBusy(busy, messageKey) {
  state.busy = busy;
  $('thinking').hidden = !busy;
  if (busy) {
    $('thinking-text').textContent = t(messageKey);
  }
  for (const id of ['answer-box', 'submit-btn', 'dontknow-btn', 'mic-btn']) {
    $(id).disabled = busy || !state.current;
  }
}

function showError(message, retryAction) {
  state.retryAction = retryAction;
  $('error-text').textContent = message;
  $('error-banner').hidden = false;
}

function hideError() {
  $('error-banner').hidden = true;
  state.retryAction = null;
}

function askQuestion(question) {
  state.current = question;
  renderProgress();
  renderQuestionTurn(question);
  showLinesOf('viva', question);
  setBusy(false);
  $('answer-box').value = '';
  $('answer-box').focus({ preventScroll: true });
}

async function fetchNextQuestion() {
  hideError();
  state.current = null;
  setBusy(true, 'reading');
  try {
    const data = await postJson('/api/viva/question', sessionPayload());
    askQuestion(data.question);
  } catch (error) {
    setBusy(false);
    showError(error.message, fetchNextQuestion);
  }
}

async function startViva() {
  readSettings();
  applyLanguage();
  state.history = [];
  state.current = null;
  state.report = null;
  state.activeFile = { viva: state.files[0].name, report: state.files[0].name };
  $('transcript').replaceChildren();
  hideError();
  showScreen('viva');
  renderCode('viva');
  renderProgress();
  await fetchNextQuestion();
}

async function submitAnswer(dontKnow) {
  if (state.busy || !state.current) {
    return;
  }
  const answer = $('answer-box').value.trim();
  if (!dontKnow && answer === '') {
    $('answer-box').focus();
    return;
  }
  stopListening();
  hideError();
  const question = state.current;
  setBusy(true, 'grading');
  try {
    const data = await postJson('/api/viva/grade', { ...sessionPayload(), question, answer, dontKnow });
    const grade = data.grade;
    const turn = {
      ...question,
      answer: dontKnow ? '' : answer,
      dontKnow,
      verdict: grade.verdict,
      score: grade.score,
      feedback: grade.feedback,
      modelAnswer: grade.modelAnswer,
    };
    state.history.push(turn);
    state.current = null;
    renderAnswerTurn(turn);
    renderCode('viva');
    renderProgress();

    if (grade.followUp) {
      askQuestion(grade.followUp);
    } else if (mainCount() < state.settings.totalQuestions) {
      await fetchNextQuestion();
    } else {
      await finishViva();
    }
  } catch (error) {
    // If grading failed, the same question is still open; if a later step
    // failed, the turn is saved and the retry continues from there.
    const alreadyGraded = state.history.some((turn) => turn.id === question.id);
    if (!alreadyGraded) {
      state.current = question;
      setBusy(false);
      showError(error.message, () => submitAnswer(dontKnow));
    } else {
      setBusy(false);
      showError(error.message, mainCount() < state.settings.totalQuestions ? fetchNextQuestion : finishViva);
    }
  }
}

// ---------------------------------------------------------------------------
// Report screen
// ---------------------------------------------------------------------------
async function finishViva() {
  hideError();
  setBusy(true, 'writingReport');
  try {
    const data = await postJson('/api/viva/report', sessionPayload());
    state.report = data.report;
    setBusy(false);
    renderReport();
    showScreen('report');
  } catch (error) {
    setBusy(false);
    showError(error.message, finishViva);
  }
}

function renderReport() {
  const report = state.report;
  $('score-number').textContent = String(report.score);
  let headline = t('headlineLow');
  if (report.score >= 80) {
    headline = t('headlineHigh');
  } else if (report.score >= 55) {
    headline = t('headlineMid');
  }
  $('report-headline').textContent = headline;
  $('report-summary').replaceChildren(document.createTextNode(report.summary || ''));

  const strengths = $('strengths-list');
  strengths.replaceChildren();
  if (!report.strengths || report.strengths.length === 0) {
    strengths.appendChild(el('li', 'empty', t('nothingSolid')));
  } else {
    for (const item of report.strengths) {
      strengths.appendChild(richText('li', null, item));
    }
  }

  const gaps = $('gaps-list');
  gaps.replaceChildren();
  if (!report.gaps || report.gaps.length === 0) {
    gaps.appendChild(el('li', 'empty', t('nothingGaps')));
  } else {
    for (const gap of report.gaps) {
      const item = el('li');
      const button = richText('button', null, gap.text);
      button.type = 'button';
      button.appendChild(el('span', 'ref', `${gap.file}:${gap.startLine}${gap.endLine !== gap.startLine ? `–${gap.endLine}` : ''}`));
      button.addEventListener('click', () => showLinesOf('report', gap));
      item.appendChild(button);
      gaps.appendChild(item);
    }
  }

  const revise = $('revise-list');
  revise.replaceChildren();
  for (const tip of report.revise || []) {
    revise.appendChild(richText('li', null, tip));
  }

  renderReportTranscript();

  // Open the heatmap on the first gap, or on the first examined region.
  const focus = (report.gaps || [])[0] || state.history[0];
  state.activeFile.report = focus ? focus.file : state.files[0].name;
  renderCode('report');
  if (focus) {
    setTimeout(() => scrollToLines('report', focus.startLine, false), 50);
  }
}

function renderReportTranscript() {
  const container = $('report-transcript');
  container.replaceChildren();
  for (const turn of state.history) {
    const details = el('details', 'qa');
    const summary = el('summary');
    summary.appendChild(el('span', `stamp ${turn.verdict}`, t(`legend${turn.verdict[0].toUpperCase()}${turn.verdict.slice(1)}`)));
    summary.appendChild(document.createTextNode(`${turn.isFollowUp ? `↳ ${t('followUp')}` : `${t('question')} ${questionNumber(turn)}`} — ${turn.topic}`));
    details.appendChild(summary);

    const body = el('div', 'qa-body');
    const q = richText('p', null, turn.text);
    q.prepend(el('span', 'label', `${t('examiner')} · ${lineRef(turn)}`));
    body.appendChild(q);
    const a = el('p', null, turn.dontKnow ? t('dontKnowAnswer') : turn.answer);
    a.prepend(el('span', 'label', t('yourAnswer')));
    body.appendChild(a);
    if (turn.feedback) {
      const f = richText('p', null, turn.feedback);
      f.prepend(el('span', 'label', `${t('feedbackLabel')} · ${turn.score}/10`));
      body.appendChild(f);
    }
    details.appendChild(body);
    container.appendChild(details);
  }
}

function reportMarkdown() {
  const report = state.report;
  const lines = [];
  lines.push('# CodeViva report');
  lines.push('');
  lines.push(`**Ownership score: ${report.score}/100**`);
  lines.push('');
  lines.push(report.summary || '');
  lines.push('');
  lines.push(`## ${t('owns')}`);
  for (const item of report.strengths || []) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push(`## ${t('gaps')}`);
  for (const gap of report.gaps || []) {
    lines.push(`- ${gap.text} (\`${gap.file}:${gap.startLine}-${gap.endLine}\`)`);
  }
  lines.push('');
  lines.push(`## ${t('revise')}`);
  (report.revise || []).forEach((tip, index) => lines.push(`${index + 1}. ${tip}`));
  lines.push('');
  lines.push(`## ${t('transcript')}`);
  for (const turn of state.history) {
    lines.push('');
    lines.push(`### ${turn.isFollowUp ? t('followUp') : `${t('question')} ${questionNumber(turn)}`} — ${turn.topic} (${turn.verdict}, ${turn.score}/10)`);
    lines.push(`*${lineRef(turn)}*`);
    lines.push('');
    lines.push(`**Q:** ${turn.text}`);
    lines.push('');
    lines.push(`**A:** ${turn.dontKnow ? t('dontKnowAnswer') : turn.answer}`);
    if (turn.feedback) {
      lines.push('');
      lines.push(`**Feedback:** ${turn.feedback}`);
    }
  }
  return lines.join('\n');
}

async function copyReport() {
  const text = reportMarkdown();
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    // Fallback for browsers that block the clipboard API.
    const area = el('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  $('copied').hidden = false;
  setTimeout(() => { $('copied').hidden = true; }, 1800);
}

// ---------------------------------------------------------------------------
// Voice answers (browser speech recognition, optional)
// ---------------------------------------------------------------------------
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let answerBeforeSpeech = '';

function stopListening() {
  if (recognition) {
    recognition.stop();
  }
}

function setMicListening(listening) {
  const button = $('mic-btn');
  button.classList.toggle('is-listening', listening);
  button.setAttribute('aria-pressed', String(listening));
  $('mic-label').textContent = listening ? t('listening') : t('speak');
}

function toggleListening() {
  if (recognition) {
    stopListening();
    return;
  }
  recognition = new SpeechRecognitionImpl();
  recognition.lang = SPEECH_LOCALES[state.settings.language] || 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  answerBeforeSpeech = $('answer-box').value.trim();

  recognition.onresult = (event) => {
    let spoken = '';
    for (let i = 0; i < event.results.length; i++) {
      spoken += event.results[i][0].transcript;
    }
    $('answer-box').value = [answerBeforeSpeech, spoken.trim()].filter(Boolean).join(' ');
  };
  recognition.onend = () => {
    recognition = null;
    setMicListening(false);
  };
  recognition.onerror = () => {
    recognition = null;
    setMicListening(false);
  };
  recognition.start();
  setMicListening(true);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function wireSetup() {
  const input = $('file-input');
  input.addEventListener('change', () => {
    addFilesFromInput([...input.files]);
    input.value = '';
  });

  const zone = $('dropzone');
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-over');
    addFilesFromInput([...event.dataTransfer.files]);
  });

  $('sample-btn').addEventListener('click', loadSample);
  $('paste-add').addEventListener('click', addPasted);
  $('start-btn').addEventListener('click', startViva);
}

function wireViva() {
  $('composer').addEventListener('submit', (event) => {
    event.preventDefault();
    submitAnswer(false);
  });
  $('answer-box').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitAnswer(false);
    }
  });
  $('dontknow-btn').addEventListener('click', () => submitAnswer(true));
  $('retry-btn').addEventListener('click', () => {
    const action = state.retryAction;
    hideError();
    if (action) {
      action();
    }
  });
  $('quit-btn').addEventListener('click', () => {
    if (state.busy) {
      return;
    }
    if (state.history.length === 0) {
      showScreen('setup');
      return;
    }
    if (window.confirm(t('quitConfirm'))) {
      stopListening();
      finishViva();
    }
  });

  if (SpeechRecognitionImpl) {
    $('mic-btn').hidden = false;
    $('mic-btn').addEventListener('click', toggleListening);
  }
}

function wireReport() {
  $('copy-btn').addEventListener('click', copyReport);
  $('restart-btn').addEventListener('click', () => {
    state.history = [];
    state.current = null;
    state.report = null;
    showScreen('setup');
  });
}

wireSetup();
wireViva();
wireReport();
renderFileList();
loadStatus();
