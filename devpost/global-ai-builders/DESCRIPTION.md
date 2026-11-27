# CodeViva — Devpost description (Global AI Builder's Challenge 2026)

> Draft for the Devpost "About the project" field. Rubric codes in brackets show which
> checkpoint each part answers; remove them before pasting if you prefer. Items marked
> **⟨fill …⟩** need real results from `npm run eval` or a real viva — do not submit them blank.

## Inspiration

I'm a software engineering student at the University of Dhaka. Every project I submit ends
with a viva: an examiner points at a line and asks why it is there. Classmates who built
working projects with AI assistants freeze at exactly that moment — the code works, the
understanding isn't there. I wanted a way to find those gaps *before* the examiner does.

## Who it is for, and the need [V1a]

CS students who must defend a project out loud (a viva, oral exam, demo or code walkthrough),
and junior developers who will be asked "walk me through your project" in an interview.

- Universities are bringing oral exams back because of generative AI: some institutions are
  reintroducing vivas into undergraduate assessment to uphold integrity (Times Higher
  Education, Mar 2025 — https://www.timeshighereducation.com/opinion/sampled-vivas-are-pivotal-combating-ai-cheating);
  the University of Auckland reports interactive oral assessments as one of the most
  effective ways to see what students know (https://www.auckland.ac.nz/en/news/2025/10/02/the-case-for-oral-exams-in-the-age-of-ai.html).
- The gap is specific to code: instructors report students who submit polished work but
  cannot explain basic choices in their own submissions under follow-up questions
  (arXiv 2603.18221, Mar 2026 — https://arxiv.org/abs/2603.18221).
- Detection is not a substitute: Turnitin's own guidance says its AI-writing detection may be
  inaccurate and should not be the sole basis for action against a student (quoted in Mount
  Royal University's advisory — https://www.mtroyal.ca/AI/ai-detection-advisory.htm).
- Firsthand: at IIT, University of Dhaka, every software project course ends in a viva on the
  submitted code.

## A realistic use [V1b]

⟨Run this for real on your ReliefSync repo and replace the details below with what actually
happened — the question asked, what you got ✓ and ✗, and the before → after.⟩

Two days before my ReliefSync viva (a Java desktop app, partly written with an AI
assistant), I paste `https://github.com/Nafis8709/reliefsync`. CodeViva preselects the
source files that fit, asks *"For a NORMAL-tier request, which handlers does `build` link,
and what does the chain report after the area coordinator approves?"* with those lines
highlighted, and marks my answer against the key: ✓ volunteer and area coordinator are
linked, ✗ I didn't say that `next == null` makes the result VERIFIED. The report's heatmap
shows the verification chain in red. I press **Re-test my gaps**, get a new question on the
same lines, and the report shows GAP → SOLID. That is the preparation I needed: exactly the
lines I couldn't explain, before the examiner found them.

## How people manage today, and what CodeViva changes [V2a, V2b]

| Today | Source | Limitation for a student preparing |
|---|---|---|
| Re-read the code, or ask a friend | — | Doesn't reveal what you *can't* explain; a friend doesn't know your code |
| Ask a general chatbot to "quiz me on this code" | Tried with the same files | Questions aren't tied to lines you can see; no answer key; the grade is whatever the model says that time |
| Instructor-side AI oral exams: Classmoji at Dartmouth (SIGCSE 2026 — https://sigcse2026.sigcse.org/details/sigcse-ts-2026-lightning-talks/17/AI-Driven-Oral-Examinations-for-Code-Assessment-Evaluating-Understanding-Beyond-the-), UNSW's automated oral assessment prototype (https://www.unsw.edu.au/engineering/student-life/undergraduate-research-opportunities/advertised-taste-research-areas/automated-oral-assessments-at-scale-for-safeguarding-academic-integrity), NYU Stern's AI oral exam (https://whyy.org/articles/pennsylvania-university-colleges-oral-exams-artificial-intelligence/) | Cited | Run by instructors for grading; a student can't use them to practise on their own code, any time |

What CodeViva adds for the student:

- **Practice on your own code, any time, free** — paste a GitHub link; no instructor setup.
- **Questions on lines you can see**, checked by the line checker: ⟨fill: "X of Y questions were
  on the right lines first time; the checker repaired Z and re-asked W" — table 3 of SUMMARY.md⟩.
- **The same answer gets the same verdict**: with the answer key, the same answer kept its
  verdict in ⟨fill⟩% of repeats, vs ⟨fill⟩% when the model picks the score directly (the
  "quiz me" approach) — table 2.
- **A loop, not a quiz**: re-test exactly the lines you missed and see before → after.
- **Your language**: answer in Bangla, Hindi, Arabic and 7 more — judged on meaning, not English.

## Can people actually use it? [V3]

A browser and code in a public GitHub repo or on disk. Running your own copy needs Node.js
18.17+ and a free Gemini API key (no card needed); without a key a labelled scripted demo
runs. Voice answers need Chrome or Edge; typing always works. Private repos: drop the files
in instead. **A hosted copy runs at https://codeviva-of2z.onrender.com — no install, no key**
(free hosting: the first visit after a quiet spell takes up to a minute).

## What we built during the event [starting point]

CodeViva existed before the event (tag `basics-baseline`, Oct 27 2026: line-anchored
questions, model-picked 0–10 grades, heatmap report, voice, 10 languages, demo mode).
During the event (full list with commits: `docs/HACKATHON-CHANGES.md`):

1. **Line checker** — verifies every AI question against the lines it highlights; repairs or re-asks.
2. **Answer-key grading** — key points written before the answer; checklist marking; score computed on the server.
3. **Evaluation set and runner** — 30 human-labelled answers on real code in C, Python, Java; English, Bangla, Banglish.
4. **The viva survives a refresh** — saved in the browser, resumable, including a half-typed answer.
5. **Load a public GitHub repo by link** — filtered, preselected within budget, with clear failure messages.
6. **Re-test my gaps** — targeted re-test with before → after.

Tests went from 29 to 65.

## How AI is used in the product [A1a, A1b, A2a, A2b]

- **Gemini Flash-Lite** reads the numbered code and writes each question with its answer key,
  marks answers against the key, writes follow-ups, re-test questions and the report summary.
  Why: free tier for students, a context window far beyond the 60,000-character limit, JSON
  mode, multilingual (Bangla included), fast enough for a conversation.
  Comparison with a larger model on the same 30 answers: ⟨fill from tables 1, 2, 4: agreement,
  consistency, median call time for flash-lite vs flash⟩.
- **Design choice 1 — answer key first, server-side score.** The model never picks the score.
  Evidence: ⟨fill: exact agreement with human labels — answer key X% vs holistic Y%; severe
  disagreements A vs B; same verdict on repeats C% vs D%⟩.
- **Design choice 2 — line checker.** Evidence: ⟨fill from table 3⟩. Example from testing: asked
  "Why does `dequeue` reset `tail`?" while pointing at the wrong lines, the checker moved the
  highlight to lines 47–55 of `token_queue.c` — from `dequeue` to `q->tail = NULL`.

## How well it works, and when not to rely on it [A3a, A3b]

Method: 5 viva questions on real student code (the bundled C sample; my SMS Flask project;
my ReliefSync Java project), 6 answers each ranging from complete to confidently wrong, in
English, Bangla and Banglish. I labelled every answer solid / partial / gap before running
the evaluation. `npm run eval` grades each answer 3 times with both graders.

Results (`eval/results/SUMMARY.md`): ⟨fill: the key rows of tables 1–3⟩

Rely on it for: ⟨fill from the per-answer table — e.g. complete answers and confidently wrong answers⟩.
Don't rely on it for: ⟨fill — e.g. the answers it got wrong and why: short correct answers? Bangla?⟩.
Also: a question that names no identifier and no line number can't be verified by the line
checker; CodeViva is practice, not proctoring — the score is feedback, not a grade.

## How AI was used to build it [A4a, A4b]

Claude (Anthropic) wrote most of the event code after I approved a prioritised plan; I chose
the scope, supplied my own projects for the evaluation, and labelled every evaluation answer.
Automated checks found and fixed six defects in the AI-written code (table in `docs/AI-USE.md`).
My own review: ⟨fill from the human-review table in docs/AI-USE.md — what you checked, what you
found, and whether you kept, changed or rejected it⟩.

## Testing the main task [R1, R2a–d, R3a–b]

| Check | Example | Expected | Result |
|---|---|---|---|
| Main process [R1] | Load → 5 questions → report → re-test | Report with score, heatmap, answer keys; re-test shows before → after | ⟨fill⟩ |
| Ordinary 1 [R2a] | Bundled C sample, English answers | Questions on highlighted lines; marked key points; report | ⟨fill⟩ |
| Ordinary 2 [R2b] | My SMS Flask repo by link, answers in Banglish | Same, Python code, non-English answers judged on meaning | ⟨fill⟩ |
| Repeat [R2c] | Each evaluation answer graded 3× | Same verdict on repeats | ⟨fill: table 2⟩ |
| Demanding [R2d] | My ReliefSync repo by link: Java, 12+ files near the 60k budget, strict examiner, follow-ups, re-test | Questions grounded across files; re-test stays on the missed regions | ⟨fill⟩ |
| Failure 1 [R3a] | Link to a private or non-existent repo | "Not found or private" message; already loaded files and settings untouched | ⟨fill⟩ |
| Failure 2 [R3b] | AI call fails mid-viva (rate limit / network) | Error with Retry; answered questions kept; page refresh → Resume restores the viva | ⟨fill⟩ |

## Design [D1–D4b]

- One main action per screen; the question and its highlighted lines are the largest thing on
  the viva screen, the answer key and model answer sit behind them. [D1]
- One visual language — paper, ink and red pen — for questions, stamps (solid / partial /
  gap), errors with Retry, the resume card, and the report. [D2]
- Burden removed: a GitHub link replaces picking files one by one, with source files
  preselected to fit the budget; a refresh resumes instead of starting over. [D3]
- The report groups *what you own*, *what you couldn't defend*, *revise*, and the full
  transcript; files are tabs; tests and config are labelled in the picker. [D4a]
- Relationships made visible: every answer shows the key points it covered (✓ ½ ✗); the
  heatmap links each verdict to its lines; the re-test shows **before → after** per region. [D4b]

## What's next

Teacher mode (generate a viva for each student submission), a spoken examiner, and
"explain this commit" for code an AI assistant just changed.

## Built with

Node.js · Express · vanilla JavaScript · Google Gemini API · GitHub REST API · Web Speech API · node:test
