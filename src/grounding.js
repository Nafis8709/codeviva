// Grounding: checks that a question from the model really is about the lines
// it highlights, and repairs it when it can.
//
// A question is "grounded" when:
//   - its file exists,
//   - its line numbers are inside that file,
//   - the code identifiers it names in `backticks` appear in the highlighted lines,
//   - any "line N" it mentions in the text is inside the highlighted range,
//   - it does not re-examine a region that was already asked about.
//
// Result of checkQuestion():
//   { status: 'grounded' | 'repaired' | 'rejected', range, problems: [...] }
//   'repaired'  -> the anchor was moved or clamped onto the right real lines
//   'rejected'  -> the question should be asked again (problems say why)

const { findFile, splitLines } = require('./code');

const MAX_SPAN = 12;

// Words that may appear in backticks but say nothing about where the code is.
const IGNORED_WORDS = [
  'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'switch', 'case',
  'int', 'char', 'void', 'long', 'float', 'double', 'bool', 'boolean', 'string', 'str',
  'null', 'none', 'nil', 'true', 'false', 'self', 'this', 'new', 'const', 'let', 'var',
  'def', 'class', 'public', 'private', 'static', 'import', 'include', 'struct',
];

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsIdentifier(text, identifier) {
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegex(identifier)}([^A-Za-z0-9_]|$)`);
  return pattern.test(text);
}

// The identifiers a question names in `backticks`, e.g. "`head->next`" -> head, next.
function identifiersInQuestion(text) {
  const found = [];
  const parts = String(text || '').split('`');
  for (let i = 1; i < parts.length; i += 2) {
    const words = parts[i].match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    for (const word of words) {
      if (word.length < 2 || IGNORED_WORDS.includes(word.toLowerCase())) {
        continue;
      }
      if (!found.includes(word)) {
        found.push(word);
      }
    }
  }
  return found;
}

