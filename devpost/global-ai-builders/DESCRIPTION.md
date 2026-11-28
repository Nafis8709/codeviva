# CodeViva — Devpost description (Global AI Builder's Challenge 2026)

> For the Devpost "About the project" field. Rubric codes in brackets show which
> checkpoint each part answers; remove them before pasting if you prefer.

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

A typical session: two days before a ReliefSync viva (a Java desktop app, partly written
with an AI assistant), the student pastes `https://github.com/Nafis8709/reliefsync`.
CodeViva preselects the source files that fit, asks a question such as *"For a NORMAL-tier
request, which handlers does `build` link, and what does the chain report after the area
coordinator approves?"* with those lines highlighted, and marks the answer against its key
(✓ covered, ½ partly, ✗ missed). The report's heatmap shows the regions the student
couldn't defend in red; **Re-test my gaps** asks new questions on exactly those lines and
shows before → after.

In a live test of this flow on the hosted copy with real Gemini, a full viva on the
ReliefSync repo scored 43/100, and re-testing a missed region took it from GAP to SOLID
(15 → 100 on those lines).

## How people manage today, and what CodeViva changes [V2a, V2b]

| Today | Source | Limitation for a student preparing |
|---|---|---|
| Re-read the code, or ask a friend | — | Doesn't reveal what you *can't* explain; a friend doesn't know your code |
| Ask a general chatbot to "quiz me on this code" | Tried with the same files | Questions aren't tied to lines you can see; no answer key; the grade is whatever the model says that time |
| Instructor-side AI oral exams: Classmoji at Dartmouth (SIGCSE 2026 — https://sigcse2026.sigcse.org/details/sigcse-ts-2026-lightning-talks/17/AI-Driven-Oral-Examinations-for-Code-Assessment-Evaluating-Understanding-Beyond-the-), UNSW's automated oral assessment prototype (https://www.unsw.edu.au/engineering/student-life/undergraduate-research-opportunities/advertised-taste-research-areas/automated-oral-assessments-at-scale-for-safeguarding-academic-integrity), NYU Stern's AI oral exam (https://whyy.org/articles/pennsylvania-university-colleges-oral-exams-artificial-intelligence/) | Cited | Run by instructors for grading; a student can't use them to practise on their own code, any time |

What CodeViva adds for the student:

- **Practice on your own code, any time, free** — paste a GitHub link; no instructor setup.
- **Questions on lines you can see**, checked by the line checker: in the evaluation, 11 of 12
  AI-written questions were on the right lines first time; the 12th (a 13-line highlight, over the
  12-line limit) stayed unverified after one retry and is shown marked "lines not verified".
- **Wrong answers get no credit**: with the answer key, all 14 answers that are wrong or off-topic
  scored 0; when the model picks the score directly (the "quiz me" approach), 5 of those 14 got
  5/10 (evaluation table 5).
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
3. **Evaluation set and runner** — 30 answers on real code in C, Python, Java; English, Bangla, Banglish; reference labels written by Claude (not checked by a person).
4. **The viva survives a refresh** — saved in the browser, resumable, including a half-typed answer.
5. **Load a public GitHub repo by link** — filtered, preselected within budget, with clear failure messages.
6. **Re-test my gaps** — targeted re-test with before → after.

Tests went from 29 to 65.

## How AI is used in the product [A1a, A1b, A2a, A2b]

- **Gemini Flash-Lite** reads the numbered code and writes each question with its answer key,
  marks answers against the key, writes follow-ups, re-test questions and the report summary.
  Why: free tier for students, a context window far beyond the 60,000-character limit, JSON
  mode, multilingual (Bangla included), fast enough for a conversation.
  It was not compared against a larger model for this submission.
- **Design choice 1 — answer key first, server-side score.** The model never picks the score.
  Evidence (30 answers, 3 runs each, compared with AI-written reference labels): both graders
  agree with the reference label on 80% of answers, with no severe misses (solid ↔ gap). They fail
  differently: the answer key got every wrong and every solid answer right (24/24) but none of the
  6 "partial" answers (4 marked gap, 2 solid); the old holistic grader got 5 of 6 partials right but
  gave half marks to 5 of the 14 wrong answers. Both gave the same verdict on every repeat (score
  spread 0.07 vs 0.17 out of 10), so on this set the answer key did not improve consistency.
- **Design choice 2 — line checker.** Evidence: in the evaluation's 12 questions the model was
  already right 11 times, so the checker's main job there was catching the 12th. Example from testing: asked
  "Why does `dequeue` reset `tail`?" while pointing at the wrong lines, the checker moved the
  highlight to lines 47–55 of `token_queue.c` — from `dequeue` to `q->tail = NULL`.

## How well it works, and when not to rely on it [A3a, A3b]

Method: 5 viva questions on real student code (the bundled C sample; my SMS Flask project;
my ReliefSync Java project), 6 answers each ranging from complete to confidently wrong, in
English, Bangla and Banglish. Each answer has a reference label (solid / partial / gap)
**written by Claude, the AI assistant that helped build the project, before the evaluation
ran; no person checked these labels.** So "agreement" below means agreement between
CodeViva's Gemini grader and a second, independent AI reading of the same rubric, not
agreement with a human examiner. `npm run eval` grades each answer 3 times with both graders.

Results (`eval/results/SUMMARY.md`, Gemini 3.1 Flash-Lite, 216 calls, 0 failed):

| | Answer key (CodeViva) | Holistic (old) |
|---|---|---|
| Exact agreement with reference labels | 80% | 80% |
| Within one step | 100% | 100% |
| Severe misses (solid ↔ gap) | 0 | 0 |
| Wrong answers (14) scored as gap | 14 | 9 |
| "Partial" answers (6) scored as partial | 0 | 5 |
| Same verdict on all 3 runs | 100% | 100% |

Line checker: 11 of 12 questions on the right lines first time, 1 unverified. Median call 1.9 s.

Rely on it for: telling a solid, complete answer from a wrong one, in English, Bangla or
Banglish. Every wrong or off-topic answer scored 0, and every complete answer scored 10.
Don't rely on it for: the middle ground. A vague or half-right answer is usually marked *gap*
(score 3 — the key points it skipped count as missing) and sometimes *solid* (relief-2, a
one-line "it skips to the next handler", got 8–10). Treat a *gap* on an answer you thought was
roughly right as "say more", not "wrong".
Also: a question that names no identifier and no line number can't be verified by the line
checker; CodeViva is practice, not proctoring — the score is feedback, not a grade.

## How AI was used to build it [A4a, A4b]

Claude (Anthropic) wrote most of the event code, the evaluation answers and the evaluation's
reference labels. My part: I chose the project and the scope, approved a prioritised plan
before any code was written, supplied my own projects (SMS, ReliefSync) for the evaluation,
asked for the deployment and a live test with real Gemini, and approved each redesigned
screen one at a time. Automated checks found and fixed six defects in the AI-written code
(table in `docs/AI-USE.md`). I did not carry out a separate written review of one specific
AI-written file, and I did not label the evaluation myself.

## Testing the main task [R1, R2a–d, R3a–b]

The checks below were run by Claude during development, on the hosted copy with real Gemini
where marked "live".

| Check | Example | Expected | Result |
|---|---|---|---|
| Main process [R1] | Load → 5 questions → report → re-test | Report with score, heatmap, answer keys; re-test shows before → after | Pass — live site, real Gemini: ReliefSync viva → report 43/100; re-test GAP → SOLID (15 → 100) |
| Ordinary 1 [R2a] | Bundled C sample, English answers | Questions on highlighted lines; marked key points; report | Pass — live, real Gemini: a good, a vague and a wrong answer scored 10, 6 and 0 |
| Ordinary 2 [R2b] | Python code from my SMS Flask project, answers in Bangla and Banglish | Non-English answers judged on meaning | Covered by the evaluation set (SMS questions, Bangla and Banglish answers; see the per-answer table); not run as a full live viva on the SMS repo |
| Repeat [R2c] | Each evaluation answer graded 3× | Same verdict on repeats | Pass — 30 of 30 answers got the same verdict on all 3 runs (mean score spread 0.07/10) |
| Demanding [R2d] | My ReliefSync repo by link: Java, many files, follow-ups, re-test | Questions grounded across files; re-test stays on the missed regions | Pass — live, real Gemini: full viva and re-test on the missed region (see R1) |
| Failure 1 [R3a] | Link to a private or non-existent repo | "Not found or private" message; already loaded files and settings untouched | Pass — live site: clear not-found (404) and bad-link (400) messages |
| Failure 2 [R3b] | AI call fails mid-viva (rate limit / network) | Error with Retry; answered questions kept; page refresh → Resume restores the viva | Pass — failure simulated with the test model in headless Chrome; Retry and Resume restored the viva |

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
