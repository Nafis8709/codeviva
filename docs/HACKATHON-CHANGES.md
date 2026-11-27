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
Tests: `test/grounding.test.js` (13 tests).

### 2. Answer-key grading — the score comes from a checklist, not from the model's mood

Before: the model read the answer and picked any score from 0 to 10.

Now (`src/prompts.js`, `src/examiners/aiExaminer.js`, `src/scoring.js`):

- when the examiner writes a question, it also writes **2–4 key points** a strong answer
  must contain (the answer key), before the student answers; if the reply has none,
  one extra call writes them;
- the grader only marks each key point **covered / partial / missing** and lists
  **technically wrong claims**; it is never asked for a score;
- the server computes the score: covered = 1, partial = ½, missing = 0, scaled to 10,
  minus 3 per wrong claim — the same marks always give the same score, and a confident
  wrong statement can never be "solid";
- a follow-up is marked against the points the first answer missed;
- the page shows the marked answer key after every answer ("what the examiner was
  listening for"), in the report transcript, and in the Markdown export;
- the old free-form grading is kept as `grading: 'holistic'` so the evaluation can
  compare both on the same answers.

Also fixed while testing: a follow-up about a common name (e.g. `tail`) now falls back
to its parent question's lines instead of the first place that name appears.
Tests: `test/checklist.test.js` (8 tests).

### 3. Evaluation set and runner

`eval/` — 5 viva questions on real student code (the C sample, the author's SMS Flask
project and ReliefSync Java project) with 30 answers in English, Bangla and Banglish;
`npm run label` records the human verdicts, `npm run eval` grades every answer with
the answer-key and the old holistic grader several times, runs short vivas to count how
questions were grounded, and writes `eval/results/SUMMARY.md`. See `eval/README.md`.
Tests: `test/eval-metrics.test.js`.

### 4. The viva survives a refresh

Before: the session lived only in the page; a refresh, a closed tab or a browser crash
lost every answered question.

Now (`public/app.js`): after every question, answer and report the session is saved in
the browser (`localStorage`, never sent anywhere), including a half-written answer.
On the next visit a card offers **Resume** (or **Open report**) and rebuilds the
transcript, highlights and settings without calling the AI again. *New viva* and
*Discard* clear it. Checked in a headless browser: refresh mid-follow-up restores the
same transcript, draft and highlighted lines; a finished report reopens with the same score.

### 5. Load a public GitHub repository by link

Before: files had to be dragged in, picked or pasted one by one.

Now (`src/github.js`, two routes in `server.js`, setup screen in `public/`):

- paste `https://github.com/owner/repo` (or a branch/folder link, or `owner/repo`);
- one GitHub API call lists the tree; dependencies, lockfiles, minified files,
  binaries, files over 100 kB and hidden folders are skipped; source files are listed
  first and **preselected within the 60,000-character budget** (source folders first,
  tests and config listed but not ticked);
- a meter shows characters and files used; *Add files* is disabled when over budget;
- the chosen files are read from `raw.githubusercontent.com` — a fixed host, so the
  server never fetches an address the user typed; owner, repo and paths are validated;
- distinct, readable failures: not a GitHub link, repository not found or private,
  GitHub rate limit, network failure, over budget — the picker and selection stay open;
- optional `GITHUB_TOKEN` raises GitHub's limit;
- with many files, tabs show file names (full path on hover) and the active tab
  scrolls into view.

Checked against the real repository `Nafis8709/codeviva`: 29 files listed, 38 skipped,
12 preselected (56,303 characters), loaded, and a viva started on them.
Tests: `test/github.test.js` (8 tests, fake GitHub).

### 6. Re-test my gaps — before → after

Before: the report was the end; to practise again you started a fresh viva on random lines.

Now: the report has **Re-test my gaps (N)**. It starts a short viva on only the regions
marked *gap* or *partial* (up to 5). For each one the examiner is told what was asked
last time and asks a **new question about the same lines from a different angle**; the
line checker keeps re-test questions on their region and keeps the earlier topic. The
re-test report says how many gaps the student can now defend and shows, per region,
**before → after** (e.g. GAP → SOLID) with the score on those lines (e.g. 25 → 100).
Works after a refresh mid-re-test, in demo mode (scripted re-test question), and in the
Markdown export. Tests: re-test prompt and region-keeping (`test/checklist.test.js`),
re-test settings over HTTP (`test/api.test.js`).

### 7. Deployed, tested live with the real model, and three fixes from that test

Deployed on Render (free plan) at **https://codeviva-of2z.onrender.com** with the Gemini key
as a server-side secret, so visitors need no key.

Live test with real `gemini-3.1-flash-lite` (Nov 27):

- one question on the C sample, three answers to it: a complete answer → 4/4 key points,
  10/10 solid; a vague answer → ✓ ✗ ½ ✓, 6/10 partial, follow-up on lines 28–34; a
  confidently wrong Banglish answer → 0/4, gap, both false claims listed as wrong claims;
- a full strict viva on `Nafis8709/reliefsync` loaded by link (14 files): questions on
  `VerificationChainBuilder` 6–16, `VerificationHandler` 28–32 and `InventoryService`
  153–164, all "✓ lines checked"; 3/10 gap, "I don't know" 0/10, 10/10 solid → 43/100;
- re-test of the 2 gaps: new questions on the same lines → GAP → SOLID twice,
  "score on these lines: 15 → 100";
- failures: missing repo → 404 "not found or private"; non-GitHub link → 400.

Fixes from the live test:

1. **Filter in the file picker** — on a 213-file repo the budget filled with UI classes in
   alphabetical order; you can now filter by path (e.g. `service`, `pattern chain`) and
   *Tick shown* / *Untick shown*.
2. **The line checker says why it trimmed a highlight** — a question marked "repaired"
   listed no reason when its range was clamped or longer than 12 lines.
3. **Accurate privacy line** — "Nothing is stored" was no longer true once sessions were
   saved in the browser.
