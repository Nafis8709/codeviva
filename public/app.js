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
  retest: null,              // { previousScore, regions } while re-testing earlier gaps
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
    repoLoad: 'Load repo', repoLoading: 'Reading repo…', repoAdd: 'Add files', repoAdding: 'Fetching files…',
    repoSkipped: 'skipped (dependencies, lockfiles, binaries, hidden folders)', repoTruncated: 'very large repo: only part of it is listed',
    repoEmpty: 'No code files found here. Try a folder link (…/tree/main/src) or load files directly.',
    repoAdded: 'Loaded', from: 'from', branch: 'branch', filesWord: 'files', characters: 'characters', max: 'max',
    kind_test: 'test', kind_other: 'other',
    retestButton: 'Re-test my gaps', retestLabel: 'Re-test',
    retestEyebrow: 'Re-test report · score on the re-tested lines', retestFixed: 'You can now defend', retestOfYour: 'of your', retestGaps: 'gaps.',
    compareRetested: 'Regions re-tested:', compareImproved: 'improved:', compareOnTheseLines: 'score on these lines:',
    resumeVivaTitle: 'You have an unfinished viva', resumeVivaButton: 'Resume',
    resumeReportTitle: 'Your last viva report', resumeReportButton: 'Open report', answeredWord: 'questions answered',
    answerKey: 'Answer key — what the examiner was listening for', wrongClaim: 'Not right:',
    point_covered: 'covered', point_partial: 'partly covered', point_missing: 'missing',
    linesChecked: '✓ lines checked', linesUnchecked: 'lines not verified',
    linesCheckedTitle: 'CodeViva checked that this question is about the highlighted lines.',
    linesUncheckedTitle: 'The line checker could not confirm these lines; use the line link to look around.',
    linesFixed: 'Fixed before asking:',
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
  state.screen = name;
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

