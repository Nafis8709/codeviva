# CodeViva — Global AI Builder's Challenge 2026: what changed during the event

The event ran **Nov 21 – Nov 28, 2026**. CodeViva existed before it, so this file
separates what was already there from what was built during the event.

## Starting point (before the event)

Git tag **`basics-baseline`** (commit `476cd61`, Oct 27, 2026) — the version built for
the Devpost *Build With AI: Basics* hackathon. It already had:

- loading code by drag-drop, file picker, paste, or a bundled C sample
- AI questions anchored to line ranges (ranges were only clamped to valid numbers)
- grading 0–10 by the model, one follow-up for partial answers, "I don't know — teach me"
- server-computed ownership score, heatmap report, revision list, copy as Markdown
- friendly / strict examiner, 10 examiner languages, browser voice answers
- a scripted, labelled demo mode when no API key is set
- 29 automated tests

Known limits at the baseline: no check that a question really concerns the highlighted
lines (an unknown file name silently fell back to the first file); scores were whatever
the model chose; no measurement of grading quality; a page refresh lost the viva; no
GitHub import; no way to re-test weak spots; not deployed; the demo video used the
scripted demo mode, not the AI.

## Built during the event

Each entry links the change to the commit(s) that made it.

<!-- entries are added as each modification is completed -->

### 1. Grounded questions — a line checker for every AI question

Before: the model's file name and line numbers were only clamped into range, and an
unknown file name silently fell back to the first file, so a question could highlight
code it was not about.

Now (`src/grounding.js`, used by `src/examiners/aiExaminer.js`):

- every question is checked against the real code: the file exists, the lines exist,
  the identifiers the question names in `backticks` appear in the highlighted lines,
  any "line N" in the text is inside the highlight, and the region was not already examined;
- if the identifiers are elsewhere, the highlight is moved there, anchoring on the most
  specific identifier (e.g. a function name rather than a common field) and preferring
  the file the model named;
- if it cannot be repaired, the model is asked once more and told exactly what was wrong;
- if that also fails, the viva continues and the question is marked *lines not verified*;
- follow-ups are checked too, inside their parent question's file;
- the page shows **✓ lines checked** next to each question (hover for what was fixed).

Every question records `grounding: {status, attempts, problems}` so the evaluation can
count how often questions were grounded first time, repaired, re-asked or unverified.
Tests: `test/grounding.test.js` (12 tests).
