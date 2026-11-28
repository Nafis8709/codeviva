# AI in CodeViva — in the product, and in building it

## 1. AI inside the product

**Model:** Google Gemini, default `gemini-3.1-flash-lite` (any current Gemini model or any
OpenAI-compatible model can be configured in `.env`).

| Job | What the model does | What the model does **not** decide |
|---|---|---|
| Ask a question | Reads the numbered code, picks 1–12 lines, writes one question about them | Whether those lines are right — the **line checker** (`src/grounding.js`) verifies, repairs or re-asks |
| Write the answer key | 2–4 key points a strong answer must contain, written **before** the student answers | — |
| Mark an answer | Marks each key point covered / partial / missing, lists technically wrong claims, writes feedback and a model answer, may propose one follow-up | The **score and verdict** — computed on the server from the checklist (`src/scoring.js`) |
| Re-test | Writes a new question about a region the student missed, told what was asked before | Which regions are re-tested and where the question points (kept on the region by the line checker) |
| Report | A 2–3 sentence summary and three revision tasks | The ownership score, the heatmap, the strengths and gaps lists — all computed from the marked answers |

**Why this model fits the job (A1a).** The examiner has to read whole source files with
line numbers and answer in strict JSON, many times per viva, for students who pay nothing:
Gemini Flash-Lite is on Google's free tier, has a context window far larger than the
60,000-character limit, supports a JSON response mode, and handles Bangla and the other
examiner languages. A viva is a conversation, so response time matters more than peak
reasoning ability.

**Evidence for that choice (A1b).** `npm run eval -- --models gemini-3.1-flash-lite,gemini-3-flash-preview`
compares the default with a larger model on the same 30 labelled answers: agreement with
the reference labels, consistency over repeats, grounding, and median call time.
→ Results: [`eval/results/SUMMARY.md`](../eval/results/SUMMARY.md) (tables 1–4).

**How the product's AI is checked (A3).** Against 30 answers on real student code with
reference labels. The labels were written by Claude, not by a person (see below), so the
evaluation shows agreement between two independent AI readings of the same rubric plus
consistency over repeats and grounding. It does not show agreement with a human
examiner. See [`eval/README.md`](../eval/README.md) for the method and the results file
for the numbers, including where the grader and the reference labels disagree.

**Design choices that control the AI (A2).**

1. *Answer key first, checklist marking, server-side score.* Problem: a model asked for a
   0–10 score gives different numbers for the same answer and can be talked into a high
   score by a fluent but wrong answer. Choice: the key is written before the answer is
   seen, the model only marks points, wrong claims cost 3 points, and the server does the
   arithmetic. Evidence: answer-key vs holistic grading in the evaluation (agreement and
   consistency tables).
2. *Line checker.* Problem: a question that highlights the wrong lines is worse than no
   question. Choice: verify every question against the code, repair or re-ask once.
   Evidence: the grounding table in the evaluation (correct first time / repaired /
   re-asked / unverified).

## 2. AI used to build CodeViva during the event

**Tool:** Claude (Anthropic), working in a cloud workspace at Nafis's direction.

**What it contributed.** After Nafis approved a prioritised modification list and a two-day
plan, Claude wrote most of the code for the event changes listed in
[`HACKATHON-CHANGES.md`](HACKATHON-CHANGES.md): the line checker, answer-key grading, the
evaluation set and runner, session saving, GitHub loading and re-tests, plus their tests
and documentation. The evaluation questions use code from Nafis's own projects (SMS,
ReliefSync); the answers were drafted by Claude to cover a range of quality and languages.
**The reference labels were also written by Claude** (before the evaluation was run, by
reading each answer against the code). Nafis chose not to label them himself for this
submission; they have not been checked by a person.

**Automated checks run on that work, and what they changed.** Each change was tested with
unit tests and by driving the real page in headless Chrome against a scripted fake model
(and against the real GitHub API for repo loading). These checks were run by the AI
itself; they found real defects, which were fixed before committing:

| Change | What the check found | Decision |
|---|---|---|
| Line checker re-anchoring | Browser check: a question about `dequeue` resetting `tail` was moved to `tail` in `init_queue` (line 7), then to the header file | Changed twice: anchor on the most specific identifier and prefer the file the model named; regression tests added |
| Follow-up anchoring | Browser check: a follow-up about `tail` jumped away from its parent question's lines | Changed: follow-ups fall back to the parent's lines first; test added |
| GitHub link parsing | Unit test: `github.com/a/b.git/` kept `.git`; `a/..` passed the name check | Changed: strip order fixed, dot-only names rejected |
| GitHub file picker | Screenshot: unticked docs filled the top of the list, hiding the preselected source files | Changed: source first, then tests, then other files |
| Labelling tool | Scripted input: keys typed faster than prompts were dropped | Changed: buffered line reading |
| Re-test report | Screenshot: "You own this code" shown for a re-test that covered 2 regions; a ✓ bullet before every before→after row | Changed: re-test heading and wording; bullet removed |

**Human direction and decisions (A4).** No separate, written human review of one specific
AI-created file was carried out for this submission. The human decisions in the project
were:

| Decision by Nafis Ahmed | What it changed |
|---|---|
| Chose CodeViva over the other candidate projects | The whole event scope |
| Approved the prioritised change list and the two-day plan before any code was written | Which features were built, and in what order |
| Asked for the GitHub push access, the Render deployment and a live test with real Gemini | Live testing found and fixed error-message and grading issues on real calls |
| Approved the UI plan and then each screen (setup, viva, report) one at a time | Each screen was shipped only after his go-ahead |
| Chose to use AI-written reference labels instead of labelling the evaluation himself | The evaluation is described as AI-vs-AI agreement, not agreement with a human |