// kind: 'error' (default), 'warning' or 'success' — colour and icon follow it.
function showLoadNotice(message, kind = 'error') {
  const notice = $('load-notice');
  notice.textContent = message || '';
  notice.className = `notice is-${kind}`;
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
    showLoadNotice(`Skipped: ${skipped.join(', ')}.`, 'warning');
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

// ---------------------------------------------------------------------------
// Loading from a public GitHub repository
// ---------------------------------------------------------------------------
const repo = { listing: null, selected: new Set(), busy: false };

function formatSize(bytes) {
  return bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(1)} kB`;
}

function selectedSize() {
  let total = 0;
  for (const file of repo.listing.files) {
    if (repo.selected.has(file.path)) {
      total += file.size;
    }
  }
  return total;
}

function setRepoBusy(busy, label) {
  repo.busy = busy;
  $('repo-btn').disabled = busy;
  $('repo-add').disabled = busy;
  $('repo-btn').textContent = busy && label === 'list' ? t('repoLoading') : t('repoLoad');
  $('repo-add').textContent = busy && label === 'add' ? t('repoAdding') : `${t('repoAdd')} (${repo.selected.size})`;
}

function renderRepoBudget() {
  const used = selectedSize();
  const budget = repo.listing.budget;
  const over = used > budget || repo.selected.size > repo.listing.maxFiles;
  $('budget-fill').style.width = `${Math.min(100, (used / budget) * 100)}%`;
  $('budget-text').textContent = `${used.toLocaleString('en-US')} / ${budget.toLocaleString('en-US')} ${t('characters')} · ${repo.selected.size} ${t('filesWord')}${repo.selected.size > repo.listing.maxFiles ? ` (${t('max')} ${repo.listing.maxFiles})` : ''}`;
  document.querySelector('.budget').classList.toggle('is-over', over);
  $('repo-add').disabled = repo.busy || over || repo.selected.size === 0;
  $('repo-add').textContent = `${t('repoAdd')} (${repo.selected.size})`;
}

function renderRepoPicker() {
  const listing = repo.listing;
  $('repo-picker').hidden = false;
  $('repo-name').textContent = `${listing.owner}/${listing.repo}${listing.folder ? `/${listing.folder}` : ''}`;
  let meta = `${t('branch')} ${listing.branch} · ${listing.files.length} ${t('filesWord')}`;
  if (listing.skipped > 0) {
    meta += ` · ${listing.skipped} ${t('repoSkipped')}`;
  }
  if (listing.truncated) {
    meta += ` · ${t('repoTruncated')}`;
  }
  $('repo-meta').textContent = meta;

  const list = $('repo-files');
  list.replaceChildren();
  if (listing.files.length === 0) {
    list.appendChild(el('li', 'empty', t('repoEmpty')));
  }
  for (const file of listing.files) {
    const item = el('li');
    const label = el('label');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = repo.selected.has(file.path);
    box.addEventListener('change', () => {
      if (box.checked) {
        repo.selected.add(file.path);
      } else {
        repo.selected.delete(file.path);
      }
      renderRepoBudget();
    });
    label.appendChild(box);
    label.appendChild(el('span', null, file.path));
    label.appendChild(el('span', 'kind', file.kind === 'code' ? '' : t(`kind_${file.kind}`)));
    label.appendChild(el('span', 'size', formatSize(file.size)));
    item.dataset.path = file.path;
    item.appendChild(label);
    list.appendChild(item);
  }
  applyRepoFilter();
  renderRepoBudget();
}

// Big repositories: show only files whose path contains the filter text
// (several words = all must match), and tick or untick what is shown.
function applyRepoFilter() {
  const words = $('repo-filter').value.toLowerCase().split(/\s+/).filter(Boolean);
  for (const item of $('repo-files').children) {
    if (!item.dataset.path) {
      continue;
    }
    const path = item.dataset.path.toLowerCase();
    item.hidden = !words.every((word) => path.includes(word));
  }
}

function setShownFiles(checked) {
  for (const item of $('repo-files').children) {
    if (!item.dataset.path || item.hidden) {
      continue;
    }
    if (checked) {
      repo.selected.add(item.dataset.path);
    } else {
      repo.selected.delete(item.dataset.path);
    }
    item.querySelector('input').checked = checked;
  }
  renderRepoBudget();
}

async function listRepo(event) {
  event.preventDefault();
  const url = $('repo-url').value.trim();
  if (url === '' || repo.busy) {
    $('repo-url').focus();
    return;
  }
  showLoadNotice('');
  setRepoBusy(true, 'list');
  try {
    repo.listing = await postJson('/api/repo/list', { url });
    repo.selected = new Set(repo.listing.files.filter((f) => f.suggested).map((f) => f.path));
    $('repo-filter').value = '';
    renderRepoPicker();
  } catch (error) {
    $('repo-picker').hidden = true;
    showLoadNotice(error.message);
  } finally {
    setRepoBusy(false);
    if (repo.listing) {
      renderRepoBudget();
    }
  }
}

async function addRepoFiles() {
  if (!repo.listing || repo.selected.size === 0 || repo.busy) {
    return;
  }
  showLoadNotice('');
  setRepoBusy(true, 'add');
  try {
    const { owner, repo: name, branch } = repo.listing;
    // Keep the repository's order, not the order the boxes were ticked.
    const paths = repo.listing.files.filter((f) => repo.selected.has(f.path)).map((f) => f.path);
    const data = await postJson('/api/repo/files', { owner, repo: name, branch, paths });
    // Repository files replace what was loaded before, so the budget is clear.
    state.files = [];
    for (const file of data.files) {
      addFile(file.name, file.content);
    }
    renderFileList();
    $('repo-picker').hidden = true;
    showLoadNotice(`${t('repoAdded')} ${data.files.length} ${t('filesWord')} ${t('from')} ${owner}/${name}.`, 'success');
  } catch (error) {
    showLoadNotice(error.message); // the picker stays open with the same selection
  } finally {
    setRepoBusy(false);
    renderRepoBudget();
  }
}

function renderFileList() {
  const list = $('file-list');
  list.replaceChildren();
  for (const file of state.files) {
    const item = el('li');
    const name = el('span', 'file-name', file.name);
    name.title = file.name;
    item.appendChild(name);
    const lineCount = splitLines(file.content).length;
    item.appendChild(el('span', 'file-lines', `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`));
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
  const count = state.files.length;
  $('loaded').hidden = count === 0;
  $('files-summary').textContent = `${count} ${count === 1 ? 'file' : t('filesWord')} ready · ${totalChars(state.files).toLocaleString('en-US')} / ${MAX_TOTAL_CHARS.toLocaleString('en-US')} ${t('characters')}`;
  $('start-btn').disabled = count === 0;
  $('start-hint').hidden = count > 0;
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
  let activeTab = null;
  for (const file of state.files) {
    const tab = el('button', null, tabLabel(file.name));
    tab.type = 'button';
    tab.title = file.name;
    tab.setAttribute('role', 'tab');
    tab.classList.toggle('is-active', file.name === state.activeFile[where]);
    if (file.name === state.activeFile[where]) {
      activeTab = tab;
    }
    if (where === 'viva' && state.current && state.current.file === file.name && file.name !== state.activeFile.viva) {
      tab.classList.add('has-question');
    }
    tab.addEventListener('click', () => {
      state.activeFile[where] = file.name;
      renderCode(where);
    });
    tabs.appendChild(tab);
  }
  if (activeTab) {
    // Bring the active tab into view inside the tab strip (not the page).
    tabs.scrollLeft = Math.max(0, activeTab.offsetLeft - tabs.clientWidth / 3);
  }
}

// Tabs show just the file name (the full path is in the tooltip), unless
// two loaded files share a name.
function tabLabel(path) {
  const base = path.split('/').pop();
  let sameName = 0;
  for (const file of state.files) {
    if (file.name.split('/').pop() === base) {
      sameName++;
    }
  }
  return sameName > 1 ? path : base;
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
  if (state.retest) {
    label = `${t('retestLabel')} · ${label}`;
  }
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

// Shows whether the server's line checker confirmed that the question is about
// the highlighted lines (only the AI examiner reports this).
function groundingMark(grounding) {
  if (!grounding || !grounding.status) {
    return null;
  }
  const verified = grounding.status !== 'unverified';
  const mark = el('span', `grounding ${verified ? 'is-verified' : 'is-unverified'}`, verified ? t('linesChecked') : t('linesUnchecked'));
  let title = verified ? t('linesCheckedTitle') : t('linesUncheckedTitle');
  if (grounding.problems && grounding.problems.length > 0) {
    title += ` ${t('linesFixed')} ${grounding.problems.join('; ')}.`;
  }
  mark.title = title;
  return mark;
}

function renderQuestionTurn(question) {
  const item = el('li', 'turn-question');
  const meta = el('div', 'turn-meta', question.isFollowUp ? `${t('examiner')} · ${t('followUp')}` : `${t('examiner')} · ${t('question')} ${questionNumber(question)}`);
  const jump = el('button', null, lineRef(question));
  jump.type = 'button';
  jump.title = t('jump');
  jump.addEventListener('click', () => showLinesOf('viva', question));
  meta.appendChild(jump);
  const mark = groundingMark(question.grounding);
  if (mark) {
    meta.appendChild(mark);
  }
  item.appendChild(meta);
  item.appendChild(richText('p', 'examiner-text', question.text));
  $('transcript').appendChild(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// The answer key, marked: which expected points the answer covered, plus any
// technically wrong claims. The score was computed from this on the server.
const POINT_MARKS = { covered: '✓', partial: '½', missing: '✗' };

function renderChecklist(turn) {
  const points = turn.points || [];
  const wrong = turn.wrongClaims || [];
  if (points.length === 0 && wrong.length === 0) {
    return null;
  }
  const box = el('div', 'checklist');
  box.appendChild(el('p', 'checklist-title', t('answerKey')));
  const list = el('ul');
  for (const point of points) {
    const item = el('li', `point is-${point.status}`);
    const mark = el('span', 'point-mark', POINT_MARKS[point.status] || '✗');
    mark.title = t(`point_${point.status}`);
    mark.setAttribute('aria-label', t(`point_${point.status}`));
    item.appendChild(mark);
    item.appendChild(richText('span', null, point.text));
    list.appendChild(item);
  }
  for (const claim of wrong) {
    const item = el('li', 'point is-wrong');
    item.appendChild(el('span', 'point-mark', '!'));
    const text = richText('span', null, claim);
    text.prepend(el('strong', null, `${t('wrongClaim')} `));
    item.appendChild(text);
    list.appendChild(item);
  }
  box.appendChild(list);
  return box;
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
  const checklist = renderChecklist(turn);
  if (checklist) {
    grade.appendChild(checklist);
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
  saveSession();
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
  state.retest = null;
  await beginViva();
}

// ---------------------------------------------------------------------------
// Re-test: a short viva on only the regions the student could not defend,
// then a before -> after comparison.
// ---------------------------------------------------------------------------

// Each examined region with its best attempt (a follow-up can recover it).
function examinedRegions(history) {
  const regions = [];
  for (const turn of history) {
    if (turn.isFollowUp) {
      continue;
    }
    const followUp = history.find((t2) => t2.isFollowUp && t2.parentId === turn.id);
    const best = followUp && followUp.score > turn.score ? followUp : turn;
    regions.push({ file: turn.file, startLine: turn.startLine, endLine: turn.endLine, topic: turn.topic, question: turn.text, verdict: best.verdict, score: best.score });
  }
  return regions;
}

function gapRegions() {
  return examinedRegions(state.history).filter((region) => region.verdict !== 'solid').slice(0, 5);
}

async function startRetest() {
  const gaps = gapRegions();
  if (gaps.length === 0) {
    return;
  }
  state.retest = {
    previousScore: state.report ? state.report.score : null,
    regions: gaps,
  };
  state.settings = {
    ...state.settings,
    totalQuestions: gaps.length,
    targets: gaps.map((gap) => ({ file: gap.file, startLine: gap.startLine, endLine: gap.endLine, topic: gap.topic, previousQuestion: gap.question })),
  };
  await beginViva();
}

function averageOutOf100(scores) {
  if (scores.length === 0) {
    return 0;
  }
  let total = 0;
  for (const score of scores) {
    total += score;
  }
  return Math.round((total / scores.length) * 10);
}

function renderComparison() {
  const box = $('compare');
  if (!state.retest) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const after = examinedRegions(state.history);
  const list = $('compare-list');
  list.replaceChildren();
  let improved = 0;
  const beforeScores = [];
  const afterScores = [];
  state.retest.regions.forEach((before, index) => {
    const now = after[index];
    beforeScores.push(before.score || 0);
    if (!now) {
      return; // re-test ended early
    }
    afterScores.push(now.score || 0);
    if (VERDICT_RANK[now.verdict] > VERDICT_RANK[before.verdict]) {
      improved++;
    }
    const item = el('li');
    item.appendChild(el('span', `stamp ${before.verdict}`, t(`legend${capitalise(before.verdict)}`)));
    item.appendChild(el('span', 'arrow', '→'));
    item.appendChild(el('span', `stamp ${now.verdict}`, t(`legend${capitalise(now.verdict)}`)));
    const link = richText('button', null, before.topic);
    link.type = 'button';
    link.appendChild(el('span', 'ref', `${now.file.split('/').pop()}:${now.startLine}–${now.endLine}`));
    link.addEventListener('click', () => showLinesOf('report', now));
    item.appendChild(link);
    list.appendChild(item);
  });
  const answered = afterScores.length;
  $('compare-summary').textContent = `${t('compareRetested')} ${answered} · ${t('compareImproved')} ${improved} · ${t('compareOnTheseLines')} ${averageOutOf100(beforeScores.slice(0, answered))} → ${averageOutOf100(afterScores)}/100`;
}

const VERDICT_RANK = { gap: 0, partial: 1, solid: 2 };

function capitalise(word) {
  return word ? word[0].toUpperCase() + word.slice(1) : '';
}

async function beginViva() {
  applyLanguage();
  state.history = [];
  state.current = null;
  state.report = null;
  state.activeFile = { viva: state.files[0].name, report: state.files[0].name };
  $('transcript').replaceChildren();
  hideError();
  $('resume-card').hidden = true;
  showScreen('viva');
  renderCode('viva');
  renderProgress();
  saveSession();
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
      points: grade.points || [],
      wrongClaims: grade.wrongClaims || [],
    };
    state.history.push(turn);
    state.current = null;
    $('answer-box').value = '';
    saveSession();
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
    saveSession();
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
  // A re-test only covers the earlier gaps: say so instead of judging the whole project.
  let eyebrow = t('reportEyebrow');
  if (state.retest) {
    const after = examinedRegions(state.history);
    let fixed = 0;
    for (const region of after) {
      if (region.verdict === 'solid') {
        fixed++;
      }
    }
    eyebrow = t('retestEyebrow');
    headline = `${t('retestFixed')} ${fixed} ${t('retestOfYour')} ${state.retest.regions.length} ${t('retestGaps')}`;
  }
  document.querySelector('[data-i18n="reportEyebrow"]').textContent = eyebrow;
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
  renderComparison();
  const gapsLeft = gapRegions().length;
  $('retest-btn').hidden = gapsLeft === 0;
  $('retest-btn').textContent = `${t('retestButton')} (${gapsLeft})`;

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
    const checklist = renderChecklist(turn);
    if (checklist) {
      body.appendChild(checklist);
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
  if (state.retest) {
    lines.push(`## ${t('retestLabel')}: before → after`);
    const after = examinedRegions(state.history);
    state.retest.regions.forEach((before, index) => {
      const now = after[index];
      if (now) {
        lines.push(`- ${before.topic} (\`${now.file}:${now.startLine}-${now.endLine}\`): ${before.verdict} → ${now.verdict}`);
      }
    });
    lines.push('');
  }
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
    if (turn.points && turn.points.length > 0) {
      lines.push('');
      lines.push('**Answer key:**');
      for (const point of turn.points) {
        lines.push(`- ${POINT_MARKS[point.status] || '✗'} ${point.text}`);
      }
      for (const claim of turn.wrongClaims || []) {
        lines.push(`- ! ${t('wrongClaim')} ${claim}`);
      }
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
// Saving the session in this browser, so a refresh, a closed tab or a crash
// never loses answered questions. Nothing leaves the browser.
// ---------------------------------------------------------------------------
const SAVE_KEY = 'codeviva.session.v1';
let draftTimer = null;

function saveSession() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      screen: state.screen,
      files: state.files,
      settings: state.settings,
      history: state.history,
      current: state.current,
      report: state.report,
      retest: state.retest,
      draft: $('answer-box').value,
    }));
  } catch (error) {
    // Storage full or blocked (private mode): the viva still works, it just won't survive a refresh.
  }
}

function loadSavedSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!saved || saved.version !== 1 || !Array.isArray(saved.files) || saved.files.length === 0 || !Array.isArray(saved.history)) {
      return null;
    }
    if (saved.screen !== 'viva' && saved.screen !== 'report') {
      return null;
    }
    return saved;
  } catch (error) {
    return null;
  }
}

function clearSavedSession() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (error) {
    // nothing to clear
  }
}

function timeAgo(timestamp) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours} h ago`;
  }
  return `${Math.round(hours / 24)} days ago`;
}

function offerResume() {
  const saved = loadSavedSession();
  $('resume-card').hidden = !saved;
  if (!saved) {
    return;
  }
  const fileNames = saved.files.map((f) => f.name).slice(0, 3).join(', ') + (saved.files.length > 3 ? '…' : '');
  if (saved.screen === 'report' && saved.report) {
    $('resume-title').textContent = t('resumeReportTitle');
    $('resume-detail').textContent = `${saved.report.score}/100 · ${fileNames} · ${timeAgo(saved.savedAt)}`;
    $('resume-btn').textContent = t('resumeReportButton');
  } else {
    const answered = saved.history.filter((turn) => !turn.isFollowUp).length;
    const total = (saved.settings && saved.settings.totalQuestions) || 5;
    $('resume-title').textContent = t('resumeVivaTitle');
    $('resume-detail').textContent = `${answered} ${t('of')} ${total} ${t('answeredWord')} · ${fileNames} · ${timeAgo(saved.savedAt)}`;
    $('resume-btn').textContent = t('resumeVivaButton');
  }
}

function setSettingsControls(settings) {
  $('language').value = settings.language || 'en';
  const style = document.querySelector(`input[name="style"][value="${settings.style === 'strict' ? 'strict' : 'friendly'}"]`);
  if (style) {
    style.checked = true;
  }
  const total = document.querySelector(`input[name="total"][value="${settings.totalQuestions === 3 ? 3 : 5}"]`);
  if (total) {
    total.checked = true;
  }
}

async function resumeSession() {
  const saved = loadSavedSession();
  $('resume-card').hidden = true;
  if (!saved) {
    return;
  }
  state.files = saved.files;
  state.settings = saved.settings || state.settings;
  state.history = saved.history;
  state.current = saved.current || null;
  state.report = saved.report || null;
  state.retest = saved.retest || null;
  state.activeFile = { viva: state.files[0].name, report: state.files[0].name };
  setSettingsControls(state.settings);
  renderFileList();
  applyLanguage();
  hideError();

  if (saved.screen === 'report' && state.report) {
    renderReport();
    showScreen('report');
    return;
  }

  // Rebuild the transcript from the saved turns, without asking the AI again.
  $('transcript').replaceChildren();
  showScreen('viva');
  renderCode('viva');
  for (const turn of state.history) {
    renderQuestionTurn(turn);
    renderAnswerTurn(turn);
  }
  renderProgress();
  if (state.current) {
    askQuestion(state.current);
    $('answer-box').value = saved.draft || '';
    saveSession(); // askQuestion saved an empty box; keep the restored draft
  } else if (mainCount() < state.settings.totalQuestions) {
    await fetchNextQuestion();
  } else {
    await finishViva();
  }
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
  $('repo-form').addEventListener('submit', listRepo);
  $('repo-add').addEventListener('click', addRepoFiles);
  $('repo-clear').addEventListener('click', () => {
    repo.selected.clear();
    renderRepoPicker();
  });
  $('repo-filter').addEventListener('input', applyRepoFilter);
  $('repo-tick-shown').addEventListener('click', () => setShownFiles(true));
  $('repo-untick-shown').addEventListener('click', () => setShownFiles(false));
  $('repo-cancel').addEventListener('click', () => {
    $('repo-picker').hidden = true;
  });
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
      clearSavedSession();
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
  $('retest-btn').addEventListener('click', startRetest);
  $('restart-btn').addEventListener('click', () => {
    state.history = [];
    state.current = null;
    state.report = null;
    state.retest = null;
    clearSavedSession();
    showScreen('setup');
  });
}

function wireResume() {
  $('resume-btn').addEventListener('click', resumeSession);
  $('discard-btn').addEventListener('click', () => {
    clearSavedSession();
    $('resume-card').hidden = true;
  });
  // Keep the half-written answer too.
  $('answer-box').addEventListener('input', () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveSession, 400);
  });
}

wireSetup();
wireViva();
wireReport();
wireResume();
renderFileList();
offerResume();
loadStatus();
