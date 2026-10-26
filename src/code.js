// Helpers for the code a student loads: validation, line numbering,
// and snapping AI-provided line ranges back onto real lines.

const MAX_FILES = 20;
const MAX_TOTAL_CHARS = 60000;
const MAX_HIGHLIGHT_LINES = 15;

class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
    this.status = 400;
  }
}

function splitLines(content) {
  // Normalise Windows line endings so line numbers match what the page shows.
  return content.replace(/\r\n?/g, '\n').split('\n');
}

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new InputError('Load at least one code file before starting the viva.');
  }
  if (files.length > MAX_FILES) {
    throw new InputError(`Too many files (${files.length}). Load at most ${MAX_FILES} — just the ones your viva covers.`);
  }

  let totalChars = 0;
  const cleanFiles = [];
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || typeof file.content !== 'string') {
      throw new InputError('Each file needs a name and text content.');
    }
    if (file.content.trim() === '') {
      continue; // skip empty files instead of failing the whole viva
    }
    totalChars += file.content.length;
    cleanFiles.push({ name: file.name.slice(0, 200), content: file.content.replace(/\r\n?/g, '\n') });
  }

  if (cleanFiles.length === 0) {
    throw new InputError('All loaded files are empty.');
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    throw new InputError(
      `That's ${totalChars.toLocaleString('en-US')} characters of code — the limit is ${MAX_TOTAL_CHARS.toLocaleString('en-US')}. ` +
      'Load only the files your viva will cover.'
    );
  }
  return cleanFiles;
}

// Turns files into the text the examiner model reads:
// === FILE: main.c (40 lines) ===
//    1 | #include <stdio.h>
function numberCode(files) {
  const parts = [];
  for (const file of files) {
    const lines = splitLines(file.content);
    parts.push(`=== FILE: ${file.name} (${lines.length} lines) ===`);
    for (let i = 0; i < lines.length; i++) {
      const lineNumber = String(i + 1).padStart(4, ' ');
      parts.push(`${lineNumber} | ${lines[i]}`);
    }
    parts.push('');
  }
  return parts.join('\n');
}

function findFile(files, name) {
  if (typeof name !== 'string') {
    return null;
  }
  const exact = files.find((f) => f.name === name);
  if (exact) {
    return exact;
  }
  // Models sometimes drop folders or change case: match on the base name.
  const wanted = name.split('/').pop().toLowerCase();
  return files.find((f) => f.name.split('/').pop().toLowerCase() === wanted) || null;
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Makes sure a {file, startLine, endLine} from the model points at real code.
function clampRange(files, fileName, startLine, endLine) {
  const file = findFile(files, fileName) || files[0];
  const lineCount = splitLines(file.content).length;

  let start = toInt(startLine, 1);
  let end = toInt(endLine, start);
  if (start > end) {
    const swap = start;
    start = end;
    end = swap;
  }
  start = Math.min(Math.max(start, 1), lineCount);
  end = Math.min(Math.max(end, start), lineCount);
  if (end - start + 1 > MAX_HIGHLIGHT_LINES) {
    end = start + MAX_HIGHLIGHT_LINES - 1;
  }
  return { file: file.name, startLine: start, endLine: end };
}

function getLines(files, fileName, startLine, endLine) {
  const file = findFile(files, fileName);
  if (!file) {
    return [];
  }
  return splitLines(file.content).slice(startLine - 1, endLine);
}

module.exports = {
  InputError,
  MAX_TOTAL_CHARS,
  splitLines,
  validateFiles,
  numberCode,
  findFile,
  clampRange,
  getLines,
};
