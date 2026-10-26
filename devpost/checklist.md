---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast — chosen by the agent under the learner's delegation and the deadline; verification and commits still run for every slice.

## Slices

- [x] **1. You can load the sample project and get a line-anchored question with highlighted code (demo examiner)**
  Becomes usable: `npm start` serves the setup screen; "Try the sample project" lists both files; Start viva shows the first examiner question and highlights its lines in the code panel.
  Why now: Proves the whole path — scaffold, page, server route, line-anchored question, highlighting — and puts the unique kernel on screen in the first slice.
  PRD ref: `prd.md > The Core Journey` (steps 1–4), `prd.md > Loading Code`, `prd.md > Asking Line-Anchored Questions`
  Spec ref: `spec.md > Server (server.js)`, `spec.md > Code utilities (src/code.js)`, `spec.md > Demo examiner (src/examiners/demoExaminer.js)`, `spec.md > Page (public/index.html, public/styles.css, public/app.js)`, `spec.md > Sample project (public/samples/)`
  Build: package.json, server.js with status + question routes, code.js, demo examiner questions (anchor-text located), sample C files, the three-screen page with setup + viva screens and the code viewer.
  Verify (mechanical): Start the server, `GET /api/status` returns demo mode, `POST /api/viva/question` with the sample returns a question whose lines contain its anchor text; headless browser screenshot shows highlighted lines.
  Learner check: Open http://localhost:3000, click Try the sample project, Start viva, and check that the highlighted lines match what the question asks about.
  Commit: `Add setup screen, sample project and line-anchored demo questions`

- [x] **2. Answers are graded, partial answers get one follow-up, and the gutter turns green/amber/red**
  Becomes usable: Typing an answer (or "I don't know — teach me") gives a verdict, feedback, model answer, an optional follow-up, and gutter colour; the viva advances through all questions.
  Why now: Grading + follow-up is the second half of the kernel; the report depends on it.
  PRD ref: `prd.md > Answering`, `prd.md > Grading and Follow-ups`
  Spec ref: `spec.md > Demo examiner (src/examiners/demoExaminer.js)`, `spec.md > Scoring (src/scoring.js)`, `spec.md > Page (public/index.html, public/styles.css, public/app.js)`
  Build: grade route, demo keyword grading + scripted follow-ups, follow-up rules, answer box, teach-me button, gutter heat classes, progress label.
  Verify (mechanical): Tests post a wrong, a partial and a strong answer to the first sample question and assert gap/partial/solid; a partial answer returns a follow-up only when allowed.
  Learner check: Give a vague answer to the first question and see whether the follow-up feels like a real examiner pushing back.
  Commit: `Grade answers with follow-ups and gutter heat`

- [x] **3. The viva ends in a report with ownership score and heatmap**
  Becomes usable: After the last question the report screen shows score, verdict, heatmap, strengths, gaps with line links, revision list, Copy as Markdown, New viva.
  Why now: The report is the "oh, that's cool" moment and completes the core journey.
  PRD ref: `prd.md > Viva Report`, `prd.md > The Core Journey` (steps 8–9)
  Spec ref: `spec.md > Scoring (src/scoring.js)`, `spec.md > Server (server.js)`, `spec.md > Page (public/index.html, public/styles.css, public/app.js)`
  Build: report route, server-side score, demo report narrative, report screen rendering, markdown export.
  Verify (mechanical): `npm test` covers scoring (follow-up takes the better attempt) and a full five-question demo session through the HTTP API ending in a report; screenshot of the report.
  Learner check: Finish a viva and check that the red regions in the heatmap are the questions you struggled with.
  Commit: `Add viva report with ownership score and heatmap`

- [ ] **4. A real AI examiner (Gemini or OpenAI-compatible) asks, grades and reports on any code**
  Becomes usable: With `GEMINI_API_KEY` in `.env`, questions/grades/reports come from the model, in English or Bangla, friendly or strict, for any loaded files.
  Why now: Highest external risk, but it slots into the interfaces the demo examiner already proved.
  PRD ref: `prd.md > Asking Line-Anchored Questions`, `prd.md > Grading and Follow-ups`, `prd.md > Examiner Language and Style`
  Spec ref: `spec.md > Prompts (src/prompts.js)`, `spec.md > AI clients (src/llm/gemini.js, src/llm/openaiCompatible.js)`, `spec.md > AI examiner (src/examiners/aiExaminer.js)`, `spec.md > Config (src/config.js)`, `spec.md > External Services and Dependencies`
  Build: prompts, two LLM clients, extractJson, AI examiner with validation, config switch.
  Verify (mechanical): Tests run the AI examiner against a fake LLM returning messy JSON and out-of-range lines and assert the normalised output; live-key test is a learner step (no outbound access to the AI host from the build sandbox).
  Learner check: Put your Gemini key in `.env`, restart, load one of your own SPL files, and check the questions are about your actual lines.
  Commit: `Add Gemini and OpenAI-compatible AI examiner`

- [ ] **5. Real-world inputs: drag-drop and paste, Bangla, voice answers, errors and edge states**
  Becomes usable: Own files via picker/drag-drop/paste, size and binary checks, Bangla UI strings, mic answers, readable errors with Retry, mobile layout.
  Why now: Turns the working core into a coherent product experience (Design criterion) without touching the kernel.
  PRD ref: `prd.md > Loading Code`, `prd.md > Answering`, `prd.md > States and Boundaries`, `prd.md > Look and Feel`
  Spec ref: `spec.md > Page (public/index.html, public/styles.css, public/app.js)`, `spec.md > Important Failure Modes`
  Build: file reading, paste box, validations, speech recognition, error banner with retry, responsive CSS, Bangla demo strings.
  Verify (mechanical): Tests for oversized/invalid uploads (HTTP 400); headless browser run in Bangla and at phone width with screenshots; console free of errors.
  Learner check: Drag in two of your own files, switch to বাংলা, answer one question by voice, and resize the window to phone width.
  Commit: `Handle own files, Bangla, voice answers and error states`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 3, learner runs the demo journey (pending: learner has not run the app yet)
- [ ] Final kick-the-tires exploration and feedback completed — learner runs with a real Gemini key before recording (pending)

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [pending]
Route and stops: [pending]
Edit outcome: [pending]
Reflection: [pending]
Activity mode: [pending]

## Revisions

- Slices 1–3 committed together — the page (`public/app.js`) and the demo examiner serve all three behaviours through shared render functions, so they were written in one pass and verified together (18 `node:test` tests + a headless-browser walkthrough of a full 5-question viva).
- Short numeric keywords in demo grading now match whole words only — the browser walkthrough showed "150" being counted as the answer "0".