// Line numbers the question text mentions: "line 42", "lines 10-14", "lines 10–14".
function lineNumbersInText(text) {
  const numbers = [];
  const pattern = /\blines?\s+(\d+)(?:\s*(?:-|–|to|and)\s*(\d+))?/gi;
  let match = pattern.exec(String(text || ''));
  while (match) {
    numbers.push(Number(match[1]));
    if (match[2]) {
      numbers.push(Number(match[2]));
    }
    match = pattern.exec(String(text || ''));
  }
  return numbers;
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function rangeText(lines, startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('\n');
}

function overlapShare(a, b) {
  if (a.file !== b.file) {
    return 0;
  }
  const start = Math.max(a.startLine, b.startLine);
  const end = Math.min(a.endLine, b.endLine);
  if (end < start) {
    return 0;
  }
  return (end - start + 1) / (a.endLine - a.startLine + 1);
}

// Identifiers from the question that exist somewhere in the loaded code.
// Words that appear nowhere (e.g. `O(n)`) are not evidence either way.
function identifiersInCode(files, identifiers) {
  const result = [];
  for (const identifier of identifiers) {
    for (const file of files) {
      if (containsIdentifier(file.content, identifier)) {
        result.push(identifier);
        break;
      }
    }
  }
  return result;
}

function countFound(text, identifiers) {
  let count = 0;
  for (const identifier of identifiers) {
    if (containsIdentifier(text, identifier)) {
      count++;
    }
  }
  return count;
}

function linesContaining(files, identifier) {
  let count = 0;
  for (const file of files) {
    for (const line of splitLines(file.content)) {
      if (containsIdentifier(line, identifier)) {
        count++;
      }
    }
  }
  return count;
}

function rarestIdentifier(files, identifiers) {
  let rarest = identifiers[0];
  let rarestCount = Infinity;
  for (const identifier of identifiers) {
    const count = linesContaining(files, identifier);
    if (count > 0 && count < rarestCount) {
      rarest = identifier;
      rarestCount = count;
    }
  }
  return rarest;
}

// From the anchor line, extend forward (up to MAX_SPAN lines) only as far as
// needed to include as many identifiers as the window can hold.
function coverForward(lines, anchor, identifiers) {
  const limit = Math.min(lines.length, anchor + MAX_SPAN - 1);
  const score = countFound(rangeText(lines, anchor, limit), identifiers);
  let end = anchor;
  while (end < limit && countFound(rangeText(lines, anchor, end), identifiers) < score) {
    end++;
  }
  return { startLine: anchor, endLine: end, score };
}

function coverBackward(lines, anchor, identifiers) {
  const limit = Math.max(1, anchor - MAX_SPAN + 1);
  const score = countFound(rangeText(lines, limit, anchor), identifiers);
  let start = anchor;
  while (start > limit && countFound(rangeText(lines, start, anchor), identifiers) < score) {
    start--;
  }
  return { startLine: start, endLine: anchor, score };
}

// Finds the window of lines that contains the most of the identifiers.
// Prefers the file the model named, then the other files.
function findBestWindow(files, preferredFile, identifiers, span) {
  const ordered = [];
  if (preferredFile) {
    ordered.push(preferredFile);
  }
  for (const file of files) {
    if (file !== preferredFile) {
      ordered.push(file);
    }
  }

  // Search with the largest allowed window so identifiers a few lines apart
  // (a function name and a line inside it) are seen together.
  // Anchor on the most specific identifier (the one on the fewest lines,
  // e.g. a function name rather than a common field), then reach forward or
  // backward to the others. Best = most identifiers found, then the tightest
  // range; forward wins a tie because definitions come before their bodies.
  const rarest = rarestIdentifier(ordered, identifiers);
  let best = null;
  for (const file of ordered) {
    const lines = splitLines(file.content);
    for (let anchor = 1; anchor <= lines.length; anchor++) {
      if (!containsIdentifier(lines[anchor - 1], rarest)) {
        continue;
      }
      const forward = coverForward(lines, anchor, identifiers);
      const backward = coverBackward(lines, anchor, identifiers);
      // Going backward only wins when it finds more identifiers than forward.
      const candidate = backward.score > forward.score ? backward : forward;
      const tightness = candidate.endLine - candidate.startLine;
      if (!best || candidate.score > best.score || (candidate.score === best.score && tightness < best.tightness)) {
        best = { file: file.name, lines, startLine: candidate.startLine, endLine: candidate.endLine, score: candidate.score, tightness };
      }
    }
    if (best && best.score === identifiers.length) {
      break; // everything found, in the file the model named if possible
    }
  }
  if (!best) {
    return null;
  }

  // Keep at least the span the model asked for.
  const minEnd = Math.min(best.lines.length, best.startLine + span - 1);
  return { file: best.file, startLine: best.startLine, endLine: Math.max(best.endLine, minEnd), score: best.score };
}

function checkQuestion(files, reply, history, options = {}) {
  const problems = [];
  let repaired = false;
  const text = String(reply.question || reply.text || '');

  // 1. File
  let file = findFile(files, reply.file);
  if (!file) {
    if (options.lockedFile) {
      file = findFile(files, options.lockedFile);
    }
    problems.push(`file "${reply.file}" is not one of the loaded files`);
  }

  // 2. Line numbers
  let start = toInt(reply.startLine);
  let end = toInt(reply.endLine);
  if (file) {
    const lineCount = splitLines(file.content).length;
    if (start === null || start < 1 || start > lineCount) {
      problems.push(`startLine ${reply.startLine} is outside ${file.name} (1-${lineCount})`);
      start = Math.min(Math.max(start || 1, 1), lineCount);
      repaired = true;
    }
    if (end === null || end < start) {
      end = start;
      repaired = true;
    }
    if (end > lineCount) {
      end = lineCount;
      repaired = true;
    }
    if (end - start + 1 > MAX_SPAN) {
      end = start + MAX_SPAN - 1;
      repaired = true;
    }
  }

  // 3. Named identifiers must be in the highlighted lines
  const named = identifiersInCode(files, identifiersInQuestion(text));
  const span = file && start ? Math.max(1, end - start + 1) : 6;
  let range = file ? { file: file.name, startLine: start, endLine: end } : null;
  if (named.length > 0) {
    let foundHere = 0;
    if (range) {
      foundHere = countFound(rangeText(splitLines(file.content), range.startLine, range.endLine), named);
    }
    // A follow-up first falls back to its parent question's lines.
    const near = options.nearRange;
    if (foundHere === 0 && near && findFile(files, near.file)) {
      const nearFile = findFile(files, near.file);
      if (countFound(rangeText(splitLines(nearFile.content), near.startLine, near.endLine), named) > 0) {
        if (range) {
          problems.push(`the highlighted lines do not contain ${named.map((n) => `\`${n}\``).join(', ')}`);
        }
        range = { file: nearFile.name, startLine: near.startLine, endLine: near.endLine };
        repaired = true;
        foundHere = 1;
      }
    }
    if (foundHere === 0) {
      const searchIn = options.lockedFile ? [findFile(files, options.lockedFile)].filter(Boolean) : files;
      const best = findBestWindow(searchIn, file, named, Math.max(span, 3));
      if (best && best.score > 0) {
        if (range) {
          problems.push(`the highlighted lines do not contain ${named.map((n) => `\`${n}\``).join(', ')}`);
        }
        range = { file: best.file, startLine: best.startLine, endLine: best.endLine };
        repaired = true;
      }
    }
  }

  if (!range) {
    return { status: 'rejected', range: null, problems };
  }

  // 4. "line N" in the text must agree with the final range
  const mentioned = lineNumbersInText(text);
  for (const number of mentioned) {
    if (number < range.startLine || number > range.endLine) {
      problems.push(`the question mentions line ${number} but highlights ${range.startLine}-${range.endLine}`);
      return { status: 'rejected', range, problems };
    }
  }

  // 5. No re-examining a region that was already asked about
  if (!options.allowRepeat) {
    for (const turn of history || []) {
      if (turn.isFollowUp) {
        continue;
      }
      if (overlapShare(range, turn) >= 0.5) {
        problems.push(`${range.file} lines ${range.startLine}-${range.endLine} were already examined`);
        return { status: 'rejected', range, problems };
      }
    }
  }

  return { status: repaired ? 'repaired' : 'grounded', range, problems };
}

module.exports = {
  checkQuestion,
  identifiersInQuestion,
  lineNumbersInText,
  containsIdentifier,
  overlapShare,
};
